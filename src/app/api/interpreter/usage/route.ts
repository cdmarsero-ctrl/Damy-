import { json, requireApiUser, route } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { usedToday } from "@/lib/interpreter/sessions";

export const runtime = "nodejs";

/** The learner's interpreter minutes today, for the page to show. */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const env = serverEnv();
  const used = Math.round(await usedToday(claims.sub, new Date()));
  const daily = env.INTERPRETER_DAILY_MINUTES * 60;
  return json({
    dailySeconds: daily,
    usedSeconds: Math.min(used, daily),
    remainingSeconds: Math.max(0, daily - used),
    maxSessionSeconds: env.INTERPRETER_MAX_SESSION_MINUTES * 60,
  });
});
