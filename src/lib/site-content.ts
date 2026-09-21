/**
 * Content of the public information pages.
 *
 * Kept as data rather than JSX so the same text is rendered three ways from
 * one source: as HTML for people, as Markdown in /llms-full.txt for language
 * models, and as JSON-LD where a page type (FAQ) has a schema. If a claim
 * changes, it changes here and everywhere at once.
 *
 * Every claim below is backed by the codebase and the docs/ folder. Do not add
 * marketing statements that the product does not honour.
 */

import { SITE_NAME } from "./site";

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface ContentSection {
  id: string;
  heading: string;
  blocks: ContentBlock[];
}

export interface InfoPage {
  path: string;
  title: string;
  /** Opening paragraph, also used as the page's meta description. */
  lead: string;
  sections: ContentSection[];
}

const p = (text: string): ContentBlock => ({ type: "paragraph", text });
const list = (items: string[]): ContentBlock => ({ type: "list", items });
const table = (headers: string[], rows: string[][]): ContentBlock => ({ type: "table", headers, rows });

/* ---------------------------------------------------------------- Features */

export interface Feature {
  id: string;
  title: string;
  summary: string;
  detail: string;
}

export const FEATURES: readonly Feature[] = [
  {
    id: "placement",
    title: "Adaptive placement",
    summary:
      "Twelve to twenty-two questions that adapt to every answer and stop as soon as your level is known.",
    detail:
      "The placement test uses a three-parameter item-response model. Each question is chosen to be maximally informative at your current ability estimate, the estimate is recomputed after every answer, and the test stops once it is precise enough — usually between twelve and twenty items rather than a fixed forty. The result is a CEFR level (B2, C1 or C2) plus subscores by skill.",
  },
  {
    id: "paths",
    title: "Personalised learning paths",
    summary: "Five sequenced curricula ordered by your goals and measured level.",
    detail:
      "Academic English, professional communication, idiomatic fluency, exam preparation and near-native nuance. Each path is a sequence of units and lessons; the order in which paths are recommended follows the goals you state at onboarding and the level the placement test measured.",
  },
  {
    id: "exercises",
    title: "Fifteen exercise types",
    summary: "From gap fill and key-word transformation to register shift, dictation and open writing.",
    detail:
      "Multiple choice, multi-select, gap fill, key-word transformation, error correction, reordering, matching, dictation, register shift, collocation building, note-taking, reading analysis, listening comprehension, open writing and speaking prompts. Closed exercise types are graded deterministically; open ones are assessed by the AI layer or the rules engine.",
  },
  {
    id: "srs",
    title: "Spaced repetition that respects you",
    summary: "SM-2 with learning steps, partial-credit lapses and interval fuzz.",
    detail:
      "Every lexical item carries register, connotation and collocation, because at C1 the definition was never the problem. Forgetting one mature card does not reset months of work: a lapse keeps part of its interval. New cards are capped per day so the queue never becomes a punishment, and intervals are fuzzed so reviews do not pile up on the same day.",
  },
  {
    id: "conversation",
    title: "AI conversation partner",
    summary: "Free dialogue, role-play, interview and exam-speaking modes with selective correction.",
    detail:
      "Corrections and higher-level rephrasings appear beside the conversation rather than interrupting it, so the dialogue keeps its flow. Only errors worth generalising from are flagged. When no AI provider is configured, a deterministic rules engine still corrects real errors and suggests real upgrades, and the interface says so.",
  },
  {
    id: "debate",
    title: "A debate opponent, not a cheerleader",
    summary: "Holds an assigned position and attacks the weakest link in your reasoning.",
    detail:
      "Debate mode is built for C1 and C2 learners who need sustained argument, hedging and diplomatic disagreement. The opponent concedes only what it genuinely must, which is what makes the practice worth having.",
  },
  {
    id: "writing",
    title: "Writing studio with the working shown",
    summary: "Plan, write, then get a banded report against IELTS-style descriptors.",
    detail:
      "Reports are grounded in measured features — readability, lexical density, structures detected — that you can check yourself against the text. The band is an estimate and is labelled as one; the evidence behind it is always visible.",
  },
  {
    id: "pronunciation",
    title: "Pronunciation, scored honestly",
    summary: "Accuracy, fluency, completeness and a prosody proxy, computed on your device.",
    detail:
      "Recognition and synthesis run through the browser's Web Speech API, so audio never leaves your device. Advice targets the sounds and stress patterns that actually cost intelligibility. The documentation is explicit about what a text-based score can and cannot tell you.",
  },
  {
    id: "exams",
    title: "Exam preparation",
    summary: "Timed IELTS, TOEFL, Cambridge C1 Advanced and C2 Proficiency modules.",
    detail:
      "Modules mirror the format of the real papers — matching headings, key-word transformation, gapped text, integrated writing, academic-lecture listening — and report an indicative score conversion alongside the technique that separates a 6.5 from a 7.5.",
  },
  {
    id: "gamification",
    title: "Motivation without manipulation",
    summary: "XP, levels, streaks with freezes, badges, daily challenges and leaderboards.",
    detail:
      "Streaks can be protected with freezes, so one missed day is not a catastrophe. Daily challenges rotate, and leaderboards are scoped to a period so newcomers are not competing against a year of history.",
  },
  {
    id: "analytics",
    title: "Analytics you can act on",
    summary: "Per-skill trends, recall rate, review forecast and a checkable weekly report.",
    detail:
      "A per-skill radar, XP by source, recall rate, the review forecast, pronunciation and writing-band trends, and a weekly report whose every claim can be verified against the charts on the same page.",
  },
  {
    id: "offline",
    title: "Works offline",
    summary: "Reviews and lessons are cached and replayed on reconnect.",
    detail:
      "Study data is cached in the browser, completed work is queued in an outbox and replayed idempotently when the connection returns, and the scheduler uses the time you actually studied rather than the time you reconnected.",
  },
  {
    id: "accessibility",
    title: "Accessible throughout",
    summary: "WCAG 2.1 AA: keyboard-first flows, text scaling, high contrast, reduced motion.",
    detail:
      "Visible focus, live regions for dynamic updates, no colour-only signalling, text scaling up to 200 %, a high-contrast mode and an in-app reduced-motion switch for people whose operating system does not expose one.",
  },
];

