import { ApiError, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { aggregateScore } from "@/lib/grading";
import { recordActivity, refreshEnrollmentProgress } from "@/lib/services/progress";
import { completeLessonSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Finalises a lesson: computes the aggregate score from the learner's *best*
 * attempt at each exercise, awards XP once, and advances track progress.
 *
 * Using best-per-exercise rather than most-recent means retrying a question you
 * got wrong is rewarded, which is the behaviour we want to encourage.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const { lessonId, timeSpentSec } = await parseBody(req, completeLessonSchema);

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { exercises: { select: { id: true, points: true } } },
  });
  if (!lesson) throw new ApiError(404, "Lesson not found", "not_found");

  const attempts = await prisma.exerciseAttempt.findMany({
    where: { userId: claims.sub, exerciseId: { in: lesson.exercises.map((e) => e.id) } },
    select: { exerciseId: true, score: true },
    orderBy: { createdAt: "asc" },
  });

  const bestByExercise = new Map<string, number>();
  for (const attempt of attempts) {
    const current = bestByExercise.get(attempt.exerciseId) ?? 0;
    if (attempt.score > current) bestByExercise.set(attempt.exerciseId, attempt.score);
  }

  const results = lesson.exercises.map((exercise) => ({
    score: bestByExercise.get(exercise.id) ?? 0,
    points: exercise.points,
  }));
  const score = aggregateScore(results);

  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: claims.sub, lessonId } },
  });
  const firstCompletion = !existing?.completedAt;

  const progress = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: claims.sub, lessonId } },
    update: {
      // "Mastered" requires near-perfection, so it stays meaningful.
      status: score >= 0.9 ? "MASTERED" : "COMPLETED",
      score,
      bestScore: Math.max(existing?.bestScore ?? 0, score),
      attempts: { increment: 1 },
      timeSpentSec: { increment: timeSpentSec },
      completedAt: existing?.completedAt ?? new Date(),
      lastAttemptAt: new Date(),
    },
    create: {
      userId: claims.sub,
      lessonId,
      status: score >= 0.9 ? "MASTERED" : "COMPLETED",
      score,
      bestScore: score,
      attempts: 1,
      timeSpentSec,
      completedAt: new Date(),
    },
  });

  await refreshEnrollmentProgress(claims.sub, lessonId);

  // Repeating a lesson is good practice but must not pay full XP again.
  const activity = await recordActivity({
    userId: claims.sub,
    source: "lessonComplete",
    refId: lessonId,
    scoreRatio: firstCompletion ? score : score * 0.25,
    counter: firstCompletion ? "lessonsCompleted" : undefined,
    skill: lesson.skill,
    minutes: Math.round(timeSpentSec / 60),
    challengeContributions: {
      LESSONS: firstCompletion ? 1 : 0,
      PERFECT_LESSON: score >= 0.99 ? 1 : 0,
    },
  });

  return json({ progress, score, firstCompletion, rewards: activity });
});
