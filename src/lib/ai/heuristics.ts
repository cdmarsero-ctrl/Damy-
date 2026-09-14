import type { Cefr } from "@prisma/client";

import { analyse, sentences, words } from "../text";
import {
  ADVANCED_STRUCTURES,
  DISCOURSE_MARKERS,
  HEDGES,
  PASSIVE_PATTERN,
  RULES,
} from "./rules";
import type {
  Correction,
  TurnMetrics,
  TutorRequest,
  TutorTurn,
  Upgrade,
  WritingCriteria,
  WritingReport,
  WritingRequest,
} from "./types";

/**
 * The deterministic engine.
 *
 * It backs every AI surface when OPENAI_API_KEY is unset, and always runs as a
 * pre-pass when a model *is* configured — the rules catch mechanical errors
 * cheaply and reliably, leaving the model to judge argument, nuance and tone.
 *
 * Design constraint: never invent an error. A false positive on a correct
 * sentence costs a learner far more confidence than a missed error costs them
 * accuracy, so every rule here is high-precision by construction.
 */

export function findCorrections(text: string, genre?: string): Correction[] {
  const found: Correction[] = [];
  const claimed: [number, number][] = [];

  const overlaps = (start: number, end: number) =>
    claimed.some(([s, e]) => start < e && end > s);

  for (const rule of RULES) {
    if (genre && rule.skipInGenres?.includes(genre)) continue;

    // Rules carry the /g flag; reset so repeated calls are not stateful.
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let guard = 0;

    while ((match = rule.pattern.exec(text)) !== null && guard < 200) {
      guard += 1;
      if (match[0].length === 0) {
        rule.pattern.lastIndex += 1;
        continue;
      }

      // A rule that deliberately matches leading context (". But ") declares
      // which group to highlight; everything else highlights the whole match.
      // Deriving this from the first capture group instead produced spans like
      // "s of" for "depends of", which highlights the wrong words entirely.
      const anchored = rule.anchor !== undefined ? match[rule.anchor] : match[0];
      const offset = rule.anchor !== undefined ? match[0].indexOf(anchored) : 0;
      const start = match.index + Math.max(0, offset);
      const end = start + (anchored?.length ?? match[0].length);

      if (overlaps(start, end)) continue;

      const original = text.slice(start, end);
      const suggestion = rule.suggest(match);
      if (normaliseLoose(suggestion) === normaliseLoose(original)) continue;

      claimed.push([start, end]);
      found.push({
        span: [start, end],
        ruleId: rule.id,
        type: rule.type,
        original,
        suggestion,
        explanation: rule.explain,
        severity: rule.severity,
        level: rule.level,
      });
    }
    rule.pattern.lastIndex = 0;
  }

  return found.sort((a, b) => a.span[0] - b.span[0]);
}

