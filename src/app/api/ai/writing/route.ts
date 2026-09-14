import type { Prisma } from "@prisma/client";

import { enforceRateLimit, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { review } from "@/lib/ai/writing";
import { analyse } from "@/lib/text";
import { recordActivity } from "@/lib/services/progress";
import { writingSubmitSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const submissions = await prisma.writingSubmission.findMany({
    where: { userId: claims.sub },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      feedback: {
        select: { overallBand: true, criteria: true, summary: true, createdAt: true },
      },
    },
  });
  return json({ submissions });
});

/** Submit a piece of writing and get a banded, annotated report back. */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  enforceRateLimit(req, "ai-writing", serverEnv().RATE_LIMIT_AI_PER_MIN, claims.sub);

  const body = await parseBody(req, writingSubmitSchema);
  const profile = await prisma.profile.findUnique({ where: { userId: claims.sub } });
  const cefr = profile?.cefrLevel ?? "B2";

  const stats = analyse(body.text);

  const report = await review({
    genre: body.genre,
    cefr,
    prompt: body.prompt,
    text: body.text,
  });

  const submission = await prisma.writingSubmission.create({
    data: {
      userId: claims.sub,
      genre: body.genre,
      cefr,
      prompt: body.prompt,
      title: body.title ?? null,
      text: body.text,
      wordCount: stats.wordCount,
      status: "SCORED",
      feedback: {
        create: {
          overallBand: report.overallBand,
          criteria: report.criteria as unknown as Prisma.InputJsonValue,
          annotations: report.annotations as unknown as Prisma.InputJsonValue,
          strengths: report.strengths,
          priorities: report.priorities,
          modelAnswer: report.modelAnswer ?? null,
          summary: report.summary,
          readability: stats as unknown as Prisma.InputJsonValue,
        },
      },
    },
    include: { feedback: true },
  });

  const rewards = await recordActivity({
    userId: claims.sub,
    source: "writingSubmission",
    refId: submission.id,
    // Band 9 is the ceiling, so normalise against it for the XP quality factor.
    scoreRatio: Math.min(1, report.overallBand / 9),
    skill: "WRITING",
    challengeContributions: { WRITING_WORDS: stats.wordCount },
  });

  return json({ submission, report, rewards }, { status: 201 });
});
