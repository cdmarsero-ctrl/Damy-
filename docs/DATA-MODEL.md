# Data model

PostgreSQL, 21 models, 17 enums. The authoritative source is
[`prisma/schema.prisma`](../prisma/schema.prisma); this document explains the groupings
and documents the JSON contracts the schema cannot express.

---

## Conventions

- **Every user-owned row cascades on user deletion.** Deleting a `User` erases all their
  data in one statement — a GDPR erasure request is `prisma.user.delete()`.
- **Json columns** are used where the shape must evolve without a migration: exercise
  payloads, grading keys, AI feedback, rubrics. Each one's contract is documented below
  and mirrored by a Zod schema in `src/lib/validation.ts`.
- **UTC midnight** is the canonical "day" for streaks, daily challenges and analytics
  snapshots. Local dates would break a learner's streak when they change timezone.
- **Indexes** exist on every column filtered or sorted in a hot path.

---

## Identity and profile

| Model | Purpose |
|---|---|
| `User` | Identity, credentials, role. The hub of every cascade |
| `AuthSession` | Refresh-token sessions. Stores only a SHA-256 hash of the token, plus user agent, IP, expiry and revocation time |
| `Profile` | CEFR level, continuous ability estimate `theta`, goals, target exam, accent preference, daily XP goal |
| `UserSettings` | Theme, reduced motion, high contrast, font scale, speech rate, notification and offline preferences |

`Profile.theta` is the learner's ability on the IRT logit scale. It is stored alongside
the discrete `cefrLevel` because the continuous value is what drives band-progress bars
and what warm-starts a re-test — mapping to B2/C1/C2 and back would throw away precision.

---

## Placement

| Model | Purpose |
|---|---|
| `PlacementItem` | The item bank. 3PL parameters (`discrimination`, `difficulty`, `guessing`), prompt, optional context, options, answer key and a rationale shown after answering |
| `PlacementTest` | One sitting: running `theta`, `standardError`, result level, per-skill subscores |
| `PlacementResponse` | One answer, with the ability estimate *after* it — so a test can be replayed or audited |

`@@unique([testId, itemId])` makes double-submission (double click, flaky connection) a
409 rather than a corrupted estimate.

---

## Curriculum

```
Track ──< Unit ──< Lesson ──< Exercise ──> LexicalItem (optional)
```

| Model | Notes |
|---|---|
| `Track` | A learning path, tagged with a `Goal` and a CEFR level |
| `Unit` | A themed group, unique on `(trackId, slug)` |
| `Lesson` | Objectives, estimated minutes, XP reward, long-form `content`, optional `culturalNote`, optional accent |
| `Exercise` | Type, skill, prompt, `payload`, `solution`, explanation, points, optional `lexicalItemId` |

**`Exercise.solution` never leaves the server.** Every read path a browser can reach
excludes it explicitly.

**`Exercise.lexicalItemId`** links an exercise to a lexicon entry. Answering it correctly
(≥ 0.6) seeds an SRS card. Seeding on *exposure* rather than *success* floods the queue
with words the learner already knew.

---

## Exercise payload and solution contracts

The renderer in `src/components/exercises/` reads `payload`; the grader in
`src/lib/grading.ts` reads `solution`. Both are documented here and enforced by
`exerciseResponseSchema`.

### `MULTIPLE_CHOICE` · `LISTENING_COMPREHENSION` · `READING_ANALYSIS`
```jsonc
payload:  { "options": ["…"], "passage"?: "…", "transcript"?: "…", "context"?: "…" }
solution: { "answerIndex": 2 }
response: { "answerIndex": 2 }
```

### `MULTI_SELECT`
```jsonc
payload:  { "options": ["…"] }
solution: { "answerIndexes": [0, 2, 4] }
response: { "answerIndexes": [0, 2] }
```
Over-selection is penalised, so "tick everything" cannot score well.

### `GAP_FILL` · `COLLOCATION_BUILD`
```jsonc
payload:  { "gaps": [{ "placeholder": "verb" }, { "placeholder": "adjective" }] }
solution: { "answers": [["suggest", "indicate"], ["establish", "prove"]] }
response: { "answers": ["suggest", "establish"] }
```
Each gap lists accepted variants. A near-miss on a word of five characters or more
(≥ 85% similarity) is accepted as a **spelling** issue rather than marked wrong — a
learner who knows the word but mistypes it has a different problem from one who does not.

