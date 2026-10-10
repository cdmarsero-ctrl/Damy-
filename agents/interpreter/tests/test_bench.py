"""Phase 0: the benchmark harness's scoring and reporting (bench.py)."""

import json
import sys
import wave
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bench import aggregate, chrf, load_manifest, markdown, stats, wer  # noqa: E402


def test_wer_counts_word_edits_ignoring_case_and_punctuation():
    assert wer("The team closed the deal.", "the team closed the deal") == 0.0
    assert wer("the team closed the deal", "a team closed deal") == pytest.approx(2 / 5)  # 1 sub + 1 del
    assert wer("one two", "one two three") == pytest.approx(1 / 2)  # 1 insertion
    assert wer("", "anything") is None


def test_chrf_rewards_closer_translations():
    ref = "Ayer el equipo cerró el trato."
    assert chrf(ref, ref) == pytest.approx(100.0)
    close, far = chrf(ref, "Ayer el equipo cerro el trato"), chrf(ref, "Mañana vamos al cine")
    assert 50 < close < 100 and far < 30
    assert chrf("", "x") is None
    assert chrf(ref, "") == 0.0


def test_stats_and_report():
    assert stats([]) == {"n": 0, "p50": None, "p95": None}
    assert stats([100.0, 200.0, 300.0]) == {"n": 3, "p50": 200.0, "p95": 300.0}

    def summary(k, voice):
        return {
            "pair": "en->es", "model": "m", "k": k,
            "caption_interim_ms": stats([200.0]), "caption_final_ms": stats([700.0]),
            "first_commit_ms": stats([900.0]), "flush_ms": stats([250.0]),
            "ear_to_voice_ms": stats(voice), "wer": 0.1, "chrf": 60.0,
        }

    rows = aggregate([summary(4, [1000.0, 1200.0]), summary(4, [1100.0]), summary(2, [])])
    assert [(r["k"], r["clips"]) for r in rows] == [(2, 1), (4, 2)]
    assert rows[1]["ear-to-voice"] == "1000 / 1200"
    assert rows[0]["ear-to-voice"] == "—"
    table = markdown(rows)
    assert "| en->es | m | 4 | 2 |" in table


def test_manifest_paths_are_relative_to_it(tmp_path):
    with wave.open(str(tmp_path / "a.wav"), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(16000), w.writeframes(b"\x00\x00" * 160)
    manifest = tmp_path / "clips.jsonl"
    manifest.write_text(json.dumps({"audio": "a.wav", "source": "en", "target": "es"}) + "\n\n")
    assert load_manifest(str(manifest))[0]["audio"] == str(tmp_path / "a.wav")
    manifest.write_text(json.dumps({"audio": "a.wav"}) + "\n")
    with pytest.raises(SystemExit):
        load_manifest(str(manifest))


def test_clips_become_20ms_16k_frames_with_a_silent_tail():
    pytest.importorskip("livekit")
    from bench import FRAME_SAMPLES, TAIL_S, to_16k_frames

    one_second_48k_stereo = b"\x01\x00" * 48000 * 2
    frames = to_16k_frames(one_second_48k_stereo, 48000, 2)
    assert all(len(f) == FRAME_SAMPLES * 2 for f in frames)
    assert len(frames) == pytest.approx((1 + TAIL_S) * 16000 / FRAME_SAMPLES, abs=3)
