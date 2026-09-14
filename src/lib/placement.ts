import type { Cefr, Skill } from "@prisma/client";

import { ALL_SKILLS, thetaToCefr } from "./cefr";

/**
 * Adaptive placement using a three-parameter logistic (3PL) IRT model.
 *
 * Why IRT rather than "20 questions, count the score": a fixed test wastes a
 * C2 learner's time on B2 items and tells a struggling B2 learner nothing.
 * With adaptive selection we reach a usable estimate in 12-20 items because
 * each item is chosen to be maximally informative *at the learner's current
 * estimate*.
 *
 * Ability is estimated with EAP (expected a posteriori) over a fixed grid
 * rather than maximum likelihood. EAP cannot diverge on an all-correct or
 * all-wrong response pattern — MLE sends theta to ±infinity there, which is
 * exactly the pattern a strong or weak learner produces in the first few items.
 */

export interface ItemParams {
  id: string;
  skill: Skill;
  cefr: Cefr;
  /** discrimination */
  a: number;
  /** difficulty */
  b: number;
  /** pseudo-guessing */
  c: number;
}

export interface Response {
  item: ItemParams;
  correct: boolean;
}

export const MIN_ITEMS = 12;
export const MAX_ITEMS = 22;
/** Stop early once the estimate is this precise (≈ ±0.6 logits at 95%). */
export const TARGET_SE = 0.3;

// Grid for the posterior: -4..4 in 0.05 steps is plenty for 2-decimal theta.
const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_STEP = 0.05;
const GRID: number[] = [];
for (let t = GRID_MIN; t <= GRID_MAX + 1e-9; t += GRID_STEP) {
  GRID.push(Math.round(t * 100) / 100);
}

/** Probability of a correct response under the 3PL model. */
export function probability(theta: number, item: Pick<ItemParams, "a" | "b" | "c">): number {
  const logistic = 1 / (1 + Math.exp(-1.7 * item.a * (theta - item.b)));
  return item.c + (1 - item.c) * logistic;
}

/** Fisher information — how much this item tells us at this ability. */
export function information(theta: number, item: Pick<ItemParams, "a" | "b" | "c">): number {
  const p = probability(theta, item);
  if (p <= item.c + 1e-9 || p >= 1 - 1e-9) return 0;
  const q = 1 - p;
  const numerator = (p - item.c) ** 2;
  const denominator = (1 - item.c) ** 2;
  return (1.7 * item.a) ** 2 * (q / p) * (numerator / denominator);
}

/** Standard normal prior, N(0, 1) — the population assumption for our cohort. */
function prior(theta: number): number {
  return Math.exp(-(theta ** 2) / 2);
}

export interface Estimate {
  theta: number;
  se: number;
}

export function estimate(responses: Response[]): Estimate {
  const weights = GRID.map((theta) => {
    let likelihood = prior(theta);
    for (const { item, correct } of responses) {
      const p = probability(theta, item);
      likelihood *= correct ? p : 1 - p;
    }
    return likelihood;
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0 || !Number.isFinite(total)) return { theta: 0, se: 1.5 };

  let mean = 0;
  for (let i = 0; i < GRID.length; i += 1) mean += GRID[i] * (weights[i] / total);

  let variance = 0;
  for (let i = 0; i < GRID.length; i += 1) {
    variance += (GRID[i] - mean) ** 2 * (weights[i] / total);
  }

  return {
    theta: Math.round(mean * 1000) / 1000,
    se: Math.round(Math.sqrt(variance) * 1000) / 1000,
  };
}

/**
 * Picks the next item: most informative at the current estimate, subject to
 * content balancing so the test does not become 20 grammar questions.
 *
 * Balancing rule: a skill that is already at or above its fair share of the
 * test is down-weighted, never hard-excluded — a very informative item still
 * wins if nothing comparable exists in an under-represented skill.
 */
export function selectNext(
  theta: number,
  pool: ItemParams[],
  used: Set<string>,
  asked: Response[],
): ItemParams | null {
  const candidates = pool.filter((item) => !used.has(item.id));
  if (candidates.length === 0) return null;

  const counts = new Map<Skill, number>();
  for (const { item } of asked) counts.set(item.skill, (counts.get(item.skill) ?? 0) + 1);
  const fairShare = Math.max(1, asked.length / ALL_SKILLS.length);

  let best: ItemParams | null = null;
  let bestScore = -Infinity;

  for (const item of candidates) {
    const seen = counts.get(item.skill) ?? 0;
    const overExposed = Math.max(0, seen - fairShare);
    const penalty = 1 / (1 + overExposed);
    const score = information(theta, item) * penalty;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export function shouldStop(responses: Response[], se: number): boolean {
  if (responses.length >= MAX_ITEMS) return true;
  if (responses.length < MIN_ITEMS) return false;
  return se <= TARGET_SE;
}

/** Per-skill proportion correct, weighted so harder items count for more. */
export function subscores(responses: Response[]): Record<string, number> {
  const totals = new Map<Skill, { earned: number; possible: number }>();
  for (const { item, correct } of responses) {
    const weight = 1 + Math.max(0, item.b);
    const entry = totals.get(item.skill) ?? { earned: 0, possible: 0 };
    entry.possible += weight;
    if (correct) entry.earned += weight;
    totals.set(item.skill, entry);
  }

  const out: Record<string, number> = {};
  for (const [skill, { earned, possible }] of totals) {
    out[skill] = possible > 0 ? Math.round((earned / possible) * 100) / 100 : 0;
  }
  return out;
}

export interface PlacementOutcome {
  theta: number;
  se: number;
  level: Cefr;
  subscores: Record<string, number>;
  confidence: "low" | "moderate" | "high";
  /** Skills at least 15 points below the learner's own average. */
  weakestSkills: Skill[];
  strongestSkills: Skill[];
}

export function summarise(responses: Response[]): PlacementOutcome {
  const { theta, se } = estimate(responses);
  const scores = subscores(responses);
  const values = Object.values(scores);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const weakestSkills = (Object.entries(scores) as [Skill, number][])
    .filter(([, score]) => score < mean - 0.15)
    .sort((a, b) => a[1] - b[1])
    .map(([skill]) => skill);

  const strongestSkills = (Object.entries(scores) as [Skill, number][])
    .filter(([, score]) => score > mean + 0.15)
    .sort((a, b) => b[1] - a[1])
    .map(([skill]) => skill);

  return {
    theta,
    se,
    level: thetaToCefr(theta),
    subscores: scores,
    confidence: se <= TARGET_SE ? "high" : se <= 0.45 ? "moderate" : "low",
    weakestSkills,
    strongestSkills,
  };
}