### `TRANSFORMATION`
```jsonc
payload:  { "keyword": "WISH", "original": "I'm sorry I didn't tell you.", "maxWords": 6 }
solution: { "answers": ["wish I had told", "wish I'd told"], "mustInclude": ["wish"] }
response: { "text": "wish I had told" }
```
`mustInclude` enforces the unchanged key word, which is what Cambridge is actually testing.

### `ERROR_CORRECTION`
```jsonc
payload:  { "lines": ["I am agree with you.", "It depend of the context."] }
solution: { "corrections": [
             { "accepted": ["I agree with you"], "hint": "'Agree' is a verb." },
             { "accepted": ["It depends on the context"] }
           ] }
response: { "answers": ["I agree with you", "It depends on the context"] }
```

### `DRAG_ORDER`
```jsonc
payload:  { "items": [{ "id": "a", "label": "hints at" }, …] }
solution: { "order": ["a", "b", "c", "d"] }
response: { "order": ["a", "c", "b", "d"] }
```
Partial credit per correct position. Rendered with up/down buttons rather than native
drag-and-drop, which is unusable by keyboard and unreliable on touch.

### `MATCHING`
```jsonc
payload:  { "left": [{ "id": "A", "label": "…" }], "right": [{ "id": "i", "label": "…" }],
            "passage"?: "…" }
solution: { "pairs": { "A": "i", "B": "ii" } }
response: { "pairs": { "A": "i", "B": "iii" } }
```

### `DICTATION`
```jsonc
payload:  { "audioUrl"?: "…", "audioHint"?: "/aɪdəv θɔːt/", "accent"?: "UK" }
solution: { "text": "I would have thought she would have told us by now" }
response: { "text": "I would have thought…" }
```
Scored by LCS word alignment (`src/lib/text.ts#diffWords`), so one inserted word does not
cascade into a wall of false mismatches.

### `REGISTER_SHIFT`
```jsonc
payload:  { "original": "…", "targetRegister": "ACADEMIC", "minWords": 20 }
solution: { "mustInclude": ["evidence", "may"], "mustAvoid": ["everyone knows"], "minWords": 20 }
response: { "text": "…" }
```
Marker matching is a **floor**, not a verdict — a stylistically poor rewrite can tick
every box — so this type always sets `needsQualitativeReview`.

### `NOTE_TAKING`
```jsonc
payload:  { "transcript": "…" }
solution: { "keyPoints": ["staffing 8% over budget due to agency cover", …] }
response: { "text": "…" }
```
A key point counts as captured when at least half its content words appear, so a genuine
paraphrase scores like a verbatim copy.

### `OPEN_WRITING` · `SPEAKING_PROMPT`
```jsonc
payload:  { "minWords": 60, "placeholder"?: "…", "allowSpeech"?: true }
solution: { "minWords": 60 }
response: { "text": "…" }
```
The deterministic grader checks effort only; the qualitative grade comes from the AI layer.

---

## Progress

| Model | Purpose |
|---|---|
| `Enrollment` | Learner ↔ track, with cached completion percentage |
| `LessonProgress` | Status, current and best score, attempts, time spent |
| `ExerciseAttempt` | Every attempt, with the full grading result stored as `feedback` |

Lesson score is the **best** attempt per exercise, weighted by point value. Using the
most recent attempt would punish retrying a question you got wrong, which is exactly the
behaviour worth encouraging.

---

## Lexicon and spaced repetition

| Model | Purpose |
|---|---|
| `LexicalItem` | Headword, type, CEFR, IPA, definition, **register**, **connotation**, domain, synonyms, antonyms, collocations, examples, usage note, frequency rank |
| `ReviewCard` | One per `(user, item)`: state, ease, interval, repetitions, lapses, `dueAt`, rolling retention |
| `ReviewLog` | Every grade, with before/after interval and ease — the audit trail for recall analytics |

`register` and `connotation` are columns rather than free text because they are the
fields advanced learners actually need. "Ostensibly" and "apparently" share a definition;
only one of them casts doubt.

