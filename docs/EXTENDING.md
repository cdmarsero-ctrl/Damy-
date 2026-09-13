# Extending Lexicon

Recipes for the changes most likely to be wanted, each stating exactly which files move.

---

## Adding an exercise type

Five files. The compiler will find four of them for you.

**1. The enum** — `prisma/schema.prisma`

```prisma
enum ExerciseType {
  // …
  SENTENCE_STRESS
}
```
```bash
npm run db:migrate -- --name add_sentence_stress
```

**2. The grader** — `src/lib/grading.ts`

Add a `case` to the switch. The `default` branch has an exhaustiveness guard
(`const never: never = type`), so **omitting this is a compile error, not a silent zero
in production**:

```ts
case "SENTENCE_STRESS": {
  const expected = asArray(sol.stressedIndexes).map(Number);
  const given = asArray(obj(response).stressedIndexes).map(Number);
  const hits = expected.filter((i) => given.includes(i)).length;
  return ratioResult(hits, expected.length, [], "Stress placed correctly.");
}
```

**3. The renderer** — `src/components/exercises/index.tsx`

Add a component and a `case` in `ExerciseRenderer`, plus a branch in `isAnswered` so the
submit button enables at the right moment.

**4. The response schema** — `src/lib/validation.ts`

Add the new shape to `exerciseResponseSchema`, or the API will reject it with 422.

**5. Documentation** — [DATA-MODEL.md](DATA-MODEL.md#exercise-payload-and-solution-contracts)

Then author content using it (see [CONTENT-AUTHORING.md](CONTENT-AUTHORING.md)).

---

## Swapping the AI provider

`src/lib/ai/provider.ts` is the only file that talks to a model.

### OpenAI-compatible endpoints — no code change

Azure OpenAI, Together, Groq, Fireworks, a local vLLM or Ollama server:

```bash
OPENAI_BASE_URL="https://your-endpoint/v1"
OPENAI_API_KEY="…"
OPENAI_MODEL="your-model"
```

### A different API shape

Reimplement `completeJson` with the same signature. Everything else is unchanged:

```ts
export async function completeJson<T>(
  options: CompleteOptions,
  check: (value: unknown) => T | null,
): Promise<T | null>
```

The contract it must honour:

- **Return `null` on any failure.** Callers fall back to the rules engine; a thrown error
  would become a 500 in the middle of someone's lesson.
- **Enforce a hard timeout** (25 s). Disable the SDK's internal retries so the timeout
  stays honest rather than being silently multiplied.
- **Request and validate JSON.** Run the caller's `check` and return `null` if it fails.

Also update `hasLiveAI()` in `src/lib/env.ts` so the UI's capability badge stays accurate.

### Running with no provider at all

Leave `OPENAI_API_KEY` unset. Every surface falls back to the rules engine and says so.
See [AI.md](AI.md#what-each-path-can-and-cannot-do) for what changes.

---

## Pronunciation: moving to phoneme-level scoring

Today's scorer works from an ASR transcript, which measures intelligibility rather than
articulation. To use a phoneme-level provider (Azure Pronunciation Assessment, Google STT
with confidence, Speechace):

1. **Send audio instead of text.** Change the client in
   `src/app/(app)/pronunciation/page.tsx` to capture a `Blob` via `MediaRecorder` and POST
   it as multipart. Note that this changes the privacy position — audio would then leave
   the device — so update the copy on that page, which currently states the opposite.

2. **Replace `score()`** in `src/lib/speech/pronunciation.ts`, keeping the return shape:

```ts
interface PronunciationScore {
  accuracy: number; fluency: number; completeness: number; prosody: number;
  overall: number;
  wordScores: { word: string; score: number; status: string; issue?: string }[];
  tips: string[];
}
```

3. **Widen the schema.** `pronunciationSchema` in `src/lib/validation.ts` expects a
   transcript; add the audio reference. `PronunciationAttempt.wordScores` is already Json,
   so phoneme detail needs no migration.

Nothing else changes: the analytics page, history and XP awards all read the same shape.

---

## Rate limiting at scale

`src/lib/rate-limit.ts` is an in-process sliding window. Behind more than one replica,
each enforces its own budget.

The call signature is designed so only that file changes:

```ts
export async function hit(key: string, limit: number, windowMs = 60_000): Promise<RateLimitResult> {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${window}`;

  const count = await redis.incr(redisKey);
  if (count === 1) await redis.pexpire(redisKey, windowMs);

  const resetAt = (window + 1) * windowMs;
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSec: count <= limit ? 0 : Math.ceil((resetAt - now) / 1000),
  };
}
```

`enforceRateLimit` in `src/lib/api.ts` becomes `await`ed at its four call sites.

---

## Placement calibration

The shipped 3PL parameters are **authored estimates**, not values fitted to response data.
Once real responses exist, re-derive them:

**1. Export responses.**

```sql
SELECT r."itemId", r.correct, t.theta
FROM "PlacementResponse" r
JOIN "PlacementTest" t ON t.id = r."testId"
WHERE t.status = 'SCORED';
```

**2. Fit the model.** Use an IRT package — `mirt` in R, `girth` or `py-irt` in Python —
with a 3PL specification. A few hundred responses per item is the usual minimum for
stable estimates.

**3. Write the parameters back** into `prisma/content/placement.ts` and re-seed.

**4. Re-derive the CEFR cut scores** in `src/lib/cefr.ts#THETA_CUTS`. The current values
(0.0 for C1, 1.25 for C2) were chosen against the authored bank and will not survive
recalibration unchanged. Standard-setting methods (Angoff, bookmark) apply.

