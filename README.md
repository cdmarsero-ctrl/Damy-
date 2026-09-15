# Lexicon

**An adaptive, AI-powered platform for mastering English at CEFR B2, C1 and C2.**

Most language apps stop where advanced learning begins. Lexicon starts there — with
register, connotation, implicature, rhetorical control and the idiomatic range that
separates *correct* English from *native* English.

---

## What it does

| | |
|---|---|
| **Adaptive placement** | 3PL item-response theory picks each question to be maximally informative at the learner's current ability estimate, then stops once the estimate is precise enough. Twelve to twenty-two items instead of a fixed forty. |
| **Personalised paths** | Five sequenced curricula (academic, professional, idiomatic fluency, exam preparation, near-native nuance), ordered by the learner's stated goals and measured level. |
| **Fifteen exercise types** | Multiple choice, multi-select, gap fill, key-word transformation, error correction, reordering, matching, dictation, register shift, collocation building, note-taking, reading analysis, listening comprehension, open writing and speaking prompts. |
| **Spaced repetition** | SM-2 with learning steps, partial-credit lapses and interval fuzz. Every lexical item carries register, connotation and collocation, because at C1 the definition was never the problem. |
| **AI conversation partner** | Free dialogue, role-play, interview and exam-speaking modes with selective correction and higher-level rephrasings shown *beside* the conversation rather than interrupting it. |
| **Debate opponent** | Holds an assigned position, attacks the weakest link in your reasoning and concedes only what it genuinely must. |
| **Writing studio** | Plan → write → banded report against IELTS-style descriptors, grounded in measured features (readability, lexical density, structures detected) the learner can check themselves. |
| **Pronunciation lab** | Accuracy, fluency, completeness and a prosody proxy with targeted advice on the sounds and stress patterns that actually cost intelligibility. Audio never leaves the device. |
| **Exam preparation** | IELTS, TOEFL, Cambridge C1 Advanced and C2 Proficiency modules, timed, with indicative score conversion. |
| **Gamification** | XP, levels, streaks with freezes, badges, rotating daily challenges and period-scoped leaderboards. |
| **Analytics** | Per-skill radar, XP by source, recall rate, review forecast, pronunciation and writing-band trends, and a weekly report whose every claim is checkable against the charts. |
| **Offline** | Reviews and lessons cached in IndexedDB and replayed idempotently on reconnect, scheduled from when the learner actually studied. |
| **Accessibility** | WCAG 2.1 AA throughout: keyboard-first flows, visible focus, text scaling, high-contrast mode, reduced motion, live regions, no colour-only signalling. |

---

## Quick start

**Requirements:** Node 20+, PostgreSQL 14+ (or Docker).

```bash
git clone <this-repo> && cd lexicon
npm install

cp .env.example .env
# Generate a signing secret and paste it into AUTH_SECRET:
openssl rand -base64 48

docker compose up -d db        # or point DATABASE_URL at your own Postgres
npm run db:migrate             # create the schema
npm run db:seed                # curriculum, lexicon, exams, badges, demo account

npm run dev
```

Open <http://localhost:3000> and sign in as **demo@lexicon.app / lexicon-demo-2024** —
a C1 learner with two weeks of history, a populated review queue and enrolled paths.

### Running without an AI provider

`OPENAI_API_KEY` is **optional**. With it unset, every AI surface falls back to the
deterministic rules engine in `src/lib/ai/`:

- **Conversation and debate** still correct real errors and suggest real upgrades; the
  dialogue itself is more scripted.
- **Writing feedback** still produces annotated, banded reports — computed from measured
  features rather than judged.

The UI labels this state clearly on every affected surface. No feature disappears, and
nothing silently degrades without the learner being told. See
[docs/AI.md](docs/AI.md) for what each path can and cannot do.

Separately, and only during development, `.mcp.json` registers an MCP server that lets
Claude Code consult a GPT model — for a second opinion or an independent code review,
never as the model driving the session. It reuses the same key and does not touch the
runtime AI layer. See [docs/MCP-OPENAI.md](docs/MCP-OPENAI.md).

---

## Verifying the installation

```bash
npm run typecheck   # tsc --noEmit
npm run test        # 146 unit tests: SRS, IRT, grading, gamification, rules engine
npm run build       # production build

# End-to-end, against a running server:
npm run start &
BASE_URL=http://localhost:3000 ./scripts/smoke.sh
```

`scripts/smoke.sh` runs 56 checks covering the whole learner journey — register, take
the adaptive placement test to completion, enrol, complete a lesson, grade a review card,
hold a conversation, submit writing, score pronunciation, sit an exam module, read the
analytics back, replay an offline mutation twice to prove idempotency, and confirm that
unauthenticated access, weak passwords and stale sessions are all rejected.

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, request lifecycle, module map, and the reasoning behind each significant decision |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Every table, every relationship, and the JSON contracts for exercise payloads and solutions |
| [docs/API.md](docs/API.md) | All 30 endpoints with request/response shapes and error codes |
| [docs/ALGORITHMS.md](docs/ALGORITHMS.md) | The SRS scheduler, the IRT placement engine, XP and streak mechanics — what they do and why they deviate from the textbook |
| [docs/AI.md](docs/AI.md) | Prompting strategy, response validation, the rules engine, and the honest limits of both |
| [docs/CONTENT-AUTHORING.md](docs/CONTENT-AUTHORING.md) | How to write lessons, exercises, lexical entries, placement items and exam modules |
| [docs/EXTENDING.md](docs/EXTENDING.md) | Adding exercise types, swapping the AI or speech provider, scaling rate limiting, calibrating the item bank |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel, Docker and self-hosted deployment, plus the production checklist |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | The WCAG 2.1 conformance position, feature by feature |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, auth design, and what is deliberately not implemented |
| [docs/MCP-OPENAI.md](docs/MCP-OPENAI.md) | Consulting GPT from a Claude Code session through the bundled MCP server |

---

## Stack

- **Next.js 15** (App Router, React 19, server components) with **TypeScript** in strict mode
- **Tailwind CSS v4** — CSS-first configuration, OKLCH tokens, no config file
- **PostgreSQL** via **Prisma 6**
- **Custom JWT auth** — short-lived access tokens plus rotating, hashed refresh tokens
- **OpenAI** (optional) behind a provider abstraction with a full deterministic fallback
- **Web Speech API** for recognition and synthesis, entirely client-side
- **Recharts** for analytics, **Vitest** for unit tests

Every dependency is load-bearing. There is no component library, no state manager, no
Markdown parser and no date library: the app needs a small enough slice of each that the
bundle cost was not worth paying. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#dependency-choices) for the reasoning.

---

## Project layout

```
prisma/
  schema.prisma          21 models, 17 enums
  seed.ts                Idempotent; safe to re-run against a live database
  content/               Hand-authored curriculum, lexicon, placement bank, exams
src/
  app/
    (auth)/              Login, registration
    (app)/               Authenticated application (14 pages)
    api/                 30 route handlers
  components/            UI primitives, exercise renderers, lesson player, exam runner
  hooks/                 Web Speech wrappers
  lib/
    ai/                  Provider, prompts, response validation, rules engine
    services/            Transactional progress and challenge logic
    speech/              Pronunciation scoring
    srs.ts               Spaced repetition scheduler
    placement.ts         IRT placement engine
    grading.ts           Deterministic grading for every exercise type
    gamification.ts      XP, levels, streaks, badges
tools/
  mcp/openai/            MCP server: lets Claude Code consult GPT during development
docs/                    Eleven documents
scripts/smoke.sh         56-check end-to-end test
```

---

## Licence

MIT.