`LexicalItem.examples` is `[{ text, note? }]`, where `note` carries the register or
regional gloss.

---

## Gamification

| Model | Purpose |
|---|---|
| `UserStats` | Denormalised lifetime counters for cheap dashboard reads |
| `XpEvent` | Every award. The source of truth for period-scoped leaderboards and analytics |
| `Badge` / `UserBadge` | Definitions and per-learner progress. `criteria` is `{ metric, gte }`, evaluated against `BadgeMetrics` |
| `DailyChallenge` / `UserDailyChallenge` | Three per UTC day, unique on `(date, type)` so concurrent generation is safe |

---

## AI features

| Model | Purpose |
|---|---|
| `Conversation` | Mode, topic, CEFR, persona, AI and learner stance (so a debate opponent stays consistent) |
| `Message` | Role, content, and — on learner turns — `corrections`, `suggestions`, `metrics` |
| `WritingSubmission` / `WritingFeedback` | Submission text and the banded report |
| `PronunciationAttempt` | Target, transcript, four sub-scores, per-word scores, tips. **No audio** |

`Message.corrections`:
```jsonc
[{ "span": [12, 20], "type": "grammar", "original": "depends of",
   "suggestion": "depends on", "explanation": "…", "severity": "moderate",
   "ruleId"?: "depend-of" }]
```
`span` is a character offset into the learner's own text, verified server-side against
the stored message. `ruleId` is present only on rules-engine findings.

`WritingFeedback.criteria`:
```jsonc
{ "taskAchievement": 6.5, "coherenceCohesion": 7, "lexicalResource": 6,
  "grammaticalRange": 6.5, "registerStyle": 7 }
```

---

## Exams

| Model | Purpose |
|---|---|
| `ExamModule` | One timed section (IELTS Reading, CAE Use of English, …) |
| `ExamTask` | Prompt, payload, solution, and a `rubric` of band descriptors for productive tasks |
| `ExamAttempt` | Raw score, max, scaled score, band label, duration |
| `ExamResponse` | One answer per task, unique on `(attemptId, taskId)` |

`solution` and `rubric` are withheld until the attempt is submitted, then returned in
full so the learner can review every task.

---

## Analytics and sync

| Model | Purpose |
|---|---|
| `SkillSnapshot` | One row per `(user, skill, UTC day)`, upserted as a running mean |
| `StudySession` | Time-on-task, including replayed offline sessions |
| `FeedbackReport` | Weekly report: summary, strengths, weaknesses, recommendations |
| `SyncMutation` | Offline replay ledger, unique on `(userId, idempotencyKey)` |

`SyncMutation`'s unique constraint is what makes offline replay safe. A client whose
request times out cannot know whether it was applied; replaying the same key is a no-op.

`FeedbackReport.recommendations`:
```jsonc
[{ "title": "…", "why": "…", "action": "…", "href": "/review" }]
```

---

## Entity overview

```
User ─┬─ Profile, UserSettings, UserStats, AuthSession
      ├─ Enrollment ──> Track ──< Unit ──< Lesson ──< Exercise ──> LexicalItem
      ├─ LessonProgress ──< ExerciseAttempt
      ├─ ReviewCard ──< ReviewLog          (──> LexicalItem)
      ├─ XpEvent, UserBadge, UserDailyChallenge
      ├─ PlacementTest ──< PlacementResponse ──> PlacementItem
      ├─ Conversation ──< Message
      ├─ WritingSubmission ──  WritingFeedback
      ├─ PronunciationAttempt
      ├─ ExamAttempt ──< ExamResponse ──> ExamTask ──> ExamModule
      └─ SkillSnapshot, StudySession, FeedbackReport, SyncMutation
```

---

## Migrations

```bash
npm run db:migrate          # create and apply a migration in development
npm run db:deploy           # apply pending migrations in production
npm run db:push             # prototype without a migration file (dev only)
npm run db:reset            # drop, recreate, re-seed (destroys data)
npm run db:studio           # Prisma Studio
```

The seed is idempotent — every insert is an upsert on a natural key — so
`npm run db:seed` can be re-run against a live database to ship content updates without
touching learner progress.
