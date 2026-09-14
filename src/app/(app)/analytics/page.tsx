"use client";

import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid,
  PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertCircle, BarChart3, Check, Loader2, Sparkles, TrendingUp } from "lucide-react";

import { Button, Card, CardHeader, EmptyState, ErrorMessage, LevelPill, Pill, Progress, Stat, Tabs } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { SKILL_LABEL } from "@/lib/cefr";
import { formatNumber } from "@/lib/utils";
import type { Cefr, Skill } from "@prisma/client";

/**
 * The analytics dashboard.
 *
 * Chart colours come from the CSS custom properties defined in globals.css, so
 * a theme switch recolours the charts without a second palette — Recharts is
 * happy with `var(--…)` in its colour props.
 */

interface Analytics {
  window: { days: number };
  level: {
    level: number;
    progress: number;
    cefr: Cefr;
    theta: number;
    bandProgress: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
  };
  dailyXp: { date: string; xp: number; activities: number }[];
  xpBySource: { source: string; xp: number }[];
  skillRadar: { skill: Skill; score: number | null; samples: number }[];
  reviews: {
    graded: number;
    retention: number | null;
    byRating: Record<string, number>;
    dueNextFortnight: number;
  };
  lessons: { completed: number; averageScore: number | null; bySkill: Record<string, number> };
  writing: { submissions: number; totalWords: number; bandTrend: { date: string; band: number }[] };
  pronunciation: {
    attempts: number;
    trend: { date: string; overall: number; accuracy: number; fluency: number; prosody: number }[];
  };
  stats: { streakCurrent: number; streakLongest: number; wordsMastered: number; minutesTotal: number } | null;
}

interface Report {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: { title: string; why: string; action: string; href: string }[];
  periodStart: string;
}

const WINDOWS = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
] as const;

