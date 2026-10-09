"""Phase 4: TTS request/response handling, playout ordering, adaptive rate, and
the Speaker end to end against tests/fake_cartesia.py."""

import asyncio
import base64
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from speech import (  # noqa: E402
    BYTES_PER_SECOND,
    FAST_SPEED,
    FRAME_BYTES,
    NORMAL_SPEED,
    PlayoutBuffer,
    piece_text,
    speed_for_backlog,
)
from tts import (  # noqa: E402
    TtsAudio,
    TtsDone,
    TtsError,
    generation_request,
    parse_tts,
)

# ------------------------------------------------------------------ tts.py


def test_generation_request_shape():
    req = generation_request(
        context_id="s-3", transcript=" el equipo", more=True, voice_id="v1",
        model="sonic-3.6", language="es", speed=2.0, buffer_ms=300,
    )
    assert req["context_id"] == "s-3"
    assert req["continue"] is True
    assert req["voice"] == {"id": "v1"}
    assert req["output_format"] == {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000}
    assert req["generation_config"] == {"speed": 1.5}  # clamped to the API's range
    assert req["max_buffer_delay_ms"] == 300
    assert "locale" not in req  # language and locale are mutually exclusive


def test_parse_tts_messages():
    pcm = b"\x01\x00\x02\x00"
    chunk = json.dumps({"type": "chunk", "data": base64.b64encode(pcm).decode(), "context_id": "c"})
    assert parse_tts(chunk) == TtsAudio("c", pcm)
    assert parse_tts('{"type":"done","context_id":"c","done":true}') == TtsDone("c")
    assert parse_tts('{"type":"error","status_code":401,"message":"bad key"}') == TtsError(None, "bad key", auth=True)
    assert parse_tts('{"type":"error","status_code":400,"title":"Bad","context_id":"c"}') == TtsError("c", "Bad", auth=False)
    for raw in ("", "nope", "[]", '{"type":"timestamps","context_id":"c"}', '{"type":"chunk","data":"%%%","context_id":"c"}'):
        assert parse_tts(raw) is None


# ---------------------------------------------------------------- speech.py


def test_pieces_join_into_valid_text():
    assert piece_text("Ayer el", first=True, language="es") == "Ayer el"
    assert piece_text("equipo", first=False, language="es") == " equipo"
    assert piece_text("今日は", first=False, language="ja") == "今日は"
    assert piece_text("", first=False, language="es") == ""


def test_adaptive_speed_has_hysteresis():
    assert speed_for_backlog(2.0, NORMAL_SPEED) == FAST_SPEED
    assert speed_for_backlog(1.0, FAST_SPEED) == FAST_SPEED  # stays fast until drained
    assert speed_for_backlog(1.0, NORMAL_SPEED) == NORMAL_SPEED
    assert speed_for_backlog(0.2, FAST_SPEED) == NORMAL_SPEED


def test_playout_is_in_sentence_order_and_waits_on_underrun():
    p = PlayoutBuffer()
    p.open(0)
    p.open(1)
    p.add(1, b"\x01" * FRAME_BYTES * 2)  # sentence 1 is ready first...
    assert p.read(FRAME_BYTES) is None  # ...but sentence 0 hasn't arrived: wait
    p.add(0, b"\x00" * FRAME_BYTES)
    assert p.read(FRAME_BYTES) == (0, b"\x00" * FRAME_BYTES)
    assert p.read(FRAME_BYTES) is None  # sentence 0 not finished yet
    p.finish(0)
    assert p.read(FRAME_BYTES)[0] == 1
    assert p.backlog_seconds() == pytest.approx(FRAME_BYTES / BYTES_PER_SECOND)


def test_a_sentence_tail_is_padded_to_a_whole_frame():
    p = PlayoutBuffer()
    p.open(0)
    p.add(0, b"\x05" * 10)
    p.finish(0)
    sentence, chunk = p.read(FRAME_BYTES)
    assert sentence == 0 and len(chunk) == FRAME_BYTES and chunk[:10] == b"\x05" * 10
    assert p.read(FRAME_BYTES) is None and p.idle()


# ------------------------------------------------------------ Speaker e2e

aiohttp = pytest.importorskip("aiohttp")
from aiohttp import web  # noqa: E402

import fake_cartesia  # noqa: E402
from speech import Speaker  # noqa: E402
from tts import CartesiaStream, TtsConnectError  # noqa: E402


async def _serve(delay_ms=0):
    app = fake_cartesia.make_app(delay_ms)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    return app, runner, f"ws://127.0.0.1:{port}/tts/websocket"


