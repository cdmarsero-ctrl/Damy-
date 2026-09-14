"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Target, X } from "lucide-react";

import { Button, Card, ErrorMessage, LevelPill, Progress } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Cefr, Skill } from "@prisma/client";

interface Item {
  id: string;
  skill: Skill;
  prompt: string;
  context: string | null;
  options: string[];
}

interface Outcome {
  theta: number;
  se: number;
  level: Cefr;
  subscores: Record<string, number>;
  confidence: "low" | "moderate" | "high";
  weakestSkills: Skill[];
  strongestSkills: Skill[];
}

type Phase = "intro" | "testing" | "feedback" | "done";

const SKILL_LABEL: Record<string, string> = {
  READING: "Reading", WRITING: "Writing", LISTENING: "Listening", SPEAKING: "Speaking",
  GRAMMAR: "Grammar", VOCABULARY: "Vocabulary", PRONUNCIATION: "Pronunciation", MEDIATION: "Mediation",
};

export default function PlacementPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [testId, setTestId] = useState<string | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [answered, setAnswered] = useState(0);
  const [maxItems, setMaxItems] = useState(22);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; rationale: string } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Response time is a genuine signal of fluency, so it is measured per item
  // and reset whenever a new question is rendered.
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
  }, [item?.id]);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{
        testId: string;
        answered: number;
        maxItems: number;
        item: Item;
      }>("/api/placement/start");
      setTestId(data.testId);
      setItem(data.item);
      setAnswered(data.answered);
      setMaxItems(data.maxItems);
      setPhase("testing");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not start the test.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (selected === null || !item || !testId) return;
    setBusy(true);
    setError(null);

    try {
      const data = await api.post<{
        done: boolean;
        answered: number;
        feedback: { correct: boolean; rationale: string };
        item?: Item;
        result?: Outcome;
      }>("/api/placement/answer", {
        testId,
        itemId: item.id,
        answerIndex: selected,
        responseMs: Date.now() - startedAt.current,
      });

      setFeedback(data.feedback);
      setAnswered(data.answered);
      setPhase("feedback");

      // Stash whatever comes next; `advance` reveals it.
      if (data.done && data.result) {
        setOutcome(data.result);
        setItem(null);
      } else if (data.item) {
        setItem(data.item);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit your answer.");
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    setFeedback(null);
    setSelected(null);
    setPhase(outcome ? "done" : "testing");
  }

  /* ------------------------------------------------------------------ intro */
  if (phase === "intro") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="size-12 rounded-xl bg-brand-600 text-white grid place-items-center mb-6">
          <Target className="size-6" aria-hidden />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-3 text-balance">
          Let&apos;s find your level
        </h1>
        <p className="muted leading-relaxed mb-8 text-pretty">
          This is an adaptive test. Each question is chosen based on how you answered the last one,
          so it converges quickly — usually between twelve and twenty questions, around ten minutes.
        </p>

        <Card className="mb-8">
          <ul className="space-y-3 text-sm">
            {[
              "Questions get harder when you are right and easier when you are wrong. Both are informative — do not be discouraged by a hard run.",
              "Every answer is explained immediately, so the test is worth taking even before you see the result.",
              "You cannot go back. Answer with your instinct; on a question you would need to look up, a guess is the honest data point.",
              "If you close the tab, your progress is saved and you resume where you left off.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <Check className="size-4 text-success shrink-0 mt-0.5" aria-hidden />
                <span className="muted text-pretty">{line}</span>
              </li>
            ))}
          </ul>
        </Card>

        {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

        <Button size="lg" onClick={begin} loading={busy}>
          Begin the test
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  /* ------------------------------------------------------------------- done */
  if (phase === "done" && outcome) {
    return <PlacementResult outcome={outcome} onContinue={() => router.push("/onboarding")} />;
  }

  /* ---------------------------------------------------------------- testing */
  const progress = answered / maxItems;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <div className="flex justify-between items-baseline mb-2 text-sm">
          <span className="font-medium">
            Question {Math.min(answered + (phase === "feedback" ? 0 : 1), maxItems)}
          </span>
          <span className="muted tabular-nums">up to {maxItems}</span>
        </div>
        <Progress value={progress} />
        <p className="text-xs muted mt-2">
          The test ends as soon as your level is clear — it may finish well before {maxItems}.
        </p>
      </div>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      {phase === "feedback" && feedback ? (
        <div className="animate-[fade-up_0.3s_ease-out]">
          <Card
            className={cn(
              "border-2",
              feedback.correct ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5",
            )}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <span
                className={cn(
                  "size-7 rounded-full grid place-items-center text-white shrink-0",
                  feedback.correct ? "bg-success" : "bg-danger",
                )}
              >
                {feedback.correct ? <Check className="size-4" /> : <X className="size-4" />}
              </span>
              <span className="font-semibold">{feedback.correct ? "Correct" : "Not quite"}</span>
            </div>
            <p className="text-sm leading-relaxed text-pretty">{feedback.rationale}</p>
          </Card>

          <Button size="lg" onClick={advance} className="mt-6">
            {outcome ? "See your result" : "Next question"}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : item ? (
        <div key={item.id} className="animate-[fade-up_0.3s_ease-out]">
          <p className="text-xs font-semibold tracking-wide uppercase text-brand-600 dark:text-brand-400 mb-3">
            {SKILL_LABEL[item.skill] ?? item.skill}
          </p>

          {item.context && (
            <div className="surface-sunken p-4 mb-5 text-sm leading-relaxed whitespace-pre-line font-serif">
              {item.context}
            </div>
          )}

          <h1 className="text-lg font-medium leading-relaxed mb-6 whitespace-pre-line text-pretty">
            {item.prompt}
          </h1>

          <fieldset className="space-y-2.5">
            <legend className="sr-only">Choose an answer</legend>
            {item.options.map((option, index) => (
              <label
                key={index}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                  selected === index
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                    : "border-[var(--border)] hover:border-brand-300 hover:bg-[var(--surface-sunken)]",
                )}
              >
                <input
                  type="radio"
                  name="answer"
                  value={index}
                  checked={selected === index}
                  onChange={() => setSelected(index)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "size-6 rounded-full border-2 grid place-items-center shrink-0 text-xs font-semibold transition-colors",
                    selected === index
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-[var(--border)] muted",
                  )}
                  aria-hidden
                >
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm leading-relaxed pt-0.5">{option}</span>
              </label>
            ))}
          </fieldset>

          <Button size="lg" onClick={submit} disabled={selected === null} loading={busy} className="mt-6">
            Submit answer
          </Button>
        </div>
      ) : (
        <div className="py-20 grid place-items-center">
          <Loader2 className="size-6 animate-spin muted" aria-label="Loading" />
        </div>
      )}
    </div>
  );
}

