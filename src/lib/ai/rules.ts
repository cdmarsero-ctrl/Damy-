import type { CorrectionType, Severity } from "./types";
import type { Cefr } from "@prisma/client";

/**
 * The rules engine behind every AI surface when no model provider is
 * configured — and a first pass that runs *before* the model when one is.
 *
 * These are not generic spellcheck rules. They target the errors that survive
 * into B2-C2 writing: calqued prepositions, uncountable plurals, register
 * slippage, and the discourse habits that keep an otherwise accurate text
 * reading as "advanced learner" rather than "educated native".
 *
 * Each rule owns its own regex with capture groups so the suggestion can
 * preserve the learner's surrounding words rather than replacing whole phrases.
 */

export interface Rule {
  id: string;
  pattern: RegExp;
  type: CorrectionType;
  severity: Severity;
  /** Built from the regex match so the message can quote the learner's words. */
  suggest: (match: RegExpExecArray) => string;
  explain: string;
  level?: Cefr;
  /** Registers where this rule should NOT fire (e.g. informal email). */
  skipInGenres?: string[];
  /**
   * Which capture group the highlighted span should cover. Defaults to the
   * whole match. Set to 1 only for rules whose regex deliberately matches
   * leading context (a preceding full stop, say) that must not be highlighted.
   */
  anchor?: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const RULES: Rule[] = [
  // --- calqued prepositions & verb patterns --------------------------------
  {
    id: "depend-of",
    pattern: /\bdepend(s|ed|ing)?\s+of\b/gi,
    type: "grammar",
    severity: "moderate",
    suggest: (m) => `depend${m[1] ?? ""} on`,
    explain: "‘Depend’ takes *on*, never *of*. This is one of the most persistent L1 transfers at B2+.",
    level: "B2",
  },
  {
    id: "discuss-about",
    pattern: /\bdiscuss(es|ed|ing)?\s+about\b/gi,
    type: "grammar",
    severity: "moderate",
    suggest: (m) => `discuss${m[1] ?? ""}`,
    explain: "‘Discuss’ is transitive — you discuss *a topic*, not *about* a topic.",
    level: "B2",
  },
  {
    id: "explain-me",
    pattern: /\bexplain\s+(me|him|her|us|them)\b/gi,
    type: "grammar",
    severity: "moderate",
    suggest: (m) => `explain to ${m[1]}`,
    explain: "‘Explain’ does not take an indirect object directly: *explain something to someone*.",
    level: "B2",
  },
  {
    id: "am-agree",
    pattern: /\b(am|is|are|was|were)\s+agree\b/gi,
    type: "grammar",
    severity: "major",
    suggest: () => "agree",
    explain: "‘Agree’ is a verb, not an adjective: *I agree*, not *I am agree*.",
    level: "B2",
  },
  {
    id: "consist-in",
    pattern: /\bconsists?\s+in\b(?!\s+(?:doing|being))/gi,
    type: "collocation",
    severity: "minor",
    suggest: () => "consists of",
    explain: "‘Consist of’ lists parts. ‘Consist in’ exists but means ‘has its essence in’ — rarely what is intended.",
    level: "C1",
  },
  {
    id: "married-with",
    pattern: /\bmarried\s+with\b/gi,
    type: "collocation",
    severity: "moderate",
    suggest: () => "married to",
    explain: "You are married *to* a person; *married with* suggests ‘married, and also has’.",
    level: "B2",
  },

  // --- uncountable nouns pluralised ----------------------------------------
  {
    id: "uncountable-plural",
    pattern:
      /\b(informations|advices|researches|equipments|furnitures|knowledges|feedbacks|softwares|staffs|evidences|homeworks|luggages|progresses)\b/gi,
    type: "grammar",
    severity: "major",
    suggest: (m) => {
      const word = m[1].toLowerCase();
      const special: Record<string, string> = { staffs: "staff", researches: "research" };
      return special[word] ?? word.replace(/e?s$/, "");
    },
    explain: "This noun is uncountable in English. Quantify it with *a piece of* / *an item of* if you need a count.",
    level: "B2",
  },
  {
    id: "amount-of-countable",
    pattern: /\bamount\s+of\s+(people|students|things|items|users|cases|reasons|factors|countries|companies)\b/gi,
    type: "grammar",
    severity: "moderate",
    suggest: (m) => `number of ${m[1]}`,
    explain: "‘Amount’ goes with uncountable nouns; countable nouns take ‘number’.",
    level: "B2",
  },
  {
    id: "less-countable",
    pattern: /\bless\s+(people|students|items|options|resources|opportunities|jobs|words|errors)\b/gi,
    type: "grammar",
    severity: "moderate",
    suggest: (m) => `fewer ${m[1]}`,
    explain: "Countable nouns take ‘fewer’. ‘Less’ is reserved for uncountables (*less time*, *less evidence*).",
    level: "C1",
  },

  // --- agreement and determiners -------------------------------------------
  {
    id: "there-is-plural",
    pattern: /\bthere\s+(is|was)\s+(many|several|numerous|a\s+lot\s+of|lots\s+of|few|both)\b/gi,
    type: "grammar",
    severity: "major",
    suggest: (m) => `there ${m[1].toLowerCase() === "is" ? "are" : "were"} ${m[2]}`,
    explain: "The verb agrees with the noun that follows: *there are many reasons*.",
    level: "B2",
  },
  {
    id: "one-of-singular",
    pattern: /\bone\s+of\s+the\s+([a-z]+?[^s\W])\b(?=[,.;:!?]|$)/gi,
    type: "grammar",
    severity: "minor",
    suggest: (m) => `one of the ${m[1]}s`,
    explain: "‘One of the …’ is followed by a plural noun: *one of the reasons*.",
    // Restricted to clause-final position: "one of the best players" is fine,
    // and a looser pattern flags it as an error.
    level: "B2",
  },
  {
    id: "double-comparative",
    pattern: /\bmore\s+([a-z]+(?:er))\b/gi,
    type: "grammar",
    severity: "major",
    suggest: (m) => m[1],
    explain: "Use either the *-er* inflection or *more*, never both.",
    level: "B2",
  },
  {
    id: "most-superlative",
    pattern: /\b(?:the\s+)?most\s+([a-z]+est)\b/gi,
    type: "grammar",
    severity: "major",
    suggest: (m) => `the ${m[1]}`,
    explain: "Double superlative. *The biggest*, not *the most biggest*.",
    level: "B2",
  },

  // --- modals and conditionals ---------------------------------------------
  {
    id: "of-for-have",
    pattern: /\b(could|would|should|must|might)\s+of\b/gi,
    type: "grammar",
    severity: "major",
    suggest: (m) => `${m[1].toLowerCase()} have`,
    explain: "A transcription of the contracted *’ve*. The written form is always *have*.",
    level: "B2",
  },
  {
    id: "if-would",
    pattern: /\bif\s+(\w+)\s+would\s+(?!like|prefer|mind|be\s+so\s+kind)/gi,
    type: "grammar",
    severity: "moderate",
    suggest: (m) => `if ${m[1]} `,
    explain: "In the conditional clause use a past form, not *would*: *If I had more time…*, not *If I would have…*.",
    level: "C1",
  },

  // --- register slippage in formal writing ---------------------------------
  {
    id: "according-to-me",
    pattern: /\baccording\s+to\s+(me|myself)\b/gi,
    type: "register",
    severity: "moderate",
    suggest: () => "in my view",
    explain: "‘According to’ attributes to *other* sources. For your own position use *in my view* or *I would argue*.",
    level: "C1",
  },
  {
    id: "in-my-point-of-view",
    pattern: /\bin\s+my\s+point\s+of\s+view\b/gi,
    type: "collocation",
    severity: "minor",
    suggest: () => "from my point of view",
    explain: "A blend of two phrases. Either *from my point of view* or *in my view*.",
    level: "C1",
  },
  {
    id: "irregardless",
    pattern: /\birregardless\b/gi,
    type: "word-choice",
    severity: "moderate",
    suggest: () => "regardless",
    explain: "‘Irregardless’ is widely regarded as non-standard; *regardless* is the safe choice in any register.",
    level: "C1",
  },
  {
    id: "nowadays-opener",
    pattern: /(?:^|\.\s+)(Nowadays|In\s+today's\s+world|In\s+the\s+modern\s+era)\b/g,
    type: "style",
    severity: "minor",
    suggest: () => "Over the past decade",
    explain: "A stock essay opener that examiners see constantly. Anchor the claim in something specific instead.",
    level: "C1",
    anchor: 1,
  },
  {
    id: "very-intensifier",
    pattern: /\bvery\s+(important|big|good|bad|difficult|interesting|hard|easy|small|happy|angry)\b/gi,
    type: "style",
    severity: "minor",
    suggest: (m) => {
      const upgrades: Record<string, string> = {
        important: "crucial",
        big: "substantial",
        good: "exemplary",
        bad: "detrimental",
        difficult: "formidable",
        interesting: "compelling",
        hard: "demanding",
        easy: "straightforward",
        small: "negligible",
        happy: "delighted",
        angry: "incensed",
      };
      return upgrades[m[1].toLowerCase()] ?? m[1];
    },
    explain: "A single precise adjective carries more weight than *very* plus a general one — a reliable C1→C2 upgrade.",
    level: "C2",
  },
  {
    id: "a-lot-of-formal",
    pattern: /\ba\s+lot\s+of\b/gi,
    type: "register",
    severity: "minor",
    suggest: () => "a considerable number of",
    explain: "‘A lot of’ is conversational. Formal prose prefers *a considerable number of* / *a substantial amount of*.",
    level: "C1",
    skipInGenres: ["EMAIL", "REVIEW"],
  },
  {
    id: "etc-academic",
    pattern: /\b(?:etc\.?|and\s+so\s+on)\b/gi,
    type: "register",
    severity: "minor",
    suggest: () => "among others",
    explain: "‘Etc.’ reads as a gap in the argument. Either complete the list or write *among others* / *and the like*.",
    level: "C1",
    skipInGenres: ["EMAIL"],
  },
  {
    id: "contractions-formal",
    pattern: /\b\w+(?:'|’)(?:s|t|re|ve|ll|d|m)\b/g,
    type: "register",
    severity: "minor",
    suggest: (m) => m[0].replace(/(?:'|’)(s|t|re|ve|ll|d|m)/, (_, g) => {
      const expand: Record<string, string> = {
        t: " not", re: " are", ve: " have", ll: " will", d: " would", m: " am", s: " is",
      };
      return expand[g] ?? "";
    }),
    explain: "Contractions belong in speech and informal writing. Academic and professional prose spells forms out.",
    level: "C1",
    skipInGenres: ["EMAIL", "REVIEW", "ARTICLE"],
  },

  // --- cohesion -------------------------------------------------------------
  {
    id: "but-opener",
    pattern: /(?:^|\.\s+)(But|And|So)\s+/g,
    type: "cohesion",
    severity: "minor",
    suggest: (m) => {
      const swap: Record<string, string> = { But: "However,", And: "Moreover,", So: "Consequently," };
      return `${swap[m[1]] ?? m[1]} `;
    },
    explain: "Opening with a coordinating conjunction is fine in journalism but reads as informal in academic writing.",
    level: "C1",
    skipInGenres: ["EMAIL", "REVIEW", "ARTICLE"],
    anchor: 1,
  },
  {
    id: "in-conclusion-overuse",
    pattern: /\bin\s+conclusion\b/gi,
    type: "style",
    severity: "minor",
    suggest: () => "On balance",
    explain: "Signposting is good; *in conclusion* is the most predictable version of it. Vary with *on balance*, *taken together*.",
    level: "C2",
  },

  // --- naturalness ----------------------------------------------------------
  {
    id: "make-a-research",
    pattern: /\b(make|do)\s+(a\s+)?research\b/gi,
    type: "collocation",
    severity: "moderate",
    suggest: () => "conduct research",
    explain: "English collocates *conduct/carry out* with research, not *make*.",
    level: "C1",
  },
  {
    id: "take-a-decision",
    pattern: /\btake\s+(a\s+)?decision\b/gi,
    type: "collocation",
    severity: "minor",
    suggest: () => "make a decision",
    explain: "British English tolerates *take a decision*, but *make a decision* is unmarked everywhere.",
    level: "C1",
  },
  {
    id: "big-problem",
    pattern: /\bbig\s+(problem|issue|challenge|impact|difference)\b/gi,
    type: "collocation",
    severity: "minor",
    suggest: (m) => {
      const better: Record<string, string> = {
        problem: "serious problem",
        issue: "pressing issue",
        challenge: "formidable challenge",
        impact: "profound impact",
        difference: "marked difference",
      };
      return better[m[1].toLowerCase()] ?? m[0];
    },
    explain: "‘Big’ is the least specific intensifier available. Precise collocation is what separates C1 from C2.",
    level: "C2",
  },
  {
    id: "literally",
    pattern: /\bliterally\b/gi,
    type: "word-choice",
    severity: "minor",
    suggest: () => "genuinely",
    explain: "Unless the statement is literally true, this reads as a filler intensifier in formal registers.",
    level: "C2",
    skipInGenres: ["EMAIL", "REVIEW"],
  },
];

/** Hedging devices — their absence is itself feedback for academic writing. */
export const HEDGES = [
  "may", "might", "could", "appears to", "seems to", "suggests", "tends to",
  "arguably", "largely", "broadly", "to some extent", "in part", "relatively",
  "it is possible that", "the evidence indicates", "this implies",
];

/** Discourse markers, grouped so we can report *variety*, not just count. */
export const DISCOURSE_MARKERS: Record<string, string[]> = {
  addition: ["moreover", "furthermore", "in addition", "what is more", "equally"],
  contrast: ["however", "nevertheless", "nonetheless", "conversely", "by contrast", "that said"],
  cause: ["therefore", "consequently", "hence", "thus", "as a result", "accordingly"],
  concession: ["admittedly", "granted", "while it is true", "even so", "to be fair"],
  exemplification: ["for instance", "for example", "namely", "in particular", "to illustrate"],
  sequencing: ["initially", "subsequently", "ultimately", "finally", "in turn"],
};

/** Advanced structures we reward when present — the C2 "range" signal. */
export const ADVANCED_STRUCTURES: { id: string; label: string; pattern: RegExp }[] = [
  {
    id: "inversion",
    label: "Negative inversion",
    pattern: /\b(?:not\s+only|rarely|seldom|never\s+before|under\s+no\s+circumstances|no\s+sooner|little\s+did)\b[^.?!]*\b(?:do|does|did|is|are|was|were|has|have|had|can|could|would|will)\b/gi,
  },
  {
    id: "cleft",
    label: "Cleft sentence",
    pattern: /\b(?:it\s+(?:is|was)\s+[^.?!]{2,40}\s+that|what\s+[^.?!]{2,40}\s+is\s+that)\b/gi,
  },
  {
    id: "subjunctive",
    label: "Subjunctive",
    pattern: /\b(?:recommend|suggest|insist|demand|propose|request|essential|vital|imperative|crucial)\s+that\s+\w+\s+(?:be|not\s+be|have|do|take|make|remain)\b/gi,
  },
  {
    id: "participle-clause",
    label: "Participle clause",
    pattern: /(?:^|[,;]\s*)(?:having\s+\w+ed|having\s+been|\w+ing)\s+[^,.?!]{3,60},/gi,
  },
  {
    id: "nominalisation",
    label: "Nominalisation",
    pattern: /\b\w{4,}(?:tion|ment|ance|ence|ity|ness|ship)\b/gi,
  },
  {
    id: "concessive",
    label: "Concessive clause",
    pattern: /\b(?:although|even\s+though|whereas|while|notwithstanding|despite\s+the\s+fact\s+that)\b/gi,
  },
];

/** Passive voice detector — used for a ratio, not a blanket warning. */
export const PASSIVE_PATTERN =
  /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+(?:ed|en|own|ought|uilt|aught))\b/gi;

export { cap };
