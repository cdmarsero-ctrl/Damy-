import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { Card, EmptyState, Pill } from "@/components/ui";
import { serverEnv } from "@/lib/env";
import { interpreterStats } from "@/lib/interpreter/sessions";
import { EAR_TO_VOICE_TARGET_MS } from "@/lib/interpreter/measure";
import { CAPTION_TARGET_MS } from "@/lib/interpreter/captions";
import { FLUSH_TARGET_MS } from "@/lib/interpreter/translation";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Interpreter stats" };
export const dynamic = "force-dynamic";

const DAYS = 7;

/**
 * Phase 6 dashboard (admins): ear-to-voice and the other stage latencies per
 * language pair, with usage and estimated vendor cost, from the agents'
 * end-of-session reports.
 */
export default async function InterpreterStatsPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  const stats = await interpreterStats(DAYS, serverEnv());

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Interpreter stats</h1>
        <p className="muted text-pretty">
          Last {stats.days} days: {stats.sessions} session{stats.sessions === 1 ? "" : "s"}
          {stats.unreported > 0 && `, ${stats.unreported} still running or without a report`}. Medians are the
          median of each session&apos;s median; p95 is the 95th percentile of each session&apos;s 95th percentile.
        </p>
      </header>

      {stats.pairs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BarChart3 className="size-6" aria-hidden />}
            title="No reported sessions yet"
            description="Agents report each session when it ends; figures appear here after the first one."
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left muted text-xs uppercase tracking-wide">
              <tr className="border-b border-[var(--border)]">
                <th className="p-3 font-medium">Pair</th>
                <th className="p-3 font-medium text-right">Sessions</th>
                <th className="p-3 font-medium text-right">Minutes</th>
                <th className="p-3 font-medium text-right">Captions p50 / p95</th>
                <th className="p-3 font-medium text-right">Translation p50 / p95</th>
                <th className="p-3 font-medium text-right">Ear-to-voice p50 / p95</th>
                <th className="p-3 font-medium text-right">Echo removed</th>
                <th className="p-3 font-medium text-right">{stats.costConfigured ? "Est. cost" : "Usage"}</th>
              </tr>
            </thead>
            <tbody>
              {stats.pairs.map((p) => (
                <tr key={p.pair} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 font-medium">{p.pair}</td>
                  <td className="p-3 text-right">{p.sessions}</td>
                  <td className="p-3 text-right">{p.minutes.toFixed(1)}</td>
                  <Latency value={p.caption} target={CAPTION_TARGET_MS} />
                  <Latency value={p.translation} target={FLUSH_TARGET_MS} />
                  <Latency value={p.voice} target={EAR_TO_VOICE_TARGET_MS} />
                  <td className="p-3 text-right">{p.echoRemovedWords}</td>
                  <td className="p-3 text-right">
                    {p.cost !== null ? (
                      `$${p.cost.toFixed(2)}`
                    ) : (
                      <span className="muted text-xs">
                        {(p.usage.asrSeconds / 60).toFixed(1)} min ASR ·{" "}
                        {Math.round((p.usage.mtInputTokens + p.usage.mtCacheReadTokens) / 1000)}k in /{" "}
                        {Math.round(p.usage.mtOutputTokens / 1000)}k out tok ·{" "}
                        {Math.round(p.usage.ttsCharacters / 1000)}k TTS chars
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs muted mt-4 text-pretty">
        Targets (median): captions {CAPTION_TARGET_MS} ms, translation {FLUSH_TARGET_MS} ms, ear-to-voice{" "}
        {EAR_TO_VOICE_TARGET_MS} ms. Latencies are measured on the agent; add network and playout on each side.
        {!stats.costConfigured && " Set the INTERPRETER_COST_* rates to see an estimated cost instead of raw usage."}
      </p>
    </div>
  );
}

function Latency({ value, target }: { value: { p50: number | null; p95: number | null }; target: number }) {
  if (value.p50 === null) return <td className="p-3 text-right muted">—</td>;
  return (
    <td className="p-3 text-right">
      <span className={cn(value.p50 <= target ? "text-success" : "text-warning")}>{Math.round(value.p50)}</span>
      {" / "}
      {value.p95 === null ? "—" : Math.round(value.p95)}
      {value.p50 > target && (
        <Pill tone="warning" className="ml-2">
          over
        </Pill>
      )}
    </td>
  );
}
