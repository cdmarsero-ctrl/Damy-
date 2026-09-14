import { json, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { utcDay } from "@/lib/gamification";
import { ensureTodaysChallenges } from "@/lib/services/challenges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's challenges, generated lazily on first request of the day. */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const today = utcDay();

  await ensureTodaysChallenges(today);

  const challenges = await prisma.dailyChallenge.findMany({
    where: { date: today },
    orderBy: { xpReward: "asc" },
    include: { users: { where: { userId: claims.sub } } },
  });

  const [badges, stats] = await Promise.all([
    prisma.userBadge.findMany({
      where: { userId: claims.sub },
      include: { badge: true },
      orderBy: [{ earnedAt: "desc" }],
    }),
    prisma.userStats.findUnique({ where: { userId: claims.sub } }),
  ]);

  return json({
    date: today,
    challenges: challenges.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.title,
      description: c.description,
      target: c.target,
      xpReward: c.xpReward,
      progress: c.users[0]?.progress ?? 0,
      completedAt: c.users[0]?.completedAt ?? null,
    })),
    badges: badges.map((b) => ({
      slug: b.badge.slug,
      title: b.badge.title,
      description: b.badge.description,
      icon: b.badge.icon,
      tier: b.badge.tier,
      progress: b.progress,
      earnedAt: b.earnedAt,
    })),
    stats,
  });
});
