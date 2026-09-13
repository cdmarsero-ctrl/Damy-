"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowLeft, Check, FileText, Lightbulb, ListOrdered, Loader2, PenLine, Sparkles,
} from "lucide-react";

import { Button, Card, ErrorMessage, Input, LevelPill, Pill, Progress, Select, Textarea } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { analyse } from "@/lib/text";
import { cn, relativeTime } from "@/lib/utils";
import type { WritingGenre } from "@prisma/client";

/**
 * The writing studio: plan → write → banded feedback.
 *
 * The live readability panel uses the same `analyse()` the server uses for its
 * report, so the numbers a learner watches while writing are exactly the ones
 * the feedback is grounded in.
 */

interface Correction {
  span: [number, number];
  type: string;
  original: string;
  suggestion: string;
  explanation: string;
  severity: "minor" | "moderate" | "major";
}

interface Report {
  overallBand: number;
  criteria: Record<string, number>;
  annotations: Correction[];
  strengths: string[];
  priorities: string[];
  summary: string;
  modelAnswer?: string;
  source: "model" | "rules";
}

interface Submission {
  id: string;
  genre: WritingGenre;
  title: string | null;
  prompt: string;
  wordCount: number;
  createdAt: string;
  feedback: { overallBand: number; summary: string } | null;
}

const GENRES: { id: WritingGenre; label: string; hint: string; target: number }[] = [
  { id: "ESSAY", label: "Argumentative essay", hint: "Thesis, evidence, counter-argument, conclusion", target: 300 },
  { id: "REPORT", label: "Formal report", hint: "Terms of reference, findings, recommendations", target: 300 },
  { id: "PROPOSAL", label: "Proposal", hint: "Need, solution, benefits, objections", target: 280 },
  { id: "EMAIL", label: "Professional email", hint: "Register calibrated to the relationship", target: 150 },
  { id: "REVIEW", label: "Review", hint: "Evaluative stance with earned recommendation", target: 250 },
  { id: "ARTICLE", label: "Feature article", hint: "Hook, narrative control, concrete detail", target: 350 },
  { id: "ABSTRACT", label: "Academic abstract", hint: "Background, method, results, implications", target: 200 },
  { id: "COVER_LETTER", label: "Cover letter", hint: "Evidenced claims, specific to the role", target: 250 },
  { id: "SUMMARY", label: "Summary", hint: "Faithful, proportional, genuinely paraphrased", target: 180 },
];

const PROMPTS: Partial<Record<WritingGenre, string[]>> = {
  ESSAY: [
    "Some argue that expertise has been devalued by universal access to information. To what extent do you agree?",
    "Should governments prioritise economic growth over environmental protection when the two conflict? Discuss both views and give your opinion.",
    "“Remote work has been better for employers than for employees.” Discuss.",
  ],
  REPORT: [
    "Your organisation trialled a four-day week across two departments. Report on the trial and recommend whether to extend it.",
    "Report on the accessibility of your institution's digital services, and recommend three priority improvements.",
  ],
  EMAIL: [
    "A client has missed two agreed deadlines, putting your own delivery at risk. Write to them.",
    "You must decline a project from an important stakeholder without damaging the relationship.",
  ],
  ABSTRACT: [
    "Write a 200-word abstract for a study on whether spaced repetition outperforms massed practice for adult vocabulary acquisition.",
  ],
  PROPOSAL: [
    "Propose a mentoring scheme for early-career staff to a sceptical senior leadership team.",
  ],
};

const CRITERION_LABEL: Record<string, string> = {
  taskAchievement: "Task achievement",
  coherenceCohesion: "Coherence and cohesion",
  lexicalResource: "Lexical resource",
  grammaticalRange: "Grammatical range and accuracy",
  registerStyle: "Register and style",
};

type View = "compose" | "feedback" | "history";

