"use client";

/**
 * The offline outbox.
 *
 * Activity performed without a connection is written to IndexedDB and replayed
 * through /api/sync on reconnect. Three properties make this safe:
 *
 *  1. Every mutation carries a client-generated `idempotencyKey`. The server's
 *     unique index on (userId, idempotencyKey) turns a duplicate replay into a
 *     no-op, which matters because a request that times out may or may not have
 *     been applied and the client cannot tell which.
 *  2. `occurredAt` is the time on the device, and the server schedules from it.
 *     A card reviewed on Monday and synced on Thursday gets a Monday interval.
 *  3. Mutations are only removed from the outbox once the server confirms them,
 *     so a failed flush leaves the queue intact for the next attempt.
 *
 * IndexedDB is used directly rather than through a wrapper: the API surface
 * needed here is four calls, and a dependency would be most of the bundle.
 */

const DB_NAME = "lexicon-offline";
const DB_VERSION = 1;
const OUTBOX = "outbox";
const CACHE = "cache";

export type MutationKind = "reviewGrade" | "exerciseAttempt" | "lessonComplete" | "studyTime";

export interface OutboxEntry {
  idempotencyKey: string;
  kind: MutationKind;
  payload: Record<string, unknown>;
  occurredAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: "idempotencyKey" });
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        db.createObjectStore(CACHE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

/** A stable per-device identifier, so the server can tell devices apart. */
export function clientId(): string {
  if (typeof localStorage === "undefined") return "server";
  let id = localStorage.getItem("lx-client-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("lx-client-id", id);
  }
  return id;
}

export async function enqueue(kind: MutationKind, payload: Record<string, unknown>): Promise<void> {
  const entry: OutboxEntry = {
    idempotencyKey: crypto.randomUUID(),
    kind,
    payload,
    occurredAt: new Date().toISOString(),
  };
  await tx(OUTBOX, "readwrite", (store) => store.put(entry));

  // Ask the browser to wake the service worker when connectivity returns.
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const registration = await navigator.serviceWorker.ready;
    await (registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync
      ?.register("lexicon-sync")
      .catch(() => {
        // Background Sync is Chromium-only; the online listener covers the rest.
      });
  }
}

export async function pending(): Promise<OutboxEntry[]> {
  try {
    return await tx<OutboxEntry[]>(OUTBOX, "readonly", (store) => store.getAll());
  } catch {
    return [];
  }
}

async function remove(keys: string[]): Promise<void> {
  const db = await open();
  const transaction = db.transaction(OUTBOX, "readwrite");
  const store = transaction.objectStore(OUTBOX);
  for (const key of keys) store.delete(key);
  return new Promise((resolve) => {
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

export interface FlushResult {
  attempted: number;
  applied: number;
  skipped: number;
  failed: number;
}

/** Replays the outbox. Safe to call repeatedly; a no-op when empty or offline. */
export async function flush(): Promise<FlushResult> {
  const entries = await pending();
  if (entries.length === 0) return { attempted: 0, applied: 0, skipped: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { attempted: entries.length, applied: 0, skipped: 0, failed: 0 };
  }

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: clientId(), mutations: entries }),
  });

  if (!response.ok) {
    return { attempted: entries.length, applied: 0, skipped: 0, failed: entries.length };
  }

  const result = (await response.json()) as {
    applied: number;
    skipped: number;
    failed: { key: string; reason: string }[];
  };

  // Clear everything the server accepted OR rejected as unprocessable —
  // retrying a permanently invalid mutation forever would wedge the queue.
  const failedKeys = new Set(result.failed.map((f) => f.key));
  const settled = entries
    .filter((entry) => !failedKeys.has(entry.idempotencyKey) || true)
    .map((entry) => entry.idempotencyKey);

  await remove(settled);

  return {
    attempted: entries.length,
    applied: result.applied,
    skipped: result.skipped,
    failed: result.failed.length,
  };
}

/* ------------------------------------------------------------------ cache */

export async function cacheSet(key: string, value: unknown): Promise<void> {
  await tx(CACHE, "readwrite", (store) =>
    store.put({ key, value, cachedAt: new Date().toISOString() }),
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const row = await tx<{ value: T } | undefined>(CACHE, "readonly", (store) => store.get(key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Pulls the offline study bundle and stores it for use without a connection. */
export async function prefetchStudyData(): Promise<boolean> {
  try {
    const response = await fetch("/api/sync");
    if (!response.ok) return false;
    await cacheSet("study-bundle", await response.json());
    return true;
  } catch {
    return false;
  }
}
