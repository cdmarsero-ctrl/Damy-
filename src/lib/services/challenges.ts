import "server-only";

import type { ChallengeType } from "@prisma/client";

import { prisma } from "../db";

/**
 * Daily challenges.
 *
 * Generated lazily on the first request of each UTC day rather than by a cron
 * job, so the app has no scheduler dependency. The unique constraint on
 * (date, type) makes concurrent first-requests safe — whichever transaction
 * loses the race simply finds the rows already there.
 */

interface Template {
  type: ChallengeType;
  title: string;
  description: string;
  target: number;
  xpReward: number;
}

/**
 * Three challenges a day: one cheap enough to guarantee a win, one that
 * requires a real session, one that pushes toward a skill learners avoid.
 * The third rotates so speaking and writing come round regularly — they are
 * the ones people skip, and they are the ones that move the CEFR needle.
 */
const EASY: Template[] = [
  { type: "XP", title: "Warm up", description: "Earn 40 XP today.", target: 40, xpReward: 20 },
  { type: "REVIEWS", title: "Clear the deck", description: "Grade 15 review cards.", target: 15, xpReward: 20 },
  { type: "LESSONS", title: "One good lesson", description: "Finish a lesson.", target: 1, xpReward: 20 },
];

const MEDIUM: Template[] = [
  { type: "XP", title: "Sustained session", description: "Earn 120 XP today.", target: 120, xpReward: 40 },
  { type: "REVIEWS", title: "Deep review", description: "Grade 40 review cards.", target: 40, xpReward: 40 },
  { type: "LESSONS", title: "Double up", description: "Finish two lessons.", target: 2, xpReward: 40 },
  { type: "PERFECT_LESSON", title: "Flawless", description: "Complete a lesson with a perfect score.", target: 1, xpReward: 50 },
];

const PRODUCTIVE: Template[] = [
  { type: "WRITING_WORDS", title: "Put it in writing", description: "Write 250 words and submit them for feedback.", target: 250, xpReward: 60 },
  { type: "SPEAKING_MINUTES", title: "Find your voice", description: "Complete 8 speaking or conversation turns.", target: 8, xpReward: 60 },
  { type: "WRITING_WORDS", title: "Sustained argument", description: "Write 400 words in a single submission.", target: 400, xpReward: 70 },
  { type: "SPEAKING_MINUTES", title: "Hold the floor", description: "Complete 12 speaking or conversation turns.", target: 12, xpReward: 70 },
];

/** Deterministic rotation from the date — the same for every learner on a
 *  given day, which is what makes a shared leaderboard fair. */
function pickFor(date: Date, pool: Template[], offset: number): Template {
  const dayNumber = Math.floor(date.getTime() / 86_400_000);
  return pool[(dayNumber + offset) % pool.length];
}

export async function ensureTodaysChallenges(date: Date): Promise<void> {
  const existing = await prisma.dailyChallenge.count({ where: { date } });
  if (existing >= 3) return;

  const chosen = [
    pickFor(date, EASY, 0),
    pickFor(date, MEDIUM, 1),
    pickFor(date, PRODUCTIVE, 2),
  ];

  // Deduplicate by type — the (date, type) constraint permits only one of each,
  // and two XP challenges on the same day would be pointless anyway.
  const seen = new Set<ChallengeType>();
  const unique = chosen.filter((t) => {
    if (seen.has(t.type)) return false;
    seen.add(t.type);
    return true;
  });

  await prisma.dailyChallenge.createMany({
    data: unique.map((t) => ({
      date,
      type: t.type,
      title: t.title,
      description: t.description,
      target: t.target,
      xpReward: t.xpReward,
    })),
    skipDuplicates: true,
  });
}
