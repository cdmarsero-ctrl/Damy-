# Algorithms

The four pieces of real machinery in Lexicon: spaced repetition, adaptive placement,
pronunciation scoring, and the XP economy. Each is a pure module with unit tests, so
everything here is checkable against `src/lib/*.test.ts`.

---

## 1. Spaced repetition — `src/lib/srs.ts`

SM-2 with three deliberate modifications.

### Grades and the ease factor

Four buttons map onto SM-2's 0–5 quality scale:

| Button | Quality | Meaning |
|---|---|---|
| Again | 2 | No recall |
| Hard | 3 | Recalled with effort |
| Good | 4 | Recalled correctly |
| Easy | 5 | Instant, effortless |

```
EF' = EF + (0.1 − (5 − q)(0.08 + (5 − q)·0.02))     clamped to [1.3, 3.2]
```

### Card lifecycle

```
NEW ──GOOD──> LEARNING (10 min) ──GOOD──> REVIEW (1 day)
 └───EASY───────────────────────────────> REVIEW (4 days)

REVIEW ──AGAIN──> RELEARNING (10 min) ──GOOD──> REVIEW (interval × 1.5)
REVIEW ──HARD──>  interval × 1.2
REVIEW ──GOOD──>  interval × EF
REVIEW ──EASY──>  interval × EF × 1.3
```

### Deviation 1 — learning steps

Textbook SM-2 sends a brand-new card straight to a one-day interval. Two learning steps
(10 minutes, then 1 day) mean a new C1 collocation is seen twice in the first session,
which is where most of the initial encoding happens. `EASY` skips the remaining steps.

### Deviation 2 — lapses retain 30% of the interval

A full reset punishes a single slip on a mature card far too harshly: a learner who
forgets one two-month card loses two months of scheduling. Instead:

```
interval' = max(1, round(interval × 0.3))
EF'       = EF − 0.2
state     = RELEARNING        (due in 10 minutes)
```

The card comes back within the session; when it passes, it resumes from the reduced
interval rather than from zero.

### Deviation 3 — interval fuzz

Every interval of a day or more is multiplied by a random factor in `[0.95, 1.05]`.
Without it, every card added in one session comes due on exactly the same future day
forever, producing a review queue that oscillates between empty and overwhelming.

The cap (`MAX_INTERVAL_DAYS = 730`) is applied **after** fuzz. Clamping first let a
maxed-out card land 5% past the ceiling — a bug the test suite caught.

### Mastery

```ts
mastered = state === "REVIEW" && intervalDays >= 21 && retention >= 0.8
```

`retention` is an exponential moving average over roughly the last eight grades
(`AGAIN` = 0, `HARD` = 0.6, otherwise 1). Mastery is a *transition*, counted once in each
direction, so `UserStats.wordsMastered` cannot drift.

### Queue construction

Overdue review cards first (they decay fastest), then learning, then at most **ten** new
cards per session. Uncapped intake is how learners end up with a queue of 200 unseen
words and quit. New cards are ordered by corpus frequency, so common items are learned
first.

A card graded `AGAIN` is re-inserted four positions later in the same session rather than
disappearing until tomorrow — that is what relearning steps are for.

### Previews

The interval under each grading button is computed server-side by the same `schedule()`
that will run on submission, with the RNG pinned to the midpoint of the fuzz range. The
learner therefore sees the true cost of each grade, and honest grading is the only thing
that makes the scheduling work.

---

## 2. Adaptive placement — `src/lib/placement.ts`

Three-parameter logistic IRT.

### Why not a fixed test

A fixed forty-item test wastes a C2 learner's time on B2 items and tells a struggling B2
learner nothing. Adaptive selection reaches a usable estimate in 12–20 items because each
item is chosen to be maximally informative *at the learner's current estimate*.

### The model

```
P(correct | θ) = c + (1 − c) / (1 + e^(−1.7·a·(θ − b)))
```

- `a` — discrimination. Higher for items isolating a single feature.
- `b` — difficulty, on the same logit scale as ability.
- `c` — pseudo-guessing, 1/options for genuine four-way items, lower where the distractors
  are strong enough that a guesser is unlikely to land on the key.

### Ability estimation: EAP, not MLE

Ability is estimated by **expected a posteriori** over a fixed grid (−4 to 4, step 0.05)
with a standard normal prior:

```
posterior(θ) ∝ N(θ; 0, 1) · Π P(correct_i | θ)
θ̂ = E[posterior]        SE = sd[posterior]
```

This is the single most important choice in the module. Maximum likelihood diverges to
±∞ on an all-correct or all-wrong response pattern — and those are exactly the patterns a
very strong or very weak learner produces in the first few items. EAP cannot diverge; the
prior bounds it. Two unit tests assert precisely this.

The estimate is recomputed from the full response set on every answer. At 22 items that
costs nothing, and it means a resumed test cannot drift from a fresh one.

### Item selection

Fisher information at the current estimate:

```
I(θ) = (1.7a)² · (q/p) · (p − c)²/(1 − c)²
```

The most informative unused item wins — subject to content balancing. A skill already at
or above its fair share of the test is down-weighted by `1/(1 + overexposure)`, never hard
excluded: a genuinely more informative item still wins if nothing comparable exists in an
under-represented skill. Without this, the test becomes twenty grammar questions.

### Stopping

```
stop if  n ≥ 22
continue if n < 12
otherwise stop when SE ≤ 0.30
```

`SE ≤ 0.30` is roughly ±0.6 logits at 95% confidence — enough to place confidently
between adjacent CEFR bands.

