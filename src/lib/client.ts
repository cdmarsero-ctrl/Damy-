"use client";

/**
 * The browser-side API client.
 *
 * Two responsibilities beyond `fetch`:
 *  1. Silent refresh — a 401 triggers one refresh attempt and a single retry,
 *     so a learner mid-lesson is never bounced to the login screen because an
 *     access token expired between questions.
 *  2. Uniform errors — every failure becomes an ApiClientError with the
 *     server's message, so UI code never has to inspect a raw Response.
 */

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Concurrent 401s share one refresh request rather than racing. */
async function refresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { retryOnAuth?: boolean } = {},
): Promise<T> {
  const { retryOnAuth = true, ...options } = init;

  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && retryOnAuth) {
    const refreshed = await refresh();
    if (refreshed) {
      return apiFetch<T>(path, { ...init, retryOnAuth: false });
    }
    // Refresh failed: the session is genuinely gone.
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  const body = await parse(response);

  if (!response.ok) {
    const payload = (body ?? {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiClientError(
      response.status,
      payload.error ?? `Request failed (${response.status})`,
      payload.code,
      payload.details,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
