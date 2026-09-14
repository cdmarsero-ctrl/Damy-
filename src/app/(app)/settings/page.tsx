"use client";

import { useEffect, useState } from "react";
import { Accessibility, Check, Loader2, Settings as SettingsIcon, Target, User } from "lucide-react";

import { Button, Card, CardHeader, ErrorMessage, Input, Pill, Select } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * Settings.
 *
 * Accessibility preferences are written to BOTH localStorage (so the blocking
 * theme script in <head> can apply them before first paint) and the database
 * (so they follow the learner to another device). The two are reconciled on
 * load with the server as the source of truth.
 */

interface Me {
  user: { name: string; email: string };
  profile: {
    goals: string[];
    targetExam: string | null;
    examDate: string | null;
    nativeLanguage: string | null;
    preferredAccent: string;
    dailyGoalXp: number;
    cefrLevel: string;
  } | null;
  settings: {
    theme: string;
    reducedMotion: boolean;
    highContrast: boolean;
    fontScale: number;
    captionsDefaultOn: boolean;
    speechRate: number;
    emailDigest: boolean;
    pushReminders: boolean;
    reminderHour: number;
    offlineEnabled: boolean;
  } | null;
  capabilities: { liveAI: boolean };
}

const GOALS = [
  { id: "ACADEMIC", label: "Academic study" },
  { id: "BUSINESS", label: "Professional work" },
  { id: "EXAM", label: "Exam preparation" },
  { id: "EVERYDAY_FLUENCY", label: "Everyday fluency" },
  { id: "CULTURE", label: "Cultural nuance" },
  { id: "TRAVEL", label: "Travel and relocation" },
];

