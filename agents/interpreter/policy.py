"""Simultaneous-translation commit policy (docs/REALTIME-TRANSLATION.md §4.3-4.4).

Pure: no I/O, no SDK, no clock. Unit-tested with scripted hypothesis sequences.

The translator is asked, again and again as the source sentence grows, for
"the continuation of the target that is safe to say now". Its answers wobble
while the sentence is incomplete, but audio (Phase 4) can't be unsaid, so
nothing reaches the listener until it is *committed*, and committed text is
append-only:

* LocalAgreement-2: commit the longest prefix on which the last two
  candidates agree. Easy stretches flow quickly; ambiguous ones wait.
* Lag ceiling (wait-k upper bound): once the source has run more than k
  tokens past the last commit, the next answer is committed whole. The
  translator is told so in advance (`force`), so it commits to its best
  continuation rather than hedging.
* Flush: when the source sentence is final, the full candidate is committed.

Work is in tokens rather than characters so a commit never splits a word.
Japanese and Chinese are written without spaces, so they are tokenised per
character.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Written without spaces between words.
CHAR_SCRIPT = frozenset({"ja", "zh"})
# Verb-final (SOV) word order, or verb-final subordinate clauses (de, nl):
# translating into or out of these needs more source before it is safe.
VERB_FINAL = frozenset({"de", "nl", "ja", "ko", "tr", "hi"})

BASE_LAG_TOKENS = 4
VERB_FINAL_LAG_TOKENS = 6
# A Japanese/Chinese "token" here is one character, roughly a third of a word.
CHAR_SCRIPT_FACTOR = 3


def tokenize(text: str, language: str) -> list[str]:
    if language in CHAR_SCRIPT:
        return [ch for ch in text if not ch.isspace()]
    return text.split()


def detokenize(tokens: list[str], language: str) -> str:
    return ("" if language in CHAR_SCRIPT else " ").join(tokens)


def lag_ceiling(source: str, target: str) -> int:
    """Max source tokens the committed target may trail by (wait-k ceiling).

    `source` may be "multi" (auto-detect), treated as space-delimited.
    """
    base = VERB_FINAL_LAG_TOKENS if source in VERB_FINAL or target in VERB_FINAL else BASE_LAG_TOKENS
    return base * CHAR_SCRIPT_FACTOR if source in CHAR_SCRIPT else base


def common_prefix(a: list[str], b: list[str]) -> list[str]:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return a[:n]


@dataclass
class Commit:
    """What changed after one translation result."""

    committed: list[str]
    #: Newly committed tokens (what TTS will be given in Phase 4). Empty if none.
    delta: list[str]
    #: The latest candidate beyond what is committed: shown as tentative text.
    tentative: list[str]


@dataclass
class CommitPolicy:
    target: str
    ceiling: int
    committed: list[str] = field(default_factory=list)
    _last_candidate: list[str] | None = None
    _source_at_commit: int = 0

    def should_force(self, source_tokens: int) -> bool:
        """True when the source has outrun the last commit by the ceiling."""
        return source_tokens - self._source_at_commit >= self.ceiling

    def on_translation(self, continuation: str, *, source_tokens: int, final: bool, forced: bool) -> Commit:
        """Fold one translator answer in. `continuation` is what the translator
        proposed to say after the committed text, given `source_tokens` of
        source; `forced` must match the `force` flag the request was sent with."""
        candidate = self.committed + tokenize(continuation, self.target)

        if final or forced:
            stable = candidate
        elif self._last_candidate is None:
            stable = self.committed
        else:
            stable = common_prefix(self._last_candidate, candidate)
        self._last_candidate = candidate

        # Append-only by construction: every candidate starts with the
        # committed tokens, so a longer agreed prefix only ever extends them.
        delta = stable[len(self.committed):] if len(stable) > len(self.committed) else []
        if delta:
            self.committed = self.committed + delta
        if delta or forced:
            self._source_at_commit = source_tokens
        return Commit(
            committed=list(self.committed),
            delta=delta,
            tentative=candidate[len(self.committed):],
        )

    def text(self) -> str:
        return detokenize(self.committed, self.target)
