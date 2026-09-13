import { redirect } from "next/navigation";

import { AppShell, type ShellUser } from "@/components/layout/app-shell";
import { OfflineProvider } from "@/components/layout/offline-provider";
import { prisma } from "@/lib/db";
import { levelFromXp, utcDay } from "@/lib/gamification";
import { getCurrentUser } from "@/lib/session";

/** Authenticated area. `getCurrentUser` reads cookies, which opts this subtree
 *  out of static rendering automatically — no DB call happens at build time. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [dueCount, xpToday] = await Promise.all([
    // Genuinely overdue cards only. NEW cards carry dueAt = now, so counting
    // them here would badge 24 while the dashboard correctly reports 12 due.
    prisma.reviewCard.count({
      where: {
        userId: user.id,
        suspended: false,
        dueAt: { lte: new Date() },
        state: { not: "NEW" },
      },
    }),
    prisma.xpEvent.aggregate({
      where: { userId: user.id, createdAt: { gte: utcDay() } },
      _sum: { amount: true },
    }),
  ]);

  const level = levelFromXp(user.stats?.xpTotal ?? 0);

  const shellUser: ShellUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    cefrLevel: user.profile?.cefrLevel ?? "B2",
    xpTotal: user.stats?.xpTotal ?? 0,
    level: level.level,
    xpIntoLevel: level.xpIntoLevel,
    xpForNextLevel: level.xpForNextLevel,
    streakCurrent: user.stats?.streakCurrent ?? 0,
    dueCount,
    dailyGoalXp: user.profile?.dailyGoalXp ?? 50,
    xpToday: xpToday._sum.amount ?? 0,
  };

  return (
    <AppShell user={shellUser}>
      <OfflineProvider enabled={user.settings?.offlineEnabled ?? true} />
      {children}
    </AppShell>
  );
}
