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
)
from tone import SAMPLES_PER_FRAME, TONE_DBFS, tone_frames  # noqa: E402

REPO = Path(__file__).resolve().parents[3]


def test_names_match_the_typescript_side():
    ts = (REPO / "src/lib/interpreter/protocol.ts").read_text()
    assert f'CONTROL_TOPIC = "{protocol.CONTROL_TOPIC}"' in ts
    for name in ("mic", "probe", "echo-mic", "echo-probe", "tone"):
        assert f'"{name}"' in ts
    assert protocol.ECHOED_TRACKS == {"mic": "echo-mic", "probe": "echo-probe"}
    assert f'CAPTIONS_TOPIC = "{protocol.CAPTIONS_TOPIC}"' in ts
    for attr in (protocol.ATTR_CAPTIONS, protocol.ATTR_CAPTIONS_DETAIL):
        assert f'"{attr}"' in ts


def test_caption_languages_match_the_web_app():
    ts = (REPO / "src/lib/interpreter/protocol.ts").read_text()
    listed = ts.split("CAPTION_LANGUAGES = [", 1)[1].split("]", 1)[0]
    codes = [line.split('code: "', 1)[1].split('"', 1)[0] for line in listed.splitlines() if 'code: "' in line]
    assert tuple(codes) == CAPTION_LANGUAGES


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
