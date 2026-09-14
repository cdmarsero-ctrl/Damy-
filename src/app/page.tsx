import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3, BookOpen, Brain, GraduationCap, Mic, PenLine, Repeat, Swords, Target,
} from "lucide-react";

import { ThemeScript } from "@/components/layout/theme-script";
import { getClaims } from "@/lib/session";

/**
 * Landing page. Signed-in visitors are redirected straight to the dashboard —
 * a marketing page is not what someone who already pays for the product wants.
 */
export default async function LandingPage() {
  const claims = await getClaims();
  if (claims) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <ThemeScript />

      <header className="sticky top-0 z-40 h-16 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur">
        <div className="max-w-6xl mx-auto h-full px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <span className="size-8 rounded-lg bg-brand-600 text-white grid place-items-center text-sm font-bold">
              Lx
            </span>
            Lexicon
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg font-medium muted hover:text-[var(--text)] transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-lg font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------ Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 sm:pt-28">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-brand-600 dark:text-brand-400 mb-5">
              <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
              CEFR B2 · C1 · C2
            </p>
            <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-balance leading-[1.05]">
              Your English is already good.
              <br />
              <span className="text-brand-600 dark:text-brand-400">This is the last mile.</span>
            </h1>
            <p className="mt-6 text-lg muted max-w-2xl text-pretty leading-relaxed">
              Most language apps stop where advanced learning begins. Lexicon starts there — with
              register, connotation, implicature, rhetorical control and the idiomatic range that
              separates correct English from native English.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="h-12 px-7 inline-flex items-center rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/25"
              >
                Take the placement test
              </Link>
              <Link
                href="/login"
                className="h-12 px-7 inline-flex items-center rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Try the demo account
              </Link>
            </div>
            <p className="mt-4 text-sm muted">
              Twelve to twenty adaptive questions. It stops as soon as it knows your level.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- Features */}
        <section className="border-y border-[var(--border)] bg-[var(--surface-sunken)]">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3 text-balance">
              Built around what actually moves an advanced learner
            </h2>
            <p className="muted max-w-2xl mb-12 text-pretty">
              Every feature here exists because it addresses a specific reason advanced learners
              plateau — not because a competitor has it.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="surface p-6">
                  <feature.icon className="size-5 text-brand-500 mb-4" aria-hidden />
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm muted leading-relaxed text-pretty">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ Levels */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-12 text-balance">
            Where you are, and what comes next
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {LEVELS.map((level) => (
              <div key={level.code} className="surface p-6">
                <div className="flex items-baseline gap-2.5 mb-3">
                  <span
                    className="text-3xl font-semibold tabular-nums"
                    style={{ color: `var(--color-${level.code.toLowerCase()})` }}
                  >
                    {level.code}
                  </span>
                  <span className="text-sm muted">{level.name}</span>
                </div>
                <p className="text-sm muted leading-relaxed mb-4 text-pretty">{level.where}</p>
                <p className="text-sm font-medium mb-2">What we work on:</p>
                <ul className="space-y-1.5">
                  {level.focus.map((item) => (
                    <li key={item} className="text-sm muted flex gap-2">
                      <span className="text-brand-500 shrink-0" aria-hidden>
                        ·
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------- CTA */}
        <section className="border-t border-[var(--border)]">
          <div className="max-w-6xl mx-auto px-6 py-20 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4 text-balance">
              Find out where you actually are
            </h2>
            <p className="muted max-w-xl mx-auto mb-8 text-pretty">
              The placement test adapts to every answer, so it converges quickly and does not waste
              your time on questions that tell it nothing.
            </p>
            <Link
              href="/register"
              className="h-12 px-8 inline-flex items-center rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
            >
              Start free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap gap-4 items-center justify-between text-sm muted">
          <span>Lexicon — advanced English, B2 to C2.</span>
          <span>Built with Next.js, Prisma and PostgreSQL.</span>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: Target,
    title: "Adaptive placement",
    body: "Item-response theory picks each question to be maximally informative at your current estimate, then stops when the estimate is precise enough. Twelve to twenty questions, not forty.",
  },
  {
    icon: Repeat,
    title: "Spaced repetition that respects you",
    body: "SM-2 with learning steps and partial-credit lapses. Forgetting one mature card does not reset three months of work, and new cards are capped so the queue never becomes a punishment.",
  },
  {
    icon: Swords,
    title: "An opponent, not a cheerleader",
    body: "Debate mode holds a position and attacks the weakest link in your reasoning. Corrections appear beside the conversation rather than interrupting it.",
  },
  {
    icon: PenLine,
    title: "Writing feedback with working shown",
    body: "Band estimates against IELTS descriptors, grounded in measured features — readability, lexical density, structures detected — that you can check yourself.",
  },
  {
    icon: Mic,
    title: "Pronunciation, scored honestly",
    body: "Accuracy, fluency, completeness and a prosody proxy, with targeted advice on the sounds and stress patterns that actually cost you intelligibility. Audio never leaves your device.",
  },
  {
    icon: Brain,
    title: "Lexicon, not word list",
    body: "Every entry carries register, connotation and collocation — because at C1 the definition was never the problem.",
  },
  {
    icon: GraduationCap,
    title: "Exam preparation",
    body: "IELTS, TOEFL, Cambridge C1 Advanced and C2 Proficiency, with indicative band conversion and the technique that separates a 6.5 from a 7.5.",
  },
  {
    icon: BarChart3,
    title: "Analytics you can act on",
    body: "Per-skill trends, recall rate, review forecast and a weekly report whose every claim is checkable against your own dashboard.",
  },
  {
    icon: BookOpen,
    title: "Works offline",
    body: "Reviews and lessons are cached and replayed on reconnect, scheduled from when you actually studied rather than when your connection returned.",
  },
];

const LEVELS = [
  {
    code: "B2",
    name: "Upper-intermediate",
    where:
      "You handle complex text and hold your own in discussion. What holds you back is precision: the right preposition, the natural collocation, the register that fits the room.",
    focus: ["Phrasal verbs and collocation", "Register awareness", "Idiom in context", "Accuracy under pressure"],
  },
  {
    code: "C1",
    name: "Advanced",
    where:
      "You express yourself fluently and flexibly. The remaining gap is rhetorical: hedging, positioning, diplomatic disagreement and sustained argument.",
    focus: ["Hedging and stance", "Inversion, clefts, subjunctive", "Academic and professional writing", "Critical reading"],
  },
  {
    code: "C2",
    name: "Proficient",
    where:
      "You operate close to a native speaker. What remains is the subtlest layer — connotation, implicature, understatement and stylistic control.",
    focus: ["Connotation over definition", "Irony and understatement", "Rhetorical devices", "Effortless spontaneity"],
  },
];
