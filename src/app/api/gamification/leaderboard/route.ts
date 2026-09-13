import { json, parseQuery, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { levelFromXp } from "@/lib/gamification";
import { leaderboardQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leaderboards computed from XpEvent rather than a denormalised counter.
 *
 * "This week" has to mean the last seven days of *earned* XP, and a running
 * total cannot answer that. The aggregate is indexed on (userId, createdAt),
 * which keeps it cheap at the scale this feature matters.
 */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const { scope, limit } = parseQuery(req, leaderboardQuerySchema);

  const since =
    scope === "all"
      ? null
      : new Date(Date.now() - (scope === "week" ? 7 : 30) * 86_400_000);

  if (!since) {
    const top = await prisma.userStats.findMany({
      orderBy: { xpTotal: "desc" },
      take: limit,
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    const rows = top.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      name: entry.user.name,
      avatarUrl: entry.user.avatarUrl,
      xp: entry.xpTotal,
      level: entry.level,
      streak: entry.streakCurrent,
      isYou: entry.userId === claims.sub,
    }));

    return json({ scope, rows, you: await selfRow(claims.sub, rows) });
  }

  const grouped = await prisma.xpEvent.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: since } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: limit,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, avatarUrl: true, stats: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows = grouped.map((entry, index) => {
    const user = byId.get(entry.userId);
    const xp = entry._sum.amount ?? 0;
    return {
      rank: index + 1,
      userId: entry.userId,
      name: user?.name ?? "Learner",
      avatarUrl: user?.avatarUrl ?? null,
      xp,
      level: user?.stats?.level ?? levelFromXp(user?.stats?.xpTotal ?? 0).level,
      streak: user?.stats?.streakCurrent ?? 0,
      isYou: entry.userId === claims.sub,
    };
  });

  return json({ scope, since, rows, you: await selfRow(claims.sub, rows, since) });
});

/** If the learner is outside the top N, show their own standing anyway —
 *  a leaderboard you never appear on is demotivating by design. */
async function selfRow(
  userId: string,
  rows: { userId: string; rank: number; xp: number }[],
  since?: Date,
) {
  const inTable = rows.find((r) => r.userId === userId);
  if (inTable) return inTable;

  if (since) {
    const mine = await prisma.xpEvent.aggregate({
      where: { userId, createdAt: { gte: since } },
      _sum: { amount: true },
    });
    const xp = mine._sum.amount ?? 0;
    const ahead = await prisma.xpEvent.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since } },
      _sum: { amount: true },
      having: { amount: { _sum: { gt: xp } } },
    });
    return { rank: ahead.length + 1, userId, xp, isYou: true };
  }

  const stats = await prisma.userStats.findUnique({ where: { userId } });
  const xp = stats?.xpTotal ?? 0;
  const ahead = await prisma.userStats.count({ where: { xpTotal: { gt: xp } } });
  return { rank: ahead + 1, userId, xp, isYou: true };
}
