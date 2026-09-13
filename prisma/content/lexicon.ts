import type { Cefr, Connotation, LexicalType, Register } from "@prisma/client";

/**
 * The lexicon: the vocabulary layer that feeds both lesson exercises and the
 * spaced-repetition queue.
 *
 * Entries carry more than a definition because at C1/C2 the definition is
 * rarely the problem. What learners actually lack is register (can I say this
 * to a client?), connotation (is this praise or an insult?), and collocation
 * (which verb goes with this noun?). Those three fields are the reason this is
 * a table rather than a word list.
 *
 * `frequency` is a coarse corpus rank bucket — lower means more frequent, and
 * it orders the new-card queue so common items are learned first.
 */

export interface LexicalSeed {
  headword: string;
  type: LexicalType;
  cefr: Cefr;
  pos?: string;
  ipa?: string;
  definition: string;
  register?: Register;
  connotation?: Connotation;
  domain?: string;
  synonyms?: string[];
  antonyms?: string[];
  collocations?: string[];
  examples: { text: string; note?: string }[];
  usageNote?: string;
  frequency: number;
}

export const LEXICON: LexicalSeed[] = [
  // ========================= IDIOMS ==========================
  {
    headword: "a storm in a teacup",
    type: "IDIOM",
    cefr: "B2",
    definition: "A great deal of anger or worry about something unimportant.",
    register: "NEUTRAL",
    connotation: "NEGATIVE",
    synonyms: ["much ado about nothing", "a tempest in a teapot"],
    collocations: ["turned out to be", "the whole thing was"],
    examples: [
      { text: "The resignation rumours were a storm in a teacup — he was back at his desk on Monday." },
      { text: "Americans say 'a tempest in a teapot' for the same idea.", note: "Regional variant" },
    ],
    usageNote: "Predominantly British. Dismissive by design — do not use it about something your listener is genuinely upset by.",
    frequency: 120,
  },
  {
    headword: "move the goalposts",
    type: "IDIOM",
    cefr: "B2",
    definition: "To change the rules or criteria of something while it is in progress, usually unfairly.",
    register: "NEUTRAL",
    connotation: "NEGATIVE",
    collocations: ["keep moving the goalposts", "they've moved the goalposts again"],
    examples: [
      { text: "Every time we meet the target, they move the goalposts." },
      { text: "It is hard to plan when the regulator keeps moving the goalposts." },
    ],
    usageNote: "Accusatory. Common in business and politics; acceptable in writing, but it attributes bad faith.",
    frequency: 140,
  },
  {
    headword: "the elephant in the room",
    type: "IDIOM",
    cefr: "C1",
    definition: "An obvious major problem that everyone is avoiding discussing.",
    register: "NEUTRAL",
    connotation: "NEUTRAL",
    collocations: ["address the elephant in the room", "nobody mentioned"],
    examples: [
      { text: "Let me address the elephant in the room: none of this works without more funding." },
    ],
    usageNote: "Naming it is itself the move — the phrase is almost always used by the person who is about to break the silence.",
    frequency: 90,
  },
  {
    headword: "damn with faint praise",
    type: "IDIOM",
    cefr: "C2",
    definition: "To criticise something by praising it so mildly that the praise reads as condemnation.",
    register: "LITERARY",
    connotation: "NEGATIVE",
    collocations: ["damned it with faint praise", "faint praise indeed"],
    examples: [
      { text: "The review damned the novel with faint praise: 'competent', 'unobjectionable', 'perfectly readable'." },
    ],
    usageNote: "From Alexander Pope. Recognising it matters more than producing it — it is a technique you will meet in criticism and diplomacy constantly.",
    frequency: 380,
  },
  {
    headword: "cut to the chase",
    type: "IDIOM",
    cefr: "B2",
    definition: "To get to the point, skipping preliminaries.",
    register: "INFORMAL",
    connotation: "NEUTRAL",
    examples: [{ text: "Let's cut to the chase — can you deliver by Friday or not?" }],
    usageNote: "From film editing. Slightly brusque; fine internally, risky with a client you do not know well.",
    frequency: 110,
  },
  {
    headword: "a double-edged sword",
    type: "IDIOM",
    cefr: "C1",
    definition: "Something with both significant benefits and significant drawbacks.",
    register: "NEUTRAL",
    connotation: "NEUTRAL",
    collocations: ["prove to be a double-edged sword", "something of a double-edged sword"],
    examples: [
      { text: "Transparency is a double-edged sword: it builds trust and it arms your competitors." },
    ],
    usageNote: "A dependable way to introduce a concession in an essay — but examiners see it often, so earn it with a specific second edge.",
    frequency: 130,
  },
  {
    headword: "beg the question",
    type: "IDIOM",
    cefr: "C2",
    definition: "Strictly: to assume the truth of the very thing being argued. Popularly: to raise a question.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    domain: "logic",
    examples: [
      { text: "Arguing that the policy is just because it is the law begs the question.", note: "Strict sense" },
      { text: "The result begs the question of what happens at scale.", note: "Popular sense — now common, still contested" },
    ],
    usageNote: "In philosophy or formal argument, use the strict sense or avoid the phrase entirely. Elsewhere the popular sense passes without comment.",
    frequency: 340,
  },
  {
    headword: "paper over the cracks",
    type: "IDIOM",
    cefr: "C1",
    definition: "To conceal a fundamental problem with a superficial fix.",
    register: "NEUTRAL",
    connotation: "NEGATIVE",
    collocations: ["merely papers over the cracks", "an attempt to paper over the cracks"],
    examples: [
      { text: "The reshuffle papers over the cracks; the structural problem is unchanged." },
    ],
    frequency: 190,
  },

  // ========================= PHRASAL VERBS ==========================
  {
    headword: "call for",
    type: "PHRASAL_VERB",
    cefr: "B2",
    pos: "verb",
    definition: "To publicly demand or require something.",
    register: "FORMAL",
    connotation: "NEUTRAL",
    collocations: ["call for an inquiry", "call for restraint", "the situation calls for"],
    examples: [
      { text: "Opposition MPs called for an independent inquiry." },
      { text: "This calls for a more considered response.", note: "Impersonal — 'require', not 'demand'" },
    ],
    usageNote: "Two distinct senses: people call for (demand); situations call for (require). The second is more useful in academic writing.",
    frequency: 60,
  },
  {
    headword: "bear out",
    type: "PHRASAL_VERB",
    cefr: "C1",
    pos: "verb",
    definition: "To confirm or support (a claim, theory or account) with evidence.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    collocations: ["the data bear this out", "borne out by the evidence", "events bore out his warning"],
    examples: [
      { text: "The longitudinal data bear out the initial hypothesis." },
      { text: "His prediction was borne out within a year." },
    ],
    usageNote: "Past participle is 'borne out', not 'born out'. Separable with a pronoun: 'the data bear it out'.",
    frequency: 210,
  },
  {
    headword: "water down",
    type: "PHRASAL_VERB",
    cefr: "C1",
    pos: "verb",
    definition: "To weaken a proposal, law or statement by removing its strongest elements.",
    register: "NEUTRAL",
    connotation: "NEGATIVE",
    collocations: ["a watered-down version", "watered down by amendments"],
    examples: [
      { text: "The bill was so watered down by the committee that its sponsors voted against it." },
    ],
    frequency: 170,
  },
  {
    headword: "gloss over",
    type: "PHRASAL_VERB",
    cefr: "C1",
    pos: "verb",
    definition: "To treat a difficulty briefly or misleadingly in order to avoid dealing with it.",
    register: "NEUTRAL",
    connotation: "NEGATIVE",
    collocations: ["gloss over the difficulties", "glossed over in the summary"],
    examples: [
      { text: "The report glosses over the cost of implementation in a single sentence." },
    ],
    usageNote: "Implies the omission is convenient rather than accidental — a useful verb for critical writing.",
    frequency: 200,
  },
  {
    headword: "hold forth",
    type: "PHRASAL_VERB",
    cefr: "C2",
    pos: "verb",
    definition: "To talk at length and with assurance, typically in a way others find tiresome.",
    register: "LITERARY",
    connotation: "NEGATIVE",
    collocations: ["holding forth on", "held forth at length"],
    examples: [
      { text: "He held forth on monetary policy for twenty minutes before anyone could interrupt." },
    ],
    usageNote: "Always mildly mocking. Never use it about yourself unless self-deprecating.",
    frequency: 420,
  },
  {
    headword: "wind up",
    type: "PHRASAL_VERB",
    cefr: "B2",
    pos: "verb",
    definition: "To bring to an end; also (British, informal) to tease or annoy deliberately.",
    register: "INFORMAL",
    connotation: "NEUTRAL",
    collocations: ["wind up the meeting", "wind up a company", "you're winding me up"],
    examples: [
      { text: "Let's wind up here — we're over time.", note: "Conclude" },
      { text: "The company was wound up in 2019.", note: "Dissolved — legal sense" },
      { text: "Are you winding me up?", note: "British informal — teasing" },
    ],
    usageNote: "Three senses with very different registers. The legal sense ('wind up a company') is formal; the teasing sense is strictly informal British.",
    frequency: 100,
  },

  // ========================= COLLOCATIONS ==========================
  {
    headword: "draw a distinction",
    type: "COLLOCATION",
    cefr: "C1",
    definition: "To identify and state a difference between two things.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    collocations: ["draw a sharp distinction", "draw a careful distinction between"],
    examples: [
      { text: "We must draw a distinction between correlation and causation." },
    ],
    usageNote: "'Make a distinction' is also correct; 'draw' is slightly more formal and collocates better with 'sharp' and 'careful'.",
    frequency: 150,
  },
  {
    headword: "vested interest",
    type: "COLLOCATION",
    cefr: "C1",
    pos: "noun",
    definition: "A personal stake in an outcome, usually financial, that may compromise impartiality.",
    register: "FORMAL",
    connotation: "NEGATIVE",
    domain: "politics",
    collocations: ["a vested interest in", "powerful vested interests"],
    examples: [
      { text: "The consultants who recommended the system had a vested interest in supplying it." },
    ],
    frequency: 160,
  },
  {
    headword: "mounting evidence",
    type: "COLLOCATION",
    cefr: "C1",
    definition: "An accumulating body of evidence pointing in one direction.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    collocations: ["mounting evidence that", "in the face of mounting evidence"],
    examples: [
      { text: "There is mounting evidence that the effect does not replicate at scale." },
    ],
    usageNote: "'Mounting' collocates with evidence, pressure, concern, criticism and debts — but not with support or enthusiasm.",
    frequency: 180,
  },
  {
    headword: "a compelling case",
    type: "COLLOCATION",
    cefr: "C1",
    definition: "An argument strong enough to persuade a sceptical reader.",
    register: "FORMAL",
    connotation: "POSITIVE",
    collocations: ["make a compelling case for", "a compelling case can be made"],
    examples: [{ text: "The authors make a compelling case for reform." }],
    frequency: 145,
  },
  {
    headword: "conclusive proof",
    type: "COLLOCATION",
    cefr: "C1",
    definition: "Evidence that settles a question beyond dispute.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    antonyms: ["circumstantial evidence", "suggestive findings"],
    examples: [
      { text: "This falls short of conclusive proof, but the direction of travel is clear." },
    ],
    usageNote: "Frequently used in the negative. Claiming conclusive proof from a single study is the commonest overclaim in learner academic writing.",
    frequency: 220,
  },

  // ========================= ACADEMIC PHRASES ==========================
  {
    headword: "it is worth noting that",
    type: "ACADEMIC_PHRASE",
    cefr: "C1",
    definition: "A hedge introducing a relevant but secondary point.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    synonyms: ["it should be observed that", "notably"],
    examples: [
      { text: "It is worth noting that the sample was drawn entirely from one region." },
    ],
    usageNote: "Genuinely useful once per section. Three times in an essay and it becomes filler an examiner will notice.",
    frequency: 100,
  },
  {
    headword: "insofar as",
    type: "ACADEMIC_PHRASE",
    cefr: "C2",
    definition: "To the extent that; used to limit a claim precisely.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    examples: [
      { text: "The model is useful insofar as it predicts short-term movements; beyond that it fails." },
    ],
    usageNote: "Written as one word in British usage, sometimes 'in so far as'. It sets a boundary — do not use it as a synonym for 'because'.",
    frequency: 310,
  },
  {
    headword: "by the same token",
    type: "DISCOURSE_MARKER",
    cefr: "C1",
    definition: "For the same reason; applying the previous logic to a new case.",
    register: "FORMAL",
    connotation: "NEUTRAL",
    examples: [
      { text: "If we accept that premise, then by the same token we must accept its consequence." },
    ],
    usageNote: "Signals parallel reasoning, not mere addition. Using it where 'also' belongs is a common C1 slip.",
    frequency: 240,
  },
  {
    headword: "that said",
    type: "DISCOURSE_MARKER",
    cefr: "C1",
    definition: "A concessive marker introducing a qualification of what was just stated.",
    register: "NEUTRAL",
    connotation: "NEUTRAL",
    synonyms: ["having said that", "even so", "nonetheless"],
    examples: [
      { text: "The results are encouraging. That said, the sample was small." },
    ],
    usageNote: "Works in speech and writing, formal and informal — one of the most portable markers in English.",
    frequency: 85,
  },
  {
    headword: "to a lesser extent",
    type: "DISCOURSE_MARKER",
    cefr: "C1",
    definition: "Used to include a second item while marking it as less significant.",
    register: "ACADEMIC",
    connotation: "NEUTRAL",
    examples: [
      { text: "The rise was driven by energy prices and, to a lesser extent, by wage growth." },
    ],
    frequency: 230,
  },
  {
    headword: "notwithstanding",
    type: "DISCOURSE_MARKER",
    cefr: "C2",
    pos: "preposition/adverb",
    definition: "In spite of; despite.",
    register: "FORMAL",
    connotation: "NEUTRAL",
    domain: "law",
    examples: [
      { text: "Notwithstanding these limitations, the study represents a significant advance." },
      { text: "These limitations notwithstanding, the study is a significant advance.", note: "Postposed — more formal still" },
    ],
    usageNote: "Uniquely, it can follow its noun phrase. Heavily used in legal drafting; in an essay, once is impressive and twice is affectation.",
    frequency: 330,
  },

  // ========================= SINGLE WORDS: NUANCE ==========================
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
    examples: [
      { text: "The review was ostensibly about efficiency, though nobody believed that." },
    ],
    usageNote: "Never neutral. If you do not mean to cast doubt, use 'apparently' or nothing at all.",
    frequency: 250,
  },
  {
    headword: "tantamount",
    type: "WORD",
    cefr: "C2",
    pos: "adjective",
    ipa: "/ˈtæntəmaʊnt/",
    definition: "Equivalent in effect or seriousness to something worse than what was literally done.",
    register: "FORMAL",
    connotation: "NEGATIVE",
    collocations: ["tantamount to an admission", "tantamount to a resignation"],
    examples: [
      { text: "Refusing to answer was tantamount to an admission of guilt." },
    ],
    usageNote: "Always followed by 'to'. Used almost exclusively to escalate: X was tantamount to something more serious.",
    frequency: 300,
  },
  {
    headword: "disingenuous",
    type: "WORD",
    cefr: "C2",
    pos: "adjective",
    ipa: "/ˌdɪsɪnˈdʒenjuəs/",
    definition: "Pretending to know less, or to be more sincere, than one really is.",
    register: "FORMAL",
    connotation: "NEGATIVE",
    synonyms: ["insincere", "duplicitous"],
    antonyms: ["candid", "forthright", "ingenuous"],
    examples: [
      { text: "It is disingenuous to claim the consequences were unforeseeable." },
    ],
    usageNote: "A precise accusation of feigned innocence — stronger than 'misleading', weaker than 'lying'. In diplomacy it is about as sharp as it gets.",
    frequency: 280,
  },
  {
    headword: "nuanced",
    type: "WORD",
    cefr: "C1",
    pos: "adjective",
    definition: "Characterised by subtle distinctions rather than a simple position.",
    register: "FORMAL",
    connotation: "POSITIVE",
    collocations: ["a more nuanced view", "nuanced understanding"],
    examples: [
      { text: "The picture is more nuanced than either side admits." },
    ],
    usageNote: "Nearly always approving. Beware: 'we need a more nuanced approach' is often a polite way of saying 'you are wrong'.",
    frequency: 175,
  },
  {
    headword: "pre-empt",
    type: "WORD",
    cefr: "C1",
    pos: "verb",
    ipa: "/priˈempt/",
    definition: "To act first in order to prevent something, especially an objection or a rival's move.",
    register: "FORMAL",
    connotation: "NEUTRAL",
    collocations: ["pre-empt criticism", "pre-empt the objection that"],
    examples: [
      { text: "Let me pre-empt the obvious objection: yes, the sample is small." },
    ],
    usageNote: "Invaluable in argumentative writing — naming an objection before your reader does is what separates a C1 essay from a C2 one.",
    frequency: 195,
  },
  {
    headword: "invidious",
    type: "WORD",
    cefr: "C2",
    pos: "adjective",
    ipa: "/ɪnˈvɪdiəs/",
    definition: "Likely to cause resentment or unfairness, especially by making unwelcome comparisons.",
    register: "LITERARY",
    connotation: "NEGATIVE",
    collocations: ["an invidious comparison", "an invidious position", "invidious distinctions"],
    examples: [
      { text: "It puts junior staff in an invidious position: loyal to a colleague, or honest with the auditor." },
    ],
    frequency: 450,
  },
  {
    headword: "mitigate",
    type: "WORD",
    cefr: "C1",
    pos: "verb",
    definition: "To make something bad less severe.",
    register: "FORMAL",
    connotation: "NEUTRAL",
    collocations: ["mitigate the risk", "mitigating circumstances", "mitigate against"],
    examples: [
      { text: "The measures mitigate the risk without eliminating it." },
    ],
    usageNote: "Do not confuse with 'militate' (to work against). 'Mitigate against' is very widely used but still regarded as an error in careful writing — use 'militate against' or 'mitigate the risk of'.",
    frequency: 155,
  },
  {
    headword: "categorical",
    type: "WORD",
    cefr: "C1",
    pos: "adjective",
    definition: "Stated without qualification or exception.",
    register: "FORMAL",
    connotation: "NEUTRAL",
    collocations: ["a categorical denial", "categorical assurance"],
    antonyms: ["qualified", "hedged", "equivocal"],
    examples: [
      { text: "He issued a categorical denial within the hour." },
    ],
    usageNote: "The opposite of hedging. Reserve it for claims you can actually defend without qualification.",
    frequency: 260,
  },
  {
    headword: "untenable",
    type: "WORD",
    cefr: "C1",
    pos: "adjective",
    definition: "Impossible to defend or maintain against criticism.",
    register: "FORMAL",
    connotation: "NEGATIVE",
    collocations: ["an untenable position", "become untenable"],
    examples: [
      { text: "After the leak, his position became untenable and he resigned that evening." },
    ],
    usageNote: "Typically said of a position or argument. In the phrase 'his position became untenable' it is near-idiomatic for 'he had to resign'.",
    frequency: 265,
  },
  {
    headword: "conflate",
    type: "WORD",
    cefr: "C2",
    pos: "verb",
    definition: "To treat two distinct things as if they were the same, usually mistakenly.",
    register: "ACADEMIC",
    connotation: "NEGATIVE",
    collocations: ["conflate X with Y", "a conflation of"],
    examples: [
      { text: "The article conflates immigration with asylum, and the two require different analysis." },
    ],
    usageNote: "Precise and useful for critique. Always names an error — you cannot conflate two things correctly.",
    frequency: 290,
  },

  // ========================= SLANG / INFORMAL ==========================
  {
    headword: "throw someone under the bus",
    type: "SLANG",
    cefr: "C1",
    definition: "To sacrifice a colleague to protect yourself, usually by blaming them publicly.",
    register: "INFORMAL",
    connotation: "NEGATIVE",
    examples: [
      { text: "He threw the whole team under the bus in that meeting." },
    ],
    usageNote: "Very common in workplace English, but firmly informal — never in writing to a client or in a report.",
    frequency: 165,
  },
  {
    headword: "ballpark figure",
    type: "SLANG",
    cefr: "B2",
    definition: "A rough numerical estimate.",
    register: "INFORMAL",
    connotation: "NEUTRAL",
    synonyms: ["rough estimate", "order of magnitude"],
    examples: [
      { text: "Give me a ballpark figure and we'll refine it later." },
    ],
    usageNote: "American in origin, now global in business speech. In writing, prefer 'a rough estimate'.",
    frequency: 185,
  },
  {
    headword: "kick the can down the road",
    type: "IDIOM",
    cefr: "C1",
    definition: "To postpone a decision, leaving the problem for later.",
    register: "INFORMAL",
    connotation: "NEGATIVE",
    examples: [
      { text: "The agreement kicks the can down the road for another eighteen months." },
    ],
    usageNote: "Now common in serious journalism despite its informal origins — acceptable in an opinion piece, not in an academic paper.",
    frequency: 205,
  },
  {
    headword: "a hard sell",
    type: "COLLOCATION",
    cefr: "C1",
    definition: "Something difficult to persuade people to accept.",
    register: "INFORMAL",
    connotation: "NEUTRAL",
    examples: [
      { text: "Austerity is a hard sell in an election year." },
    ],
    frequency: 215,
  },

  // ========================= REGISTER PAIRS ==========================
  {
    headword: "ascertain",
    type: "WORD",
    cefr: "C1",
    pos: "verb",
    definition: "To find out with certainty.",
    register: "FORMAL",
    connotation: "NEUTRAL",
    synonyms: ["establish", "determine", "find out"],
    examples: [
      { text: "We were unable to ascertain the cause of the failure.", note: "Formal register" },
      { text: "We couldn't find out what went wrong.", note: "Neutral equivalent" },
    ],
    usageNote: "A register marker rather than a meaning change. In a report, 'ascertain'; in an email to a colleague, 'find out'.",
    frequency: 270,
  },
  {
    headword: "in the event that",
    type: "ACADEMIC_PHRASE",
    cefr: "C1",
    definition: "If (formal).",
    register: "FORMAL",
    connotation: "NEUTRAL",
    synonyms: ["should", "if"],
    examples: [
      { text: "In the event that the supplier defaults, the deposit is refundable." },
      { text: "Should the supplier default, the deposit is refundable.", note: "Inverted conditional — more elegant, equally formal" },
    ],
    usageNote: "Contractual register. In an essay, the inverted 'Should X occur' is usually the better choice — same formality, fewer words.",
    frequency: 275,
  },
];
