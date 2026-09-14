"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Globe, Lightbulb, RotateCcw, Sparkles, Target, X, Zap,
} from "lucide-react";

import { ExerciseRenderer, isAnswered, type ExerciseData, type ExerciseResponse } from "@/components/exercises";
import { Button, Card, ErrorMessage, LevelPill, Pill, Progress } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { api, ApiClientError } from "@/lib/client";
import { cn, pluralise } from "@/lib/utils";
import type { Cefr, LessonStatus, Skill } from "@prisma/client";

interface LessonMeta {
  id: string;
  title: string;
  subtitle: string | null;
  skill: Skill;
  cefr: Cefr;
  objectives: string[];
  estimatedMinutes: number;
  xpReward: number;
  content: string | null;
  culturalNote: string | null;
  unitTitle: string;
  trackTitle: string;
  trackSlug: string;
}

interface GradeResult {
  correct: boolean;
  score: number;
  summary: string;
  issues: { type: string; message: string; expected?: string; index?: number }[];
  explanation?: string | null;
  needsQualitativeReview: boolean;
  addedToReview?: boolean;
}

interface Rewards {
  xpAwarded: number;
  levelUp: boolean;
  streakCurrent: number;
  streakExtended: boolean;
  newBadges: { slug: string; title: string; tier: string }[];
  completedChallenges: { title: string; xpReward: number }[];
}

type Stage = "brief" | "content" | "exercises" | "summary";

