"""Phase 6: per-session metering and latency summaries, and the signed
end-of-session report the web app stores (docs/REALTIME-TRANSLATION.md §8).

The report carries numbers only: vendor usage in billing units and latency
percentiles. No audio and no transcript text leave the agent this way.

Pure (stdlib only): samples are also handed to an optional `sink` (the
OpenTelemetry instruments in telemetry.py), so this module stays testable.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

# Bound memory on a long session; percentiles over the most recent samples.
MAX_SAMPLES = 5000

REPORT_SIGNATURE_HEADER = "x-interpreter-signature"


class Sink(Protocol):
    def record(self, name: str, value: float, attributes: dict[str, str]) -> None: ...


def percentile(values: list[float], p: float) -> float | None:
    """Nearest rank, as the web app computes it (src/lib/interpreter/usage.ts)."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


def sign_report(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@dataclass
class SessionMeter:
    source: str
    target: str
    sink: Sink | None = None
    clock: Callable[[], float] = time.monotonic
    started: float = field(default=0.0)

    asr_seconds: float = 0.0
    mt_requests: int = 0
    mt_input_tokens: int = 0
    mt_output_tokens: int = 0
    mt_cache_read_tokens: int = 0
    mt_cache_write_tokens: int = 0
    tts_characters: int = 0
    sentences: int = 0
    echo_removed_words: int = 0
    _caption: list[float] = field(default_factory=list)
    _translation: list[float] = field(default_factory=list)
    _voice: list[float] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.started:
            self.started = self.clock()

    @property
    def attributes(self) -> dict[str, str]:
        return {"pair": f"{self.source}->{self.target}"}

    def _sample(self, samples: list[float], name: str, value: float) -> None:
        samples.append(value)
        if len(samples) > MAX_SAMPLES:
            del samples[: len(samples) - MAX_SAMPLES]
        if self.sink is not None:
            self.sink.record(name, value, self.attributes)

    def _count(self, name: str, value: float) -> None:
        if self.sink is not None and value:
            self.sink.record(name, value, self.attributes)

    # ------------------------------------------------------------ samples

    def caption(self, latency_ms: float) -> None:
        self._sample(self._caption, "caption_latency", latency_ms)

    def translation(self, flush_ms: float) -> None:
        self._sample(self._translation, "translation_flush", flush_ms)

    def voice(self, lag_ms: float) -> None:
        self._sample(self._voice, "voice_lag", lag_ms)

    def sentence(self) -> None:
        self.sentences += 1

    # -------------------------------------------------------------- usage

    def asr(self, seconds: float) -> None:
        self.asr_seconds += seconds
        self._count("asr_seconds", seconds)

    def mt(self, usage: dict) -> None:
        self.mt_requests += 1
        self.mt_input_tokens += int(usage.get("input", 0) or 0)
        self.mt_output_tokens += int(usage.get("output", 0) or 0)
        self.mt_cache_read_tokens += int(usage.get("cache_read", 0) or 0)
        self.mt_cache_write_tokens += int(usage.get("cache_write", 0) or 0)
        self._count("mt_tokens", sum(int(v or 0) for v in usage.values()))

    def tts(self, characters: int) -> None:
        self.tts_characters += characters
        self._count("tts_characters", characters)

    # ------------------------------------------------------------- report

    def report(self, room: str, end_reason: str) -> dict:
        """The body of POST /api/interpreter/report (sessionReportSchema)."""

        def ms(values: list[float], p: float) -> float | None:
            v = percentile(values, p)
            return None if v is None else round(v, 1)

        return {
            "room": room,
            "durationSeconds": round(self.clock() - self.started, 1),
            "endReason": end_reason[:100],
            "usage": {
                "asrSeconds": round(self.asr_seconds, 2),
                "mtRequests": self.mt_requests,
                "mtInputTokens": self.mt_input_tokens,
                "mtOutputTokens": self.mt_output_tokens,
                "mtCacheReadTokens": self.mt_cache_read_tokens,
                "mtCacheWriteTokens": self.mt_cache_write_tokens,
                "ttsCharacters": self.tts_characters,
            },
            "quality": {
                "sentences": self.sentences,
                "captionP50Ms": ms(self._caption, 50),
                "captionP95Ms": ms(self._caption, 95),
                "translationP50Ms": ms(self._translation, 50),
                "translationP95Ms": ms(self._translation, 95),
                "voiceP50Ms": ms(self._voice, 50),
                "voiceP95Ms": ms(self._voice, 95),
                "echoRemovedWords": self.echo_removed_words,
            },
        }


def encode_report(report: dict) -> bytes:
    return json.dumps(report, separators=(",", ":")).encode()
