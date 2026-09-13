# Content authoring

All content lives in `prisma/content/` as typed TypeScript. It is compiled and
type-checked, so a malformed exercise is a build error rather than a runtime surprise —
and `npm run db:seed` is idempotent, so content updates ship to a live database without
touching learner progress.

```
prisma/content/
  types.ts            Authoring types
  placement.ts        Adaptive placement item bank
  lexicon.ts          Vocabulary, idioms, collocations, phrasal verbs
  track-academic.ts   Academic English Mastery
  track-business.ts   Professional Communication
  track-fluency.ts    Idiomatic Fluency + Near-Native Nuance
  track-exam.ts       Exam Preparation & Advanced Listening
  exams.ts            Timed exam modules
  badges.ts           Badge definitions
```

---

## Writing a lesson

```ts
{
  slug: "the-hedging-scale",
  title: "The Hedging Scale",
  subtitle: "From 'may suggest' to 'demonstrates'",
  skill: "WRITING",
  cefr: "C1",
  estimatedMinutes: 14,
  xpReward: 25,
  objectives: [
    "Rank hedging devices by the strength of commitment they signal",
    "Match the strength of a claim to the strength of its evidence",
  ],
  content: `Academic writing is not cautious by temperament…`,   // Markdown
  culturalNote: "Hedging norms vary sharply by discipline…",
  exercises: [ /* … */ ],
}
```

### What makes a good lesson here

**Objectives must be verifiable.** "Rank hedging devices by the strength of commitment
they signal" can be tested. "Understand hedging" cannot.

**`content` teaches the principle; exercises test it.** Every exercise in a lesson should
be answerable by someone who read the content and unanswerable by someone who did not. If
an exercise tests general knowledge, it belongs in a different lesson.

**Explain the mechanism, not just the rule.** The difference between "use *fewer* with
countable nouns" and an explanation of *why* English divides quantifiers that way is the
difference between something a learner memorises and something they generalise.

**`culturalNote` is for the pragmatic layer.** Where a language fact is really a cultural
fact — British indirectness, Anglo-American hedging conventions, which idioms sound like
management jargon — say so. This is the material advanced learners most often lack and
least often find in textbooks.

### Markdown subset supported

Headings (`##`–`#####`), `**bold**`, `*italic*`, `` `code` ``, `> blockquote`, ordered and
unordered lists, tables, `---`, and `[links](https://…)`. Rendered by
`src/components/markdown.tsx`, which parses to React elements and never uses
`dangerouslySetInnerHTML`.

---

## Writing exercises

