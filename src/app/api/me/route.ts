import { json, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bandProgress } from "@/lib/cefr";
import { levelFromXp } from "@/lib/gamification";
import { hasLiveAI } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the app shell needs in one request. */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true,
      profile: true,
      settings: true,
      stats: true,
      _count: { select: { reviewCards: true } },
    },
  });
  if (!user) throw new Error("Authenticated user no longer exists");

  const [dueCount, badgeCount] = await Promise.all([
    // Overdue cards only — consistent with the sidebar badge and the dashboard.
    prisma.reviewCard.count({
      where: {
        userId: user.id,
        suspended: false,
        dueAt: { lte: new Date() },
        state: { not: "NEW" },
      },
    }),
    prisma.userBadge.count({ where: { userId: user.id, earnedAt: { not: null } } }),
  ]);

  const level = levelFromXp(user.stats?.xpTotal ?? 0);

  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      memberSince: user.createdAt,
    },
    profile: user.profile,
    settings: user.settings,
    stats: {
      ...user.stats,
      ...level,
      bandProgress: bandProgress(user.profile?.theta ?? 0),
      cardsTotal: user._count.reviewCards,
      dueCount,
      badgeCount,
    },
    capabilities: { liveAI: hasLiveAI() },
  });
});
