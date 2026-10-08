import { ApiError, enforceRateLimit, json, parseBody, requireApiUser, route } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { createInterpreterSession, liveKitConfig } from "@/lib/interpreter/livekit";
import { interpreterSessionSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Mints a LiveKit token for one interpreter session and dispatches the agent
 * into a fresh room.
 *
 * Vendor credentials (LiveKit now; ASR, MT and TTS keys in later phases) stay
 * on the server and in the agent; the browser only ever holds this
 * short-lived, single-room token.
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

  const session = await createInterpreterSession(
    config,
    { id: claims.sub, name: claims.name },
    { sourceLanguage: body.sourceLanguage, targetLanguage: body.targetLanguage },
  );
  return json(session, { status: 201 });
});
