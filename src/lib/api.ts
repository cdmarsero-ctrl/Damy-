import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { ACCESS_COOKIE, verifyAccessToken, type AccessClaims } from "./auth";
import { clientKey, hit } from "./rate-limit";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthorized = (msg = "Sign in to continue") => new ApiError(401, msg, "unauthorized");
export const forbidden = (msg = "You do not have access to this resource") =>
  new ApiError(403, msg, "forbidden");
export const notFound = (msg = "Not found") => new ApiError(404, msg, "not_found");
export const badRequest = (msg: string, details?: unknown) =>
  new ApiError(400, msg, "bad_request", details);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/**
 * Wraps a route handler so every thrown error becomes a predictable JSON body
 * and unexpected failures never leak a stack trace to the client.
 */
export function route<Ctx = unknown>(
  handler: (req: Request, ctx: Ctx) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, code: err.code, details: err.details },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            code: "validation_error",
            details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 422 },
        );
      }
      // `redirect()` and `notFound()` from next/navigation throw control-flow
      // errors that must bubble untouched.
      if (err && typeof err === "object" && "digest" in err) throw err;

      console.error("[api] unhandled error", err);
      return NextResponse.json(
        { error: "Something went wrong on our end.", code: "internal_error" },
        { status: 500 },
      );
    }
  };
}

/** Reads the access token straight from the request cookie header. */
export async function claimsFromRequest(req: Request): Promise<AccessClaims | null> {
  const header = req.headers.get("cookie") ?? "";
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(ACCESS_COOKIE.length + 1));
  return verifyAccessToken(token);
}

export async function requireApiUser(req: Request): Promise<AccessClaims> {
  const claims = await claimsFromRequest(req);
  if (!claims) throw unauthorized();
  return claims;
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}

/** Throws 429 with a Retry-After hint once the caller exceeds `limit`/minute. */
export function enforceRateLimit(req: Request, scope: string, limit: number, subject?: string) {
  const key = subject ? `${scope}:user:${subject}` : clientKey(req, scope);
  const result = hit(key, limit);
  if (!result.ok) {
    throw new ApiError(429, "Too many requests — slow down for a moment.", "rate_limited", {
      retryAfterSec: result.retryAfterSec,
    });
  }
  return result;
}
