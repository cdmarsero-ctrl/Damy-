"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Timer, X } from "lucide-react";

import { ExerciseRenderer, isAnswered, type ExerciseData, type ExerciseResponse } from "@/components/exercises";
import { Button, Card, ErrorMessage, LevelPill, Pill, Progress } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { cn, formatClock, pluralise } from "@/lib/utils";
import type { Cefr, ExamName } from "@prisma/client";

/**
 * Timed exam runner.
 *
 * Two behaviours matter for this to be worth doing at all:
 *  - The clock runs down and auto-submits. A practice section you can pause is
 *    not practice for a section you cannot.
 *  - Every task is navigable, so a candidate can skip and return, which is the
 *    technique every exam board recommends and no learner uses unless the
 *    interface makes it obvious.
 */

interface ModuleMeta {
  id: string;
  slug: string;
  exam: ExamName;
  examLabel: string;
  section: string;
  title: string;
  description: string;
  cefr: Cefr;
  durationMin: number;
  instructions: string;
}

interface Scoring {
  scaled: number;
  label: string;
  cefr: Cefr;
  interpretation: string;
}

interface ReviewRow {
  taskId: string;
  prompt: string;
  solution: Record<string, unknown>;
  rubric: Record<string, unknown> | null;
  response: { score: number; feedback: { summary: string; issues: { message: string }[] } } | null;
}

type Phase = "brief" | "running" | "results";

