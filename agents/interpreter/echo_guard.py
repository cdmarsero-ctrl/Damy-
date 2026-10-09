"""Phase 5: the transcript-level echo guard (design doc §6.3.1).

Browser echo cancellation removes most of the translated voice from the
learner's microphone, but not always all of it (laptop speakers at full
volume, a device whose AEC is weak or off). Whatever survives is transcribed
like speech, translated, and spoken again: a feedback loop.

The agent knows exactly what it has just said and when, so it can recognise
those words when they come back:

    Speaker ──(sentence text, play time)──► EchoGuard ◄──(ASR words, arrival time)── Captioner
                                                │
                                   words that match recently played text,
                                   arriving inside the echo delay window,
                                   are removed before captions/translation

The translation is in a different language from the learner's speech, so a
learner's own words rarely match; to keep that "rarely" from costing the
learner a word, a match must follow the played text *in order* for at least
two words (a lone cognate like "no" passes). A single word is removed only
when it is the whole result, or picks up where an earlier echo left off.

Pure (stdlib only, injected clock), so it is unit-tested without a network.
"""

from __future__ import annotations

import time
import unicodedata
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from difflib import SequenceMatcher
from functools import lru_cache

from captions import AsrResult
from policy import CHAR_SCRIPT

# From a frame leaving the agent to its echo arriving back: the voice track's
# jitter buffer (≤ 200 ms), the network both ways, the browser's playout and
# capture buffers, and the room. Generous: a late echo that slips past is
# worse than briefly guarding words the learner says over the translation.
ECHO_DELAY_S = 2.0
# Arrival times are per 20 ms chunk; allow a little before playout started.
LEAD_S = 0.1
# Played text older than this can't echo any more.
HORIZON_S = 10.0
# This many words matching the played text in order are echo.
MIN_RUN = 2
# A single matching word is echo if it picks up within this many played
# tokens of where the last removed echo left off, or of the start (echo
# split across results).
CONTINUE_TOKENS = 3
# A result that is a single matching word is echo only if the word is this
# long (after normalising), so a stray "a" or "no" is never removed.
MIN_SOLO_CHARS = 3
# Recognisers mangle a foreign-language echo ("trato" -> "trado"); this is the
# similarity (difflib ratio) above which two words count as the same.
SIMILARITY = 0.8
# Fuzzy matching only for words this long; short words must match exactly.
FUZZY_MIN_CHARS = 4
# Echo removed in this many final results within the window means AEC is not
# coping: the client is told, and offers protected mode (§6.3.3).
TRIPS_TO_LEAK = 3
TRIP_WINDOW_S = 60.0

# What the agent says during an echo check (§6.4), per target language. A
# plain greeting rather than numbers: recognisers turn spoken numbers into
# digits, which would then never match the played text.
CHECK_PHRASES = {
    "en": "Good morning everyone, thank you for coming today.",
    "es": "Buenos días a todos, gracias por venir hoy.",
    "fr": "Bonjour à tous, merci d'être venus aujourd'hui.",
    "de": "Guten Morgen zusammen, danke, dass ihr heute gekommen seid.",
    "it": "Buongiorno a tutti, grazie per essere venuti oggi.",
    "pt": "Bom dia a todos, obrigado por virem hoje.",
    "nl": "Goedemorgen allemaal, bedankt dat jullie vandaag gekomen zijn.",
    "ja": "皆さん、おはようございます。今日は来てくれてありがとう。",
    "ko": "여러분 안녕하세요, 오늘 와 주셔서 감사합니다.",
    "zh": "大家早上好，谢谢你们今天来。",
    "ru": "Доброе утро всем, спасибо, что пришли сегодня.",
    "hi": "सभी को सुप्रभात, आज आने के लिए धन्यवाद।",
    "ar": "صباح الخير جميعًا، شكرًا لحضوركم اليوم.",
    "tr": "Herkese günaydın, bugün geldiğiniz için teşekkürler.",
    "pl": "Dzień dobry wszystkim, dziękuję, że przyszliście dzisiaj.",
    "sv": "God morgon allihop, tack för att ni kom i dag.",
    "uk": "Доброго ранку всім, дякую, що прийшли сьогодні.",
    "vi": "Chào buổi sáng mọi người, cảm ơn các bạn đã đến hôm nay.",
    "id": "Selamat pagi semuanya, terima kasih sudah datang hari ini.",
}


def normalize(word: str) -> str:
    """Case-, accent- and punctuation-insensitive form of a word.

    Accents go because a recogniser hearing another language rarely gets them
    right ("días" comes back as "dias"). Marks that carry the letter itself in
    Indic scripts (vowel signs) are kept.
    """
    decomposed = unicodedata.normalize("NFKD", word.casefold())
    kept = []
    for ch in decomposed:
        if unicodedata.category(ch) == "Mn" and ord(ch) < 0x0900:
            continue  # Latin/Greek/Cyrillic combining accents
        if ch.isalnum() or unicodedata.category(ch).startswith("M"):
            kept.append(ch)
    return unicodedata.normalize("NFC", "".join(kept))


