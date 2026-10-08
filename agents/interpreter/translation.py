"""Phase 3: simultaneous translation of the live captions.

    caption messages ──► SourceSentences ──► worker ──► translate() ──► CommitPolicy
                                                                          │
    data channel ("interpreter.translation") ◄─────────────────────────────┘

The worker translates one sentence at a time, oldest first. It never runs two
requests at once: while one is in flight, newer captions just update the
source, and the next request takes the newest state ("latest wins"). Cancelling
on every interim would starve it, since interims arrive faster than a model
answers. The exception is a sentence ending: an in-flight request for the
unfinished sentence is cancelled so the final flush starts at once.

No SDK imports: the translator is injected, so tests drive this with a fake.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from mt import TranslationError, TranslationRequest, TranslationResult
from policy import CommitPolicy, detokenize, lag_ceiling, tokenize

logger = logging.getLogger("interpreter.translation")

# Earlier sentence pairs sent as context: enough for pronouns and terminology,
# small enough to keep each request's fresh input short.
CONTEXT_SENTENCES = 6
# Minimum gap between request starts, so a burst of interims becomes one call.
DEBOUNCE_S = 0.15
RETRY_DELAY_S = 1.0

Translate = Callable[[TranslationRequest], Awaitable[TranslationResult]]
Publish = Callable[[dict], Awaitable[None]]
SetStatus = Callable[[str, str], Awaitable[None]]


@dataclass
class Sentence:
    id: int
    frozen: list[str] = field(default_factory=list)  # final caption segments
    unstable: str = ""
    closed: bool = False
    closed_at: float | None = None

    def source_text(self) -> tuple[str, str]:
        return " ".join(self.frozen), self.unstable


class SourceSentences:
    """Splits the caption stream into sentences (utterances). Pure."""

    def __init__(self) -> None:
        self.pending: deque[Sentence] = deque([Sentence(0)])
        self._next_id = 1

    @property
    def current(self) -> Sentence:
        return self.pending[-1]

    def apply(self, message: dict, now: float) -> bool:
        """Fold one caption-stream message in. True if anything changed."""
        kind = message.get("type")
        if kind == "utterance-end":
            return self._close(now)
        if kind != "caption":
            return False
        sentence = self.current
        text = str(message.get("text") or "")
        if message.get("final"):
            if text:
                sentence.frozen.append(text)
            sentence.unstable = ""
            if message.get("utteranceEnd"):
                self._close(now)
        else:
            sentence.unstable = text
        return True

    def _close(self, now: float) -> bool:
        sentence = self.current
        if not sentence.frozen and not sentence.unstable:
            return False  # nothing said: keep using this sentence
        sentence.closed = True
        sentence.closed_at = now
        self.pending.append(Sentence(self._next_id))
        self._next_id += 1
        return True


class TranslationLoop:
    def __init__(
        self,
        *,
        translate: Translate,
        publish: Publish,
        set_status: SetStatus,
        source: str,
        target: str,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._translate = translate
        self._publish = publish
        self._set_status = set_status
        self._source = source
        self._target = target
        self._clock = clock
        self._sentences = SourceSentences()
        self._changed = asyncio.Event()
        self._inflight: asyncio.Task[TranslationResult] | None = None
        self._inflight_final = False
        self._history: deque[tuple[str, str]] = deque(maxlen=CONTEXT_SENTENCES)
        self._policy = self._new_policy()
        self._last_request: tuple | None = None
        self._last_start = 0.0
        self._status: tuple[str, str] | None = None

    def _new_policy(self) -> CommitPolicy:
        return CommitPolicy(target=self._target, ceiling=lag_ceiling(self._source, self._target))

    def on_caption(self, message: dict) -> None:
        """Called for every caption-stream message, in order."""
        if not self._sentences.apply(message, self._clock()):
            return
        head = self._sentences.pending[0]
        # The sentence being translated just ended: drop the request for its
        # unfinished version and flush now.
        if head.closed and self._inflight and not self._inflight.done() and not self._inflight_final:
            self._inflight.cancel()
        self._changed.set()

    async def run(self) -> None:
        await self._status_once("live", "")
        while True:
            await self._changed.wait()
            self._changed.clear()
            while await self._step():
                pass

    async def _step(self) -> bool:
        """Translate the oldest pending sentence once. False when idle."""
        sentences = self._sentences.pending
        head = sentences[0]
        frozen, unstable = head.source_text()

        if head.closed and not frozen and not unstable:
            sentences.popleft()
            return True
        request_key = (head.id, frozen, unstable, head.closed)
        if request_key == self._last_request or (not frozen and not unstable):
            return False

        wait = self._last_start + DEBOUNCE_S - self._clock()
        if wait > 0 and not head.closed:
            await asyncio.sleep(wait)
            frozen, unstable = head.source_text()
            request_key = (head.id, frozen, unstable, head.closed)

        source_tokens = len(tokenize(f"{frozen} {unstable}", self._source))
        final = head.closed
        force = not final and self._policy.should_force(source_tokens)
        request = TranslationRequest(
            context=tuple(self._history),
            spoken=self._policy.text(),
            frozen=frozen,
            unstable=unstable,
            final=final,
            force=force,
        )
        self._last_request = request_key
        self._last_start = self._clock()
        self._inflight = asyncio.create_task(self._translate(request))
        self._inflight_final = final
        try:
            await asyncio.wait({self._inflight})
        finally:
            task, self._inflight = self._inflight, None
        if task.cancelled():
            # Superseded by the sentence ending; the flush comes next.
            self._last_request = None
            return True
        error = task.exception()
        if isinstance(error, TranslationError):
            logger.warning("translation failed: %s", error)
            await self._status_once("error", str(error))
            if error.permanent:
                raise error
            self._last_request = None  # retry the same source
            await asyncio.sleep(RETRY_DELAY_S)
            return True
        if error is not None:
            raise error
        await self._status_once("live", "")

        result = task.result()
        commit = self._policy.on_translation(
            result.continuation, source_tokens=source_tokens, final=final, forced=force
        )
        message: dict = {
            "type": "translation",
            "sentence": head.id,
            "committed": self._policy.text(),
            "tentative": "" if final else detokenize(commit.tentative, self._target),
            "final": final,
            "mtMs": round(result.total_ms, 1),
        }
        if final and head.closed_at is not None:
            # From the end of speech (as captioned) to the full translation.
            message["flushMs"] = round((self._clock() - head.closed_at) * 1000, 1)
        await self._publish(message)

        if final:
            # An interim the recogniser never finalised still counts as said.
            self._history.append((f"{frozen} {unstable}".strip(), self._policy.text()))
            self._policy = self._new_policy()
            self._last_request = None
            sentences.popleft()
        return True

    async def _status_once(self, status: str, detail: str) -> None:
        if (status, detail) != self._status:
            self._status = (status, detail)
            await self._set_status(status, detail)
