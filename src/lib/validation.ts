import { z } from "zod";

/**
 * Every API input is parsed through a schema here. Route handlers never touch
 * `req.json()` directly — see src/lib/api.ts#parseBody.
 */

export const cefrSchema = z.enum(["B2", "C1", "C2"]);
export const skillSchema = z.enum([
  "READING", "WRITING", "LISTENING", "SPEAKING",
  "GRAMMAR", "VOCABULARY", "PRONUNCIATION", "MEDIATION",
]);
export const goalSchema = z.enum([
  "BUSINESS", "ACADEMIC", "EXAM", "TRAVEL", "CULTURE", "EVERYDAY_FLUENCY",
]);
export const accentSchema = z.enum(["US", "UK", "AU", "CA", "IE", "IN", "ZA", "SCO"]);
export const examSchema = z.enum(["IELTS", "TOEFL", "CAE", "CPE"]);
export const ratingSchema = z.enum(["AGAIN", "HARD", "GOOD", "EASY"]);
export const conversationModeSchema = z.enum([
  "TUTOR", "DEBATE", "ROLEPLAY", "INTERVIEW", "EXAM_SPEAKING",
]);
export const writingGenreSchema = z.enum([
  "ESSAY", "REPORT", "PROPOSAL", "EMAIL", "REVIEW", "ARTICLE",
  "ABSTRACT", "COVER_LETTER", "SUMMARY",
]);

// --- auth -------------------------------------------------------------------

/**
 * Password policy: length over composition rules. NIST 800-63B guidance —
 * forcing a symbol produces "Password1!" and nothing else. 10 characters
 * minimum, with the obvious choices blocked.
 */
const WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwertyuiop", "letmein123", "iloveyou1", "admin12345", "welcome123", "changeme1",
]);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters — length beats complexity")
  .max(200, "That password is unreasonably long")
  .refine((value) => !WEAK_PASSWORDS.has(value.toLowerCase()), {
    message: "That password appears on every breach list. Choose something else.",
  })
  .refine((value) => new Set(value).size > 4, {
    message: "Too repetitive — vary the characters.",
  });

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Tell us what to call you").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  goals: z.array(goalSchema).max(6).optional(),
  targetExam: examSchema.nullable().optional(),
  examDate: z.string().datetime().nullable().optional(),
  nativeLanguage: z.string().trim().max(60).nullable().optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  preferredAccent: accentSchema.optional(),
  dailyGoalXp: z.number().int().min(10).max(500).optional(),
});

export const settingsUpdateSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  fontScale: z.number().min(0.85).max(1.5).optional(),
  captionsDefaultOn: z.boolean().optional(),
  ttsVoice: z.string().max(120).nullable().optional(),
  speechRate: z.number().min(0.5).max(1.5).optional(),
  emailDigest: z.boolean().optional(),
  pushReminders: z.boolean().optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  offlineEnabled: z.boolean().optional(),
});

// --- placement --------------------------------------------------------------

export const placementAnswerSchema = z.object({
  testId: z.string().min(1),
  itemId: z.string().min(1),
  answerIndex: z.number().int().min(0).max(9),
  responseMs: z.number().int().min(0).max(10 * 60 * 1000),
});

// --- lessons ----------------------------------------------------------------

/** Exercise responses are a tagged union so the grader never sees a shape it
 *  cannot handle. Keep in step with src/lib/grading.ts. */
export const exerciseResponseSchema = z.union([
  z.object({ answerIndex: z.number().int().min(0).max(20) }),
  z.object({ answerIndexes: z.array(z.number().int().min(0).max(20)).max(20) }),
  z.object({ answers: z.array(z.string().max(500)).max(40) }),
  z.object({ order: z.array(z.string().max(120)).max(40) }),
  z.object({ pairs: z.record(z.string().max(120), z.string().max(120)) }),
  z.object({ text: z.string().max(20_000) }),
]);

export const submitExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  response: exerciseResponseSchema,
  durationMs: z.number().int().min(0).max(60 * 60 * 1000).default(0),
});

export const completeLessonSchema = z.object({
  lessonId: z.string().min(1),
  timeSpentSec: z.number().int().min(0).max(8 * 60 * 60).default(0),
});

// --- reviews ----------------------------------------------------------------

export const reviewGradeSchema = z.object({
  cardId: z.string().min(1),
  rating: ratingSchema,
  durationMs: z.number().int().min(0).max(10 * 60 * 1000).default(0),
});

export const addCardSchema = z.object({
  lexicalItemId: z.string().min(1),
});

export const reviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeNew: z.coerce.boolean().default(true),
});

// --- AI ---------------------------------------------------------------------

export const startConversationSchema = z.object({
  mode: conversationModeSchema,
  topic: z.string().trim().min(3, "Give the conversation a topic").max(200),
  persona: z.string().trim().max(200).optional(),
  userStance: z.string().trim().max(200).optional(),
  aiStance: z.string().trim().max(200).optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().min(1, "Say something first").max(4000),
});

export const writingSubmitSchema = z.object({
  genre: writingGenreSchema,
  prompt: z.string().trim().min(5).max(2000),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(20, "Write at least a couple of sentences").max(20_000),
});

export const outlineSchema = z.object({
  genre: writingGenreSchema,
  prompt: z.string().trim().min(5).max(2000),
});

export const pronunciationSchema = z.object({
  targetText: z.string().trim().min(1).max(2000),
  transcript: z.string().trim().max(4000),
  durationMs: z.number().int().min(0).max(10 * 60 * 1000),
  accent: accentSchema.default("UK"),
});

// --- exams ------------------------------------------------------------------

export const examStartSchema = z.object({ moduleId: z.string().min(1) });

export const examSubmitSchema = z.object({
  attemptId: z.string().min(1),
  responses: z
    .array(
      z.object({
        taskId: z.string().min(1),
        response: exerciseResponseSchema,
      }),
    )
    .max(80),
  durationSec: z.number().int().min(0).max(6 * 60 * 60).default(0),
});

// --- sync -------------------------------------------------------------------

export const syncSchema = z.object({
  clientId: z.string().min(1).max(80),
  mutations: z
    .array(
      z.object({
        idempotencyKey: z.string().min(8).max(120),
        kind: z.enum(["reviewGrade", "exerciseAttempt", "lessonComplete", "studyTime"]),
        payload: z.record(z.string(), z.unknown()),
        occurredAt: z.string().datetime(),
      }),
    )
    .max(500),
});

export const leaderboardQuerySchema = z.object({
  scope: z.enum(["week", "month", "all"]).default("week"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});
