import { notFound } from "next/navigation";

import { ExamRunner } from "@/components/exam-runner";
import { prisma } from "@/lib/db";
import { EXAM_LABEL } from "@/lib/exams";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const module = await prisma.examModule.findUnique({ where: { slug }, select: { title: true } });
  return { title: module?.title ?? "Exam module" };
}

export default async function ExamModulePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const module = await prisma.examModule.findUnique({
    where: { slug },
    // `solution` and `rubric` are excluded — they are released by
    // /api/exams/submit after the attempt is scored, never before.
    include: {
      tasks: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, type: true, prompt: true, payload: true, points: true },
      },
    },
  });

  if (!module) notFound();

  return (
    <ExamRunner
      module={{
        id: module.id,
        slug: module.slug,
        exam: module.exam,
        examLabel: EXAM_LABEL[module.exam],
        section: module.section,
        title: module.title,
        description: module.description,
        cefr: module.cefr,
        durationMin: module.durationMin,
        instructions: module.instructions,
      }}
      tasks={module.tasks.map((task) => ({
        id: task.id,
        type: task.type,
        skill: "READING" as const,
        cefr: module.cefr,
        prompt: task.prompt,
        payload: task.payload as Record<string, unknown>,
        points: task.points,
      }))}
    />
  );
}
