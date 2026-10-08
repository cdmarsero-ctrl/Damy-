import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";

import { assessCapture } from "./aec";
import { createInterpreterSession, liveKitConfig } from "./livekit";
import { assessLeak, isOnset, median, rmsDb, SILENCE_DB, summariseLatency } from "./measure";
import { CONTROL_TOPIC, decodeControl, encodeControl, TRACK } from "./protocol";
import { interpreterSessionSchema } from "../validation";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("control protocol", () => {
  it("round-trips every message type", () => {
    for (const msg of [
      { type: "ping", id: 1, sentAt: 123.5 },
      { type: "pong", id: 1, sentAt: 123.5 },
      { type: "tone", durationMs: 1500 },
      { type: "tone-started", durationMs: 1500 },
    ] as const) {
      expect(decodeControl(encodeControl(msg))).toEqual(msg);
    }
  });

  it("rejects malformed and unknown payloads instead of throwing", () => {
    expect(decodeControl(bytes("not json"))).toBeNull();
    expect(decodeControl(bytes("null"))).toBeNull();
    expect(decodeControl(bytes('{"type":"reboot"}'))).toBeNull();
    expect(decodeControl(bytes('{"type":"ping","id":"1","sentAt":2}'))).toBeNull();
    expect(decodeControl(bytes('{"type":"tone","durationMs":-5}'))).toBeNull();
    expect(decodeControl(bytes('{"type":"tone","durationMs":1e999}'))).toBeNull();
  });

  it("keeps the names the Python agent mirrors", () => {
    // agents/interpreter/tests/test_protocol.py checks this file for the same values.
    expect(CONTROL_TOPIC).toBe("interpreter.control");
    expect(TRACK).toEqual({
      mic: "mic",
      probe: "probe",
      echoMic: "echo-mic",
      echoProbe: "echo-probe",
      tone: "tone",
      voice: "voice",
    });
  });
});

describe("measurement", () => {
  it("computes RMS level in dBFS", () => {
    expect(rmsDb(new Float32Array(480).fill(1))).toBeCloseTo(0);
    expect(rmsDb(new Float32Array(480).fill(0.1))).toBeCloseTo(-20);
    expect(rmsDb(new Float32Array(480))).toBe(SILENCE_DB);
    expect(rmsDb([])).toBe(SILENCE_DB);
  });

  it("takes the median of odd and even samples", () => {
    expect(median([])).toBeNull();
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 20, 30])).toBe(25);
  });

  it("summarises latency against the Phase 1 target", () => {
    expect(summariseLatency([])).toBeNull();
    expect(summariseLatency([90, 120, 140, 400, 110])).toEqual({
      samples: 5,
      p50: 120,
      min: 90,
      max: 400,
      meetsTarget: true,
    });
    expect(summariseLatency([200, 180, 160])?.meetsTarget).toBe(false);
  });

  it("detects the probe onset", () => {
    expect(isOnset(-60)).toBe(false);
    expect(isOnset(-12)).toBe(true);
  });

  it("passes AEC when the tone does not raise the mic level", () => {
    const result = assessLeak([-62, -60, -61], [-61, -60, -60]);
    expect(result?.verdict).toBe("pass");
    expect(result?.leakDb).toBeLessThan(3);
  });

  it("fails AEC when the tone is clearly audible on the mic", () => {
    const result = assessLeak([-62, -60, -61], [-35, -33, -34]);
    expect(result?.verdict).toBe("fail");
    expect(result?.leakDb).toBeGreaterThan(20);
  });

  it("marks a small rise as marginal and averages in the power domain", () => {
    expect(assessLeak([-60, -60], [-55, -55])?.verdict).toBe("marginal");
    // One loud reading among quiet ones dominates the power mean, as it should.
    const spiky = assessLeak([-60, -60, -60, -60], [-60, -60, -60, -30]);
    expect(spiky?.toneDb).toBeGreaterThan(-37);
  });

  it("needs both windows to assess", () => {
    expect(assessLeak([], [-60])).toBeNull();
    expect(assessLeak([-60], [])).toBeNull();
  });
});

