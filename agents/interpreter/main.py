"""Interpreter agent.

Joins each interpreter room the web app dispatches it to and:

* Phase 2: captions the learner's `mic` live (Silero VAD -> Deepgram
  streaming), sending interim and final captions on `interpreter.captions`;
* Phase 1 diagnostics: republishes `mic` and `probe` as `echo-mic` and
  `echo-probe`, answers data-channel pings, and plays a test tone on request
  so the client can check echo cancellation.

Later phases add simultaneous MT -> TTS on the same room, tracks and topics.
See docs/REALTIME-TRANSLATION.md.

Run:  python main.py dev     (local, auto-reload)
      python main.py start   (production)
"""

from __future__ import annotations

import asyncio
import logging
import os

from livekit import rtc
from livekit.agents import AgentServer, AutoSubscribe, JobContext, JobProcess, cli
from livekit.plugins import silero

from asr import DEEPGRAM_URL
from captioner import Captioner
from protocol import (
    ATTR_CAPTIONS,
    ATTR_CAPTIONS_DETAIL,
    CAPTIONS_TOPIC,
    CONTROL_TOPIC,
    ECHOED_TRACKS,
    TRACK_MIC,
    TRACK_TONE,
    Ping,
    ToneRequest,
    decode_control,
    encode_message,
    encode_pong,
    encode_tone_started,
    source_language,
)
from tone import FRAME_MS, SAMPLE_RATE, SAMPLES_PER_FRAME, tone_frames

AGENT_NAME = os.environ.get("INTERPRETER_AGENT_NAME", "interpreter")
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")
# Override for self-hosted Deepgram, or tests/fake_deepgram.py locally.
DEEPGRAM_BASE_URL = os.environ.get("DEEPGRAM_URL", DEEPGRAM_URL)

# Latency at the agent is bounded on both sides of the echo. Input and output
# run at the same real-time rate, so any backlog a stall creates would never
# drain; instead the inbound queue drops its oldest frames once it holds
# STREAM_CAPACITY_FRAMES, and the outbound source holds at most
# ECHO_QUEUE_MS. Measured on localhost: 100 ms -> ~160 ms round trip,
# 20 ms -> ~150 ms. A little headroom is kept for scheduling jitter.
ECHO_QUEUE_MS = 40
STREAM_CAPACITY_FRAMES = 5

logger = logging.getLogger("interpreter")

def prewarm(proc: JobProcess) -> None:
    # Loading the ONNX model takes ~0.5 s; do it once per worker process
    # rather than on every session's critical path.
    proc.userdata["vad"] = silero.VAD.load()


server = AgentServer(setup_fnc=prewarm)


