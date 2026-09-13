import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

import { prisma } from "./db";
import { serverEnv } from "./env";

export const ACCESS_COOKIE = "lx_at";
export const REFRESH_COOKIE = "lx_rt";

export interface AccessClaims {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv().AUTH_SECRET);
}

// --- passwords -------------------------------------------------------------

/** Cost 12 ≈ 250ms on commodity hardware — slow enough to matter, fast enough
 *  that a login does not feel broken. */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// --- access tokens (stateless JWT) -----------------------------------------

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const ttl = serverEnv().ACCESS_TTL_MINUTES;
  return new SignJWT({ email: claims.email, name: claims.name, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("lexicon")
    .setAudience("lexicon-web")
    .setExpirationTime(`${ttl}m`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "lexicon",
      audience: "lexicon-web",
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: (payload.role as Role) ?? "LEARNER",
    };
  } catch {
    return null;
  }
}

// --- refresh tokens (opaque, stored hashed) --------------------------------

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(48).toString("base64url");
  return { raw, hash: sha256(raw) };
}

export function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export async function createAuthSession(userId: string, meta: SessionMeta = {}) {
  const { raw, hash } = newRefreshToken();
  const days = serverEnv().REFRESH_TTL_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });
  return { raw, expiresAt };
}

/**
 * Rotating refresh: the presented token is revoked and a fresh one issued.
 * Presenting an already-revoked token revokes the whole family — the standard
 * mitigation for refresh-token theft.
 */
export async function rotateRefreshToken(rawToken: string, meta: SessionMeta = {}) {
  const hash = sha256(rawToken);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!session) return null;

  if (session.revokedAt) {
    // Replay of a consumed token — assume compromise and drop every session.
    await prisma.authSession.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) return null;

  await prisma.authSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const next = await createAuthSession(session.userId, meta);
  return { user: session.user, refresh: next };
}

export async function revokeRefreshToken(rawToken: string) {
  await prisma.authSession.updateMany({
    where: { tokenHash: sha256(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// --- cookie plumbing --------------------------------------------------------

const isProd = process.env.NODE_ENV === "production";

export async function setAuthCookies(accessToken: string, refreshToken: string, refreshExpires: Date) {
  const jar = await cookies();
  const base = {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
  jar.set(ACCESS_COOKIE, accessToken, {
    ...base,
    maxAge: serverEnv().ACCESS_TTL_MINUTES * 60,
  });
  jar.set(REFRESH_COOKIE, refreshToken, {
    ...base,
    expires: refreshExpires,
  });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
