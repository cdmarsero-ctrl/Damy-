import type { Prisma } from "@prisma/client";

import { json, requireApiUser, route } from "@/lib/api";
import { ALL_SKILLS, SKILL_LABEL, thetaToCefr } from "@/lib/cefr";
import { prisma } from "@/lib/db";
import { utcDay } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A personalised weekly feedback report.
 *
 * Built from measured behaviour, not model output — the point of the report is
 * that a learner can check every claim in it against their own dashboard.
 * Reports are stored so a learner can look back and see how the advice changed.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);

  const periodEnd = utcDay();
  const periodStart = new Date(periodEnd.getTime() - 7 * 86_400_000);

  const [snapshots, reviewLogs, lessons, writing, pronunciation, profile, xp] = await Promise.all([
    prisma.skillSnapshot.findMany({
      where: { userId: claims.sub, date: { gte: periodStart } },
    }),
    prisma.reviewLog.findMany({
      where: { userId: claims.sub, reviewedAt: { gte: periodStart } },
      select: { rating: true },
    }),
    prisma.lessonProgress.findMany({
      where: { userId: claims.sub, completedAt: { gte: periodStart } },
      select: { score: true, lesson: { select: { skill: true, title: true } } },
    }),
    prisma.writingSubmission.findMany({
      where: { userId: claims.sub, createdAt: { gte: periodStart } },
      include: { feedback: { select: { overallBand: true, priorities: true } } },
    }),
    prisma.pronunciationAttempt.findMany({
      where: { userId: claims.sub, createdAt: { gte: periodStart } },
      select: { overall: true, tips: true },
    }),
    prisma.profile.findUnique({ where: { userId: claims.sub } }),
    prisma.xpEvent.aggregate({
      where: { userId: claims.sub, createdAt: { gte: periodStart } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // --- skill averages -------------------------------------------------------
  const bySkill = new Map<string, number[]>();
  for (const snapshot of snapshots) {
    const list = bySkill.get(snapshot.skill) ?? [];
    list.push(snapshot.score);
    bySkill.set(snapshot.skill, list);
  }
  const averages = [...bySkill.entries()]
    .map(([skill, scores]) => ({
      skill,
      score: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.score - a.score);

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const entry of averages.slice(0, 2)) {
    if (entry.score >= 0.7) {
      strengths.push(
        `${SKILL_LABEL[entry.skill as keyof typeof SKILL_LABEL]} is holding at ${Math.round(entry.score * 100)}% across the week.`,
      );
    }
  }
  for (const entry of averages.slice(-2).reverse()) {
    if (entry.score < 0.65) {
      weaknesses.push(
        `${SKILL_LABEL[entry.skill as keyof typeof SKILL_LABEL]} is your weakest area at ${Math.round(entry.score * 100)}%.`,
      );
    }
  }

  const untouched = ALL_SKILLS.filter((s) => !bySkill.has(s));
  if (untouched.length >= 3) {
    weaknesses.push(
      `You did not practise ${untouched.slice(0, 3).map((s) => SKILL_LABEL[s].toLowerCase()).join(", ")} at all this week.`,
    );
  }

  // --- recall ---------------------------------------------------------------
  const recalled = reviewLogs.filter((l) => l.rating !== "AGAIN").length;
  const retention = reviewLogs.length ? recalled / reviewLogs.length : null;

  if (retention !== null) {
    if (retention >= 0.9) {
      strengths.push(`Recall is excellent — ${Math.round(retention * 100)}% of ${reviewLogs.length} cards remembered.`);
    } else if (retention < 0.75) {
      weaknesses.push(
        `Recall sits at ${Math.round(retention * 100)}%. Below 80% usually means too many new cards at once, not a bad memory.`,
      );
    }
  }

  // --- recommendations ------------------------------------------------------
  const recommendations: { title: string; why: string; action: string; href: string }[] = [];

  if (reviewLogs.length === 0) {
    recommendations.push({
      title: "Restart your review habit",
      why: "You graded no cards this week. Spaced repetition only works if the spacing is respected.",
      action: "Clear today's queue — fifteen cards takes about four minutes.",
      href: "/review",
    });
  } else if (retention !== null && retention < 0.75) {
    recommendations.push({
      title: "Slow the intake",
      why: `Recall at ${Math.round(retention * 100)}% means you are adding words faster than you are consolidating them.`,
      action: "Review only your due cards for a week before adding new vocabulary.",
      href: "/review",
    });
  }

  if (writing.length === 0) {
    recommendations.push({
      title: "Write something this week",
      why: "Writing is the skill that exposes gaps recognition tasks hide. You submitted nothing in the last seven days.",
      action: "Take one 250-word task in the writing studio.",
      href: "/writing",
    });
  } else {
    const priorities = writing.flatMap((w) => w.feedback?.priorities ?? []);
    if (priorities.length) {
      recommendations.push({
        title: "Close the loop on your last feedback",
        why: `Your writing feedback flagged: ${priorities[0]}`,
        action: "Rewrite that piece addressing the priority, and resubmit it.",
        href: "/writing",
      });
    }
  }

  if (pronunciation.length === 0) {
    recommendations.push({
      title: "Say it out loud",
      why: "No pronunciation practice logged. At C1+, intelligibility gaps are usually prosodic, and you cannot hear your own prosody without recording it.",
      action: "Run three sentences through the pronunciation lab.",
      href: "/pronunciation",
    });
  }

  if (averages.length && averages[averages.length - 1].score < 0.6) {
    const weakest = averages[averages.length - 1].skill;
    recommendations.push({
      title: `Target ${SKILL_LABEL[weakest as keyof typeof SKILL_LABEL].toLowerCase()} directly`,
      why: "Mixed practice is efficient for maintenance but slow for repair. Isolate the weak skill.",
      action: "Pick a lesson in that skill and finish it before anything else.",
      href: "/path",
    });
  }

  const totalXp = xp._sum.amount ?? 0;
  const summary =
    totalXp === 0
      ? "No activity recorded this week. The single most effective thing you can do is a short session today — momentum matters more than volume at this level."
      : `${totalXp} XP across ${xp._count} activities. ${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}, ${reviewLogs.length} cards, ${writing.length} ${writing.length === 1 ? "submission" : "submissions"}. ` +
        `Currently working at ${thetaToCefr(profile?.theta ?? 0)}${
          retention !== null ? ` with ${Math.round(retention * 100)}% recall` : ""
        }.`;

  const report = await prisma.feedbackReport.upsert({
    where: { userId_periodStart: { userId: claims.sub, periodStart } },
    update: {
      summary,
      strengths: strengths.slice(0, 4),
      weaknesses: weaknesses.slice(0, 4),
      recommendations: recommendations.slice(0, 4) as unknown as Prisma.InputJsonValue,
      metrics: { totalXp, activities: xp._count, retention } as Prisma.InputJsonValue,
    },
    create: {
      userId: claims.sub,
      periodStart,
      periodEnd,
      summary,
      strengths: strengths.slice(0, 4),
      weaknesses: weaknesses.slice(0, 4),
      recommendations: recommendations.slice(0, 4) as unknown as Prisma.InputJsonValue,
      metrics: { totalXp, activities: xp._count, retention } as Prisma.InputJsonValue,
    },
  });

  return json({ report });
});

export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const reports = await prisma.feedbackReport.findMany({
    where: { userId: claims.sub },
    orderBy: { periodStart: "desc" },
    take: 12,
  });
  return json({ reports });
});
