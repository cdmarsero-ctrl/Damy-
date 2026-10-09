"""Phase 4: speaking the committed translation (design doc §5).

    committed deltas ──► Cartesia context per sentence ──► PlayoutBuffer ──► voice track
                                                             (in sentence order, paced)

Only committed text reaches this module, and committed text is append-only,
so nothing spoken ever needs taking back. Each sentence is one TTS context:
its pieces are sent as they commit and the context ends when the sentence is
final, so its intonation is planned as one sentence.

Synchronisation is a *steady lag*: when the backlog of unplayed audio grows,
later pieces are generated slightly faster until it drains (§5.4).

PlayoutBuffer, speed_for_backlog and piece_text are pure and unit-tested; the
Speaker takes its TTS connection and audio sink as arguments, so it is tested
against a fake.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from policy import CHAR_SCRIPT
from tts import SAMPLE_RATE, TtsAudio, TtsConnectError, TtsDone, TtsError, generation_request, parse_tts

logger = logging.getLogger("interpreter.speech")

BYTES_PER_SECOND = SAMPLE_RATE * 2  # 16-bit mono
FRAME_MS = 10
FRAME_BYTES = BYTES_PER_SECOND * FRAME_MS // 1000

# Adaptive rate (§5.4): speed up when this much audio is waiting, return to
# normal once it has drained below RELAX_S. The gap between the two stops the
# rate flapping on every sentence.
SPEED_UP_S = 1.5
RELAX_S = 0.5
FAST_SPEED = 1.12
NORMAL_SPEED = 1.0

RECONNECT_DELAYS_S = (0.5, 1, 2, 4)


def speed_for_backlog(backlog_s: float, current: float) -> float:
    if backlog_s >= SPEED_UP_S:
        return FAST_SPEED
    if backlog_s <= RELAX_S:
        return NORMAL_SPEED
    return current


def piece_text(delta: str, *, first: bool, language: str) -> str:
    """The transcript for one piece of a context. Pieces must join into valid
    text, so spaced languages need a separating space before every piece but
    the first."""
    if not delta or first or language in CHAR_SCRIPT:
        return delta
    return f" {delta}"


class PlayoutBuffer:
    """PCM per sentence, read out strictly in sentence order. Pure."""

    def __init__(self) -> None:
        self._order: deque[int] = deque()
        self._audio: dict[int, bytearray] = {}
        self._finished: set[int] = set()

    def open(self, sentence: int) -> None:
        if sentence not in self._audio:
            self._order.append(sentence)
            self._audio[sentence] = bytearray()

    def add(self, sentence: int, pcm: bytes) -> None:
        if sentence in self._audio:
            self._audio[sentence] += pcm

    def finish(self, sentence: int) -> None:
        if sentence in self._audio:
            self._finished.add(sentence)

    def read(self, n: int) -> tuple[int, bytes] | None:
        """Next `n` bytes and the sentence they belong to, or None when the
        current sentence has no audio ready yet (an underrun: wait, don't skip
        ahead, or sentences would play out of order)."""
        while self._order:
            current = self._order[0]
            buf = self._audio[current]
            if len(buf) >= n:
                chunk = bytes(buf[:n])
                del buf[:n]
                return current, chunk
            if current in self._finished:
                if buf:  # tail of the sentence, padded to a whole frame
                    chunk = bytes(buf) + b"\x00" * (n - len(buf))
                    buf.clear()
                    return current, chunk
                self._order.popleft()
                del self._audio[current]
                self._finished.discard(current)
                continue
            return None
        return None

    def backlog_seconds(self) -> float:
        return sum(len(b) for b in self._audio.values()) / BYTES_PER_SECOND

    def idle(self) -> bool:
        return not self._order


Connect = Callable[[], Awaitable["TtsLike"]]
Sink = Callable[[bytes], Awaitable[None]]
Publish = Callable[[dict], Awaitable[None]]
SetStatus = Callable[[str, str], Awaitable[None]]


class TtsLike:  # the slice of CartesiaStream the Speaker uses (for typing and fakes)
    async def send(self, request: dict) -> None: ...
    def messages(self): ...
    async def close(self) -> None: ...


@dataclass
class _SentenceState:
    pieces_queued: int = 0  # by on_commit, synchronously
    pieces_sent: int = 0  # by the sender, later
    ended: bool = False
    speech_started: float | None = None
    first_audio_reported: bool = False
    text: str = ""  # everything queued for TTS, as it will be spoken


@dataclass
class Speaker:
    connect: Connect
    sink: Sink
    publish: Publish
    set_status: SetStatus
    voice_id: str
    model: str
    language: str
    buffer_ms: int = 300
    clock: Callable[[], float] = time.monotonic
    session_tag: str = "s"
    # Told, for every frame played, which sentence and its text: the echo
    # guard's record of what the learner's microphone may hear (§6.3.1).
    on_playing: Callable[[int, str], None] | None = None
    _queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    _playout: PlayoutBuffer = field(default_factory=PlayoutBuffer)
    _sentences: dict[int, _SentenceState] = field(default_factory=dict)
    _speed: float = NORMAL_SPEED
    _contexts: dict[str, int] = field(default_factory=dict)
    _wake: asyncio.Event = field(default_factory=asyncio.Event)
    _status: tuple[str, str] | None = None

    def on_commit(self, sentence: int, delta: str, final: bool, speech_started: float | None) -> None:
        """Called by the translation loop, in order, for every commit."""
        state = self._sentences.setdefault(sentence, _SentenceState(speech_started=speech_started))
        if state.ended or (not delta and not final):
            return
        if not delta and state.pieces_queued == 0:
            # Nothing was ever said for this sentence: no context to end.
            state.ended = True
            return
        self._queue.put_nowait((sentence, delta, final))
        state.text += piece_text(delta, first=state.pieces_queued == 0, language=self.language)
        state.pieces_queued += 1
        if final:
            state.ended = True

    def say(self, sentence: int, text: str) -> None:
        """Speaks fixed text as its own sentence (the echo check). Use negative
        sentence numbers so they never collide with translated sentences;
        they are not reported on the voice topic."""
        self.on_commit(sentence, text, True, None)

    async def run(self) -> None:
        player = asyncio.create_task(self._play(), name="speech-play")
        try:
            await self._converse()
        finally:
            player.cancel()
            await asyncio.gather(player, return_exceptions=True)

    # -------------------------------------------------------------- TTS I/O

    async def _converse(self) -> None:
        failures = 0
        while True:
            try:
                stream = await self.connect()
            except TtsConnectError as err:
                if err.auth:
                    await self._status_once("error", "The speech service rejected the agent's API key.")
                    raise
                await self._status_once("error", "Can't reach the speech service; retrying.")
                await asyncio.sleep(RECONNECT_DELAYS_S[min(failures, len(RECONNECT_DELAYS_S) - 1)])
                failures += 1
                continue
            failures = 0
            await self._status_once("live", "")
            sender = asyncio.create_task(self._send(stream), name="speech-send")
            try:
                async for raw in stream.messages():
                    if self._on_message(raw):
                        raise TtsConnectError("auth", auth=True)
            except TtsConnectError as err:
                if err.auth:
                    await self._status_once("error", "The speech service rejected the agent's API key.")
                    raise
                logger.warning("tts stream failed (%s); reconnecting", err)
            finally:
                sender.cancel()
                await asyncio.gather(sender, return_exceptions=True)
                await stream.close()
            # Contexts in flight died with the connection; let their sentences
            # play what arrived rather than wait forever.
            for sentence in set(self._contexts.values()):
                self._playout.finish(sentence)
            self._contexts.clear()

    async def _send(self, stream: TtsLike) -> None:
        while True:
            sentence, delta, final = await self._queue.get()
            state = self._sentences[sentence]
            context_id = f"{self.session_tag}-{sentence}"
            self._playout.open(sentence)
            self._contexts[context_id] = sentence
            self._speed = speed_for_backlog(self._playout.backlog_seconds(), self._speed)
            await stream.send(
                generation_request(
                    context_id=context_id,
                    transcript=piece_text(delta, first=state.pieces_sent == 0, language=self.language),
                    more=not final,
                    voice_id=self.voice_id,
                    model=self.model,
                    language=self.language,
                    speed=self._speed,
                    buffer_ms=self.buffer_ms,
                )
            )
            state.pieces_sent += 1

    def _on_message(self, raw: str) -> bool:
        """Fold one TTS message in; True on an auth failure."""
        event = parse_tts(raw)
        if isinstance(event, TtsAudio):
            sentence = self._contexts.get(event.context_id)
            if sentence is not None:
                self._playout.add(sentence, event.pcm)
                self._wake.set()
        elif isinstance(event, TtsDone):
            sentence = self._contexts.pop(event.context_id, None)
            if sentence is not None:
                self._playout.finish(sentence)
                self._wake.set()
        elif isinstance(event, TtsError):
            if event.auth:
                return True
            logger.warning("tts error for %s: %s", event.context_id, event.message)
            # Skip the sentence rather than stall every later one behind it.
            sentence = self._contexts.pop(event.context_id or "", None)
            if sentence is not None:
                self._playout.finish(sentence)
        return False

    # ------------------------------------------------------------- playout

    async def _play(self) -> None:
        """Feeds the voice track. The sink paces to real time (an AudioSource
        with a short queue), so this loop runs as fast as audio plays."""
        while True:
            item = self._playout.read(FRAME_BYTES)
            if item is None:
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=FRAME_MS / 1000)
                except asyncio.TimeoutError:
                    pass
                continue
            sentence, pcm = item
            state = self._sentences.get(sentence)
            if state and not state.first_audio_reported and sentence >= 0:
                state.first_audio_reported = True
                message: dict = {"type": "voice", "sentence": sentence}
                if state.speech_started is not None:
                    # From the source speech reaching the agent to the first
                    # translated audio leaving it: the agent's ear-to-voice.
                    message["lagMs"] = round((self.clock() - state.speech_started) * 1000, 1)
                message["backlogMs"] = round(self._playout.backlog_seconds() * 1000, 1)
                await self.publish(message)
            await self.sink(pcm)
            if state and self.on_playing is not None:
                self.on_playing(sentence, state.text)

    async def _status_once(self, status: str, detail: str) -> None:
        if (status, detail) != self._status:
            self._status = (status, detail)
            await self.set_status(status, detail)
