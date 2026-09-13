"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Briefcase, Check, GraduationCap, Globe, MessageCircle, Sparkles, Target } from "lucide-react";

import { Button, Card, ErrorMessage, Input, Select } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * Goal selection after placement. Kept to three short steps — every extra
 * onboarding question is a point at which someone closes the tab, and all of
 * these can be changed later in Settings.
 */

const GOALS = [
  { id: "ACADEMIC", label: "Academic study", icon: GraduationCap, blurb: "Essays, abstracts, critical reading, seminar discussion." },
  { id: "BUSINESS", label: "Professional work", icon: Briefcase, blurb: "Negotiation, diplomatic disagreement, reports, meetings." },
  { id: "EXAM", label: "Exam preparation", icon: Target, blurb: "IELTS, TOEFL, Cambridge C1 Advanced or C2 Proficiency." },
  { id: "EVERYDAY_FLUENCY", label: "Everyday fluency", icon: MessageCircle, blurb: "Idiom, phrasal verbs, sounding natural rather than correct." },
  { id: "CULTURE", label: "Cultural nuance", icon: Sparkles, blurb: "Irony, understatement, implicature, register." },
  { id: "TRAVEL", label: "Travel and relocation", icon: Globe, blurb: "Regional accents, practical registers, cultural norms." },
] as const;

const ACCENTS = [
  { id: "UK", label: "British (standard southern)" },
  { id: "US", label: "American (general)" },
  { id: "AU", label: "Australian" },
  { id: "CA", label: "Canadian" },
  { id: "IE", label: "Irish" },
  { id: "SCO", label: "Scottish" },
  { id: "IN", label: "Indian" },
  { id: "ZA", label: "South African" },
];

const DAILY_GOALS = [
  { xp: 30, label: "Casual", detail: "About 5 minutes" },
  { xp: 60, label: "Regular", detail: "About 12 minutes" },
  { xp: 100, label: "Serious", detail: "About 20 minutes" },
  { xp: 180, label: "Intensive", detail: "35 minutes or more" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<string[]>([]);
  const [targetExam, setTargetExam] = useState("");
  const [examDate, setExamDate] = useState("");
  const [accent, setAccent] = useState("UK");
  const [dailyGoalXp, setDailyGoalXp] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wantsExam = goals.includes("EXAM");
  const steps = wantsExam ? 3 : 2;

  function toggleGoal(id: string) {
    setGoals((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await api.patch("/api/me/profile", {
        goals,
        preferredAccent: accent,
        dailyGoalXp,
        ...(wantsExam && targetExam ? { targetExam } : {}),
        ...(wantsExam && examDate ? { examDate: new Date(examDate).toISOString() } : {}),
      });

      // Auto-enrol in the paths that match the chosen goals, so the dashboard
      // is populated rather than presenting an empty "choose a path" screen.
      const { tracks } = await api.get<{ tracks: { id: string; goal: string }[] }>("/api/tracks");
      const matching = tracks.filter((t) => goals.includes(t.goal));
      await Promise.all(
        (matching.length ? matching : tracks.slice(0, 1)).map((t) =>
          api.post(`/api/tracks/${t.id}/enroll`).catch(() => null),
        ),
      );

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save your preferences.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-14">
      <div className="flex gap-1.5 mb-8" aria-label={`Step ${step + 1} of ${steps}`}>
        {Array.from({ length: steps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step ? "bg-brand-500" : "bg-[var(--surface-sunken)]",
            )}
          />
        ))}
      </div>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      {/* ---------------------------------------------------------- goals */}
      {step === 0 && (
        <div className="animate-[fade-up_0.3s_ease-out]">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">What are you working towards?</h1>
          <p className="muted mb-7 text-pretty">
            Choose as many as apply. This decides which learning paths you are enrolled in and how
            your dashboard is ordered — you can change it whenever you like.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            {GOALS.map((goal) => {
              const Icon = goal.icon;
              const selected = goals.includes(goal.id);
              return (
                <button
                  key={goal.id}
                  onClick={() => toggleGoal(goal.id)}
                  aria-pressed={selected}
                  className={cn(
                    "text-left p-4 rounded-xl border-2 transition-all",
                    selected
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                      : "border-[var(--border)] hover:border-brand-300 hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Icon className={cn("size-5", selected ? "text-brand-500" : "muted")} aria-hidden />
                    {selected && (
                      <span className="size-5 rounded-full bg-brand-500 text-white grid place-items-center">
                        <Check className="size-3" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="font-medium text-sm mb-1">{goal.label}</div>
                  <div className="text-xs muted text-pretty">{goal.blurb}</div>
                </button>
              );
            })}
          </div>

          <Button size="lg" className="mt-7" onClick={() => setStep(1)} disabled={goals.length === 0}>
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------ exam detail */}
      {step === 1 && wantsExam && (
        <div className="animate-[fade-up_0.3s_ease-out]">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Which exam?</h1>
          <p className="muted mb-7 text-pretty">
            With a date set, the exam page becomes a countdown with pacing advice appropriate to how
            much time is left.
          </p>

          <Card className="space-y-4">
            <Select
              label="Exam"
              value={targetExam}
              onChange={(e) => setTargetExam(e.target.value)}
            >
              <option value="">Not decided yet</option>
              <option value="IELTS">IELTS Academic</option>
              <option value="TOEFL">TOEFL iBT</option>
              <option value="CAE">Cambridge C1 Advanced</option>
              <option value="CPE">Cambridge C2 Proficiency</option>
            </Select>

            <Input
              label="Exam date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              hint="Optional — you can add or change it later."
            />
          </Card>

          <div className="flex gap-3 mt-7">
            <Button variant="secondary" size="lg" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button size="lg" onClick={() => setStep(2)}>
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- accent + pacing */}
      {((step === 1 && !wantsExam) || step === 2) && (
        <div className="animate-[fade-up_0.3s_ease-out]">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">How do you want to study?</h1>
          <p className="muted mb-7 text-pretty">Two last things, both changeable in Settings.</p>

          <Card className="mb-5">
            <Select
              label="Preferred accent for listening and pronunciation"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              hint="Listening practice includes other accents regardless — exams test a spread, and so does real life."
            >
              {ACCENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Card>

          <Card className="mb-7">
            <p className="text-sm font-medium mb-3">Daily goal</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {DAILY_GOALS.map((goal) => (
                <button
                  key={goal.xp}
                  onClick={() => setDailyGoalXp(goal.xp)}
                  aria-pressed={dailyGoalXp === goal.xp}
                  className={cn(
                    "p-3 rounded-xl border-2 text-center transition-all",
                    dailyGoalXp === goal.xp
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                      : "border-[var(--border)] hover:border-brand-300",
                  )}
                >
                  <div className="text-sm font-medium">{goal.label}</div>
                  <div className="text-lg font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                    {goal.xp}
                    <span className="text-xs font-normal muted ml-0.5">XP</span>
                  </div>
                  <div className="text-[11px] muted mt-0.5">{goal.detail}</div>
                </button>
              ))}
            </div>
            <p className="text-xs muted mt-3 text-pretty">
              A goal you hit most days beats an ambitious one you miss. Streaks reward consistency,
              not volume.
            </p>
          </Card>

          <div className="flex gap-3">
            <Button variant="secondary" size="lg" onClick={() => setStep(wantsExam ? 1 : 0)}>
              Back
            </Button>
            <Button size="lg" onClick={finish} loading={busy}>
              Start learning
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
