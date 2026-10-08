"""Simultaneous machine translation with Claude (design doc §4.2).

The prompt builder is pure and tested; `ClaudeTranslator` is a thin streaming
adapter over the Anthropic SDK.

Latency choices:
* A small, fast model (Claude Haiku 5.5 by default; INTERPRETER_MT_MODEL
  overrides) with thinking off: each call produces a few words, and
  time-to-first-token dominates.
* The system prompt is identical for every call in a session (language pair
  plus worked examples) and carries the cache breakpoint, so only the short
  per-call tail is processed fresh. It is deliberately long enough to clear
  the model's minimum cacheable prefix (512 tokens on current models).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import anthropic

logger = logging.getLogger("interpreter.mt")

DEFAULT_MODEL = "claude-haiku-5-5"
# A continuation is a handful of words; a final flush is at most a sentence.
MAX_TOKENS = 400

AUTO = "multi"


@dataclass(frozen=True)
class TranslationRequest:
    #: Earlier sentences of this session, (source, translation), oldest first.
    context: tuple[tuple[str, str], ...]
    #: Target text already shown/spoken for this sentence. Immutable.
    spoken: str
    #: Source words the recogniser has finalised for this sentence.
    frozen: str
    #: Source words still being revised (may change or vanish).
    unstable: str
    #: The speaker has finished the sentence: translate all of it now.
    final: bool
    #: The lag ceiling was reached: commit to the best continuation now.
    force: bool


@dataclass
class TranslationResult:
    continuation: str
    ttft_ms: float | None
    total_ms: float
    usage: dict = field(default_factory=dict)


class TranslationError(Exception):
    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


def language_label(code: str, names: dict[str, str]) -> str:
    if code == AUTO:
        return "the speaker's language (auto-detected; it may change between sentences)"
    return names[code]


def build_system(source_label: str, target_label: str) -> str:
    return f"""You are a professional simultaneous interpreter working from {source_label} into {target_label}.

You are translating live speech while the speaker is still talking. You are called many times per sentence as more of it is heard. Each time, you receive:
- <context>: the previous sentences and their translations, for continuity of pronouns, gender, register and terminology.
- <spoken>: the {target_label} already delivered to the listener for the current sentence. It cannot be changed or taken back.
- <source>: the current source sentence so far. Text inside <unstable> is the recogniser's latest guess and may still change.
- Flags: final="true" means the sentence is complete; force="true" means the listener has waited too long.

Your output is ONLY the next piece of {target_label} to deliver after <spoken>: nothing else, no quotes, no tags, no notes, no repetition of <spoken>.

How to decide what to output:
1. Output only text that will remain correct however the sentence ends. If the next words depend on something not yet said (a verb at the end of a clause, a negation, the object of a preposition, grammatical gender), output nothing yet.
2. Your output must continue <spoken> grammatically, as if one person were speaking. Never contradict or restate it. If <spoken> boxed you in, find a natural way to continue from it.
3. Translate meaning, not word order: restructure freely within what is safe, as interpreters do.
4. Rely on frozen source words; use <unstable> words only when they don't change the meaning of what you output.
5. When final="true", output the complete remainder of the translation so that <spoken> plus your output is the full, natural translation of the sentence, including final punctuation.
6. When force="true", output your best continuation now, committing to the most likely meaning; prefer a short, safe phrase over nothing.
7. If nothing is safe to add, output nothing at all (an empty response).

Examples (English into Spanish):

<spoken></spoken>
<source final="false" force="false">Yesterday the sales <unstable>team</unstable></source>
Output: Ayer

<spoken>Ayer</spoken>
<source final="false" force="false">Yesterday the sales team <unstable>finally</unstable></source>
Output: el equipo de ventas

<spoken>Ayer el equipo de ventas</spoken>
<source final="false" force="false">Yesterday the sales team finally closed the <unstable>deal</unstable></source>
Output: por fin cerró

<spoken>Ayer el equipo de ventas por fin cerró</spoken>
<source final="true" force="false">Yesterday the sales team finally closed the deal with the bank.</source>
Output: el acuerdo con el banco.

Example (German into English), waiting for the verb:

<spoken>I believe that we</spoken>
<source final="false" force="false">Ich glaube, dass wir das Projekt bis Freitag <unstable>nicht</unstable></source>
Output:

