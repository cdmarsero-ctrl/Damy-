import "server-only";

import type { WritingGenre } from "@prisma/client";

import { analyse } from "../text";
import { findCorrections, heuristicWriting, profileStyle } from "./heuristics";
import { completeJson, hasLiveAI } from "./provider";
import type {
  Correction,
  CorrectionType,
  Severity,
  WritingCriteria,
  WritingReport,
  WritingRequest,
} from "./types";

/**
 * The academic and professional writing assistant.
 *
 * The model is given the *measured* features of the text (readability, lexical
 * density, structures detected, rule-engine findings) alongside the text
 * itself. Grounding the judgement in numbers the learner can also see makes the
 * feedback reproducible and far harder for the model to hand-wave.
 */

const GENRE_BRIEF: Record<WritingGenre, string> = {
  ESSAY:
    "An argumentative essay. Judge thesis clarity, whether each paragraph advances a single claim, quality of evidence, treatment of counter-arguments, and whether the conclusion does more than restate.",
  REPORT:
    "A formal report. Judge structure (terms of reference, findings, recommendations), objectivity of tone, appropriate nominalisation, and whether recommendations follow from the findings.",
  PROPOSAL:
    "A persuasive proposal. Judge whether the need is established before the solution, whether benefits are quantified, and whether objections are pre-empted.",
  EMAIL:
    "Professional correspondence. Judge appropriateness of register to the stated relationship, clarity of the ask, diplomatic distancing where needed, and efficiency.",
  REVIEW:
    "A review. Judge evaluative stance, balance of description and judgement, vividness of language, and whether a recommendation is earned.",
  ARTICLE:
    "A feature article. Judge the hook, narrative control, use of concrete detail, and whether the register suits the publication implied by the prompt.",
  ABSTRACT:
    "An academic abstract. Judge whether background, method, results and implications are all present within a tight word budget, and whether hedging is calibrated to the strength of the claims.",
  COVER_LETTER:
    "A cover letter. Judge whether claims are evidenced, whether it addresses the specific role, and whether confidence is conveyed without arrogance.",
  SUMMARY:
    "A summary. Judge fidelity to the source, proportionality of coverage, successful paraphrase rather than patchwriting, and concision.",
};

const CORRECTION_TYPES: CorrectionType[] = [
  "grammar", "word-choice", "collocation", "register",
  "spelling", "punctuation", "cohesion", "style", "naturalness",
];
const SEVERITIES: Severity[] = ["minor", "moderate", "major"];

function systemPrompt(request: WritingRequest, measured: string): string {
  return `You are an experienced examiner and writing tutor for advanced English learners (CEFR B2-C2). You assess to IELTS-style band descriptors on a 0-9 scale, in half bands.

Genre: ${GENRE_BRIEF[request.genre]}
Learner's working level: ${request.cefr}.
Task prompt given to the learner: "${request.prompt}"

Measured features of the submission (computed, not estimated — use them, do not contradict them):
${measured}

Return ONLY a JSON object:
{
  "overallBand": 6.5,
  "criteria": {
    "taskAchievement": 6.5,
    "coherenceCohesion": 7,
    "lexicalResource": 6,
    "grammaticalRange": 6.5,
    "registerStyle": 7
  },
  "summary": "2-3 sentences: the honest headline judgement, including what is holding the band down",
  "strengths": ["specific, quoting the learner where possible"],
  "priorities": ["the 3 changes that would raise the band fastest, most important first"],
  "annotations": [
    {
      "original": "exact substring from the learner's text",
      "suggestion": "the improved version",
      "type": "grammar | word-choice | collocation | register | spelling | punctuation | cohesion | style | naturalness",
      "severity": "minor | moderate | major",
      "explanation": "why this matters, one sentence"
    }
  ],
  "modelAnswer": "a paragraph (not the whole text) rewritten at one band higher, so the learner can see the difference concretely"
}

Requirements:
- Be honest. Inflated bands help nobody sitting a real exam.
- "original" MUST be an exact substring of the submission, copied character for character.
- At most 12 annotations. Prioritise patterns over one-off slips; if the same error recurs, annotate it once and say it recurs.
- Strengths must be specific. "Good vocabulary" is not feedback.
- Priorities must be actionable instructions, not descriptions of the problem.`;
}

interface RawReport {
  overallBand: number;
  criteria: WritingCriteria;
  summary: string;
  strengths: string[];
  priorities: string[];
  annotations: Correction[];
  modelAnswer?: string;
}

function clampBand(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(9, Math.round(n * 2) / 2));
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, limit);
}