Fifteen types. Full payload and solution contracts are in
[DATA-MODEL.md](DATA-MODEL.md#exercise-payload-and-solution-contracts); this section
covers how to author them well.

### Every exercise needs an `explanation`

It is shown immediately after answering — correct or not — and it is the most-read text in
the app. Explain *why* the key is right, not merely that it is:

```ts
explanation:
  "A cross-sectional design cannot establish causation, so the contrast is between a " +
  "weak reporting verb and a strong one. Any pair from those sets works."
```

### Distractors must be plausible

An exercise whose wrong answers are obviously wrong tests nothing. Good distractors are
things a learner at that level would actually produce:

```ts
// Testing: "cast doubt on"
options: ["throw", "cast", "put", "lay"]
// "throw doubt on" genuinely occurs but is much rarer — a real decision.
```

### Accept every reasonable variant

`GAP_FILL` and `TRANSFORMATION` take arrays of accepted answers. A learner marked wrong
for a correct alternative loses trust in the whole system:

```ts
solution: {
  answers: [
    ["suggest", "point to", "indicate", "imply"],
    ["establish", "prove", "demonstrate", "confirm"],
  ],
}
```

Case, punctuation and whitespace are normalised automatically, and a single-character slip
on a word of five or more characters is accepted as a spelling issue rather than marked
wrong.

### Link vocabulary to the lexicon

```ts
{ /* … */ lexicalItem: "bear out" }
```

Answering correctly (≥ 0.6) seeds an SRS card. The headword must match a `LEXICON` entry
exactly; the seed warns on the console if it does not.

---

## Adding lexical entries

```ts
{
  headword: "ostensibly",
  type: "WORD",
  cefr: "C1",
  pos: "adverb",
  ipa: "/ɒˈstensɪbli/",
  definition: "Apparently, according to the stated reason — with the implication that the real reason differs.",
  register: "FORMAL",
  connotation: "IRONIC",
  synonyms: ["nominally", "supposedly", "purportedly"],
  antonyms: ["genuinely", "actually"],
  collocations: ["ostensibly about", "ostensibly neutral"],
  examples: [
    { text: "The review was ostensibly about efficiency, though nobody believed that." },
  ],
  usageNote: "Never neutral. If you do not mean to cast doubt, use 'apparently' or nothing at all.",
  frequency: 250,
}
```

**`register` and `connotation` are the point.** At C1 the definition is rarely the
problem. What learners lack is knowing whether they can say this to a client
(`register`) and whether it is praise or an accusation (`connotation`). Fill them
honestly; `NEUTRAL` should be a considered choice, not a default.

**`usageNote` is for the trap.** Where a word is disputed (*fulsome*, *beg the question*),
regionally marked (*wind up*), or easily confused with a near-neighbour
(*mitigate*/*militate*), say so here.

**`frequency`** is a coarse corpus rank bucket, lower being more frequent. It orders the
new-card queue so common items are learned first. Rough is fine; the ordering is what
matters.

---

## Adding placement items

```ts
{
  skill: "GRAMMAR",
  cefr: "C1",
  discrimination: 1.6,     // a — higher for items isolating one feature
  difficulty: 0.3,         // b — the logit scale; see below
  guessing: 0.25,          // c — 1/options, lower if distractors are strong
  prompt: "Not only ___ the deadline, but she also delivered under budget.",
  options: ["she met", "did she meet", "she did meet", "met she"],
  answerIndex: 1,
  rationale: "A fronted negative adverbial triggers subject-auxiliary inversion…",
  tags: ["inversion", "emphasis"],
}
```

### Choosing `difficulty`

| Range | Corresponds to |
|---|---|
| −2.0 to −0.8 | Solid B2 |
| −0.8 to 0.0 | High B2 / low C1 |
| 0.0 to 1.25 | C1 |
| 1.25 to 2.0 | C2 |
| 2.0+ | Genuinely hard even for educated natives |

A well-formed bank is roughly uniform across this range. Gaps mean the test cannot
discriminate in that region and will burn items getting there.

### `rationale` is shown immediately

It is what makes the test worth taking even before the result. Explain the principle in
one or two sentences.

**After adding items**, re-run the seed. Note that the placement seed only replaces the
bank when its size has changed, to avoid orphaning completed tests — delete
`PlacementItem` rows manually if you are editing existing items during development.

---

## Adding exam modules

```ts
{
  exam: "CAE",
  slug: "cae-use-of-english-part-4",
  section: "Use of English",
  title: "Use of English — Key Word Transformation",
  description: "Six transformations testing grammar, collocation and phrasal verbs at once.",
  cefr: "C1",
  durationMin: 15,
  instructions: "Complete the second sentence so it means the same as the first…",
  tasks: [ /* … */ ],
}
```

Productive tasks (writing, speaking) carry a `rubric` instead of a closed key:

```ts
rubric: {
  criteria: {
    taskResponse: "Band 7+: discusses BOTH views substantively and states a clear position…",
    coherenceCohesion: "Band 7+: logical progression, one clear topic per paragraph…",
  },
  guidance: "Two common ceiling-setters: answering only one view, and writing under 250 words.",
}
```

The rubric is withheld during the attempt and released with the results, so it doubles as
review material.

Score conversion lives in `src/lib/exams.ts#toBand`. It is **indicative** — boards
re-equate raw scores per sitting and do not publish the tables — and the UI says so on
every score. If you add an exam, add its conversion there and keep the honesty.

---

## Adding badges

```ts
{
  slug: "five-hundred-mastered",
  title: "Lexicon",
  description: "Master five hundred lexical items.",
  icon: "brain",                 // any lucide-react icon name
  tier: "GOLD",
  criteria: { metric: "wordsMastered", gte: 500 },
}
```

`metric` must be a key of `BadgeMetrics` in `src/lib/gamification.ts`. Progress is
computed continuously, so an unearned badge shows a progress bar.

**The design rule:** reward behaviours that correlate with improving, not behaviours that
are easy to measure. There is deliberately no badge for time spent — that rewards leaving
a tab open.

---

## Shipping content

```bash
npm run typecheck       # catches malformed content at compile time
npm run db:seed         # idempotent upserts
npm run dev
```

The seed reports what it wrote:

```
Seeding Lexicon…
  lexicon: 41 entries
  placement: 33 items already present, skipping
  curriculum: 5 tracks, 12 lessons, 48 exercises
  exams: 6 modules, 16 tasks
  badges: 30
```

### What the seed replaces and what it preserves

| Content | Behaviour |
|---|---|
| Lexicon, tracks, units, lessons, exam modules, badges | Upserted on natural key — edits apply, learner progress untouched |
| Exercises, exam tasks | Deleted and recreated per lesson/module. `ExerciseAttempt.lessonProgressId` is `SetNull`, so attempt history survives |
| Placement items | Replaced only when the bank size changes, so completed tests are never orphaned |
| Demo user | Created only if absent; never overwrites a real account. Skipped in production unless `SEED_DEMO_USER=true` |
