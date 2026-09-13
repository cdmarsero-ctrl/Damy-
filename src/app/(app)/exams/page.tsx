import Link from "next/link";
import { ArrowRight, CalendarClock, GraduationCap, Timer } from "lucide-react";

import { Card, LevelPill, Pill, Stat } from "@/components/ui";
import { EXAM_BLURB, EXAM_LABEL, studyPlan } from "@/lib/exams";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDate, pluralise } from "@/lib/utils";
import type { ExamName } from "@prisma/client";

export const metadata = { title: "Exam preparation" };
export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const user = await requireUser();

  const [modules, attempts] = await Promise.all([
    prisma.examModule.findMany({
      orderBy: [{ exam: "asc" }, { order: "asc" }],
      include: { _count: { select: { tasks: true } } },
    }),
    prisma.examAttempt.findMany({
      where: { userId: user.id, status: "SCORED" },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true, moduleId: true, rawScore: true, maxScore: true,
        band: true, submittedAt: true,
      },
    }),
  ]);

  const bestByModule = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const current = bestByModule.get(attempt.moduleId);
    if (!current || attempt.rawScore > current.rawScore) bestByModule.set(attempt.moduleId, attempt);
  }

  const targetExam = user.profile?.targetExam ?? null;
  const examDate = user.profile?.examDate ?? null;
  const daysToExam = examDate
    ? Math.ceil((examDate.getTime() - Date.now()) / 86_400_000)
    : null;

  // Target exam first — everything else is secondary if a date is booked.
  const byExam = new Map<ExamName, typeof modules>();
  for (const module of modules) {
    byExam.set(module.exam, [...(byExam.get(module.exam) ?? []), module]);
  }
  const examOrder = [...byExam.keys()].sort((a, b) => {
    if (a === targetExam) return -1;
    if (b === targetExam) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <GraduationCap className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Exam preparation</h1>
        </div>
        <p className="muted text-pretty">
          Timed section practice with indicative score conversion. Band estimates here are exactly
          that — real conversions are re-equated per sitting and are not published.
        </p>
      </header>

      {/* Countdown */}
      {targetExam && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <CalendarClock className="size-4 text-brand-500" aria-hidden />
                <h2 className="font-semibold">{EXAM_LABEL[targetExam]}</h2>
              </div>
              <p className="text-sm muted mb-3 text-pretty">{EXAM_BLURB[targetExam]}</p>
              <p className="text-sm leading-relaxed text-pretty">{studyPlan(daysToExam)}</p>
            </div>
            {daysToExam !== null && daysToExam >= 0 && (
              <div className="text-right shrink-0">
                <div className="text-4xl font-semibold tabular-nums text-brand-500">{daysToExam}</div>
                <div className="text-xs muted">{pluralise(daysToExam, "day")} to go</div>
                {examDate && <div className="text-xs muted mt-0.5">{formatDate(examDate)}</div>}
              </div>
            )}
          </div>
        </Card>
      )}

      {attempts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <Stat label="Modules attempted" value={bestByModule.size} />
          <Stat label="Total attempts" value={attempts.length} />
          <Stat
            label="Best recent"
            value={attempts[0]?.band ?? "—"}
            sub={attempts[0]?.submittedAt ? formatDate(attempts[0].submittedAt) : undefined}
            tone="brand"
          />
        </div>
      )}

      <div className="space-y-7">
        {examOrder.map((exam) => (
          <section key={exam}>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="text-lg font-semibold">{EXAM_LABEL[exam]}</h2>
              {exam === targetExam && <Pill tone="brand">your target</Pill>}
            </div>
            <p className="text-sm muted mb-4 text-pretty">{EXAM_BLURB[exam]}</p>

            <div className="grid sm:grid-cols-2 gap-3">
              {byExam.get(exam)!.map((module) => {
                const best = bestByModule.get(module.id);
                return (
                  <Link
                    key={module.id}
                    href={`/exams/${module.slug}`}
                    className="surface p-4 hover:border-brand-400 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Pill>{module.section}</Pill>
                        <LevelPill level={module.cefr} />
                      </div>
                      {best && (
                        <Pill tone="success">{best.band ?? `${Math.round(best.rawScore)}/${best.maxScore}`}</Pill>
                      )}
                    </div>

                    <h3 className="font-medium mb-1.5 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {module.title}
                    </h3>
                    <p className="text-sm muted mb-3 text-pretty leading-relaxed">{module.description}</p>

                    <div className="flex items-center gap-3 text-xs muted">
                      <span className="flex items-center gap-1">
                        <Timer className="size-3.5" aria-hidden />
                        {module.durationMin} min
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {module._count.tasks} {pluralise(module._count.tasks, "task")}
                      </span>
                      <ArrowRight className="size-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {modules.length === 0 && (
        <Card>
          <p className="text-sm muted text-center py-8">
            No exam modules loaded. Run <code className="font-mono">npm run db:seed</code>.
          </p>
        </Card>
      )}
    </div>
  );
}
