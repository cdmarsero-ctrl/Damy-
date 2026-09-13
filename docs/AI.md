# The AI layer

Four surfaces use AI: the conversation partner, the debate opponent, the writing
assistant and the planning outliner. All four work without a model provider.

---

## The two paths

```
                ┌─────────────────────┐
Request ───────>│ OPENAI_API_KEY set? │
                └──────────┬──────────┘
             yes │                    │ no
                 ▼                    ▼
     ┌───────────────────┐   ┌──────────────────┐
     │ Rules pre-pass    │   │ Rules engine     │
     │        +          │   │ (alone)          │
     │ Model, validated  │   └────────┬─────────┘
     └─────────┬─────────┘            │
               │ null on any failure  │
               └──────────────────────┤
                                      ▼
                          source: "model" | "rules"
                          → surfaced in the UI
```

`source` is returned by every AI endpoint and displayed. A learner always knows what
produced their feedback.

---

## The rules engine — `src/lib/ai/rules.ts`, `heuristics.ts`

Not a stub. It runs as a **pre-pass even when a model is configured**, because mechanical
errors are caught more cheaply and more reliably by a regex than by a language model,
leaving the model to judge argument, nuance and tone.

### Design constraint

**Never invent an error.** A false positive on a correct sentence costs a learner far more
confidence than a missed error costs them accuracy. Every rule is high-precision by
construction, and the test suite includes eleven correct sentences that must produce zero
grammar findings.

### Coverage

Roughly 35 rules targeting errors that actually survive into B2–C2 writing:

| Category | Examples |
|---|---|
| Calqued prepositions and verb patterns | *depend of*, *discuss about*, *explain me*, *I am agree*, *married with*, *consist in* |
| Pluralised uncountables | *informations*, *advices*, *researches*, *equipments*, *evidences* |
| Quantifier confusion | *amount of people*, *less people* |
| Agreement and determiners | *there is many*, *one of the reason*, *more easier*, *the most biggest* |
| Modals and conditionals | *could of*, *if I would have* |
| Register slippage | *according to me*, *in my point of view*, *irregardless*, *a lot of* in formal prose, contractions in academic writing, *etc.* |
| Collocation | *make a research*, *take a decision*, *big problem*, *very important* |
| Cohesion | Opening with *But*/*And*/*So*, *in conclusion* overuse, *Nowadays* as an essay opener |

Rules declare `skipInGenres`, so contractions and *a lot of* are register issues in an
essay and unremarkable in an email.

### Span anchoring

Each correction carries `span: [start, end]` — character offsets into the learner's own
text. By default the span covers the whole regex match. A rule that deliberately matches
leading context (`". But "`) declares `anchor: 1` to highlight only the capture group.

This was originally inferred from the first capture group, which produced spans like
`"s of"` for *depends of* — highlighting the wrong words entirely. The explicit `anchor`
field replaced that inference, and a test now asserts that every span slices back to
exactly the `original` it claims.

### Structural analysis

Beyond individual errors, `profileStyle()` measures:

- **Passive ratio** — reported as a proportion, not a blanket warning. Some passive is
  correct in academic prose; 50%+ obscures agency.
- **Discourse-marker variety by function** — addition, contrast, cause, concession,
  exemplification, sequencing. Variety matters more than count.
- **Marked structures** — negative inversion, clefts, subjunctive, participle clauses,
  sustained nominalisation, concessive clauses. These are the C1→C2 "range" signal.
- **Hedging density** and **content-word repetition**.

---

## Prompting

### Conversation — `src/lib/ai/tutor.ts`

Three principles, from what actually helps advanced learners:

1. **Correct selectively.** Flagging every article slip in a C1 conversation destroys
   fluency practice. The prompt caps corrections at four and instructs the model to choose
   the errors that most affect how the learner is perceived, not the most numerous.
2. **Never break character to teach.** The reply is conversation; corrections travel in a
   separate JSON field the UI renders beside it.
3. **Argue honestly in debate mode.** A partner that concedes immediately is useless for
   argumentation practice. The prompt assigns a stance and instructs the model to attack
   the weakest link and concede only what it genuinely must.

The model is also told to pitch its own English slightly above the learner's level —
modelling the vocabulary and structures they should be acquiring, while staying
comprehensible.

### Writing — `src/lib/ai/writing.ts`

The model receives the **measured** features of the text alongside the text itself:

