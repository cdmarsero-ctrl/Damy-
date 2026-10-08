import json
import sys
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import protocol  # noqa: E402
from protocol import (  # noqa: E402
    CAPTION_LANGUAGES,
    MAX_TONE_MS,
    Ping,
    ToneRequest,
    decode_control,
    encode_pong,
    source_language,
    target_language,
)
from tone import SAMPLES_PER_FRAME, TONE_DBFS, tone_frames  # noqa: E402

REPO = Path(__file__).resolve().parents[3]


def test_names_match_the_typescript_side():
    ts = (REPO / "src/lib/interpreter/protocol.ts").read_text()
    assert f'CONTROL_TOPIC = "{protocol.CONTROL_TOPIC}"' in ts
    for name in ("mic", "probe", "echo-mic", "echo-probe", "tone", protocol.TRACK_VOICE):
        assert f'"{name}"' in ts
    assert protocol.ECHOED_TRACKS == {"mic": "echo-mic", "probe": "echo-probe"}
    assert f'CAPTIONS_TOPIC = "{protocol.CAPTIONS_TOPIC}"' in ts
    assert f'TRANSLATION_TOPIC = "{protocol.TRANSLATION_TOPIC}"' in ts
    assert f'VOICE_TOPIC = "{protocol.VOICE_TOPIC}"' in ts
    for attr in (
        protocol.ATTR_CAPTIONS,
        protocol.ATTR_CAPTIONS_DETAIL,
        protocol.ATTR_TRANSLATION,
        protocol.ATTR_TRANSLATION_DETAIL,
        protocol.ATTR_VOICE,
        protocol.ATTR_VOICE_DETAIL,
    ):
        assert f'"{attr}"' in ts


def _ts_language_list(name: str) -> list[tuple[str, str]]:
    ts = (REPO / "src/lib/interpreter/protocol.ts").read_text()
    listed = ts.split(f"{name} = [", 1)[1].split("]", 1)[0]
    rows = []
    for line in listed.splitlines():
        if 'code: "' in line:
            code = line.split('code: "', 1)[1].split('"', 1)[0]
            label = line.split('label: "', 1)[1].split('"', 1)[0]
            rows.append((code, label))
    return rows


def test_translation_languages_match_the_web_app():
    assert _ts_language_list("TRANSLATION_LANGUAGES") == list(protocol.LANGUAGE_NAMES.items())


def test_target_language_is_validated():
    assert target_language('{"targetLanguage":"ja"}') == "ja"
    assert target_language('{"targetLanguage":"xx"}') is None
    assert target_language('{"sourceLanguage":"en"}') is None
    assert target_language(None) is None


def test_caption_languages_match_the_web_app():
    assert tuple(code for code, _ in _ts_language_list("CAPTION_LANGUAGES")) == CAPTION_LANGUAGES


def test_source_language_falls_back_safely():
    assert source_language('{"sourceLanguage":"es"}') == "es"
    assert source_language('{"sourceLanguage":"xx"}') == "multi"
    assert source_language('{"sourceLanguage":"en&model=other"}') == "multi"
    assert source_language("") == "multi"
    assert source_language(None) == "multi"
    assert source_language("not json") == "multi"
    assert source_language("[1]") == "multi"


def test_ping_round_trip_echoes_client_timestamp():
    ping = decode_control(b'{"type":"ping","id":7,"sentAt":1234.5}')
    assert ping == Ping(id=7, sent_at=1234.5)
    assert json.loads(encode_pong(ping)) == {"type": "pong", "id": 7, "sentAt": 1234.5}


def test_tone_request_is_capped():
    assert decode_control(b'{"type":"tone","durationMs":1500}') == ToneRequest(1500)
    assert decode_control(b'{"type":"tone","durationMs":1e9}') == ToneRequest(MAX_TONE_MS)


def test_malformed_messages_are_ignored_not_raised():
    for payload in (
        b"",
        b"\xff\xfe",
        b"not json",
        b"[1,2]",
        b'{"type":"reboot"}',
        b'{"type":"ping","id":"1","sentAt":2}',
        b'{"type":"ping","id":true,"sentAt":2}',
        b'{"type":"tone","durationMs":0}',
        b'{"type":"tone","durationMs":NaN}',
    ):
        assert decode_control(payload) is None


def test_tone_frames_are_whole_10ms_frames_at_the_right_level():
    frames = list(tone_frames(200))
    assert len(frames) == 20
    assert all(len(f) == SAMPLES_PER_FRAME * 2 for f in frames)

    middle = array("h")
    middle.frombytes(frames[10])
    if sys.byteorder == "big":
        middle.byteswap()
    peak = max(abs(s) for s in middle)
    assert abs(peak - 32767 * 10 ** (TONE_DBFS / 20)) < 50


def test_tone_starts_and_ends_softly():
    frames = list(tone_frames(100))
    first, last = array("h"), array("h")
    first.frombytes(frames[0])
    last.frombytes(frames[-1])
    if sys.byteorder == "big":
        first.byteswap()
        last.byteswap()
    assert abs(first[0]) < 10
    assert abs(last[-1]) < 10
