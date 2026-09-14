import type { TrackSeed } from "./types";

/**
 * Academic English — the track for learners heading into English-medium study
 * or publication. The organising idea is that academic English is not "formal
 * English with longer words": it is a set of moves (hedging, positioning,
 * signposting, attributing) that do specific rhetorical work.
 */
export const ACADEMIC_TRACK: TrackSeed = {
  slug: "academic-english",
  title: "Academic English Mastery",
  description:
    "Write and read like someone who belongs in the seminar room. Hedging, positioning, citation, critical reading and the discourse patterns of published research.",
  goal: "ACADEMIC",
  cefr: "C1",
  icon: "graduation-cap",
  accent: "indigo",
  units: [
    {
      slug: "hedging-and-stance",
      title: "Hedging, Boosting and Stance",
      description:
        "Calibrating how strongly you commit to a claim — the single most visible difference between learner and expert academic prose.",
      cefr: "C1",
      lessons: [
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
            "Avoid the two failure modes: overclaiming and hedging into meaninglessness",
          ],
          content: `Academic writing is not cautious by temperament. It is cautious by obligation: a claim must be pitched at exactly the strength the evidence supports, and no higher.

Consider the same finding expressed five ways:

1. The data **prove** that the intervention works.
2. The data **demonstrate** that the intervention is effective.
3. The data **indicate** that the intervention is effective.
4. The data **suggest** that the intervention **may** be effective.
5. The data are **consistent with** the possibility that the intervention **may** be effective **in some settings**.

Sentence 1 is almost never defensible — outside mathematics, data do not prove. Sentence 5 has hedged itself into saying nothing at all. The craft lies in 2, 3 and 4, and in knowing which one your evidence has earned.

Three hedging resources do most of the work:

**Modal verbs** — *may, might, could, would*. These hedge the proposition itself.
**Reporting verbs** — *suggest, indicate, imply, point to, demonstrate, establish*. These hedge by describing what the evidence does rather than asserting the fact.
**Scope limiters** — *in this sample, under these conditions, for this population, to some extent*. These hedge by restricting where the claim applies.

The third is the most valuable and the most neglected. A limited claim that is certainly true is worth more than a universal claim that is probably false — and reviewers know the difference.`,
          culturalNote:
            "Hedging norms vary sharply by discipline and by academic culture. German and Russian academic traditions tolerate far more direct assertion than Anglo-American journals, and writers moving between them are often told they sound either arrogant or evasive. Neither is a language error — it is a rhetorical convention, and it is learnable.",
          exercises: [
            {
              type: "MULTIPLE_CHOICE",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "A single study of 40 participants in one clinic found a positive effect. Which sentence pitches the claim correctly?",
              payload: {
                options: [
                  "These results prove the treatment is effective.",
                  "These results demonstrate that the treatment works for this condition.",
                  "These results suggest the treatment may be effective in comparable clinical settings.",
                  "It is possible that these results might perhaps indicate something about the treatment.",
                ],
              },
              solution: { answerIndex: 2 },
              explanation:
                "Forty participants in one clinic supports a hedged claim with a scope limiter. Option 2 overclaims for a single small study; option 4 hedges so heavily it asserts nothing a reader could disagree with — which is its own kind of failure.",
              points: 10,
              tags: ["hedging"],
            },
            {
              type: "DRAG_ORDER",
              skill: "WRITING",
              cefr: "C1",
              prompt: "Order these reporting verbs from weakest to strongest commitment.",
              instructions: "Drag to arrange. Weakest claim first.",
              payload: {
                items: [
                  { id: "hint", label: "hints at" },
                  { id: "suggest", label: "suggests" },
                  { id: "indicate", label: "indicates" },
                  { id: "demonstrate", label: "demonstrates" },
                  { id: "establish", label: "establishes" },
                ],
              },
              solution: { order: ["hint", "suggest", "indicate", "demonstrate", "establish"] },
              explanation:
                "'Hints at' barely commits; 'establishes' claims the matter is settled. Most published findings live between 'suggests' and 'indicates' — reach for 'demonstrates' only when a reviewer could not reasonably object.",
              points: 15,
              tags: ["reporting-verbs"],
            },
            {
              type: "GAP_FILL",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Complete the hedged claim: “The correlation is strong, but the design is cross-sectional; the results therefore (1) ___ a causal relationship rather than (2) ___ one.”",
              payload: {
                gaps: [
                  { placeholder: "weaker verb" },
                  { placeholder: "stronger verb" },
                ],
              },
              solution: {
                answers: [
                  ["suggest", "point to", "indicate", "imply"],
                  ["establish", "prove", "demonstrate", "confirm"],
                ],
              },
              explanation:
                "A cross-sectional design cannot establish causation, so the contrast is between a weak reporting verb and a strong one. Any pair from those sets works.",
              points: 15,
              tags: ["hedging", "causation"],
              lexicalItem: "conclusive proof",
            },
            {
              type: "REGISTER_SHIFT",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Rewrite for an academic abstract: “Everyone knows social media is terrible for teenagers' mental health and something obviously needs to be done about it.”",
              instructions:
                "Keep the substance. Remove the overclaim, attribute the position, and hedge to what evidence could plausibly support.",
              payload: {
                original:
                  "Everyone knows social media is terrible for teenagers' mental health and something obviously needs to be done about it.",
                targetRegister: "ACADEMIC",
                minWords: 20,
              },
              solution: {
                mustInclude: ["evidence", "may", "adolescent"],
                mustAvoid: ["everyone knows", "terrible", "obviously"],
                minWords: 20,
              },
              explanation:
                "A publishable version might read: “A growing body of evidence suggests that intensive social media use may be associated with poorer mental health outcomes among adolescents, though the direction of causation remains contested.” Note the three moves: attribute ('evidence suggests'), hedge ('may be associated'), and concede what is unresolved.",
              points: 20,
              tags: ["register", "hedging"],
            },
          ],
        },
        {
          slug: "positioning-your-voice",
          title: "Positioning Your Voice",
          subtitle: "Entering a conversation that started without you",
          skill: "WRITING",
          cefr: "C1",
          estimatedMinutes: 12,
          xpReward: 25,
          objectives: [
            "Use the create-a-research-space moves to open a piece of writing",
            "Attribute positions to other writers without endorsing them",
            "Mark the transition from other people's work to your own contribution",
          ],
          content: `Every piece of academic writing enters an existing conversation. Readers need to know three things quickly: what has been said, what is missing, and what you are adding.

John Swales called this the **CARS** model — Create A Research Space. The three moves:

**Move 1: Establish the territory.** What is known and why it matters.
> *Research into bilingual acquisition has focused overwhelmingly on early childhood.*

**Move 2: Establish a niche.** What is missing, contested or wrong.
> *Comparatively little attention has been paid to adult learners who reach near-native proficiency.*

**Move 3: Occupy the niche.** What you are doing about it.
> *This study examines twelve such learners over a three-year period.*

The niche move is where learners most often fail — not through grammar, but through nerve. A gap has to be stated as a gap. "Some researchers have looked at this but not many" is not a niche; "the question of X remains unresolved" is.

The attribution verbs matter here too. Compare:

- *Smith (2019) **shows** that…* — you agree.
- *Smith (2019) **argues** that…* — neutral; you are reporting a position.
- *Smith (2019) **claims** that…* — you are distancing yourself, possibly sceptically.
- *Smith (2019) **asserts**, without evidence, that…* — you are attacking.

Choosing 'claims' when you meant 'argues' picks a fight you did not intend.`,
          exercises: [
            {
              type: "MATCHING",
              skill: "READING",
              cefr: "C1",
              prompt: "Match each sentence to the CARS move it performs.",
              payload: {
                left: [
                  { id: "a", label: "Corpus methods have transformed lexicography over the past three decades." },
                  { id: "b", label: "Yet the treatment of low-frequency idioms remains largely impressionistic." },
                  { id: "c", label: "This paper proposes a frequency-weighted approach to idiom selection." },
                ],
                right: [
                  { id: "territory", label: "Move 1 — establish the territory" },
                  { id: "niche", label: "Move 2 — establish a niche" },
                  { id: "occupy", label: "Move 3 — occupy the niche" },
                ],
              },
              solution: { pairs: { a: "territory", b: "niche", c: "occupy" } },
              explanation:
                "Notice the hinge word 'Yet' opening move 2. A contrastive marker is almost always where the niche appears — it is the writer turning from what exists to what is missing.",
              points: 15,
              tags: ["CARS", "structure"],
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "READING",
              cefr: "C1",
              prompt:
                "“Petrov (2021) asserts that the effect is universal, offering three case studies in support.” What is the writer signalling?",
              payload: {
                options: [
                  "Agreement with Petrov",
                  "Neutral reporting of Petrov's position",
                  "Scepticism — three case studies are thin support for a universal claim",
                  "That Petrov's work is the foundation of this paper",
                ],
              },
              solution: { answerIndex: 2 },
              explanation:
                "'Asserts' plus the deflating detail 'offering three case studies' does the work. The writer has not said Petrov is wrong — they have arranged the facts so the reader concludes it. This is standard academic criticism: never rude, rarely direct.",
              points: 10,
              tags: ["attribution", "stance"],
              lexicalItem: "ostensibly",
            },
            {
              type: "GAP_FILL",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Complete the niche move: “Although the economic effects have been modelled extensively, the distributional consequences (1) ___ largely (2) ___.”",
              payload: {
                gaps: [{ placeholder: "verb" }, { placeholder: "adjective/participle" }],
              },
              solution: {
                answers: [
                  ["remain", "have remained", "are"],
                  ["unexplored", "unexamined", "neglected", "overlooked", "under-researched", "underexplored"],
                ],
              },
              explanation:
                "'Remain unexplored' is the workhorse formulation of the niche move. The 'Although X, Y' frame concedes existing work before naming the gap — which is both accurate and politic, since the authors of X may review your paper.",
              points: 15,
              tags: ["CARS", "collocation"],
            },
            {
              type: "OPEN_WRITING",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Write an opening paragraph (3-4 sentences) for a paper on a topic you know well, using all three CARS moves in order.",
              instructions:
                "Name the territory, state a genuine gap, then say what your paper does. Around 70 words.",
              payload: { minWords: 60, placeholder: "Research into…" },
              solution: { minWords: 60 },
              explanation:
                "Check your own draft: can a reader point to the exact sentence where the gap appears? If not, the niche move has gone missing — the most common structural failure in submitted abstracts.",
              points: 20,
              tags: ["CARS", "production"],
            },
          ],
        },
      ],
    },
    {
      slug: "critical-reading",
      title: "Critical Reading",
      description:
        "Reading for what a text is doing, not only what it says: inference, tone, bias and rhetorical technique.",
      cefr: "C1",
      lessons: [
        {
          slug: "detecting-bias",
          title: "Detecting Bias and Framing",
          subtitle: "How word choice does argument's work quietly",
          skill: "READING",
          cefr: "C1",
          estimatedMinutes: 15,
          xpReward: 30,
          objectives: [
            "Identify loaded lexis, selective attribution and passive agency-hiding",
            "Distinguish a factual claim from an evaluative one dressed as fact",
            "Describe a text's stance in precise terms rather than 'biased'",
          ],
          content: `Bias in serious writing is rarely a matter of false statements. It is a matter of *selection* and *framing* — and both are visible in the grammar.

**Loaded lexis.** Compare: *the regime* / *the government*; *bureaucrats* / *civil servants*; *slashed* / *reduced*; *a hike* / *an increase*. Each pair denotes the same thing and evaluates it oppositely.

**Agency deletion.** The passive can hide who did something:
> *Mistakes were made.* — By whom? The construction exists precisely so that question need not be answered.

Nominalisation does the same work:
> *The decision to close the ward attracted criticism.* — Someone decided. The noun 'decision' has removed them.

**Selective attribution.** Which claims get a source and which are presented as background?
> *Critics allege the scheme is wasteful. The scheme has delivered 4,000 homes.*
The first is attributed to unnamed critics and marked 'allege'; the second is stated as fact. Both may be contested; only one has been framed as opinion.

**Presupposition.** Some claims are smuggled in as assumptions rather than asserted, which makes them hard to dispute:
> *When did the department abandon its commitment to transparency?*
To answer at all is to accept that it was abandoned.

The skill is not detecting that a text has a view — every text does. It is naming the *mechanism*, because that is what you can then answer.`,
          culturalNote:
            "British broadsheet journalism and American reporting handle attribution differently: US news style typically attributes every contested claim explicitly, while British comment pieces blend reporting and evaluation much more freely. A text that reads as 'biased' to one audience may read as normal editorial voice to the other.",
          exercises: [
            {
              type: "READING_ANALYSIS",
              skill: "READING",
              cefr: "C1",
              prompt:
                "“Following a series of unfortunate miscommunications, funds were redirected, and a number of long-standing programmes were regrettably discontinued.” Which mechanism is doing the most work here?",
              payload: {
                passage:
                  "Following a series of unfortunate miscommunications, funds were redirected, and a number of long-standing programmes were regrettably discontinued.",
                options: [
                  "Loaded lexis",
                  "Agency deletion through the passive",
                  "Presupposition",
                  "Selective attribution",
                ],
              },
              solution: { answerIndex: 1 },
              explanation:
                "Three passives in one sentence — 'were redirected', 'were discontinued' — and 'miscommunications' nominalises whatever someone actually did. Nobody appears in the sentence at all. That is not clumsy writing; it is the point of the sentence.",
              points: 15,
              tags: ["passive", "agency"],
            },
            {
              type: "MULTI_SELECT",
              skill: "READING",
              cefr: "C1",
              prompt:
                "Select every phrase that evaluates while appearing to describe.",
              payload: {
                options: [
                  "the so-called reforms",
                  "the proposed reforms",
                  "a hike in rates",
                  "an increase in rates",
                  "admitted that the data was incomplete",
                  "stated that the data was incomplete",
                ],
              },
              solution: { answerIndexes: [0, 2, 4] },
              explanation:
                "'So-called' disputes the label; 'hike' connotes something sudden and unwelcome where 'increase' is neutral; 'admitted' implies reluctance and prior concealment where 'stated' implies neither. Each has a neutral twin in the list.",
              points: 20,
              tags: ["lexis", "connotation"],
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "READING",
              cefr: "C2",
              prompt:
                "“Given the department's well-documented reluctance to publish inconvenient findings, the delay is unsurprising.” What is the writer doing?",
              payload: {
                options: [
                  "Providing evidence for a claim about the delay",
                  "Presupposing a contested characterisation and building on it",
                  "Attributing an opinion to a named source",
                  "Hedging a claim appropriately",
                ],
              },
              solution: { answerIndex: 1 },
              explanation:
                "'Well-documented reluctance' is placed in a subordinate 'given that' clause, where claims are presented as settled background rather than asserted. Moving a contested claim into a presupposition is one of the most effective rhetorical manoeuvres in English — and one of the hardest to answer, because disputing it means interrupting the writer's actual point.",
              points: 20,
              tags: ["presupposition", "rhetoric"],
              lexicalItem: "disingenuous",
            },
            {
              type: "OPEN_WRITING",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Rewrite this neutrally, preserving every fact: “Bureaucrats squandered a staggering £4m on a vanity project that predictably collapsed within months.”",
              instructions:
                "Same information, no evaluation. Then, in one sentence, say what you removed.",
              payload: { minWords: 30 },
              solution: { minWords: 30 },
              explanation:
                "A neutral version: “The department spent £4m on a project that was discontinued after several months.” Removed: 'bureaucrats' (pejorative for civil servants), 'squandered' (presupposes waste), 'staggering' (evaluates the amount), 'vanity project' (attributes motive), 'predictably' (implies the failure was foreseeable and therefore culpable).",
              points: 20,
              tags: ["neutrality", "production"],
            },
          ],
        },
      ],
    },
  ],
};
