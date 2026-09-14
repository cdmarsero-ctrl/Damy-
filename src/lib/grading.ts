import type { ExerciseType } from "@prisma/client";

import { coverage, diffWords, normalise, similarity, words } from "./text";

/**
 * Deterministic grading for every closed exercise type.
 *
 * Open-ended types (OPEN_WRITING, SPEAKING_PROMPT, NOTE_TAKING) are graded
 * here only for coverage//effort signals; their qualitative feedback comes from
 * src/lib/ai/. Keeping the two separate means a missing AI key degrades the
 * depth of feedback but never the correctness of a score.
 *
 * The solution payload shape per type is documented in docs/DATA-MODEL.md and
 * mirrored by the Zod schemas in src/lib/validation.ts.
 */

export interface GradeIssue {
  /** Index of the gap/blank/segment this issue refers to, when applicable. */
  index?: number;
  type: "wrong" | "spelling" | "missing" | "extra" | "order" | "register" | "length";
  message: string;
  expected?: string;
  received?: string;
}

export interface GradeResult {
  /** All-or-nothing verdict shown as a tick or cross. */
  correct: boolean;
  /** Partial credit, 0-1 — what actually feeds progress and XP. */
  score: number;
  issues: GradeIssue[];
  /** One-line explanation shown immediately after answering. */
  summary: string;
  /** True when a human/AI pass is required for a meaningful grade. */
  needsQualitativeReview: boolean;
}

type Json = unknown;

function asArray(value: Json): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: Json): string[] {
  return asArray(value).map((v) => String(v));
}

function obj(value: Json): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Accept an answer that matches any listed variant, flagging near-misses. */
function matchVariants(
  received: string,
  accepted: string[],
): { ok: boolean; spelling: boolean; expected: string } {
  const got = normalise(received);
  const variants = accepted.map((a) => ({ raw: a, key: normalise(a) }));

  for (const variant of variants) {
    if (variant.key === got) return { ok: true, spelling: false, expected: variant.raw };
  }
  // A single-character slip on a long word is a spelling issue, not a wrong
  // answer — mark it correct with a warning so learners are not punished twice.
  for (const variant of variants) {
    if (variant.key.length >= 5 && similarity(variant.key, got) >= 0.85) {
      return { ok: true, spelling: true, expected: variant.raw };
    }
  }
  return { ok: false, spelling: false, expected: variants[0]?.raw ?? "" };
}

function ratioResult(
  correctCount: number,
  total: number,
  issues: GradeIssue[],
  allLabel: string,
): GradeResult {
  const score = total > 0 ? correctCount / total : 0;
  const correct = total > 0 && correctCount === total;
  return {
    correct,
    score: Math.round(score * 1000) / 1000,
    issues,
    summary: correct
      ? allLabel
      : `${correctCount} of ${total} correct — see the notes below.`,
    needsQualitativeReview: false,
  };
}

