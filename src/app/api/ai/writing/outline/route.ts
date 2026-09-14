import { enforceRateLimit, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { outline } from "@/lib/ai/writing";
import { outlineSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 45;

/** Planning help, offered before the learner writes — where it does most good. */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  enforceRateLimit(req, "ai-outline", serverEnv().RATE_LIMIT_AI_PER_MIN, claims.sub);

  const { genre, prompt } = await parseBody(req, outlineSchema);
  const profile = await prisma.profile.findUnique({ where: { userId: claims.sub } });

  const steps = await outline(genre, prompt, profile?.cefrLevel ?? "B2");
  return json({ outline: steps });
});