const ACCENTS = [
  { id: "UK", label: "British (southern)" },
  { id: "US", label: "American (general)" },
  { id: "AU", label: "Australian" },
  { id: "CA", label: "Canadian" },
  { id: "IE", label: "Irish" },
  { id: "SCO", label: "Scottish" },
  { id: "IN", label: "Indian" },
  { id: "ZA", label: "South African" },
];

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile
  const [name, setName] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [targetExam, setTargetExam] = useState("");
  const [examDate, setExamDate] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("");
  const [accent, setAccent] = useState("UK");
  const [dailyGoalXp, setDailyGoalXp] = useState(60);

  // Accessibility
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const [captions, setCaptions] = useState(true);
  const [offline, setOffline] = useState(true);
  const [reminderHour, setReminderHour] = useState(19);
  const [emailDigest, setEmailDigest] = useState(true);

  useEffect(() => {
    api
      .get<Me>("/api/me")
      .then((data) => {
        setMe(data);
        setName(data.user.name);
        if (data.profile) {
          setGoals(data.profile.goals);
          setTargetExam(data.profile.targetExam ?? "");
          setExamDate(data.profile.examDate ? data.profile.examDate.slice(0, 10) : "");
          setNativeLanguage(data.profile.nativeLanguage ?? "");
          setAccent(data.profile.preferredAccent);
          setDailyGoalXp(data.profile.dailyGoalXp);
        }
        if (data.settings) {
          setFontScale(data.settings.fontScale);
          setHighContrast(data.settings.highContrast);
          setReducedMotion(data.settings.reducedMotion);
          setSpeechRate(data.settings.speechRate);
          setCaptions(data.settings.captionsDefaultOn);
          setOffline(data.settings.offlineEnabled);
          setReminderHour(data.settings.reminderHour);
          setEmailDigest(data.settings.emailDigest);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : "Could not load your settings."),
      )
      .finally(() => setLoading(false));
  }, []);

  /** Applies an accessibility preference locally the instant it changes, then
   *  persists it. Waiting for the round trip makes the control feel broken. */
  function applyLocally(key: string, value: string) {
    localStorage.setItem(key, value);
    if (key === "lx-font-scale") document.documentElement.style.setProperty("--font-scale", value);
    if (key === "lx-contrast") document.documentElement.classList.toggle("contrast-high", value === "high");
    if (key === "lx-motion") document.documentElement.classList.toggle("motion-reduced", value === "reduced");
  }

  async function save(section: "profile" | "settings", body: Record<string, unknown>) {
    setSaving(section);
    setError(null);
    try {
      await api.patch(`/api/me/${section}`, body);
      setSaved(section);
      setTimeout(() => setSaved(null), 2500);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save your changes.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="py-24 grid place-items-center">
        <Loader2 className="size-6 animate-spin muted" aria-label="Loading settings" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <header className="mb-2">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <SettingsIcon className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </div>
      </header>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {/* ----------------------------------------------------------- account */}
      <Card>
        <CardHeader title="Account" icon={<User className="size-5" />} />
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" value={me?.user.email ?? ""} disabled hint="Contact support to change your email address." />
          <Input
            label="First language"
            value={nativeLanguage}
            onChange={(e) => setNativeLanguage(e.target.value)}
            placeholder="Optional"
            hint="Used to flag the interference errors most common for speakers of your language."
          />
        </div>
      </Card>

      {/* ------------------------------------------------------------- goals */}
      <Card>
        <CardHeader
          title="Goals and pacing"
          description="These decide which paths are recommended and how your dashboard is ordered."
          icon={<Target className="size-5" />}
          action={
            <Button
              size="sm"
              loading={saving === "profile"}
              onClick={() =>
                save("profile", {
                  name,
                  goals,
                  nativeLanguage: nativeLanguage || null,
                  preferredAccent: accent,
                  dailyGoalXp,
                  targetExam: targetExam || null,
                  examDate: examDate ? new Date(examDate).toISOString() : null,
                })
              }
            >
              {saved === "profile" ? <Check className="size-3.5" aria-hidden /> : null}
              {saved === "profile" ? "Saved" : "Save"}
            </Button>
          }
        />

        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium mb-2">What you are working towards</p>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((goal) => {
                const selected = goals.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    onClick={() =>
                      setGoals((current) =>
                        current.includes(goal.id)
                          ? current.filter((g) => g !== goal.id)
                          : [...current, goal.id],
                      )
                    }
                    aria-pressed={selected}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors",
                      selected
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300"
                        : "border-[var(--border)] muted hover:border-brand-300",
                    )}
                  >
                    {goal.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Select label="Target exam" value={targetExam} onChange={(e) => setTargetExam(e.target.value)}>
              <option value="">None</option>
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
              hint="Turns the exam page into a countdown with pacing advice."
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Select label="Preferred accent" value={accent} onChange={(e) => setAccent(e.target.value)}>
              {ACCENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
            <Input
              label="Daily XP goal"
              type="number"
              min={10}
              max={500}
              step={10}
              value={dailyGoalXp}
              onChange={(e) => setDailyGoalXp(Number(e.target.value))}
              hint="A goal you hit most days beats an ambitious one you miss."
            />
          </div>
        </div>
      </Card>

      {/* --------------------------------------------------- accessibility */}
      <Card>
        <CardHeader
          title="Accessibility and display"
          description="Applied instantly and synced across your devices."
          icon={<Accessibility className="size-5" />}
          action={
            <Button
              size="sm"
              loading={saving === "settings"}
              onClick={() =>
                save("settings", {
                  fontScale,
                  highContrast,
                  reducedMotion,
                  speechRate,
                  captionsDefaultOn: captions,
                  offlineEnabled: offline,
                  reminderHour,
                  emailDigest,
                })
              }
            >
              {saved === "settings" ? <Check className="size-3.5" aria-hidden /> : null}
              {saved === "settings" ? "Saved" : "Save"}
            </Button>
          }
        />

        <div className="space-y-5">
          <div>
            <label htmlFor="font-scale" className="block text-sm font-medium mb-1.5">
              Text size — {Math.round(fontScale * 100)}%
            </label>
            <input
              id="font-scale"
              type="range"
              min={0.85}
              max={1.5}
              step={0.05}
              value={fontScale}
              onChange={(e) => {
                const value = Number(e.target.value);
                setFontScale(value);
                applyLocally("lx-font-scale", String(value));
              }}
              className="w-full accent-[var(--color-brand-500)]"
            />
            <p className="text-xs muted mt-1">
              Scales the whole interface proportionally. Browser zoom also works and is not disabled.
            </p>
          </div>

          <div>
            <label htmlFor="speech-rate" className="block text-sm font-medium mb-1.5">
              Speech playback rate — {speechRate.toFixed(2)}×
            </label>
            <input
              id="speech-rate"
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={speechRate}
              onChange={(e) => setSpeechRate(Number(e.target.value))}
              className="w-full accent-[var(--color-brand-500)]"
            />
            <p className="text-xs muted mt-1">
              Applies to the read-aloud buttons. Native-speed listening practice is deliberately not
              slowed — that is the skill being trained.
            </p>
          </div>

          <Toggle
            label="High contrast"
            description="Stronger borders and text contrast, meeting WCAG AAA for body text."
            checked={highContrast}
            onChange={(value) => {
              setHighContrast(value);
              applyLocally("lx-contrast", value ? "high" : "normal");
            }}
          />

          <Toggle
            label="Reduce motion"
            description="Disables animations and transitions. Your operating system setting is already respected; this overrides it in either direction."
            checked={reducedMotion}
            onChange={(value) => {
              setReducedMotion(value);
              applyLocally("lx-motion", value ? "reduced" : "normal");
            }}
          />

          <Toggle
            label="Captions on by default"
            description="Shows transcripts alongside listening exercises without having to reveal them."
            checked={captions}
            onChange={setCaptions}
          />

          <Toggle
            label="Offline study"
            description="Caches your review queue and upcoming lessons so you can study without a connection. Work is replayed when you reconnect, scheduled from when you actually studied."
            checked={offline}
            onChange={setOffline}
          />

          <Toggle
            label="Weekly email digest"
            description="Your report and what to work on next, once a week."
            checked={emailDigest}
            onChange={setEmailDigest}
          />

          <div className="max-w-xs">
            <Input
              label="Daily reminder hour"
              type="number"
              min={0}
              max={23}
              value={reminderHour}
              onChange={(e) => setReminderHour(Number(e.target.value))}
              hint="24-hour clock, in your local time."
            />
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------- about */}
      <Card>
        <CardHeader title="About this installation" />
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="muted">Your level</dt>
            <dd>
              <Pill tone="brand">{me?.profile?.cefrLevel ?? "—"}</Pill>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">AI provider</dt>
            <dd>
              {me?.capabilities.liveAI ? (
                <Pill tone="success">connected</Pill>
              ) : (
                <Pill tone="warning">rules engine only</Pill>
              )}
            </dd>
          </div>
        </dl>
        {!me?.capabilities.liveAI && (
          <p className="text-xs muted mt-3 text-pretty">
            No model provider is configured. Conversation, debate and writing feedback fall back to
            the built-in rules engine — corrections are still real, but the dialogue is more
            scripted and the band estimates are feature-based rather than judged. Set{" "}
            <code className="font-mono">OPENAI_API_KEY</code> in your environment to enable the full
            experience.
          </p>
        )}
      </Card>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs muted text-pretty">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5",
          checked ? "bg-brand-600" : "bg-[var(--surface-sunken)] border border-[var(--border)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}
