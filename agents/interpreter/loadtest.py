"""Phase 6 load test: N simulated learners at once against a running agent.

Each learner joins its own room with a dispatch token (like the web app's),
publishes a speech clip on `mic` in real time, on a loop, and records the
caption latency, translation lag and voice lag the agent reports. At the end
it prints, per concurrency level, how many sessions got an agent and the
p50/p95 of each latency across all of them, plus the host's load.

Run against the fakes (README "Run it locally") or real vendors:

    python loadtest.py --clip speech.wav --sessions 1 4 8 --seconds 40

The clip must be 16-bit PCM WAV, mono. Needs LIVEKIT_URL, LIVEKIT_API_KEY and
LIVEKIT_API_SECRET (the same values the agent uses).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import uuid
import wave
from dataclasses import dataclass, field

from livekit import api, rtc

from metering import percentile
from protocol import CAPTIONS_TOPIC, TRACK_MIC, TRANSLATION_TOPIC, VOICE_TOPIC

FRAME_MS = 20


@dataclass
class Learner:
    agent_joined: bool = False
    captions: list[float] = field(default_factory=list)
    translation: list[float] = field(default_factory=list)
    voice: list[float] = field(default_factory=list)


def load_clip(path: str) -> tuple[bytes, int]:
    with wave.open(path, "rb") as wav:
        if wav.getsampwidth() != 2 or wav.getnchannels() != 1:
            raise SystemExit(f"{path}: needs 16-bit mono PCM")
        return wav.readframes(wav.getnframes()), wav.getframerate()


def token(identity: str, room: str, agent_name: str, source: str, target: str) -> str:
    return (
        api.AccessToken(os.environ["LIVEKIT_API_KEY"], os.environ["LIVEKIT_API_SECRET"])
        .with_identity(identity)
        .with_metadata(json.dumps({"sourceLanguage": source, "targetLanguage": target}))
        .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True, can_publish_data=True))
        .with_room_config(
            api.RoomConfiguration(
                empty_timeout=30,
                departure_timeout=10,
                agents=[api.RoomAgentDispatch(agent_name=agent_name)],
            )
        )
        .to_jwt()
    )


async def run_learner(args, clip: bytes, rate: int, stats: Learner) -> None:
    room_name = f"loadtest_{uuid.uuid4().hex[:8]}"
    identity = f"learner_{uuid.uuid4().hex[:6]}"
    room = rtc.Room()

    @room.on("participant_connected")
    def on_join(participant: rtc.RemoteParticipant) -> None:
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            stats.agent_joined = True

    @room.on("data_received")
    def on_data(packet: rtc.DataPacket) -> None:
        try:
            message = json.loads(packet.data)
        except ValueError:
            return
        if packet.topic == CAPTIONS_TOPIC and isinstance(message.get("latencyMs"), (int, float)):
            stats.captions.append(message["latencyMs"])
        elif packet.topic == TRANSLATION_TOPIC and isinstance(message.get("flushMs"), (int, float)):
            stats.translation.append(message["flushMs"])
        elif packet.topic == VOICE_TOPIC and isinstance(message.get("lagMs"), (int, float)):
            stats.voice.append(message["lagMs"])

    await room.connect(
        os.environ["LIVEKIT_URL"],
        token(identity, room_name, args.agent_name, args.source, args.target),
        rtc.RoomOptions(auto_subscribe=False),
    )
    source = rtc.AudioSource(rate, 1)
    track = rtc.LocalAudioTrack.create_audio_track(TRACK_MIC, source)
    await room.local_participant.publish_track(
        track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE, dtx=False)
    )
    samples = rate * FRAME_MS // 1000
    step = samples * 2
    deadline = time.monotonic() + args.seconds
    offset = 0
    try:
        while time.monotonic() < deadline:
            chunk = clip[offset:offset + step]
            if len(chunk) < step:
                chunk += b"\x00" * (step - len(chunk))
                offset = 0
            else:
                offset += step
            # capture_frame paces to real time once the source queue is full.
            await source.capture_frame(rtc.AudioFrame(chunk, rate, 1, samples))
    finally:
        await room.disconnect()
        await source.aclose()


def summary(values: list[float]) -> str:
    p50, p95 = percentile(values, 50), percentile(values, 95)
    if p50 is None:
        return "—"
    return f"{p50:.0f} / {p95:.0f} ms (n={len(values)})"


async def run_level(args, clip: bytes, rate: int, n: int) -> None:
    learners = [Learner() for _ in range(n)]
    started = time.monotonic()
    # Stagger joins slightly, as real traffic would.
    tasks = []
    for learner in learners:
        tasks.append(asyncio.create_task(run_learner(args, clip, rate, learner)))
        await asyncio.sleep(0.2)
    load_samples = []
    while not all(t.done() for t in tasks):
        load_samples.append(os.getloadavg()[0])
        await asyncio.sleep(2)
    results = await asyncio.gather(*tasks, return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    pooled = lambda key: [v for learner in learners for v in getattr(learner, key)]  # noqa: E731
    print(f"\n== {n} concurrent session(s), {time.monotonic() - started:.0f} s ==")
    print(f"  agent joined:     {sum(l.agent_joined for l in learners)}/{n}" + (f"  ({len(errors)} errors: {errors[0]!r})" if errors else ""))
    print(f"  caption latency:  {summary(pooled('captions'))}")
    print(f"  translation lag:  {summary(pooled('translation'))}")
    print(f"  voice lag:        {summary(pooled('voice'))}")
    print(f"  host load (1 min): max {max(load_samples, default=0):.1f} on {os.cpu_count()} CPUs")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--clip", required=True, help="16-bit mono WAV of speech")
    parser.add_argument("--sessions", type=int, nargs="+", default=[1, 2, 4])
    parser.add_argument("--seconds", type=float, default=40)
    parser.add_argument("--source", default="en")
    parser.add_argument("--target", default="es")
    parser.add_argument("--agent-name", default=os.environ.get("INTERPRETER_AGENT_NAME", "interpreter"))
    parser.add_argument("--pause", type=float, default=20, help="seconds between levels, for jobs to wind down")
    args = parser.parse_args()
    clip, rate = load_clip(args.clip)
    for i, n in enumerate(args.sessions):
        if i:
            await asyncio.sleep(args.pause)
        await run_level(args, clip, rate, n)


if __name__ == "__main__":
    asyncio.run(main())
