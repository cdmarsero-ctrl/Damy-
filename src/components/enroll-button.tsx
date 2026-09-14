"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Plus } from "lucide-react";

import { Button } from "@/components/ui";
import { api } from "@/lib/client";

/** Enrol/leave toggle. Optimistic: the label flips immediately, then the page
 *  is refreshed so server-rendered progress stays authoritative. */
export function EnrollButton({ trackId, enrolled }: { trackId: string; enrolled: boolean }) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(enrolled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    setBusy(true);
    try {
      if (next) await api.post(`/api/tracks/${trackId}/enroll`);
      else await api.delete(`/api/tracks/${trackId}/enroll`);
      router.refresh();
    } catch {
      setOptimistic(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={optimistic ? "secondary" : "primary"}
      size="sm"
      onClick={toggle}
      loading={busy}
      className="shrink-0"
    >
      {optimistic ? (
        <>
          <Check className="size-3.5" aria-hidden />
          Enrolled
        </>
      ) : (
        <>
          <Plus className="size-3.5" aria-hidden />
          Enrol
        </>
      )}
    </Button>
  );
}
