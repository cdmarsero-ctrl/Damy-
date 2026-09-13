"use client";

import { useEffect, useState } from "react";
import { Flame, Loader2, Medal, Trophy } from "lucide-react";

import { Card, EmptyState, ErrorMessage, Pill, Tabs } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { cn, formatNumber, initials } from "@/lib/utils";

interface Row {
  rank: number;
  userId: string;
  name?: string;
  avatarUrl?: string | null;
  xp: number;
  level?: number;
  streak?: number;
  isYou?: boolean;
}

const SCOPES = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
] as const;

export default function LeaderboardPage() {
  const [scope, setScope] = useState<"week" | "month" | "all">("week");
  const [rows, setRows] = useState<Row[]>([]);
  const [you, setYou] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ rows: Row[]; you: Row }>(`/api/gamification/leaderboard?scope=${scope}&limit=50`)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setYou(data.you);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Could not load the leaderboard.");
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const youInTable = rows.some((r) => r.isYou);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
              <Trophy className="size-5" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          </div>
          <p className="muted text-pretty">
            Ranked by XP earned in the period, not lifetime total — so a good week counts even if
            you started last month.
          </p>
        </div>
        <Tabs tabs={SCOPES.map((s) => ({ id: s.id, label: s.label }))} active={scope} onChange={setScope} />
      </header>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      {loading ? (
        <div className="py-20 grid place-items-center">
          <Loader2 className="size-6 animate-spin muted" aria-label="Loading" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="size-10 mx-auto" />}
            title="Nobody on the board yet"
            description="Earn some XP and you will be the first."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <LeaderRow key={row.userId} row={row} />
            ))}
          </ul>
        </Card>
      )}

      {/* Outside the top 50 — shown separately so the board is never demotivating. */}
      {!youInTable && you && !loading && (
        <Card className="mt-4 p-0 overflow-hidden border-brand-400">
          <ul>
            <LeaderRow row={{ ...you, isYou: true, name: "You" }} />
          </ul>
        </Card>
      )}

      <p className="text-xs muted mt-5 text-pretty">
        Streak multipliers are capped at +50% so a long streak is an advantage rather than an
        unassailable lead, and daily-challenge rewards are flat for the same reason.
      </p>
    </div>
  );
}

function LeaderRow({ row }: { row: Row }) {
  const medal =
    row.rank === 1 ? "text-yellow-500" : row.rank === 2 ? "text-slate-400" : row.rank === 3 ? "text-amber-700" : null;

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        row.isYou && "bg-brand-50 dark:bg-brand-950",
      )}
    >
      <span className="w-8 text-center shrink-0">
        {medal ? (
          <Medal className={cn("size-5 mx-auto", medal)} aria-label={`Rank ${row.rank}`} />
        ) : (
          <span className="text-sm font-semibold muted tabular-nums">{row.rank}</span>
        )}
      </span>

      <span className="size-9 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 grid place-items-center text-sm font-semibold shrink-0">
        {initials(row.name ?? "?")}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate flex items-center gap-2">
          {row.name ?? "Learner"}
          {row.isYou && <Pill tone="brand">you</Pill>}
        </div>
        <div className="flex items-center gap-2 text-xs muted">
          {row.level !== undefined && <span>Level {row.level}</span>}
          {row.streak ? (
            <span className="flex items-center gap-0.5 text-warning">
              <Flame className="size-3" aria-hidden />
              {row.streak}
            </span>
          ) : null}
        </div>
      </div>

      <span className="text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400 shrink-0">
        {formatNumber(row.xp)}
        <span className="text-xs font-normal muted ml-1">XP</span>
      </span>
    </li>
  );
}
