import { describe, expect, it } from "vitest";

import { decodeControl } from "./protocol";
import {
  type CostRates,
  estimateCost,
  percentile,
  sessionAllowance,
  sessionReportSchema,
  signReport,
  summarisePairs,
  usedSeconds,
  utcDayStart,
  verifyReportSignature,
} from "./usage";

const NOW = new Date("2026-10-09T15:00:00Z");
const ago = (s: number) => new Date(NOW.getTime() - s * 1000);

describe("quota", () => {
  it("counts reported durations, and running sessions up to their limit", () => {
    expect(
      usedSeconds(
        [
          { startedAt: ago(3600), maxSeconds: 900, durationSeconds: 420 }, // reported
          { startedAt: ago(120), maxSeconds: 900, durationSeconds: null }, // running
          { startedAt: ago(3000), maxSeconds: 600, durationSeconds: null }, // never reported
        ],
        NOW,
      ),
    ).toBe(420 + 120 + 600);
  });

  it("caps a session to what is left and refuses one too short to use", () => {
    expect(sessionAllowance({ dailyMinutes: 30, maxSessionMinutes: 15, usedSeconds: 0 })).toBe(900);
    expect(sessionAllowance({ dailyMinutes: 30, maxSessionMinutes: 15, usedSeconds: 1500 })).toBe(300);
    expect(sessionAllowance({ dailyMinutes: 30, maxSessionMinutes: 15, usedSeconds: 1780 })).toBeNull();
  });

  it("resets at midnight UTC", () => {
    expect(utcDayStart(NOW).toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });
});

describe("agent report", () => {
  const body = JSON.stringify({
    room: "interp_u1_abcd1234",
    durationSeconds: 312.4,
    endReason: "learner left",
    usage: { asrSeconds: 180.2, mtRequests: 40, mtInputTokens: 1200, mtOutputTokens: 300, ttsCharacters: 900 },
    quality: { sentences: 12, captionP50Ms: 210, captionP95Ms: 380, voiceP50Ms: null, echoRemovedWords: 0 },
  });

  it("accepts only a body signed with the shared secret", () => {
    const sig = signReport(body, "secret");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyReportSignature(body, sig, "secret")).toBe(true);
    expect(verifyReportSignature(body, sig, "other")).toBe(false);
    expect(verifyReportSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyReportSignature(body, null, "secret")).toBe(false);
    expect(verifyReportSignature(body, "sha256=short", "secret")).toBe(false);
  });

  it("matches the agent's signature (shared test vector)", () => {
    // agents/interpreter/tests/test_metering.py checks the same vector.
    expect(signReport('{"room":"r1"}', "devsecret")).toBe(
      "sha256=89fde262a018432d713c9a51025398907163be7b420ef36b21683b939ee1b47d",
    );
  });

  it("validates the report shape", () => {
    expect(sessionReportSchema.parse(JSON.parse(body)).quality.voiceP50Ms).toBeNull();
    expect(() => sessionReportSchema.parse({ ...JSON.parse(body), durationSeconds: -1 })).toThrow();
    expect(() => sessionReportSchema.parse({ ...JSON.parse(body), usage: { mtRequests: 1.5 } })).toThrow();
  });

  it("decodes the agent's ending notice", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ type: "ending", reason: "time-limit" }));
    expect(decodeControl(bytes)).toEqual({ type: "ending", reason: "time-limit" });
  });
});

describe("stats", () => {
  const rates: CostRates = {
    asrPerMinute: 0.01,
    mtInputPerMTok: 1,
    mtOutputPerMTok: 5,
    mtCacheReadPerMTok: 0.1,
    mtCacheWritePerMTok: 1.25,
    ttsPer1kChars: 0.05,
  };
  const zero: CostRates = { ...rates, asrPerMinute: 0, mtInputPerMTok: 0, mtOutputPerMTok: 0, mtCacheReadPerMTok: 0, mtCacheWritePerMTok: 0, ttsPer1kChars: 0 };
  const usage = { asrSeconds: 600, mtInputTokens: 1e6, mtOutputTokens: 2e5, mtCacheReadTokens: 1e6, mtCacheWriteTokens: 0, ttsCharacters: 4000 };

  it("estimates cost only when rates are configured", () => {
    expect(estimateCost(usage, rates)).toBeCloseTo(0.1 + 1 + 1 + 0.1 + 0.2);
    expect(estimateCost(usage, zero)).toBeNull();
  });

  it("uses nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it("groups reported sessions by pair", () => {
    const row = (pair: [string, string], voice: number | null, duration: number | null) => ({
      sourceLanguage: pair[0],
      targetLanguage: pair[1],
      durationSeconds: duration,
      captionP50Ms: 200,
      captionP95Ms: 300,
      translationP50Ms: 260,
      translationP95Ms: 500,
      voiceP50Ms: voice,
      voiceP95Ms: voice === null ? null : voice + 400,
      echoRemovedWords: 1,
      ...usage,
    });
    const pairs = summarisePairs(
      [row(["en", "es"], 1000, 60), row(["en", "es"], 1400, 120), row(["en", "es"], 900, null), row(["ja", "en"], null, 30)],
      zero,
    );
    expect(pairs.map((p) => [p.pair, p.sessions, p.minutes])).toEqual([
      ["en→es", 2, 3],
      ["ja→en", 1, 0.5],
    ]);
    expect(pairs[0].voice).toEqual({ p50: 1000, p95: 1800 });
    expect(pairs[1].voice).toEqual({ p50: null, p95: null });
    expect(pairs[0].usage.asrSeconds).toBe(1200);
    expect(pairs[0].cost).toBeNull();
  });
});