/* ------------------------------------------------------------------ Levels */

export interface Level {
  code: "B2" | "C1" | "C2";
  name: string;
  cefr: string;
  where: string;
  plateau: string;
  focus: string[];
}

export const LEVELS: readonly Level[] = [
  {
    code: "B2",
    name: "Upper-intermediate",
    cefr: "Independent user (CEFR B2, 'Vantage')",
    where:
      "You handle complex text and hold your own in discussion. You can follow a lecture, write a clear essay and take part in a meeting without preparation.",
    plateau:
      "What holds you back is precision: the right preposition, the natural collocation, the register that fits the room. Errors are rarely grammatical; they are choices a native speaker would not make.",
    focus: [
      "Phrasal verbs and collocation",
      "Register awareness",
      "Idiom in context",
      "Accuracy under pressure",
    ],
  },
  {
    code: "C1",
    name: "Advanced",
    cefr: "Proficient user (CEFR C1, 'Effective operational proficiency')",
    where:
      "You express yourself fluently and flexibly for social, academic and professional purposes, and you produce clear, well-structured text on complex subjects.",
    plateau:
      "The remaining gap is rhetorical: hedging, positioning, diplomatic disagreement and sustained argument. You know what you want to say; the question is how much force to give it.",
    focus: [
      "Hedging and stance",
      "Inversion, clefts and the subjunctive",
      "Academic and professional writing",
      "Critical reading",
    ],
  },
  {
    code: "C2",
    name: "Proficient",
    cefr: "Proficient user (CEFR C2, 'Mastery')",
    where:
      "You operate close to a native speaker: you understand virtually everything you hear or read and can reconstruct arguments from several sources in a coherent presentation.",
    plateau:
      "What remains is the subtlest layer — connotation, implicature, understatement and stylistic control. The difference between correct and native is no longer a matter of rules.",
    focus: [
      "Connotation over definition",
      "Irony and understatement",
      "Rhetorical devices",
      "Effortless spontaneity",
    ],
  },
];

/* ------------------------------------------------------------------- Exams */

export interface ExamInfo {
  code: string;
  name: string;
  body: string;
  levels: string;
  modules: string[];
}