function PlacementResult({ outcome, onContinue }: { outcome: Outcome; onContinue: () => void }) {
  const blurb: Record<Cefr, string> = {
    B2: "Upper-intermediate. You handle complex text and hold your own in discussion. The work ahead is precision — the right preposition, the natural collocation, the register that fits the room.",
    C1: "Advanced. You express yourself fluently and flexibly. What remains is rhetorical control: hedging, positioning, diplomatic disagreement and sustained argument.",
    C2: "Proficient. You operate close to a native speaker. The remaining layer is the subtlest one — connotation, implicature, understatement and stylistic range.",
  };

  const confidenceNote = {
    high: "The estimate is precise — the test converged well before the question limit.",
    moderate: "A reasonably confident estimate. Retaking it in a few weeks will sharpen it.",
    low: "A provisional estimate. Your answers were mixed across difficulty, which usually means uneven skills rather than an unclear level.",
  }[outcome.confidence];

  const sorted = Object.entries(outcome.subscores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 animate-[fade-up_0.4s_ease-out]">
      <p className="text-sm font-medium muted mb-3">Your result</p>
      <div className="flex items-baseline gap-4 mb-5">
        <span
          className="text-7xl font-semibold tracking-tight tabular-nums"
          style={{ color: `var(--color-${outcome.level.toLowerCase()})` }}
        >
          {outcome.level}
        </span>
        <LevelPill level={outcome.level} />
      </div>

      <p className="text-lg leading-relaxed mb-2 text-pretty">{blurb[outcome.level]}</p>
      <p className="text-sm muted mb-8">{confidenceNote}</p>

      <Card className="mb-6">
        <h2 className="font-semibold mb-4">How you scored by skill</h2>
        <div className="space-y-3.5">
          {sorted.map(([skill, score]) => (
            <Progress
              key={skill}
              value={score}
              label={SKILL_LABEL[skill] ?? skill}
              showValue
              tone={score >= 0.75 ? "success" : score >= 0.5 ? "brand" : "warning"}
            />
          ))}
        </div>
        <p className="text-xs muted mt-4 text-pretty">
          Scores are weighted by item difficulty, so a skill tested with harder questions is not
          penalised for it. Skills with few questions are less reliable — they will firm up as you
          study.
        </p>
      </Card>

      {(outcome.weakestSkills.length > 0 || outcome.strongestSkills.length > 0) && (
        <Card className="mb-8">
          <h2 className="font-semibold mb-3">What this suggests</h2>
          <div className="space-y-2.5 text-sm">
            {outcome.strongestSkills.length > 0 && (
              <p className="text-pretty">
                <span className="font-medium text-success">Ahead of your own average:</span>{" "}
                <span className="muted">
                  {outcome.strongestSkills.map((s) => SKILL_LABEL[s] ?? s).join(", ")}. Maintain
                  these rather than drilling them.
                </span>
              </p>
            )}
            {outcome.weakestSkills.length > 0 && (
              <p className="text-pretty">
                <span className="font-medium text-warning">Lagging:</span>{" "}
                <span className="muted">
                  {outcome.weakestSkills.map((s) => SKILL_LABEL[s] ?? s).join(", ")}. Your path will
                  weight these more heavily.
                </span>
              </p>
            )}
          </div>
        </Card>
      )}

      <Button size="lg" onClick={onContinue}>
        Set up your learning path
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
