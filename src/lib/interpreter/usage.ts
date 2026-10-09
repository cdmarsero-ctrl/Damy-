import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * Phase 6: quotas, the agent's end-of-session report, cost metering and the
 * per-pair latency summary (docs/REALTIME-TRANSLATION.md §8).
 *
 * Pure apart from the HMAC, so the rules are unit-tested without a database.
 */

/** A session shorter than this isn't worth starting. */
export const MIN_SESSION_SECONDS = 30;

export interface SessionUsageRow {
  startedAt: Date;
  maxSeconds: number;
  durationSeconds: number | null;
}

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Seconds of interpreter time used. A session the agent has reported counts
 * its real duration. One still running (or whose report never arrived) counts
 * the time since it started, up to its limit: the agent ends every session at
 * its limit, so it can never have used more.
 */
export function usedSeconds(rows: SessionUsageRow[], now: Date): number {
  return rows.reduce((total, row) => {
    if (row.durationSeconds !== null) return total + row.durationSeconds;
    const elapsed = Math.max(0, (now.getTime() - row.startedAt.getTime()) / 1000);
    return total + Math.min(row.maxSeconds, elapsed);
  }, 0);
}

/** Length of the next session in seconds, or null when the quota is spent. */
export function sessionAllowance(opts: {
  dailyMinutes: number;
  maxSessionMinutes: number;
  usedSeconds: number;
}): number | null {
  const remaining = Math.floor(opts.dailyMinutes * 60 - opts.usedSeconds);
  if (remaining < MIN_SESSION_SECONDS) return null;
  return Math.min(remaining, opts.maxSessionMinutes * 60);
}

// ------------------------------------------------------- the agent's report

const ms = z.number().finite().nonnegative().nullable().optional();
const count = z.number().int().nonnegative().optional();

/** Mirrors agents/interpreter/metering.py `SessionMeter.report()`. */
export const sessionReportSchema = z.object({
  room: z.string().min(1).max(200),
  durationSeconds: z.number().finite().nonnegative(),
  endReason: z.string().max(100),
  usage: z.object({
    asrSeconds: z.number().finite().nonnegative().optional(),
    mtRequests: count,
    mtInputTokens: count,
    mtOutputTokens: count,
    mtCacheReadTokens: count,
    mtCacheWriteTokens: count,
    ttsCharacters: count,
  }),
  quality: z.object({
    sentences: count,
    captionP50Ms: ms,
    captionP95Ms: ms,
    translationP50Ms: ms,
    translationP95Ms: ms,
    voiceP50Ms: ms,
    voiceP95Ms: ms,
    echoRemovedWords: count,
  }),
});

export type SessionReport = z.infer<typeof sessionReportSchema>;

export const REPORT_SIGNATURE_HEADER = "x-interpreter-signature";

/**
 * The agent signs the raw report body with HMAC-SHA256 under the LiveKit API
 * secret, which it already holds, so no extra credential is needed. Header
 * value: `sha256=<hex>`.
 */
