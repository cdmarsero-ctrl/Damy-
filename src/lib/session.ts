import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACCESS_COOKIE, verifyAccessToken, type AccessClaims } from "./auth";
import { prisma } from "./db";

/** Claims only — no database round trip. Use when you just need the user id. */
export async function getClaims(): Promise<AccessClaims | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function requireClaims(): Promise<AccessClaims> {
  const claims = await getClaims();
  if (!claims) redirect("/login");
  return claims;
}

/** The full learner record every authenticated page needs: identity, CEFR
 *  level, goals, gamification counters and accessibility settings. */
export async function getCurrentUser() {
  const claims = await getClaims();
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      profile: true,
      settings: true,
      stats: true,
    },
  });
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Pages behind onboarding: send anyone without a placement result to the test. */
export async function requirePlacedUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.profile?.placedAt) redirect("/placement");
  return user;
}
