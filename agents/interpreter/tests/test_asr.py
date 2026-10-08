"""DeepgramStream against tests/fake_deepgram.py: the wire protocol, not
recognition quality. Needs aiohttp (a livekit-agents dependency)."""

import asyncio
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

aiohttp = pytest.importorskip("aiohttp")
from aiohttp import web  # noqa: E402

import fake_deepgram  # noqa: E402
from asr import DeepgramError, DeepgramStream, listen_url  # noqa: E402
from captions import AsrResult, UtteranceEnd, parse_deepgram  # noqa: E402


def test_listen_url_carries_the_streaming_parameters():
    url = listen_url("wss://api.deepgram.com/v1/listen", "es")
    parsed = urlparse(url)
    q = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    assert parsed.netloc == "api.deepgram.com"
    assert q["model"] == "nova-3"
    assert q["language"] == "es"
    assert q["encoding"] == "linear16"
    assert q["sample_rate"] == "16000"
    assert q["interim_results"] == "true"
    assert q["utterance_end_ms"] == "1000"


async def _serve():
    app = fake_deepgram.make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    return app, runner, f"ws://127.0.0.1:{port}/v1/listen"


def test_streams_audio_and_receives_interim_final_and_utterance_end():
    async def scenario():
        app, runner, base = await _serve()
        try:
            async with aiohttp.ClientSession() as session:
                stream = DeepgramStream(session, fake_deepgram.API_KEY, listen_url(base, "en"))
                await stream.connect()

                async def collect():
                    return [parse_deepgram(m) async for m in stream.messages()]

                reader = asyncio.create_task(collect())
                one_second = b"\x00\x00" * 16_000
                await stream.send_audio(one_second)
                await stream.send_audio(one_second)
                await stream.keepalive()
                await stream.finalize()
                await stream.finish()
                events = await asyncio.wait_for(reader, 5)
                assert stream.closed
        finally:
            await runner.cleanup()
        return app, [e for e in events if e is not None]

    app, events = asyncio.run(scenario())
    results = [e for e in events if isinstance(e, AsrResult)]
    assert any(not r.is_final and r.transcript for r in results)
    assert any(r.is_final and r.transcript for r in results)
    assert results[-1].is_final and results[-1].speech_final
    assert isinstance(events[-1], UtteranceEnd)
    assert app[fake_deepgram.CONTROLS] == ["KeepAlive", "Finalize", "CloseStream"]
    assert app[fake_deepgram.CONNECTIONS][0]["language"] == ["en"]


def test_auth_failure_is_reported_as_permanent():
    async def scenario():
        _, runner, base = await _serve()
        try:
            async with aiohttp.ClientSession() as session:
                stream = DeepgramStream(session, "wrong-key", listen_url(base, "en"))
                with pytest.raises(DeepgramError) as err:
                    await stream.connect()
                return err.value
        finally:
            await runner.cleanup()

    assert asyncio.run(scenario()).auth is True


def test_unreachable_server_is_a_retryable_error():
    async def scenario():
        async with aiohttp.ClientSession() as session:
            stream = DeepgramStream(session, "k", "ws://127.0.0.1:9/v1/listen")
            with pytest.raises(DeepgramError) as err:
                await stream.connect()
            return err.value

    assert asyncio.run(scenario()).auth is False