export const EXAMS: readonly ExamInfo[] = [
  {
    code: "IELTS",
    name: "IELTS Academic",
    body: "British Council, IDP and Cambridge",
    levels: "Band 0–9 across four skills; most universities ask for 6.5–7.5 overall",
    modules: ["Reading — matching headings", "Writing Task 2 — discursive essay"],
  },
  {
    code: "TOEFL",
    name: "TOEFL iBT",
    body: "ETS",
    levels: "0–120, thirty points per section; competitive programmes typically want 100+",
    modules: ["Integrated writing — reading and lecture", "Listening — academic lecture"],
  },
  {
    code: "CAE",
    name: "Cambridge C1 Advanced",
    body: "Cambridge University Press & Assessment",
    levels: "Cambridge scale 160–210; a pass at grade C (180) certifies C1",
    modules: ["Use of English — key word transformation"],
  },
  {
    code: "CPE",
    name: "Cambridge C2 Proficiency",
    body: "Cambridge University Press & Assessment",
    levels: "Cambridge scale 180–230; a pass at grade C (200) certifies C2",
    modules: ["Reading — gapped text"],
  },
];

/* --------------------------------------------------------------------- FAQ */

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ: readonly FaqItem[] = [
  {
    question: `What is ${SITE_NAME}?`,
    answer: `${SITE_NAME} is an adaptive, AI-powered platform for mastering English at CEFR B2, C1 and C2. It combines an adaptive placement test, personalised learning paths, spaced repetition, an AI conversation and debate partner, a writing studio, a pronunciation lab, exam preparation and analytics in one web application.`,
  },
  {
    question: "Who is it for?",
    answer:
      "Learners whose English is already good — upper-intermediate and above — and who have plateaued. Most language apps stop where advanced learning begins; Lexicon starts there, with register, connotation, implicature, rhetorical control and idiomatic range.",
  },
  {
    question: "Is it free to start?",
    answer:
      "Yes. Creating an account and taking the adaptive placement test is free, and the placement result immediately unlocks the learning paths recommended for your level.",
  },
  {
    question: "How long is the placement test?",
    answer:
      "Between twelve and twenty-two questions. The test is adaptive: it picks each question to be maximally informative at your current ability estimate and stops as soon as that estimate is precise enough, so it usually finishes in twelve to twenty items.",
  },
  {
    question: "Which levels does it cover?",
    answer:
      "CEFR B2 (upper-intermediate), C1 (advanced) and C2 (proficient). It is not designed for beginners or intermediate learners below B2.",
  },
  {
    question: "Which exams does it prepare for?",
    answer:
      "IELTS Academic, TOEFL iBT, Cambridge C1 Advanced (CAE) and Cambridge C2 Proficiency (CPE), with timed modules that mirror the real papers and an indicative score conversion.",
  },
  {
    question: "Does it use AI, and what happens if the AI is unavailable?",
    answer:
      "Conversation, debate, writing feedback and grammar feedback can be powered by a large language model. When no model is configured or it is unavailable, a deterministic rules engine takes over: it still corrects real errors and produces banded writing reports from measured features. The interface labels which one produced your feedback, and no feature disappears.",
  },
  {
    question: "Is my speech recording sent to a server?",
    answer:
      "No. Speech recognition and synthesis run through the browser's Web Speech API, entirely on your device. Only the recognised text is scored.",
  },
  {
    question: "Can I study offline?",
    answer:
      "Yes. Your review queue and recent lessons are cached in the browser. Work you complete offline is queued and replayed when you reconnect, and it is scheduled from the time you actually studied.",
  },
  {
    question: "Is it accessible?",
    answer:
      "The application targets WCAG 2.1 AA throughout: keyboard-first flows, visible focus, text scaling, a high-contrast mode, reduced motion, live regions and no colour-only signalling.",
  },
  {
    question: "Can AI assistants and search engines read this site?",
    answer:
      "Yes. The public pages are open to all crawlers, including those operated by OpenAI, Anthropic, Google, Microsoft, Perplexity, Apple, Meta and Common Crawl. A sitemap, structured data and an llms.txt summary are published so that both search engines and AI assistants can describe the site accurately. Learner data behind the sign-in is never exposed.",
  },
];

/* ------------------------------------------------------------- Info pages */

