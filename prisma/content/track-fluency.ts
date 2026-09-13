import type { TrackSeed } from "./types";

/**
 * Idiomatic and near-native fluency. Two tracks live in this file: the
 * idiom/collocation work that gets a B2 learner sounding natural, and the C2
 * nuance track for learners whose grammar is already unremarkable and whose
 * remaining gap is connotation, implicature and stylistic control.
 */

export const FLUENCY_TRACK: TrackSeed = {
  slug: "idiomatic-fluency",
  title: "Idiomatic Fluency",
  description:
    "Stop sounding like a textbook. Idioms, phrasal verbs, collocation and the everyday figurative language that native speakers use without noticing.",
  goal: "EVERYDAY_FLUENCY",
  cefr: "B2",
  icon: "message-circle",
  accent: "amber",
  units: [
    {
      slug: "idioms-in-context",
      title: "Idioms in Context",
      description: "Meeting idioms where they actually live — and knowing when not to use them.",
      cefr: "B2",
      lessons: [
        {
          slug: "workplace-idioms",
          title: "Idioms at Work",
          subtitle: "The figurative language of meetings and email",
          skill: "VOCABULARY",
          cefr: "B2",
          estimatedMinutes: 12,
          xpReward: 25,
          objectives: [
            "Understand high-frequency workplace idioms in context",
            "Judge which idioms survive into writing and which do not",
            "Avoid the classic error of over-using idioms to sound fluent",
          ],
          content: `Workplace English is dense with figurative language, and most of it is invisible to native speakers. A meeting might contain *touch base*, *circle back*, *move the goalposts*, *the elephant in the room*, *low-hanging fruit*, *kick the can down the road* and *throw someone under the bus* — none of which mean anything from their parts.

Three things worth knowing.

**First, register varies enormously within the set.** *The elephant in the room* appears in broadsheet journalism. *Throw someone under the bus* does not appear in writing to a client, ever. *Touch base* is fine in an internal email and grating in a formal report.

**Second, idioms carry attitude.** *Move the goalposts* accuses someone of bad faith. *Kick the can down the road* accuses someone of cowardice. You cannot use them neutrally, and learners sometimes deploy them cheerfully without hearing the accusation.

**Third — and this is the hard one — density matters.** A native speaker uses perhaps one idiom per few minutes of speech. A learner who has just studied a list uses six in a paragraph, and the effect is not fluency but strangeness. The goal is not to use more idioms. It is to understand all of them and use a few, well.

Some high-value items:

- **low-hanging fruit** — the easiest available gains. Neutral, very common.
- **touch base** — make brief contact. Informal, internal only.
- **circle back** — return to a topic later. Often a polite deferral.
- **on the same page** — in agreement about the facts.
- **a hard sell** — difficult to persuade people to accept.
- **push back** — resist or object. Now a noun too: *there was some pushback*.`,
          culturalNote:
            "A large share of corporate idiom is American in origin and has spread globally through business culture — including into English-language workplaces in countries where nobody has ever seen a baseball. This means 'ballpark figure', 'touch base' and 'step up to the plate' are widely understood but can read as management jargon rather than as English. In some workplaces that is a badge; in others, mildly ridiculous.",
          exercises: [
            {
              type: "MATCHING",
              skill: "VOCABULARY",
              cefr: "B2",
              prompt: "Match each idiom to its meaning.",
              payload: {
                left: [
                  { id: "goalposts", label: "move the goalposts" },
                  { id: "elephant", label: "the elephant in the room" },
                  { id: "fruit", label: "low-hanging fruit" },
                  { id: "can", label: "kick the can down the road" },
                ],
                right: [
                  { id: "rules", label: "change the criteria mid-process, unfairly" },
                  { id: "obvious", label: "the obvious problem nobody will mention" },
                  { id: "easy", label: "the easiest available gains" },
                  { id: "delay", label: "postpone a decision rather than take it" },
                ],
              },
              solution: {
                pairs: { goalposts: "rules", elephant: "obvious", fruit: "easy", can: "delay" },
              },
              explanation:
                "Three of these four are accusations. Only 'low-hanging fruit' is neutral — which is why it is the one you will hear most often in a meeting where people are being careful.",
              points: 15,
              tags: ["idioms"],
              lexicalItem: "move the goalposts",
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "VOCABULARY",
              cefr: "B2",
              prompt:
                "Which sentence uses an idiom inappropriately for its context?",
              payload: {
                options: [
                  "Internal email: “Shall we touch base on Thursday?”",
                  "Formal report: “The department threw the contractor under the bus.”",
                  "Meeting: “Let's start with the low-hanging fruit.”",
                  "Opinion column: “The agreement merely kicks the can down the road.”",
                ],
              },
              solution: { answerIndex: 1 },
              explanation:
                "'Throw under the bus' is firmly informal and it attributes bad faith — in a formal report it is both a register error and potentially a defamatory characterisation. 'The department attributed responsibility to the contractor' is what a report says.",
              points: 15,
              tags: ["register", "idioms"],
              lexicalItem: "throw someone under the bus",
            },
            {
              type: "GAP_FILL",
              skill: "VOCABULARY",
              cefr: "B2",
              prompt:
                "Fill each gap with one idiom.\n\n“Nobody wants to mention it, but the budget gap is (1) ___ ___ ___ ___. Meanwhile the review has been postponed again — we're just (2) ___ ___ ___ ___ ___ ___.”",
              payload: {
                gaps: [
                  { placeholder: "4 words — the obvious unmentioned problem" },
                  { placeholder: "6 words — postponing the decision" },
                ],
              },
              solution: {
                answers: [
                  ["the elephant in the room", "an elephant in the room"],
                  ["kicking the can down the road", "kicking the can further down the road"],
                ],
              },
              explanation:
                "Both idioms are fixed — you cannot say 'the elephant in the office' or 'kicking the tin down the road' and be understood as idiomatic. Fixedness is what distinguishes an idiom from a metaphor you made up.",
              points: 20,
              tags: ["idioms", "fixed-expressions"],
              lexicalItem: "the elephant in the room",
            },
            {
              type: "MULTI_SELECT",
              skill: "VOCABULARY",
              cefr: "B2",
              prompt: "Select every idiom that implies criticism of someone's behaviour.",
              payload: {
                options: [
                  "move the goalposts",
                  "low-hanging fruit",
                  "kick the can down the road",
                  "on the same page",
                  "paper over the cracks",
                  "touch base",
                ],
              },
              solution: { answerIndexes: [0, 2, 4] },
              explanation:
                "Bad faith, cowardice and superficiality respectively. Knowing which idioms are loaded is what stops you accidentally accusing a colleague of something while trying to sound fluent.",
              points: 20,
              tags: ["connotation"],
              lexicalItem: "paper over the cracks",
            },
          ],
        },
      ],
    },
    {
      slug: "phrasal-verb-precision",
      title: "Phrasal Verb Precision",
      description: "The grammar of phrasal verbs, and choosing between the phrasal and Latinate options.",
      cefr: "B2",
      lessons: [
        {
          slug: "separable-and-register",
          title: "Separability and Register",
          subtitle: "Why 'bear out' and 'corroborate' are not interchangeable",
          skill: "GRAMMAR",
          cefr: "C1",
          estimatedMinutes: 13,
          xpReward: 25,
          objectives: [
            "Apply the separability rules, including the pronoun constraint",
            "Choose between a phrasal verb and its Latinate equivalent by register",
            "Recognise phrasal verbs that have become formal",
          ],
          content: `**Separability.** Transitive phrasal verbs come in two kinds.

*Separable*: the object can sit either side of the particle.
> *She turned down the offer.* / *She turned the offer down.*

*Inseparable*: it cannot.
> *We came across a problem.* — never *we came a problem across*.

There is one hard rule that overrides everything: **a pronoun object must come before the particle** in a separable verb.
> *She turned it down.* ✓
> *She turned down it.* ✗

This is the rule that most reliably marks out a non-native speaker, because it never varies.

**Register.** English usually offers a Germanic phrasal verb and a Latinate single verb for the same idea:

| Phrasal | Latinate |
|---|---|
| put off | postpone |
| find out | ascertain, discover |
| look into | investigate |
| go up | increase |
| turn down | reject, decline |
| back up | corroborate, substantiate |

The Latinate option is more formal — but "more formal" does not mean "better". Academic and legal writing prefers the Latinate; almost everything else sounds stilted if you use it exclusively. *We ascertained that he had gone out* is not good English; it is a register collision.

**And some phrasal verbs are formal.** *Bear out*, *set forth*, *call for*, *consist of*, *result in* — these are perfectly at home in academic prose. The phrasal/formal equation is a rough heuristic, not a rule.`,
          exercises: [
            {
              type: "MULTIPLE_CHOICE",
              skill: "GRAMMAR",
              cefr: "B2",
              prompt: "Which sentence is ungrammatical?",
              payload: {
                options: [
                  "She turned the offer down.",
                  "She turned down the offer.",
                  "She turned it down.",
                  "She turned down it.",
                ],
              },
              solution: { answerIndex: 3 },
              explanation:
                "A pronoun object must precede the particle in a separable phrasal verb. This rule has no exceptions, which makes it one of the few genuinely mechanical checks you can run on your own writing.",
              points: 10,
              tags: ["separability"],
            },
            {
              type: "MATCHING",
              skill: "VOCABULARY",
              cefr: "C1",
              prompt: "Match each phrasal verb to its formal equivalent.",
              payload: {
                left: [
                  { id: "look", label: "look into" },
                  { id: "putoff", label: "put off" },
                  { id: "backup", label: "back up (a claim)" },
                  { id: "findout", label: "find out" },
                ],
                right: [
                  { id: "invest", label: "investigate" },
                  { id: "postpone", label: "postpone" },
                  { id: "corrob", label: "corroborate" },
                  { id: "ascertain", label: "ascertain" },
                ],
              },
              solution: {
                pairs: { look: "invest", putoff: "postpone", backup: "corrob", findout: "ascertain" },
              },
              explanation:
                "These pairs are near-synonyms but not free variants: 'corroborate' requires independent evidence in a way 'back up' does not, and 'ascertain' implies the finding is now certain.",
              points: 15,
              tags: ["register"],
              lexicalItem: "ascertain",
            },
            {
              type: "GAP_FILL",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Complete with a phrasal verb that is appropriate for academic writing.\n\n“The longitudinal data (1) ___ ___ the original hypothesis, and the effect (2) ___ ___ a measurable improvement in retention.”",
              payload: {
                gaps: [{ placeholder: "2 words — confirm" }, { placeholder: "2 words — produce" }],
              },
              solution: {
                answers: [
                  ["bear out", "bears out", "bore out"],
                  ["results in", "result in", "resulted in"],
                ],
              },
              explanation:
                "Both are phrasal verbs and both are perfectly formal — evidence that the 'phrasal = informal' rule is a heuristic. Note the past participle of 'bear out' is 'borne out', not 'born out'.",
              points: 15,
              tags: ["academic", "phrasal-verbs"],
              lexicalItem: "bear out",
            },
            {
              type: "ERROR_CORRECTION",
              skill: "GRAMMAR",
              cefr: "C1",
              prompt: "Correct the phrasal verb error in each sentence.",
              payload: {
                lines: [
                  "I'll look it into and report back tomorrow.",
                  "We had to put off it until the new year.",
                  "The committee ascertained that the meeting had been called off by them.",
                ],
              },
              solution: {
                corrections: [
                  {
                    accepted: ["I'll look into it and report back tomorrow"],
                    hint: "'Look into' is inseparable — the object cannot split it.",
                  },
                  {
                    accepted: ["We had to put it off until the new year"],
                    hint: "Pronoun object must precede the particle.",
                  },
                  {
                    accepted: [
                      "The committee found out that they had cancelled the meeting",
                      "The committee discovered that they had cancelled the meeting",
                      "The committee found out that the meeting had been cancelled",
                      "The committee learned that they had called off the meeting",
                    ],
                    hint: "Register collision: a formal Latinate verb, an informal phrasal verb, and a clumsy passive agent in one sentence.",
                  },
                ],
              },
              explanation:
                "The third is the interesting one. Nothing in it is ungrammatical — it is a *register* failure, mixing 'ascertained' with 'called off' and then adding an agentive 'by them' that a natural sentence would simply make the subject.",
              points: 25,
              tags: ["error-correction", "register"],
            },
          ],
        },
      ],
    },
  ],
};

