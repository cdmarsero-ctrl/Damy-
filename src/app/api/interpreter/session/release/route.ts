import { z } from "zod";

import { json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const body = z.object({ room: z.string().min(1).max(200) });

/**
 * The page calls this when the agent never joined its session, so the session
 * doesn't count against the learner's minutes at its full limit. It only
 * marks the learner's own unreported session; if an agent did join after all,
 * its end-of-session report still replaces this (see the report route).
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const { room } = await parseBody(req, body);
  const { count } = await prisma.interpreterSession.updateMany({
    where: { room, userId: claims.sub, endedAt: null },
    data: { endedAt: new Date(), durationSeconds: 0, endReason: NO_AGENT },
  });
  return json({ released: count === 1 });
});

const NO_AGENT = "no-agent";
