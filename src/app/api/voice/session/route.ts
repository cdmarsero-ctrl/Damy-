import { ApiError, enforceRateLimit, json, requireApiUser, route } from "@/lib/api";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Hands the browser what it needs to open a voice session with the DAMI agent.
 *
 * With ELEVENLABS_API_KEY set we mint a single-use WebRTC conversation token
 * server-side, so the key never reaches the client and the agent can keep
 * authentication switched on. Without it we return the agent ID alone, which
 * ElevenLabs only accepts while the agent is public.
 */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const env = serverEnv();
  enforceRateLimit(req, "voice-session", env.RATE_LIMIT_AI_PER_MIN, claims.sub);

  const agentId = env.ELEVENLABS_AGENT_ID;
  const apiKey = env.ELEVENLABS_API_KEY.trim();
  if (!apiKey) return json({ mode: "public" as const, agentId });

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" },
  );
  if (!res.ok) {
    console.error("[voice] token request failed", res.status, await res.text().catch(() => ""));
    throw new ApiError(502, "The voice service is unavailable right now.", "upstream_error");
  }
  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new ApiError(502, "The voice service returned no token.", "upstream_error");

  return json({ mode: "token" as const, token });
});
