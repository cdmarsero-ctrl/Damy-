"""Phase 6: session metering, the signed report, the time limit and model
failover."""

import asyncio
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from metering import SessionMeter, encode_report, percentile, sign_report  # noqa: E402
from protocol import MAX_SESSION_SECONDS, encode_ending, max_seconds  # noqa: E402

# Shared with src/lib/interpreter/usage.test.ts: both sides must agree.
VECTOR_BODY = b'{"room":"r1"}'
VECTOR_SIGNATURE = "sha256=89fde262a018432d713c9a51025398907163be7b420ef36b21683b939ee1b47d"


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


class Recorder:
    def __init__(self) -> None:
        self.records = []

    def record(self, name, value, attributes):
        self.records.append((name, value, attributes["pair"]))


def test_signature_matches_the_web_app():
    assert sign_report(VECTOR_BODY, "devsecret") == VECTOR_SIGNATURE


def test_percentiles_use_nearest_rank_like_the_web_app():
    assert percentile([], 50) is None
    assert percentile([5.0, 1.0, 3.0], 50) == 3.0
    assert percentile([float(i) for i in range(1, 11)], 95) == 10.0


def test_report_summarises_usage_and_latency_without_content():
    clock, sink = Clock(), Recorder()
    meter = SessionMeter("en", "es", sink=sink, clock=clock)
    for ms in (180, 200, 220, 900):
        meter.caption(ms)
    meter.translation(260)
    meter.voice(1100)
    meter.sentence()
    meter.asr(42.5)
    meter.mt({"input": 120, "output": 8, "cache_read": 600, "cache_write": 0})
    meter.mt({"input": 130, "output": 9, "cache_read": 600, "cache_write": 0})
    meter.tts(57)
    meter.echo_removed_words = 3
    clock.t += 95.25
    report = meter.report("interp_u1_abcd", "learner left")
    assert report == {
        "room": "interp_u1_abcd",
        "durationSeconds": 95.2,
        "endReason": "learner left",
        "usage": {
            "asrSeconds": 42.5, "mtRequests": 2, "mtInputTokens": 250, "mtOutputTokens": 17,
            "mtCacheReadTokens": 1200, "mtCacheWriteTokens": 0, "ttsCharacters": 57,
        },
        "quality": {
            "sentences": 1, "captionP50Ms": 200.0, "captionP95Ms": 900.0,
            "translationP50Ms": 260.0, "translationP95Ms": 260.0,
            "voiceP50Ms": 1100.0, "voiceP95Ms": 1100.0, "echoRemovedWords": 3,
        },
    }
    assert json.loads(encode_report(report)) == report
    # Samples and usage also went to the telemetry sink, tagged with the pair.
    assert ("voice_lag", 1100, "en->es") in sink.records
    assert ("asr_seconds", 42.5, "en->es") in sink.records
    assert ("mt_tokens", 728, "en->es") in sink.records


def test_an_empty_session_reports_nulls_not_zeros():
    meter = SessionMeter("en", "-", clock=Clock())
    quality = meter.report("r", "learner left")["quality"]
    assert quality["captionP50Ms"] is None and quality["voiceP95Ms"] is None


def test_time_limit_comes_from_signed_metadata_and_is_bounded():
    assert max_seconds('{"maxSeconds": 900}') == 900
    assert max_seconds('{"maxSeconds": 1e9}') == MAX_SESSION_SECONDS
    for bad in (None, "", "{}", '{"maxSeconds": 0}', '{"maxSeconds": -5}', '{"maxSeconds": true}', '{"maxSeconds": "900"}'):
        assert max_seconds(bad) is None
    assert json.loads(encode_ending("time-limit")) == {"type": "ending", "reason": "time-limit"}


# ------------------------------------------------------------- failover

anthropic = pytest.importorskip("anthropic")
from mt import FAILOVER_COOLDOWN_S, ClaudeTranslator, TranslationError, TranslationRequest, TranslationResult  # noqa: E402


def test_translation_fails_over_to_the_second_model_and_back():
    clock = Clock()
    translator = ClaudeTranslator(
        client=None, source_label="English", target_label="Spanish",
        model="primary", fallback_model="fallback", clock=clock,
    )
    calls, failing = [], {"primary"}

    async def request(req, model):
        calls.append(model)
        if model in failing:
            raise TranslationError("overloaded")
        return TranslationResult("hola", 1.0, 2.0)

    translator._request = request
    req = TranslationRequest(context=(), spoken="", frozen="hello", unstable="", final=False, force=False)

    assert asyncio.run(translator.translate(req)).continuation == "hola"
    assert calls == ["primary", "fallback"]  # retried at once on the fallback
    asyncio.run(translator.translate(req))
    assert calls[-1] == "fallback"  # stays there during the cooldown
    clock.t += FAILOVER_COOLDOWN_S + 1
    failing.clear()
    asyncio.run(translator.translate(req))
    assert calls[-1] == "primary"  # and tries the primary again after it


def test_permanent_errors_do_not_fail_over():
    translator = ClaudeTranslator(client=None, source_label="English", target_label="Spanish",
                                  model="primary", fallback_model="fallback")
    calls = []

    async def request(req, model):
        calls.append(model)
        raise TranslationError("bad key", permanent=True)

    translator._request = request
    req = TranslationRequest(context=(), spoken="", frozen="hello", unstable="", final=True, force=False)
    with pytest.raises(TranslationError):
        asyncio.run(translator.translate(req))
    assert calls == ["primary"]