class InterpreterSession:
    def __init__(self, ctx: JobContext) -> None:
        self.ctx = ctx
        self.room = ctx.room
        self.echoes: dict[str, asyncio.Task[None]] = {}
        self.tone_source = rtc.AudioSource(SAMPLE_RATE, 1, queue_size_ms=ECHO_QUEUE_MS)
        self.tone_task: asyncio.Task[None] | None = None
        self.background: set[asyncio.Task[None]] = set()
        self.captions: dict[str, asyncio.Task[None]] = {}

    async def start(self) -> None:
        tone_track = rtc.LocalAudioTrack.create_audio_track(TRACK_TONE, self.tone_source)
        await self.room.local_participant.publish_track(tone_track, publish_options())
        if not DEEPGRAM_API_KEY:
            await self.set_captions_status(
                "unavailable", "Speech recognition is not configured on the agent (DEEPGRAM_API_KEY)."
            )

        self.room.on("track_subscribed", self.on_track_subscribed)
        self.room.on("track_unsubscribed", self.on_track_unsubscribed)
        self.room.on("data_received", self.on_data)
        self.room.on("participant_disconnected", self.on_participant_disconnected)

        # Tracks the learner published before we connected.
        for participant in self.room.remote_participants.values():
            for publication in participant.track_publications.values():
                if publication.track is not None:
                    self.on_track_subscribed(publication.track, publication, participant)

    # ---------------------------------------------------------------- echo

    def on_track_subscribed(
        self,
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        if publication.name == TRACK_MIC and DEEPGRAM_API_KEY and publication.sid not in self.captions:
            self.captions[publication.sid] = asyncio.create_task(self.caption(track, participant))
        out_name = ECHOED_TRACKS.get(publication.name)
        if out_name is None or publication.sid in self.echoes:
            return
        logger.info("echoing %s from %s as %s", publication.name, participant.identity, out_name)
        self.echoes[publication.sid] = asyncio.create_task(self.echo(track, out_name))

    def on_track_unsubscribed(
        self,
        _track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        _participant: rtc.RemoteParticipant,
    ) -> None:
        for tasks in (self.echoes, self.captions):
            task = tasks.pop(publication.sid, None)
            if task:
                task.cancel()

    async def echo(self, track: rtc.Track, out_name: str) -> None:
        source = rtc.AudioSource(SAMPLE_RATE, 1, queue_size_ms=ECHO_QUEUE_MS)
        out = rtc.LocalAudioTrack.create_audio_track(out_name, source)
        publication = await self.room.local_participant.publish_track(out, publish_options())
        stream = rtc.AudioStream(
            track,
            sample_rate=SAMPLE_RATE,
            num_channels=1,
            frame_size_ms=FRAME_MS,
            capacity=STREAM_CAPACITY_FRAMES,
        )
        try:
            async for event in stream:
                await source.capture_frame(event.frame)
        finally:
            await stream.aclose()
            await source.aclose()
            if self.room.isconnected():
                try:
                    await self.room.local_participant.unpublish_track(publication.sid)
                except Exception:  # the SDK raises a private error type
                    # The room is closing under us; the server drops the
                    # track with the connection anyway.
                    logger.debug("unpublish of %s skipped during teardown", out_name)

    # ------------------------------------------------------------- captions

    async def caption(self, track: rtc.Track, participant: rtc.RemoteParticipant) -> None:
        language = source_language(participant.metadata)
        logger.info("captioning %s in %s", participant.identity, language)
        identity = participant.identity

        async def publish(message: dict) -> None:
            # Reliable: finals must arrive, and in order.
            await self.room.local_participant.publish_data(
                encode_message(message),
                reliable=True,
                destination_identities=[identity],
                topic=CAPTIONS_TOPIC,
            )

        captioner = Captioner(
            vad=self.ctx.proc.userdata["vad"],
            api_key=DEEPGRAM_API_KEY,
            base_url=DEEPGRAM_BASE_URL,
            language=language,
            publish=publish,
            set_status=self.set_captions_status,
        )
        try:
            await captioner.run(track)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("captioning failed")
            await self.set_captions_status("error", "Captioning stopped unexpectedly.")

    async def set_captions_status(self, status: str, detail: str) -> None:
        if self.room.isconnected():
            await self.room.local_participant.set_attributes(
                {ATTR_CAPTIONS: status, ATTR_CAPTIONS_DETAIL: detail}
            )

    # -------------------------------------------------------------- control

    def on_data(self, packet: rtc.DataPacket) -> None:
        if packet.topic != CONTROL_TOPIC or packet.participant is None:
            return
        message = decode_control(packet.data)
        sender = packet.participant.identity

        if isinstance(message, Ping):
            # Lossy, like the ping: a retransmitted pong would time the retry.
            self.spawn(self.reply(encode_pong(message), sender, reliable=False))
        elif isinstance(message, ToneRequest):
            if self.tone_task and not self.tone_task.done():
                self.tone_task.cancel()
            self.tone_task = asyncio.create_task(self.play_tone(message))
            self.spawn(self.reply(encode_tone_started(message), sender, reliable=True))

    async def reply(self, payload: bytes, identity: str, *, reliable: bool) -> None:
        await self.room.local_participant.publish_data(
            payload, reliable=reliable, destination_identities=[identity], topic=CONTROL_TOPIC
        )

    async def play_tone(self, request: ToneRequest) -> None:
        for pcm in tone_frames(request.duration_ms):
            frame = rtc.AudioFrame(pcm, SAMPLE_RATE, 1, SAMPLES_PER_FRAME)
            # capture_frame paces generation to real time once the queue fills.
            await self.tone_source.capture_frame(frame)

    def spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self.background.add(task)
        task.add_done_callback(self.background.discard)

    # ------------------------------------------------------------ lifecycle

    def on_participant_disconnected(self, participant: rtc.RemoteParticipant) -> None:
        # One learner per room: when they leave, the session is over. Ending the
        # job promptly frees this worker slot instead of waiting for the room's
        # empty timeout.
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            self.ctx.shutdown(reason="learner left")

    async def close(self) -> None:
        tasks = [*self.echoes.values(), *self.captions.values(), *self.background]
        if self.tone_task:
            tasks.append(self.tone_task)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.tone_source.aclose()


def publish_options() -> rtc.TrackPublishOptions:
    # DTX off so silence is sent as frames too: the client times onsets on
    # these tracks, and DTX would make them depend on the encoder waking up.
    return rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE, dtx=False)


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    session = InterpreterSession(ctx)
    ctx.add_shutdown_callback(session.close)
    await session.start()
    logger.info("interpreter ready in room %s", ctx.room.name)


if __name__ == "__main__":
    cli.run_app(server)
