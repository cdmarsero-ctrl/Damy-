/**
 * Lexicon service worker — offline study support.
 *
 * Strategy per resource class:
 *  - App shell and static assets: cache-first, since a hashed Next.js build
 *    artefact never changes under the same URL.
 *  - Navigations: network-first with a cached shell fallback, so a learner who
 *    goes offline mid-session gets the app rather than the browser's dinosaur.
 *  - API GETs for study data (/api/sync, /api/reviews/queue): stale-while-
 *    revalidate, so the review queue is available offline and refreshes in the
 *    background when it is not.
 *  - Everything else (all mutations): network-only. A queued POST is handled by
 *    the app's own IndexedDB outbox and replayed through /api/sync, which is
 *    idempotent — replaying them from the service worker as well would risk
 *    double submission.
 */

const VERSION = "lexicon-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const ASSET_CACHE = `${VERSION}-assets`;

/** Pages worth having available offline. */
const SHELL_URLS = ["/dashboard", "/review", "/lexicon", "/offline"];

/** GET endpoints whose responses are useful when offline. */
const CACHEABLE_API = ["/api/sync", "/api/reviews/queue", "/api/me", "/api/lexicon"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `addAll` rejects the whole batch if any URL 404s; individual adds mean
      // one missing page does not prevent the worker installing at all.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never interfere with anything that changes server state.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Auth endpoints must always hit the network — a cached session response
  // would be both wrong and a security problem.
  if (url.pathname.startsWith("/api/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (CACHEABLE_API.some((path) => url.pathname.startsWith(path))) {
      event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match("/offline");
    if (offline) return offline;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title><p>You are offline and this page has not been cached.",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Refresh in the background; the learner gets the cached copy immediately.
    event_waitUntilSafe(network);
    return cached;
  }

  const response = await network;
  return response ?? new Response(JSON.stringify({ error: "Offline", code: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

/** `event.waitUntil` is not in scope here; swallow rejections instead. */
function event_waitUntilSafe(promise) {
  promise?.catch(() => {});
}

/**
 * Background Sync: when connectivity returns, tell every open tab to flush its
 * outbox. The replay itself happens in the page, which has the session cookie
 * and the IndexedDB handle.
 */
self.addEventListener("sync", (event) => {
  if (event.tag !== "lexicon-sync") return;
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: "FLUSH_OUTBOX" });
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
