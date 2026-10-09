"""Interpreter agent.

Joins each interpreter room the web app dispatches it to and:

* Phase 2: captions the learner's `mic` live (Silero VAD -> Deepgram
  streaming), sending interim and final captions on `interpreter.captions`;
* Phase 3: translates those captions as they form (Claude under an
  append-only commit policy), sending committed and tentative text on
  `interpreter.translation`;
* Phase 4: speaks the committed translation on its `voice` track (Cartesia
  streaming TTS, one context per sentence, paced playout);
* Phase 1 diagnostics: republishes `mic` and `probe` as `echo-mic` and
  `echo-probe`, answers data-channel pings, and plays a test tone on request
  so the client can check echo cancellation.

* Phase 5: removes its own voice from the learner's captions when echo
  cancellation lets it through (echo_guard.py), reports when that keeps
  happening, and runs an echo check on request.

See docs/REALTIME-TRANSLATION.md.

Run:  python main.py dev     (local, auto-reload)
      python main.py start   (production)
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass

import aiohttp
import anthropic
from livekit import rtc
from livekit.rtc.participant import PublishDataError
from livekit.agents import AgentServer, AutoSubscribe, JobContext, JobProcess, cli
from livekit.plugins import silero

from asr import DEEPGRAM_URL
from captioner import Captioner
from echo_guard import CHECK_PHRASES, ECHO_DELAY_S, EchoGuard
from mt import DEFAULT_MODEL, ClaudeTranslator, TranslationError, language_label
from protocol import (
    ATTR_CAPTIONS,
    ATTR_CAPTIONS_DETAIL,
    ATTR_ECHO,
    ATTR_ECHO_DETAIL,
    ATTR_TRANSLATION,
    ATTR_TRANSLATION_DETAIL,
    ATTR_VOICE,
    ATTR_VOICE_DETAIL,
    CAPTIONS_TOPIC,
    ECHO_TOPIC,
    LANGUAGE_NAMES,
    TRANSLATION_TOPIC,
    VOICE_TOPIC,
    CONTROL_TOPIC,
    ECHOED_TRACKS,
    TRACK_MIC,
    TRACK_TONE,
    TRACK_VOICE,
    EchoCheck,
    Ping,
    ToneRequest,
    decode_control,
    encode_message,
    encode_pong,
    encode_tone_started,
    source_language,
    target_language,
)
from tone import FRAME_MS, SAMPLE_RATE, SAMPLES_PER_FRAME, tone_frames
from speech import Speaker
from translation import TranslationLoop
from tts import CARTESIA_URL, DEFAULT_MODEL as DEFAULT_TTS_MODEL, SAMPLE_RATE as TTS_SAMPLE_RATE
from tts import CartesiaStream, TtsConnectError

AGENT_NAME = os.environ.get("INTERPRETER_AGENT_NAME", "interpreter")
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")
# Override for self-hosted Deepgram, or tests/fake_deepgram.py locally.
DEEPGRAM_BASE_URL = os.environ.get("DEEPGRAM_URL", DEEPGRAM_URL)
# Translation. A deployed agent needs an explicit key; ANTHROPIC_BASE_URL
# (read by the SDK) points it at tests/fake_anthropic.py locally.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MT_MODEL = os.environ.get("INTERPRETER_MT_MODEL", DEFAULT_MODEL)
# Speech. Voice ids are per Cartesia account (or from its voice library), so
# there is no default voice.
CARTESIA_API_KEY = os.environ.get("CARTESIA_API_KEY", "")
CARTESIA_VOICE_ID = os.environ.get("CARTESIA_VOICE_ID", "")
CARTESIA_BASE_URL = os.environ.get("CARTESIA_URL", CARTESIA_URL)
TTS_MODEL = os.environ.get("INTERPRETER_TTS_MODEL", DEFAULT_TTS_MODEL)
# Server-side text buffering per context; see tts.generation_request.
TTS_BUFFER_MS = int(os.environ.get("INTERPRETER_TTS_BUFFER_MS", "300"))
# The voice track's source queue doubles as the playout jitter buffer (§5.4).
VOICE_JITTER_MS = 200
# Echo check (§6.4): how long to listen after the phrase has played (any echo
# arrives within ECHO_DELAY_S; the rest lets its final result land), and how
# long to wait for the phrase to play at all.
CHECK_TAIL_S = ECHO_DELAY_S + 1.0
CHECK_TIMEOUT_S = 20.0

# Latency at the agent is bounded on both sides of the echo. Input and output
# run at the same real-time rate, so any backlog a stall creates would never
# drain; instead the inbound queue drops its oldest frames once it holds
# STREAM_CAPACITY_FRAMES, and the outbound source holds at most
# ECHO_QUEUE_MS. Measured on localhost: 100 ms -> ~160 ms round trip,
# 20 ms -> ~150 ms. A little headroom is kept for scheduling jitter.
ECHO_QUEUE_MS = 40
STREAM_CAPACITY_FRAMES = 5

logger = logging.getLogger("interpreter")

@dataclass
class _Translation:
    loop: TranslationLoop
    task: asyncio.Task[None]
    client: anthropic.AsyncAnthropic
    speech: asyncio.Task[None] | None = None
    speaker: Speaker | None = None
    guard: EchoGuard | None = None

    async def close(self) -> None:
        for task in (self.task, self.speech):
            if task is not None:
                task.cancel()
        await asyncio.gather(*(t for t in (self.task, self.speech) if t), return_exceptions=True)
        await self.client.close()


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
        # The learner's translation pipeline, for echo checks; one per room.
        self.translation: _Translation | None = None
        self.checking = False
        self.next_check = -1
        self.ending: asyncio.Task[None] | None = None
        self.closed = False

    async def start(self) -> None:
        tone_track = rtc.LocalAudioTrack.create_audio_track(TRACK_TONE, self.tone_source)
        await self.room.local_participant.publish_track(tone_track, publish_options())
        await self.set_echo_status("off", "")
        if not DEEPGRAM_API_KEY:
            await self.set_captions_status(
                "unavailable", "Speech recognition is not configured on the agent (DEEPGRAM_API_KEY)."
            )
            await self.set_translation_status("unavailable", "Translation needs live captions, which are off.")
            await self.set_voice_status("unavailable", "Speech needs live captions, which are off.")
        elif not ANTHROPIC_API_KEY:
            await self.set_translation_status(
                "unavailable", "Translation is not configured on the agent (ANTHROPIC_API_KEY)."
            )
            await self.set_voice_status("unavailable", "Speech needs translation, which is off.")
        elif not (CARTESIA_API_KEY and CARTESIA_VOICE_ID):
            await self.set_voice_status(
                "unavailable", "Speech is not configured on the agent (CARTESIA_API_KEY, CARTESIA_VOICE_ID)."
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
            # Ending the session: the track goes with the connection, and an
            # unpublish now would start a renegotiation the disconnect waits on.
            if self.room.isconnected() and not self.closed:
                try:
                    await self.room.local_participant.unpublish_track(publication.sid)
                except Exception:  # the SDK raises a private error type
                    # The room is closing under us; the server drops the
                    # track with the connection anyway.
                    logger.debug("unpublish of %s skipped during teardown", out_name)

    # ------------------------------------------------------------- captions

    async def caption(self, track: rtc.Track, participant: rtc.RemoteParticipant) -> None:
        language = source_language(participant.metadata)
        target = target_language(participant.metadata)
        logger.info("captioning %s in %s, translating into %s", participant.identity, language, target)
        identity = participant.identity

        async def send(topic: str, message: dict) -> None:
            await self._send_to(identity, topic, message)

        translation = self.start_translation(
            language, target, lambda m: send(TRANSLATION_TOPIC, m), lambda m: send(VOICE_TOPIC, m)
        )

        async def publish(message: dict) -> None:
            await send(CAPTIONS_TOPIC, message)
            if translation is not None:
                translation.loop.on_caption(message)

        guard = translation.guard if translation is not None else None
        if guard is not None:
            self.translation = translation
            await self.set_echo_status("clean", "")
        captioner = Captioner(
            vad=self.ctx.proc.userdata["vad"],
            api_key=DEEPGRAM_API_KEY,
            base_url=DEEPGRAM_BASE_URL,
            language=language,
            publish=publish,
            set_status=self.set_captions_status,
            echo_guard=guard,
            set_echo_status=self.set_echo_status,
        )
        try:
            await captioner.run(track)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("captioning failed")
            await self.set_captions_status("error", "Captioning stopped unexpectedly.")
        finally:
            if translation is not None:
                if self.translation is translation:
                    self.translation = None
                await translation.close()

    async def set_captions_status(self, status: str, detail: str) -> None:
        await self._set_attributes({ATTR_CAPTIONS: status, ATTR_CAPTIONS_DETAIL: detail})

    # ---------------------------------------------------------- translation

    def start_translation(self, source: str, target: str | None, publish, publish_voice) -> _Translation | None:
        if not ANTHROPIC_API_KEY:
            return None  # status already published in start()
        if target is None or target == source:
            self.spawn(self.set_translation_status("unavailable", "No translation language was chosen."))
            return None
        client = anthropic.AsyncAnthropic(
            api_key=ANTHROPIC_API_KEY,
            # A late translation is a useless one: fail fast and let the next
            # caption update try again rather than queueing behind a retry.
            timeout=anthropic.Timeout(10.0, connect=3.0),
            max_retries=1,
        )
        translator = ClaudeTranslator(
            client,
            source_label=language_label(source, LANGUAGE_NAMES),
            target_label=LANGUAGE_NAMES[target],
            model=MT_MODEL,
        )
        speaker = self.make_speaker(target, publish_voice)
        guard = None
        if speaker is not None:
            guard = EchoGuard(target)
            speaker.on_playing = guard.playing
        loop = TranslationLoop(
            translate=translator.translate,
            publish=publish,
            set_status=self.set_translation_status,
            source=source,
            target=target,
            on_commit=speaker.on_commit if speaker else None,
        )
        task = asyncio.create_task(self._run_translation(loop), name="translation")
        speech = asyncio.create_task(self._run_speech(speaker), name="speech") if speaker else None
        return _Translation(loop, task, client, speech, speaker, guard)

    # --------------------------------------------------------------- speech

    def make_speaker(self, target: str, publish) -> Speaker | None:
        if not (CARTESIA_API_KEY and CARTESIA_VOICE_ID):
            return None  # status already published in start()
        self._voice_source = rtc.AudioSource(TTS_SAMPLE_RATE, 1, queue_size_ms=VOICE_JITTER_MS)
        self._tts_session = aiohttp.ClientSession(trust_env=True)

        async def connect() -> CartesiaStream:
            stream = CartesiaStream(self._tts_session, CARTESIA_API_KEY, CARTESIA_BASE_URL)
            await stream.connect()
            return stream

        async def sink(pcm: bytes) -> None:
            # capture_frame waits while the source queue is full, which paces
            # playout to real time.
            await self._voice_source.capture_frame(rtc.AudioFrame(pcm, TTS_SAMPLE_RATE, 1, len(pcm) // 2))

        return Speaker(
            connect=connect,
            sink=sink,
            publish=publish,
            set_status=self.set_voice_status,
            voice_id=CARTESIA_VOICE_ID,
            model=TTS_MODEL,
            language=target,
            buffer_ms=TTS_BUFFER_MS,
            session_tag=self.room.name,
        )

    async def _run_speech(self, speaker: Speaker) -> None:
        track = rtc.LocalAudioTrack.create_audio_track(TRACK_VOICE, self._voice_source)
        try:
            await self.room.local_participant.publish_track(track, publish_options())
            await speaker.run()
        except asyncio.CancelledError:
            raise
        except TtsConnectError:
            pass  # permanent (auth); the speaker already published the reason
        except Exception:
            logger.exception("speech failed")
            await self.set_voice_status("error", "Speech stopped unexpectedly.")
        finally:
            await self._tts_session.close()
            await self._voice_source.aclose()

    async def set_echo_status(self, status: str, detail: str) -> None:
        await self._set_attributes({ATTR_ECHO: status, ATTR_ECHO_DETAIL: detail})

    async def echo_check(self, identity: str) -> None:
        """Speaks a fixed phrase and reports how many of its words the
        learner's microphone delivered: `heardWords` is what got past the
        browser's echo cancellation, `passedWords` what also got past the
        echo guard (§6.4). The learner should stay quiet meanwhile."""
        translation = self.translation
        report: dict = {"type": "echo-report"}
        if translation is None or translation.speaker is None or translation.guard is None:
            report["error"] = "The check needs the translated voice, which is off."
        elif self.checking:
            return
        else:
            self.checking = True
            try:
                report.update(await self._run_echo_check(translation.speaker, translation.guard))
            finally:
                self.checking = False
        await self._send_to(identity, ECHO_TOPIC, report)

    async def _run_echo_check(self, speaker: Speaker, guard: EchoGuard) -> dict:
        sentence, self.next_check = self.next_check, self.next_check - 1
        before = guard.stats
        speaker.say(sentence, CHECK_PHRASES[guard.language])
        loop = asyncio.get_running_loop()
        deadline = loop.time() + CHECK_TIMEOUT_S
        while True:
            await asyncio.sleep(0.1)
            played = guard.last_played(sentence)
            if played is not None and guard.clock() - played > CHECK_TAIL_S:
                break
            if loop.time() > deadline:
                return {"error": "The check phrase was not spoken; is the voice working?"}
        after = guard.stats
        return {
            "spokenWords": guard.spoken_words(sentence),
            "heardWords": after.heard - before.heard,
            "passedWords": after.passed - before.passed,
        }

    async def _send_to(self, identity: str, topic: str, message: dict) -> None:
        # Reliable: finals and commits must arrive, and in order.
        if not self.room.isconnected():
            return
        try:
            await self.room.local_participant.publish_data(
                encode_message(message), reliable=True, destination_identities=[identity], topic=topic
            )
        except PublishDataError:
            # The learner left mid-update; there is no one to deliver to.
            logger.debug("dropped %s message: room closed", topic)

    async def set_voice_status(self, status: str, detail: str) -> None:
        await self._set_attributes({ATTR_VOICE: status, ATTR_VOICE_DETAIL: detail})

    async def _run_translation(self, loop: TranslationLoop) -> None:
        try:
            await loop.run()
        except asyncio.CancelledError:
            raise
        except TranslationError:
            pass  # permanent; the loop already published the reason
        except Exception:
            logger.exception("translation failed")
            await self.set_translation_status("error", "Translation stopped unexpectedly.")

    async def set_translation_status(self, status: str, detail: str) -> None:
        await self._set_attributes({ATTR_TRANSLATION: status, ATTR_TRANSLATION_DETAIL: detail})

    async def _set_attributes(self, attributes: dict[str, str]) -> None:
        if self.room.isconnected():
            await self.room.local_participant.set_attributes(attributes)

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
        elif isinstance(message, EchoCheck):
            self.spawn(self.echo_check(sender))

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
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT and self.ending is None:
            self.ending = asyncio.create_task(self.end("learner left"))

    async def end(self, reason: str) -> None:
        # Release our streams and sources before the framework disconnects the
        # room: with audio streams still open, Room.disconnect() can hang and
        # the job is killed after its shutdown deadline (seen in about half of
        # short sessions, before this ordering).
        await self.close()
        self.ctx.shutdown(reason=reason)

    async def close(self) -> None:
        """Idempotent: runs from end() and again as the shutdown callback."""
        if self.closed:
            return
        self.closed = True
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
