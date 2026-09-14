import { createAuthSession, setAuthCookies, signAccessToken, verifyPassword } from "@/lib/auth";
import { ApiError, enforceRateLimit, json, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Hash of a throwaway password. Compared against when the email is unknown so
 *  that a missing account and a wrong password take the same time to answer —
 *  otherwise response timing enumerates registered addresses. */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.gJq/5FkH1Vx0N0hJc4kQ8Z9Kk6Bq0Xu";

export const POST = route(async (req) => {
  enforceRateLimit(req, "login", serverEnv().RATE_LIMIT_AUTH_PER_MIN);

  const { email, password } = await parseBody(req, loginSchema);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, name: true, role: true, passwordHash: true,
      profile: { select: { placedAt: true } },
    },
  });

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new ApiError(401, "That email and password do not match.", "invalid_credentials");
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  const refresh = await createAuthSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  await setAuthCookies(accessToken, refresh.raw, refresh.expiresAt);

  return json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    next: user.profile?.placedAt ? "/dashboard" : "/placement",
  });
});
