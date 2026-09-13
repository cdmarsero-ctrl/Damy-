import type { Prisma } from "@prisma/client";

import { ApiError, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { grade } from "@/lib/grading";
import { toBand } from "@/lib/exams";
import { recordActivity } from "@/lib/services/progress";
import { examSubmitSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const { attemptId, responses, durationSec } = await parseBody(req, examSubmitSchema);

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { module: { include: { tasks: true } } },
  });
  if (!attempt || attempt.userId !== claims.sub) {
    throw new ApiError(404, "Attempt not found", "not_found");
  }
  if (attempt.status === "SCORED") {
    throw new ApiError(409, "This attempt has already been scored.", "already_scored");
  }

  const tasksById = new Map(attempt.module.tasks.map((t) => [t.id, t]));
  let rawScore = 0;
  const maxScore = attempt.module.tasks.reduce((sum, t) => sum + t.points, 0);
  const rows: Prisma.ExamResponseCreateManyInput[] = [];

  for (const entry of responses) {
    const task = tasksById.get(entry.taskId);
    if (!task) continue;

    const result = grade(task.type, task.solution, entry.response);
    const earned = result.score * task.points;
    rawScore += earned;

    rows.push({
      attemptId,
      taskId: task.id,
      response: entry.response as Prisma.InputJsonValue,
      score: Math.round(earned * 100) / 100,
      feedback: result as unknown as Prisma.InputJsonValue,
    });
  }

  const scoring = toBand(attempt.module.exam, rawScore, maxScore);

  const [updated] = await prisma.$transaction([
    prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: "SCORED",
        rawScore: Math.round(rawScore * 100) / 100,
        maxScore,
        scaledScore: scoring.scaled,
        band: scoring.label,
        submittedAt: new Date(),
        durationSec,
      },
    }),
    prisma.examResponse.createMany({ data: rows, skipDuplicates: true }),
  ]);

  const rewards = await recordActivity({
    userId: claims.sub,
    source: "examTaskCorrect",
    refId: attemptId,
    scoreRatio: maxScore > 0 ? rawScore / maxScore : 0,
    skill: sectionToSkill(attempt.module.section),
    minutes: Math.round(durationSec / 60),
  });

  return json({
    attempt: updated,
    scoring,
    // The rationale for every task is released only after submission.
    review: attempt.module.tasks.map((task) => ({
      taskId: task.id,
      prompt: task.prompt,
      solution: task.solution,
      rubric: task.rubric,
      response: rows.find((r) => r.taskId === task.id) ?? null,
    })),
    rewards,
  });
});

function sectionToSkill(section: string) {
  const normalised = section.toLowerCase();
  if (normalised.includes("read")) return "READING" as const;
  if (normalised.includes("listen")) return "LISTENING" as const;
  if (normalised.includes("writ")) return "WRITING" as const;
  if (normalised.includes("speak")) return "SPEAKING" as const;
  return "GRAMMAR" as const;
}
