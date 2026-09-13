import { json, parseQuery, requireApiUser, route } from "@/lib/api";
import { ALL_SKILLS, bandProgress, thetaToCefr } from "@/lib/cefr";
import { prisma } from "@/lib/db";
import { levelFromXp, utcDay } from "@/lib/gamification";
import { analyticsQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The analytics dashboard payload.
 *
 * All series are zero-filled across the requested window before returning.
 * Charting a sparse series is how you get a graph that implies a learner
 * studied every day when they studied on four of them.
 */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const { days } = parseQuery(req, analyticsQuerySchema);

  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = utcDay(since);

  const [xpEvents, snapshots, reviewLogs, lessonProgress, writing, pronunciation, profile, stats] =
    await Promise.all([
      prisma.xpEvent.findMany({
        where: { userId: claims.sub, createdAt: { gte: since } },
        select: { amount: true, source: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.skillSnapshot.findMany({
        where: { userId: claims.sub, date: { gte: sinceDay } },
        orderBy: { date: "asc" },
      }),
      prisma.reviewLog.findMany({
        where: { userId: claims.sub, reviewedAt: { gte: since } },
        select: { rating: true, reviewedAt: true, newInterval: true },
      }),
      prisma.lessonProgress.findMany({
        where: { userId: claims.sub, completedAt: { gte: since } },
        select: { score: true, completedAt: true, lesson: { select: { skill: true, cefr: true } } },
      }),
      prisma.writingSubmission.findMany({
        where: { userId: claims.sub, createdAt: { gte: since } },
        select: { createdAt: true, wordCount: true, feedback: { select: { overallBand: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.pronunciationAttempt.findMany({
        where: { userId: claims.sub, createdAt: { gte: since } },
        select: { createdAt: true, overall: true, accuracy: true, fluency: true, prosody: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.profile.findUnique({ where: { userId: claims.sub } }),
      prisma.userStats.findUnique({ where: { userId: claims.sub } }),
    ]);

  // --- daily XP series ------------------------------------------------------
  const dailyXp = zeroFilled(days, (key) => ({ date: key, xp: 0, activities: 0 }));
  for (const event of xpEvents) {
    const bucket = dailyXp.get(dayKey(event.createdAt));
    if (bucket) {
      bucket.xp += event.amount;
      bucket.activities += 1;
    }
  }

  // --- XP by source ---------------------------------------------------------
  const bySource = new Map<string, number>();
  for (const event of xpEvents) {
    bySource.set(event.source, (bySource.get(event.source) ?? 0) + event.amount);
  }

  // --- skill radar ----------------------------------------------------------
  const skillTotals = new Map<string, { sum: number; count: number }>();
  for (const snapshot of snapshots) {
    const entry = skillTotals.get(snapshot.skill) ?? { sum: 0, count: 0 };
    entry.sum += snapshot.score;
    entry.count += 1;
    skillTotals.set(snapshot.skill, entry);
  }
  const skillRadar = ALL_SKILLS.map((skill) => {
    const entry = skillTotals.get(skill);
    return {
      skill,
      score: entry ? Math.round((entry.sum / entry.count) * 100) : null,
      samples: entry?.count ?? 0,
    };
  });

  // --- retention ------------------------------------------------------------
  const graded = reviewLogs.length;
  const recalled = reviewLogs.filter((l) => l.rating !== "AGAIN").length;
  const retention = graded > 0 ? Math.round((recalled / graded) * 1000) / 10 : null;

  // --- forecast: how many cards fall due over the next fortnight -------------
  const upcoming = await prisma.reviewCard.groupBy({
    by: ["state"],
    where: {
      userId: claims.sub,
      suspended: false,
      dueAt: { lte: new Date(Date.now() + 14 * 86_400_000) },
    },
    _count: true,
  });

  const theta = profile?.theta ?? 0;
  const level = levelFromXp(stats?.xpTotal ?? 0);

  return json({
    window: { days, since },
    level: {
      ...level,
      cefr: thetaToCefr(theta),
      theta,
      bandProgress: bandProgress(theta),
    },
    dailyXp: [...dailyXp.values()],
    xpBySource: [...bySource.entries()]
      .map(([source, xp]) => ({ source, xp }))
      .sort((a, b) => b.xp - a.xp),
    skillRadar,
    reviews: {
      graded,
      retention,
      byRating: countBy(reviewLogs, (l) => l.rating),
      dueNextFortnight: upcoming.reduce((sum, u) => sum + u._count, 0),
    },
    lessons: {
      completed: lessonProgress.length,
      averageScore: mean(lessonProgress.map((l) => l.score)),
      bySkill: countBy(lessonProgress, (l) => l.lesson.skill),
    },
    writing: {
      submissions: writing.length,
      totalWords: writing.reduce((sum, w) => sum + w.wordCount, 0),
      bandTrend: writing
        .filter((w) => w.feedback)
        .map((w) => ({ date: dayKey(w.createdAt), band: w.feedback!.overallBand })),
    },
    pronunciation: {
      attempts: pronunciation.length,
      trend: pronunciation.map((p) => ({
        date: dayKey(p.createdAt),
        overall: p.overall,
        accuracy: p.accuracy,
        fluency: p.fluency,
        prosody: p.prosody,
      })),
      latest: pronunciation.at(-1) ?? null,
    },
    stats,
  });
});

function dayKey(date: Date): string {
  return utcDay(date).toISOString().slice(0, 10);
}

function zeroFilled<T extends { date: string }>(days: number, make: (key: string) => T) {
  const map = new Map<string, T>();
  const today = utcDay();
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    map.set(key, make(key));
  }
  return map;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
}