export function ExamRunner({ module, tasks }: { module: ModuleMeta; tasks: ExerciseData[] }) {
  const [phase, setPhase] = useState<Phase>("brief");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, ExerciseResponse>>({});
  const [secondsLeft, setSecondsLeft] = useState(module.durationMin * 60);
  const [results, setResults] = useState<{
    rawScore: number;
    maxScore: number;
    scoring: Scoring;
    review: ReviewRow[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startedAt = useRef(Date.now());
  // Guards against the timer and a manual click both submitting.
  const submitted = useRef(false);

  const submit = useCallback(
    async (auto = false) => {
      if (submitted.current || !attemptId) return;
      submitted.current = true;
      setBusy(true);
      setError(null);

      try {
        const data = await api.post<{
          attempt: { rawScore: number; maxScore: number };
          scoring: Scoring;
          review: ReviewRow[];
        }>("/api/exams/submit", {
          attemptId,
          responses: tasks
            .filter((task) => responses[task.id])
            .map((task) => ({ taskId: task.id, response: responses[task.id] })),
          durationSec: Math.round((Date.now() - startedAt.current) / 1000),
        });

        setResults({
          rawScore: data.attempt.rawScore,
          maxScore: data.attempt.maxScore,
          scoring: data.scoring,
          review: data.review,
        });
        setPhase("results");
      } catch (err) {
        submitted.current = false;
        setError(
          err instanceof ApiClientError
            ? err.message
            : auto
              ? "Time ran out but your answers could not be submitted. Try again."
              : "Could not submit your answers.",
        );
      } finally {
        setBusy(false);
      }
    },
    [attemptId, responses, tasks],
  );

  // The clock.
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          void submit(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, submit]);

  // Warn before an accidental navigation away mid-attempt.
  useEffect(() => {
    if (phase !== "running") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ attempt: { id: string } }>("/api/exams/start", {
        moduleId: module.id,
      });
      setAttemptId(data.attempt.id);
      setSecondsLeft(module.durationMin * 60);
      startedAt.current = Date.now();
      submitted.current = false;
      setPhase("running");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not start the module.");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ brief */
  if (phase === "brief") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <Link
          href="/exams"
          className="flex items-center gap-1.5 text-sm muted hover:text-[var(--text)] transition-colors mb-6"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All exam modules
        </Link>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Pill tone="brand">{module.examLabel}</Pill>
          <Pill>{module.section}</Pill>
          <LevelPill level={module.cefr} />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-2 text-balance">{module.title}</h1>
        <p className="muted mb-7 text-pretty">{module.description}</p>

        <Card className="mb-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Timer className="size-4 text-brand-500" aria-hidden />
            Instructions
          </h2>
          <p className="text-sm leading-relaxed text-pretty mb-4">{module.instructions}</p>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="muted text-xs uppercase tracking-wide mb-0.5">Time limit</dt>
              <dd className="font-semibold tabular-nums">{module.durationMin} minutes</dd>
            </div>
            <div>
              <dt className="muted text-xs uppercase tracking-wide mb-0.5">Tasks</dt>
              <dd className="font-semibold tabular-nums">{tasks.length}</dd>
            </div>
          </dl>
        </Card>

        <Card className="mb-7 border-warning/30 bg-warning/5">
          <div className="flex gap-3">
            <AlertTriangle className="size-5 text-warning shrink-0" aria-hidden />
            <p className="text-sm leading-relaxed text-pretty">
              The clock starts when you begin and submits automatically when it runs out. That is
              the point — practising untimed builds the wrong habits. Answers are saved as you go,
              so a skipped task can be returned to.
            </p>
          </div>
        </Card>

        {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

        <Button size="lg" onClick={begin} loading={busy}>
          Start — {module.durationMin} minutes
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  /* ---------------------------------------------------------------- results */
  if (phase === "results" && results) {
    const pct = results.maxScore > 0 ? results.rawScore / results.maxScore : 0;

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-[fade-up_0.3s_ease-out]">
        <p className="text-sm muted mb-2">{module.examLabel} · {module.section}</p>
        <h1 className="text-2xl font-semibold tracking-tight mb-6">{module.title}</h1>

        <Card className="mb-6">
          <div className="flex flex-wrap items-baseline gap-4 mb-4">
            <span
              className={cn(
                "text-5xl font-semibold tabular-nums",
                pct >= 0.8 ? "text-success" : pct >= 0.6 ? "text-brand-500" : "text-warning",
              )}
            >
              {results.scoring.label}
            </span>
            <span className="muted text-sm tabular-nums">
              {results.rawScore.toFixed(1)} / {results.maxScore} raw
            </span>
            <LevelPill level={results.scoring.cefr} />
          </div>

          <Progress value={pct} tone={pct >= 0.8 ? "success" : pct >= 0.6 ? "brand" : "warning"} className="mb-4" />

          <p className="text-sm leading-relaxed text-pretty">{results.scoring.interpretation}</p>

          <p className="text-xs muted mt-4 text-pretty">
            This conversion is indicative. Exam boards re-equate raw scores for every sitting and do
            not publish the tables, so treat this as a guide to where you stand rather than a
            prediction.
          </p>
        </Card>

        <h2 className="font-semibold mb-3">Task by task</h2>
        <div className="space-y-3 mb-8">
          {results.review.map((row, i) => {
            const answered = Boolean(row.response);
            const correct = (row.response?.score ?? 0) > 0;
            return (
              <Card key={row.taskId}>
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "size-6 rounded-full grid place-items-center text-white shrink-0 mt-0.5",
                      !answered ? "bg-[var(--text-muted)]" : correct ? "bg-success" : "bg-danger",
                    )}
                    aria-hidden
                  >
                    {!answered ? (
                      <span className="text-xs font-semibold">—</span>
                    ) : correct ? (
                      <Check className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium mb-1.5 whitespace-pre-line">
                      {i + 1}. {truncate(row.prompt, 180)}
                    </p>
                    {row.response ? (
                      <>
                        <p className="text-sm muted">{row.response.feedback.summary}</p>
                        {row.response.feedback.issues?.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {row.response.feedback.issues.slice(0, 4).map((issue, n) => (
                              <li key={n} className="text-xs muted text-pretty">
                                · {issue.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-sm muted">Not attempted.</p>
                    )}
                    {row.rubric?.note != null && (
                      <p className="text-xs muted mt-2 text-pretty border-l-2 border-brand-400 pl-2.5">
                        {String(row.rubric.note)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => {
              setResults(null);
              setResponses({});
              setIndex(0);
              setPhase("brief");
            }}
          >
            Retake this module
          </Button>
          <Link
            href="/exams"
            className="h-12 px-6 inline-flex items-center rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
          >
            All modules
          </Link>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- running */
  const task = tasks[index];
  const answeredCount = tasks.filter((t) => responses[t.id] && isAnswered(t.type, responses[t.id])).length;
  const urgent = secondsLeft <= 60;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* Timer bar */}
      <div className="sticky top-16 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)] mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{module.title}</p>
            <p className="text-xs muted">
              {answeredCount} of {tasks.length} answered
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold tabular-nums",
              urgent ? "bg-danger text-white animate-pulse" : "surface-sunken",
            )}
            role="timer"
            aria-live={urgent ? "assertive" : "off"}
          >
            <Timer className="size-4" aria-hidden />
            {formatClock(secondsLeft)}
          </div>
        </div>
        <Progress value={answeredCount} max={tasks.length} className="mt-2.5" />
      </div>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      {/* Task navigation */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {tasks.map((t, i) => {
          const done = responses[t.id] && isAnswered(t.type, responses[t.id]);
          return (
            <button
              key={t.id}
              onClick={() => setIndex(i)}
              aria-label={`Go to task ${i + 1}${done ? ", answered" : ", not answered"}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "size-9 rounded-lg text-sm font-medium tabular-nums transition-colors border-2",
                i === index
                  ? "border-brand-500 bg-brand-500 text-white"
                  : done
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-[var(--border)] muted hover:bg-[var(--surface-sunken)]",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {task && (
        <div key={task.id} className="animate-[fade-up_0.2s_ease-out]">
          <div className="flex items-center gap-2 mb-3">
            <Pill>Task {index + 1}</Pill>
            <Pill>{task.points} {pluralise(task.points, "mark")}</Pill>
          </div>

          <h1 className="text-lg font-medium leading-relaxed whitespace-pre-line mb-5 text-pretty">
            {task.prompt}
          </h1>

          <ExerciseRenderer
            exercise={task}
            response={responses[task.id] ?? {}}
            onChange={(response) => setResponses((current) => ({ ...current, [task.id]: response }))}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-8">
        <Button variant="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          <ArrowLeft className="size-4" aria-hidden />
          Previous
        </Button>
        {index < tasks.length - 1 ? (
          <Button onClick={() => setIndex((i) => i + 1)}>
            Next
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button size="lg" onClick={() => submit(false)} loading={busy}>
            Submit module
          </Button>
        )}
        {index < tasks.length - 1 && (
          <Button variant="ghost" onClick={() => submit(false)} loading={busy}>
            Submit early
          </Button>
        )}
      </div>

      {answeredCount < tasks.length && index === tasks.length - 1 && (
        <p className="text-sm text-warning mt-4 text-pretty">
          {tasks.length - answeredCount} {pluralise(tasks.length - answeredCount, "task")} still
          unanswered. In a real exam an unanswered question scores zero — a guess costs nothing.
        </p>
      )}
    </div>
  );
}

function truncate(text: string, max: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}
