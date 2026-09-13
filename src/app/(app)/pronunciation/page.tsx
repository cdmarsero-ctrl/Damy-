"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Mic, RotateCcw, Shuffle, Volume2 } from "lucide-react";

import { Button, Card, EmptyState, ErrorMessage, Pill, Progress, Select, Stat, Textarea } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { ACCENT_LOCALE, useSpeechRecognition, useSpeechSynthesis } from "@/hooks/use-speech";
import { cn, relativeTime } from "@/lib/utils";

/**
 * Pronunciation lab.
 *
 * The browser transcribes locally; we send text, never audio. That is stated
 * on the page because "we record your voice" is a thing people reasonably want
 * to know about a language app.
 */

interface WordScore {
  word: string;
  score: number;
  status: "match" | "missing" | "extra" | "near";
  issue?: string;
}

interface Score {
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number;
  overall: number;
  wordScores: WordScore[];
  tips: string[];
}

interface Attempt {
  id: string;
  targetText: string;
  overall: number;
  createdAt: string;
}

/** Drills chosen for the features that most affect intelligibility: consonant
 *  clusters, weak forms, schwa reduction, stress shift and connected speech. */
const DRILLS: { level: string; text: string; focus: string }[] = [
  { level: "B2", text: "The sixth sick sheikh's sixth sheep is sick.", focus: "/s/ and /ʃ/ contrast, final clusters" },
  { level: "B2", text: "I would have told you if I had known about it earlier.", focus: "Weak forms: would have → /wʊdəv/" },
  { level: "B2", text: "She thought the thorough analysis was worth the three months it took.", focus: "/θ/ in stressed and unstressed positions" },
  { level: "C1", text: "The texts he sent last month contained several inconsistencies.", focus: "The /ksts/ cluster — the hardest in English" },
  { level: "C1", text: "Comfortable, vegetable and temperature are shorter than they look.", focus: "Syllable compression to schwa" },
  { level: "C1", text: "A photograph, photography, and photographic evidence.", focus: "Stress shift across the derivational family" },
  { level: "C1", text: "Not only did she meet the deadline, but she also came in under budget.", focus: "Inversion with natural intonation" },
  { level: "C2", text: "Notwithstanding these limitations, the study represents a considerable advance on earlier work.", focus: "Sustained rhythm in a long formal clause" },
  { level: "C2", text: "I didn't say she stole the money — I said she took it.", focus: "Contrastive stress carrying the meaning" },
  { level: "C2", text: "The world's strengths lie in the breadths of its differences.", focus: "Consecutive three-consonant clusters" },
];

const ACCENTS = [
  { id: "UK", label: "British (southern)" },
  { id: "US", label: "American (general)" },
  { id: "AU", label: "Australian" },
  { id: "CA", label: "Canadian" },
  { id: "IE", label: "Irish" },
  { id: "IN", label: "Indian" },
  { id: "ZA", label: "South African" },
];