**5. Check item fit** and retire misfitting items by setting `active: false` rather than
deleting them — deleting cascades to `PlacementResponse` and destroys completed tests.

---

## Adding a learning path

Create `prisma/content/track-yourname.ts` exporting a `TrackSeed`, then register it:

```ts
// prisma/seed.ts
import { YOUR_TRACK } from "./content/track-yourname";
const TRACKS: TrackSeed[] = [FLUENCY_TRACK, ACADEMIC_TRACK, /* … */ YOUR_TRACK];
```

`goal` determines which learners see it recommended, and `cefr` contributes to the
relevance ordering. See [CONTENT-AUTHORING.md](CONTENT-AUTHORING.md).

---

## Adding a language other than English

The domain engines are language-agnostic; the content and two modules are not.

| Needs replacing | Why |
|---|---|
| `prisma/content/*` | All content |
| `src/lib/ai/rules.ts` | Rules are English-specific |
| `src/lib/text.ts#syllables` | Vowel-group estimation assumes English orthography |
| `src/lib/speech/pronunciation.ts#SOUND_TRAPS` | English phonology |
| `ACCENT_LOCALE` in `src/hooks/use-speech.ts` | BCP-47 tags |
| Readability formulas | Flesch is calibrated for English |

Unchanged: SRS, IRT placement, grading, gamification, auth, sync, analytics.

The UI is not currently internationalised — strings are inline. Adding `next-intl` and
extracting them would be a prerequisite.

---

## Email and push notifications

`UserSettings` already stores `emailDigest`, `pushReminders` and `reminderHour`; nothing
sends them yet. To wire it up:

1. Add a provider (Resend, Postmark, SES).
2. Add a scheduled route — `src/app/api/cron/digest/route.ts` — protected by a shared
   secret header, since Vercel Cron and most schedulers authenticate that way.
3. Query learners whose `reminderHour` matches the current UTC hour and whose
   `lastActiveDate` is not today.
4. Reuse `POST /api/analytics/report`'s logic for the digest body — it already produces
   summary, strengths, weaknesses and recommendations.

---

## Testing what you add

```bash
npm run typecheck
npm run test                                    # unit tests
npm run build
npm run start & BASE_URL=http://localhost:3000 ./scripts/smoke.sh
```

Domain logic belongs in `src/lib/*.test.ts` as pure-function tests — no database, no
fixtures. Anything that touches Prisma or the network belongs in `scripts/smoke.sh`,
which runs against a live server and asserts real behaviour end to end.

When adding a smoke check, follow the existing shape:

```bash
RESULT=$(req POST /api/your/endpoint '{"field":"value"}')
check "describes the behaviour, not the mechanism" \
  "$([ -n "$(echo "$RESULT" | field someField)" ] && echo true || echo false)"
```
