"""Phase 2: live captions of the learner's speech.

    mic track (16 kHz) -> Silero VAD -> speech gate -> Deepgram streaming
                                                         |
    data channel ("interpreter.captions") <- CaptionTracker <-+

One Captioner per learner microphone. Status is published as agent
participant attributes so the client always knows whether captions are live.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterable, Awaitable, Callable, Sequence
from dataclasses import dataclass

import aiohttp
from livekit import rtc
from livekit.agents import vad as agents_vad

from asr import SAMPLE_RATE, DeepgramError, DeepgramStream, listen_url
from captions import ArrivalClock, AsrResult, CaptionTracker, ReplayBuffer, UtteranceEnd, parse_deepgram
from echo_guard import EchoGuard
from gate import SpeechGate

logger = logging.getLogger("interpreter.captions")

FRAME_MS = 20
# Enough to cover the VAD's decision delay plus the soft onset of a word.
PREROLL_MS = 500
# Deepgram closes a stream after ~10 s with neither audio nor a KeepAlive.
KEEPALIVE_S = 5.0
# Audio held while (re)connecting. Older audio is dropped: captions for speech
# from many seconds ago would arrive too late to be useful.
MAX_QUEUED_S = 5.0
# Bounded inbound queue, for the same reason as the echo path in main.py.
STREAM_CAPACITY_FRAMES = 25
RECONNECT_DELAYS_S = (0.5, 1, 2, 4, 8)
# Unfinalised audio replayed after a reconnect (Phase 6), at most this much.
MAX_REPLAY_S = 10.0
STABLE_STREAM_S = 10.0

Publish = Callable[[dict], Awaitable[None]]
SetStatus = Callable[[str, str], Awaitable[None]]
#: Sees every raw recognition result, with each word's arrival time, before
#: the echo guard (the Phase 0 benchmark logs per-word timings with it).
OnResult = Callable[[AsrResult, "list[float | None]"], None]


@dataclass(frozen=True)
class Chunk:
    pcm: bytes
    samples: int
    arrived_at: float


_FINALIZE = object()


class Captioner:
    def __init__(
        self,
        *,
        vad: agents_vad.VAD,
        api_key: str,
        base_url: str,
        language: str,
        publish: Publish,
        set_status: SetStatus,
        echo_guard: EchoGuard | None = None,
        set_echo_status: SetStatus | None = None,
        on_result: OnResult | None = None,
    ) -> None:
        self._vad = vad
        self._api_key = api_key
        self._url = listen_url(base_url, language)
        self._publish = publish
        self._set_status = set_status
        self._gate: SpeechGate[Chunk] = SpeechGate(PREROLL_MS // FRAME_MS)
        self._queue: asyncio.Queue[Chunk | object] = asyncio.Queue()
        self._max_queued = int(MAX_QUEUED_S * 1000 / FRAME_MS)
        self._clock = ArrivalClock(SAMPLE_RATE)
        self._replay: ReplayBuffer[Chunk] = ReplayBuffer(SAMPLE_RATE, MAX_REPLAY_S)
        # Metering: seconds of audio sent for recognition (the billing unit).
        self.audio_seconds = 0.0
        self._tracker = CaptionTracker()
        self._guard = echo_guard
        self._on_result = on_result
        self._set_echo_status = set_echo_status
        # The session publishes "clean" when it starts the guard.
        self._echo_status = "clean"

    async def run(self, track: rtc.Track) -> None:
        audio = rtc.AudioStream(
            track,
            sample_rate=SAMPLE_RATE,
            num_channels=1,
            frame_size_ms=FRAME_MS,
            capacity=STREAM_CAPACITY_FRAMES,
        )

        async def frames():
            async for event in audio:
                yield event.frame

        try:
            await self.run_frames(frames())
        finally:
            await audio.aclose()

    async def run_frames(self, frames: AsyncIterable[rtc.AudioFrame]) -> None:
        """Captions 16 kHz mono frames from any source: a LiveKit track
        (`run`), or a recording replayed in real time (bench.py)."""
        await self._set_status("starting", "")
        vad_stream = self._vad.stream()
        tasks = [
            asyncio.create_task(self._read_audio(frames, vad_stream), name="captions-audio"),
            asyncio.create_task(self._read_vad(vad_stream), name="captions-vad"),
        ]
        try:
            async with aiohttp.ClientSession(trust_env=True) as session:
                await self._asr_loop(session)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await vad_stream.aclose()

    # --------------------------------------------------------------- input

    async def _read_audio(self, frames: AsyncIterable[rtc.AudioFrame], vad_stream: agents_vad.VADStream) -> None:
        async for frame in frames:
            vad_stream.push_frame(frame)
            chunk = Chunk(bytes(frame.data), frame.samples_per_channel, time.monotonic())
            for item in self._gate.push(chunk):
                self._enqueue(item)

    async def _read_vad(self, vad_stream: agents_vad.VADStream) -> None:
        async for event in vad_stream:
            if event.type == agents_vad.VADEventType.START_OF_SPEECH:
                for item in self._gate.start():
                    self._enqueue(item)
            elif event.type == agents_vad.VADEventType.END_OF_SPEECH:
                if self._gate.stop():
                    # Don't wait for Deepgram's endpointing: the VAD already
                    # knows the learner stopped, so ask for the final now.
                    self._enqueue(_FINALIZE)

    def _enqueue(self, item: Chunk | object) -> None:
        if self._queue.qsize() >= self._max_queued:
            self._queue.get_nowait()
        self._queue.put_nowait(item)

    # ----------------------------------------------------------------- ASR

    async def _asr_loop(self, session: aiohttp.ClientSession) -> None:
        failures = 0
        while True:
            stream = DeepgramStream(session, self._api_key, self._url)
            try:
                await stream.connect()
            except DeepgramError as err:
                if err.auth:
                    logger.error("deepgram rejected the API key")
                    await self._set_status("error", "The speech-recognition service rejected the agent's API key.")
                    return
                delay = RECONNECT_DELAYS_S[min(failures, len(RECONNECT_DELAYS_S) - 1)]
                failures += 1
                logger.warning("deepgram connect failed (%s); retrying in %ss", err, delay)
                await self._set_status("error", "Can't reach the speech-recognition service; retrying.")
                await asyncio.sleep(delay)
                continue

            connected_at = time.monotonic()
            self._clock.reset()
            replay = self._replay.take()
            if replay:
                logger.info("replaying %.1f s of unfinalised audio", sum(c.samples for c in replay) / SAMPLE_RATE)
            await self._set_status("live", "")
            sender = asyncio.create_task(self._send(stream, replay), name="captions-send")
            try:
                async for raw in stream.messages():
                    await self._on_message(raw)
                logger.info("deepgram stream ended; reconnecting")
            except DeepgramError as err:
                logger.warning("deepgram stream failed (%s); reconnecting", err)
            finally:
                sender.cancel()
                await asyncio.gather(sender, return_exceptions=True)
                await stream.close()

            if (message := self._tracker.on_reconnect()) is not None:
                await self._publish(message)
            await self._set_status("starting", "Reconnecting to speech recognition…")
            # A stream that survived a while earns an immediate retry; one that
            # dies straight after connecting backs off like a failed connect.
            if time.monotonic() - connected_at > STABLE_STREAM_S:
                failures = 0
            else:
                await asyncio.sleep(RECONNECT_DELAYS_S[min(failures, len(RECONNECT_DELAYS_S) - 1)])
                failures += 1

    async def _send(self, stream: DeepgramStream, replay: Sequence[Chunk] = ()) -> None:
        for chunk in replay:
            await self._send_chunk(stream, chunk)
        if replay and not self._gate.open:
            # The utterance ended while we were reconnecting: its Finalize
            # went down with the old connection.
            await stream.finalize()
        while True:
            try:
                item = await asyncio.wait_for(self._queue.get(), timeout=KEEPALIVE_S)
            except asyncio.TimeoutError:
                await stream.keepalive()
                continue
            if item is _FINALIZE:
                await stream.finalize()
            else:
                assert isinstance(item, Chunk)
                await self._send_chunk(stream, item)

    async def _send_chunk(self, stream: DeepgramStream, chunk: Chunk) -> None:
        # Arrival time, not send time: replayed audio keeps its original
        # arrival, so caption latency stays honest after a reconnect.
        self._clock.record(chunk.samples, chunk.arrived_at)
        await stream.send_audio(chunk.pcm)
        self._replay.sent(chunk, chunk.samples)
        self.audio_seconds += chunk.samples / SAMPLE_RATE

    async def _on_message(self, raw: str) -> None:
        event = parse_deepgram(raw)
        if isinstance(event, AsrResult):
            if event.is_final:
                end = event.end if event.end is not None else event.audio_end
                if end is not None:
                    self._replay.finalized(end)
            if self._on_result is not None or self._guard is not None:
                arrivals = [self._clock.arrival_of(w.end) for w in event.words]
                if self._on_result is not None:
                    self._on_result(event, arrivals)
                if self._guard is not None:
                    event = self._guard.filter(event, arrivals)
                    await self._report_echo()
            latency_ms = None
            if event.audio_end is not None:
                arrived = self._clock.arrival_of(event.audio_end)
                if arrived is not None:
                    latency_ms = (time.monotonic() - arrived) * 1000
            message = self._tracker.on_result(event, latency_ms)
        elif isinstance(event, UtteranceEnd):
            message = self._tracker.on_utterance_end()
        else:
            message = None
        if message is not None:
            await self._publish(message)

    async def _report_echo(self) -> None:
        status = "leaking" if self._guard.leaking() else "clean"
        if status == self._echo_status or self._set_echo_status is None:
            return
        self._echo_status = status
        detail = (
            "The agent keeps hearing its own voice through your microphone and is removing it. "
            "Headphones stop it at the source."
            if status == "leaking"
            else ""
        )
        await self._set_echo_status(status, detail)