function normaliseLoose(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// --- discourse & structure analysis ----------------------------------------

export interface StyleProfile {
  passiveRatio: number;
  hedgeCount: number;
  markerCategories: string[];
  markerCount: number;
  advancedStructures: string[];
  repeatedWords: { word: string; count: number }[];
  longestSentence: number;
  sentenceLengthVariance: number;
}

export function profileStyle(text: string): StyleProfile {
  const sents = sentences(text);
  const allWords = words(text);
  const lower = text.toLowerCase();

  PASSIVE_PATTERN.lastIndex = 0;
  const passiveHits = text.match(PASSIVE_PATTERN)?.length ?? 0;

  const hedgeCount = HEDGES.filter((h) => lower.includes(h)).length;

  const markerCategories: string[] = [];
  let markerCount = 0;
  for (const [category, markers] of Object.entries(DISCOURSE_MARKERS)) {
    const hits = markers.filter((m) => lower.includes(m)).length;
    if (hits > 0) {
      markerCategories.push(category);
      markerCount += hits;
    }
  }

  const advancedStructures = ADVANCED_STRUCTURES.filter((s) => {
    s.pattern.lastIndex = 0;
    const hits = text.match(s.pattern);
    // Nominalisation is only a signal when it is sustained.
    return s.id === "nominalisation" ? (hits?.length ?? 0) >= 3 : (hits?.length ?? 0) >= 1;
  }).map((s) => s.label);

  // Content-word repetition — the most common reason advanced writing feels flat.
  const counts = new Map<string, number>();
  for (const w of allWords) {
    if (w.length < 5) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const repeatedWords = [...counts.entries()]
    .filter(([, count]) => count >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  const lengths = sents.map((s) => words(s).length);
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length
    ? lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length
    : 0;

  return {
    passiveRatio: sents.length ? Math.min(1, passiveHits / sents.length) : 0,
    hedgeCount,
    markerCategories,
    markerCount,
    advancedStructures,
    repeatedWords,
    longestSentence: lengths.length ? Math.max(...lengths) : 0,
    sentenceLengthVariance: Math.round(variance * 10) / 10,
  };
}

// --- level estimation -------------------------------------------------------

/**
 * A crude but honest CEFR read from surface features. It is shown as an
 * *estimate* in the UI, never as a verdict — the placement test is the
 * instrument that actually places a learner.
 */
export function estimateLevel(text: string, errorCount: number): Cefr {
  const stats = analyse(text);
  const style = profileStyle(text);

  let score = 0;
  if (stats.avgSentenceLength >= 17) score += 1;
  if (stats.avgSentenceLength >= 24) score += 1;
  if (stats.typeTokenRatio >= 0.55) score += 1;
  if (stats.lexicalDensity >= 0.5) score += 1;
  if (style.advancedStructures.length >= 2) score += 1;
  if (style.advancedStructures.length >= 4) score += 1;
  if (style.markerCategories.length >= 3) score += 1;
  if (style.hedgeCount >= 3) score += 1;

  const errorRate = stats.wordCount ? errorCount / (stats.wordCount / 100) : 0;
  if (errorRate > 4) score -= 2;
  else if (errorRate > 2) score -= 1;

  if (score >= 6) return "C2";
  if (score >= 3) return "C1";
  return "B2";
}

export function turnMetrics(text: string, errorCount: number): TurnMetrics {
  const stats = analyse(text);
  return {
    wordCount: stats.wordCount,
    typeTokenRatio: stats.typeTokenRatio,
    avgSentenceLength: stats.avgSentenceLength,
    errorCount,
    estimatedLevel: estimateLevel(text, errorCount),
  };
}

// --- upgrade suggestions ----------------------------------------------------

/** Phrases a B2/C1 learner reaches for, and the C1/C2 alternatives. */
const UPGRADE_MAP: { from: RegExp; label: string; to: string; why: string }[] = [
  { from: /\bi think\b/i, label: "Hedged assertion", to: "I would contend", why: "Signals a considered position rather than a passing opinion." },
  { from: /\bvery important\b/i, label: "Precision", to: "of paramount importance", why: "Replaces an intensifier with a single weighted phrase." },
  { from: /\bbecause of this\b/i, label: "Cohesion", to: "on that account", why: "Varies your causal signposting." },
  { from: /\bbig problem\b/i, label: "Collocation", to: "a problem of some magnitude", why: "Reaches for a natural formal collocation." },
  { from: /\bmany people (?:think|believe|say)\b/i, label: "Attribution", to: "it is widely held", why: "Impersonal attribution is the academic default." },
  { from: /\bin the end\b/i, label: "Register", to: "ultimately", why: "A single adverb does the work of a phrase." },
  { from: /\bmore and more\b/i, label: "Range", to: "increasingly", why: "Avoids a repetitive intensifying pattern." },
  { from: /\bit is difficult to\b/i, label: "Nuance", to: "it is no straightforward matter to", why: "Adds the understatement typical of C2 academic prose." },
  { from: /\bshow(s)? that\b/i, label: "Evidential", to: "demonstrates that", why: "Stronger evidential verb for argumentation." },
  { from: /\bgood (?:example|reason)\b/i, label: "Precision", to: "compelling case", why: "Replaces the most general adjective in English." },
];

export function suggestUpgrades(text: string, limit = 3): Upgrade[] {
  const out: Upgrade[] = [];
  for (const entry of UPGRADE_MAP) {
    const match = entry.from.exec(text);
    if (!match) continue;
    out.push({
      label: entry.label,
      text: text.slice(0, match.index) + entry.to + text.slice(match.index + match[0].length),
      rationale: `“${match[0]}” → “${entry.to}”. ${entry.why}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// --- conversation -----------------------------------------------------------

const TUTOR_OPENERS = [
  "That is a reasonable position. Push it a little further for me:",
  "Good — you have stated the claim. Now the harder part:",
  "I follow your argument. Let me test it:",
  "Interesting framing. Consider the other side:",
];

const DEBATE_REBUTTALS = [
  "I take your point, but it rests on an assumption worth examining:",
  "That would follow only if the underlying premise held, and I doubt it does:",
  "Granted — and yet the evidence points the other way on one crucial detail:",
  "You have made the strongest version of that case. Here is why it still fails:",
];

const FOLLOW_UPS: Record<string, string[]> = {
  TUTOR: [
    "What evidence would change your mind?",
    "How would you phrase that for a sceptical specialist audience?",
    "Can you make the same point without using the word you leaned on there?",
  ],
  DEBATE: [
    "How do you answer the objection that the costs fall on people who never consented?",
    "Whose interests does your position quietly assume are secondary?",
    "If your proposal failed, what would the failure look like?",
  ],
  ROLEPLAY: [
    "How would you escalate this without damaging the relationship?",
    "Could you put that more diplomatically, but no less firmly?",
    "What would you concede in order to win the larger point?",
  ],
  INTERVIEW: [
    "Give me a concrete example with a measurable outcome.",
    "What would your last manager say was your weakest area?",
    "Why this role, specifically, rather than a comparable one?",
  ],
  EXAM_SPEAKING: [
    "Develop that with two supporting reasons and an example.",
    "Compare that with the situation in your own country.",
    "To what extent do you agree with the opposite view?",
  ],
};

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/**
 * A structured, on-topic reply built from the learner's own words.
 *
 * It does not pretend to be a language model: it acknowledges the learner's
 * point, raises a genuine counter-consideration drawn from the topic, and asks
 * a follow-up. Combined with real corrections and upgrades, this keeps the
 * conversation practice useful when no provider is configured.
 */
export function heuristicTurn(request: TutorRequest): TutorTurn {
  const corrections = findCorrections(request.message);
  const upgrades = suggestUpgrades(request.message);
  const metrics = turnMetrics(request.message, corrections.length);
  const seed = request.message.length + request.history.length;

  const openers = request.mode === "DEBATE" ? DEBATE_REBUTTALS : TUTOR_OPENERS;
  const followUps = FOLLOW_UPS[request.mode] ?? FOLLOW_UPS.TUTOR;
  const followUp = pick(followUps, seed);

  const stance =
    request.mode === "DEBATE" && request.aiStance
      ? ` I am arguing ${request.aiStance.toLowerCase()}, remember.`
      : "";

  const lengthNote =
    metrics.wordCount < 25
      ? " Try to give me at least three or four sentences — at this level, development matters as much as accuracy."
      : metrics.wordCount > 180
        ? " That was substantial; now try making the same case in half the words without losing anything."
        : "";

  const reply = [
    `${pick(openers, seed)} you are talking about ${request.topic.toLowerCase()}.${stance}`,
    lengthNote.trim(),
    followUp,
  ]
    .filter(Boolean)
    .join(" ");

  return { reply, corrections, upgrades, followUp, metrics, source: "rules" };
}

// --- writing report ---------------------------------------------------------

function band(value: number): number {
  return Math.max(0, Math.min(9, Math.round(value * 2) / 2));
}

/**
 * IELTS-aligned band estimates from measurable features.
 *
 * Each criterion starts from the band implied by the learner's target level and
 * is adjusted by evidence. The bands are explicitly labelled "indicative" in
 * the UI — no rules engine can judge task achievement properly, and pretending
 * otherwise would mislead someone paying for an exam.
 */
export function heuristicWriting(request: WritingRequest): WritingReport {
  const { text, cefr, genre, prompt } = request;
  const stats = analyse(text);
  const style = profileStyle(text);
  const annotations = findCorrections(text, genre);

  const baseline = cefr === "C2" ? 7.5 : cefr === "C1" ? 6.5 : 5.5;
  const errorRate = stats.wordCount ? annotations.length / (stats.wordCount / 100) : 0;

  // Task achievement: length adequacy plus topical overlap with the prompt.
  const promptTerms = words(prompt).filter((w) => w.length > 4);
  const textLower = text.toLowerCase();
  const overlap = promptTerms.length
    ? promptTerms.filter((t) => textLower.includes(t)).length / promptTerms.length
    : 0.5;
  const lengthFit = stats.wordCount >= 250 ? 1 : stats.wordCount >= 150 ? 0.75 : 0.45;

  const criteria: WritingCriteria = {
    taskAchievement: band(baseline + (overlap - 0.5) * 2 + (lengthFit - 0.75) * 2),
    coherenceCohesion: band(
      baseline +
        Math.min(1, style.markerCategories.length * 0.3) -
        (stats.longSentences > 2 ? 0.5 : 0) +
        (style.sentenceLengthVariance > 20 ? 0.3 : -0.2),
    ),
    lexicalResource: band(
      baseline +
        (stats.typeTokenRatio - 0.5) * 4 +
        (stats.lexicalDensity - 0.48) * 4 -
        style.repeatedWords.length * 0.2,
    ),
    grammaticalRange: band(
      baseline + style.advancedStructures.length * 0.35 - Math.min(2, errorRate * 0.5),
    ),
    registerStyle: band(
      baseline -
        annotations.filter((a) => a.type === "register").length * 0.4 +
        (style.hedgeCount >= 3 ? 0.4 : -0.3),
    ),
  };

  const values = Object.values(criteria);
  const overallBand = band(values.reduce((a, b) => a + b, 0) / values.length);

  const strengths: string[] = [];
  if (style.advancedStructures.length >= 2) {
    strengths.push(`Genuine grammatical range — you used ${style.advancedStructures.join(", ").toLowerCase()}.`);
  }
  if (stats.typeTokenRatio >= 0.55) {
    strengths.push(`Strong lexical variety (type-token ratio ${stats.typeTokenRatio}).`);
  }
  if (style.markerCategories.length >= 3) {
    strengths.push(`Cohesion is well signposted across ${style.markerCategories.length} distinct functions.`);
  }
  if (errorRate < 1 && stats.wordCount > 120) {
    strengths.push("Accuracy is high enough that errors no longer distract the reader.");
  }
  if (strengths.length === 0) {
    strengths.push("You produced a complete, on-topic response — the foundation everything else builds on.");
  }

  const priorities: string[] = [];
  if (errorRate >= 2) {
    priorities.push(`Accuracy: roughly ${errorRate.toFixed(1)} flagged issues per 100 words. Work through the annotations below.`);
  }
  if (style.repeatedWords.length) {
    priorities.push(
      `Vary your vocabulary — "${style.repeatedWords[0].word}" appears ${style.repeatedWords[0].count} times. Reach for a synonym with a different connotation, not just a different word.`,
    );
  }
  if (style.markerCategories.length < 3) {
    priorities.push("Widen your discourse markers: you are signposting addition and contrast but little concession or exemplification.");
  }
  if (style.advancedStructures.length < 2 && cefr !== "B2") {
    priorities.push("Reach for at least one marked structure — a cleft, an inversion, or a participle clause — to show range deliberately.");
  }
  if (style.passiveRatio > 0.5) {
    priorities.push(`The passive carries ${Math.round(style.passiveRatio * 100)}% of your clauses. Some is appropriate in academic prose; this much obscures agency.`);
  }
  if (stats.longSentences > 2) {
    priorities.push(`${stats.longSentences} sentences run past 35 words. Length is not complexity — break them and keep the subordination.`);
  }
  if (stats.wordCount < 150) {
    priorities.push(`At ${stats.wordCount} words this is under-developed for a ${genre.toLowerCase()}. Aim for 250+.`);
  }
  if (priorities.length === 0) {
    priorities.push("Nothing mechanical is holding this back — work on the persuasiveness of the argument itself.");
  }

  const summary =
    `A ${stats.wordCount}-word ${genre.toLowerCase()} reading at Flesch ${stats.fleschReadingEase} ` +
    `(grade ${stats.fleschKincaidGrade}). ${annotations.length} language ${annotations.length === 1 ? "point" : "points"} flagged. ` +
    `Indicative band ${overallBand.toFixed(1)} — strongest on ` +
    `${strongestCriterion(criteria)}, weakest on ${weakestCriterion(criteria)}.`;

  return {
    overallBand,
    criteria,
    annotations,
    strengths: strengths.slice(0, 4),
    priorities: priorities.slice(0, 4),
    summary,
    source: "rules",
  };
}

const CRITERION_LABEL: Record<keyof WritingCriteria, string> = {
  taskAchievement: "task achievement",
  coherenceCohesion: "coherence and cohesion",
  lexicalResource: "lexical resource",
  grammaticalRange: "grammatical range and accuracy",
  registerStyle: "register and style",
};

function strongestCriterion(criteria: WritingCriteria): string {
  const entries = Object.entries(criteria) as [keyof WritingCriteria, number][];
  return CRITERION_LABEL[entries.sort((a, b) => b[1] - a[1])[0][0]];
}

function weakestCriterion(criteria: WritingCriteria): string {
  const entries = Object.entries(criteria) as [keyof WritingCriteria, number][];
  return CRITERION_LABEL[entries.sort((a, b) => a[1] - b[1])[0][0]];
}