export function LessonPlayer({
  lesson,
  exercises,
  previousAttempt,
  nextLesson,
}: {
  lesson: LessonMeta;
  exercises: ExerciseData[];
  previousAttempt: { status: LessonStatus; bestScore: number; attempts: number } | null;
  nextLesson: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(lesson.content ? "brief" : "exercises");
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<ExerciseResponse>({});
  const [result, setResult] = useState<GradeResult | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startedAt = useRef(Date.now());
  const exerciseStartedAt = useRef(Date.now());
  const current = exercises[index];

  useEffect(() => {
    exerciseStartedAt.current = Date.now();
  }, [index]);

  const submitAnswer = useCallback(async () => {
    if (!current || result) return;
    setBusy(true);
    setError(null);

    try {
      const data = await api.post<GradeResult>("/api/lessons/submit", {
        exerciseId: current.id,
        response,
        durationMs: Date.now() - exerciseStartedAt.current,
      });
      setResult(data);
      // Keep the best score per exercise — retrying a wrong answer should help.
      setScores((s) => ({ ...s, [current.id]: Math.max(s[current.id] ?? 0, data.score) }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit your answer.");
    } finally {
      setBusy(false);
    }
  }, [current, response, result]);

  async function finishLesson() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ score: number; rewards: Rewards }>("/api/lessons/complete", {
        lessonId: lesson.id,
        timeSpentSec: Math.round((Date.now() - startedAt.current) / 1000),
      });
      setFinalScore(data.score);
      setRewards(data.rewards);
      setStage("summary");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save your progress.");
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    if (index < exercises.length - 1) {
      setIndex((i) => i + 1);
      setResponse({});
      setResult(null);
    } else {
      void finishLesson();
    }
  }

  function retry() {
    setResult(null);
    setResponse({});
  }

  // Enter submits, then advances — the keyboard flow a learner settles into
  // after the third exercise. Ignored inside a textarea, where Enter is a
  // newline the learner actually wants.
  useEffect(() => {
    if (stage !== "exercises") return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      if (result) advance();
      else if (current && isAnswered(current.type, response)) void submitAnswer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ------------------------------------------------------------- brief */
  if (stage === "brief") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Breadcrumb lesson={lesson} />

        <div className="flex flex-wrap items-center gap-2 mt-6 mb-3">
          <LevelPill level={lesson.cefr} />
          <Pill>{lesson.skill.toLowerCase()}</Pill>
          <Pill>{lesson.estimatedMinutes} min</Pill>
          <Pill tone="brand">
            <Zap className="size-3" aria-hidden />+{lesson.xpReward} XP
          </Pill>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-balance">{lesson.title}</h1>
        {lesson.subtitle && <p className="text-lg muted mt-2 text-pretty">{lesson.subtitle}</p>}

        {previousAttempt && previousAttempt.attempts > 0 && (
          <div className="mt-5">
            <Pill tone={previousAttempt.bestScore >= 0.9 ? "success" : "brand"}>
              Previous best: {Math.round(previousAttempt.bestScore * 100)}% over{" "}
              {previousAttempt.attempts} {pluralise(previousAttempt.attempts, "attempt")}
            </Pill>
          </div>
        )}

        {lesson.objectives.length > 0 && (
          <Card className="mt-7">
            <div className="flex items-center gap-2 mb-3">
              <Target className="size-4 text-brand-500" aria-hidden />
              <h2 className="font-semibold text-sm">By the end of this lesson you will be able to</h2>
            </div>
            <ul className="space-y-2">
              {lesson.objectives.map((objective) => (
                <li key={objective} className="flex gap-2.5 text-sm">
                  <Check className="size-4 text-success shrink-0 mt-0.5" aria-hidden />
                  <span className="muted text-pretty">{objective}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Button size="lg" className="mt-7" onClick={() => setStage("content")}>
          Begin
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  /* ----------------------------------------------------------- content */
  if (stage === "content" && lesson.content) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Breadcrumb lesson={lesson} />

        <h1 className="text-2xl font-semibold tracking-tight mt-6 mb-6 text-balance">
          {lesson.title}
        </h1>

        <article className="prose-lesson">
          <Markdown source={lesson.content} />
        </article>

        {lesson.culturalNote && (
          <Card className="mt-8 border-info/30 bg-info/5">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="size-4 text-info" aria-hidden />
              <h2 className="font-semibold text-sm">Cultural note</h2>
            </div>
            <p className="text-sm leading-relaxed text-pretty">{lesson.culturalNote}</p>
          </Card>
        )}

        <div className="flex gap-3 mt-8">
          <Button variant="secondary" onClick={() => setStage("brief")}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          <Button size="lg" onClick={() => setStage("exercises")}>
            Start the {exercises.length} {pluralise(exercises.length, "exercise")}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------- summary */
  if (stage === "summary") {
    return (
      <LessonSummary
        lesson={lesson}
        score={finalScore}
        rewards={rewards}
        nextLesson={nextLesson}
        onRetry={() => {
          setStage(lesson.content ? "content" : "exercises");
          setIndex(0);
          setResponse({});
          setResult(null);
          setScores({});
          setRewards(null);
          startedAt.current = Date.now();
        }}
      />
    );
  }

  /* --------------------------------------------------------- exercises */
  if (!current) return null;

  const answered = isAnswered(current.type, response);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-2 text-sm">
        <Link
          href={`/path/${lesson.trackSlug}`}
          className="muted hover:text-[var(--text)] transition-colors truncate"
        >
          {lesson.title}
        </Link>
        <span className="muted tabular-nums shrink-0">
          {index + 1} / {exercises.length}
        </span>
      </div>
      <Progress value={(index + (result ? 1 : 0)) / exercises.length} className="mb-8" />

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      <div key={current.id} className="animate-[fade-up_0.25s_ease-out]">
        <div className="flex items-center gap-2 mb-3">
          <Pill tone="brand">{current.skill.toLowerCase()}</Pill>
          <Pill>{current.points} pts</Pill>
        </div>

        <h1 className="text-lg font-medium leading-relaxed whitespace-pre-line mb-2 text-pretty">
          {current.prompt}
        </h1>
        {current.instructions && (
          <p className="text-sm muted mb-5 text-pretty">{current.instructions}</p>
        )}

        <div className={cn("mt-5", result && "opacity-95")}>
          <ExerciseRenderer
            exercise={current}
            response={response}
            onChange={setResponse}
            disabled={Boolean(result)}
          />
        </div>
      </div>

      {result && <Feedback result={result} />}

      <div className="flex flex-wrap gap-3 mt-7">
        {!result ? (
          <Button size="lg" onClick={submitAnswer} disabled={!answered} loading={busy}>
            Check answer
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={advance} loading={busy}>
              {index < exercises.length - 1 ? "Next" : "Finish lesson"}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            {!result.correct && (
              <Button size="lg" variant="secondary" onClick={retry}>
                <RotateCcw className="size-4" aria-hidden />
                Try again
              </Button>
            )}
          </>
        )}
      </div>

      <p className="hidden sm:block text-xs muted mt-4">
        Press <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono text-[11px]">Enter</kbd>{" "}
        to {result ? "continue" : "check your answer"}.
      </p>
    </div>
  );
}

function Breadcrumb({ lesson }: { lesson: LessonMeta }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm muted" aria-label="Breadcrumb">
      <Link href="/path" className="hover:text-[var(--text)] transition-colors">
        Paths
      </Link>
      <span aria-hidden>/</span>
      <Link href={`/path/${lesson.trackSlug}`} className="hover:text-[var(--text)] transition-colors truncate">
        {lesson.trackTitle}
      </Link>
      <span aria-hidden>/</span>
      <span className="truncate">{lesson.unitTitle}</span>
    </nav>
  );
}

function Feedback({ result }: { result: GradeResult }) {
  const tone = result.correct ? "success" : result.score > 0 ? "warning" : "danger";
  const tones = {
    success: "border-success/40 bg-success/5",
    warning: "border-warning/40 bg-warning/5",
    danger: "border-danger/40 bg-danger/5",
  };
  const iconBg = { success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

  return (
    <Card
      className={cn("mt-6 border-2 animate-[pop_0.28s_ease-out]", tones[tone])}
      // Announced to screen readers the moment it appears.
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className={cn("size-7 rounded-full grid place-items-center text-white shrink-0", iconBg[tone])}
        >
          {result.correct ? <Check className="size-4" /> : <X className="size-4" />}
        </span>
        <div>
          <span className="font-semibold">
            {result.correct ? "Correct" : result.score > 0 ? "Partly right" : "Not quite"}
          </span>
          <span className="ml-2 text-sm muted tabular-nums">{Math.round(result.score * 100)}%</span>
        </div>
      </div>

      <p className="text-sm mb-3">{result.summary}</p>

      {result.issues.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {result.issues.map((issue, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="muted shrink-0" aria-hidden>
                ·
              </span>
              <span className="text-pretty">
                {issue.message}
                {issue.expected && (
                  <>
                    {" "}
                    <span className="muted">Expected:</span>{" "}
                    <span className="font-medium">{issue.expected}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.explanation && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb className="size-4 text-warning" aria-hidden />
            <span className="font-semibold text-sm">Why</span>
          </div>
          <p className="text-sm leading-relaxed text-pretty">{result.explanation}</p>
        </div>
      )}

      {result.needsQualitativeReview && (
        <p className="text-xs muted mt-3 text-pretty">
          This answer is scored on coverage only. For a full judgement of style and argument, put it
          through the writing studio.
        </p>
      )}

      {result.addedToReview && (
        <div className="mt-3">
          <Pill tone="brand">
            <Sparkles className="size-3" aria-hidden />
            Added to your review queue
          </Pill>
        </div>
      )}
    </Card>
  );
}

function LessonSummary({
  lesson,
  score,
  rewards,
  nextLesson,
  onRetry,
}: {
  lesson: LessonMeta;
  score: number;
  rewards: Rewards | null;
  nextLesson: { id: string; title: string } | null;
  onRetry: () => void;
}) {
  const pct = Math.round(score * 100);
  const mastered = score >= 0.9;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14 animate-[fade-up_0.4s_ease-out]">
      <div
        className={cn(
          "size-16 rounded-2xl grid place-items-center mb-6 text-white",
          mastered ? "bg-success" : score >= 0.7 ? "bg-brand-600" : "bg-warning",
        )}
      >
        {mastered ? <Sparkles className="size-8" aria-hidden /> : <BookOpen className="size-8" aria-hidden />}
      </div>

      <h1 className="text-3xl font-semibold tracking-tight mb-2 text-balance">
        {mastered ? "Mastered" : score >= 0.7 ? "Lesson complete" : "Lesson complete — worth another pass"}
      </h1>
      <p className="muted mb-8 text-pretty">
        {mastered
          ? "Near-perfect. This one is done — the material will come back through spaced repetition rather than another run."
          : score >= 0.7
            ? "Solid work. Anything you missed is now in your review queue, which is where it will actually stick."
            : "Below 70%. Repeating a lesson after a day's gap is far more effective than repeating it immediately — the gap is what makes it stick."}
      </p>

      <Card className="mb-6">
        <div className="flex items-baseline gap-3 mb-4">
          <span
            className={cn(
              "text-5xl font-semibold tabular-nums",
              mastered ? "text-success" : score >= 0.7 ? "text-brand-500" : "text-warning",
            )}
          >
            {pct}%
          </span>
          <span className="muted text-sm">on {lesson.title}</span>
        </div>
        <Progress value={score} tone={mastered ? "success" : score >= 0.7 ? "brand" : "warning"} />
      </Card>

      {rewards && (
        <Card className="mb-8">
          <h2 className="font-semibold mb-4">What you earned</h2>
          <div className="flex flex-wrap gap-2.5">
            <Pill tone="brand">
              <Zap className="size-3" aria-hidden />+{rewards.xpAwarded} XP
            </Pill>
            {rewards.streakExtended && (
              <Pill tone="warning">
                Streak extended — day {rewards.streakCurrent}
              </Pill>
            )}
            {rewards.levelUp && <Pill tone="success">Level up</Pill>}
            {rewards.newBadges.map((badge) => (
              <Pill key={badge.slug} tone="success">
                Badge: {badge.title}
              </Pill>
            ))}
            {rewards.completedChallenges.map((challenge) => (
              <Pill key={challenge.title} tone="info">
                Challenge: {challenge.title} (+{challenge.xpReward})
              </Pill>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {nextLesson && (
          <Link
            href={`/lesson/${nextLesson.id}`}
            className="h-12 px-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
          >
            Next: {nextLesson.title}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        <Button variant="secondary" size="lg" onClick={onRetry}>
          <RotateCcw className="size-4" aria-hidden />
          Repeat lesson
        </Button>
        <Link
          href="/dashboard"
          className="h-12 px-6 inline-flex items-center rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
