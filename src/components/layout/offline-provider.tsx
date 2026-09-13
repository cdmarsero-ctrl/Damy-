"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

import { flush, prefetchStudyData } from "@/lib/offline";

/**
 * Registers the service worker, keeps the outbox flushing, and shows an offline
 * banner. Mounted once in the authenticated layout.
 */
export function OfflineProvider({ enabled }: { enabled: boolean }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    if (!enabled) return;

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration degrades to a normal online-only app.
      });
    }

    async function sync() {
      setSyncing(true);
      try {
        await flush();
        await prefetchStudyData();
      } finally {
        setSyncing(false);
      }
    }

    function handleOnline() {
      setOnline(true);
      void sync();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // The service worker asks us to flush when Background Sync fires.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "FLUSH_OUTBOX") void sync();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    if (navigator.onLine) void sync();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [enabled]);

  if (online && !syncing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium bg-[var(--surface-raised)] border border-[var(--border)]"
    >
      {!online ? (
        <>
          <CloudOff className="size-4 text-warning" aria-hidden />
          <span>Offline — your work is saved and will sync automatically</span>
        </>
      ) : (
        <>
          <RefreshCw className="size-4 animate-spin text-brand-500" aria-hidden />
          <span>Syncing…</span>
        </>
      )}
    </div>
  );
}