export const ABOUT_PAGE: InfoPage = {
  path: "/about",
  title: `About ${SITE_NAME}`,
  lead: `${SITE_NAME} is an adaptive, AI-powered platform for mastering English at CEFR B2, C1 and C2 — built for learners whose English is already good and who want the last mile.`,
  sections: [
    {
      id: "why",
      heading: "Why it exists",
      blocks: [
        p(
          "Most language apps stop where advanced learning begins. They are built for beginners, so their lessons run out of things to say at the point where the interesting problems start: register, connotation, implicature, rhetorical control and the idiomatic range that separates correct English from native English.",
        ),
        p(
          `${SITE_NAME} starts there. Every feature exists because it addresses a specific reason advanced learners plateau — not because a competitor has it.`,
        ),
      ],
    },
    {
      id: "who",
      heading: "Who it is for",
      blocks: [
        list([
          "Upper-intermediate (B2) learners who are accurate but not yet natural.",
          "Advanced (C1) learners preparing for university, a professional role or a Cambridge, IELTS or TOEFL exam.",
          "Proficient (C2) learners refining connotation, understatement and style.",
          "Teachers and institutions looking for a platform that takes advanced learners seriously.",
        ]),
      ],
    },
    {
      id: "principles",
      heading: "Principles",
      blocks: [
        list([
          "Measure, then teach. The placement test adapts to every answer and stops when it knows your level.",
          "Feedback says why. Every correction explains the principle behind it; corrections you cannot generalise from are worth very little.",
          "Show the working. Writing bands and pronunciation scores are grounded in measured features you can check yourself.",
          "Be honest about AI. The interface always says whether a language model or the deterministic rules engine produced a piece of feedback.",
          "Respect the learner's time. Spaced repetition with partial-credit lapses, capped new cards and offline replay.",
          "Accessible by default. WCAG 2.1 AA throughout, not as an afterthought.",
        ]),
      ],
    },
    {
      id: "technology",
      heading: "Technology",
      blocks: [
        p(
          "A Next.js application with a PostgreSQL database, a custom JWT authentication layer, a provider-agnostic AI layer with a full deterministic fallback, and the browser's Web Speech API for recognition and synthesis. It runs on Vercel, in Docker or on any Node host.",
        ),
      ],
    },
  ],
};

export const HOW_IT_WORKS_PAGE: InfoPage = {
  path: "/how-it-works",
  title: `How ${SITE_NAME} works`,
  lead: "The placement engine, the spaced-repetition scheduler, the AI layer and the offline model — what each one does and why it deviates from the textbook where it does.",
  sections: [
    {
      id: "placement",
      heading: "Adaptive placement",
      blocks: [
        p(
          "A fixed forty-question test wastes most of its questions on items that are far too easy or far too hard for the person taking it. The placement test instead uses a three-parameter item-response model: each item has a difficulty, a discrimination and a guessing parameter, and the next item is always the one that is most informative at the learner's current ability estimate.",
        ),
        p(
          "The ability estimate is recomputed from the full response set after every answer using an expected-a-posteriori estimator, which stays stable when the first few answers are all right or all wrong. The test never asks fewer than twelve questions, never more than twenty-two, and stops in between as soon as the standard error of the estimate is small enough. The final estimate maps to B2, C1 or C2 plus subscores by skill.",
        ),
      ],
    },
    {
      id: "srs",
      heading: "Spaced repetition",
      blocks: [
        p(
          "Review scheduling is SM-2 with three deliberate deviations. New cards go through short learning steps before they graduate to day-scale intervals. A lapse on a mature card keeps part of its previous interval rather than resetting to zero, because forgetting one card once is not evidence that months of retention were an illusion. Intervals are fuzzed by a few per cent so cards learned on the same day do not all come due together.",
        ),
        p(
          "Every lexical item carries register, connotation and collocation alongside its definition, the daily number of new cards is capped so that the queue stays manageable, and intervals never exceed two years.",
        ),
      ],
    },
    {
      id: "ai",
      heading: "The AI layer",
      blocks: [
        p(
          "Conversation, debate, writing feedback and grammar feedback are produced by a large language model when one is configured, and by a deterministic rules engine when it is not. The rules engine runs as a pre-pass even when a model is configured, because mechanical errors are caught more cheaply and reliably by a rule. Its roughly thirty-five rules target the errors that survive into B2–C2 writing — calqued prepositions and verb patterns, pluralised uncountables, quantifier and agreement slips, register slippage, weak collocation and mechanical cohesion — and every correction is anchored to a span of the learner's own text. The rules are built for precision: a correct sentence must produce zero findings.",
        ),
        p(
          "Model output is treated as untrusted. A correction that quotes text the learner did not write is dropped rather than highlighted in the wrong place; band scores are clamped to the 0–9 scale and cross-checked against their own criteria; and an empty or malformed response falls back to the rules engine. The interface labels which path produced the feedback so that no one mistakes a heuristic for a judgement.",
        ),
      ],
    },
    {
      id: "writing",
      heading: "Writing bands",
      blocks: [
        p(
          "A writing report estimates a band against IELTS-style descriptors — task response, coherence and cohesion, lexical resource, grammatical range and accuracy — and shows the measured features the estimate rests on: readability, lexical density, type-token ratio, passive ratio, discourse-marker variety and the marked structures detected (inversion, clefts, subjunctive, participle clauses). The learner can check every claim against their own text.",
        ),
      ],
    },
    {
      id: "pronunciation",
      heading: "Pronunciation",
      blocks: [
        p(
          "The browser transcribes the learner's speech locally; the transcript is compared with the target text to produce accuracy, fluency, completeness and a prosody proxy. Advice targets the sounds and stress patterns most likely to cost intelligibility. Because the score is derived from recognised text rather than the audio signal, it is presented as a proxy and not as a phonetic assessment.",
        ),
      ],
    },
    {
      id: "offline",
      heading: "Offline study",
      blocks: [
        p(
          "A service worker caches the application shell, the review queue and recent lessons. Work completed offline is written to an outbox in the browser and replayed to the server when the connection returns. Each mutation carries an idempotency key, so a replay that happens twice is applied once, and reviews are scheduled from the time the learner actually studied.",
        ),
      ],
    },
    {
      id: "motivation",
      heading: "Motivation",
      blocks: [
        p(
          "XP is awarded for lessons, reviews, conversations, writing and exam modules, and productive work — a piece of writing, a debate turn — pays more than a recognition task, so the economy does not reward grinding easy multiple choice. The streak multiplier is capped at fifty per cent so a year-long streak cannot make the leaderboard unwinnable. Streaks can be protected with freezes, daily challenges rotate, and leaderboards are scoped to a period so nobody competes against a year of someone else's history.",
        ),
      ],
    },
  ],
};

