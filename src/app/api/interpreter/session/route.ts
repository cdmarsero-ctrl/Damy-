import { ApiError, enforceRateLimit, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { createInterpreterSession, liveKitConfig, newRoomName } from "@/lib/interpreter/livekit";
import { usedToday } from "@/lib/interpreter/sessions";
import { sessionAllowance } from "@/lib/interpreter/usage";
import { interpreterSessionSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Mints a LiveKit token for one interpreter session and dispatches the agent
 * into a fresh room.
 *
 * Vendor credentials stay on the server and in the agent; the browser only
 * ever holds this short-lived, single-room token. Each session is recorded
 * (Phase 6) so the learner's daily minutes can be enforced: the session's
 * length is capped to what is left and signed into the token, and the agent
 * ends it there.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const env = serverEnv();
  enforceRateLimit(req, "interpreter", env.RATE_LIMIT_AI_PER_MIN, claims.sub);
  const body = await parseBody(req, interpreterSessionSchema);

  const config = liveKitConfig(env);
  if (!config) {
    throw new ApiError(
      503,
      "The live interpreter is not configured on this server.",
      "interpreter_unavailable",
    );
  }

  const now = new Date();
  const used = await usedToday(claims.sub, now);
  const maxSeconds = sessionAllowance({
    dailyMinutes: env.INTERPRETER_DAILY_MINUTES,
    maxSessionMinutes: env.INTERPRETER_MAX_SESSION_MINUTES,
    usedSeconds: used,
  });
  if (maxSeconds === null) {
    throw new ApiError(
      429,
      `You've used today's ${env.INTERPRETER_DAILY_MINUTES} interpreter minutes. They reset at midnight UTC.`,
      "interpreter_quota",
    );
  }

  const room = newRoomName(claims.sub);
  await prisma.interpreterSession.create({
    data: {
      userId: claims.sub,
      room,
      sourceLanguage: body.sourceLanguage,
      targetLanguage: body.targetLanguage,
      maxSeconds,
    },
  });
  const session = await createInterpreterSession(
    config,
    { id: claims.sub, name: claims.name },
    { sourceLanguage: body.sourceLanguage, targetLanguage: body.targetLanguage, maxSeconds },
    room,
  );
  return json({ ...session, maxSeconds }, { status: 201 });
});
