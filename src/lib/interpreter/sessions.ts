import "server-only";

import { prisma } from "@/lib/db";

import { costRates, type PairStats, summarisePairs, usedSeconds, utcDayStart } from "./usage";

/** Interpreter seconds the learner has used since midnight UTC. */
export async function usedToday(userId: string, now: Date): Promise<number> {
  const rows = await prisma.interpreterSession.findMany({
    where: { userId, startedAt: { gte: utcDayStart(now) } },
    select: { startedAt: true, maxSeconds: true, durationSeconds: true },
  });
  return usedSeconds(rows, now);
}

export interface InterpreterStats {
  days: number;
  sessions: number;
  unreported: number;
  pairs: PairStats[];
  costConfigured: boolean;
}

/** Per-pair latency, usage and cost over the last `days` days. */
export async function interpreterStats(days: number, env: Parameters<typeof costRates>[0]): Promise<InterpreterStats> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.interpreterSession.findMany({ where: { startedAt: { gte: since } } });
  const rates = costRates(env);
  const pairs = summarisePairs(
    rows.map((r) => ({
      sourceLanguage: r.sourceLanguage,
      targetLanguage: r.targetLanguage,
      durationSeconds: r.durationSeconds,
      captionP50Ms: r.captionP50Ms,
      captionP95Ms: r.captionP95Ms,
      translationP50Ms: r.translationP50Ms,
      translationP95Ms: r.translationP95Ms,
      voiceP50Ms: r.voiceP50Ms,
      voiceP95Ms: r.voiceP95Ms,
      echoRemovedWords: r.echoRemovedWords ?? 0,
      asrSeconds: r.asrSeconds ?? 0,
      mtInputTokens: r.mtInputTokens ?? 0,
      mtOutputTokens: r.mtOutputTokens ?? 0,
      mtCacheReadTokens: r.mtCacheReadTokens ?? 0,
      mtCacheWriteTokens: r.mtCacheWriteTokens ?? 0,
      ttsCharacters: r.ttsCharacters ?? 0,
    })),
    rates,
  );
  // A session still running, or whose agent never reported, has no figures.
  const unreported = rows.filter((r) => r.durationSeconds === null).length;
  return {
    days,
    sessions: rows.length,
    unreported,
    pairs,
    costConfigured: Object.values(rates).some((r) => r > 0),
  };
}
