import { Award, Flame, Lock, Zap } from "lucide-react";

import { Card, CardHeader, Pill, Progress, Stat } from "@/components/ui";
import { prisma } from "@/lib/db";
import { TIER_COLOR, levelFromXp, utcDay } from "@/lib/gamification";
import { ensureTodaysChallenges } from "@/lib/services/challenges";
import { requireUser } from "@/lib/session";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import type { BadgeTier } from "@prisma/client";

export const metadata = { title: "Achievements" };
export const dynamic = "force-dynamic";

const TIER_ORDER: BadgeTier[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

export default async function AchievementsPage() {
  const user = await requireUser();
  const today = utcDay();
  await ensureTodaysChallenges(today);

  const [badges, userBadges, challenges] = await Promise.all([
    prisma.badge.findMany(),
    prisma.userBadge.findMany({ where: { userId: user.id } }),
    prisma.dailyChallenge.findMany({
      where: { date: today },
      orderBy: { xpReward: "asc" },
      include: { users: { where: { userId: user.id } } },
    }),
  ]);

  const stateByBadge = new Map(userBadges.map((ub) => [ub.badgeId, ub]));
  const earned = userBadges.filter((ub) => ub.earnedAt).length;
  const level = levelFromXp(user.stats?.xpTotal ?? 0);

  // Group by tier, with earned badges first inside each group and the nearest
  // unearned badge next — so the page always shows something within reach.
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    badges: badges
      .filter((b) => b.tier === tier)
      .map((badge) => ({ badge, state: stateByBadge.get(badge.id) ?? null }))
      .sort((a, b) => {
        const aEarned = a.state?.earnedAt ? 1 : 0;
        const bEarned = b.state?.earnedAt ? 1 : 0;
        if (aEarned !== bEarned) return bEarned - aEarned;
        return (b.state?.progress ?? 0) - (a.state?.progress ?? 0);
      }),
  })).filter((group) => group.badges.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <Award className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Achievements</h1>
        </div>
        <p className="muted text-pretty">
          Badges reward the behaviours that correlate with actually improving — sustained review,
          productive skills, mastered vocabulary. None of them reward time with a tab open.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <Stat label="Badges earned" value={`${earned}/${badges.length}`} icon={<Award className="size-4" />} tone="brand" />
        <Stat label="Level" value={level.level} sub={`${formatNumber(user.stats?.xpTotal ?? 0)} XP`} tone="success" icon={<Zap className="size-4" />} />
        <Stat label="Current streak" value={user.stats?.streakCurrent ?? 0} sub={`Best: ${user.stats?.streakLongest ?? 0}`} icon={<Flame className="size-4" />} tone="warning" />
        <Stat label="Words mastered" value={formatNumber(user.stats?.wordsMastered ?? 0)} tone="info" />
      </div>

      {/* Today's challenges */}
      <Card className="mb-7">
        <CardHeader
          title="Today's challenges"
          description="Three a day: one you will certainly finish, one that needs a real session, and one that pushes you toward a skill most people avoid."
          icon={<Flame className="size-5" />}
        />
        <div className="grid sm:grid-cols-3 gap-4">
          {challenges.map((challenge) => {
            const link = challenge.users[0];
            const progress = link?.progress ?? 0;
            const done = Boolean(link?.completedAt);
            return (
              <div
                key={challenge.id}
                className={cn(
                  "p-4 rounded-xl border",
                  done ? "border-success/40 bg-success/5" : "border-[var(--border)]",
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="font-medium text-sm">{challenge.title}</h3>
                  <Pill tone={done ? "success" : "brand"}>+{challenge.xpReward}</Pill>
                </div>
                <p className="text-xs muted mb-3 text-pretty">{challenge.description}</p>
                <Progress
                  value={Math.min(progress, challenge.target)}
                  max={challenge.target}
                  tone={done ? "success" : "brand"}
                />
                <p className="text-[11px] muted mt-1 tabular-nums">
                  {Math.min(progress, challenge.target)} / {challenge.target}
                  {done && " · complete"}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Badges */}
      <div className="space-y-7">
        {grouped.map(({ tier, badges: tierBadges }) => (
          <section key={tier}>
            <h2 className={cn("text-sm font-semibold uppercase tracking-wider mb-3", TIER_COLOR[tier])}>
              {tier.toLowerCase()}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tierBadges.map(({ badge, state }) => {
                const isEarned = Boolean(state?.earnedAt);
                const progress = state?.progress ?? 0;

                return (
                  <div
                    key={badge.id}
                    className={cn(
                      "surface p-4 transition-colors",
                      isEarned ? "border-brand-400" : "opacity-80",
                    )}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <span
                        className={cn(
                          "size-10 rounded-xl grid place-items-center shrink-0",
                          isEarned
                            ? "bg-brand-100 dark:bg-brand-900"
                            : "bg-[var(--surface-sunken)]",
                        )}
                        aria-hidden
                      >
                        {isEarned ? (
                          <Award className={cn("size-5", TIER_COLOR[badge.tier])} />
                        ) : (
                          <Lock className="size-4 muted" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm">{badge.title}</h3>
                        <p className="text-xs muted text-pretty">{badge.description}</p>
                      </div>
                    </div>

                    {isEarned ? (
                      <Pill tone="success">
                        Earned {state?.earnedAt ? relativeTime(state.earnedAt) : ""}
                      </Pill>
                    ) : (
                      <Progress value={progress} showValue tone={progress > 0.5 ? "brand" : "warning"} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
