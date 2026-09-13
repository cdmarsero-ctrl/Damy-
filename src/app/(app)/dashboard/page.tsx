import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BookOpen, Brain, Flame, MessageSquareText, Mic, PenLine, Repeat,
  Sparkles, Target, TrendingUp, Zap,
} from "lucide-react";

import { Card, CardHeader, EmptyState, LevelPill, Pill, Progress, Stat } from "@/components/ui";
import { CEFR_BLURB, bandProgress, nextLevel } from "@/lib/cefr";
import { prisma } from "@/lib/db";
import { levelFromXp, utcDay } from "@/lib/gamification";
import { ensureTodaysChallenges } from "@/lib/services/challenges";
import { requireUser } from "@/lib/session";
import { formatDuration, formatNumber, pluralise, relativeTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user.profile?.placedAt) redirect("/placement");

  const today = utcDay();
  await ensureTodaysChallenges(today);

  const [dueCount, newCount, challenges, recentLessons, nextLesson, weekXp, lastReport] =
    await Promise.all([
      prisma.reviewCard.count({
        where: { userId: user.id, suspended: false, dueAt: { lte: new Date() }, state: { not: "NEW" } },
      }),
      prisma.reviewCard.count({ where: { userId: user.id, suspended: false, state: "NEW" } }),
      prisma.dailyChallenge.findMany({
        where: { date: today },
        orderBy: { xpReward: "asc" },
        include: { users: { where: { userId: user.id } } },
      }),
      prisma.lessonProgress.findMany({
        where: { userId: user.id, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 3,
        include: {
          lesson: { select: { id: true, title: true, skill: true, cefr: true, unit: { select: { title: true } } } },
        },
      }),
      // The next unfinished lesson in an enrolled path — the "continue" card.
      prisma.lesson.findFirst({
        where: {
          published: true,
          unit: { track: { enrollments: { some: { userId: user.id } } } },
          progress: { none: { userId: user.id, status: { in: ["COMPLETED", "MASTERED"] } } },
        },
        orderBy: [{ unit: { order: "asc" } }, { order: "asc" }],
        include: {
          unit: { select: { title: true, track: { select: { title: true, accent: true } } } },
          _count: { select: { exercises: true } },
        },
      }),
      prisma.xpEvent.aggregate({
        where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        _sum: { amount: true },
      }),
      prisma.feedbackReport.findFirst({
        where: { userId: user.id },
        orderBy: { periodStart: "desc" },
      }),
    ]);

  const stats = user.stats;
  const level = levelFromXp(stats?.xpTotal ?? 0);
  const cefr = user.profile.cefrLevel;
  const upcoming = nextLevel(cefr);
  const progressInBand = bandProgress(user.profile.theta);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-7">
      {/* ------------------------------------------------------------ header */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="muted mt-1 text-pretty">
          {dueCount > 0
            ? `${dueCount} ${pluralise(dueCount, "card")} due for review — that is the highest-value ten minutes available to you today.`
            : newCount > 0
              ? `Nothing due for review. ${newCount} new ${pluralise(newCount, "word")} waiting whenever you want them.`
              : "Your review queue is clear. Good time for a lesson or some writing."}
        </p>
      </header>

      {/* ------------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Streak"
          value={stats?.streakCurrent ?? 0}
          sub={
            stats?.streakLongest
              ? `Longest: ${stats.streakLongest} ${pluralise(stats.streakLongest, "day")}`
              : "Start one today"
          }
          icon={<Flame className="size-4" />}
          tone="warning"
        />
        <Stat
          label="Level"
          value={level.level}
          sub={
            level.isMax
              ? "Maximum level"
              : `${formatNumber(level.xpForNextLevel - level.xpIntoLevel)} XP to level ${level.level + 1}`
          }
          icon={<TrendingUp className="size-4" />}
          tone="brand"
        />
        <Stat
          label="Words mastered"
          value={formatNumber(stats?.wordsMastered ?? 0)}
          sub={`${formatNumber(stats?.reviewsCompleted ?? 0)} reviews graded`}
          icon={<Brain className="size-4" />}
          tone="info"
        />
        <Stat
          label="This week"
          value={formatNumber(weekXp._sum.amount ?? 0)}
          sub={`${formatDuration(stats?.minutesTotal ?? 0)} studied in total`}
          icon={<Zap className="size-4" />}
          tone="success"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* ---------------------------------------------------- continue */}
          {nextLesson ? (
            <Card>
              <CardHeader
                title="Continue your path"
                description={`${nextLesson.unit.track.title} · ${nextLesson.unit.title}`}
                icon={<BookOpen className="size-5" />}
              />
              <div className="surface-sunken p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-medium">{nextLesson.title}</h3>
                  <LevelPill level={nextLesson.cefr} />
                </div>
                {nextLesson.subtitle && (
                  <p className="text-sm muted mb-3 text-pretty">{nextLesson.subtitle}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Pill>{nextLesson.skill.toLowerCase()}</Pill>
                  <Pill>{nextLesson.estimatedMinutes} min</Pill>
                  <Pill>
                    {nextLesson._count.exercises} {pluralise(nextLesson._count.exercises, "exercise")}
                  </Pill>
                  <Pill tone="brand">+{nextLesson.xpReward} XP</Pill>
                </div>
                <Link
                  href={`/lesson/${nextLesson.id}`}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  Start lesson
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<BookOpen className="size-10 mx-auto" />}
                title="No lessons queued"
                description="Enrol in a learning path to get a sequenced curriculum matched to your level and goals."
                action={
                  <Link
                    href="/path"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                  >
                    Browse paths
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                }
              />
            </Card>
          )}

          {/* ----------------------------------------------------- practice */}
          <Card>
            <CardHeader
              title="Practise"
              description="The productive skills — where advanced learners actually improve."
              icon={<Sparkles className="size-5" />}
            />
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { href: "/review", icon: Repeat, title: "Review queue", body: dueCount + newCount > 0 ? `${dueCount + newCount} cards waiting` : "All clear", highlight: dueCount > 0 },
                { href: "/tutor", icon: MessageSquareText, title: "Conversation", body: "Free dialogue with correction" },
                { href: "/writing", icon: PenLine, title: "Writing studio", body: "Banded feedback on any genre" },
                { href: "/pronunciation", icon: Mic, title: "Pronunciation lab", body: "Record, score, and drill" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                    item.highlight
                      ? "border-brand-400 bg-brand-50 dark:bg-brand-950 hover:bg-brand-100 dark:hover:bg-brand-900"
                      : "border-[var(--border)] hover:bg-[var(--surface-sunken)]"
                  }`}
                >
                  <item.icon className="size-5 text-brand-500 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{item.title}</div>
                    <div className="text-xs muted mt-0.5">{item.body}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* ------------------------------------------------------- recent */}
          {recentLessons.length > 0 && (
            <Card>
              <CardHeader title="Recently completed" />
              <ul className="divide-y divide-[var(--border)]">
                {recentLessons.map((entry) => (
                  <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/lesson/${entry.lesson.id}`}
                      className="flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                          {entry.lesson.title}
                        </div>
                        <div className="text-xs muted">
                          {entry.lesson.unit.title} ·{" "}
                          {entry.completedAt ? relativeTime(entry.completedAt) : "—"}
                        </div>
                      </div>
                      <Pill tone={entry.bestScore >= 0.9 ? "success" : entry.bestScore >= 0.7 ? "brand" : "warning"}>
                        {Math.round(entry.bestScore * 100)}%
                      </Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* --------------------------------------------------------- aside */}
        <div className="space-y-5">
          {/* CEFR progress */}
          <Card>
            <CardHeader title="Your level" icon={<Target className="size-5" />} />
            <div className="flex items-baseline gap-3 mb-3">
              <span
                className="text-4xl font-semibold tabular-nums"
                style={{ color: `var(--color-${cefr.toLowerCase()})` }}
              >
                {cefr}
              </span>
              <LevelPill level={cefr} />
            </div>
            <p className="text-sm muted leading-relaxed mb-4 text-pretty">{CEFR_BLURB[cefr]}</p>
            {upcoming && (
              <Progress
                value={progressInBand}
                label={`Progress towards ${upcoming}`}
                showValue
              />
            )}
            <Link
              href="/placement"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline"
            >
              Retake the placement test
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Card>

          {/* Daily challenges */}
          <Card>
            <CardHeader title="Today's challenges" icon={<Flame className="size-5" />} />
            <ul className="space-y-4">
              {challenges.map((challenge) => {
                const link = challenge.users[0];
                const progress = link?.progress ?? 0;
                const done = Boolean(link?.completedAt);
                return (
                  <li key={challenge.id}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          {challenge.title}
                          {done && <Pill tone="success">done</Pill>}
                        </div>
                        <p className="text-xs muted text-pretty">{challenge.description}</p>
                      </div>
                      <span className="text-xs font-semibold text-brand-500 shrink-0 tabular-nums">
                        +{challenge.xpReward}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(progress, challenge.target)}
                      max={challenge.target}
                      tone={done ? "success" : "brand"}
                    />
                    <p className="text-[11px] muted mt-1 tabular-nums">
                      {Math.min(progress, challenge.target)} / {challenge.target}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Weekly report */}
          <Card>
            <CardHeader title="Weekly report" />
            {lastReport ? (
              <>
                <p className="text-sm muted leading-relaxed text-pretty">{lastReport.summary}</p>
                <Link
                  href="/analytics"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline"
                >
                  Full analytics
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="text-sm muted text-pretty">
                Your first report is generated once you have a week of activity. It draws only on
                measured behaviour, so every claim in it is checkable against your dashboard.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
