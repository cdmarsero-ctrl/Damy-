import { json, parseQuery, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { previewAll } from "@/lib/srs";
import { reviewQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The review queue.
 *
 * Ordering: overdue review cards first (they decay fastest), then cards still
 * in learning, then new cards. New cards are capped per session — a queue of
 * 200 unseen words is how learners quit a spaced-repetition system.
 */
const NEW_CARDS_PER_SESSION = 10;

export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const { limit, includeNew } = parseQuery(req, reviewQuerySchema);
  const now = new Date();

  const due = await prisma.reviewCard.findMany({
    where: {
      userId: claims.sub,
      suspended: false,
      dueAt: { lte: now },
      state: { in: ["REVIEW", "RELEARNING", "LEARNING"] },
    },
    orderBy: [{ dueAt: "asc" }],
    take: limit,
    include: { lexicalItem: true },
  });

  const remaining = Math.max(0, limit - due.length);
  const fresh =
    includeNew && remaining > 0
      ? await prisma.reviewCard.findMany({
          where: { userId: claims.sub, suspended: false, state: "NEW" },
          orderBy: [{ lexicalItem: { frequency: "asc" } }, { createdAt: "asc" }],
          take: Math.min(remaining, NEW_CARDS_PER_SESSION),
          include: { lexicalItem: true },
        })
      : [];

  const cards = [...due, ...fresh].map((card) => ({
    id: card.id,
    state: card.state,
    dueAt: card.dueAt,
    repetitions: card.repetitions,
    lapses: card.lapses,
    retention: card.retention,
    item: card.lexicalItem,
    // Interval previews are computed server-side so the buttons show the true
    // cost of each grade, using the same scheduler that will run on submit.
    intervals: previewAll(
      {
        state: card.state,
        easeFactor: card.easeFactor,
        intervalDays: card.intervalDays,
        repetitions: card.repetitions,
        lapses: card.lapses,
        retention: card.retention,
      },
      now,
    ),
  }));

  const [totalDue, totalNew, totalCards] = await Promise.all([
    prisma.reviewCard.count({
      where: { userId: claims.sub, suspended: false, dueAt: { lte: now }, state: { not: "NEW" } },
    }),
    prisma.reviewCard.count({ where: { userId: claims.sub, suspended: false, state: "NEW" } }),
    prisma.reviewCard.count({ where: { userId: claims.sub } }),
  ]);

  return json({ cards, counts: { due: totalDue, new: totalNew, total: totalCards } });
});