function validate(value: unknown, text: string, fallbackBands: WritingCriteria): RawReport | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.summary !== "string" || !v.summary.trim()) return null;

  const rawCriteria = (v.criteria ?? {}) as Record<string, unknown>;
  const criteria: WritingCriteria = {
    taskAchievement: clampBand(rawCriteria.taskAchievement, fallbackBands.taskAchievement),
    coherenceCohesion: clampBand(rawCriteria.coherenceCohesion, fallbackBands.coherenceCohesion),
    lexicalResource: clampBand(rawCriteria.lexicalResource, fallbackBands.lexicalResource),
    grammaticalRange: clampBand(rawCriteria.grammaticalRange, fallbackBands.grammaticalRange),
    registerStyle: clampBand(rawCriteria.registerStyle, fallbackBands.registerStyle),
  };

  const values = Object.values(criteria);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const annotations: Correction[] = [];
  if (Array.isArray(v.annotations)) {
    for (const entry of v.annotations.slice(0, 12)) {
      if (typeof entry !== "object" || entry === null) continue;
      const a = entry as Record<string, unknown>;
      const original = typeof a.original === "string" ? a.original : "";
      const suggestion = typeof a.suggestion === "string" ? a.suggestion : "";
      if (!original || !suggestion || original.trim() === suggestion.trim()) continue;

      const start = text.indexOf(original);
      if (start < 0) continue;

      annotations.push({
        span: [start, start + original.length],
        type: CORRECTION_TYPES.includes(a.type as CorrectionType)
          ? (a.type as CorrectionType)
          : "style",
        original,
        suggestion,
        explanation: typeof a.explanation === "string" ? a.explanation : "",
        severity: SEVERITIES.includes(a.severity as Severity) ? (a.severity as Severity) : "moderate",
      });
    }
  }

  const strengths = stringList(v.strengths, 4);
  const priorities = stringList(v.priorities, 4);
  if (strengths.length === 0 && priorities.length === 0) return null;

  return {
    // A model that reports an overall band wildly out of line with its own
    // criteria has contradicted itself; trust the criteria.
    overallBand: clampBand(v.overallBand, mean),
    criteria,
    summary: v.summary.trim(),
    strengths,
    priorities,
    annotations,
    modelAnswer: typeof v.modelAnswer === "string" ? v.modelAnswer.trim() : undefined,
  };
}

function measuredFeatures(request: WritingRequest): string {
  const stats = analyse(request.text);
  const style = profileStyle(request.text);
  const rules = findCorrections(request.text, request.genre);

  const lines = [
    `- ${stats.wordCount} words in ${stats.sentenceCount} sentences (mean ${stats.avgSentenceLength}, longest ${style.longestSentence})`,
    `- Flesch reading ease ${stats.fleschReadingEase}, Flesch-Kincaid grade ${stats.fleschKincaidGrade}`,
    `- Type-token ratio ${stats.typeTokenRatio}, lexical density ${stats.lexicalDensity}`,
    `- Passive voice in roughly ${Math.round(style.passiveRatio * 100)}% of clauses`,
    `- Discourse marker functions used: ${style.markerCategories.join(", ") || "none detected"}`,
    `- Advanced structures detected: ${style.advancedStructures.join(", ") || "none detected"}`,
    `- Hedging devices: ${style.hedgeCount}`,
  ];

  if (style.repeatedWords.length) {
    lines.push(
      `- Over-repeated content words: ${style.repeatedWords.map((r) => `${r.word} (${r.count})`).join(", ")}`,
    );
  }
  if (rules.length) {
    lines.push(
      `- Rule-engine findings already detected (do not simply repeat them; judge whether they matter): ${rules
        .slice(0, 8)
        .map((r) => `"${r.original}" → "${r.suggestion}"`)
        .join("; ")}`,
    );
  }
  return lines.join("\n");
}

export async function review(request: WritingRequest): Promise<WritingReport> {
  const fallback = heuristicWriting(request);
  if (!hasLiveAI()) return fallback;

  const result = await completeJson(
    {
      system: systemPrompt(request, measuredFeatures(request)),
      user: `Learner's submission:\n\n${request.text}`,
      temperature: 0.25,
      maxTokens: 2000,
    },
    (value) => validate(value, request.text, fallback.criteria),
  );

  if (!result) return fallback;

  return {
    overallBand: result.overallBand,
    criteria: result.criteria,
    // Keep any mechanical finding the model overlooked.
    annotations: mergeAnnotations(result.annotations, fallback.annotations),
    strengths: result.strengths.length ? result.strengths : fallback.strengths,
    priorities: result.priorities.length ? result.priorities : fallback.priorities,
    summary: result.summary,
    modelAnswer: result.modelAnswer,
    source: "model",
  };
}

