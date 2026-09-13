import { ApiError, json, requireApiUser, route } from "@/lib/api";
import { cefrToTheta } from "@/lib/cefr";
import { prisma } from "@/lib/db";
import { MAX_ITEMS, selectNext, type ItemParams } from "@/lib/placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Begins (or resumes) an adaptive placement test and returns the first item.
 *
 * Resuming matters: the test takes 10-15 minutes and a learner who closes the
 * tab should not have to start over. An in-progress test is picked up with its
 * ability estimate intact.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);

  const existing = await prisma.placementTest.findFirst({
    where: { userId: claims.sub, status: "IN_PROGRESS" },
    include: { responses: true },
    orderBy: { startedAt: "desc" },
  });

  const profile = await prisma.profile.findUnique({ where: { userId: claims.sub } });

  const test =
    existing ??
    (await prisma.placementTest.create({
      data: {
        userId: claims.sub,
        // Warm-start from a previous placement so a re-test does not begin
        // from scratch for someone we already know is C1.
        theta: profile?.placedAt ? profile.theta : cefrToTheta(profile?.cefrLevel ?? "B2"),
      },
      include: { responses: true },
    }));

  const answered = test.responses.length;
  if (answered >= MAX_ITEMS) {
    throw new ApiError(409, "This test is already complete.", "test_complete");
  }

  const pool = await loadPool();
  const used = new Set(test.responses.map((r) => r.itemId));
  const next = selectNext(test.theta, pool, used, []);

  if (!next) throw new ApiError(503, "The item bank is empty — run the seed script.", "no_items");

  return json({
    testId: test.id,
    theta: test.theta,
    standardError: test.standardError,
    answered,
    maxItems: MAX_ITEMS,
    item: await publicItem(next.id),
  });
});

async function loadPool(): Promise<ItemParams[]> {
  const items = await prisma.placementItem.findMany({
    where: { active: true },
    select: { id: true, skill: true, cefr: true, discrimination: true, difficulty: true, guessing: true },
  });
  return items.map((i) => ({
    id: i.id,
    skill: i.skill,
    cefr: i.cefr,
    a: i.discrimination,
    b: i.difficulty,
    c: i.guessing,
  }));
}

/** Never send answerIndex or rationale to the client mid-test. */
async function publicItem(itemId: string) {
  const item = await prisma.placementItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { id: true, skill: true, prompt: true, context: true, options: true },
  });
  return item;
}
