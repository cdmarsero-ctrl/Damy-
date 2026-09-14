import type { Prisma } from "@prisma/client";

import { ApiError, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { grade } from "@/lib/grading";
import { submitExerciseSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Grades a single exercise attempt.
 *
 * XP is deliberately NOT awarded here — it is awarded once per lesson in
 * /api/lessons/complete. Paying per exercise would make re-submitting the same
 * easy question an XP faucet.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const body = await parseBody(req, submitExerciseSchema);

  const exercise = await prisma.exercise.findUnique({
    where: { id: body.exerciseId },
    include: { lesson: { select: { id: true, skill: true } } },
  });
  if (!exercise) throw new ApiError(404, "Exercise not found", "not_found");

  const result = grade(exercise.type, exercise.solution, body.response);

  const progress = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: claims.sub, lessonId: exercise.lessonId } },
    update: { lastAttemptAt: new Date() },
    create: { userId: claims.sub, lessonId: exercise.lessonId, status: "IN_PROGRESS" },
  });

  const attempt = await prisma.exerciseAttempt.create({
    data: {
      userId: claims.sub,
      exerciseId: exercise.id,
      lessonProgressId: progress.id,
      response: body.response as Prisma.InputJsonValue,
      correct: result.correct,
      score: result.score,
      feedback: result as unknown as Prisma.InputJsonValue,
      durationMs: body.durationMs,
    },
  });

  // Getting a vocabulary exercise right is what earns the word a place in the
  // review queue — adding it on exposure alone floods the queue with words the
  // learner already knew.
  let cardCreated = false;
  if (exercise.lexicalItemId && result.score >= 0.6) {
    const existing = await prisma.reviewCard.findUnique({
      where: {
        userId_lexicalItemId: { userId: claims.sub, lexicalItemId: exercise.lexicalItemId },
      },
    });
    if (!existing) {
      await prisma.reviewCard.create({
        data: { userId: claims.sub, lexicalItemId: exercise.lexicalItemId },
      });
      cardCreated = true;
    }
  }

  return json({
    attemptId: attempt.id,
    ...result,
    explanation: exercise.explanation,
    addedToReview: cardCreated,
  });
});