export function grade(type: ExerciseType, solution: Json, response: Json): GradeResult {
  const sol = obj(solution);

  switch (type) {
    case "MULTIPLE_CHOICE":
    case "LISTENING_COMPREHENSION":
    case "READING_ANALYSIS": {
      const expected = Number(sol.answerIndex);
      const given = Number(obj(response).answerIndex ?? NaN);
      const correct = Number.isFinite(given) && given === expected;
      return {
        correct,
        score: correct ? 1 : 0,
        issues: correct ? [] : [{ type: "wrong", message: "That is not the best answer here." }],
        summary: correct ? "Correct." : "Not quite.",
        needsQualitativeReview: false,
      };
    }

    case "MULTI_SELECT": {
      const expected = new Set(asArray(sol.answerIndexes).map(Number));
      const given = new Set(asArray(obj(response).answerIndexes).map(Number));
      const hits = [...expected].filter((i) => given.has(i)).length;
      const falsePositives = [...given].filter((i) => !expected.has(i)).length;
      // Penalise over-selection so "tick everything" cannot score well.
      const raw = expected.size ? (hits - falsePositives) / expected.size : 0;
      const score = Math.max(0, Math.min(1, raw));
      const issues: GradeIssue[] = [];
      if (hits < expected.size) {
        issues.push({ type: "missing", message: `You missed ${expected.size - hits} correct option(s).` });
      }
      if (falsePositives > 0) {
        issues.push({ type: "extra", message: `${falsePositives} of your choices do not belong.` });
      }
      return {
        correct: score === 1,
        score: Math.round(score * 1000) / 1000,
        issues,
        summary: score === 1 ? "All correct." : "Partially correct.",
        needsQualitativeReview: false,
      };
    }

    case "GAP_FILL":
    case "COLLOCATION_BUILD": {
      // solution.answers: string[][] — accepted variants per gap.
      const answers = asArray(sol.answers).map((variants) => asStringArray(variants));
      const given = asStringArray(obj(response).answers);
      const issues: GradeIssue[] = [];
      let hits = 0;

      answers.forEach((accepted, index) => {
        const received = given[index] ?? "";
        if (!received.trim()) {
          issues.push({ index, type: "missing", message: `Gap ${index + 1} is empty.`, expected: accepted[0] });
          return;
        }
        const result = matchVariants(received, accepted);
        if (result.ok) {
          hits += 1;
          if (result.spelling) {
            issues.push({
              index,
              type: "spelling",
              message: `Gap ${index + 1}: right word, check the spelling.`,
              expected: result.expected,
              received,
            });
          }
        } else {
          issues.push({
            index,
            type: "wrong",
            message: `Gap ${index + 1} needs a different word.`,
            expected: result.expected,
            received,
          });
        }
      });

      return ratioResult(hits, answers.length, issues, "Every gap filled correctly.");
    }

    case "TRANSFORMATION": {
      // solution.answers: string[] — full accepted sentences.
      // solution.mustInclude: string[] — key word that has to appear unchanged.
      const accepted = asStringArray(sol.answers);
      const mustInclude = asStringArray(sol.mustInclude);
      const received = String(obj(response).text ?? "");
      const issues: GradeIssue[] = [];

      const missingKey = mustInclude.filter(
        (key) => !normalise(received).includes(normalise(key)),
      );
      if (missingKey.length) {
        issues.push({
          type: "missing",
          message: `Your sentence must use: ${missingKey.join(", ")}.`,
        });
      }

      const match = matchVariants(received, accepted);
      if (!match.ok) {
        issues.push({
          type: "wrong",
          message: "Not an accepted transformation.",
          expected: match.expected,
          received,
        });
      } else if (match.spelling) {
        issues.push({ type: "spelling", message: "Correct structure — check your spelling.", expected: match.expected });
      }

      const correct = match.ok && missingKey.length === 0;
      return {
        correct,
        score: correct ? (match.spelling ? 0.8 : 1) : 0,
        issues,
        summary: correct ? "Correct transformation." : "Try again — the structure is not right yet.",
        needsQualitativeReview: false,
      };
    }

    case "DRAG_ORDER": {
      const expected = asArray(sol.order).map(String);
      const given = asArray(obj(response).order).map(String);
      let hits = 0;
      const issues: GradeIssue[] = [];
      expected.forEach((id, index) => {
        if (given[index] === id) hits += 1;
        else issues.push({ index, type: "order", message: `Position ${index + 1} is out of place.` });
      });
      return ratioResult(hits, expected.length, issues, "Perfect sequence.");
    }

    case "MATCHING": {
      // solution.pairs: Record<leftId, rightId>
      const pairs = obj(sol.pairs);
      const given = obj(obj(response).pairs);
      const keys = Object.keys(pairs);
      let hits = 0;
      const issues: GradeIssue[] = [];
      keys.forEach((key, index) => {
        if (String(given[key] ?? "") === String(pairs[key])) hits += 1;
        else issues.push({ index, type: "wrong", message: `"${key}" is matched to the wrong item.` });
      });
      return ratioResult(hits, keys.length, issues, "Every pair matched.");
    }

    case "ERROR_CORRECTION": {
      // solution.corrections: [{ accepted: string[], hint?: string }]
      const corrections = asArray(sol.corrections).map((c) => obj(c));
      const given = asStringArray(obj(response).answers);
      const issues: GradeIssue[] = [];
      let hits = 0;

      corrections.forEach((correction, index) => {
        const accepted = asStringArray(correction.accepted);
        const received = given[index] ?? "";
        const result = matchVariants(received, accepted);
        if (result.ok) hits += 1;
        else {
          issues.push({
            index,
            type: "wrong",
            message: String(correction.hint ?? `Line ${index + 1} is still incorrect.`),
            expected: result.expected,
            received,
          });
        }
      });

      return ratioResult(hits, corrections.length, issues, "Every error found and fixed.");
    }

    case "DICTATION": {
      const expected = String(sol.text ?? "");
      const received = String(obj(response).text ?? "");
      const diff = diffWords(expected, received);
      const score = coverage(diff);
      const issues: GradeIssue[] = [];
      const missing = diff.filter((d) => d.status === "missing").map((d) => d.word);
      const extra = diff.filter((d) => d.status === "extra").map((d) => d.word);
      if (missing.length) {
        issues.push({ type: "missing", message: `Missed: ${missing.slice(0, 8).join(", ")}` });
      }
      if (extra.length) {
        issues.push({ type: "extra", message: `Not in the audio: ${extra.slice(0, 8).join(", ")}` });
      }
      return {
        correct: score >= 0.98,
        score: Math.round(score * 1000) / 1000,
        issues,
        summary: `${Math.round(score * 100)}% of the passage transcribed accurately.`,
        needsQualitativeReview: false,
      };
    }

    case "REGISTER_SHIFT": {
      // solution.mustInclude / mustAvoid: string[] — register markers.
      const mustInclude = asStringArray(sol.mustInclude);
      const mustAvoid = asStringArray(sol.mustAvoid);
      const received = normalise(String(obj(response).text ?? ""));
      const issues: GradeIssue[] = [];

      const included = mustInclude.filter((term) => received.includes(normalise(term)));
      const violated = mustAvoid.filter((term) => received.includes(normalise(term)));

      if (included.length < mustInclude.length) {
        const missing = mustInclude.filter((t) => !included.includes(t));
        issues.push({
          type: "register",
          message: `Reach for more of the target register: ${missing.slice(0, 5).join(", ")}.`,
        });
      }
      for (const term of violated) {
        issues.push({ type: "register", message: `"${term}" is too informal for this register.` });
      }

      const denominator = mustInclude.length || 1;
      const score = Math.max(
        0,
        Math.min(1, included.length / denominator - violated.length * 0.2),
      );
      return {
        correct: score >= 0.99,
        score: Math.round(score * 1000) / 1000,
        issues,
        summary:
          score >= 0.99
            ? "Register handled convincingly."
            : "The register is not consistent yet — see the notes.",
        // The marker check is a floor, not a verdict: a stylistically poor
        // rewrite can still tick every box, so ask the AI layer for a read.
        needsQualitativeReview: true,
      };
    }

    case "NOTE_TAKING": {
      // solution.keyPoints: string[] — ideas that must be captured.
      const keyPoints = asStringArray(sol.keyPoints);
      const received = normalise(String(obj(response).text ?? ""));
      const captured = keyPoints.filter((point) => {
        // A key point counts as captured when most of its content words appear.
        const terms = words(point).filter((w) => w.length > 3);
        if (terms.length === 0) return received.includes(normalise(point));
        const hits = terms.filter((term) => received.includes(term)).length;
        return hits / terms.length >= 0.5;
      });
      const issues: GradeIssue[] = keyPoints
        .filter((p) => !captured.includes(p))
        .map((p) => ({ type: "missing" as const, message: `Not captured: ${p}` }));

      const score = keyPoints.length ? captured.length / keyPoints.length : 0;
      return {
        correct: score >= 0.8,
        score: Math.round(score * 1000) / 1000,
        issues,
        summary: `You captured ${captured.length} of ${keyPoints.length} key points.`,
        needsQualitativeReview: false,
      };
    }

    case "OPEN_WRITING":
    case "SPEAKING_PROMPT": {
      const text = String(obj(response).text ?? "");
      const count = words(text).length;
      const minWords = Number(sol.minWords ?? 50);
      const issues: GradeIssue[] = [];
      if (count < minWords) {
        issues.push({
          type: "length",
          message: `Aim for at least ${minWords} words — you wrote ${count}.`,
        });
      }
      // Effort floor only. The real grade arrives from the AI/rubric pass.
      const score = Math.min(1, count / Math.max(1, minWords));
      return {
        correct: count >= minWords,
        score: Math.round(score * 1000) / 1000,
        issues,
        summary:
          count >= minWords
            ? "Submitted for detailed feedback."
            : "A little short — expand your answer before submitting.",
        needsQualitativeReview: true,
      };
    }

    default: {
      // Exhaustiveness guard: adding an ExerciseType without a grader is a
      // compile-time error, not a silent zero in production.
      const never: never = type;
      throw new Error(`No grader implemented for exercise type ${String(never)}`);
    }
  }
}

/** Lesson score = mean of exercise scores, weighted by point value. */
export function aggregateScore(results: { score: number; points: number }[]): number {
  const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
  if (totalPoints === 0) return 0;
  const earned = results.reduce((sum, r) => sum + r.score * r.points, 0);
  return Math.round((earned / totalPoints) * 1000) / 1000;
}
