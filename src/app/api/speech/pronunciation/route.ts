import type { Prisma } from "@prisma/client";

import { json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { score } from "@/lib/speech/pronunciation";
import { recordActivity } from "@/lib/services/progress";
import { pronunciationSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Scores a pronunciation attempt.
 *
 * The audio never leaves the learner's device — the browser's SpeechRecognition
 * API transcribes locally (or via the browser vendor's own service) and we
 * receive only text. That keeps voice data out of our database entirely, which
 * is both a privacy property worth having and one less thing to secure.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const body = await parseBody(req, pronunciationSchema);

  const result = score({
    target: body.targetText,
    transcript: body.transcript,
    durationMs: body.durationMs,
    accent: body.accent,
  });

  const attempt = await prisma.pronunciationAttempt.create({
    data: {
      userId: claims.sub,
      targetText: body.targetText,
      transcript: body.transcript,
      accuracy: result.accuracy,
      fluency: result.fluency,
      completeness: result.completeness,
      prosody: result.prosody,
      overall: result.overall,
      accent: body.accent,
      wordScores: result.wordScores as unknown as Prisma.InputJsonValue,
      tips: result.tips,
      durationMs: body.durationMs,
    },
  });

  const rewards = await recordActivity({
    userId: claims.sub,
    source: "pronunciationAttempt",
    refId: attempt.id,
    scoreRatio: result.overall / 100,
    skill: "PRONUNCIATION",
    challengeContributions: { SPEAKING_MINUTES: Math.max(1, Math.round(body.durationMs / 60000)) },
  });

  return json({ attempt, result, rewards }, { status: 201 });
});

export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const attempts = await prisma.pronunciationAttempt.findMany({
    where: { userId: claims.sub },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return json({ attempts });
});
