import { describe, expect, it } from "vitest";

import {
  MAX_ITEMS, MIN_ITEMS, TARGET_SE, estimate, information, probability, selectNext,
  shouldStop, subscores, summarise, type ItemParams, type Response,
} from "./placement";
import { thetaToCefr } from "./cefr";

function item(overrides: Partial<ItemParams> = {}): ItemParams {
  return { id: "i", skill: "GRAMMAR", cefr: "C1", a: 1.2, b: 0, c: 0.25, ...overrides };
}

function bank(): ItemParams[] {
  const skills: ItemParams["skill"][] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING"];
  const out: ItemParams[] = [];
  for (let i = 0; i < 40; i += 1) {
    out.push(
      item({
        id: `item-${i}`,
        skill: skills[i % skills.length],
        b: -2.5 + (i / 39) * 5,
        a: 1 + (i % 3) * 0.25,
      }),
    );
  }
  return out;
}

describe("placement.probability", () => {
  it("returns the guessing floor for an ability far below the difficulty", () => {
    expect(probability(-5, item({ b: 2, c: 0.25 }))).toBeCloseTo(0.25, 2);
  });

  it("approaches certainty for an ability far above the difficulty", () => {
    expect(probability(5, item({ b: -2 }))).toBeGreaterThan(0.99);
  });

  it("sits midway between the floor and 1 when ability equals difficulty", () => {
    expect(probability(0.5, item({ b: 0.5, c: 0.25 }))).toBeCloseTo(0.625, 2);
  });

  it("increases monotonically with ability", () => {
    const target = item({ b: 0.5 });
    let previous = 0;
    for (let theta = -4; theta <= 4; theta += 0.5) {
      const p = probability(theta, target);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });
});

describe("placement.information", () => {
  it("peaks near the item's difficulty", () => {
    const target = item({ b: 1 });
    const atPeak = information(1, target);
    expect(atPeak).toBeGreaterThan(information(-2, target));
    expect(atPeak).toBeGreaterThan(information(3.5, target));
  });

  it("is higher for a more discriminating item", () => {
    expect(information(0, item({ a: 2 }))).toBeGreaterThan(information(0, item({ a: 0.6 })));
  });
});

describe("placement.estimate", () => {
  it("returns the prior mean with no responses", () => {
    const result = estimate([]);
    expect(result.theta).toBeCloseTo(0, 1);
    expect(result.se).toBeGreaterThan(0.9);
  });

  // The reason for EAP over MLE: these two patterns send MLE to ±infinity.
  it("does not diverge when every answer is correct", () => {
    // Maximum likelihood sends theta to +infinity on this pattern; the prior
    // keeps EAP finite and inside the grid.
    const result = estimate(bank().map((i) => ({ item: i, correct: true })));
    expect(Number.isFinite(result.theta)).toBe(true);
    expect(result.theta).toBeLessThan(4);
    expect(result.theta).toBeGreaterThan(1);
  });

  it("does not diverge when every answer is wrong", () => {
    const result = estimate(bank().map((i) => ({ item: i, correct: false })));
    expect(Number.isFinite(result.theta)).toBe(true);
    expect(result.theta).toBeGreaterThan(-4);
    expect(result.theta).toBeLessThan(-1);
  });

  it("does not overstate ability when only easy items were answered", () => {
    // All correct, but every item was well below average difficulty — the
    // estimate should be modest, not maximal.
    const easyOnly = bank().filter((i) => i.b < -0.5);
    const result = estimate(easyOnly.map((i) => ({ item: i, correct: true })));
    expect(result.theta).toBeLessThan(1.5);
    expect(result.theta).toBeGreaterThan(0);
  });

  it("becomes more precise as evidence accumulates", () => {
    const pool = bank();
    const few = estimate(pool.slice(0, 3).map((i) => ({ item: i, correct: true })));
    const many = estimate(pool.slice(0, 25).map((i) => ({ item: i, correct: i.b < 0.5 })));
    expect(many.se).toBeLessThan(few.se);
  });

  it("recovers the ability of a simulated learner", () => {
    const trueTheta = 1.1;
    const responses: Response[] = bank().map((i) => ({
      // Deterministic "learner": answers correctly when ability exceeds difficulty.
      item: i,
      correct: trueTheta > i.b,
    }));
    const result = estimate(responses);
    expect(Math.abs(result.theta - trueTheta)).toBeLessThan(0.6);
  });
});

describe("placement.selectNext", () => {
  it("chooses the item closest in difficulty to the current estimate", () => {
    const pool = bank();
    const chosen = selectNext(1.0, pool, new Set(), []);
    expect(chosen).not.toBeNull();
    expect(Math.abs(chosen!.b - 1.0)).toBeLessThan(0.6);
  });

  it("never repeats an item already administered", () => {
    const pool = bank();
    const used = new Set(pool.slice(0, 30).map((i) => i.id));
    const chosen = selectNext(0, pool, used, []);
    expect(used.has(chosen!.id)).toBe(false);
  });

  it("returns null when the pool is exhausted", () => {
    const pool = bank();
    expect(selectNext(0, pool, new Set(pool.map((i) => i.id)), [])).toBeNull();
  });

  it("balances content so the test does not become one skill", () => {
    const pool = bank();
    const used = new Set<string>();
    const asked: Response[] = [];

    for (let i = 0; i < 16; i += 1) {
      const next = selectNext(0.5, pool, used, asked);
      if (!next) break;
      used.add(next.id);
      asked.push({ item: next, correct: i % 2 === 0 });
    }

    const bySkill = new Map<string, number>();
    for (const { item: asked_item } of asked) {
      bySkill.set(asked_item.skill, (bySkill.get(asked_item.skill) ?? 0) + 1);
    }
    // Without balancing, every pick would come from the single most informative
    // skill; with it, at least three skills appear.
    expect(bySkill.size).toBeGreaterThanOrEqual(3);
  });
});

describe("placement.shouldStop", () => {
  const responses = (n: number): Response[] =>
    Array.from({ length: n }, (_, i) => ({ item: item({ id: `x${i}` }), correct: true }));

  it("never stops before the minimum, however precise", () => {
    expect(shouldStop(responses(MIN_ITEMS - 1), 0.05)).toBe(false);
  });

  it("stops once the estimate is precise enough", () => {
    expect(shouldStop(responses(MIN_ITEMS), TARGET_SE - 0.01)).toBe(true);
  });

  it("keeps going while the estimate is still imprecise", () => {
    expect(shouldStop(responses(MIN_ITEMS + 3), 0.8)).toBe(false);
  });

  it("always stops at the maximum, however imprecise", () => {
    expect(shouldStop(responses(MAX_ITEMS), 2)).toBe(true);
  });
});

describe("placement.subscores", () => {
  it("weights harder items more heavily", () => {
    const easyRight: Response[] = [
      { item: item({ skill: "GRAMMAR", b: -2 }), correct: true },
      { item: item({ skill: "GRAMMAR", b: 2 }), correct: false },
    ];
    const hardRight: Response[] = [
      { item: item({ skill: "GRAMMAR", b: -2 }), correct: false },
      { item: item({ skill: "GRAMMAR", b: 2 }), correct: true },
    ];
    expect(subscores(hardRight).GRAMMAR).toBeGreaterThan(subscores(easyRight).GRAMMAR);
  });

  it("reports one entry per skill exercised", () => {
    const result = subscores([
      { item: item({ skill: "READING" }), correct: true },
      { item: item({ skill: "WRITING" }), correct: false },
    ]);
    expect(Object.keys(result).sort()).toEqual(["READING", "WRITING"]);
  });
});

describe("placement.summarise", () => {
  it("maps a strong performance to C2", () => {
    const responses: Response[] = bank().map((i) => ({ item: i, correct: i.b < 2.2 }));
    const outcome = summarise(responses);
    expect(outcome.level).toBe("C2");
    expect(outcome.level).toBe(thetaToCefr(outcome.theta));
  });

  it("maps a weak performance to B2", () => {
    const responses: Response[] = bank().map((i) => ({ item: i, correct: i.b < -1.8 }));
    expect(summarise(responses).level).toBe("B2");
  });

  it("reports low confidence on an inconsistent response pattern", () => {
    const responses: Response[] = bank()
      .slice(0, 12)
      // Alternating regardless of difficulty — the pattern of a guesser.
      .map((i, index) => ({ item: i, correct: index % 2 === 0 }));
    expect(summarise(responses).confidence).not.toBe("high");
  });

  it("identifies skills that lag the learner's own average", () => {
    const responses: Response[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        item: item({ id: `r${i}`, skill: "READING" as const, b: 1 }),
        correct: true,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        item: item({ id: `l${i}`, skill: "LISTENING" as const, b: 1 }),
        correct: false,
      })),
    ];
    const outcome = summarise(responses);
    expect(outcome.weakestSkills).toContain("LISTENING");
    expect(outcome.strongestSkills).toContain("READING");
  });
});
