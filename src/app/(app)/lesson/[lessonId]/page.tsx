import { notFound } from "next/navigation";

import { LessonPlayer } from "@/components/lesson-player";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = await prisma.lesson.findFirst({
    where: { OR: [{ id: lessonId }, { slug: lessonId }] },
    select: { title: true },
  });
  return { title: lesson?.title ?? "Lesson" };
}

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const user = await requireUser();
  const { lessonId } = await params;

  const lesson = await prisma.lesson.findFirst({
    where: { OR: [{ id: lessonId }, { slug: lessonId }], published: true },
    include: {
      unit: {
        select: {
          id: true,
          title: true,
          track: { select: { id: true, title: true, slug: true } },
        },
      },
      // `solution` is deliberately absent from this selection. The lesson page
      // is a server component, so anything included here would be serialised
      // into the RSC payload and readable in the browser.
      exercises: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          skill: true,
          cefr: true,
          prompt: true,
          instructions: true,
          payload: true,
          points: true,
        },
      },
    },
  });

  if (!lesson) notFound();

  const [progress, siblings] = await Promise.all([
    prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      select: { status: true, bestScore: true, attempts: true },
    }),
    prisma.lesson.findMany({
      where: { unitId: lesson.unitId, published: true },
      orderBy: { order: "asc" },
      select: { id: true, title: true, order: true },
    }),
  ]);

  const index = siblings.findIndex((s) => s.id === lesson.id);

  return (
    <LessonPlayer
      lesson={{
        id: lesson.id,
        title: lesson.title,
        subtitle: lesson.subtitle,
        skill: lesson.skill,
        cefr: lesson.cefr,
        objectives: lesson.objectives,
        estimatedMinutes: lesson.estimatedMinutes,
        xpReward: lesson.xpReward,
        content: lesson.content,
        culturalNote: lesson.culturalNote,
        unitTitle: lesson.unit.title,
        trackTitle: lesson.unit.track.title,
        trackSlug: lesson.unit.track.slug,
      }}
      exercises={lesson.exercises.map((exercise) => ({
        id: exercise.id,
        type: exercise.type,
        skill: exercise.skill,
        cefr: exercise.cefr,
        prompt: exercise.prompt,
        instructions: exercise.instructions,
        payload: exercise.payload as Record<string, unknown>,
        points: exercise.points,
      }))}
      previousAttempt={progress}
      nextLesson={index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null}
    />
  );
}
