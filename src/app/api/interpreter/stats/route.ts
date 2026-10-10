import { z } from "zod";

import { ApiError, json, requireApiUser, route } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { interpreterStats } from "@/lib/interpreter/sessions";

export const runtime = "nodejs";

const query = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });

/** Per-language-pair latency, usage and estimated cost (admins only). */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  if (claims.role !== "ADMIN") throw new ApiError(403, "Admins only.", "forbidden");
  const { days } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await interpreterStats(days, serverEnv()));
});
