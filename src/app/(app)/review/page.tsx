"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight, Check, Eye, Loader2, Repeat, Volume2, Zap,
} from "lucide-react";

import { Button, Card, EmptyState, ErrorMessage, LevelPill, Pill, Progress, Stat } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { useSpeechSynthesis } from "@/hooks/use-speech";
import { cn, pluralise } from "@/lib/utils";
import type { Cefr, CardState, Connotation, LexicalType, Register, ReviewRating } from "@prisma/client";

interface LexicalItem {
  id: string;
  headword: string;
  type: LexicalType;
  cefr: Cefr;
  pos: string | null;
  ipa: string | null;
  definition: string;
  register: Register;
  connotation: Connotation;
  domain: string | null;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  examples: { text: string; note?: string }[];
  usageNote: string | null;
}

interface QueueCard {
  id: string;
  state: CardState;
  repetitions: number;
  lapses: number;
  retention: number;
  item: LexicalItem;
  intervals: { rating: ReviewRating; label: string }[];
}

const RATING_CONFIG: { rating: ReviewRating; label: string; hint: string; key: string; className: string }[] = [
  { rating: "AGAIN", label: "Again", hint: "No recall", key: "1", className: "bg-danger text-white hover:opacity-90" },
  { rating: "HARD", label: "Hard", hint: "Recalled with effort", key: "2", className: "bg-warning text-white hover:opacity-90" },
  { rating: "GOOD", label: "Good", hint: "Recalled correctly", key: "3", className: "bg-brand-600 text-white hover:bg-brand-700" },
  { rating: "EASY", label: "Easy", hint: "Instant, effortless", key: "4", className: "bg-success text-white hover:opacity-90" },
];

const REGISTER_TONE: Record<Register, "neutral" | "brand" | "warning" | "info" | "danger"> = {
  SLANG: "danger",
  INFORMAL: "warning",
  NEUTRAL: "neutral",
  FORMAL: "info",
  ACADEMIC: "brand",
  LITERARY: "brand",
};