export default function PronunciationPage() {
  const [target, setTarget] = useState(DRILLS[0].text);
  const [accent, setAccent] = useState("UK");
  const [score, setScore] = useState<Score | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeechRecognition(ACCENT_LOCALE[accent]);
  const tts = useSpeechSynthesis();

  useEffect(() => {
    void loadHistory();
  }, []);

  // Scoring fires as soon as recognition produces a final transcript.
  useEffect(() => {
    if (speech.finalTranscript && !speech.listening) {
      void submit(speech.finalTranscript, speech.durationMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.finalTranscript, speech.listening]);

  async function loadHistory() {
    try {
      const data = await api.get<{ attempts: Attempt[] }>("/api/speech/pronunciation");
      setAttempts(data.attempts);
    } catch {
      /* supplementary */
    }
  }

  async function submit(transcript: string, durationMs: number) {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ result: Score }>("/api/speech/pronunciation", {
        targetText: target,
        transcript,
        durationMs: Math.max(durationMs, 500),
        accent,
      });
      setScore(data.result);
      void loadHistory();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not score that attempt.");
    } finally {
      setBusy(false);
      speech.reset();
    }
  }

  function randomDrill() {
    const next = DRILLS[Math.floor(Math.random() * DRILLS.length)];
    setTarget(next.text);
    setScore(null);
    speech.reset();
  }

  const currentDrill = DRILLS.find((d) => d.text === target);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <Mic className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Pronunciation lab</h1>
        </div>
        <p className="muted text-pretty">
          Read a sentence aloud and get scored on accuracy, fluency, completeness and rhythm.
          Your audio is transcribed in the browser and never uploaded — only the resulting text
          reaches our server.
        </p>
      </header>

      {!speech.supported && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <div className="flex gap-3">
            <AlertCircle className="size-5 text-warning shrink-0" aria-hidden />
            <div>
              <h2 className="font-semibold text-sm mb-1">Speech recognition unavailable</h2>
              <p className="text-sm muted text-pretty">
                This browser does not expose the Web Speech API. Chrome, Edge and Safari support it;
                Firefox does not. You can still use the listen-and-repeat drills below.
              </p>
            </div>
          </div>
        </Card>
      )}

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="font-semibold">Say this</h2>
              <div className="flex items-center gap-2">
                {currentDrill && <Pill tone="brand">{currentDrill.level}</Pill>}
                <Button variant="ghost" size="sm" onClick={randomDrill}>
                  <Shuffle className="size-3.5" aria-hidden />
                  Another
                </Button>
              </div>
            </div>

            <Textarea
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setScore(null);
              }}
              rows={2}
              className="font-serif text-lg leading-relaxed"
              aria-label="Text to pronounce"
            />

            {currentDrill && (
              <p className="text-xs muted mt-2">
                <span className="font-medium">Focus:</span> {currentDrill.focus}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-4">
              {tts.supported && (
                <Button
                  variant="secondary"
                  onClick={() => tts.speak(target, { locale: ACCENT_LOCALE[accent] })}
                >
                  <Volume2 className={cn("size-4", tts.speaking && "text-brand-500")} aria-hidden />
                  Hear a model
                </Button>
              )}
              <div className="w-48">
                <Select value={accent} onChange={(e) => setAccent(e.target.value)} aria-label="Accent">
                  {ACCENTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          {/* Recorder */}
          <Card>
            <div className="text-center py-6">
              <button
                onClick={() => (speech.listening ? speech.stop() : speech.start(ACCENT_LOCALE[accent]))}
                disabled={!speech.supported || busy}
                className={cn(
                  "size-20 rounded-full grid place-items-center mx-auto transition-all disabled:opacity-40",
                  speech.listening
                    ? "bg-danger text-white scale-110 shadow-xl shadow-danger/30"
                    : "bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-600/25",
                )}
                aria-label={speech.listening ? "Stop recording" : "Start recording"}
              >
                {busy ? (
                  <Loader2 className="size-8 animate-spin" aria-hidden />
                ) : (
                  <Mic className="size-8" aria-hidden />
                )}
              </button>

              <p className="text-sm muted mt-4" aria-live="polite">
                {busy
                  ? "Scoring…"
                  : speech.listening
                    ? "Listening — read the sentence at a natural pace"
                    : "Tap and read the sentence aloud"}
              </p>

              {speech.interimTranscript && (
                <p className="text-sm italic muted mt-2">{speech.interimTranscript}</p>
              )}
              {speech.error && <p className="text-sm text-danger mt-2">{speech.error}</p>}
            </div>
          </Card>

          {/* Score */}
          {score && (
            <Card className="animate-[fade-up_0.3s_ease-out]">
              <div className="flex items-baseline gap-4 mb-5">
                <span
                  className={cn(
                    "text-5xl font-semibold tabular-nums",
                    score.overall >= 85 ? "text-success" : score.overall >= 70 ? "text-brand-500" : "text-warning",
                  )}
                >
                  {Math.round(score.overall)}
                </span>
                <div>
                  <div className="text-sm font-medium">Overall</div>
                  <div className="text-xs muted">out of 100</div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                {[
                  { label: "Accuracy", value: score.accuracy, hint: "Did the words come across" },
                  { label: "Completeness", value: score.completeness, hint: "How much you attempted" },
                  { label: "Fluency", value: score.fluency, hint: "Pace against a native band" },
                  { label: "Rhythm", value: score.prosody, hint: "Stress placement proxy" },
                ].map((metric) => (
                  <div key={metric.label}>
                    <Progress
                      value={metric.value}
                      max={100}
                      label={metric.label}
                      showValue
                      tone={metric.value >= 85 ? "success" : metric.value >= 70 ? "brand" : "warning"}
                    />
                    <p className="text-[11px] muted mt-1">{metric.hint}</p>
                  </div>
                ))}
              </div>

              <h3 className="font-semibold text-sm mb-2">Word by word</h3>
              <p className="flex flex-wrap gap-1.5 mb-5">
                {score.wordScores.map((word, i) => (
                  <span
                    key={i}
                    title={word.issue}
                    className={cn(
                      "px-2 py-1 rounded-md text-sm",
                      word.status === "match" && "bg-success/15 text-success",
                      word.status === "near" && "bg-warning/15 text-warning",
                      word.status === "missing" && "bg-danger/15 text-danger line-through",
                      word.status === "extra" && "bg-[var(--surface-sunken)] muted italic",
                    )}
                  >
                    {word.word}
                  </span>
                ))}
              </p>
              <p className="text-xs muted mb-5">
                Green came through clearly · amber was recognised imperfectly · red was not
                recognised · grey was not in the target.
              </p>

              {score.tips.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <h3 className="font-semibold text-sm mb-2.5">What to work on</h3>
                  <ul className="space-y-2.5">
                    {score.tips.map((tip, i) => (
                      <li key={i} className="text-sm muted leading-relaxed text-pretty flex gap-2">
                        <span className="text-brand-500 shrink-0" aria-hidden>
                          ·
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                variant="secondary"
                className="mt-5"
                onClick={() => {
                  setScore(null);
                  speech.reset();
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                Try again
              </Button>
            </Card>
          )}
        </div>

        {/* ----------------------------------------------------------- aside */}
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold text-sm mb-3">Drills</h2>
            <ul className="space-y-1.5">
              {DRILLS.map((drill) => (
                <li key={drill.text}>
                  <button
                    onClick={() => {
                      setTarget(drill.text);
                      setScore(null);
                      speech.reset();
                    }}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border text-xs transition-colors",
                      target === drill.text
                        ? "border-brand-400 bg-brand-50 dark:bg-brand-950"
                        : "border-[var(--border)] hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Pill>{drill.level}</Pill>
                    </div>
                    <div className="font-medium text-pretty leading-relaxed">{drill.text}</div>
                    <div className="muted mt-1 text-pretty">{drill.focus}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="font-semibold text-sm mb-3">Recent attempts</h2>
            {attempts.length === 0 ? (
              <EmptyState title="Nothing yet" description="Your scored attempts appear here." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {attempts.slice(0, 8).map((attempt) => (
                  <li key={attempt.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs truncate">{attempt.targetText}</div>
                        <div className="text-[11px] muted">{relativeTime(attempt.createdAt)}</div>
                      </div>
                      <Pill tone={attempt.overall >= 85 ? "success" : attempt.overall >= 70 ? "brand" : "warning"}>
                        {Math.round(attempt.overall)}
                      </Pill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {attempts.length >= 3 && (
            <Stat
              label="Average score"
              value={Math.round(attempts.reduce((sum, a) => sum + a.overall, 0) / attempts.length)}
              sub={`across ${attempts.length} attempts`}
              tone="brand"
            />
          )}
        </div>
      </div>
    </div>
  );
}
