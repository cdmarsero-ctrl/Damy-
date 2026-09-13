# API reference

Thirty route handlers under `src/app/api/`. All accept and return JSON.

---

## Conventions

**Authentication.** Every endpoint except `/api/auth/*` requires a valid access token in
the `lx_at` cookie. The browser client (`src/lib/client.ts`) handles 401 transparently:
it calls `/api/auth/refresh` once and retries, so an access token expiring mid-lesson is
invisible to the learner.

**Errors** are uniform:

```jsonc
{ "error": "Human-readable message", "code": "machine_code", "details": ... }
```

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request` | Malformed request (e.g. body is not JSON) |
| 401 | `unauthorized`, `session_expired` | Not signed in, or the refresh chain is dead |
| 403 | `forbidden` | Authenticated but not permitted |
| 404 | `not_found` | Missing — also returned for resources owned by another user, so ids cannot be probed |
| 409 | `email_taken`, `duplicate_answer`, `already_scored` | Conflicts with existing state |
| 422 | `validation_error` | Failed Zod validation. `details` is `[{ path, message }]` |
| 429 | `rate_limited` | `details.retryAfterSec` says how long to wait |
| 500 | `internal_error` | Unexpected. Never includes a stack trace |

**Rate limits** are per-minute, per-IP for anonymous endpoints and per-user for
authenticated ones: `RATE_LIMIT_AUTH_PER_MIN` (default 10) on auth,
`RATE_LIMIT_AI_PER_MIN` (default 20) on AI endpoints.

---

## Authentication

### `POST /api/auth/register`
```jsonc
// → { name, email, password }          password: ≥10 chars, >4 distinct, not on a breach list
// ← 201 { user: { id, email, name, role }, next: "/placement" }
```
Creates the user with `Profile`, `UserSettings` and `UserStats` in one transaction and
sets both cookies. `409 email_taken` if the address exists.

### `POST /api/auth/login`
```jsonc
// → { email, password }
// ← { user, next: "/dashboard" | "/placement" }
```
The server decides the destination: a learner who has not been placed goes to the test.
An unknown email is compared against a dummy hash so response timing cannot enumerate
registered addresses.

### `POST /api/auth/refresh`
```jsonc
// ← { ok: true }    (rotates the refresh token, issues a new access token)
```
Presenting an already-consumed token revokes every session for that user.

### `POST /api/auth/logout`
Revokes the presented refresh token and clears both cookies.

---

## Profile

### `GET /api/me`
Everything the app shell needs in one request: user, profile, settings, stats (with
computed level, band progress, due count, badge count), and `capabilities.liveAI`.

### `PATCH /api/me/profile`
```jsonc
// → { name?, goals?, targetExam?, examDate?, nativeLanguage?, interests?,
//     preferredAccent?, dailyGoalXp? }
// ← { profile }
```

### `PATCH /api/me/settings`
```jsonc
// → { theme?, reducedMotion?, highContrast?, fontScale?, captionsDefaultOn?,
//     ttsVoice?, speechRate?, emailDigest?, pushReminders?, reminderHour?, offlineEnabled? }
// ← { settings }
```

---

## Placement

### `POST /api/placement/start`
```jsonc
// ← { testId, theta, standardError, answered, maxItems,
//     item: { id, skill, prompt, context, options } }
```
Resumes an in-progress test if one exists — the test takes ten minutes and closing a tab
should not cost that. Warm-starts `theta` from a previous placement. **`answerIndex` and
`rationale` are never included.**

### `POST /api/placement/answer`
```jsonc
// → { testId, itemId, answerIndex, responseMs }

// ← not finished:
{ "done": false, "answered": 7, "theta": 0.62, "standardError": 0.44,
  "feedback": { "correct": true, "rationale": "…" },
  "item": { … next item … } }

// ← finished:
{ "done": true, "answered": 16,
  "feedback": { "correct": false, "rationale": "…" },
  "result": { "theta": 0.71, "se": 0.28, "level": "C1",
              "subscores": { "GRAMMAR": 0.82, … },
              "confidence": "high",
              "weakestSkills": ["LISTENING"], "strongestSkills": ["READING"] } }
