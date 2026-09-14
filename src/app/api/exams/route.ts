import { json, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exam modules grouped by exam, with the learner's best attempt on each. */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);

  const [modules, attempts, profile] = await Promise.all([
    prisma.examModule.findMany({
      orderBy: [{ exam: "asc" }, { order: "asc" }],
      include: { _count: { select: { tasks: true } } },
    }),
    prisma.examAttempt.findMany({
      where: { userId: claims.sub, status: "SCORED" },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true, moduleId: true, rawScore: true, maxScore: true,
        scaledScore: true, band: true, submittedAt: true, durationSec: true,
      },
    }),
    prisma.profile.findUnique({ where: { userId: claims.sub } }),
  ]);

  const bestByModule = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const current = bestByModule.get(attempt.moduleId);
    if (!current || attempt.rawScore > current.rawScore) bestByModule.set(attempt.moduleId, attempt);
  }

  const daysToExam = profile?.examDate
    ? Math.ceil((profile.examDate.getTime() - Date.now()) / 86_400_000)
    : null;

  return json({
    modules: modules.map((m) => ({
      ...m,
      taskCount: m._count.tasks,
      bestAttempt: bestByModule.get(m.id) ?? null,
      attemptCount: attempts.filter((a) => a.moduleId === m.id).length,
    })),
    targetExam: profile?.targetExam ?? null,
    examDate: profile?.examDate ?? null,
    daysToExam,
  });
});
