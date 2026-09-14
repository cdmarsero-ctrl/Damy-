import type { BadgeTier } from "@prisma/client";

import type { BadgeCriteria } from "@/lib/gamification";

/**
 * Badges.
 *
 * Design rule: reward behaviours that correlate with actually improving, not
 * behaviours that are merely easy to measure. Hence badges for sustained
 * reviewing, productive skills and mastered vocabulary — and nothing at all for
 * raw time spent, which rewards leaving a tab open.
 */

export interface BadgeSeed {
  slug: string;
  title: string;
  description: string;
  icon: string;
  tier: BadgeTier;
  criteria: BadgeCriteria;
}

export const BADGES: BadgeSeed[] = [
  // --- consistency ---------------------------------------------------------
  { slug: "first-steps", title: "First Steps", description: "Complete your first lesson.", icon: "footprints", tier: "BRONZE", criteria: { metric: "lessonsCompleted", gte: 1 } },
  { slug: "week-one", title: "Week One", description: "Maintain a seven-day streak.", icon: "flame", tier: "BRONZE", criteria: { metric: "streakCurrent", gte: 7 } },
  { slug: "month-strong", title: "Month Strong", description: "Maintain a thirty-day streak.", icon: "flame", tier: "SILVER", criteria: { metric: "streakCurrent", gte: 30 } },
  { slug: "hundred-days", title: "Hundred Days", description: "Maintain a hundred-day streak.", icon: "flame", tier: "GOLD", criteria: { metric: "streakCurrent", gte: 100 } },
  { slug: "year-of-english", title: "A Year of English", description: "Reach a 365-day streak. Very few people do this.", icon: "crown", tier: "PLATINUM", criteria: { metric: "streakLongest", gte: 365 } },

  // --- volume --------------------------------------------------------------
  { slug: "ten-lessons", title: "Getting Somewhere", description: "Complete ten lessons.", icon: "book-open", tier: "BRONZE", criteria: { metric: "lessonsCompleted", gte: 10 } },
  { slug: "fifty-lessons", title: "Serious Study", description: "Complete fifty lessons.", icon: "library", tier: "SILVER", criteria: { metric: "lessonsCompleted", gte: 50 } },
  { slug: "two-hundred-lessons", title: "Scholar", description: "Complete two hundred lessons.", icon: "library", tier: "GOLD", criteria: { metric: "lessonsCompleted", gte: 200 } },

  // --- spaced repetition ---------------------------------------------------
  { slug: "first-review", title: "Spaced Out", description: "Grade your first review card.", icon: "repeat", tier: "BRONZE", criteria: { metric: "reviewsCompleted", gte: 1 } },
  { slug: "five-hundred-reviews", title: "Repetition Pays", description: "Grade five hundred review cards.", icon: "repeat", tier: "SILVER", criteria: { metric: "reviewsCompleted", gte: 500 } },
  { slug: "five-thousand-reviews", title: "Long Game", description: "Grade five thousand review cards.", icon: "repeat", tier: "GOLD", criteria: { metric: "reviewsCompleted", gte: 5000 } },

  // --- vocabulary depth ----------------------------------------------------
  { slug: "fifty-mastered", title: "Fifty Words Deep", description: "Master fifty lexical items — spaced beyond three weeks with high recall.", icon: "brain", tier: "BRONZE", criteria: { metric: "wordsMastered", gte: 50 } },
  { slug: "five-hundred-mastered", title: "Lexicon", description: "Master five hundred lexical items.", icon: "brain", tier: "GOLD", criteria: { metric: "wordsMastered", gte: 500 } },
  { slug: "two-thousand-mastered", title: "Near-Native Range", description: "Master two thousand lexical items. This is genuinely C2 territory.", icon: "brain", tier: "PLATINUM", criteria: { metric: "wordsMastered", gte: 2000 } },

  // --- productive skills ---------------------------------------------------
  { slug: "first-submission", title: "On the Record", description: "Submit your first piece of writing for feedback.", icon: "pen-line", tier: "BRONZE", criteria: { metric: "writingSubmissions", gte: 1 } },
  { slug: "twenty-submissions", title: "Writer", description: "Submit twenty pieces of writing.", icon: "pen-line", tier: "SILVER", criteria: { metric: "writingSubmissions", gte: 20 } },
  { slug: "hundred-submissions", title: "Prolific", description: "Submit a hundred pieces of writing.", icon: "pen-line", tier: "GOLD", criteria: { metric: "writingSubmissions", gte: 100 } },
  { slug: "first-debate", title: "Opening Argument", description: "Take your first turn in a debate.", icon: "swords", tier: "BRONZE", criteria: { metric: "debateTurns", gte: 1 } },
  { slug: "fifty-debate-turns", title: "Devil's Advocate", description: "Take fifty debate turns.", icon: "swords", tier: "SILVER", criteria: { metric: "debateTurns", gte: 50 } },
  { slug: "two-hundred-debate-turns", title: "Rhetorician", description: "Take two hundred debate turns.", icon: "swords", tier: "GOLD", criteria: { metric: "debateTurns", gte: 200 } },

  // --- quality -------------------------------------------------------------
  { slug: "first-perfect", title: "Flawless", description: "Complete a lesson with a perfect score.", icon: "target", tier: "BRONZE", criteria: { metric: "perfectLessons", gte: 1 } },
  { slug: "twenty-perfect", title: "Precision", description: "Complete twenty lessons perfectly.", icon: "target", tier: "SILVER", criteria: { metric: "perfectLessons", gte: 20 } },
  { slug: "hundred-perfect", title: "Exacting", description: "Complete a hundred lessons perfectly.", icon: "target", tier: "GOLD", criteria: { metric: "perfectLessons", gte: 100 } },

  // --- exam ----------------------------------------------------------------
  { slug: "first-exam", title: "Under Exam Conditions", description: "Complete a timed exam module.", icon: "clipboard-check", tier: "BRONZE", criteria: { metric: "examAttempts", gte: 1 } },
  { slug: "ten-exams", title: "Exam Ready", description: "Complete ten timed exam modules.", icon: "clipboard-check", tier: "SILVER", criteria: { metric: "examAttempts", gte: 10 } },

  // --- progression ---------------------------------------------------------
  { slug: "level-ten", title: "Level 10", description: "Reach level 10.", icon: "trending-up", tier: "BRONZE", criteria: { metric: "level", gte: 10 } },
  { slug: "level-twenty-five", title: "Level 25", description: "Reach level 25.", icon: "trending-up", tier: "SILVER", criteria: { metric: "level", gte: 25 } },
  { slug: "level-fifty", title: "Level 50", description: "Reach level 50.", icon: "trending-up", tier: "GOLD", criteria: { metric: "level", gte: 50 } },
  { slug: "ten-thousand-xp", title: "Ten Thousand", description: "Earn 10,000 XP.", icon: "zap", tier: "SILVER", criteria: { metric: "xpTotal", gte: 10_000 } },
  { slug: "hundred-thousand-xp", title: "Hundred Thousand", description: "Earn 100,000 XP.", icon: "zap", tier: "PLATINUM", criteria: { metric: "xpTotal", gte: 100_000 } },
];
