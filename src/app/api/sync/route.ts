import { Prisma } from "@prisma/client";

import { json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isMastered, schedule } from "@/lib/srs";
import { recordActivity } from "@/lib/services/progress";
import { syncSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Offline replay.
 *
 * The client buffers activity in IndexedDB while offline and POSTs it here on
 * reconnect. Each mutation carries a client-generated idempotencyKey; the
 * unique constraint on (userId, idempotencyKey) means replaying the same batch
 * — which will happen, because the client cannot know whether a request that
 * timed out was applied — is a no-op rather than double credit.
 *
 * Mutations are applied in the order they occurred on the device, not the order
 * they arrive, so a card graded three times offline ends with the right
 * interval.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const { clientId, mutations } = await parseBody(req, syncSchema);

  const ordered = [...mutations].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  const applied: string[] = [];
  const skipped: string[] = [];
  const failed: { key: string; reason: string }[] = [];

  for (const mutation of ordered) {
    const already = await prisma.syncMutation.findUnique({
      where: {
        userId_idempotencyKey: { userId: claims.sub, idempotencyKey: mutation.idempotencyKey },
      },
    });
    if (already) {
      skipped.push(mutation.idempotencyKey);
      continue;
    }

    try {
      await apply(claims.sub, mutation.kind, mutation.payload, new Date(mutation.occurredAt));

      await prisma.syncMutation.create({
        data: {
          userId: claims.sub,
          clientId,
          idempotencyKey: mutation.idempotencyKey,
          kind: mutation.kind,
          payload: mutation.payload as Prisma.InputJsonValue,
        },
      });
      applied.push(mutation.idempotencyKey);
    } catch (error) {
      // One bad mutation must not block the rest of the batch — the client
      // drops what we report as failed rather than retrying it forever.
      failed.push({
        key: mutation.idempotencyKey,
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return json({ applied: applied.length, skipped: skipped.length, failed });
});

type Payload = Record<string, unknown>;

async function apply(userId: string, kind: string, payload: Payload, occurredAt: Date) {
  switch (kind) {
    case "reviewGrade": {
      const cardId = String(payload.cardId ?? "");
      const rating = String(payload.rating ?? "GOOD") as "AGAIN" | "HARD" | "GOOD" | "EASY";

      const card = await prisma.reviewCard.findUnique({ where: { id: cardId } });
      if (!card || card.userId !== userId) throw new Error("card not found");

      const snapshot = {
        state: card.state,
        easeFactor: card.easeFactor,
        intervalDays: card.intervalDays,
        repetitions: card.repetitions,
        lapses: card.lapses,
        retention: card.retention,
      };
      // Schedule from when the review actually happened, so an offline review
      // does not have its interval start from the moment of reconnection.
      const next = schedule(snapshot, rating, occurredAt);
      const wasMastered = isMastered(snapshot);
      const nowMastered = isMastered(next);

      await prisma.$transaction([
        prisma.reviewCard.update({
          where: { id: card.id },
          data: {
            state: next.state,
            easeFactor: next.easeFactor,
            intervalDays: next.intervalDays,
            repetitions: next.repetitions,
            lapses: next.lapses,
            retention: next.retention,
            dueAt: next.dueAt,
            lastReviewedAt: occurredAt,
          },
        }),
        prisma.reviewLog.create({
          data: {
            cardId: card.id,
            userId,
            rating,
            prevInterval: card.intervalDays,
            newInterval: next.intervalDays,
            prevEase: card.easeFactor,
            newEase: next.easeFactor,
            durationMs: Number(payload.durationMs ?? 0),
            reviewedAt: occurredAt,
          },
        }),
        ...(nowMastered !== wasMastered
          ? [
              prisma.userStats.update({
                where: { userId },
                data: { wordsMastered: { increment: nowMastered ? 1 : -1 } },
              }),
            ]
          : []),
      ]);

      await recordActivity({
        userId,
        source: "reviewCard",
        refId: card.id,
        scoreRatio: rating === "AGAIN" ? 0.2 : rating === "HARD" ? 0.7 : 1,
        counter: "reviewsCompleted",
        skill: "VOCABULARY",
        challengeContributions: { REVIEWS: 1 },
      });
      return;
    }

    case "studyTime": {
      const minutes = Math.max(0, Math.min(600, Number(payload.minutes ?? 0)));
      await prisma.studySession.create({
        data: {
          userId,
          activity: String(payload.activity ?? "offline"),
          minutes,
          startedAt: occurredAt,
          endedAt: new Date(occurredAt.getTime() + minutes * 60_000),
        },
      });
      await prisma.userStats.update({
        where: { userId },
        data: { minutesTotal: { increment: minutes } },
      });
      return;
    }

    case "exerciseAttempt": {
      // Exercise grading requires the solution, which never goes offline — the
      // client stores the raw response and it is graded here on reconnect.
      const exerciseId = String(payload.exerciseId ?? "");
      const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
      if (!exercise) throw new Error("exercise not found");

      const { grade } = await import("@/lib/grading");
      const result = grade(exercise.type, exercise.solution, payload.response);

      const progress = await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: exercise.lessonId } },
        update: { lastAttemptAt: occurredAt },
        create: { userId, lessonId: exercise.lessonId, status: "IN_PROGRESS" },
      });

      await prisma.exerciseAttempt.create({
        data: {
          userId,
          exerciseId,
          lessonProgressId: progress.id,
          response: payload.response as Prisma.InputJsonValue,
          correct: result.correct,
          score: result.score,
          feedback: result as unknown as Prisma.InputJsonValue,
          durationMs: Number(payload.durationMs ?? 0),
          createdAt: occurredAt,
        },
      });
      return;
    }

    case "lessonComplete": {
      const lessonId = String(payload.lessonId ?? "");
      const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
      if (!lesson) throw new Error("lesson not found");

      const score = Math.max(0, Math.min(1, Number(payload.score ?? 0)));
      const existing = await prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
      });

      await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: {
          status: score >= 0.9 ? "MASTERED" : "COMPLETED",
          score,
          bestScore: Math.max(existing?.bestScore ?? 0, score),
          attempts: { increment: 1 },
          completedAt: existing?.completedAt ?? occurredAt,
        },
        create: {
          userId,
          lessonId,
          status: score >= 0.9 ? "MASTERED" : "COMPLETED",
          score,
          bestScore: score,
          attempts: 1,
          completedAt: occurredAt,
        },
      });

      const { refreshEnrollmentProgress } = await import("@/lib/services/progress");
      await refreshEnrollmentProgress(userId, lessonId);

      await recordActivity({
        userId,
        source: "lessonComplete",
        refId: lessonId,
        scoreRatio: existing?.completedAt ? score * 0.25 : score,
        counter: existing?.completedAt ? undefined : "lessonsCompleted",
        skill: lesson.skill,
        challengeContributions: { LESSONS: existing?.completedAt ? 0 : 1 },
      });
      return;
    }

    default:
      throw new Error(`unknown mutation kind: ${kind}`);
  }
}

/** Pull side: everything the client needs to cache for offline study. */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);

  const [cards, lessons, profile] = await Promise.all([
    prisma.reviewCard.findMany({
      where: {
        userId: claims.sub,
        suspended: false,
        dueAt: { lte: new Date(Date.now() + 3 * 86_400_000) },
      },
      include: { lexicalItem: true },
      take: 300,
    }),
    // Cache the next few lessons in the learner's primary track, without
    // solutions — offline attempts are graded on reconnect.
    prisma.lesson.findMany({
      where: {
        published: true,
        unit: { track: { enrollments: { some: { userId: claims.sub } } } },
        progress: { none: { userId: claims.sub, status: { in: ["COMPLETED", "MASTERED"] } } },
      },
      orderBy: [{ unit: { order: "asc" } }, { order: "asc" }],
      take: 10,
      include: {
        exercises: {
          orderBy: { order: "asc" },
          select: {
            id: true, order: true, type: true, skill: true, cefr: true,
            prompt: true, instructions: true, payload: true, points: true,
          },
        },
      },
    }),
    prisma.profile.findUnique({ where: { userId: claims.sub } }),
  ]);

  return json({ cards, lessons, profile, cachedAt: new Date().toISOString() });
});