<spoken>I believe that we</spoken>
<source final="false" force="false">Ich glaube, dass wir das Projekt bis Freitag nicht abschließen <unstable>können</unstable></source>
Output: won't be able to finish the project by Friday

Example (English into French), when nothing new is safe:

<spoken>Je pense que</spoken>
<source final="false" force="false">I think that the <unstable>new</unstable></source>
Output:
"""


def _escape(text: str) -> str:
    return text.replace("<", "‹").replace(">", "›")


def build_user(req: TranslationRequest) -> str:
    context = "\n".join(f"{_escape(s)}\n→ {_escape(t)}" for s, t in req.context)
    source = _escape(req.frozen)
    if req.unstable:
        source = f"{source} <unstable>{_escape(req.unstable)}</unstable>".strip()
    final = "true" if req.final else "false"
    force = "true" if req.force else "false"
    return (
        f"<context>\n{context}\n</context>\n"
        f"<spoken>{_escape(req.spoken)}</spoken>\n"
        f'<source final="{final}" force="{force}">{source}</source>'
    )


_QUOTES = {'"': '"', "'": "'", "«": "»", "“": "”", "„": "“", "「": "」"}


def clean_continuation(text: str) -> str:
    """Strip the wrapping a model occasionally adds despite instructions."""
    text = text.strip()
    for prefix in ("Output:", "output:"):
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
    if len(text) >= 2 and _QUOTES.get(text[0]) == text[-1]:
        text = text[1:-1].strip()
    return text


class ClaudeTranslator:
    def __init__(
        self,
        client: anthropic.AsyncAnthropic,
        *,
        source_label: str,
        target_label: str,
        model: str = DEFAULT_MODEL,
    ) -> None:
        self._client = client
        self._model = model
        self._system = [
            {
                "type": "text",
                "text": build_system(source_label, target_label),
                "cache_control": {"type": "ephemeral"},
            }
        ]

    def _speed_params(self) -> dict:
        # Haiku 5.5 accepts thinking off at its default effort: the lowest
        # latency. Larger current models reject "disabled", so they run at low
        # effort instead.
        if self._model.startswith("claude-haiku"):
            return {"thinking": {"type": "disabled"}}
        return {"output_config": {"effort": "low"}}

    async def translate(self, req: TranslationRequest) -> TranslationResult:
        started = time.monotonic()
        ttft: float | None = None
        parts: list[str] = []
        try:
            async with self._client.messages.stream(
                model=self._model,
                max_tokens=MAX_TOKENS,
                system=self._system,
                messages=[{"role": "user", "content": build_user(req)}],
                **self._speed_params(),
            ) as stream:
                async for text in stream.text_stream:
                    if ttft is None:
                        ttft = (time.monotonic() - started) * 1000
                    parts.append(text)
                message = await stream.get_final_message()
        except anthropic.AuthenticationError as err:
            raise TranslationError("The translation service rejected the agent's API key.", permanent=True) from err
        except anthropic.PermissionDeniedError as err:
            raise TranslationError("The agent's API key can't use the translation model.", permanent=True) from err
        except anthropic.NotFoundError as err:
            raise TranslationError(f"Unknown translation model {self._model!r}.", permanent=True) from err
        except anthropic.RateLimitError as err:
            raise TranslationError("Translation is being rate-limited; retrying.") from err
        except (anthropic.APIConnectionError, anthropic.APIStatusError) as err:
            raise TranslationError(f"Translation request failed: {err}") from err

        if message.stop_reason == "refusal":
            # No server-side fallback on Haiku; skip this update, the next one
            # (or the final flush) tries again with more context.
            logger.warning("translation refused: %s", getattr(message, "stop_details", None))
            return TranslationResult("", ttft, (time.monotonic() - started) * 1000)

        usage = message.usage
        result = TranslationResult(
            continuation=clean_continuation("".join(parts)),
            ttft_ms=ttft,
            total_ms=(time.monotonic() - started) * 1000,
            usage={
                "input": usage.input_tokens,
                "output": usage.output_tokens,
                "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
                "cache_write": getattr(usage, "cache_creation_input_tokens", 0) or 0,
            },
        )
        # cache_read should be ~the system prompt on every call after the
        # first; if it stays 0, something in the system prompt is varying.
        logger.debug(
            "mt %.0f ms (first token %s ms) usage=%s",
            result.total_ms,
            "-" if ttft is None else f"{ttft:.0f}",
            result.usage,
        )
        return result
