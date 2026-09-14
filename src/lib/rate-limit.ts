/**
 * In-process sliding-window limiter.
 *
 * Deliberately dependency-free so `npm run dev` needs nothing but Postgres.
 * It is per-instance: behind more than one server replica, swap `hit()` for a
 * Redis `INCR` + `EXPIRE` (see docs/EXTENDING.md#rate-limiting) — the call
 * signature is designed so only this file changes.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Bound memory on a long-running process; buckets are tiny and short-lived. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

export function hit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt, retryAfterSec: 0 };
  }

  bucket.count += 1;
  const ok = bucket.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: ok ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Best-effort client identity for anonymous endpoints. */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

/** Test seam — keeps limiter state from leaking between unit tests. */
export function __resetRateLimits() {
  buckets.clear();
}
