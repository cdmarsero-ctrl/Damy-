"""Interpreter agent, Phase 1: WebRTC loopback.

Joins each interpreter room the web app dispatches it to and:

* republishes the learner's `mic` and `probe` tracks as `echo-mic` and
  `echo-probe`, frame by frame, with no added buffering;
* answers data-channel pings so the client can time the signalling path;
* plays a test tone on its `tone` track on request, so the client can check
  that echo cancellation removes audio played back from this agent.

Later phases replace the echo with ASR -> simultaneous MT -> TTS, keeping the
same room, tracks and control topic. See docs/REALTIME-TRANSLATION.md.

Run:  python main.py dev     (local, auto-reload)
      python main.py start   (production)
"""

from __future__ import annotations

import asyncio
import logging
import os

from livekit import rtc
from livekit.agents import AgentServer, AutoSubscribe, JobContext, cli

from protocol import (
    CONTROL_TOPIC,
    ECHOED_TRACKS,
    TRACK_TONE,
    Ping,
    ToneRequest,
    decode_control,
    encode_pong,
    encode_tone_started,
)
from tone import FRAME_MS, SAMPLE_RATE, SAMPLES_PER_FRAME, tone_frames

AGENT_NAME = os.environ.get("INTERPRETER_AGENT_NAME", "interpreter")

# Latency at the agent is bounded on both sides of the echo. Input and output
# run at the same real-time rate, so any backlog a stall creates would never
# drain; instead the inbound queue drops its oldest frames once it holds
# STREAM_CAPACITY_FRAMES, and the outbound source holds at most
# ECHO_QUEUE_MS. Measured on localhost: 100 ms -> ~160 ms round trip,
# 20 ms -> ~150 ms. A little headroom is kept for scheduling jitter.
ECHO_QUEUE_MS = 40
STREAM_CAPACITY_FRAMES = 5

logger = logging.getLogger("interpreter")

server = AgentServer()


class Loopback:
    def __init__(self, ctx: JobContext) -> None:
        self.ctx = ctx
        self.room = ctx.room
        self.echoes: dict[str, asyncio.Task[None]] = {}
        self.tone_source = rtc.AudioSource(SAMPLE_RATE, 1, queue_size_ms=ECHO_QUEUE_MS)
        self.tone_task: asyncio.Task[None] | None = None
        self.background: set[asyncio.Task[None]] = set()

    async def start(self) -> None:
        tone_track = rtc.LocalAudioTrack.create_audio_track(TRACK_TONE, self.tone_source)
        await self.room.local_participant.publish_track(tone_track, publish_options())

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
        task = self.echoes.pop(publication.sid, None)
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
        tasks = [*self.echoes.values(), *self.background]
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
    loopback = Loopback(ctx)
    ctx.add_shutdown_callback(loopback.close)
    await loopback.start()
    logger.info("loopback ready in room %s", ctx.room.name)


if __name__ == "__main__":
    cli.run_app(server)
