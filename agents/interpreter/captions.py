"""Streaming-ASR results -> caption messages, plus the latency clock.

Pure (stdlib only), so it is unit-testable without the SDK or a network.

Deepgram's streaming model, which the caption protocol mirrors:

* An *interim* result (is_final=false) is the current best guess for the
  audio since the last final; the next interim replaces it.
* A *final* result (is_final=true) freezes that span; it never changes again.
  The next interim starts a new segment.
* speech_final=true on a final, or a separate UtteranceEnd message, marks the
  end of an utterance (a sentence boundary for the translation layer later).
"""

from __future__ import annotations

import bisect
import json
from collections import deque
from dataclasses import dataclass
from typing import Union


@dataclass(frozen=True)
class AsrWord:
    text: str
    start: float
    end: float


@dataclass(frozen=True)
class AsrResult:
    transcript: str
    is_final: bool
    speech_final: bool
    words: tuple[AsrWord, ...]

    @property
    def audio_end(self) -> float | None:
        """Stream offset (s) where the last recognised word ends.

        Used for latency rather than start+duration, which would include
        trailing silence the recogniser had no reason to wait for.
        """
        return self.words[-1].end if self.words else None


@dataclass(frozen=True)
class UtteranceEnd:
    last_word_end: float


AsrEvent = Union[AsrResult, UtteranceEnd]


def parse_deepgram(raw: str | bytes) -> AsrEvent | None:
    """Parse one Deepgram streaming message; None for anything we don't use
    (Metadata, SpeechStarted) or anything malformed."""
    try:
        msg = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(msg, dict):
        return None

    kind = msg.get("type")
    if kind == "UtteranceEnd":
        end = msg.get("last_word_end")
        return UtteranceEnd(float(end)) if isinstance(end, (int, float)) else None
    if kind != "Results":
        return None

    try:
        alt = msg["channel"]["alternatives"][0]
    except (KeyError, IndexError, TypeError):
        return None
    words = tuple(
        AsrWord(
            text=str(w.get("punctuated_word") or w.get("word") or ""),
            start=float(w["start"]),
            end=float(w["end"]),
        )
        for w in alt.get("words") or []
        if isinstance(w, dict) and isinstance(w.get("start"), (int, float)) and isinstance(w.get("end"), (int, float))
    )
    return AsrResult(
        transcript=str(alt.get("transcript") or "").strip(),
        is_final=bool(msg.get("is_final")),
        speech_final=bool(msg.get("speech_final")),
        words=words,
    )


class ArrivalClock:
    """Maps a position in the ASR stream back to when that audio reached us.

    The ASR only sees audio we send it, and with VAD gating that is not all
    the audio we receive, so stream offsets and wall-clock time drift apart.
    Recording each sent chunk's *arrival* time (not its send time) means a
    pre-roll flushed at speech onset is still timed from when it was spoken,
    so the measured latency includes any delay the gate added.
    """

    def __init__(self, sample_rate: int, horizon_s: float = 120.0) -> None:
        self.sample_rate = sample_rate
        self._ends: deque[int] = deque()  # cumulative sample count at chunk end
        self._arrivals: deque[float] = deque()
        self._sent = 0
        self._forgotten = 0  # samples before this were pruned
        self._horizon = int(horizon_s * sample_rate)

    def record(self, num_samples: int, arrived_at: float) -> None:
        self._sent += num_samples
        self._ends.append(self._sent)
        self._arrivals.append(arrived_at)
        while self._ends and self._ends[0] < self._sent - self._horizon:
            self._forgotten = self._ends.popleft()
            self._arrivals.popleft()

    def arrival_of(self, offset_s: float) -> float | None:
        """Arrival time of the chunk containing stream offset `offset_s`."""
        if not self._ends:
            return None
        sample = int(round(offset_s * self.sample_rate))
        if sample < self._forgotten:
            return None
        i = bisect.bisect_left(self._ends, sample)
        if i >= len(self._ends):
            return None  # beyond what we've sent: a malformed or future offset
        return self._arrivals[i]

    def reset(self) -> None:
        """A new ASR connection starts its offsets at zero again."""
        self._ends.clear()
        self._arrivals.clear()
        self._sent = 0
        self._forgotten = 0


class CaptionTracker:
    """Turns ASR events into the caption messages sent to the client."""

    def __init__(self) -> None:
        self.segment = 0
        self._segment_open = False  # an interim for this segment was sent
        self._utterance_open = False  # finals since the last utterance end

    def on_result(self, result: AsrResult, latency_ms: float | None) -> dict | None:
        if not result.is_final and not result.transcript:
            return None
        if result.is_final and not result.transcript and not self._segment_open:
            # Nothing was shown for this span, so there is nothing to clear.
            return None

        message: dict = {
            "type": "caption",
            "segment": self.segment,
            "text": result.transcript,
            "final": result.is_final,
        }
        if latency_ms is not None:
            message["latencyMs"] = round(latency_ms, 1)

        if result.is_final:
            self.segment += 1
            self._segment_open = False
            if result.transcript:
                self._utterance_open = True
            if result.speech_final and self._utterance_open:
                message["utteranceEnd"] = True
                self._utterance_open = False
        else:
            self._segment_open = True
        return message

    def on_utterance_end(self) -> dict | None:
        """UtteranceEnd arrives when endpointing didn't already mark the end."""
        if not self._utterance_open:
            return None
        self._utterance_open = False
        return {"type": "utterance-end"}

    def on_reconnect(self) -> dict | None:
        """A dropped connection loses the interim in flight; clear it on screen."""
        if not self._segment_open:
            return None
        message = {"type": "caption", "segment": self.segment, "text": "", "final": True}
        self.segment += 1
        self._segment_open = False
        return message
