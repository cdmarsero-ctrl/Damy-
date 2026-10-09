import { ApiError, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { REPORT_SIGNATURE_HEADER, sessionReportSchema, verifyReportSignature } from "@/lib/interpreter/usage";

export const runtime = "nodejs";

/**
 * The agent's end-of-session report: duration, vendor usage and latency
 * summaries (no audio, no transcript text). Called by the agent, not the
 * browser, so it is authenticated by an HMAC of the body under the LiveKit
 * API secret rather than a user cookie. Each session reports once.
 */
export const POST = route(async (req) => {
  const secret = serverEnv().LIVEKIT_API_SECRET.trim();
  if (!secret) throw new ApiError(503, "The live interpreter is not configured.", "interpreter_unavailable");

  const raw = await req.text();
  if (!verifyReportSignature(raw, req.headers.get(REPORT_SIGNATURE_HEADER), secret)) {
    throw new ApiError(401, "Bad report signature.", "bad_signature");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "The report is not JSON.", "bad_json");
  }
  const report = sessionReportSchema.parse(parsed);

  const { count } = await prisma.interpreterSession.updateMany({
    // A session the page released as "no-agent" is replaced: the agent's own
    // report is the authority on what was used.
    where: { room: report.room, OR: [{ endedAt: null }, { endReason: "no-agent" }] },
    data: {
      endedAt: new Date(),
      durationSeconds: Math.round(report.durationSeconds),
      endReason: report.endReason,
      ...report.usage,
      ...report.quality,
    },
  });
  if (count === 0) {
    const exists = await prisma.interpreterSession.findUnique({ where: { room: report.room }, select: { id: true } });
    throw exists
      ? new ApiError(409, "This session was already reported.", "already_reported")
      : new ApiError(404, "No such interpreter session.", "not_found");
  }
  return new Response(null, { status: 204 });
});
