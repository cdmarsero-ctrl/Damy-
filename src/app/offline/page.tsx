import Link from "next/link";
import { CloudOff } from "lucide-react";

export const metadata = { title: "Offline" };

/** Served by the service worker when a navigation fails and nothing is cached. */
export default function OfflinePage() {
  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="max-w-md text-center">
        <CloudOff className="size-12 mx-auto muted mb-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight mb-2">You are offline</h1>
        <p className="muted mb-6 text-pretty">
          This page has not been cached. Your review queue and recent lessons are available offline —
          anything you complete there is saved on the device and synced when you reconnect.
        </p>
        <Link
          href="/review"
          className="h-11 px-5 inline-flex items-center rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
        >
          Go to your review queue
        </Link>
      </div>
    </div>
  );
}
