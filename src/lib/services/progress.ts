import "server-only";

import type { ChallengeType, Prisma, Skill } from "@prisma/client";

import { thetaToCefr } from "../cefr";
import { prisma } from "../db";
import {
  applyActivity,
  awardXp,
  badgeProgress,
  levelFromXp,
  utcDay,
  type BadgeMetrics,
  type XpSource,
} from "../gamification";

/**
 * The single funnel through which progress is recorded.
 *
 * Every activity — a graded exercise, a review, a writing submission — ends up
 * here so that XP, streaks, badges, daily challenges and the analytics
 * snapshot stay consistent. Doing this in each route handler was the obvious
 * alternative and would guarantee that one of them eventually forgets to bump
 * the streak.
 */

export interface ActivityInput {
  userId: string;
  source: XpSource;
  refId?: string;
  /** 0-1 quality of the work, scales the award. */
  scoreRatio?: number;
  /** Which counter on UserStats to bump, if any. */
  counter?: "lessonsCompleted" | "reviewsCompleted";
  /** Skill this activity exercised, for the analytics snapshot. */
  skill?: Skill;
  minutes?: number;
  /** Challenge progress this activity contributes to. */
  challengeContributions?: Partial<Record<ChallengeType, number>>;
}

export interface ActivityResult {
  xpAwarded: number;
  xpTotal: number;
  level: number;
  levelUp: boolean;
  streakCurrent: number;
  streakExtended: boolean;
  freezeUsed: boolean;
  newBadges: { slug: string; title: string; tier: string; icon: string }[];
  completedChallenges: { title: string; xpReward: number }[];
}

export async function recordActivity(input: ActivityInput): Promise<ActivityResult> {
  const {
    userId,
    source,
    refId,
    scoreRatio = 1,
    counter,
    skill,
    minutes = 0,
    challengeContributions,
  } = input;

  return prisma.$transaction(async (tx) => {
    const stats =
      (await tx.userStats.findUnique({ where: { userId } })) ??
      (await tx.userStats.create({ data: { userId } }));

    const before = levelFromXp(stats.xpTotal);

    // --- streak -------------------------------------------------------------
    const streak = applyActivity(
      {
        streakCurrent: stats.streakCurrent,
        streakLongest: stats.streakLongest,
        lastActiveDate: stats.lastActiveDate,
        streakFreezes: stats.streakFreezes,
      },
    );

    // --- xp -----------------------------------------------------------------
    const xpAwarded = awardXp(source, streak.streakCurrent, scoreRatio);
    const xpTotal = stats.xpTotal + xpAwarded;
    const after = levelFromXp(xpTotal);

    await tx.xpEvent.create({
      data: { userId, amount: xpAwarded, source, refId: refId ?? null },
    });

    const updated = await tx.userStats.update({
      where: { userId },
      data: {
        xpTotal,
        level: after.level,
        streakCurrent: streak.streakCurrent,
        streakLongest: streak.streakLongest,
        lastActiveDate: streak.lastActiveDate,
        streakFreezes: streak.streakFreezes,
        minutesTotal: { increment: minutes },
        ...(counter ? { [counter]: { increment: 1 } } : {}),
      },
    });

    // --- daily challenges ---------------------------------------------------
    const completedChallenges: ActivityResult["completedChallenges"] = [];
    const contributions: Partial<Record<ChallengeType, number>> = {
      XP: xpAwarded,
      ...challengeContributions,
    };

    const today = utcDay();
    const challenges = await tx.dailyChallenge.findMany({ where: { date: today } });

    for (const challenge of challenges) {
      const delta = contributions[challenge.type];
      if (!delta) continue;

      const link =
        (await tx.userDailyChallenge.findUnique({
          where: { userId_challengeId: { userId, challengeId: challenge.id } },
        })) ??
        (await tx.userDailyChallenge.create({
          data: { userId, challengeId: challenge.id },
        }));

      if (link.completedAt) continue;

      const progress = link.progress + delta;
      const done = progress >= challenge.target;

      await tx.userDailyChallenge.update({
        where: { id: link.id },
        data: { progress, completedAt: done ? new Date() : null },
      });

      if (done) {
        // Challenge rewards are flat — they must not compound with the
        // streak multiplier, or a long streak makes challenges trivial.
        await tx.xpEvent.create({
          data: { userId, amount: challenge.xpReward, source: "challenge", refId: challenge.id },
        });
        await tx.userStats.update({
          where: { userId },
          data: { xpTotal: { increment: challenge.xpReward } },
        });
        completedChallenges.push({ title: challenge.title, xpReward: challenge.xpReward });
      }
    }

    // --- analytics snapshot -------------------------------------------------
    if (skill) {
      await tx.skillSnapshot.upsert({
        where: { userId_skill_date: { userId, skill, date: today } },
        // A day's score is the running mean of that day's activity, so one
        // careless attempt does not erase a good session.
        update: { score: { set: await blendSkillScore(tx, userId, skill, today, scoreRatio) } },
        create: {
          userId,
          skill,
          date: today,
          score: scoreRatio,
          cefrEstimate: scoreEstimateToCefr(scoreRatio),
        },
      });
    }

    // --- badges -------------------------------------------------------------
    const newBadges = await evaluateBadges(tx, userId, {
      xpTotal,
      level: after.level,
      streakCurrent: updated.streakCurrent,
      streakLongest: updated.streakLongest,
      lessonsCompleted: updated.lessonsCompleted,
      reviewsCompleted: updated.reviewsCompleted,
      wordsMastered: updated.wordsMastered,
      minutesTotal: updated.minutesTotal,
      writingSubmissions: await tx.writingSubmission.count({ where: { userId } }),
      debateTurns: await tx.message.count({
        where: { conversation: { userId, mode: "DEBATE" }, role: "USER" },
      }),
      perfectLessons: await tx.lessonProgress.count({ where: { userId, bestScore: 1 } }),
      examAttempts: await tx.examAttempt.count({ where: { userId, status: "SCORED" } }),
    });

    return {
      xpAwarded,
      xpTotal: xpTotal + completedChallenges.reduce((sum, c) => sum + c.xpReward, 0),
      level: after.level,
      levelUp: after.level > before.level,
      streakCurrent: updated.streakCurrent,
      streakExtended: streak.extended,
      freezeUsed: streak.freezeUsed,
      newBadges,
      completedChallenges,
    };
  });
}