export default function AnalyticsPage() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [data, setData] = useState<Analytics | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [analytics, reports] = await Promise.all([
        api.get<Analytics>(`/api/analytics?days=${days}`),
        api.get<{ reports: Report[] }>("/api/analytics/report").catch(() => ({ reports: [] })),
      ]);
      setData(analytics);
      setReport(reports.reports[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load your analytics.");
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    setGenerating(true);
    try {
      const result = await api.post<{ report: Report }>("/api/analytics/report");
      setReport(result.report);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not generate a report.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="py-24 grid place-items-center">
        <Loader2 className="size-6 animate-spin muted" aria-label="Loading analytics" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </div>
    );
  }

  const radarData = data.skillRadar
    .filter((entry) => entry.score !== null)
    .map((entry) => ({ skill: SKILL_LABEL[entry.skill], score: entry.score, samples: entry.samples }));

  const totalXp = data.dailyXp.reduce((sum, day) => sum + day.xp, 0);
  const activeDays = data.dailyXp.filter((day) => day.xp > 0).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
              <BarChart3 className="size-5" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          </div>
          <p className="muted text-pretty">
            Everything here is measured, not estimated. If a number surprises you, it is telling you
            something.
          </p>
        </div>
        <Tabs
          tabs={WINDOWS.map((w) => ({ id: w.id, label: w.label }))}
          active={days}
          onChange={setDays}
        />
      </header>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      {/* ------------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="XP earned"
          value={formatNumber(totalXp)}
          sub={`over ${data.window.days} days`}
          tone="brand"
        />
        <Stat
          label="Active days"
          value={`${activeDays}/${data.window.days}`}
          sub={`${Math.round((activeDays / data.window.days) * 100)}% consistency`}
          tone={activeDays / data.window.days >= 0.6 ? "success" : "warning"}
        />
        <Stat
          label="Recall rate"
          value={data.reviews.retention !== null ? `${data.reviews.retention}%` : "—"}
          sub={`${data.reviews.graded} cards graded`}
          tone={
            data.reviews.retention === null
              ? "neutral"
              : data.reviews.retention >= 85
                ? "success"
                : "warning"
          }
        />
        <Stat
          label="Due next fortnight"
          value={data.reviews.dueNextFortnight}
          sub="cards scheduled"
          tone="info"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* ---------------------------------------------------------- XP */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Daily activity"
            description="Gaps are as informative as peaks — consistency beats volume at this level."
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyXp} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  tickFormatter={(value: string) => value.slice(5)}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  stroke="var(--border)"
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    fontSize: "0.8rem",
                  }}
                  labelStyle={{ color: "var(--text)" }}
                />
                <Area
                  type="monotone"
                  dataKey="xp"
                  name="XP"
                  stroke="var(--color-brand-500)"
                  strokeWidth={2}
                  fill="url(#xpFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ------------------------------------------------------- level */}
        <Card>
          <CardHeader title="Level" icon={<TrendingUp className="size-5" />} />
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-4xl font-semibold tabular-nums text-brand-500">
              {data.level.level}
            </span>
            <LevelPill level={data.level.cefr} />
          </div>
          <Progress
            value={data.level.progress}
            label={`${data.level.xpIntoLevel} / ${data.level.xpForNextLevel} XP`}
            className="mb-5"
          />
          <Progress
            value={data.level.bandProgress}
            label={`Progress through ${data.level.cefr}`}
            showValue
            tone="success"
          />
          <p className="text-xs muted mt-3 text-pretty">
            Ability estimate θ = {data.level.theta.toFixed(2)} on the IRT logit scale, from your most
            recent placement test.
          </p>

          {data.stats && (
            <dl className="mt-5 pt-5 border-t border-[var(--border)] space-y-2 text-sm">
              {[
                { label: "Current streak", value: `${data.stats.streakCurrent} days` },
                { label: "Longest streak", value: `${data.stats.streakLongest} days` },
                { label: "Words mastered", value: formatNumber(data.stats.wordsMastered) },
                { label: "Total study time", value: `${Math.round(data.stats.minutesTotal / 60)}h` },
              ].map((row) => (
                <div key={row.label} className="flex justify-between gap-2">
                  <dt className="muted">{row.label}</dt>
                  <dd className="font-medium tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        {/* ------------------------------------------------------- radar */}
        <Card>
          <CardHeader
            title="Skill profile"
            description="Average performance per skill. Skills with few samples are less reliable."
          />
          {radarData.length >= 3 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="var(--color-brand-500)"
                    fill="var(--color-brand-500)"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.75rem",
                      fontSize: "0.8rem",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Not enough data yet"
              description="Practise across at least three skills and the profile appears here."
            />
          )}
        </Card>

        {/* -------------------------------------------------- XP by source */}
        <Card>
          <CardHeader
            title="Where your XP comes from"
            description="A profile weighted entirely towards review means you are maintaining, not building."
          />
          {data.xpBySource.length > 0 ? (
            <ul className="space-y-3">
              {data.xpBySource.map((row) => (
                <li key={row.source}>
                  <Progress
                    value={row.xp}
                    max={data.xpBySource[0].xp}
                    label={row.source.replace(/([A-Z])/g, " $1").toLowerCase()}
                  />
                  <p className="text-xs muted mt-0.5 tabular-nums">{formatNumber(row.xp)} XP</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity in this window" />
          )}
        </Card>
      </div>

      {/* Pronunciation trend */}
      {data.pronunciation.trend.length >= 2 && (
        <Card className="mb-5">
          <CardHeader
            title="Pronunciation over time"
            description="Accuracy usually climbs first; rhythm is the slowest to move and the most audible."
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.pronunciation.trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  tickFormatter={(value: string) => value.slice(5)}
                  stroke="var(--border)"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    fontSize: "0.8rem",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                <Line type="monotone" dataKey="overall" stroke="var(--color-brand-500)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="accuracy" stroke="var(--color-success)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="prosody" stroke="var(--color-warning)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Writing band trend */}
      {data.writing.bandTrend.length >= 2 && (
        <Card className="mb-5">
          <CardHeader
            title="Writing bands"
            description={`${data.writing.submissions} submissions, ${formatNumber(data.writing.totalWords)} words in this window.`}
          />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.writing.bandTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  tickFormatter={(value: string) => value.slice(5)}
                  stroke="var(--border)"
                />
                <YAxis domain={[4, 9]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    fontSize: "0.8rem",
                  }}
                />
                <Line type="monotone" dataKey="band" stroke="var(--color-c2)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------ report */}
      <Card>
        <CardHeader
          title="Weekly report"
          description="Built from measured behaviour — every claim is checkable against the charts above."
          action={
            <Button variant="secondary" size="sm" onClick={generateReport} loading={generating}>
              <Sparkles className="size-3.5" aria-hidden />
              {report ? "Regenerate" : "Generate"}
            </Button>
          }
        />

        {report ? (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-pretty">{report.summary}</p>

            <div className="grid sm:grid-cols-2 gap-5">
              {report.strengths.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="size-4 text-success" aria-hidden />
                    <h3 className="font-semibold text-sm">Working well</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {report.strengths.map((item, i) => (
                      <li key={i} className="text-sm muted text-pretty">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.weaknesses.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="size-4 text-warning" aria-hidden />
                    <h3 className="font-semibold text-sm">Needs attention</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {report.weaknesses.map((item, i) => (
                      <li key={i} className="text-sm muted text-pretty">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {report.recommendations.length > 0 && (
              <div className="pt-4 border-t border-[var(--border)]">
                <h3 className="font-semibold text-sm mb-3">Do this next</h3>
                <div className="space-y-3">
                  {report.recommendations.map((rec, i) => (
                    <a
                      key={i}
                      href={rec.href}
                      className="block p-3.5 rounded-xl border border-[var(--border)] hover:border-brand-400 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Pill tone="brand">{i + 1}</Pill>
                        <span className="font-medium text-sm">{rec.title}</span>
                      </div>
                      <p className="text-xs muted mb-1.5 text-pretty">{rec.why}</p>
                      <p className="text-sm text-brand-600 dark:text-brand-400 text-pretty">{rec.action}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title="No report yet"
            description="Generate one from the last seven days of activity. It names what is working, what is not, and the single change that would help most."
          />
        )}
      </Card>
    </div>
  );
}
