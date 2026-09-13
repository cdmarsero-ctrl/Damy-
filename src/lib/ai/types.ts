import type { Cefr, ConversationMode, WritingGenre } from "@prisma/client";

/** Where a piece of feedback came from. Surfaced in the UI so a learner always
 *  knows whether a model or the built-in rules engine produced it. */
export type FeedbackSource = "model" | "rules";

export type CorrectionType =
  | "grammar"
  | "word-choice"
  | "collocation"
  | "register"
  | "spelling"
  | "punctuation"
  | "cohesion"
  | "style"
  | "naturalness";

export type Severity = "minor" | "moderate" | "major";

export interface Correction {
  /** Character offsets into the learner's text, [start, end). */
  span: [number, number];
  type: CorrectionType;
  original: string;
  suggestion: string;
  explanation: string;
  severity: Severity;
  /** Optional CEFR tag — "this is the C1 way of saying it". */
  level?: Cefr;
  /** Set when the rules engine produced this; absent for model output. */
  ruleId?: string;
}

export interface Upgrade {
  label: string;
  text: string;
  rationale: string;
}

export interface TurnMetrics {
  wordCount: number;
  typeTokenRatio: number;
  avgSentenceLength: number;
  errorCount: number;
  /** Rough CEFR read on this single turn. */
  estimatedLevel: Cefr;
}

export interface TutorTurn {
  reply: string;
  corrections: Correction[];
  upgrades: Upgrade[];
  /** A question that keeps the conversation moving. */
  followUp?: string;
  metrics: TurnMetrics;
  source: FeedbackSource;
}

export interface TutorRequest {
  mode: ConversationMode;
  topic: string;
  cefr: Cefr;
  persona?: string | null;
  aiStance?: string | null;
  userStance?: string | null;
  history: { role: "USER" | "ASSISTANT"; content: string }[];
  message: string;
}

export interface WritingCriteria {
  taskAchievement: number;
  coherenceCohesion: number;
  lexicalResource: number;
  grammaticalRange: number;
  registerStyle: number;
}

export interface WritingReport {
  overallBand: number; // 0-9, IELTS-aligned
  criteria: WritingCriteria;
  annotations: Correction[];
  strengths: string[];
  priorities: string[];
  summary: string;
  modelAnswer?: string;
  source: FeedbackSource;
}

export interface WritingRequest {
  genre: WritingGenre;
  cefr: Cefr;
  prompt: string;
  text: string;
}