type Tx = Prisma.TransactionClient;

/** Running mean of today's scores for one skill. */
async function blendSkillScore(
  tx: Tx,
  userId: string,
  skill: Skill,
  date: Date,
  newScore: number,
): Promise<number> {
  const existing = await tx.skillSnapshot.findUnique({
    where: { userId_skill_date: { userId, skill, date } },
  });
  if (!existing) return newScore;
  // Weight recent activity a little more heavily than the day's history.
  return Math.round((existing.score * 0.7 + newScore * 0.3) * 1000) / 1000;
}

function scoreEstimateToCefr(score: number) {
  // Map a 0-1 performance ratio onto the logit scale the placement test uses,
  // so the two estimates are directly comparable on the analytics page.
  const theta = (score - 0.5) * 4;
  return thetaToCefr(theta);
}

async function evaluateBadges(
  tx: Tx,
  userId: string,
  metrics: BadgeMetrics,
): Promise<ActivityResult["newBadges"]> {
  const badges = await tx.badge.findMany();
  const existing = await tx.userBadge.findMany({ where: { userId } });
  const byBadgeId = new Map(existing.map((b) => [b.badgeId, b]));

  const earned: ActivityResult["newBadges"] = [];

  for (const badge of badges) {
    const progress = badgeProgress(badge.criteria, metrics);
    const current = byBadgeId.get(badge.id);

    if (current?.earnedAt) continue;

    const justEarned = progress >= 1;
    await tx.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
      update: { progress, ...(justEarned ? { earnedAt: new Date() } : {}) },
      create: {
        userId,
        badgeId: badge.id,
        progress,
        ...(justEarned ? { earnedAt: new Date() } : {}),
      },
    });

    if (justEarned) {
      earned.push({ slug: badge.slug, title: badge.title, tier: badge.tier, icon: badge.icon });
    }
  }

  return earned;
}

/** Recomputes a track's completion percentage after a lesson finishes. */
export async function refreshEnrollmentProgress(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { unit: { select: { trackId: true } } },
  });
  if (!lesson) return;

  const trackId = lesson.unit.trackId;

  const [total, completed] = await Promise.all([
    prisma.lesson.count({ where: { unit: { trackId }, published: true } }),
    prisma.lessonProgress.count({
      where: {
        userId,
        status: { in: ["COMPLETED", "MASTERED"] },
        lesson: { unit: { trackId } },
      },
    }),
  ]);

  const progressPct = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

  await prisma.enrollment.upsert({
    where: { userId_trackId: { userId, trackId } },
    update: {
      progressPct,
      ...(progressPct >= 100 ? { completedAt: new Date() } : { completedAt: null }),
    },
    create: { userId, trackId, progressPct },
  });
}
