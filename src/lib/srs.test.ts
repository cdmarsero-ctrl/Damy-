import { describe, expect, it } from "vitest";

import { MIN_EASE, formatInterval, isMastered, previewAll, schedule, type CardSnapshot } from "./srs";

/**
 * Deterministic RNG pinned to the MIDPOINT of the fuzz range, so intervals come
 * back unmodified. (Returning 1 would pin it to the top of the range and inflate
 * every interval by 5%.)
 */
const noFuzz = () => 0.5;

function newCard(overrides: Partial<CardSnapshot> = {}): CardSnapshot {
  return {
    state: "NEW",
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    retention: 0,
    ...overrides,
  };
}

describe("srs.schedule", () => {
  describe("a brand new card", () => {
    it("enters learning on AGAIN and stays at the first step", () => {
      const result = schedule(newCard(), "AGAIN", new Date(), noFuzz);
      expect(result.state).toBe("LEARNING");
      expect(result.repetitions).toBe(0);
      expect(result.intervalDays).toBeLessThan(1);
    });

    it("advances through the learning steps on GOOD", () => {
      const first = schedule(newCard(), "GOOD", new Date(), noFuzz);
      expect(first.state).toBe("LEARNING");
      expect(first.repetitions).toBe(1);

      const second = schedule(first, "GOOD", new Date(), noFuzz);
      expect(second.state).toBe("REVIEW");
      expect(second.intervalDays).toBe(1);
    });

    it("graduates immediately on EASY, skipping the remaining steps", () => {
      const result = schedule(newCard(), "EASY", new Date(), noFuzz);
      expect(result.state).toBe("REVIEW");
      expect(result.intervalDays).toBe(4);
    });
  });

  describe("a mature review card", () => {
    const mature = newCard({
      state: "REVIEW",
      intervalDays: 60,
      repetitions: 8,
      easeFactor: 2.5,
      retention: 0.9,
    });

    it("multiplies the interval by the ease factor on GOOD", () => {
      const result = schedule(mature, "GOOD", new Date(), noFuzz);
      expect(result.intervalDays).toBeCloseTo(150, 0);
      expect(result.repetitions).toBe(9);
    });

    it("grows more slowly on HARD and reduces ease", () => {
      const result = schedule(mature, "HARD", new Date(), noFuzz);
      expect(result.intervalDays).toBeCloseTo(72, 0);
      expect(result.easeFactor).toBeLessThan(mature.easeFactor);
    });

    it("grows fastest on EASY and raises ease", () => {
      const result = schedule(mature, "EASY", new Date(), noFuzz);
      expect(result.intervalDays).toBeGreaterThan(150);
      expect(result.easeFactor).toBeGreaterThan(mature.easeFactor);
    });

    // This is the documented deviation from textbook SM-2: a single lapse on a
    // two-month card should not throw away two months of work.
    it("retains 30% of the interval on a lapse rather than resetting", () => {
      const result = schedule(mature, "AGAIN", new Date(), noFuzz);
      expect(result.state).toBe("RELEARNING");
      expect(result.lapses).toBe(1);
      expect(result.intervalDays).toBe(18);
      expect(result.intervalDays).toBeGreaterThan(0);
    });

    it("schedules the lapsed card for the short relearning step, not 18 days out", () => {
      const result = schedule(mature, "AGAIN", new Date(), noFuzz);
      const minutesUntilDue = (result.dueAt.getTime() - Date.now()) / 60_000;
      expect(minutesUntilDue).toBeLessThan(20);
    });
  });

  describe("relearning", () => {
    const relearning = newCard({
      state: "RELEARNING",
      intervalDays: 18,
      repetitions: 8,
      lapses: 1,
      retention: 0.5,
    });

    it("returns to review on a passing grade", () => {
      const result = schedule(relearning, "GOOD", new Date(), noFuzz);
      expect(result.state).toBe("REVIEW");
      expect(result.intervalDays).toBe(27);
    });

    it("stays in relearning on AGAIN", () => {
      const result = schedule(relearning, "AGAIN", new Date(), noFuzz);
      expect(result.state).toBe("RELEARNING");
    });
  });

  describe("invariants", () => {
    it("never lets ease fall below the floor, however many lapses", () => {
      let card = newCard({ state: "REVIEW", intervalDays: 30, repetitions: 5, easeFactor: 1.4 });
      for (let i = 0; i < 20; i += 1) {
        card = schedule(card, "AGAIN", new Date(), noFuzz);
        card = { ...card, state: "REVIEW" };
      }
      expect(card.easeFactor).toBeGreaterThanOrEqual(MIN_EASE);
    });

    it("caps the interval so a card cannot disappear for a decade", () => {
      let card = newCard({ state: "REVIEW", intervalDays: 300, repetitions: 20, easeFactor: 3.2 });
      for (let i = 0; i < 10; i += 1) {
        card = schedule(card, "EASY", new Date(), noFuzz);
      }
      expect(card.intervalDays).toBeLessThanOrEqual(365 * 2);
    });

    it("always schedules due dates in the future", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      for (const rating of ["AGAIN", "HARD", "GOOD", "EASY"] as const) {
        const result = schedule(newCard({ state: "REVIEW", intervalDays: 10, repetitions: 3 }), rating, now, noFuzz);
        expect(result.dueAt.getTime()).toBeGreaterThan(now.getTime());
      }
    });

    it("applies fuzz so cards added together do not come due together", () => {
      const card = newCard({ state: "REVIEW", intervalDays: 100, repetitions: 5 });
      const intervals = new Set(
        Array.from({ length: 40 }, () => schedule(card, "GOOD").intervalDays),
      );
      expect(intervals.size).toBeGreaterThan(1);
    });
  });

  describe("retention tracking", () => {
    it("rises with successful recall", () => {
      let card = newCard({ state: "REVIEW", intervalDays: 10, repetitions: 3, retention: 0.5 });
      for (let i = 0; i < 5; i += 1) card = schedule(card, "GOOD", new Date(), noFuzz);
      expect(card.retention).toBeGreaterThan(0.5);
    });

    it("falls after failures", () => {
      let card = newCard({ state: "REVIEW", intervalDays: 10, repetitions: 3, retention: 0.9 });
      card = schedule(card, "AGAIN", new Date(), noFuzz);
      expect(card.retention).toBeLessThan(0.9);
    });
  });
});