@lru_cache(maxsize=8192)  # the same pairs recur across interim results
def similar(a: str, b: str) -> bool:
    if a == b:
        return True
    if len(a) < FUZZY_MIN_CHARS or len(b) < FUZZY_MIN_CHARS:
        return False
    return SequenceMatcher(None, a, b).ratio() >= SIMILARITY


def played_tokens(text: str, language: str) -> list[str]:
    if language in CHAR_SCRIPT:
        return [t for ch in text if (t := normalize(ch))]
    return [t for word in text.split() if (t := normalize(word))]


@dataclass
class _Played:
    text: str
    tokens: list[str]
    start: float
    end: float
    # Index of the last played token already removed as echo (final results
    # only): a lone match just after it continues that echo.
    cursor: int = -1


def _align(words: list[str], tokens: list[str]) -> list[tuple[int, int]]:
    """Longest in-order matching between recognised words and played tokens
    (an LCS with fuzzy equality), as (word index, token index) pairs. In-order
    matters: echo repeats the played text in sequence, while a learner's
    words that happen to match are scattered."""
    n, m = len(words), len(tokens)
    if not n or not m:
        return []
    best = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            if similar(words[i], tokens[j]):
                best[i][j] = best[i + 1][j + 1] + 1
            else:
                best[i][j] = max(best[i + 1][j], best[i][j + 1])
    pairs, i, j = [], 0, 0
    while i < n and j < m:
        if similar(words[i], tokens[j]) and best[i][j] == best[i + 1][j + 1] + 1:
            pairs.append((i, j))
            i, j = i + 1, j + 1
        elif best[i + 1][j] >= best[i][j + 1]:
            i += 1
        else:
            j += 1
    return pairs


@dataclass(frozen=True)
class EchoStats:
    """Words in *final* results, so a word counts once, not once per interim."""

    heard: int = 0  # recognised
    passed: int = 0  # left in after the guard


class EchoGuard:
    def __init__(self, language: str, clock: Callable[[], float] = time.monotonic) -> None:
        self.language = language
        self.clock = clock
        self._played: dict[int, _Played] = {}
        self._trips: deque[float] = deque()
        self.stats = EchoStats()

    # ------------------------------------------------------------- playout

    def playing(self, sentence: int, text: str) -> None:
        """Called by the speaker for each frame it plays: `text` is everything
        sent to TTS for this sentence so far, which covers what is audible."""
        now = self.clock()
        played = self._played.get(sentence)
        if played is None:
            self._played[sentence] = _Played(text, played_tokens(text, self.language), now, now)
            return
        if text != played.text:  # a later piece of the sentence was sent
            played.text, played.tokens = text, played_tokens(text, self.language)
        played.end = now

    def last_played(self, sentence: int) -> float | None:
        played = self._played.get(sentence)
        return played.end if played else None

    def spoken_words(self, sentence: int) -> int:
        played = self._played.get(sentence)
        return len(played.tokens) if played else 0

    # ----------------------------------------------------------------- ASR

    def filter(self, result: AsrResult, arrivals: Sequence[float | None]) -> AsrResult:
        """`result` without the words that are echo. `arrivals[i]` is when the
        audio of `result.words[i]` reached the agent (None if unknown, taken
        as now)."""
        now = self.clock()
        for key in [k for k, p in self._played.items() if p.end < now - HORIZON_S]:
            del self._played[key]

        words = result.words
        norms = [normalize(w.text) for w in words]
        times = [a if a is not None else now for a in (list(arrivals) + [None] * len(words))[: len(words)]]
        drop = [False] * len(words)
        for played in self._played.values():
            window = [
                i for i, n in enumerate(norms)
                if n and played.start - LEAD_S <= times[i] <= played.end + ECHO_DELAY_S
            ]
            pairs = _align([norms[i] for i in window], played.tokens)
            if not pairs:
                continue
            first_token = pairs[0][1]
            # A lone match continues an earlier echo, or starts one: the start
            # needs a longer word, since nothing before it vouches for it.
            first_word = norms[window[pairs[0][0]]]
            continues = played.cursor < first_token <= played.cursor + CONTINUE_TOKENS and (
                played.cursor >= 0 or len(first_word) >= FUZZY_MIN_CHARS
            )
            solo = len(words) == 1 and len(norms[0]) >= MIN_SOLO_CHARS
            if len(pairs) >= MIN_RUN or continues or solo:
                for w, _ in pairs:
                    drop[window[w]] = True
                if result.is_final:
                    played.cursor = max(played.cursor, pairs[-1][1])

        dropped = sum(drop)
        if result.is_final:
            self.stats = EchoStats(self.stats.heard + len(words), self.stats.passed + len(words) - dropped)
            if dropped:
                self._trips.append(now)
        if not dropped:
            return result
        kept = tuple(w for w, d in zip(words, drop) if not d)
        return replace(result, transcript=" ".join(w.text for w in kept), words=kept)

    def leaking(self) -> bool:
        """Echo is getting past the browser's cancellation repeatedly."""
        now = self.clock()
        while self._trips and self._trips[0] < now - TRIP_WINDOW_S:
            self._trips.popleft()
        return len(self._trips) >= TRIPS_TO_LEAK