export const NUANCE_TRACK: TrackSeed = {
  slug: "near-native-nuance",
  title: "Near-Native Nuance",
  description:
    "For learners whose English is already accurate. Connotation, implicature, understatement, and the stylistic choices that separate correct English from native English.",
  goal: "CULTURE",
  cefr: "C2",
  icon: "sparkles",
  accent: "violet",
  units: [
    {
      slug: "implicature",
      title: "Saying Without Saying",
      description: "Implicature, understatement and the English art of the unsaid.",
      cefr: "C2",
      lessons: [
        {
          slug: "understatement-and-irony",
          title: "Understatement and Irony",
          subtitle: "'Not bad' and other lies",
          skill: "LISTENING",
          cefr: "C2",
          estimatedMinutes: 15,
          xpReward: 35,
          objectives: [
            "Decode litotes and ironic understatement",
            "Recognise the prosodic and lexical cues that mark irony",
            "Produce understatement appropriately without sounding sarcastic",
          ],
          content: `English — British English especially — systematically says less than it means, and expects the listener to restore the difference.

**Litotes** is understatement by negating the opposite:
> *That's not bad.* → That's good, possibly very good.
> *She's not unintelligent.* → She is clever; I am being careful about why I am saying so.
> *It wasn't the warmest reception.* → It was hostile.

**Ironic understatement** goes further, describing something extreme in deliberately mild terms:
> *The meeting was a touch awkward.* — after a colleague was dismissed in front of everyone.
> *We had a minor disagreement.* — about a lawsuit.

The cues that mark this as irony rather than genuine mildness:

1. **Lexical mismatch** — a mild adjective attached to something obviously extreme.
2. **Hedging intensifiers** — *a touch*, *slightly*, *a bit*, *somewhat* stacked on top of a strong noun.
3. **Prosody** — a slight lengthening on the hedge, and a flatter contour than sincerity would carry.
4. **Shared knowledge** — irony only works if both parties know the truth. This is why it fails across cultures: not because the listener lacks English, but because they lack the shared frame.

**The danger for learners** is not comprehension — it is production. Understatement delivered without the prosody reads as sincere, and irony delivered too broadly reads as sarcasm, which is aggressive. The reliable rule: understate things that are *bad for you* (*a slightly difficult year*, after a redundancy) and never understate things that are bad for the person you are talking to.`,
          culturalNote:
            "The British-American gap here is real and consequential. 'That's an interesting idea' from a British colleague frequently means 'no'; from an American colleague it more often means what it says. The Anglo-Dutch business world has produced entire circulated glossaries of this — half joke, half survival guide. If you work across these cultures, the safest approach is to ask directly what someone means when the stakes are high, and not to rely on your reading of the understatement.",
          exercises: [
            {
              type: "LISTENING_COMPREHENSION",
              skill: "LISTENING",
              cefr: "C2",
              prompt:
                "“Well, it wasn't our finest quarter.” The speaker's company lost 40% of its value. What is the speaker doing?",
              payload: {
                transcript: "Well, it wasn't our finest quarter.",
                options: [
                  "Minimising because they do not know the figures",
                  "Understating deliberately — the listener knows the real scale",
                  "Being evasive and hoping not to be pressed",
                  "Expressing genuine mild disappointment",
                ],
              },
              solution: { answerIndex: 1 },
              explanation:
                "Litotes ('wasn't our finest') plus shared knowledge of the actual figure. The understatement is not concealment — everybody knows — it is a way of acknowledging disaster without dramatising it, which English treats as composure.",
              points: 20,
              tags: ["litotes", "implicature"],
            },
            {
              type: "MATCHING",
              skill: "LISTENING",
              cefr: "C2",
              prompt: "Match each British understatement to what it usually means.",
              payload: {
                left: [
                  { id: "a", label: "That's an interesting idea." },
                  { id: "b", label: "I'll bear it in mind." },
                  { id: "c", label: "With the greatest respect…" },
                  { id: "d", label: "I'm sure it's my fault, but…" },
                ],
                right: [
                  { id: "no", label: "No, and I am not going to argue about it." },
                  { id: "forget", label: "I have already forgotten it." },
                  { id: "wrong", label: "You are wrong and I am about to say so." },
                  { id: "your", label: "It is entirely your fault." },
                ],
              },
              solution: { pairs: { a: "no", b: "forget", c: "wrong", d: "your" } },
              explanation:
                "These are conventionalised — they are not creative irony but fixed politeness formulae whose literal meaning has worn away. 'With the greatest respect' is the clearest: it reliably precedes disrespect.",
              points: 20,
              tags: ["pragmatics", "culture"],
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "SPEAKING",
              cefr: "C2",
              prompt:
                "A colleague's project has just failed publicly. Which response is appropriate?",
              payload: {
                options: [
                  "Well, that didn't go brilliantly, did it.",
                  "That's rough. Anything I can do?",
                  "A slightly disappointing outcome, one might say.",
                  "I'm sure it's fine.",
                ],
              },
              solution: { answerIndex: 1 },
              explanation:
                "The rule holds: understate your own misfortunes, never someone else's. Options 1 and 3 turn the colleague's failure into material for wit, which lands as cruelty regardless of intention. Option 4 denies the reality.",
              points: 20,
              tags: ["pragmatics", "judgement"],
            },
            {
              type: "OPEN_WRITING",
              skill: "WRITING",
              cefr: "C2",
              prompt:
                "Describe a genuinely difficult experience of your own using understatement throughout. 60-100 words.",
              instructions:
                "Do not name the difficulty directly. Let the reader work out the scale from what you understate.",
              payload: { minWords: 55 },
              solution: { minWords: 55 },
              explanation:
                "The test of successful understatement: a reader who did not witness the events should still finish with an accurate sense of how bad they were. If the reader concludes it was mildly inconvenient, the understatement has simply become inaccuracy.",
              points: 25,
              tags: ["production", "style"],
            },
          ],
        },
        {
          slug: "connotation-and-register",
          title: "Connotation, Not Definition",
          subtitle: "Words that mean the same and do not",
          skill: "VOCABULARY",
          cefr: "C2",
          estimatedMinutes: 14,
          xpReward: 35,
          objectives: [
            "Distinguish near-synonyms by connotation rather than denotation",
            "Choose vocabulary that carries the evaluation you intend",
            "Recognise words that cannot be used neutrally",
          ],
          content: `At C2 the dictionary stops helping. *Slim*, *slender*, *thin*, *skinny*, *scrawny*, *emaciated* all denote the same physical property, and you cannot substitute one for another.

Three dimensions organise most of this.

**Evaluation.** Does the word praise, criticise or neither?
> *determined* / *stubborn* / *pig-headed* — one property, three verdicts.
> *thrifty* / *economical* / *tight-fisted*
> *confident* / *self-assured* / *arrogant*

**Formality.** Where does it sit on the register scale?
> *drunk* / *intoxicated* / *inebriated* / *hammered*

**Intensity.** How far along the scale?
> *annoyed* / *angry* / *furious* / *incandescent*

Some words cannot be used neutrally at all. *Ostensibly* always casts doubt. *Regime* always disapproves — a government you like is a government. *Admit* always implies prior reluctance: *she admitted she was right* says something quite different from *she said she was right*.

**The learner trap** is the thesaurus. Replacing a repeated word with a synonym from a list is how you end up writing *the scrawny evidence* or *an incandescent disagreement about scheduling*. Repetition is a far smaller flaw than a connotation error: a reader forgives the first and notices the second.`,
          exercises: [
            {
              type: "DRAG_ORDER",
              skill: "VOCABULARY",
              cefr: "C2",
              prompt: "Order from most approving to most disapproving.",
              payload: {
                items: [
                  { id: "determined", label: "determined" },
                  { id: "persistent", label: "persistent" },
                  { id: "stubborn", label: "stubborn" },
                  { id: "pigheaded", label: "pig-headed" },
                ],
              },
              solution: { order: ["determined", "persistent", "stubborn", "pigheaded"] },
              explanation:
                "The denotation is constant across all four: continuing despite obstacles. Only the evaluation moves. This is why 'stubborn' cannot be praise and 'determined' cannot be criticism, however you frame the sentence.",
              points: 15,
              tags: ["connotation"],
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "VOCABULARY",
              cefr: "C2",
              prompt:
                "“The minister admitted that the figures had been revised.” What does 'admitted' add that 'said' would not?",
              payload: {
                options: [
                  "Nothing — they are interchangeable here",
                  "That the revision was recent",
                  "That the minister was reluctant, implying the revision is damaging",
                  "That the minister was speaking formally",
                ],
              },
              solution: { answerIndex: 2 },
              explanation:
                "'Admit' presupposes reluctance and therefore damage. This is why journalistic style guides warn against it for neutral reporting — the verb convicts before the sentence ends.",
              points: 15,
              tags: ["connotation", "reporting-verbs"],
            },
            {
              type: "GAP_FILL",
              skill: "VOCABULARY",
              cefr: "C2",
              prompt:
                "Choose the word whose connotation fits.\n\n“His refusal to answer was (1) ___ to an admission. The explanation offered later was frankly (2) ___.”",
              payload: {
                gaps: [
                  { placeholder: "adjective + to" },
                  { placeholder: "adjective — feigned innocence" },
                ],
              },
              solution: {
                answers: [
                  ["tantamount"],
                  ["disingenuous"],
                ],
              },
              explanation:
                "'Tantamount to' always escalates — X was equivalent to something worse. 'Disingenuous' accuses someone of pretending not to know. Both are precise, both are hostile, and neither has a neutral use.",
              points: 20,
              tags: ["connotation"],
              lexicalItem: "tantamount",
            },
            {
              type: "MULTI_SELECT",
              skill: "VOCABULARY",
              cefr: "C2",
              prompt: "Select every word that CANNOT be used neutrally.",
              payload: {
                options: [
                  "ostensibly",
                  "apparently",
                  "regime",
                  "administration",
                  "disingenuous",
                  "mistaken",
                ],
              },
              solution: { answerIndexes: [0, 2, 4] },
              explanation:
                "'Ostensibly' casts doubt on the stated reason; 'regime' disapproves of the government it names; 'disingenuous' accuses. Their neutral twins — 'apparently', 'administration', 'mistaken' — carry no verdict.",
              points: 20,
              tags: ["connotation"],
              lexicalItem: "ostensibly",
            },
          ],
        },
      ],
    },
  ],
};