describe("srs.isMastered", () => {
  it("requires a long interval and high retention together", () => {
    expect(isMastered(newCard({ state: "REVIEW", intervalDays: 30, retention: 0.9 }))).toBe(true);
    expect(isMastered(newCard({ state: "REVIEW", intervalDays: 30, retention: 0.5 }))).toBe(false);
    expect(isMastered(newCard({ state: "REVIEW", intervalDays: 5, retention: 0.95 }))).toBe(false);
    expect(isMastered(newCard({ state: "LEARNING", intervalDays: 30, retention: 0.95 }))).toBe(false);
  });
});

describe("srs.previewAll", () => {
  it("returns a stable label for every grade", () => {
    const previews = previewAll(newCard({ state: "REVIEW", intervalDays: 10, repetitions: 3 }));
    expect(previews).toHaveLength(4);
    expect(previews.map((p) => p.rating)).toEqual(["AGAIN", "HARD", "GOOD", "EASY"]);
    for (const preview of previews) expect(preview.label).toMatch(/\d/);
  });

  it("orders the previews so harder grades mean shorter intervals", () => {
    const card = newCard({ state: "REVIEW", intervalDays: 20, repetitions: 4 });
    const again = schedule(card, "AGAIN", new Date(), () => 1);
    const good = schedule(card, "GOOD", new Date(), () => 1);
    const easy = schedule(card, "EASY", new Date(), () => 1);
    expect(again.dueAt.getTime()).toBeLessThan(good.dueAt.getTime());
    expect(good.dueAt.getTime()).toBeLessThan(easy.dueAt.getTime());
  });
});

describe("srs.formatInterval", () => {
  it("scales the unit to the magnitude", () => {
    expect(formatInterval(10 / (24 * 60))).toBe("10 min");
    expect(formatInterval(0.5)).toBe("12 h");
    expect(formatInterval(3)).toBe("3 d");
    expect(formatInterval(60)).toBe("2 mo");
    expect(formatInterval(400)).toBe("1.1 y");
  });
});