def _speaker(session, url, key, played, published, statuses):
    async def connect():
        stream = CartesiaStream(session, key, url)
        await stream.connect()
        return stream

    async def sink(pcm):
        played.append(pcm)
        await asyncio.sleep(0.0005)  # a much-faster-than-real-time "track"

    async def publish(message):
        published.append(message)

    async def set_status(status, detail):
        statuses.append((status, detail))

    return Speaker(
        connect=connect, sink=sink, publish=publish, set_status=set_status,
        voice_id="fake-voice", model="sonic-3.6", language="es",
    )


def test_speaks_committed_pieces_per_sentence_in_order():
    async def scenario():
        app, runner, url = await _serve()
        played, published, statuses = [], [], []
        try:
            async with aiohttp.ClientSession() as session:
                speaker = _speaker(session, url, fake_cartesia.API_KEY, played, published, statuses)
                task = asyncio.create_task(speaker.run())
                loop = asyncio.get_running_loop()
                started = loop.time()
                # Sentence 0 arrives in pieces; sentence 1 is said in one go.
                speaker.on_commit(0, "Ayer el equipo", False, started)
                speaker.on_commit(0, "cerró el trato.", True, started)
                speaker.on_commit(1, "Gracias.", True, started)
                speaker.on_commit(1, "ignored after final", True, started)
                await asyncio.sleep(1.0)
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        finally:
            await runner.cleanup()
        return app[fake_cartesia.REQUESTS], played, published, statuses

    requests, played, published, statuses = asyncio.run(scenario())
    assert [(r["context_id"], r["transcript"], r["continue"]) for r in requests] == [
        ("s-0", "Ayer el equipo", True),
        ("s-0", " cerró el trato.", False),
        ("s-1", "Gracias.", False),
    ]
    # 3 + 3 + 1 words at 250 ms, all of it played, in whole frames.
    assert len(played) * FRAME_BYTES == pytest.approx(7 * 0.25 * BYTES_PER_SECOND, rel=0.02)
    assert [m["sentence"] for m in published] == [0, 1]
    assert all(m["type"] == "voice" and m["lagMs"] >= 0 for m in published)
    assert statuses[0] == ("live", "")


def test_a_sentence_ended_with_nothing_new_closes_its_context_cleanly():
    async def scenario():
        app, runner, url = await _serve()
        try:
            async with aiohttp.ClientSession() as session:
                speaker = _speaker(session, url, fake_cartesia.API_KEY, [], [], [])
                task = asyncio.create_task(speaker.run())
                speaker.on_commit(0, "Hola a todos.", False, None)
                speaker.on_commit(0, "", True, None)
                speaker.on_commit(1, "", True, None)  # never said anything: no context
                await asyncio.sleep(0.5)
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        finally:
            await runner.cleanup()
        return app[fake_cartesia.REQUESTS]

    requests = asyncio.run(scenario())
    assert [(r["context_id"], r["transcript"], r["continue"]) for r in requests] == [
        ("s-0", "Hola a todos.", True),
        ("s-0", "", False),  # what Cartesia's SDK sends for no_more_inputs()
    ]


def test_a_bad_key_stops_speech_with_a_clear_status():
    async def scenario():
        _, runner, url = await _serve()
        statuses = []
        try:
            async with aiohttp.ClientSession() as session:
                speaker = _speaker(session, url, "wrong", [], [], statuses)
                with pytest.raises(TtsConnectError):
                    await asyncio.wait_for(speaker.run(), 3)
        finally:
            await runner.cleanup()
        return statuses

    assert asyncio.run(scenario())[-1] == ("error", "The speech service rejected the agent's API key.")


def test_reports_what_it_plays_and_keeps_echo_check_sentences_off_the_voice_topic():
    async def scenario():
        _, runner, url = await _serve()
        played, published = [], []
        try:
            async with aiohttp.ClientSession() as session:
                speaker = _speaker(session, url, fake_cartesia.API_KEY, [], published, [])
                speaker.on_playing = lambda sentence, text: played.append((sentence, text))
                task = asyncio.create_task(speaker.run())
                speaker.on_commit(0, "Ayer el equipo", False, None)
                speaker.on_commit(0, "cerró el trato.", True, None)
                speaker.say(-1, "Buenos días a todos.")
                await asyncio.sleep(1.0)
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        finally:
            await runner.cleanup()
        return played, published

    played, published = asyncio.run(scenario())
    texts = {sentence: text for sentence, text in played}
    # The full text queued for the sentence, joined as it is spoken.
    assert texts == {0: "Ayer el equipo cerró el trato.", -1: "Buenos días a todos."}
    assert [m["sentence"] for m in published] == [0]
