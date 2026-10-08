import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from captions import (  # noqa: E402
    ArrivalClock,
    AsrResult,
    AsrWord,
    CaptionTracker,
    UtteranceEnd,
    parse_deepgram,
)
from gate import SpeechGate  # noqa: E402


def results(transcript: str, *, is_final=False, speech_final=False, words=None) -> str:
    words = words if words is not None else [
        {"word": w.lower(), "punctuated_word": w, "start": i * 0.3, "end": i * 0.3 + 0.25}
        for i, w in enumerate(transcript.split())
    ]
    return json.dumps(
        {
            "type": "Results",
            "is_final": is_final,
            "speech_final": speech_final,
            "channel": {"alternatives": [{"transcript": transcript, "words": words}]},
        }
    )


def result(transcript: str, *, is_final=False, speech_final=False) -> AsrResult:
    event = parse_deepgram(results(transcript, is_final=is_final, speech_final=speech_final))
    assert isinstance(event, AsrResult)
    return event


# ------------------------------------------------------------------ parsing


def test_parses_results_with_punctuated_words_and_audio_end():
    event = parse_deepgram(results("Hello there.", is_final=True, speech_final=True))
    assert event == AsrResult(
        transcript="Hello there.",
        is_final=True,
        speech_final=True,
        words=(AsrWord("Hello", 0.0, 0.25), AsrWord("there.", 0.3, 0.55)),
    )
    assert event.audio_end == 0.55


def test_parses_utterance_end_and_ignores_other_types():
    assert parse_deepgram('{"type":"UtteranceEnd","last_word_end":2.5}') == UtteranceEnd(2.5)
    assert parse_deepgram('{"type":"Metadata","duration":3}') is None
    assert parse_deepgram('{"type":"SpeechStarted","timestamp":1}') is None


def test_malformed_messages_are_ignored():
    for raw in ("", "nope", "[]", '{"type":"Results"}', '{"type":"Results","channel":{"alternatives":[]}}',
                '{"type":"UtteranceEnd"}'):
        assert parse_deepgram(raw) is None


def test_words_without_timings_are_dropped_not_fatal():
    event = parse_deepgram(results("a b", words=[{"word": "a"}, {"word": "b", "start": 0.1, "end": 0.2}]))
    assert [w.text for w in event.words] == ["b"]


# --------------------------------------------------------------- tracking


def test_interims_update_one_segment_until_final():
    t = CaptionTracker()
    assert t.on_result(result("hel"), 120.0) == {
        "type": "caption", "segment": 0, "text": "hel", "final": False, "latencyMs": 120.0
    }
    assert t.on_result(result("hello wor"), None)["segment"] == 0
    final = t.on_result(result("Hello world.", is_final=True), 210.04)
    assert final == {"type": "caption", "segment": 0, "text": "Hello world.", "final": True, "latencyMs": 210.0}
    assert t.on_result(result("next"), None)["segment"] == 1


def test_speech_final_marks_the_utterance_end_once():
    t = CaptionTracker()
    t.on_result(result("one", is_final=True), None)
    msg = t.on_result(result("two.", is_final=True, speech_final=True), None)
    assert msg["utteranceEnd"] is True
    # Deepgram's UtteranceEnd for the same boundary must not double it up.
    assert t.on_utterance_end() is None


def test_utterance_end_message_closes_an_open_utterance():
    t = CaptionTracker()
    t.on_result(result("one", is_final=True), None)
    assert t.on_utterance_end() == {"type": "utterance-end"}
    assert t.on_utterance_end() is None


def test_empty_results_are_skipped_unless_they_clear_a_shown_interim():
    t = CaptionTracker()
    assert t.on_result(result(""), None) is None
    assert t.on_result(result("", is_final=True), None) is None  # nothing shown
    t.on_result(result("uh"), None)
    cleared = t.on_result(result("", is_final=True), None)
    assert cleared == {"type": "caption", "segment": 0, "text": "", "final": True}
    # An empty final doesn't open an utterance.
    assert t.on_utterance_end() is None


def test_reconnect_clears_the_interim_in_flight():
    t = CaptionTracker()
    assert t.on_reconnect() is None
    t.on_result(result("half a sen"), None)
    assert t.on_reconnect() == {"type": "caption", "segment": 0, "text": "", "final": True}
    assert t.on_result(result("new"), None)["segment"] == 1


# ------------------------------------------------------------------- clock


def test_arrival_clock_maps_stream_offsets_to_arrival_times():
    clock = ArrivalClock(sample_rate=16_000)
    for i in range(5):  # five 20 ms chunks arriving 1 s apart
        clock.record(320, arrived_at=100.0 + i)
    assert clock.arrival_of(0.0) == 100.0
    assert clock.arrival_of(0.019) == 100.0
    assert clock.arrival_of(0.021) == 101.0
    assert clock.arrival_of(0.1) == 104.0
    assert clock.arrival_of(0.5) is None  # never sent


def test_arrival_clock_resets_for_a_new_stream_and_forgets_old_audio():
    clock = ArrivalClock(sample_rate=1_000, horizon_s=1.0)
    for i in range(30):  # 100 ms chunks: 3 s of audio
        clock.record(100, arrived_at=float(i))
    assert clock.arrival_of(0.05) is None  # beyond the 1 s horizon
    assert clock.arrival_of(2.95) == 29.0
    clock.reset()
    assert clock.arrival_of(0.0) is None
    clock.record(100, arrived_at=50.0)
    assert clock.arrival_of(0.05) == 50.0


# -------------------------------------------------------------------- gate


def test_gate_buffers_preroll_and_flushes_it_at_speech_onset():
    gate: SpeechGate[int] = SpeechGate(preroll_frames=3)
    assert [gate.push(i) for i in range(5)] == [[], [], [], [], []]
    assert gate.start() == [2, 3, 4]  # only the most recent pre-roll
    assert gate.start() == []  # idempotent
    assert gate.push(5) == [5]
    assert gate.stop() is True
    assert gate.stop() is False  # finalize only once per utterance
    assert gate.push(6) == []
    assert gate.start() == [6]
