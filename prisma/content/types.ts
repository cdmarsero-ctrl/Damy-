import type { Accent, Cefr, ExerciseType, Goal, Skill } from "@prisma/client";

/**
 * Authoring types for seed content.
 *
 * These mirror the Prisma models but keep the shape convenient for hand-written
 * content: nested rather than relational, with ids resolved at seed time.
 * See docs/CONTENT-AUTHORING.md for the payload/solution contract of each
 * exercise type.
 */

export interface ExerciseSeed {
  type: ExerciseType;
  skill: Skill;
  cefr: Cefr;
  prompt: string;
  instructions?: string;
  /** Renderer input — shape depends on `type`. */
  payload: Record<string, unknown>;
  /** Grading key — never sent to the client. */
  solution: Record<string, unknown>;
  explanation?: string;
  points?: number;
  tags?: string[];
  /** Headword of a LEXICON entry; links the exercise to the SRS. */
  lexicalItem?: string;
}

export interface LessonSeed {
  slug: string;
  title: string;
  subtitle?: string;
  skill: Skill;
  cefr: Cefr;
  objectives: string[];
  estimatedMinutes?: number;
  xpReward?: number;
  /** Reading passage or listening transcript shown above the exercises. */
  content?: string;
  accent?: Accent;
  culturalNote?: string;
  exercises: ExerciseSeed[];
}

export interface UnitSeed {
  slug: string;
  title: string;
  description: string;
  cefr: Cefr;
  lessons: LessonSeed[];
}

export interface TrackSeed {
  slug: string;
  title: string;
  description: string;
  goal: Goal;
  cefr: Cefr;
  icon: string;
  accent: string;
  units: UnitSeed[];
}