```
- 342 words in 14 sentences (mean 24.4, longest 47)
- Flesch reading ease 41.2, Flesch-Kincaid grade 13.8
- Type-token ratio 0.61, lexical density 0.53
- Passive voice in roughly 21% of clauses
- Discourse marker functions used: contrast, concession, cause
- Advanced structures detected: Negative inversion, Concessive clause
- Hedging devices: 5
- Rule-engine findings already detected: "depends of" → "depends on"; …
```

Grounding the judgement in numbers the learner can also see makes the feedback
reproducible and far harder for the model to hand-wave. Each genre carries its own brief
(what an abstract is judged on differs from what a cover letter is judged on), and the
prompt states plainly that inflated bands help nobody sitting a real exam.

---

## Validating model output

Everything the model returns is treated as untrusted.

### Corrections are re-anchored

A model asked to quote the learner's words will sometimes paraphrase them. So:

```ts
const start = learnerText.indexOf(correction.original);
if (start < 0) continue;   // model paraphrased — cannot highlight it honestly
```

A correction that highlights the wrong span is worse than no correction: it teaches the
learner that the feedback is unreliable. Fabricated quotations are dropped silently.

### Bands are clamped and cross-checked

Each criterion is clamped to `[0, 9]` and rounded to the nearest half band. If the model's
stated `overallBand` is absent or unparseable, the mean of its own criteria is used
instead — a model that contradicts itself is trusted on the detail rather than the
headline.

### Everything else

- `type` and `severity` must be members of their enums, or a safe default is applied.
- A correction where `original` equals `suggestion` is dropped.
- At most 4 corrections and 2 upgrades per conversational turn; 12 annotations per
  writing report.
- An empty response, a shape failure or a parse failure returns `null`, and the caller
  falls back to the rules engine.

### Merging

Rule findings that do not overlap a model finding are appended, so a mechanical error the
model overlooked still reaches the learner. Where both flag the same span, the model's
explanation wins.

---

## Reliability — `src/lib/ai/provider.ts`

| Concern | Handling |
|---|---|
| Timeout | 25 s hard abort via `AbortController` |
| Transient failure | One retry with 600 ms backoff on 429 / 5xx / network |
| Non-JSON response | Logged and treated as failure |
| Shape failure | Logged and treated as failure |
| Any failure | Returns `null`; the caller falls back |

A hung or rate-limited provider therefore produces *less detailed feedback*, never a 500
in the middle of someone's lesson. `maxRetries: 0` is set on the SDK so the timeout stays
honest rather than being multiplied by hidden internal retries.

Rate limiting is `RATE_LIMIT_AI_PER_MIN` per user (default 20).

---

## What each path can and cannot do

| | Model configured | Rules engine only |
|---|---|---|
| Free-form dialogue | Genuine, on-topic, responsive | Structured and acknowledging, but scripted |
| Error detection | Broad, including subtle collocation and naturalness | ~35 high-precision rules; misses more than it catches, but rarely wrong |
| Explanations | Tailored to the specific sentence | Authored per rule; accurate and generalisable, not personalised |
| Upgrades | Rewrites the learner's actual sentence | Pattern-matched from a curated map |
| Writing bands | Judged against descriptors, grounded in measurements | Computed from measurements alone |
| Task achievement | Genuinely assessed | Approximated by prompt-term overlap and length adequacy |
| Model answer | Yes | No |

The rules-only path is honest about being a floor rather than a verdict — every
rules-generated writing report says so.

---

## Swapping providers

`src/lib/ai/provider.ts` is the only file that talks to a model. Any OpenAI-compatible
endpoint works today by setting `OPENAI_BASE_URL` (Azure OpenAI, Together, Groq, a local
vLLM or Ollama server).

For a non-compatible provider (Anthropic, Google), reimplement `completeJson` with the
same signature — `(options, check) => Promise<T | null>` — and the rest of the app is
unchanged. See [EXTENDING.md](EXTENDING.md#swapping-the-ai-provider).

---

## Cost and privacy

- **Conversation**: one call per turn, ~900 output tokens.
- **Writing**: one call per submission, ~2,000 output tokens.
- **Outline**: one call, ~600 output tokens.
- **Grading, placement, SRS scheduling, pronunciation scoring**: no model calls at all.

What is sent to the provider: the learner's text, the topic and their CEFR level. What is
never sent: email address, name, identifiers, or any audio. Pronunciation scoring runs
entirely on the server from a locally produced transcript, with no provider involved.