describe("capture check", () => {
  it("accepts standard WebRTC echo cancellation", () => {
    expect(assessCapture({ echoCancellation: true, noiseSuppression: true, channelCount: 1 })).toEqual({
      ok: true,
      echo: "webrtc",
      issues: [],
    });
  });

  it("recognises system-wide cancellation", () => {
    expect(assessCapture({ echoCancellation: "all" }).echo).toBe("system");
  });

  it("flags missing echo cancellation and other degraded settings", () => {
    const check = assessCapture({ echoCancellation: false, noiseSuppression: false, channelCount: 2 });
    expect(check.ok).toBe(false);
    expect(check.echo).toBe("off");
    expect(check.issues).toHaveLength(3);
  });

  it("treats an unreported setting as off, not as on", () => {
    expect(assessCapture({}).ok).toBe(false);
  });
});

describe("session request validation", () => {
  it("defaults to auto-detect into Spanish and rejects same-language pairs", () => {
    expect(interpreterSessionSchema.parse({})).toEqual({ sourceLanguage: "multi", targetLanguage: "es" });
    expect(interpreterSessionSchema.safeParse({ sourceLanguage: "en", targetLanguage: "en" }).success).toBe(false);
    expect(interpreterSessionSchema.safeParse({ sourceLanguage: "en", targetLanguage: "xx" }).success).toBe(false);
    expect(interpreterSessionSchema.safeParse({ sourceLanguage: "multi", targetLanguage: "en" }).success).toBe(true);
  });
});

describe("LiveKit session", () => {
  const env = {
    LIVEKIT_URL: "wss://example.livekit.cloud",
    LIVEKIT_API_KEY: "APIkey",
    LIVEKIT_API_SECRET: "s".repeat(40),
    INTERPRETER_AGENT_NAME: "interpreter",
  };

  it("is unconfigured until URL, key and secret are all set", () => {
    expect(liveKitConfig({ ...env, LIVEKIT_URL: "" })).toBeNull();
    expect(liveKitConfig({ ...env, LIVEKIT_API_KEY: " " })).toBeNull();
    expect(liveKitConfig({ ...env, LIVEKIT_API_SECRET: "" })).toBeNull();
    expect(liveKitConfig(env)).not.toBeNull();
  });

  it("mints a single-room token that dispatches the agent", async () => {
    const session = await createInterpreterSession(liveKitConfig(env)!, { id: "u1", name: "Ada" }, { sourceLanguage: "es", targetLanguage: "en" });
    expect(session.url).toBe(env.LIVEKIT_URL);
    expect(session.identity).toBe("user_u1");
    expect(session.room).toMatch(/^interp_u1_[0-9a-f]{8}$/);

    const claims = decodeJwt(session.token) as Record<string, any>;
    expect(claims.iss).toBe("APIkey");
    expect(claims.sub).toBe("user_u1");
    expect(claims.video).toMatchObject({ room: session.room, roomJoin: true, canPublishData: true });
    expect(claims.video.roomAdmin).toBeFalsy();
    expect(claims.video.canUpdateOwnMetadata).toBeFalsy();
    expect(claims.roomConfig.agents[0].agentName).toBe("interpreter");
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(600);
    // The agent reads the caption language from here.
    expect(JSON.parse(claims.metadata)).toEqual({ sourceLanguage: "es", targetLanguage: "en" });
  });

  it("uses a fresh room for every session", async () => {
    const config = liveKitConfig(env)!;
    const opts = { sourceLanguage: "multi", targetLanguage: "es" } as const;
    const a = await createInterpreterSession(config, { id: "u1", name: "Ada" }, opts);
    const b = await createInterpreterSession(config, { id: "u1", name: "Ada" }, opts);
    expect(a.room).not.toBe(b.room);
  });
});
