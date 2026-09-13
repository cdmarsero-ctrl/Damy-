import { ApiError, json, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ lessonId: string }> };

/**
 * A lesson with its exercises — solutions stripped.
 *
 * The `solution` column never leaves the server. Grading happens in
 * /api/lessons/submit, so a learner cannot read the answers out of the network
 * tab. This is the reason exercises are not simply included in a page's RSC
 * payload.
 */
export const GET = route<Ctx>(async (req, ctx) => {
  const claims = await requireApiUser(req);
  const { lessonId } = await ctx.params;

  const lesson = await prisma.lesson.findFirst({
    where: { OR: [{ id: lessonId }, { slug: lessonId }], published: true },
    include: {
      unit: { include: { track: { select: { id: true, slug: true, title: true, accent: true } } } },
      exercises: {
        orderBy: { order: "asc" },
        select: {
          id: true, order: true, type: true, skill: true, cefr: true,
          prompt: true, instructions: true, payload: true, points: true, tags: true,
          lexicalItem: {
            select: { id: true, headword: true, ipa: true, definition: true, register: true },
          },
        },
      },
    },
  });

  if (!lesson) throw new ApiError(404, "Lesson not found", "not_found");

  const progress = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: claims.sub, lessonId: lesson.id } },
  });

  // Neighbours power the "next lesson" button at the end of the player.
  const siblings = await prisma.lesson.findMany({
    where: { unitId: lesson.unitId, published: true },
    orderBy: { order: "asc" },
    select: { id: true, slug: true, title: true, order: true },
  });
  const index = siblings.findIndex((s) => s.id === lesson.id);

  return json({
    lesson,
    progress,
    navigation: {
      previous: index > 0 ? siblings[index - 1] : null,
      next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null,
      position: index + 1,
      total: siblings.length,
    },
  });
});
