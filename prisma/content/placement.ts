import type { Cefr, Skill } from "@prisma/client";

/**
 * The adaptive placement item bank.
 *
 * Difficulty (`b`) is on the IRT logit scale, calibrated against the CEFR cut
 * scores in src/lib/cefr.ts: roughly -1.0 for solid B2, 0.0-1.2 for C1, and
 * 1.25+ for C2. Discrimination (`a`) is higher for items that isolate a single
 * feature and lower for items where context could rescue a weaker learner.
 * Guessing (`c`) is 1/options for genuine four-way items, lower where the
 * distractors are strong enough that a guesser is unlikely to land on the key.
 *
 * Every item's rationale explains *why* the key is right, because the learner
 * sees it immediately after answering. See docs/EXTENDING.md#adding-placement-items.
 */

export interface PlacementSeed {
  skill: Skill;
  cefr: Cefr;
  discrimination: number;
  difficulty: number;
  guessing: number;
  prompt: string;
  context?: string;
  options: string[];
  answerIndex: number;
  rationale: string;
  tags: string[];
}

export const PLACEMENT_ITEMS: PlacementSeed[] = [
  // --- GRAMMAR: B2 ---------------------------------------------------------
  {
    skill: "GRAMMAR",
    cefr: "B2",
    discrimination: 1.3,
    difficulty: -1.2,
    guessing: 0.25,
    prompt: "By the time the report was published, the committee ___ its recommendations three times.",
    options: ["revised", "has revised", "had revised", "was revising"],
    answerIndex: 2,
    rationale:
      "Past perfect. One past action (revising) is completed before another past reference point (publication), and the sequence has to be marked explicitly.",
    tags: ["tense", "past-perfect"],
  },
  {
    skill: "GRAMMAR",
    cefr: "B2",
    discrimination: 1.2,
    difficulty: -0.9,
    guessing: 0.25,
    prompt: "She is the sort of manager ___ people will follow into a difficult project.",
    options: ["which", "whom", "what", "who's"],
    answerIndex: 1,
    rationale:
      "‘Whom’ is the object of ‘follow’. ‘Which’ cannot refer to a person; ‘who’s’ is a contraction of ‘who is’.",
    tags: ["relative-clause"],
  },
  {
    skill: "GRAMMAR",
    cefr: "B2",
    discrimination: 1.1,
    difficulty: -0.7,
    guessing: 0.25,
    prompt: "I'd rather you ___ that to anyone before the announcement.",
    options: ["don't mention", "didn't mention", "haven't mentioned", "wouldn't mention"],
    answerIndex: 1,
    rationale:
      "‘Would rather + subject’ takes an unreal past to talk about the present or future, even though the meaning is not past.",
    tags: ["unreal-past"],
  },

  // --- GRAMMAR: C1 ---------------------------------------------------------
  {
    skill: "GRAMMAR",
    cefr: "C1",
    discrimination: 1.6,
    difficulty: 0.3,
    guessing: 0.25,
    prompt: "Not only ___ the deadline, but she also delivered under budget.",
    options: ["she met", "did she meet", "she did meet", "met she"],
    answerIndex: 1,
    rationale:
      "A fronted negative adverbial triggers subject-auxiliary inversion: *Not only did she meet…*. This is one of the clearest markers of a C1 grammatical range.",
    tags: ["inversion", "emphasis"],
  },
  {
    skill: "GRAMMAR",
    cefr: "C1",
    discrimination: 1.5,
    difficulty: 0.6,
    guessing: 0.25,
    prompt: "The board insisted that the policy ___ reviewed before the next quarter.",
    options: ["is", "be", "will be", "would be"],
    answerIndex: 1,
    rationale:
      "The mandative subjunctive after verbs of demand and recommendation: the bare infinitive *be*, regardless of the subject or tense of the main verb.",
    tags: ["subjunctive"],
  },
  {
    skill: "GRAMMAR",
    cefr: "C1",
    discrimination: 1.4,
    difficulty: 0.5,
    guessing: 0.25,
    prompt: "___ for the intervention of a junior analyst, the error would have reached the client.",
    options: ["Except", "But", "Save", "Had it not been"],
    answerIndex: 3,
    rationale:
      "Inverted third conditional without ‘if’: *Had it not been for X, Y would have…*. ‘But for’ also works but requires no auxiliary, so it cannot precede ‘for’ here.",
    tags: ["conditional", "inversion"],
  },
  {
    skill: "GRAMMAR",
    cefr: "C1",
    discrimination: 1.3,
    difficulty: 0.8,
    guessing: 0.25,
    prompt: "Seldom ___ a proposal defended with so little evidence.",
    options: ["I have seen", "have I seen", "I had seen", "did I saw"],
    answerIndex: 1,
    rationale:
      "‘Seldom’ in initial position is a negative adverbial and forces inversion of the auxiliary and subject.",
    tags: ["inversion"],
  },

  // --- GRAMMAR: C2 ---------------------------------------------------------
  {
    skill: "GRAMMAR",
    cefr: "C2",
    discrimination: 1.7,
    difficulty: 1.6,
    guessing: 0.2,
    prompt: "___ though the evidence may appear, it does not establish causation.",
    options: ["Compelling", "As compelling", "However compelling", "So compelling"],
    answerIndex: 0,
    rationale:
      "The literary concessive pattern *Adjective + though + subject + verb*: ‘Compelling though the evidence may appear…’. ‘However compelling’ would require ‘it is’, not ‘though’.",
    tags: ["concession", "fronting"],
  },
  {
    skill: "GRAMMAR",
    cefr: "C2",
    discrimination: 1.5,
    difficulty: 1.9,
    guessing: 0.2,
    prompt: "The minister denied ___ of the irregularities before the audit.",
    options: [
      "to have been aware",
      "having been made aware",
      "that he was made aware",
      "being made aware",
    ],
    answerIndex: 1,
    rationale:
      "‘Deny’ takes a gerund, not an infinitive. The perfect gerund *having been made aware* marks the awareness as prior to the denial — a distinction the simple gerund loses.",
    tags: ["gerund", "perfect-aspect"],
  },

  // --- VOCABULARY: B2 ------------------------------------------------------
  {
    skill: "VOCABULARY",
    cefr: "B2",
    discrimination: 1.2,
    difficulty: -1.0,
    guessing: 0.25,
    prompt: "The negotiations eventually ___ down over a disagreement about timelines.",
    options: ["broke", "fell", "went", "came"],
    answerIndex: 0,
    rationale: "‘Break down’ is the fixed phrasal verb for negotiations or talks failing.",
    tags: ["phrasal-verb"],
  },
  {
    skill: "VOCABULARY",
    cefr: "B2",
    discrimination: 1.1,
    difficulty: -0.6,
    guessing: 0.25,
    prompt: "Choose the word closest in meaning to ‘meticulous’.",
    options: ["hurried", "painstaking", "reluctant", "ambitious"],
    answerIndex: 1,
    rationale:
      "Both describe extreme care over detail. ‘Painstaking’ carries the same positive evaluation; the others share no semantic field.",
    tags: ["synonym"],
  },

  // --- VOCABULARY: C1 ------------------------------------------------------
  {
    skill: "VOCABULARY",
    cefr: "C1",
    discrimination: 1.5,
    difficulty: 0.4,
    guessing: 0.25,
    prompt: "His apology was so ___ that it convinced nobody in the room.",
    options: ["perfunctory", "meticulous", "candid", "effusive"],
    answerIndex: 0,
    rationale:
      "‘Perfunctory’ means done as a formality, without care — exactly what fails to convince. ‘Effusive’ is a plausible distractor but describes excess, not absence, of feeling.",
    tags: ["connotation"],
  },
  {
    skill: "VOCABULARY",
    cefr: "C1",
    discrimination: 1.4,
    difficulty: 0.7,
    guessing: 0.25,
    prompt: "Complete the collocation: the findings ___ serious doubt on the original hypothesis.",
    options: ["throw", "cast", "put", "lay"],
    answerIndex: 1,
    rationale:
      "‘Cast doubt on’ is fixed. ‘Throw doubt on’ occurs but is markedly less frequent, and the others do not collocate at all.",
    tags: ["collocation", "academic"],
  },
  {
    skill: "VOCABULARY",
    cefr: "C1",
    discrimination: 1.3,
    difficulty: 0.9,
    guessing: 0.25,
    prompt: "After the merger, several senior staff were quietly ___ out to consultancy roles.",
    options: ["phased", "eased", "weeded", "farmed"],
    answerIndex: 1,
    rationale:
      "‘Ease someone out’ is the idiom for removing a person from a post gradually and without confrontation. ‘Phase out’ takes things, not people.",
    tags: ["phrasal-verb", "register"],
  },

  // --- VOCABULARY: C2 ------------------------------------------------------
  {
    skill: "VOCABULARY",
    cefr: "C2",
    discrimination: 1.6,
    difficulty: 1.7,
    guessing: 0.2,
    prompt: "Which word implies praise that is faint enough to function as criticism?",
    options: ["laudatory", "damning", "backhanded", "fulsome"],
    answerIndex: 3,
    rationale:
      "In careful usage ‘fulsome’ means excessive to the point of insincerity — praise so overdone it reads as mockery. ‘Backhanded’ describes the compliment, not the praise itself.",
    tags: ["connotation", "usage-dispute"],
  },
  {
    skill: "VOCABULARY",
    cefr: "C2",
    discrimination: 1.5,
    difficulty: 1.5,
    guessing: 0.2,
    prompt: "The committee's report was a masterpiece of ___: it condemned nobody and changed nothing.",
    options: ["equivocation", "vindication", "excoriation", "elucidation"],
    answerIndex: 0,
    rationale:
      "‘Equivocation’ is deliberate ambiguity used to avoid commitment — precisely a report that condemns nobody and changes nothing.",
    tags: ["abstract-noun"],
  },

  // --- READING: B2 ---------------------------------------------------------
  {
    skill: "READING",
    cefr: "B2",
    discrimination: 1.3,
    difficulty: -0.8,
    guessing: 0.25,
    context:
      "The scheme was launched with considerable fanfare. Eighteen months on, uptake stands at four per cent of the eligible population, and the department has quietly stopped publishing monthly figures.",
    prompt: "What is the writer implying?",
    options: [
      "The scheme is being expanded.",
      "The scheme has failed and officials are avoiding scrutiny.",
      "Eligibility rules were too generous.",
      "Monthly figures were inaccurate.",
    ],
    answerIndex: 1,
    rationale:
      "‘Quietly stopped publishing’ carries the implication. Nothing states failure outright — the inference comes from the contrast between ‘fanfare’ and four per cent.",
    tags: ["inference"],
  },

  // --- READING: C1 ---------------------------------------------------------
  {
    skill: "READING",
    cefr: "C1",
    discrimination: 1.6,
    difficulty: 0.5,
    guessing: 0.25,
    context:
      "One might, of course, admire the sheer consistency with which the board has ignored every warning it commissioned. Three reports, three shelvings, and not one resignation. It is, in its way, an achievement.",
    prompt: "What is the writer's tone?",
    options: ["Admiring", "Neutral and factual", "Ironic", "Apologetic"],
    answerIndex: 2,
    rationale:
      "‘One might, of course, admire’ and ‘it is, in its way, an achievement’ invert their literal meaning. Irony is signalled by the gap between the praise and the facts listed.",
    tags: ["tone", "irony"],
  },
  {
    skill: "READING",
    cefr: "C1",
    discrimination: 1.4,
    difficulty: 0.8,
    guessing: 0.25,
    context:
      "Critics of the policy tend to be well funded, well connected, and remarkably consistent in the timing of their interventions. Readers may draw their own conclusions.",
    prompt: "What rhetorical device is the writer using in the final sentence?",
    options: ["Hyperbole", "Insinuation", "Understatement", "Analogy"],
    answerIndex: 1,
    rationale:
      "The writer implies coordination or bad faith without asserting it, leaving the accusation to the reader. That is insinuation — the claim is made deniable by construction.",
    tags: ["rhetoric", "bias"],
  },

  // --- READING: C2 ---------------------------------------------------------
  {
    skill: "READING",
    cefr: "C2",
    discrimination: 1.7,
    difficulty: 1.6,
    guessing: 0.2,
    context:
      "That the reforms have not delivered is not seriously disputed. What remains contested — and what the present study cannot settle — is whether they failed because they were misconceived or because they were never properly funded. The distinction is not academic: it determines whether one abandons the approach or doubles down on it.",
    prompt: "What is the primary function of the final sentence?",
    options: [
      "To concede that the question is unimportant",
      "To establish the practical stakes of an unresolved distinction",
      "To summarise the study's findings",
      "To recommend increased funding",
    ],
    answerIndex: 1,
    rationale:
      "‘The distinction is not academic’ pre-empts the objection that the question is merely theoretical, then names the concrete consequence. It justifies the enquiry rather than resolving it.",
    tags: ["function", "argumentation"],
  },

  // --- LISTENING (transcript-based) ----------------------------------------
  {
    skill: "LISTENING",
    cefr: "B2",
    discrimination: 1.2,
    difficulty: -0.5,
    guessing: 0.25,
    context:
      "TRANSCRIPT — Speaker: “I'll be honest, we looked at three suppliers and, between you and me, the cheapest one was never really in the running. Compliance would have had a field day.”",
    prompt: "Why was the cheapest supplier rejected?",
    options: [
      "It was too expensive in the long term.",
      "It would have caused regulatory problems.",
      "It could not meet the deadline.",
      "The speaker preferred a familiar supplier.",
    ],
    answerIndex: 1,
    rationale:
      "‘Compliance would have had a field day’ means the compliance department would have found plenty to object to. The reason is regulatory, and it is stated idiomatically rather than plainly.",
    tags: ["idiom", "gist"],
  },
  {
    skill: "LISTENING",
    cefr: "C1",
    discrimination: 1.5,
    difficulty: 0.7,
    guessing: 0.25,
    context:
      "TRANSCRIPT — Interviewer: “So you'd support the proposal?” Speaker: “I'd support the *principle*. Whether this particular version survives contact with a budget is another matter entirely.”",
    prompt: "What is the speaker's position?",
    options: [
      "Full support for the proposal",
      "Support in theory, scepticism about this implementation",
      "Outright opposition",
      "Refusal to give an opinion",
    ],
    answerIndex: 1,
    rationale:
      "The stress on ‘principle’ and the contrast with ‘this particular version’ separate the idea from the execution. ‘Survives contact with a budget’ signals doubt about feasibility, not about the aim.",
    tags: ["stance", "hedging"],
  },
  {
    skill: "LISTENING",
    cefr: "C2",
    discrimination: 1.6,
    difficulty: 1.5,
    guessing: 0.2,
    context:
      "TRANSCRIPT — Speaker A: “We've always been transparent about the figures.” Speaker B: “Mm. *Available* isn't quite the same as transparent, is it.”",
    prompt: "What is Speaker B doing?",
    options: [
      "Agreeing with Speaker A",
      "Asking for clarification",
      "Challenging the claim by drawing a distinction",
      "Changing the subject",
    ],
    answerIndex: 2,
    rationale:
      "B contests the word ‘transparent’ by substituting ‘available’ — the figures existed but were not made intelligible. The falling intonation on the tag marks it as a challenge, not a genuine question.",
    tags: ["implicature", "tag-question"],
  },

  // --- WRITING (judgement items) -------------------------------------------
  {
    skill: "WRITING",
    cefr: "B2",
    discrimination: 1.2,
    difficulty: -0.4,
    guessing: 0.25,
    prompt: "Which sentence is most appropriate to open a formal complaint letter?",
    options: [
      "I'm writing because I'm really unhappy with your service.",
      "I am writing to express my dissatisfaction with the service I received on 14 March.",
      "Your service was terrible and I want something done about it.",
      "Just wanted to flag a problem with the service.",
    ],
    answerIndex: 1,
    rationale:
      "Formal register, a specific reference point, and a stated purpose. The others are either too informal or lead with emotion rather than fact.",
    tags: ["register"],
  },
  {
    skill: "WRITING",
    cefr: "C1",
    discrimination: 1.5,
    difficulty: 0.6,
    guessing: 0.25,
    prompt: "Which sentence hedges a claim most appropriately for an academic abstract?",
    options: [
      "This proves that the intervention works.",
      "The results suggest that the intervention may be effective in comparable settings.",
      "The intervention definitely improves outcomes.",
      "It is obvious that the intervention should be adopted widely.",
    ],
    answerIndex: 1,
    rationale:
      "‘Suggest’, ‘may’ and ‘comparable settings’ calibrate the claim to what a single study can support. The others overclaim — the most common register failure in learner abstracts.",
    tags: ["hedging", "academic"],
  },
  {
    skill: "WRITING",
    cefr: "C2",
    discrimination: 1.6,
    difficulty: 1.4,
    guessing: 0.25,
    prompt: "Which revision best removes redundancy without losing meaning?\n\nOriginal: “Due to the fact that the data was incomplete, it was not possible for us to reach a conclusion that was definitive.”",
    options: [
      "Because the data was incomplete, we could not reach a definitive conclusion.",
      "Due to incomplete data, it was not possible to reach a conclusion.",
      "The data being incomplete, a definitive conclusion was not able to be reached.",
      "Since the data was incomplete, we were unable to reach a conclusion that was definitive.",
    ],
    answerIndex: 0,
    rationale:
      "Twenty-two words to eleven with nothing lost: ‘due to the fact that’ → ‘because’, the empty ‘it was not possible for us’ → ‘we could not’, and the relative clause collapsed into the adjective.",
    tags: ["concision", "editing"],
  },

  // --- SPEAKING (pragmatics) -----------------------------------------------
  {
    skill: "SPEAKING",
    cefr: "C1",
    discrimination: 1.4,
    difficulty: 0.4,
    guessing: 0.25,
    prompt: "A colleague proposes something unworkable in a meeting. Which response disagrees most diplomatically without conceding the point?",
    options: [
      "That won't work.",
      "I'm not sure that's the best approach.",
      "I can see the appeal of that — my concern would be how we resource it.",
      "With respect, you clearly haven't thought this through.",
    ],
    answerIndex: 2,
    rationale:
      "It acknowledges the proposal's merit, uses a distancing conditional (‘would be’) to soften, and names a specific objection. The disagreement is intact; the face-threat is not.",
    tags: ["pragmatics", "diplomacy"],
  },
  {
    skill: "SPEAKING",
    cefr: "C2",
    discrimination: 1.5,
    difficulty: 1.5,
    guessing: 0.25,
    prompt: "Which reply signals genuine reconsideration rather than polite deflection?",
    options: [
      "That's a fair point, I'll bear it in mind.",
      "Interesting — I'd not thought of it that way.",
      "You may well be right; it would change how I've been reading the data.",
      "I hear you.",
      ],
    answerIndex: 2,
    rationale:
      "Only this names a specific consequence of being wrong. The others are phatic — they close the topic politely without committing to anything.",
    tags: ["pragmatics", "sincerity"],
  },

  // --- MEDIATION -----------------------------------------------------------
  {
    skill: "MEDIATION",
    cefr: "C1",
    discrimination: 1.4,
    difficulty: 0.7,
    guessing: 0.25,
    context:
      "A specialist writes: “The observed attenuation is consistent with, though not dispositive of, the hypothesised mechanism.”",
    prompt: "Which paraphrase for a non-specialist is most faithful?",
    options: [
      "The results prove the mechanism we expected.",
      "The results fit our explanation but do not confirm it.",
      "The results contradict our explanation.",
      "The results are inconclusive and tell us nothing.",
    ],
    answerIndex: 1,
    rationale:
      "‘Consistent with’ means compatible; ‘not dispositive’ means not decisive. Option 4 goes too far — findings that fit a hypothesis are not nothing.",
    tags: ["paraphrase", "precision"],
  },
  {
    skill: "MEDIATION",
    cefr: "C2",
    discrimination: 1.5,
    difficulty: 1.4,
    guessing: 0.25,
    context:
      "Two colleagues disagree. A: “We should ship now and fix issues in production.” B: “We should delay until QA signs off.”",
    prompt: "Which summary most neutrally states the real disagreement?",
    options: [
      "A is reckless and B is cautious.",
      "They disagree about how much risk is acceptable in exchange for speed.",
      "B does not trust A's engineering.",
      "They disagree about the release date.",
    ],
    answerIndex: 1,
    rationale:
      "It names the underlying trade-off rather than the surface positions, and attributes no motive. Mediation requires reframing at the level of interests, not stated demands.",
    tags: ["reframing", "neutrality"],
  },

  // --- PRONUNCIATION (knowledge items) -------------------------------------
  {
    skill: "PRONUNCIATION",
    cefr: "B2",
    discrimination: 1.2,
    difficulty: -0.5,
    guessing: 0.25,
    prompt: "Where does the primary stress fall in ‘photography’?",
    options: ["PHO-tog-ra-phy", "pho-TOG-ra-phy", "pho-tog-RA-phy", "pho-tog-ra-PHY"],
    answerIndex: 1,
    rationale:
      "Stress moves with the suffix: PHO-to-graph, pho-TOG-ra-phy, pho-to-GRAPH-ic. Misplaced word stress disrupts comprehension more than any individual consonant.",
    tags: ["word-stress"],
  },
  {
    skill: "PRONUNCIATION",
    cefr: "C1",
    discrimination: 1.3,
    difficulty: 0.8,
    guessing: 0.25,
    prompt: "In connected speech, how would a native speaker most likely say ‘I would have gone’?",
    options: ["/aɪ wʊd hæv gɒn/", "/aɪd əv gɒn/", "/aɪ wʊd ɒv gɒn/", "/aɪ wɒd hæv gɒn/"],
    answerIndex: 1,
    rationale:
      "‘Would’ contracts to /d/ and ‘have’ reduces to schwa + /v/. Producing every word in its citation form is the single clearest marker of non-native rhythm.",
    tags: ["connected-speech", "weak-forms"],
  },
  {
    skill: "PRONUNCIATION",
    cefr: "C2",
    discrimination: 1.4,
    difficulty: 1.5,
    guessing: 0.25,
    prompt: "“I didn't say she stole the money.” Stressing which word implies someone else made the accusation?",
    options: ["say", "she", "stole", "I"],
    answerIndex: 3,
    rationale:
      "Contrastive stress on ‘I’ denies authorship of the statement. Each stress position yields a different implicature — control of this is a C2 prosodic skill, not a vocabulary one.",
    tags: ["contrastive-stress", "prosody"],
  },
];