### Mapping to CEFR

```
θ < 0.00           → B2
0.00 ≤ θ < 1.25    → C1
θ ≥ 1.25           → C2
```

Cut scores were set so that a learner answering B2 items reliably and C1 items at chance
lands in low C1 — the conventional "just over the boundary" reading. They must be
re-derived if the item bank is recalibrated; see
[EXTENDING.md](EXTENDING.md#placement-calibration).

### Subscores

Per-skill proportion correct, **weighted by difficulty** (`1 + max(0, b)`), so a skill
tested with harder items is not penalised for it. Skills more than 15 points below the
learner's own average are reported as lagging.

---

## 3. Pronunciation — `src/lib/speech/pronunciation.ts`

### What this can and cannot do

The browser's `SpeechRecognition` API returns **text**, not phonemes or acoustic
confidence. So the scorer measures what a listener actually experiences — whether the
words came across — rather than pretending to measure formants.

In practice this is a strong proxy: an ASR engine trained on native speech
mis-transcribes roughly the words a listener would mishear. It is not a phoneme-level
assessment, and the documentation and UI both say so.

### The four sub-scores

**Accuracy (40%)** — LCS word alignment between target and transcript. Exact matches
score 1, near matches (≥ 75% similarity) 0.5.

**Completeness (20%)** — the proportion of the target attempted, which catches someone
who tails off halfway.

**Fluency (20%)** — words per minute against a native band of 130–180. Below the band,
penalised at 0.8 points per wpm; above it, 0.5 — rushing costs less than stalling, but
still costs.

**Prosody (20%)** — a rhythm proxy. Stress-timed English protects content words and
swallows function words. A speaker with poor rhythm loses *content* words first, which is
the reverse of a native speaker, whose function words are the ones ASR drops. So:

```
prosody = 60 + (contentWordRate − overallRate)·120 + contentWordRate·30
```

Content words surviving better than average indicates good stress placement.

### Advice

Eight sound traps — the voiced and unvoiced *th*, three-consonant clusters, schwa
reduction, derivational stress shift, linking, and final /r/ — each with the advice that
actually fixes it rather than a description of the problem. Traps fire when the sound is
present in the target *and* either the affected word scored poorly or overall accuracy is
below 85%. Accent-specific traps (final /r/) only fire for the relevant accent.

Swapping in a phoneme-level provider (Azure Pronunciation Assessment, Google STT with
confidence scores) means replacing `score()` and keeping the same return shape — see
[EXTENDING.md](EXTENDING.md#pronunciation).

---

## 4. XP, levels and streaks — `src/lib/gamification.ts`

### The level curve

```
xpForLevel(n) = 100 · (n − 1)^1.6
```

Level 5 is about 1,400 XP — five days at a 50 XP goal. Level 50 is about 47,000. The
curve is gentle early and slow later, so "level" keeps signalling something at month six
instead of saturating.

### XP awards

```
xp = base × quality × streakMultiplier
     quality = 0.5 + 0.5·scoreRatio
     streakMultiplier = min(1.5, 1 + floor(days/7) × 0.1)
```

Base values pay more for **productive** work than for recognition tasks — writing 35,
debate turn 10, lesson 20, review card 2 — because productive work costs the learner more
effort, and the economy should not reward grinding easy multiple-choice.

The streak multiplier is capped at +50%. Uncapped, a year-long streak makes the
leaderboard unwinnable for anyone who started later. For the same reason,
daily-challenge rewards are flat and do not compound with it.

Repeating a completed lesson pays 25%.

### Streaks

Days are **UTC calendar days**, so a learner flying from Tokyo to London does not lose a
streak to a timezone change.

| Gap since last activity | Result |
|---|---|
| 0 days | No change |
| 1 day | Streak + 1 |
| 2 days, freeze available | Streak + 1, one freeze spent, flagged in the response |
| 2 days, no freeze | Reset to 1 |
| 3+ days | Reset to 1 (freezes are not spent on a long absence) |

`streakLongest` is preserved through every break.

### Badges

Thirty badges across four tiers, each with criteria `{ metric, gte }` evaluated against a
twelve-field metrics object. Progress is stored continuously, so an unearned badge shows a
progress bar rather than a blank.

The design rule: reward behaviours that correlate with improving, not behaviours that are
easy to measure. There is no badge for time spent — that rewards leaving a tab open.

### Daily challenges

Three per UTC day, chosen deterministically from the date so every learner gets the same
set (which is what makes a shared leaderboard fair):

1. **Easy** — cheap enough to guarantee a win.
2. **Medium** — requires a real session.
3. **Productive** — writing or speaking, rotating, because those are the ones people skip
   and the ones that move the CEFR needle.

Generated lazily on the first request of each day. The unique constraint on
`(date, type)` makes concurrent first-requests safe.

---

## 5. Text analysis — `src/lib/text.ts`

Dependency-free and deterministic, so the same numbers can be computed on the client
(live readability while writing) and on the server (stored feedback) without disagreeing.

- **Flesch Reading Ease** and **Flesch-Kincaid Grade** from a vowel-group syllable
  estimate.
- **Type-token ratio** — lexical variety. 0.55+ signals genuine range.
- **Lexical density** — share of content words. Academic prose runs above 0.5.
- **LCS word alignment** for dictation and pronunciation. A greedy scan mislabels one
  inserted word as a cascade of mismatches, which reads as "you got everything wrong" to
  a learner who dropped an article.

The readability formulas are undefined on empty input and return absurd values (ease
206.8, grade −15.6), so the writing studio suppresses them until there is text to measure.
