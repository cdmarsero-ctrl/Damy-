import { json, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Learning paths, ordered so the ones matching the learner's stated goals and
 * CEFR level come first — the personalisation the dashboard renders.
 */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);

  const [tracks, profile, enrollments] = await Promise.all([
    prisma.track.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
      include: {
        units: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              where: { published: true },
              orderBy: { order: "asc" },
              select: {
                id: true, slug: true, title: true, subtitle: true, skill: true,
                cefr: true, estimatedMinutes: true, xpReward: true, order: true,
              },
            },
          },
        },
      },
    }),
    prisma.profile.findUnique({ where: { userId: claims.sub } }),
    prisma.enrollment.findMany({ where: { userId: claims.sub } }),
  ]);

  const progress = await prisma.lessonProgress.findMany({
    where: { userId: claims.sub },
    select: { lessonId: true, status: true, bestScore: true },
  });
  const progressByLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const enrolledTrackIds = new Set(enrollments.map((e) => e.trackId));
  const goals = new Set(profile?.goals ?? []);

  const decorated = tracks.map((track) => {
    const lessons = track.units.flatMap((u) => u.lessons);
    const completed = lessons.filter((l) => {
      const p = progressByLesson.get(l.id);
      return p?.status === "COMPLETED" || p?.status === "MASTERED";
    }).length;

    return {
      ...track,
      units: track.units.map((unit) => ({
        ...unit,
        lessons: unit.lessons.map((lesson) => ({
          ...lesson,
          progress: progressByLesson.get(lesson.id) ?? null,
        })),
      })),
      lessonCount: lessons.length,
      completedCount: completed,
      progressPct: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
      enrolled: enrolledTrackIds.has(track.id),
      // Recommendation weight: goal match first, then level match.
      relevance: (goals.has(track.goal) ? 2 : 0) + (track.cefr === profile?.cefrLevel ? 1 : 0),
    };
  });

  decorated.sort((a, b) => b.relevance - a.relevance || a.order - b.order);

  return json({ tracks: decorated });
});