export default function ReviewPage() {
  const [cards, setCards] = useState<QueueCard[]>([]);
  const [counts, setCounts] = useState({ due: 0, new: 0, total: 0 });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState({ graded: 0, again: 0, xp: 0, mastered: 0 });
  const [lastInterval, setLastInterval] = useState<string | null>(null);

  const tts = useSpeechSynthesis();
  const shownAt = useRef(Date.now());
  const card = cards[index];

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ cards: QueueCard[]; counts: typeof counts }>(
        "/api/reviews/queue?limit=30",
      );
      setCards(data.cards);
      setCounts(data.counts);
      setIndex(0);
      setRevealed(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load your review queue.");
    } finally {
      setLoading(false);
    }
  }

  const grade = useCallback(
    async (rating: ReviewRating) => {
      if (!card || grading) return;
      setGrading(true);
      setError(null);

      try {
        const data = await api.post<{
          interval: string;
          mastered: boolean;
          rewards: { xpAwarded: number };
        }>("/api/reviews/grade", {
          cardId: card.id,
          rating,
          durationMs: Date.now() - shownAt.current,
        });

        setSession((s) => ({
          graded: s.graded + 1,
          again: s.again + (rating === "AGAIN" ? 1 : 0),
          xp: s.xp + data.rewards.xpAwarded,
          mastered: s.mastered + (data.mastered ? 1 : 0),
        }));
        setLastInterval(data.interval);

        // A forgotten card goes to the back of this session's queue rather than
        // disappearing until tomorrow — seeing it again in the same sitting is
        // what relearning steps are for.
        if (rating === "AGAIN") {
          setCards((current) => {
            const rest = current.filter((_, i) => i !== index);
            const failed = current[index];
            const insertAt = Math.min(rest.length, index + 4);
            return [...rest.slice(0, insertAt), failed, ...rest.slice(insertAt)];
          });
          setRevealed(false);
          return;
        }

        setCards((current) => current.filter((_, i) => i !== index));
        setRevealed(false);
        // Removing the current card shifts the next one into this index, so the
        // index only needs clamping, not incrementing.
        setIndex((i) => Math.min(i, Math.max(0, cards.length - 2)));
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Could not save that grade.");
      } finally {
        setGrading(false);
      }
    },
    [card, grading, index, cards.length],
  );

  // Space reveals, 1-4 grade. The keyboard flow is the whole point of an SRS
  // session — a learner grading 60 cards should never touch the mouse.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!card) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        else void grade("GOOD");
        return;
      }
      if (!revealed) return;
      const match = RATING_CONFIG.find((r) => r.key === event.key);
      if (match) {
        event.preventDefault();
        void grade(match.rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, grade]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 grid place-items-center">
        <Loader2 className="size-6 animate-spin muted" aria-label="Loading your review queue" />
      </div>
    );
  }

  /* ----------------------------------------------------- session complete */
  if (!card) {
    const accuracy = session.graded > 0 ? 1 - session.again / session.graded : null;

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
        {session.graded > 0 ? (
          <div className="animate-[fade-up_0.4s_ease-out]">
            <div className="size-16 rounded-2xl bg-success text-white grid place-items-center mb-6">
              <Check className="size-8" aria-hidden />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Queue cleared</h1>
            <p className="muted mb-8 text-pretty">
              {accuracy !== null && accuracy >= 0.9
                ? "Recall above 90% — your intervals are well calibrated. You could afford to take on more new words."
                : accuracy !== null && accuracy < 0.75
                  ? "Recall below 75%. That usually means too many new cards at once rather than a memory problem — try pausing new words for a few days."
                  : "A healthy session. Come back when the next batch falls due."}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <Stat label="Graded" value={session.graded} />
              <Stat
                label="Recall"
                value={accuracy !== null ? `${Math.round(accuracy * 100)}%` : "—"}
                tone={accuracy !== null && accuracy >= 0.85 ? "success" : "warning"}
              />
              <Stat label="Mastered" value={session.mastered} tone="info" />
              <Stat label="XP" value={session.xp} tone="brand" icon={<Zap className="size-4" />} />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={load}>
                <Repeat className="size-4" aria-hidden />
                Load more cards
              </Button>
              <Link
                href="/dashboard"
                className="h-12 px-6 inline-flex items-center rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={<Repeat className="size-10 mx-auto" />}
              title="Nothing due right now"
              description={
                counts.total === 0
                  ? "Your queue is empty. Cards are added when you get a vocabulary exercise right, or you can add words directly from the lexicon."
                  : `You have ${counts.total} ${pluralise(counts.total, "card")} in total — none of them are due yet. Spacing is the point; reviewing early is wasted effort.`
              }
              action={
                <Link
                  href={counts.total === 0 ? "/lexicon" : "/path"}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                >
                  {counts.total === 0 ? "Browse the lexicon" : "Continue a lesson"}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              }
            />
          </Card>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- card */
  const item = card.item;
  const total = cards.length + session.graded;
  const isNew = card.state === "NEW";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-2 text-sm">
        <span className="font-medium">Review</span>
        <span className="muted tabular-nums">
          {cards.length} {pluralise(cards.length, "card")} left
        </span>
      </div>
      <Progress value={session.graded} max={Math.max(1, total)} className="mb-6" />

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      <Card className="min-h-[22rem] flex flex-col">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <LevelPill level={item.cefr} />
          <Pill>{item.type.replace(/_/g, " ").toLowerCase()}</Pill>
          <Pill tone={REGISTER_TONE[item.register]}>{item.register.toLowerCase()}</Pill>
          {item.connotation !== "NEUTRAL" && (
            <Pill tone={item.connotation === "POSITIVE" ? "success" : item.connotation === "NEGATIVE" ? "danger" : "warning"}>
              {item.connotation.toLowerCase()}
            </Pill>
          )}
          {isNew && <Pill tone="brand">new</Pill>}
          {card.lapses > 2 && <Pill tone="warning">leech · {card.lapses} lapses</Pill>}
        </div>

        {/* Front */}
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-1">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">{item.headword}</h1>
            {tts.supported && (
              <button
                onClick={() => tts.speak(item.headword)}
                className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors shrink-0 mt-1"
                aria-label={`Hear "${item.headword}" pronounced`}
              >
                <Volume2 className={cn("size-4", tts.speaking ? "text-brand-500" : "muted")} aria-hidden />
              </button>
            )}
          </div>
          {(item.ipa || item.pos) && (
            <p className="muted text-sm font-mono mb-6">
              {item.ipa} {item.pos && <span className="font-sans italic">· {item.pos}</span>}
            </p>
          )}

          {!revealed ? (
            <div className="py-10 text-center">
              <p className="muted text-sm mb-5 text-pretty">
                {isNew
                  ? "A new item. Read it, guess at the meaning, then reveal."
                  : "Recall the meaning, register and a natural collocation before revealing."}
              </p>
              <Button size="lg" onClick={() => setRevealed(true)}>
                <Eye className="size-4" aria-hidden />
                Reveal
              </Button>
            </div>
          ) : (
            <div className="space-y-5 animate-[fade-up_0.25s_ease-out]">
              <p className="text-lg leading-relaxed text-pretty">{item.definition}</p>

              {item.examples.length > 0 && (
                <div className="space-y-2.5">
                  {item.examples.map((example, i) => (
                    <div key={i} className="surface-sunken p-3.5">
                      <p className="text-sm font-serif leading-relaxed">
                        {example.text}
                        {tts.supported && (
                          <button
                            onClick={() => tts.speak(example.text)}
                            className="ml-2 align-middle muted hover:text-brand-500 transition-colors"
                            aria-label="Hear this example"
                          >
                            <Volume2 className="size-3.5 inline" aria-hidden />
                          </button>
                        )}
                      </p>
                      {example.note && <p className="text-xs muted mt-1.5">{example.note}</p>}
                    </div>
                  ))}
                </div>
              )}

              <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                {item.collocations.length > 0 && (
                  <div>
                    <dt className="text-xs font-semibold muted uppercase tracking-wide mb-1">Collocations</dt>
                    <dd className="text-pretty">{item.collocations.join(" · ")}</dd>
                  </div>
                )}
                {item.synonyms.length > 0 && (
                  <div>
                    <dt className="text-xs font-semibold muted uppercase tracking-wide mb-1">Near synonyms</dt>
                    <dd className="text-pretty">{item.synonyms.join(", ")}</dd>
                  </div>
                )}
                {item.antonyms.length > 0 && (
                  <div>
                    <dt className="text-xs font-semibold muted uppercase tracking-wide mb-1">Opposites</dt>
                    <dd className="text-pretty">{item.antonyms.join(", ")}</dd>
                  </div>
                )}
                {item.domain && (
                  <div>
                    <dt className="text-xs font-semibold muted uppercase tracking-wide mb-1">Domain</dt>
                    <dd>{item.domain}</dd>
                  </div>
                )}
              </dl>

              {item.usageNote && (
                <div className="border-l-2 border-brand-400 pl-3.5">
                  <p className="text-xs font-semibold muted uppercase tracking-wide mb-1">Usage</p>
                  <p className="text-sm leading-relaxed text-pretty">{item.usageNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Grading */}
      {revealed && (
        <div className="mt-5 animate-[fade-up_0.2s_ease-out]">
          <p className="text-sm muted mb-2.5">How well did you recall it?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {RATING_CONFIG.map((config) => {
              const interval = card.intervals.find((i) => i.rating === config.rating);
              return (
                <button
                  key={config.rating}
                  onClick={() => grade(config.rating)}
                  disabled={grading}
                  className={cn(
                    "p-3 rounded-xl font-medium transition-all active:scale-[0.98] disabled:opacity-60",
                    config.className,
                  )}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {config.label}
                    <kbd className="text-[10px] opacity-70 font-mono">{config.key}</kbd>
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">{config.hint}</div>
                  {interval && (
                    <div className="text-xs font-semibold mt-1 tabular-nums">{interval.label}</div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs muted mt-3 text-pretty">
            The interval under each button is when the card will next appear. Grading honestly is
            what makes the scheduling work — marking a guess as &ldquo;Good&rdquo; only moves the
            problem further out.
          </p>
        </div>
      )}

      {!revealed && (
        <p className="hidden sm:block text-xs muted mt-4 text-center">
          <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono text-[11px]">Space</kbd>{" "}
          to reveal ·{" "}
          <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono text-[11px]">1</kbd>–
          <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono text-[11px]">4</kbd>{" "}
          to grade
        </p>
      )}

      {session.graded > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          <Pill>{session.graded} graded this session</Pill>
          <Pill tone="brand">
            <Zap className="size-3" aria-hidden />
            {session.xp} XP
          </Pill>
          {lastInterval && <Pill tone="info">last card: next in {lastInterval}</Pill>}
        </div>
      )}
    </div>
  );
}
