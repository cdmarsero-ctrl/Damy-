import { cookies } from "next/headers";

import {
  REFRESH_COOKIE,
  clearAuthCookies,
  rotateRefreshToken,
  setAuthCookies,
  signAccessToken,
} from "@/lib/auth";
import { ApiError, json, route } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Silent re-authentication. The client calls this on a 401 and retries once;
 * see src/lib/client.ts#apiFetch.
 */
export const POST = route(async (req) => {
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!token) throw new ApiError(401, "No session to refresh.", "no_session");

  const rotated = await rotateRefreshToken(token, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  if (!rotated) {
    await clearAuthCookies();
    throw new ApiError(401, "Your session has expired. Please sign in again.", "session_expired");
  }

  const accessToken = await signAccessToken({
    sub: rotated.user.id,
    email: rotated.user.email,
    name: rotated.user.name,
    role: rotated.user.role,
  });
  await setAuthCookies(accessToken, rotated.refresh.raw, rotated.refresh.expiresAt);

  return json({ ok: true });
});