export function signReport(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyReportSignature(body: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(signReport(body, secret));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ------------------------------------------------------------------ cost

/** Rates per billing unit, from the environment; 0 means "not configured". */
export interface CostRates {
  asrPerMinute: number;
  mtInputPerMTok: number;
  mtOutputPerMTok: number;
  mtCacheReadPerMTok: number;
  mtCacheWritePerMTok: number;
  ttsPer1kChars: number;
}

export interface Usage {
  asrSeconds: number;
  mtInputTokens: number;
  mtOutputTokens: number;
  mtCacheReadTokens: number;
  mtCacheWriteTokens: number;
  ttsCharacters: number;
}

export function costRates(env: {
  INTERPRETER_COST_ASR_PER_MIN: number;
  INTERPRETER_COST_MT_INPUT_PER_MTOK: number;
  INTERPRETER_COST_MT_OUTPUT_PER_MTOK: number;
  INTERPRETER_COST_MT_CACHE_READ_PER_MTOK: number;
  INTERPRETER_COST_MT_CACHE_WRITE_PER_MTOK: number;
  INTERPRETER_COST_TTS_PER_1K_CHARS: number;
}): CostRates {
  return {
    asrPerMinute: env.INTERPRETER_COST_ASR_PER_MIN,
    mtInputPerMTok: env.INTERPRETER_COST_MT_INPUT_PER_MTOK,
    mtOutputPerMTok: env.INTERPRETER_COST_MT_OUTPUT_PER_MTOK,
    mtCacheReadPerMTok: env.INTERPRETER_COST_MT_CACHE_READ_PER_MTOK,
    mtCacheWritePerMTok: env.INTERPRETER_COST_MT_CACHE_WRITE_PER_MTOK,
    ttsPer1kChars: env.INTERPRETER_COST_TTS_PER_1K_CHARS,
  };
}

/** Estimated vendor cost, or null when no rate is configured. */
export function estimateCost(usage: Usage, rates: CostRates): number | null {
  if (Object.values(rates).every((r) => r === 0)) return null;
  return (
    (usage.asrSeconds / 60) * rates.asrPerMinute +
    (usage.mtInputTokens / 1e6) * rates.mtInputPerMTok +
    (usage.mtOutputTokens / 1e6) * rates.mtOutputPerMTok +
    (usage.mtCacheReadTokens / 1e6) * rates.mtCacheReadPerMTok +
    (usage.mtCacheWriteTokens / 1e6) * rates.mtCacheWritePerMTok +
    (usage.ttsCharacters / 1000) * rates.ttsPer1kChars
  );
}

// -------------------------------------------------- per-pair latency summary

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest rank: the smallest value with at least p% of samples at or below it.
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export interface StatsRow extends Usage {
  sourceLanguage: string;
  targetLanguage: string;
  durationSeconds: number | null;
  captionP50Ms: number | null;
  captionP95Ms: number | null;
  translationP50Ms: number | null;
  translationP95Ms: number | null;
  voiceP50Ms: number | null;
  voiceP95Ms: number | null;
  echoRemovedWords: number;
}

export interface PairStats {
  pair: string;
  sessions: number;
  minutes: number;
  /** Median over sessions of each session's median; and the 95th percentile
   *  over sessions of each session's 95th percentile. Sessions report
   *  summaries, not samples, so these are the honest aggregates. */
  caption: { p50: number | null; p95: number | null };
  translation: { p50: number | null; p95: number | null };
  voice: { p50: number | null; p95: number | null };
  echoRemovedWords: number;
  usage: Usage;
  cost: number | null;
}

/** Only reported sessions are included: unreported ones have no figures. */
export function summarisePairs(rows: StatsRow[], rates: CostRates): PairStats[] {
  const groups = new Map<string, StatsRow[]>();
  for (const row of rows) {
    if (row.durationSeconds === null) continue;
    const pair = `${row.sourceLanguage}→${row.targetLanguage}`;
    groups.set(pair, [...(groups.get(pair) ?? []), row]);
  }
  const values = (group: StatsRow[], key: keyof StatsRow) =>
    group.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  return [...groups.entries()]
    .map(([pair, group]) => {
      const usage: Usage = {
        asrSeconds: sum(values(group, "asrSeconds")),
        mtInputTokens: sum(values(group, "mtInputTokens")),
        mtOutputTokens: sum(values(group, "mtOutputTokens")),
        mtCacheReadTokens: sum(values(group, "mtCacheReadTokens")),
        mtCacheWriteTokens: sum(values(group, "mtCacheWriteTokens")),
        ttsCharacters: sum(values(group, "ttsCharacters")),
      };
      return {
        pair,
        sessions: group.length,
        minutes: sum(values(group, "durationSeconds")) / 60,
        caption: { p50: percentile(values(group, "captionP50Ms"), 50), p95: percentile(values(group, "captionP95Ms"), 95) },
        translation: {
          p50: percentile(values(group, "translationP50Ms"), 50),
          p95: percentile(values(group, "translationP95Ms"), 95),
        },
        voice: { p50: percentile(values(group, "voiceP50Ms"), 50), p95: percentile(values(group, "voiceP95Ms"), 95) },
        echoRemovedWords: sum(values(group, "echoRemovedWords")),
        usage,
        cost: estimateCost(usage, rates),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