export default function WritingPage() {
  const [view, setView] = useState<View>("compose");
  const [genre, setGenre] = useState<WritingGenre>("ESSAY");
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [outline, setOutline] = useState<string[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [outlining, setOutlining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = GENRES.find((g) => g.id === genre)!;
  const stats = useMemo(() => analyse(text), [text]);

  // Drafts survive a refresh — losing 300 words to a stray reload is the
  // fastest way to make someone stop using a writing tool.
  useEffect(() => {
    const saved = localStorage.getItem("lx-writing-draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved) as { genre: WritingGenre; prompt: string; text: string; title: string };
        setGenre(draft.genre ?? "ESSAY");
        setPrompt(draft.prompt ?? "");
        setText(draft.text ?? "");
        setTitle(draft.title ?? "");
      } catch {
        localStorage.removeItem("lx-writing-draft");
      }
    }
    void loadHistory();
  }, []);

  useEffect(() => {
    if (!text && !prompt) return;
    const timer = setTimeout(() => {
      localStorage.setItem("lx-writing-draft", JSON.stringify({ genre, prompt, text, title }));
    }, 800);
    return () => clearTimeout(timer);
  }, [genre, prompt, text, title]);

  async function loadHistory() {
    try {
      const data = await api.get<{ submissions: Submission[] }>("/api/ai/writing");
      setSubmissions(data.submissions);
    } catch {
      /* history is supplementary */
    }
  }

  async function requestOutline() {
    if (!prompt.trim()) return;
    setOutlining(true);
    setError(null);
    try {
      const data = await api.post<{ outline: string[] }>("/api/ai/writing/outline", { genre, prompt });
      setOutline(data.outline);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not build an outline.");
    } finally {
      setOutlining(false);
    }
  }

  async function submit() {
    if (!prompt.trim() || text.trim().length < 20) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ report: Report }>("/api/ai/writing", {
        genre,
        prompt,
        title: title || undefined,
        text,
      });
      setReport(data.report);
      setView("feedback");
      localStorage.removeItem("lx-writing-draft");
      void loadHistory();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit for feedback.");
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------------------------------------------- feedback */
  if (view === "feedback" && report) {
    return (
      <FeedbackView
        report={report}
        text={text}
        onBack={() => setView("compose")}
        onNew={() => {
          setReport(null);
          setText("");
          setPrompt("");
          setTitle("");
          setOutline(null);
          setView("compose");
        }}
      />
    );
  }

  /* ---------------------------------------------------------------- compose */
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <PenLine className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Writing studio</h1>
        </div>
        <p className="muted text-pretty">
          Plan, write, and get a banded report against IELTS-style descriptors — grounded in
          measured features of your text, not impressions.
        </p>
      </header>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <Select label="Genre" value={genre} onChange={(e) => setGenre(e.target.value as WritingGenre)}>
                {GENRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="For your own reference"
              />
            </div>
            <p className="text-xs muted mb-4">{config.hint}</p>

            <Textarea
              label="Task prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste an exam question, or write your own."
              rows={3}
            />

            {PROMPTS[genre] && (
              <div className="mt-3">
                <p className="text-xs font-medium muted uppercase tracking-wide mb-2">Or use one of these</p>
                <div className="space-y-1.5">
                  {PROMPTS[genre]!.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setPrompt(suggestion)}
                      className="w-full text-left text-xs p-2.5 rounded-lg surface-sunken hover:border-brand-400 border border-[var(--border)] transition-colors text-pretty"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="secondary"
              className="mt-4"
              onClick={requestOutline}
              loading={outlining}
              disabled={!prompt.trim()}
            >
              <ListOrdered className="size-4" aria-hidden />
              Plan it first
            </Button>
          </Card>

          {outline && (
            <Card className="animate-[fade-up_0.25s_ease-out]">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="size-4 text-warning" aria-hidden />
                <h2 className="font-semibold">Your plan</h2>
              </div>
              <ol className="space-y-2.5">
                {outline.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="size-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 grid place-items-center text-xs font-semibold shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-pretty leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Card>
            <Textarea
              label="Your writing"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Start writing. Your draft is saved locally as you type."
              rows={16}
              className="font-serif text-[15px] leading-relaxed"
            />
            <Button
              size="lg"
              className="mt-4"
              onClick={submit}
              loading={busy}
              disabled={!prompt.trim() || stats.wordCount < 20}
            >
              <Sparkles className="size-4" aria-hidden />
              Submit for feedback
            </Button>
          </Card>
        </div>

        {/* ----------------------------------------------------------- aside */}
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold mb-3 text-sm">Live analysis</h2>
            <Progress
              value={Math.min(1, stats.wordCount / config.target)}
              label={`${stats.wordCount} / ${config.target} words`}
              tone={stats.wordCount >= config.target ? "success" : "brand"}
              className="mb-4"
            />
            <dl className="space-y-2 text-sm">
              {[
                { label: "Sentences", value: stats.sentenceCount },
                { label: "Mean sentence length", value: stats.avgSentenceLength },
                { label: "Reading ease", value: stats.fleschReadingEase, hint: "30-50 is typical for C1/C2 prose" },
                { label: "Grade level", value: stats.fleschKincaidGrade },
                { label: "Lexical variety", value: stats.typeTokenRatio, hint: "0.55+ signals good range" },
                { label: "Lexical density", value: stats.lexicalDensity, hint: "0.5+ is academic" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between gap-2">
                    <dt className="muted">{row.label}</dt>
                    {/* The readability formulas are undefined on an empty text
                        and return absurd values (ease 206.8, grade -15.6). */}
                    <dd className="tabular-nums font-medium">
                      {stats.wordCount === 0 ? <span className="muted">—</span> : row.value}
                    </dd>
                  </div>
                  {row.hint && <p className="text-[11px] muted mt-0.5">{row.hint}</p>}
                </div>
              ))}
            </dl>
            {stats.longSentences > 0 && (
              <p className="text-xs text-warning mt-3 text-pretty">
                {stats.longSentences} {stats.longSentences === 1 ? "sentence runs" : "sentences run"}{" "}
                past 35 words. Length is not complexity.
              </p>
            )}
          </Card>

          {submissions.length > 0 && (
            <Card>
              <h2 className="font-semibold mb-3 text-sm">Previous submissions</h2>
              <ul className="divide-y divide-[var(--border)]">
                {submissions.slice(0, 6).map((submission) => (
                  <li key={submission.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {submission.title || submission.genre.replace(/_/g, " ").toLowerCase()}
                        </div>
                        <div className="text-xs muted">
                          {submission.wordCount} words · {relativeTime(submission.createdAt)}
                        </div>
                      </div>
                      {submission.feedback && (
                        <Pill tone={submission.feedback.overallBand >= 7 ? "success" : "brand"}>
                          {submission.feedback.overallBand.toFixed(1)}
                        </Pill>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackView({
  report,
  text,
  onBack,
  onNew,
}: {
  report: Report;
  text: string;
  onBack: () => void;
  onNew: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const band = report.overallBand;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-[fade-up_0.3s_ease-out]">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm muted hover:text-[var(--text)] transition-colors mb-6"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to your draft
      </button>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="flex items-baseline gap-4 mb-4">
              <span
                className={cn(
                  "text-5xl font-semibold tabular-nums",
                  band >= 7.5 ? "text-success" : band >= 6.5 ? "text-brand-500" : "text-warning",
                )}
              >
                {band.toFixed(1)}
              </span>
              <div>
                <div className="text-sm font-medium">Indicative band</div>
                <div className="text-xs muted">IELTS-aligned, 0-9</div>
              </div>
            </div>

            <p className="text-sm leading-relaxed mb-5 text-pretty">{report.summary}</p>

            <div className="space-y-3">
              {Object.entries(report.criteria).map(([key, value]) => (
                <Progress
                  key={key}
                  value={value}
                  max={9}
                  label={CRITERION_LABEL[key] ?? key}
                  tone={value >= 7 ? "success" : value >= 6 ? "brand" : "warning"}
                />
              ))}
            </div>

            <p className="text-xs muted mt-4 text-pretty">
              {report.source === "model"
                ? "Assessed by a language model against band descriptors, grounded in the measured features of your text."
                : "Assessed by the built-in rules engine from measurable features. No rules engine can judge argument quality — treat this as a floor, not a verdict."}
            </p>
          </Card>

          {/* Annotated text */}
          <Card>
            <h2 className="font-semibold mb-3">Your text, annotated</h2>
            <div className="surface-sunken p-4 font-serif text-[15px] leading-[1.9] whitespace-pre-wrap">
              {annotate(text, report.annotations, selected, setSelected)}
            </div>
            <p className="text-xs muted mt-3">
              Click any highlighted span for the explanation.
            </p>
          </Card>

          {report.modelAnswer && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="size-4 text-brand-500" aria-hidden />
                <h2 className="font-semibold">One band higher</h2>
              </div>
              <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-pretty">
                {report.modelAnswer}
              </p>
              <p className="text-xs muted mt-3 text-pretty">
                A paragraph of yours rewritten at the next band. Compare it against your own —
                specifically, look at what got cut.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Check className="size-4 text-success" aria-hidden />
              <h2 className="font-semibold text-sm">What is working</h2>
            </div>
            <ul className="space-y-2.5">
              {report.strengths.map((strength, i) => (
                <li key={i} className="text-sm muted text-pretty leading-relaxed">
                  {strength}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="size-4 text-warning" aria-hidden />
              <h2 className="font-semibold text-sm">Priorities, in order</h2>
            </div>
            <ol className="space-y-3">
              {report.priorities.map((priority, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span className="size-5 rounded-full bg-warning/20 text-warning grid place-items-center text-xs font-semibold shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="muted text-pretty leading-relaxed">{priority}</span>
                </li>
              ))}
            </ol>
          </Card>

          {report.annotations.length > 0 && (
            <Card>
              <h2 className="font-semibold text-sm mb-3">
                {report.annotations.length} language {report.annotations.length === 1 ? "note" : "notes"}
              </h2>
              <ul className="space-y-3 max-h-96 overflow-y-auto">
                {report.annotations.map((annotation, i) => (
                  <li key={i}>
                    <button
                      onClick={() => setSelected(selected === i ? null : i)}
                      className={cn(
                        "w-full text-left text-sm p-2.5 rounded-lg border transition-colors",
                        selected === i
                          ? "border-brand-400 bg-brand-50 dark:bg-brand-950"
                          : "border-[var(--border)] hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      <Pill
                        tone={
                          annotation.severity === "major"
                            ? "danger"
                            : annotation.severity === "moderate"
                              ? "warning"
                              : "info"
                        }
                      >
                        {annotation.type}
                      </Pill>
                      <p className="mt-1.5">
                        <span className="line-through decoration-danger/60 muted">{annotation.original}</span>{" "}
                        <span aria-hidden>→</span>{" "}
                        <span className="font-medium text-success">{annotation.suggestion}</span>
                      </p>
                      {selected === i && annotation.explanation && (
                        <p className="text-xs muted mt-1.5 text-pretty">{annotation.explanation}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Button fullWidth size="lg" onClick={onNew}>
            Write something new
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Renders the learner's text with each annotated span highlighted in place. */
function annotate(
  text: string,
  annotations: Correction[],
  selected: number | null,
  onSelect: (index: number | null) => void,
) {
  const sorted = annotations
    .map((a, i) => ({ ...a, index: i }))
    .sort((a, b) => a.span[0] - b.span[0]);

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const annotation of sorted) {
    const [start, end] = annotation.span;
    // Overlapping spans would corrupt the output; the server de-duplicates, so
    // anything still overlapping here is skipped rather than rendered twice.
    if (start < cursor || end > text.length) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));

    const tone =
      annotation.severity === "major"
        ? "decoration-danger bg-danger/10"
        : annotation.severity === "moderate"
          ? "decoration-warning bg-warning/10"
          : "decoration-info bg-info/10";

    parts.push(
      <button
        key={annotation.index}
        onClick={() => onSelect(selected === annotation.index ? null : annotation.index)}
        className={cn(
          "underline decoration-wavy decoration-2 underline-offset-2 rounded px-0.5 transition-all",
          tone,
          selected === annotation.index && "ring-2 ring-brand-500",
        )}
        title={`${annotation.suggestion} — ${annotation.explanation}`}
      >
        {text.slice(start, end)}
      </button>,
    );
    cursor = end;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
