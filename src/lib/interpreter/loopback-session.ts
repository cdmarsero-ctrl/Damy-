import {
  ConnectionState,
  RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";

import { api, ApiClientError } from "@/lib/client";

import { assessCapture, CAPTURE_CONSTRAINTS, type CaptureCheck, tryUpgradeToSystemWideAec } from "./aec";
import {
  assessLeak,
  isOnset,
  type LatencySummary,
  type LeakAssessment,
  rmsDb,
  summariseLatency,
} from "./measure";
import { CONTROL_TOPIC, type ControlMessage, decodeControl, encodeControl, TRACK } from "./protocol";

/**
 * Browser side of the Phase 1 loopback: capture with verified AEC, join the
 * LiveKit room, publish the mic, and play back what the agent returns.
 *
 * Kept outside React so the media lifecycle (tracks, AudioContext, timers,
 * room) lives in one object with one `stop()`, and the component only
 * renders snapshots of `LoopbackState`.
 */

export type Phase = "idle" | "starting" | "waiting-agent" | "live" | "ended" | "error";
export type Busy = "timing" | "aec" | null;

export interface LoopbackState {
  phase: Phase;
  error: string | null;
  capture: CaptureCheck | null;
  /** Data-channel round trip through the SFU and agent (no audio codecs). */
  dataRtt: LatencySummary | null;
  /** Audio round trip: probe track → agent → echo-probe, end to end. */
  audioRtt: LatencySummary | null;
  /** Bursts sent vs returned in the last timing run. */
  audioRttLost: number;
  leak: LeakAssessment | null;
  busy: Busy;
  monitor: boolean;
  micLevelDb: number;
}

const AGENT_JOIN_TIMEOUT_MS = 15_000;
const PING_INTERVAL_MS = 1_000;
const PING_WINDOW = 20;
const PROBE_BURSTS = 5;
const PROBE_BURST_S = 0.04;
const PROBE_TIMEOUT_MS = 1_500;
const PROBE_POLL_MS = 4;
const LEVEL_SAMPLE_MS = 50;
const TONE_MS = 2_000;
const LEAK_WINDOW_MS = 1_200;
/** Skip the start of the tone while it is still in flight to the speaker. */
const TONE_SETTLE_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const INITIAL_STATE: LoopbackState = {
  phase: "idle",
  error: null,
  capture: null,
  dataRtt: null,
  audioRtt: null,
  audioRttLost: 0,
  leak: null,
  busy: null,
  monitor: false,
  micLevelDb: -100,
};

export class LoopbackSession {
  private state: LoopbackState = { ...INITIAL_STATE };
  private room: Room | null = null;
  private mic: MediaStreamTrack | null = null;
  private ctx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private probeGain: GainNode | null = null;
  private probeOut: MediaStreamAudioDestinationNode | null = null;
  private echoProbeAnalyser: AnalyserNode | null = null;
  private elements = new Map<string, HTMLMediaElement>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private pings = new Map<number, number>();
  private rtts: number[] = [];
  private nextPingId = 1;
  private stopped = false;

  constructor(private readonly onChange: (state: LoopbackState) => void) {}

  private set(patch: Partial<LoopbackState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async start() {
    this.set({ ...INITIAL_STATE, phase: "starting" });
    try {
      // Must run inside the click handler's user gesture, or autoplay policy
      // leaves the context (and remote playback) suspended.
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      await this.ctx.resume();

      await this.captureMic();
      const session = await api.post<{ url: string; token: string }>("/api/interpreter/session");
      if (this.stopped) return;

      const room = new Room({ adaptiveStream: false, dynacast: false, webAudioMix: false });
      this.room = room;
      room
        .on(RoomEvent.TrackSubscribed, (track, pub) => this.onTrack(track, pub))
        .on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
        .on(RoomEvent.DataReceived, (payload, _p, _k, topic) => this.onData(payload, topic))
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          if (p.isAgent) this.fail("The interpreter agent left the session.");
        })
        .on(RoomEvent.Disconnected, () => {
          if (!this.stopped) this.fail("Disconnected from the media server.");
        });

      await room.connect(session.url, session.token);
      await room.localParticipant.publishTrack(this.mic!, {
        name: TRACK.mic,
        source: Track.Source.Microphone,
        // Continuous frames: DTX would make silence-to-speech onsets (and the
        // timing probe) depend on when the encoder wakes up.
        dtx: false,
        red: true,
      });
      await this.publishProbe();

      this.set({ phase: "waiting-agent" });
      await this.waitForAgent();
      if (this.stopped) return;

      this.set({ phase: "live" });
      this.timers.push(setInterval(() => this.ping(), PING_INTERVAL_MS));
      this.timers.push(
        setInterval(() => this.set({ micLevelDb: this.level(this.micAnalyser) }), 100),
      );
    } catch (err) {
      this.fail(describeError(err));
    }
  }

  private async captureMic() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: CAPTURE_CONSTRAINTS });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new Error("Microphone access was blocked. Allow it in the address bar and try again.");
      }
      throw new Error("No usable microphone was found.");
    }
    this.mic = stream.getAudioTracks()[0];
    await tryUpgradeToSystemWideAec(this.mic);
    this.set({ capture: assessCapture(this.mic.getSettings()) });

    this.micAnalyser = this.analyser(new MediaStream([this.mic]), 2048);
  }

  /** A silent oscillator track whose gain is pulsed to time the round trip. */
  private async publishProbe() {
    const ctx = this.ctx!;
    const osc = new OscillatorNode(ctx, { frequency: 1000 });
    this.probeGain = new GainNode(ctx, { gain: 0 });
    this.probeOut = ctx.createMediaStreamDestination();
    osc.connect(this.probeGain).connect(this.probeOut);
    osc.start();
    await this.room!.localParticipant.publishTrack(this.probeOut.stream.getAudioTracks()[0], {
      name: TRACK.probe,
      source: Track.Source.Unknown,
      dtx: false,
      red: false,
    });
  }

  private waitForAgent(): Promise<void> {
    const room = this.room!;
    const present = () => [...room.remoteParticipants.values()].some((p) => p.isAgent);
    if (present()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        room.off(RoomEvent.ParticipantConnected, onJoin);
        reject(
          new Error(
            "The interpreter agent did not join. Check that the agent worker is running, registered with this LiveKit server, and not at capacity.",
          ),
        );
      }, AGENT_JOIN_TIMEOUT_MS);
      const onJoin = (p: RemoteParticipant) => {
        if (!p.isAgent) return;
        clearTimeout(timeout);
        room.off(RoomEvent.ParticipantConnected, onJoin);
        resolve();
      };
      room.on(RoomEvent.ParticipantConnected, onJoin);
    });
  }

  private onTrack(track: RemoteTrack, pub: RemoteTrackPublication) {
    if (!(track instanceof RemoteAudioTrack)) return;
    // Playback goes through a media element bound to the remote WebRTC track:
    // that is the signal browser AEC uses as its echo reference (§6.1).
    const el = track.attach();
    el.style.display = "none";
    document.body.appendChild(el);
    this.elements.set(pub.trackName, el);

    if (pub.trackName === TRACK.echoMic) {
      el.muted = !this.state.monitor;
    } else if (pub.trackName === TRACK.echoProbe) {
      // Analysed, never heard. Chrome only delivers remote WebRTC audio to
      // Web Audio while a media element is also consuming it, hence the
      // muted element above.
      el.muted = true;
      this.echoProbeAnalyser = this.analyser(new MediaStream([track.mediaStreamTrack]), 512);
    }
  }

  private onData(payload: Uint8Array, topic?: string) {
    if (topic !== CONTROL_TOPIC) return;
    const msg = decodeControl(payload);
    if (msg?.type !== "pong") return;
    const sentAt = this.pings.get(msg.id);
    if (sentAt === undefined) return;
    this.pings.delete(msg.id);
    this.rtts = [...this.rtts, performance.now() - sentAt].slice(-PING_WINDOW);
    this.set({ dataRtt: summariseLatency(this.rtts) });
  }

  private send(message: ControlMessage, reliable: boolean) {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) return;
    void room.localParticipant
      .publishData(encodeControl(message), { reliable, topic: CONTROL_TOPIC })
      .catch(() => undefined);
  }

  private ping() {
    const id = this.nextPingId++;
    const sentAt = performance.now();
    this.pings.set(id, sentAt);
    // Lossy: a retransmitted ping would measure the retry, not the path.
    this.send({ type: "ping", id, sentAt }, false);
    // Forget pings that never came back so the map can't grow unbounded.
    for (const [pending, at] of this.pings) {
      if (sentAt - at > 5_000) this.pings.delete(pending);
    }
  }

  /** Pulses the probe and times its return on echo-probe. */
  async measureAudioRoundTrip() {
    if (this.state.phase !== "live" || this.state.busy) return;
    const analyser = this.echoProbeAnalyser;
    if (!analyser || !this.probeGain || !this.ctx) {
      this.set({ error: "The returned probe track has not arrived yet; try again in a moment." });
      return;
    }
    this.set({ busy: "timing", error: null });
    const results: number[] = [];
    let lost = 0;
    try {
      for (let i = 0; i < PROBE_BURSTS && !this.stopped; i++) {
        await this.waitForSilence(analyser);
        const at = this.ctx.currentTime;
        this.probeGain.gain.setValueAtTime(1, at);
        this.probeGain.gain.setValueAtTime(0, at + PROBE_BURST_S);
        const sentAt = performance.now();
        const arrivedAt = await this.waitForOnset(analyser, sentAt + PROBE_TIMEOUT_MS);
        if (arrivedAt === null) lost++;
        else results.push(arrivedAt - sentAt);
        await sleep(300);
      }
      this.set({ audioRtt: summariseLatency(results), audioRttLost: lost });
    } finally {
      this.set({ busy: null });
    }
  }

  private waitForOnset(analyser: AnalyserNode, deadline: number): Promise<number | null> {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const now = performance.now();
        if (isOnset(this.level(analyser))) {
          clearInterval(timer);
          resolve(now);
        } else if (now > deadline || this.stopped) {
          clearInterval(timer);
          resolve(null);
        }
      }, PROBE_POLL_MS);
    });
  }

  private async waitForSilence(analyser: AnalyserNode) {
    const deadline = performance.now() + PROBE_TIMEOUT_MS;
    while (isOnset(this.level(analyser)) && performance.now() < deadline) await sleep(20);
  }

  /**
   * Plays a tone through the speaker (via the agent's remote track, i.e. the
   * same path translated speech will take) and checks how much of it survives
   * echo cancellation on the processed mic signal. The learner stays quiet.
   */
  async testEchoCancellation() {
    if (this.state.phase !== "live" || this.state.busy) return;
    this.set({ busy: "aec", error: null, leak: null });
    const monitorEl = this.elements.get(TRACK.echoMic);
    const wasMuted = monitorEl?.muted ?? true;
    if (monitorEl) monitorEl.muted = true;
    try {
      const baseline = await this.sampleMic(LEAK_WINDOW_MS);
      this.send({ type: "tone", durationMs: TONE_MS }, true);
      await sleep(TONE_SETTLE_MS);
      const duringTone = await this.sampleMic(LEAK_WINDOW_MS);
      this.set({ leak: assessLeak(baseline, duringTone) });
      await sleep(Math.max(0, TONE_MS - TONE_SETTLE_MS - LEAK_WINDOW_MS));
    } finally {
      if (monitorEl) monitorEl.muted = wasMuted;
      this.set({ busy: null });
    }
  }

  private async sampleMic(durationMs: number): Promise<number[]> {
    const levels: number[] = [];
    const end = performance.now() + durationMs;
    while (performance.now() < end && !this.stopped) {
      levels.push(this.level(this.micAnalyser));
      await sleep(LEVEL_SAMPLE_MS);
    }
    return levels;
  }

  setMonitor(on: boolean) {
    const el = this.elements.get(TRACK.echoMic);
    if (el) el.muted = !on;
    this.set({ monitor: on });
  }

  private analyser(stream: MediaStream, fftSize: number): AnalyserNode {
    const node = new AnalyserNode(this.ctx!, { fftSize, smoothingTimeConstant: 0 });
    this.ctx!.createMediaStreamSource(stream).connect(node);
    return node;
  }

  private buffer: Float32Array<ArrayBuffer> | null = null;

  private level(analyser: AnalyserNode | null): number {
    if (!analyser) return -100;
    if (!this.buffer || this.buffer.length !== analyser.fftSize) {
      this.buffer = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(this.buffer);
    return rmsDb(this.buffer);
  }

  private fail(message: string) {
    if (this.stopped) return;
    this.set({ phase: "error", error: message, busy: null });
    void this.teardown();
  }

  async stop() {
    if (this.stopped) return;
    await this.teardown();
    this.set({ phase: "ended", busy: null });
  }

  private async teardown() {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.elements.forEach((el) => el.remove());
    this.elements.clear();
    this.mic?.stop();
    this.probeOut?.stream.getTracks().forEach((t) => t.stop());
    await this.room?.disconnect().catch(() => undefined);
    await this.ctx?.close().catch(() => undefined);
  }
}

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Could not start the session.";
}
