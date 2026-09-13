import { ApiError, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isMastered, schedule } from "@/lib/srs";
import { recordActivity } from "@/lib/services/progress";
import { reviewGradeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const { cardId, rating, durationMs } = await parseBody(req, reviewGradeSchema);

  const card = await prisma.reviewCard.findUnique({
    where: { id: cardId },
    include: { lexicalItem: { select: { headword: true } } },
  });
  if (!card || card.userId !== claims.sub) throw new ApiError(404, "Card not found", "not_found");

  const snapshot = {
    state: card.state,
    easeFactor: card.easeFactor,
    intervalDays: card.intervalDays,
    repetitions: card.repetitions,
    lapses: card.lapses,
    retention: card.retention,
  };
  const wasMastered = isMastered(snapshot);
  const next = schedule(snapshot, rating);
  const nowMastered = isMastered(next);

  const [updated] = await prisma.$transaction([
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
        lastReviewedAt: new Date(),
      },
    }),
    prisma.reviewLog.create({
      data: {
        cardId: card.id,
        userId: claims.sub,
        rating,
        prevInterval: card.intervalDays,
        newInterval: next.intervalDays,
        prevEase: card.easeFactor,
        newEase: next.easeFactor,
        durationMs,
      },
    }),
    // Mastery is a transition, counted once in each direction.
    ...(nowMastered !== wasMastered
      ? [
          prisma.userStats.update({
            where: { userId: claims.sub },
            data: { wordsMastered: { increment: nowMastered ? 1 : -1 } },
          }),
        ]
      : []),
  ]);

  const rewards = await recordActivity({
    userId: claims.sub,
    source: "reviewCard",
    refId: card.id,
    scoreRatio: rating === "AGAIN" ? 0.2 : rating === "HARD" ? 0.7 : 1,
    counter: "reviewsCompleted",
    skill: "VOCABULARY",
    challengeContributions: { REVIEWS: 1 },
  });

  return json({
    card: updated,
    interval: next.intervalLabel,
    dueAt: next.dueAt,
    mastered: nowMastered && !wasMastered,
    rewards,
  });
});
