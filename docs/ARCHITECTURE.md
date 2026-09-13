# Architecture

This document explains how Lexicon is put together and, more usefully, *why* each
significant decision went the way it did. Where a decision could reasonably have gone
the other way, the trade-off is stated.

---

## 1. Shape of the system

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│  ├─ Server Components  ── rendered on the server, no client JS       │
│  ├─ Client Components  ── lesson player, review, conversation, exams │
│  ├─ Web Speech API     ── recognition + synthesis, entirely local    │
│  ├─ Service Worker     ── offline shell, asset and study-data caches │
│  └─ IndexedDB outbox   ── mutations buffered while offline           │
└───────────────┬──────────────────────────────────────────────────────┘
                │ HTTPS, httpOnly cookies
┌───────────────▼──────────────────────────────────────────────────────┐
│ Next.js (Node runtime)                                               │
│  ├─ Edge middleware   ── cheap JWT gate, no database access          │
│  ├─ Route handlers    ── validation → authorisation → domain → JSON  │
│  ├─ Domain libraries  ── srs, placement, grading, gamification, text │
│  └─ AI layer          ── provider abstraction + deterministic rules  │
└───────────────┬───────────────────────────┬──────────────────────────┘
                │ Prisma                    │ HTTPS (optional)
┌───────────────▼──────────┐   ┌────────────▼─────────────────────────┐
│ PostgreSQL               │   │ Model provider (OpenAI-compatible)   │
│ 21 models                │   │ Absent → rules engine handles it     │
└──────────────────────────┘   └──────────────────────────────────────┘
```

---

## 2. Layering, and the one rule that matters

```
Route handler   →  validation (Zod) → authorisation → domain library → Prisma
Server component →  session → Prisma (read-only)
Client component →  src/lib/client.ts → route handler
```

**The rule: domain logic never imports Prisma, and Prisma is never called from a
component.**

The domain libraries — `srs.ts`, `placement.ts`, `grading.ts`, `gamification.ts`,
`text.ts`, `ai/heuristics.ts` — are pure functions over plain data. That is what makes
them unit-testable without a database (146 tests, no fixtures, sub-second), and it is
what lets the offline client run the *identical* SRS scheduler locally before syncing.
If `schedule()` needed a database connection, the offline path would have to
reimplement it, and the two implementations would drift.

The single exception is `src/lib/services/`, which is explicitly the transactional
seam: it composes domain functions with database writes inside one transaction.

---

## 3. Why these decisions

### Custom authentication rather than NextAuth

NextAuth is excellent for OAuth. This application needs email/password with rotating
refresh tokens and per-session revocation — a small, well-understood surface where the
library's abstractions add configuration rather than remove work. The implementation is
about 200 lines in `src/lib/auth.ts` and does exactly three things:

1. **Access tokens** are short-lived stateless JWTs (30 min default), so the common case
   — "is this request authenticated?" — costs no database round trip.
2. **Refresh tokens** are opaque 48-byte random values stored only as SHA-256 hashes. A
   database leak cannot be replayed.
3. **Refresh rotates on every use.** Presenting an already-consumed token revokes the
   entire session family, which is the standard mitigation for token theft: the attacker
   and the victim cannot both keep using the chain, and whoever refreshes second gets
   everyone logged out.

Both tokens live in `httpOnly`, `sameSite=lax`, `secure`-in-production cookies. Nothing
touches `localStorage`, so an XSS bug cannot exfiltrate a session.

### Middleware is a gate, not the boundary

`src/middleware.ts` runs on the Edge runtime, which cannot reach Prisma. It verifies the
access token's signature and expiry so an unauthenticated visitor is redirected without
a database hit — and that is *all* it does. Every route handler independently calls
`requireApiUser`, and every server component independently calls `requireUser`.

This matters because Next.js middleware has had several published bypasses. Treating it
as a performance optimisation rather than an authorisation boundary means such a bypass
costs a redirect, not a data breach.

### Solutions never reach the client

`Exercise.solution` and `ExamTask.solution` are excluded from every read path that a
browser can observe — including the RSC payload of the lesson page, which is why
`src/app/(app)/lesson/[lessonId]/page.tsx` uses an explicit `select` rather than a
convenient `include`. Grading happens in `POST /api/lessons/submit`.

This is the reason the lesson player is a client component fed by an API rather than a
server component that renders everything it fetched: a server component's props are
serialised into the page, where anyone can read them. The smoke test asserts this
directly, on both lessons and in-progress exam attempts.

### One funnel for progress

Every activity that awards XP goes through `recordActivity()` in
`src/lib/services/progress.ts`. The obvious alternative — each route handler updating XP,
streak, badges, challenges and analytics itself — guarantees that one of them eventually
forgets to bump the streak, and the bug surfaces weeks later as "my streak reset even
though I studied".

`recordActivity` runs in a single Prisma transaction covering: the XP event, the stats
update, the streak transition, daily-challenge progress, badge evaluation and the
per-skill analytics snapshot. Either all of it lands or none does.

### The AI layer degrades, it does not fail

`src/lib/ai/provider.ts` is the only file that talks to a model. `completeJson()`
guarantees a hard timeout, one retry on transient failure, JSON parsing and shape
validation — and returns `null` on any failure. Callers then fall back to the rules
engine. A hung or rate-limited provider therefore produces *less detailed feedback*,
never a 500 in the middle of someone's lesson.

The rules engine is not a stub. It is ~35 high-precision rules targeting the errors that
actually survive into B2-C2 writing (calqued prepositions, uncountable plurals, register
slippage, double comparatives), plus structural analysis (passive ratio, discourse-marker
variety, marked structures, lexical density). It runs as a *pre-pass* even when a model
is configured, and its findings are merged with the model's — the rules catch mechanical
errors cheaply and reliably, leaving the model to judge argument and tone.

See [AI.md](AI.md) for the prompting strategy and validation rules.

### Corrections are re-anchored, not trusted

A model asked to quote the learner's words will occasionally paraphrase them. A
correction that highlights the wrong span is worse than no correction: it teaches the
learner that the feedback is unreliable. So `validateTurn` and `validate` in the writing
module both do `learnerText.indexOf(correction.original)` and **drop any correction that
cannot be located verbatim**. Fabricated quotations never reach the UI.

### Analytics are computed from events, not counters

Leaderboards rank by XP earned *in a period*, which a running total cannot answer. The
`XpEvent` table is the source of truth, indexed on `(userId, createdAt)`. `UserStats`
holds denormalised lifetime counters for the cheap reads (dashboard tiles), and the two
are updated in the same transaction so they cannot disagree.

Analytics series are zero-filled across the whole requested window before returning.
Charting a sparse series produces a graph that implies the learner studied every day
when they studied on four of them — the opposite of what an honest analytics page should
communicate.

---

## 4. Request lifecycle

**A typical mutation** — grading a review card:

1. `POST /api/reviews/grade` with `{ cardId, rating, durationMs }`.
2. Edge middleware verifies the access-token signature. Expired → 401 (the client
   silently refreshes and retries once; see `src/lib/client.ts`).
3. `route()` wraps the handler so any thrown error becomes predictable JSON and an
   unexpected failure never leaks a stack trace.
4. `requireApiUser()` re-verifies the token and yields claims.
5. `parseBody(req, reviewGradeSchema)` validates and narrows the input.
6. Ownership check: the card must belong to the caller. A 404 (not 403) is returned
   otherwise, so the endpoint cannot be used to probe for card ids.
7. `schedule()` — pure, tested — computes the next state.
8. A transaction writes the card, the review log and any mastery transition.
9. `recordActivity()` awards XP, advances the streak, evaluates badges and challenges,
   and records the analytics snapshot.
10. The response returns the new interval, mastery transition and rewards, so the UI can
    show the learner what just happened without a second request.

---

## 5. Rendering strategy

| Page type | Strategy | Why |
|---|---|---|
| Landing, login, register | Static | No per-user data |
| Dashboard, paths, exams, achievements | Server component | Data-heavy, read-only, no interactivity below the fold. Calling `cookies()` opts these out of static rendering automatically, so no database call happens at build time |
| Lesson player, review, conversation, writing, exams, pronunciation, analytics, settings | Client component + API | Heavily interactive; server rendering would buy nothing and would leak solutions |

Lesson and exam pages are server components that fetch metadata and then hand a
solution-free payload to a client component. That keeps the first paint fast while
keeping the answer key on the server.

---

## 6. Dependency choices

Every dependency is load-bearing. Four things were deliberately *not* installed:

| Not used | Instead | Reasoning |
|---|---|---|
| Component library (shadcn, MUI) | ~350 lines in `src/components/ui/` | The app needs nine primitives. A library brings a design system to fight and a bundle to ship |
| Markdown parser + sanitiser | `src/components/markdown.tsx` | Lesson content uses a fixed subset (headings, emphasis, code, quotes, lists, tables). ~40 KB on every lesson page for features no lesson uses. The hand-rolled renderer also never touches `dangerouslySetInnerHTML`, so there is no XSS surface even if content later becomes user-authored |
| Date library | `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` | Built into every target browser, correctly localised, zero bytes |
| State manager | React state + server components | No cross-page client state exists worth managing |
| IndexedDB wrapper (idb, Dexie) | `src/lib/offline.ts` | Four calls are needed. A wrapper would be most of the bundle |

`recharts` and `framer-motion` are the two heavy dependencies. Recharts earns its place
on the analytics page; the CSS keyframes in `globals.css` handle most motion, so
framer-motion is available for future work rather than load-bearing today.

---

## 7. Performance

- **Indexes** on every hot filter and sort: `(userId, dueAt)` for the review queue,
  `(userId, createdAt)` for XP aggregation, `(unitId, order)` for lesson sequencing,
  `(active, difficulty)` for placement item selection.
- **`Promise.all` everywhere** a page needs several independent queries. The dashboard
  issues seven queries concurrently.
- **A single Prisma client** per process, memoised across hot reloads in development so
  editing a file does not leak a connection pool.
- **`optimizePackageImports`** for `lucide-react` and `recharts`, which are both
  barrel-exported and would otherwise pull far more than they need.
- **Shared first-load JS is ~102 KB**; the heaviest route adds ~28 KB.

---

## 8. Known limits

Stated plainly, because a system description that only lists strengths is not useful:

- **Rate limiting is per-instance.** `src/lib/rate-limit.ts` is an in-process sliding
  window. Behind more than one replica, each replica enforces its own budget. The call
  signature is designed so swapping in Redis touches only that file — see
  [EXTENDING.md](EXTENDING.md#rate-limiting).
- **Pronunciation scoring is ASR-based, not phonemic.** The browser returns text, not
  formants. What is scored is whether the words came across — a strong proxy, and an
  honest one, but not a phoneme-level assessment. [ALGORITHMS.md](ALGORITHMS.md#pronunciation)
  states exactly what each sub-score measures.
- **Exam band conversions are indicative.** Boards re-equate raw scores per sitting and
  do not publish the tables. The UI says so on every score.
- **The placement item bank is not empirically calibrated.** The 3PL parameters are
  authored estimates, not values fitted to response data. [EXTENDING.md](EXTENDING.md#placement-calibration)
  describes how to re-derive them once real responses exist.
- **Daily challenges are generated lazily**, on the first request of each UTC day, rather
  than by a scheduler. This removes a cron dependency at the cost of the first learner of
  the day paying for three inserts.
