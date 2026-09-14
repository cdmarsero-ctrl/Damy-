import type { CardState, ReviewRating } from "@prisma/client";

/**
 * Spaced repetition — SM-2 with learning steps.
 *
 * Deviations from textbook SM-2, all deliberate:
 *  1. Learning steps (10 min → 1 day) before a card enters review, so a brand
 *     new C1 collocation is seen twice in one session rather than once.
 *  2. A lapse does not reset the interval to zero; it re-enters relearning and
 *     comes back at 30% of its previous interval (floored at 1 day). Full
 *     resets punish a single slip far too harshly on a mature card.
 *  3. Interval fuzz of ±5% prevents review "clumping" — otherwise every card
 *     added in one session comes due on exactly the same future day forever.
 *
 * The function is pure: it takes a card snapshot and a grade, and returns the
 * next snapshot. That makes it unit-testable (see src/lib/srs.test.ts) and
 * lets the offline client run the identical scheduler before syncing.
 */

export const MINUTE = 1 / (24 * 60);

/** Grades mapped onto the SM-2 0-5 quality scale. */
const QUALITY: Record<ReviewRating, number> = {
  AGAIN: 2,
  HARD: 3,
  GOOD: 4,
  EASY: 5,
};

/** Fractions of a day. 10 minutes, then 1 day. */
const LEARNING_STEPS = [10 * MINUTE, 1];
const RELEARNING_STEPS = [10 * MINUTE];

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.2;
export const MAX_INTERVAL_DAYS = 365 * 2;

export interface CardSnapshot {
  state: CardState;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  retention: number;
}

export interface ScheduleResult extends CardSnapshot {
  dueAt: Date;
  /** Human-readable "next in ..." shown on the grading buttons. */
  intervalLabel: string;
}

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, ease));
}

/** Classic SM-2 ease update: harsh on failure, gently generous on EASY. */
function nextEase(ease: number, rating: ReviewRating): number {
  const q = QUALITY[rating];
  return clampEase(ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
}

/** ±5% jitter, deterministic per call site via the supplied RNG. */
function fuzz(days: number, rng: () => number): number {
  if (days < 1) return days;
  const factor = 0.95 + rng() * 0.1;
  return Math.round(days * factor * 100) / 100;
}

function updateRetention(previous: number, rating: ReviewRating, repetitions: number): number {
  const hit = rating === "AGAIN" ? 0 : rating === "HARD" ? 0.6 : 1;
  // Exponential moving average over roughly the last 8 reviews.
  const alpha = repetitions === 0 ? 1 : 0.25;
  return Math.round((previous * (1 - alpha) + hit * alpha) * 1000) / 1000;
}

export function schedule(
  card: CardSnapshot,
  rating: ReviewRating,
  now: Date = new Date(),
  rng: () => number = Math.random,
): ScheduleResult {
  let { state, easeFactor, intervalDays, repetitions, lapses } = card;
  const retention = updateRetention(card.retention, rating, repetitions);

  if (state === "NEW" || state === "LEARNING") {
    if (rating === "AGAIN") {
      state = "LEARNING";
      intervalDays = LEARNING_STEPS[0];
      repetitions = 0;
    } else {
      // EASY skips the remaining learning steps and graduates immediately.
      const stepIndex = rating === "EASY" ? LEARNING_STEPS.length : repetitions + 1;
      if (stepIndex >= LEARNING_STEPS.length) {
        state = "REVIEW";
        repetitions = 1;
        intervalDays = rating === "EASY" ? 4 : 1;
      } else {
        state = "LEARNING";
        repetitions = stepIndex;
        intervalDays = LEARNING_STEPS[stepIndex];
      }
      easeFactor = nextEase(easeFactor, rating);
    }
  } else if (state === "RELEARNING") {
    if (rating === "AGAIN") {
      intervalDays = RELEARNING_STEPS[0];
    } else {
      state = "REVIEW";
      repetitions += 1;
      // Come back at a reduced but non-trivial interval.
      intervalDays = Math.max(1, Math.round(intervalDays * 1.5));
      easeFactor = nextEase(easeFactor, rating);
    }
  } else {
    // REVIEW
    if (rating === "AGAIN") {
      state = "RELEARNING";
      lapses += 1;
      easeFactor = clampEase(easeFactor - 0.2);
      // Deviation (2): retain 30% of the interval instead of resetting.
      intervalDays = Math.max(1, Math.round(intervalDays * 0.3));
      repetitions = Math.max(1, repetitions);
      return finish(state, easeFactor, RELEARNING_STEPS[0], repetitions, lapses, retention, now, rng, intervalDays);
    }
    easeFactor = nextEase(easeFactor, rating);
    repetitions += 1;
    const modifier = rating === "HARD" ? 1.2 : rating === "EASY" ? easeFactor * 1.3 : easeFactor;
    intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, intervalDays * modifier));
  }

  return finish(state, easeFactor, intervalDays, repetitions, lapses, retention, now, rng);
}

function finish(
  state: CardState,
  easeFactor: number,
  intervalDays: number,
  repetitions: number,
  lapses: number,
  retention: number,
  now: Date,
  rng: () => number,
  /** For a lapse we schedule the short relearning step but remember the
   *  reduced review interval to resume from. */
  resumeInterval?: number,
): ScheduleResult {
  // Fuzz first, then clamp — clamping before the jitter let a maxed-out card
  // land 5% past the ceiling.
  const scheduled = Math.min(MAX_INTERVAL_DAYS, fuzz(intervalDays, rng));
  const dueAt = new Date(now.getTime() + scheduled * 24 * 60 * 60 * 1000);
  return {
    state,
    easeFactor: Math.round(easeFactor * 1000) / 1000,
    intervalDays: Math.round((resumeInterval ?? scheduled) * 1000) / 1000,
    repetitions,
    lapses,
    retention,
    dueAt,
    intervalLabel: formatInterval(scheduled),
  };
}

export function formatInterval(days: number): string {
  if (days < 1 / 24) return `${Math.round(days * 24 * 60)} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 30) return `${Math.round(days)} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} y`;
}

/** Interval preview for each button, so the learner sees the cost of a grade. */
export function previewAll(card: CardSnapshot, now: Date = new Date()) {
  // 0.5 is the midpoint of the fuzz range, so a preview shows the unmodified
  // interval. Returning 1 here inflated every advertised interval by 5%.
  const stable = () => 0.5;
  const ratings: ReviewRating[] = ["AGAIN", "HARD", "GOOD", "EASY"];
  return ratings.map((rating) => ({
    rating,
    label: schedule(card, rating, now, stable).intervalLabel,
  }));
}

/** A card counts as mastered once it is deeply spaced and reliably recalled. */
export function isMastered(card: CardSnapshot): boolean {
  return card.state === "REVIEW" && card.intervalDays >= 21 && card.retention >= 0.8;
}
