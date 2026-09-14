import Link from "next/link";
import { ArrowRight, BookOpen, Check, Circle, Sparkles } from "lucide-react";

import { Card, LevelPill, Pill, Progress } from "@/components/ui";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { EnrollButton } from "@/components/enroll-button";
import { cn, pluralise } from "@/lib/utils";

export const metadata = { title: "Learning paths" };
export const dynamic = "force-dynamic";

const GOAL_LABEL: Record<string, string> = {
  ACADEMIC: "Academic",
  BUSINESS: "Professional",
  EXAM: "Exam preparation",
  TRAVEL: "Travel",
  CULTURE: "Cultural nuance",
  EVERYDAY_FLUENCY: "Everyday fluency",
};

export default async function PathsPage() {
  const user = await requireUser();

  const [tracks, progress, enrollments] = await Promise.all([
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
                id: true, title: true, subtitle: true, skill: true, cefr: true,
                estimatedMinutes: true, xpReward: true,
              },
            },
          },
        },
      },
    }),
    prisma.lessonProgress.findMany({
      where: { userId: user.id },
      select: { lessonId: true, status: true, bestScore: true },
    }),
    prisma.enrollment.findMany({ where: { userId: user.id }, select: { trackId: true } }),
  ]);

  const progressByLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const enrolledIds = new Set(enrollments.map((e) => e.trackId));
  const goals = new Set(user.profile?.goals ?? []);

  // Recommended paths first: goal match, then level match. Enrolment does not
  // affect ordering — someone who joined everything still wants their most
  // relevant path at the top.
  const decorated = tracks
    .map((track) => {
      const lessons = track.units.flatMap((u) => u.lessons);
      const completed = lessons.filter((l) => {
        const p = progressByLesson.get(l.id);
        return p?.status === "COMPLETED" || p?.status === "MASTERED";
      }).length;
      return {
        track,
        lessons,
        completed,
        pct: lessons.length ? completed / lessons.length : 0,
        enrolled: enrolledIds.has(track.id),
        relevance: (goals.has(track.goal) ? 2 : 0) + (track.cefr === user.profile?.cefrLevel ? 1 : 0),
      };
    })
    .sort((a, b) => b.relevance - a.relevance || a.track.order - b.track.order);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Learning paths</h1>
        <p className="muted mt-1 text-pretty">
          Sequenced curricula, ordered by how well they match your goals and level. You can work
          through any of them in any order — enrolling only decides what appears on your dashboard.
        </p>
      </header>

      <div className="space-y-5">
        {decorated.map(({ track, lessons, completed, pct, enrolled, relevance }) => (
          <Card key={track.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <LevelPill level={track.cefr} />
                  <Pill>{GOAL_LABEL[track.goal] ?? track.goal}</Pill>
                  {relevance >= 2 && (
                    <Pill tone="brand">
                      <Sparkles className="size-3" aria-hidden />
                      matches your goals
                    </Pill>
                  )}
                  {enrolled && <Pill tone="success">enrolled</Pill>}
                </div>
                <h2 className="text-lg font-semibold">{track.title}</h2>
                <p className="text-sm muted mt-1 max-w-2xl text-pretty">{track.description}</p>
              </div>
              <EnrollButton trackId={track.id} enrolled={enrolled} />
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-5 text-xs muted">
              <span>
                {track.units.length} {pluralise(track.units.length, "unit")}
              </span>
              <span aria-hidden>·</span>
              <span>
                {lessons.length} {pluralise(lessons.length, "lesson")}
              </span>
              <span aria-hidden>·</span>
              <span>
                {lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0)} minutes of material
              </span>
            </div>

            {completed > 0 && (
              <Progress
                value={pct}
                label={`${completed} of ${lessons.length} complete`}
                showValue
                tone={pct >= 1 ? "success" : "brand"}
                className="mb-5"
              />
            )}

            <div className="space-y-4">
              {track.units.map((unit) => (
                <div key={unit.id}>
                  <h3 className="text-sm font-semibold mb-1">{unit.title}</h3>
                  <p className="text-xs muted mb-2.5 text-pretty">{unit.description}</p>
                  <ul className="space-y-1.5">
                    {unit.lessons.map((lesson) => {
                      const state = progressByLesson.get(lesson.id);
                      const done = state?.status === "COMPLETED" || state?.status === "MASTERED";
                      const mastered = state?.status === "MASTERED";

                      return (
                        <li key={lesson.id}>
                          <Link
                            href={`/lesson/${lesson.id}`}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border transition-colors group",
                              done
                                ? "border-success/30 bg-success/5 hover:bg-success/10"
                                : "border-[var(--border)] hover:bg-[var(--surface-sunken)]",
                            )}
                          >
                            {done ? (
                              <span
                                className={cn(
                                  "size-5 rounded-full grid place-items-center text-white shrink-0",
                                  mastered ? "bg-success" : "bg-brand-500",
                                )}
                                aria-hidden
                              >
                                <Check className="size-3" />
                              </span>
                            ) : (
                              <Circle className="size-5 muted shrink-0" aria-hidden />
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                {lesson.title}
                              </div>
                              {lesson.subtitle && (
                                <div className="text-xs muted truncate">{lesson.subtitle}</div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {state && (
                                <span
                                  className={cn(
                                    "text-xs font-semibold tabular-nums",
                                    mastered ? "text-success" : "muted",
                                  )}
                                >
                                  {Math.round(state.bestScore * 100)}%
                                </span>
                              )}
                              <span className="text-xs muted hidden sm:inline">
                                {lesson.estimatedMinutes}m
                              </span>
                              <ArrowRight className="size-4 muted opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {decorated.length === 0 && (
        <Card>
          <div className="text-center py-10">
            <BookOpen className="size-10 mx-auto muted opacity-50 mb-4" aria-hidden />
            <h2 className="font-semibold mb-1">No paths available</h2>
            <p className="text-sm muted">Run `npm run db:seed` to load the curriculum.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
