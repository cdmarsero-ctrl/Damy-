import { Prisma } from "@prisma/client";

import { createAuthSession, hashPassword, setAuthCookies, signAccessToken } from "@/lib/auth";
import { enforceRateLimit, json, parseBody, route, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { registerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  enforceRateLimit(req, "register", serverEnv().RATE_LIMIT_AUTH_PER_MIN);

  const { name, email, password } = await parseBody(req, registerSchema);
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        // A learner is usable from the first request: profile, settings and
        // stats are created together so nothing downstream has to null-check.
        profile: { create: {} },
        settings: { create: {} },
        stats: { create: {} },
      },
      select: { id: true, email: true, name: true, role: true },
    });

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

    return json({ user, next: "/placement" }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "An account with that email already exists.", "email_taken");
    }
    throw error;
  }
});
