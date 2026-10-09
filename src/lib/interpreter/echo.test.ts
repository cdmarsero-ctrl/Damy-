import { describe, expect, it } from "vitest";

import type { CaptureCheck } from "./aec";
import { assessEchoReport, nextProtection, protectedReason } from "./echo";
import { AGENT_ATTR, decodeControl, decodeEchoReport, ECHO_TOPIC, encodeControl } from "./protocol";

const bytes = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
const aecOn: CaptureCheck = { ok: true, echo: "webrtc", issues: [] };
const aecOff: CaptureCheck = { ok: false, echo: "off", issues: ["no AEC"] };

describe("protected mode", () => {
  it("starts when echo cancellation is off or the agent keeps hearing itself", () => {
    expect(protectedReason(aecOn, "clean", false)).toBeNull();
    expect(protectedReason(null, null, false)).toBeNull();
    expect(protectedReason(aecOff, "clean", false)).toBe("aec-off");
    expect(protectedReason(aecOn, "leaking", false)).toBe("echo-detected");
    expect(protectedReason(aecOff, "leaking", true)).toBeNull(); // headphones
  });

  it("stays on until the learner confirms headphones", () => {
    const on = nextProtection(null, aecOn, "leaking", false);
    expect(on).toBe("echo-detected");
    // The echo stops (because the voice was muted): still protected.
    expect(nextProtection(on, aecOn, "clean", false)).toBe("echo-detected");
    expect(nextProtection(on, aecOn, "clean", true)).toBeNull();
    // With headphones confirmed, later leaks don't re-enter it.
    expect(nextProtection(null, aecOn, "leaking", true)).toBeNull();
  });
});

describe("echo check", () => {
  it("decodes reports and rejects malformed ones", () => {
    expect(decodeEchoReport(bytes({ type: "echo-report", spokenWords: 8, heardWords: 2, passedWords: 0 }))).toEqual({
      type: "echo-report",
      spokenWords: 8,
      heardWords: 2,
      passedWords: 0,
    });
    expect(decodeEchoReport(bytes({ type: "echo-report", error: "off" }))).toEqual({ type: "echo-report", error: "off" });
    for (const bad of [
      "x",
      { type: "echo-report" },
      { type: "echo-report", spokenWords: 8, heardWords: -1, passedWords: 0 },
      { type: "echo-report", spokenWords: 8, heardWords: 1.5, passedWords: 0 },
      { type: "voice", sentence: 1 },
    ]) {
      expect(decodeEchoReport(bytes(bad))).toBeNull();
    }
  });

  it("grades the result", () => {
    const report = (heardWords: number, passedWords: number) =>
      assessEchoReport({ type: "echo-report", spokenWords: 8, heardWords, passedWords });
    expect(report(0, 0).verdict).toBe("clean");
    expect(report(3, 0).verdict).toBe("guarded");
    expect(report(3, 1)).toEqual({
      verdict: "leaking",
      message: "1 word of the agent's own voice reached the captions. Use headphones on this device.",
    });
    expect(assessEchoReport({ type: "echo-report", error: "Speech is off." })).toEqual({
      verdict: "error",
      message: "Speech is off.",
    });
  });

  it("matches the agent's names and control message", () => {
    // agents/interpreter/tests/test_protocol.py checks the same values.
    expect(ECHO_TOPIC).toBe("interpreter.echo");
    expect([AGENT_ATTR.echo, AGENT_ATTR.echoDetail]).toEqual(["echo", "echo.detail"]);
    expect(decodeControl(encodeControl({ type: "echo-check" }))).toEqual({ type: "echo-check" });
  });
});