function mergeAnnotations(model: Correction[], rules: Correction[]): Correction[] {
  const out = [...model];
  for (const rule of rules) {
    const overlapping = out.some((m) => rule.span[0] < m.span[1] && rule.span[1] > m.span[0]);
    if (!overlapping) out.push(rule);
  }
  return out.sort((a, b) => a.span[0] - b.span[0]).slice(0, 20);
}

/**
 * Structural outline help — offered *before* writing, which is where most
 * learners actually need it. Falls back to a genre template.
 */
export async function outline(genre: WritingGenre, prompt: string, cefr: string): Promise<string[]> {
  const template = OUTLINE_TEMPLATES[genre];
  if (!hasLiveAI()) return template;

  const result = await completeJson<{ outline: string[] }>(
    {
      system: `You help advanced English learners plan a piece of writing before they start. Return ONLY {"outline": ["step 1", ...]} with 4-7 concrete, prompt-specific planning steps. Each step names what goes in that section AND what the learner must decide. Generic advice is useless — refer to the actual prompt.`,
      user: `Genre: ${genre}. Learner level: ${cefr}. Prompt: "${prompt}"`,
      temperature: 0.4,
      maxTokens: 600,
    },
    (value) => {
      if (typeof value !== "object" || value === null) return null;
      const list = (value as Record<string, unknown>).outline;
      const steps = stringList(list, 7);
      return steps.length >= 3 ? { outline: steps } : null;
    },
  );

  return result?.outline ?? template;
}

const OUTLINE_TEMPLATES: Record<WritingGenre, string[]> = {
  ESSAY: [
    "Hook and context — one sentence that is specific to this prompt, not to essays in general.",
    "Thesis — the single claim you will defend, stated in one sentence you could be wrong about.",
    "Body 1 — your strongest argument, with evidence and a worked example.",
    "Body 2 — your second argument, chosen so it does not overlap the first.",
    "Counter-argument — state the strongest objection in its strongest form, then answer it.",
    "Conclusion — the implication of your thesis, not a summary of it.",
  ],
  REPORT: [
    "Terms of reference — who commissioned this, and what question it answers.",
    "Procedure — how the information was gathered.",
    "Findings — grouped under sub-headings, factual and unevaluated.",
    "Conclusions — what the findings mean, still without recommendation.",
    "Recommendations — numbered, actionable, each traceable to a finding.",
  ],
  PROPOSAL: [
    "The problem — establish need before you mention any solution.",
    "Proposed solution — what exactly you are asking for.",
    "Benefits — quantified wherever possible.",
    "Anticipated objections — name them before your reader does.",
    "Next steps and timeline.",
  ],
  EMAIL: [
    "Subject line — the ask or the news, not the topic.",
    "Opening — calibrate warmth to the relationship.",
    "Context — the minimum the reader needs.",
    "The ask — explicit, with a deadline.",
    "Close — what happens next, and who does it.",
  ],
  REVIEW: [
    "Opening judgement — your verdict, up front.",
    "What it is — enough description to orient a reader who does not know it.",
    "What works — with a concrete illustration.",
    "What does not — specific, not sneering.",
    "Recommendation — for whom, and under what conditions.",
  ],
  ARTICLE: [
    "Hook — an image, a fact or a question a reader cannot put down.",
    "Nut graph — why this matters now.",
    "Development — two or three movements, each with concrete detail.",
    "A voice other than yours — a quotation or a case.",
    "Ending — a return to the hook that has been changed by the piece.",
  ],
  ABSTRACT: [
    "Background — one or two sentences on the gap.",
    "Objective — what this study does about it.",
    "Method — design, participants, analysis, compressed.",
    "Results — the actual numbers or findings.",
    "Implications — hedged to the strength of the evidence.",
  ],
  COVER_LETTER: [
    "Opening — the role, and one reason you are a serious candidate.",
    "Evidence 1 — an achievement with a measurable outcome.",
    "Evidence 2 — a skill the posting names, demonstrated not asserted.",
    "Fit — why this organisation specifically.",
    "Close — availability and a confident, non-presumptuous request.",
  ],
  SUMMARY: [
    "Source and thesis in one sentence.",
    "Main supporting points, in proportion to the original.",
    "Any significant qualification the author makes.",
    "Paraphrase check — no phrase over three words lifted from the source.",
  ],
};
