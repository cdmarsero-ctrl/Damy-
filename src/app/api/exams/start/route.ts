import { ApiError, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { examStartSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Starts a timed attempt and returns the tasks with solutions stripped. */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const { moduleId } = await parseBody(req, examStartSchema);

  const module = await prisma.examModule.findUnique({
    where: { id: moduleId },
    include: {
      tasks: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, type: true, prompt: true, payload: true, points: true },
      },
    },
  });
  if (!module) throw new ApiError(404, "Exam module not found", "not_found");

  // Abandon any stale attempt so a learner never has two clocks running.
  await prisma.examAttempt.updateMany({
    where: { userId: claims.sub, moduleId, status: "IN_PROGRESS" },
    data: { status: "ABANDONED" },
  });

  const maxScore = await prisma.examTask.aggregate({
    where: { moduleId },
    _sum: { points: true },
  });

  const attempt = await prisma.examAttempt.create({
    data: { userId: claims.sub, moduleId, maxScore: maxScore._sum.points ?? 0 },
  });

  return json({
    attempt,
    module: { ...module, tasks: undefined },
    tasks: module.tasks,
    endsAt: new Date(Date.now() + module.durationMin * 60_000),
  }, { status: 201 });
});
