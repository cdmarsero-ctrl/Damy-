import { Prisma } from "@prisma/client";

import { ApiError, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { estimate, selectNext, shouldStop, summarise, type ItemParams, type Response } from "@/lib/placement";
import { recordActivity } from "@/lib/services/progress";
import { placementAnswerSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scores one item, re-estimates ability, and returns either the next item or
 * the final placement.
 *
 * The estimate is recomputed from the full response set every time rather than
 * updated incrementally — with at most 22 items it costs nothing, and it means
 * a resumed test cannot drift from a fresh one.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const body = await parseBody(req, placementAnswerSchema);

  const test = await prisma.placementTest.findUnique({
    where: { id: body.testId },
    include: { responses: { include: { item: true } } },
  });

  if (!test || test.userId !== claims.sub) throw new ApiError(404, "Test not found", "not_found");
  if (test.status !== "IN_PROGRESS") {
    throw new ApiError(409, "This test has already been submitted.", "test_complete");
  }

  const item = await prisma.placementItem.findUnique({ where: { id: body.itemId } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");

  const correct = body.answerIndex === item.answerIndex;

  const priorResponses: Response[] = test.responses.map((r) => ({
    item: toParams(r.item),
    correct: r.correct,
  }));
  const allResponses: Response[] = [...priorResponses, { item: toParams(item), correct }];

  const { theta, se } = estimate(allResponses);

  try {
    await prisma.placementResponse.create({
      data: {
        testId: test.id,
        itemId: item.id,
        answerIndex: body.answerIndex,
        correct,
        responseMs: body.responseMs,
        thetaAfter: theta,
        seAfter: se,
      },
    });
  } catch (error) {
    // Double-submit of the same item (flaky connection, double click) is not
    // an error — return the state the client should already have.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "That question was already answered.", "duplicate_answer");
    }
    throw error;
  }

  const done = shouldStop(allResponses, se);

  if (!done) {
    const pool = await loadPool();
    const used = new Set(allResponses.map((r) => r.item.id));
    const next = selectNext(theta, pool, used, allResponses);

    if (next) {
      await prisma.placementTest.update({
        where: { id: test.id },
        data: { theta, standardError: se },
      });

      return json({
        done: false,
        answered: allResponses.length,
        theta,
        standardError: se,
        feedback: { correct, rationale: item.rationale },
        item: await publicItem(next.id),
      });
    }
  }

  // --- finalise -------------------------------------------------------------
  const outcome = summarise(allResponses);

  await prisma.$transaction([
    prisma.placementTest.update({
      where: { id: test.id },
      data: {
        status: "SCORED",
        theta: outcome.theta,
        standardError: outcome.se,
        resultLevel: outcome.level,
        subscores: outcome.subscores as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    }),
    prisma.profile.upsert({
      where: { userId: claims.sub },
      update: { cefrLevel: outcome.level, theta: outcome.theta, placedAt: new Date() },
      create: {
        userId: claims.sub,
        cefrLevel: outcome.level,
        theta: outcome.theta,
        placedAt: new Date(),
      },
    }),
  ]);

  await recordActivity({
    userId: claims.sub,
    source: "placementComplete",
    refId: test.id,
    scoreRatio: 1,
  });

  return json({
    done: true,
    answered: allResponses.length,
    feedback: { correct, rationale: item.rationale },
    result: outcome,
  });
});

function toParams(item: {
  id: string;
  skill: ItemParams["skill"];
  cefr: ItemParams["cefr"];
  discrimination: number;
  difficulty: number;
  guessing: number;
}): ItemParams {
  return {
    id: item.id,
    skill: item.skill,
    cefr: item.cefr,
    a: item.discrimination,
    b: item.difficulty,
    c: item.guessing,
  };
}

async function loadPool(): Promise<ItemParams[]> {
  const items = await prisma.placementItem.findMany({
    where: { active: true },
    select: { id: true, skill: true, cefr: true, discrimination: true, difficulty: true, guessing: true },
  });
  return items.map(toParams);
}

async function publicItem(itemId: string) {
  return prisma.placementItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { id: true, skill: true, prompt: true, context: true, options: true },
  });
}