export const EXAM_PAGE: InfoPage = {
  path: "/exam-preparation",
  title: "Exam preparation",
  lead: "Timed modules for IELTS Academic, TOEFL iBT, Cambridge C1 Advanced and Cambridge C2 Proficiency, in the format of the real papers, with an indicative score conversion and the technique that separates a good score from a great one.",
  sections: [
    {
      id: "approach",
      heading: "The approach",
      blocks: [
        p(
          "At B2 and above, exam scores are rarely limited by language knowledge alone. They are limited by technique: reading the question the way the examiner wrote it, managing time across a paper, knowing what a band-7 essay does that a band-6.5 essay does not. Each module is timed, mirrors the structure of the corresponding real paper, and reports both a raw score and an indicative conversion to the exam's own scale.",
        ),
      ],
    },
    {
      id: "exams",
      heading: "Exams covered",
      blocks: [
        table(
          ["Exam", "Awarding body", "Scale", "Modules"],
          EXAMS.map((exam) => [exam.name, exam.body, exam.levels, exam.modules.join("; ")]),
        ),
      ],
    },
    {
      id: "conversion",
      heading: "About the score conversion",
      blocks: [
        p(
          "Conversions between a module's raw score and the exam's scale are indicative. They tell you where you stand and which direction to work in; they are not a prediction of your result on the day, and the application says so wherever a converted score is shown.",
        ),
      ],
    },
  ],
};

export const INFO_PAGES: readonly InfoPage[] = [ABOUT_PAGE, HOW_IT_WORKS_PAGE, EXAM_PAGE];

/* --------------------------------------------------------- Markdown export */

/** Renders a block as GitHub-flavoured Markdown, for /llms-full.txt. */
export function blockToMarkdown(block: ContentBlock): string {
  switch (block.type) {
    case "paragraph":
      return block.text;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "table": {
      const header = `| ${block.headers.join(" | ")} |`;
      const rule = `| ${block.headers.map(() => "---").join(" | ")} |`;
      const rows = block.rows.map((row) => `| ${row.join(" | ")} |`);
      return [header, rule, ...rows].join("\n");
    }
  }
}

export function infoPageToMarkdown(page: InfoPage): string {
  const parts = [`## ${page.title}`, page.lead];
  for (const section of page.sections) {
    parts.push(`### ${section.heading}`);
    for (const block of section.blocks) parts.push(blockToMarkdown(block));
  }
  return parts.join("\n\n");
}
