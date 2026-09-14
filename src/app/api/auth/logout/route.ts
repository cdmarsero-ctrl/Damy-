import { cookies } from "next/headers";

import { REFRESH_COOKIE, clearAuthCookies, revokeRefreshToken } from "@/lib/auth";
import { json, route } from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(async () => {
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (token) await revokeRefreshToken(token);
  await clearAuthCookies();
  return json({ ok: true });
});
