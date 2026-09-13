import type { BadgeTier } from "@prisma/client";

/**
 * XP, levels, streaks and badges.
 *
 * Level curve: level N requires 100 * N^1.6 cumulative XP. That is gentle for
 * the first week (level 5 ≈ 1.4k XP, about five days of hitting a 50 XP goal)
 * and meaningfully slower afterwards, so "level" keeps signalling something at
 * month six instead of saturating.
 */

const LEVEL_BASE = 100;
const LEVEL_EXPONENT = 1.6;
export const MAX_LEVEL = 100;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(LEVEL_BASE * Math.pow(level - 1, LEVEL_EXPONENT));
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0-1
  isMax: boolean;
}

export function levelFromXp(xpTotal: number): LevelInfo {
  let level = 1;
  while (level < MAX_LEVEL && xpTotal >= xpForLevel(level + 1)) level += 1;

  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const isMax = level >= MAX_LEVEL;

  return {
    level,
    xpIntoLevel: xpTotal - floor,
    xpForNextLevel: isMax ? 0 : ceiling - floor,
    progress: isMax ? 1 : (xpTotal - floor) / (ceiling - floor),
    isMax,
  };
}

// --- XP awards --------------------------------------------------------------

/**
 * Base XP by activity. Productive skills (writing, speaking) pay more than
 * recognition tasks because they cost the learner more effort — the economy
 * should not reward grinding easy multiple-choice.
 */
export const XP_RULES = {
  lessonComplete: 20,
  perfectLessonBonus: 10,
  reviewCard: 2,
  reviewStreakBonus: 5,
  writingSubmission: 35,
  speakingTurn: 6,
  pronunciationAttempt: 8,
  debateTurn: 10,
  examTaskCorrect: 4,
  placementComplete: 50,
  dailyChallenge: 30,
} as const;

export type XpSource = keyof typeof XP_RULES;

/** Streaks multiply XP up to +50% at 30 days — capped so a long streak is an
 *  advantage, not an insurmountable leaderboard moat. */
export function streakMultiplier(streakDays: number): number {
  if (streakDays <= 1) return 1;
  return Math.min(1.5, 1 + Math.floor(streakDays / 7) * 0.1);
}

export function awardXp(source: XpSource, streakDays = 0, scoreRatio = 1): number {
  const base = XP_RULES[source];
  const quality = 0.5 + 0.5 * Math.min(1, Math.max(0, scoreRatio));
  return Math.max(1, Math.round(base * quality * streakMultiplier(streakDays)));
}

// --- streaks ----------------------------------------------------------------

/** Calendar day at UTC midnight. Using UTC everywhere keeps a streak from
 *  breaking when a learner flies across timezones. */
export function utcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((utcDay(b).getTime() - utcDay(a).getTime()) / 86_400_000);
}

export interface StreakState {
  streakCurrent: number;
  streakLongest: number;
  lastActiveDate: Date | null;
  streakFreezes: number;
}

export interface StreakUpdate extends StreakState {
  changed: boolean;
  /** True when a freeze was spent to save the streak — the UI calls this out. */
  freezeUsed: boolean;
  extended: boolean;
}

export function applyActivity(state: StreakState, now: Date = new Date()): StreakUpdate {
  const today = utcDay(now);
  const last = state.lastActiveDate ? utcDay(state.lastActiveDate) : null;

  if (!last) {
    return {
      ...state,
      streakCurrent: 1,
      streakLongest: Math.max(1, state.streakLongest),
      lastActiveDate: today,
      changed: true,
      freezeUsed: false,
      extended: true,
    };
  }

  const gap = daysBetween(last, today);

  if (gap === 0) {
    return { ...state, changed: false, freezeUsed: false, extended: false };
  }

  if (gap === 1) {
    const streakCurrent = state.streakCurrent + 1;
    return {
      ...state,
      streakCurrent,
      streakLongest: Math.max(streakCurrent, state.streakLongest),
      lastActiveDate: today,
      changed: true,
      freezeUsed: false,
      extended: true,
    };
  }

  // One missed day can be covered by a freeze, if the learner has one.
  if (gap === 2 && state.streakFreezes > 0) {
    const streakCurrent = state.streakCurrent + 1;
    return {
      ...state,
      streakCurrent,
      streakLongest: Math.max(streakCurrent, state.streakLongest),
      lastActiveDate: today,
      streakFreezes: state.streakFreezes - 1,
      changed: true,
      freezeUsed: true,
      extended: true,
    };
  }

  return {
    ...state,
    streakCurrent: 1,
    lastActiveDate: today,
    changed: true,
    freezeUsed: false,
    extended: false,
  };
}

// --- badges -----------------------------------------------------------------

/** A badge's criteria is `{ metric, gte }`, evaluated against this shape. */
export interface BadgeMetrics {
  xpTotal: number;
  level: number;
  streakCurrent: number;
  streakLongest: number;
  lessonsCompleted: number;
  reviewsCompleted: number;
  wordsMastered: number;
  minutesTotal: number;
  writingSubmissions: number;
  debateTurns: number;
  perfectLessons: number;
  examAttempts: number;
}

export interface BadgeCriteria {
  metric: keyof BadgeMetrics;
  gte: number;
}

export function isCriteria(value: unknown): value is BadgeCriteria {
  return (
    typeof value === "object" &&
    value !== null &&
    "metric" in value &&
    "gte" in value &&
    typeof (value as BadgeCriteria).gte === "number"
  );
}

export function badgeProgress(criteria: unknown, metrics: BadgeMetrics): number {
  if (!isCriteria(criteria)) return 0;
  const current = metrics[criteria.metric] ?? 0;
  if (criteria.gte <= 0) return 1;
  return Math.min(1, current / criteria.gte);
}

export const TIER_COLOR: Record<BadgeTier, string> = {
  BRONZE: "text-amber-700 dark:text-amber-500",
  SILVER: "text-slate-500 dark:text-slate-300",
  GOLD: "text-yellow-600 dark:text-yellow-400",
  PLATINUM: "text-cyan-600 dark:text-cyan-300",
};
