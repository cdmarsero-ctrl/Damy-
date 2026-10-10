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


def test_listen_url_opts_out_of_model_improvement():
    q = parse_qs(urlparse(listen_url("wss://x/v1/listen", "en")).query)
    assert q["mip_opt_out"] == ["true"]


def test_replay_buffer_keeps_only_unfinalised_audio():
    from captions import ReplayBuffer

    buf: ReplayBuffer[str] = ReplayBuffer(sample_rate=10, max_seconds=3)
    for name in "abcde":  # five 1 s chunks; only the last 3 s are kept
        buf.sent(name, 10)
    buf.finalized(3.0)  # finals cover up to the end of "c"
    assert buf.take() == ["d", "e"]
    assert buf.take() == []
    buf.sent("f", 10)  # offsets restart on the new connection
    buf.finalized(0.5)  # partway into "f": not covered yet
    assert buf.take() == ["f"]


def test_a_dropped_connection_replays_the_unfinalised_audio():
    """The first connection dies after 1 s of an utterance, before any final:
    the captioner reconnects and sends that second again, then the rest, so no
    words are lost and the captions carry on."""
    from captioner import Captioner, Chunk

    async def scenario():
        app = fake_deepgram.make_app(drop_after_ms=1000)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        base = f"ws://127.0.0.1:{site._server.sockets[0].getsockname()[1]}/v1/listen"
        published, statuses = [], []

        async def publish(message):
            published.append(message)

        async def set_status(status, detail):
            statuses.append(status)

        captioner = Captioner(
            vad=None, api_key=fake_deepgram.API_KEY, base_url=base, language="en",
            publish=publish, set_status=set_status,
        )
        captioner._gate.open = True  # mid-utterance, as the VAD would have it
        loop = asyncio.get_running_loop()
        frame = b"\x00\x00" * 320  # 20 ms
        try:
            async with aiohttp.ClientSession() as session:
                task = asyncio.create_task(captioner._asr_loop(session))
                for _ in range(100):  # 2 s, in real time
                    captioner._enqueue(Chunk(frame, 320, loop.time()))
                    await asyncio.sleep(0.02)
                await asyncio.sleep(1.5)  # the 0.5 s reconnect backoff, then catch-up
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        finally:
            await runner.cleanup()
        return app[fake_deepgram.RECEIVED], published, statuses, captioner.audio_seconds

    received, published, statuses, audio_seconds = asyncio.run(scenario())
    second = 16_000 * 2
    assert len(received) == 2
    assert received[0] >= second  # cut after 1 s
    # The second connection got the lost second again, then everything after it.
    assert received[1] >= 2 * second - 640
    assert statuses.count("live") == 2
    texts = [m["text"] for m in published if m.get("type") == "caption"]
    assert any(t.startswith("word1") for t in texts[-3:])  # recognition carried on
    assert audio_seconds >= 3.0 - 0.05  # the replay is billed too