```
On completion, writes the result to `Profile` and awards placement XP. `409` on a
re-submitted item.

---

## Learning paths and lessons

### `GET /api/tracks`
All published tracks with nested units and lessons, each lesson carrying the learner's
progress, plus `enrolled` and a `relevance` score (goal match + level match) that the
response is sorted by.

### `POST` / `DELETE /api/tracks/[trackId]/enroll`
The first path a learner joins becomes their primary.

### `GET /api/lessons/[lessonId]`
Accepts an id or a slug. Returns the lesson, its exercises **without `solution`**, the
learner's progress, and previous/next navigation within the unit.

### `POST /api/lessons/submit`
```jsonc
// → { exerciseId, response, durationMs }
// ← { attemptId, correct, score, issues: [...], summary, explanation, needsQualitativeReview,
//     addedToReview }
```
Grades one exercise. **No XP is awarded here** — paying per exercise would make
re-submitting an easy question an XP faucet. A linked lexical item scoring ≥ 0.6 seeds an
SRS card, reported as `addedToReview`.

### `POST /api/lessons/complete`
```jsonc
// → { lessonId, timeSpentSec }
// ← { progress, score, firstCompletion,
//     rewards: { xpAwarded, levelUp, streakCurrent, streakExtended, freezeUsed,
//                newBadges: [...], completedChallenges: [...] } }
```
Aggregates the **best** attempt per exercise weighted by points. Repeat completions pay
25% — good practice, not an exploit. `score ≥ 0.9` marks the lesson mastered.

---

## Spaced repetition

### `GET /api/reviews/queue?limit=20&includeNew=true`
```jsonc
// ← { cards: [{ id, state, dueAt, repetitions, lapses, retention, item: {...},
//               intervals: [{ rating: "GOOD", label: "12 d" }, …] }],
//     counts: { due, new, total } }
```
Overdue review cards first, then learning, then up to ten new. `intervals` are computed
server-side by the same scheduler that will run on submit, so the buttons show the true
cost of each grade.

### `POST /api/reviews/grade`
```jsonc
// → { cardId, rating: "AGAIN"|"HARD"|"GOOD"|"EASY", durationMs }
// ← { card, interval: "12 d", dueAt, mastered, rewards }
```

### `POST` / `DELETE /api/reviews/add`
```jsonc
// → { lexicalItemId }
```

### `GET /api/lexicon?q=&cefr=&type=&register=&limit=40&cursor=`
Cursor-paginated. Each entry carries `card` — the learner's SRS state for it, or `null`.

---

## AI

### `GET` / `POST /api/ai/conversations`
```jsonc
// → { mode: "TUTOR"|"DEBATE"|"ROLEPLAY"|"INTERVIEW"|"EXAM_SPEAKING",
//     topic, persona?, userStance?, aiStance? }
// ← 201 { conversation: { id, mode, topic, cefr, aiStance, messages: [opening turn] } }
```
In `DEBATE`, the AI is assigned the side the learner did not take and holds it.

### `GET` / `DELETE /api/ai/conversations/[id]`

### `POST /api/ai/conversations/message`
```jsonc
// → { conversationId, message }
// ← { userMessage, assistantMessage,
//     corrections: [{ span, type, original, suggestion, explanation, severity }],
//     upgrades: [{ label, text, rationale }],
//     followUp, metrics: { wordCount, typeTokenRatio, avgSentenceLength,
//                          errorCount, estimatedLevel },
//     source: "model"|"rules", rewards }
```
`source` tells the UI which engine produced the feedback, and the UI says so. Corrections
whose `original` cannot be located verbatim in the learner's message are dropped before
the response is built.

### `GET` / `POST /api/ai/writing`
```jsonc
// → { genre, prompt, title?, text }
// ← 201 { submission, report: { overallBand, criteria, annotations, strengths,
//                               priorities, summary, modelAnswer?, source }, rewards }
```

### `POST /api/ai/writing/outline`
```jsonc
// → { genre, prompt }
// ← { outline: ["…", …] }
```
Planning help offered *before* writing, which is where most learners need it.

---

## Speech

### `GET` / `POST /api/speech/pronunciation`
```jsonc
// → { targetText, transcript, durationMs, accent }
// ← 201 { attempt, result: { accuracy, fluency, completeness, prosody, overall,
//                            wordScores: [{ word, score, status, issue? }],
//                            tips: [...] }, rewards }
```
Receives **text, not audio**. The browser transcribes locally, so voice data never
reaches the server.

---

## Exams

### `GET /api/exams`
Modules grouped by exam with the learner's best attempt on each, plus `targetExam`,
`examDate` and `daysToExam`.

### `POST /api/exams/start`
```jsonc
// → { moduleId }
// ← 201 { attempt, module, tasks: [ … no solutions … ], endsAt }
```
Abandons any stale in-progress attempt, so two clocks never run at once.

### `POST /api/exams/submit`
```jsonc
// → { attemptId, responses: [{ taskId, response }], durationSec }
// ← { attempt, scoring: { scaled, label, cefr, interpretation },
//     review: [{ taskId, prompt, solution, rubric, response }], rewards }
```
Solutions and rubrics are released here, after scoring — never before.

---

## Gamification and analytics

### `GET /api/gamification/challenges`
Today's three challenges with the learner's progress, all badges with progress, and stats.

### `GET /api/gamification/leaderboard?scope=week|month|all&limit=25`
Ranked by XP earned in the period, aggregated from `XpEvent`. `you` is always returned,
even when the learner is outside the top N.

### `GET /api/analytics?days=30`
Zero-filled daily XP series, XP by source, skill radar, review statistics and forecast,
lesson and writing summaries, pronunciation trend, and level detail.

### `GET` / `POST /api/analytics/report`
Generates (or returns) the weekly report: summary, strengths, weaknesses and up to four
recommendations, each with a link. Built from measured behaviour only.

---

## Offline sync

### `GET /api/sync`
The offline study bundle: review cards due within three days, the next ten unfinished
lessons (**without solutions**), and the profile.

### `POST /api/sync`
```jsonc
// → { clientId, mutations: [{ idempotencyKey, kind, payload, occurredAt }] }
// ← { applied: 12, skipped: 3, failed: [{ key, reason }] }
```
`kind` is `reviewGrade` | `exerciseAttempt` | `lessonComplete` | `studyTime`.

Mutations are applied in **device order**, not arrival order, so a card graded three times
offline ends with the right interval. Each is scheduled from its `occurredAt`, so a card
reviewed on Monday and synced on Thursday gets a Monday interval. Replaying an
already-applied `idempotencyKey` is counted in `skipped` and changes nothing.
