import type { Cefr, Skill } from "@prisma/client";

export const CEFR_ORDER: Cefr[] = ["B2", "C1", "C2"];

export const CEFR_LABEL: Record<Cefr, string> = {
  B2: "B2 · Upper-intermediate",
  C1: "C1 · Advanced",
  C2: "C2 · Proficient",
};

export const CEFR_BLURB: Record<Cefr, string> = {
  B2: "You handle complex text and hold your own in discussion. Next: precision, register and idiom.",
  C1: "You express yourself fluently and flexibly. Next: nuance, rhetorical control and academic rigour.",
  C2: "You operate close to a native speaker. Next: subtle connotation, stylistic range and effortless spontaneity.",
};

/**
 * Ability (IRT logit scale) → CEFR band.
 *
 * Cut scores were set so that the seeded item bank places a learner answering
 * B2 items reliably and C1 items at chance into low C1 — the conventional
 * "just over the boundary" interpretation. Re-derive these if you re-calibrate
 * the item bank (see docs/EXTENDING.md#placement-calibration).
 */
export const THETA_CUTS = { C1: 0.0, C2: 1.25 } as const;

export function thetaToCefr(theta: number): Cefr {
  if (theta >= THETA_CUTS.C2) return "C2";
  if (theta >= THETA_CUTS.C1) return "C1";
  return "B2";
}

/** Inverse of `thetaToCefr`, used to warm-start an unplaced learner. */
export function cefrToTheta(level: Cefr): number {
  if (level === "C2") return 1.6;
  if (level === "C1") return 0.6;
  return -0.6;
}

/** Position inside the band, 0-1 — drives the "how far through C1 are you" bar. */
export function bandProgress(theta: number): number {
  const level = thetaToCefr(theta);
  if (level === "B2") {
    const lo = -2.5;
    return clamp01((theta - lo) / (THETA_CUTS.C1 - lo));
  }
  if (level === "C1") {
    return clamp01((theta - THETA_CUTS.C1) / (THETA_CUTS.C2 - THETA_CUTS.C1));
  }
  return clamp01((theta - THETA_CUTS.C2) / 1.75);
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function nextLevel(level: Cefr): Cefr | null {
  const idx = CEFR_ORDER.indexOf(level);
  return idx >= 0 && idx < CEFR_ORDER.length - 1 ? CEFR_ORDER[idx + 1] : null;
}

export function isAtLeast(level: Cefr, min: Cefr): boolean {
  return CEFR_ORDER.indexOf(level) >= CEFR_ORDER.indexOf(min);
}

export const SKILL_LABEL: Record<Skill, string> = {
  READING: "Reading",
  WRITING: "Writing",
  LISTENING: "Listening",
  SPEAKING: "Speaking",
  GRAMMAR: "Grammar",
  VOCABULARY: "Vocabulary",
  PRONUNCIATION: "Pronunciation",
  MEDIATION: "Mediation",
};

export const ALL_SKILLS: Skill[] = [
  "READING",
  "WRITING",
  "LISTENING",
  "SPEAKING",
  "GRAMMAR",
  "VOCABULARY",
  "PRONUNCIATION",
  "MEDIATION",
];
