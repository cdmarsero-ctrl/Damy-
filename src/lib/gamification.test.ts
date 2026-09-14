import { describe, expect, it } from "vitest";

import {
  MAX_LEVEL, applyActivity, awardXp, badgeProgress, daysBetween, levelFromXp,
  streakMultiplier, utcDay, xpForLevel, type BadgeMetrics, type StreakState,
} from "./gamification";

describe("gamification.levelFromXp", () => {
  it("starts everyone at level 1 with no XP", () => {
    const level = levelFromXp(0);
    expect(level.level).toBe(1);
    expect(level.progress).toBe(0);
  });

  it("increases monotonically with XP", () => {
    let previous = 0;
    for (const xp of [0, 100, 500, 2_000, 10_000, 50_000, 500_000]) {
      const level = levelFromXp(xp).level;
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("reports progress within the current level as a 0-1 fraction", () => {
    const level = levelFromXp(xpForLevel(5) + 1);
    expect(level.level).toBe(5);
    expect(level.progress).toBeGreaterThan(0);
    expect(level.progress).toBeLessThan(1);
  });

  it("caps at the maximum level rather than growing forever", () => {
    const level = levelFromXp(100_000_000);
    expect(level.level).toBe(MAX_LEVEL);
    expect(level.isMax).toBe(true);
    expect(level.progress).toBe(1);
  });

  // The curve should be gentle early and slow later, so "level" keeps meaning
  // something after six months instead of saturating.
  it("requires progressively more XP per level", () => {
    const early = xpForLevel(6) - xpForLevel(5);
    const late = xpForLevel(51) - xpForLevel(50);
    expect(late).toBeGreaterThan(early * 3);
  });
});

describe("gamification.streakMultiplier", () => {
  it("gives no bonus on day one", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1);
  });

  it("steps up weekly", () => {
    expect(streakMultiplier(7)).toBeCloseTo(1.1, 5);
    expect(streakMultiplier(14)).toBeCloseTo(1.2, 5);
  });

  // Uncapped, a year-long streak would make the leaderboard unwinnable.
  it("caps at +50%", () => {
    expect(streakMultiplier(365)).toBe(1.5);
    expect(streakMultiplier(10_000)).toBe(1.5);
  });
});

describe("gamification.awardXp", () => {
  it("pays more for productive work than for recognition tasks", () => {
    expect(awardXp("writingSubmission")).toBeGreaterThan(awardXp("reviewCard"));
    expect(awardXp("debateTurn")).toBeGreaterThan(awardXp("reviewCard"));
  });

  it("scales with the quality of the work", () => {
    expect(awardXp("lessonComplete", 0, 1)).toBeGreaterThan(awardXp("lessonComplete", 0, 0.2));
  });

  it("applies the streak multiplier", () => {
    expect(awardXp("lessonComplete", 14, 1)).toBeGreaterThan(awardXp("lessonComplete", 0, 1));
  });

  it("never awards less than one XP", () => {
    expect(awardXp("reviewCard", 0, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("gamification.applyActivity", () => {
  const base: StreakState = {
    streakCurrent: 5,
    streakLongest: 10,
    lastActiveDate: null,
    streakFreezes: 2,
  };

  const day = (iso: string) => new Date(`${iso}T10:00:00Z`);

  it("starts a streak for a first-time learner", () => {
    const result = applyActivity({ ...base, streakCurrent: 0, lastActiveDate: null });
    expect(result.streakCurrent).toBe(1);
    expect(result.extended).toBe(true);
  });

  it("is a no-op for a second session on the same day", () => {
    const today = utcDay();
    const result = applyActivity({ ...base, lastActiveDate: today });
    expect(result.changed).toBe(false);
    expect(result.streakCurrent).toBe(5);
  });

  it("extends the streak on a consecutive day", () => {
    const result = applyActivity(
      { ...base, lastActiveDate: day("2026-03-01") },
      day("2026-03-02"),
    );
    expect(result.streakCurrent).toBe(6);
    expect(result.extended).toBe(true);
  });

  it("updates the longest streak when the current one overtakes it", () => {
    const result = applyActivity(
      { ...base, streakCurrent: 10, streakLongest: 10, lastActiveDate: day("2026-03-01") },
      day("2026-03-02"),
    );
    expect(result.streakLongest).toBe(11);
  });

  it("spends a freeze to survive one missed day", () => {
    const result = applyActivity(
      { ...base, lastActiveDate: day("2026-03-01") },
      day("2026-03-03"),
    );
    expect(result.streakCurrent).toBe(6);
    expect(result.freezeUsed).toBe(true);
    expect(result.streakFreezes).toBe(1);
  });

  it("breaks the streak when a day is missed and no freeze is left", () => {
    const result = applyActivity(
      { ...base, streakFreezes: 0, lastActiveDate: day("2026-03-01") },
      day("2026-03-03"),
    );
    expect(result.streakCurrent).toBe(1);
    expect(result.freezeUsed).toBe(false);
    expect(result.extended).toBe(false);
  });

  it("breaks the streak after a long absence even with freezes available", () => {
    const result = applyActivity(
      { ...base, lastActiveDate: day("2026-03-01") },
      day("2026-03-20"),
    );
    expect(result.streakCurrent).toBe(1);
    expect(result.streakFreezes).toBe(2);
  });

  it("preserves the longest streak through a break", () => {
    const result = applyActivity(
      { ...base, streakFreezes: 0, streakLongest: 40, lastActiveDate: day("2026-03-01") },
      day("2026-03-10"),
    );
    expect(result.streakLongest).toBe(40);
  });
});

describe("gamification.utcDay and daysBetween", () => {
  // The reason streaks use UTC: a learner flying from Tokyo to London must not
  // lose a streak to a timezone change.
  it("normalises any time of day to UTC midnight", () => {
    const morning = utcDay(new Date("2026-03-15T00:30:00Z"));
    const evening = utcDay(new Date("2026-03-15T23:30:00Z"));
    expect(morning.getTime()).toBe(evening.getTime());
  });

  it("counts whole calendar days between two instants", () => {
    expect(daysBetween(new Date("2026-03-01T22:00:00Z"), new Date("2026-03-02T02:00:00Z"))).toBe(1);
    expect(daysBetween(new Date("2026-03-01T00:00:00Z"), new Date("2026-03-01T23:59:00Z"))).toBe(0);
  });
});

describe("gamification.badgeProgress", () => {
  const metrics: BadgeMetrics = {
    xpTotal: 5_000,
    level: 12,
    streakCurrent: 15,
    streakLongest: 30,
    lessonsCompleted: 25,
    reviewsCompleted: 400,
    wordsMastered: 60,
    minutesTotal: 900,
    writingSubmissions: 8,
    debateTurns: 12,
    perfectLessons: 5,
    examAttempts: 2,
  };

  it("reports partial progress towards an unmet criterion", () => {
    expect(badgeProgress({ metric: "wordsMastered", gte: 120 }, metrics)).toBe(0.5);
  });

  it("reports completion once the threshold is met", () => {
    expect(badgeProgress({ metric: "streakCurrent", gte: 7 }, metrics)).toBe(1);
  });

  it("never exceeds 1", () => {
    expect(badgeProgress({ metric: "xpTotal", gte: 100 }, metrics)).toBe(1);
  });

  it("returns 0 for a malformed criterion rather than throwing", () => {
    expect(badgeProgress(null, metrics)).toBe(0);
    expect(badgeProgress({ nonsense: true }, metrics)).toBe(0);
  });
});
