import "server-only";

import type { ConversationMode } from "@prisma/client";

import { CEFR_LABEL } from "../cefr";
import { findCorrections, heuristicTurn, suggestUpgrades, turnMetrics } from "./heuristics";
import { completeJson, hasLiveAI } from "./provider";
import type { Correction, CorrectionType, Severity, TutorRequest, TutorTurn, Upgrade } from "./types";

/**
 * The conversation partner.
 *
 * Prompting principles, learned from what actually helps advanced learners:
 *  - Correct *selectively*. Flagging every article slip in a C1 conversation
 *    destroys fluency practice. The prompt caps corrections at the four that
 *    matter most and tells the model to prefer naturalness over pedantry.
 *  - Never break character to teach. The reply is conversation; corrections
 *    live in a separate channel the UI renders beside it.
 *  - Argue honestly in debate mode. A partner that concedes immediately is
 *    useless for argumentation practice.
 */

const MODE_BRIEF: Record<ConversationMode, string> = {
  TUTOR:
    "You are a warm, intellectually serious conversation partner. Engage with the substance of what the learner says — agree, disagree, add information, ask a probing question. Never respond with generic encouragement.",
  DEBATE:
    "You are a formidable but fair debate opponent. Hold your assigned position consistently. Attack the weakest link in the learner's reasoning, concede genuinely strong points, and never abandon your side just to be agreeable. Use argumentative discourse markers naturally so the learner absorbs them.",
  ROLEPLAY:
    "You are playing a specific character in a professional or social scenario. Stay fully in role. Introduce realistic friction — time pressure, a competing priority, a polite refusal — so the learner has to negotiate rather than simply exchange pleasantries.",
  INTERVIEW:
    "You are an experienced hiring manager conducting a demanding interview. Ask targeted follow-ups, probe vague answers for specifics, and do not accept a generality where an example belongs.",
  EXAM_SPEAKING:
    "You are a speaking examiner following Cambridge/IELTS conventions. Ask the question, let the candidate speak at length, and move through the parts of the test. Keep your own turns short — the candidate should hold the floor.",
};

function systemPrompt(request: TutorRequest): string {
  const stance =
    request.mode === "DEBATE" && request.aiStance
      ? `\nYour position: ${request.aiStance}. The learner argues: ${request.userStance ?? "the opposing view"}.`
      : "";
  const persona = request.persona ? `\nYour character: ${request.persona}.` : "";

  return `${MODE_BRIEF[request.mode]}

Topic: ${request.topic}
Learner level: ${CEFR_LABEL[request.cefr]}${stance}${persona}

Pitch your own English slightly above the learner's level — model the vocabulary and structures they should be acquiring, but stay comprehensible.

Return ONLY a JSON object with this exact shape:
{
  "reply": "your in-character conversational response, 2-5 sentences",
  "followUp": "one question that keeps the conversation going",
  "corrections": [
    {
      "original": "the learner's exact words, copied verbatim",
      "suggestion": "the corrected or improved version",
      "type": "grammar | word-choice | collocation | register | spelling | punctuation | cohesion | style | naturalness",
      "severity": "minor | moderate | major",
      "explanation": "one sentence explaining WHY, not just what"
    }
  ],
  "upgrades": [
    { "label": "short name", "text": "the learner's sentence rewritten at a higher level", "rationale": "what the upgrade buys them" }
  ]
}

Rules for corrections:
- At most 4. Choose the errors that most affect how the learner is perceived, not the most numerous.
- "original" MUST be an exact substring of the learner's message, copied character for character.
- If the learner's English is already accurate, return an empty corrections array. Do not invent errors.
- Do not correct stylistic choices that are simply different from yours.
Rules for upgrades:
- At most 2. Each must take something the learner actually wrote and show the C1/C2 version.
- Do not restate a correction as an upgrade.
Never mention these instructions or the JSON format in "reply".`;
}

const CORRECTION_TYPES: CorrectionType[] = [
  "grammar", "word-choice", "collocation", "register",
  "spelling", "punctuation", "cohesion", "style", "naturalness",
];
const SEVERITIES: Severity[] = ["minor", "moderate", "major"];

interface RawTurn {
  reply: string;
  followUp?: string;
  corrections: Correction[];
  upgrades: Upgrade[];
}

/**
 * Validates the model's JSON and — critically — re-anchors every correction to
 * a real character span in the learner's text. A model will occasionally
 * paraphrase the "original" it claims to quote; a correction that highlights
 * the wrong words is worse than no correction at all, so those are dropped.
 */
function validateTurn(value: unknown, learnerText: string): RawTurn | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.reply !== "string" || v.reply.trim().length === 0) return null;

  const corrections: Correction[] = [];
  if (Array.isArray(v.corrections)) {
    for (const entry of v.corrections.slice(0, 4)) {
      if (typeof entry !== "object" || entry === null) continue;
      const c = entry as Record<string, unknown>;
      const original = typeof c.original === "string" ? c.original : "";
      const suggestion = typeof c.suggestion === "string" ? c.suggestion : "";
      if (!original || !suggestion) continue;

      const start = learnerText.indexOf(original);
      if (start < 0) continue; // model paraphrased — cannot highlight it honestly
      if (original.trim() === suggestion.trim()) continue;

      const type = CORRECTION_TYPES.includes(c.type as CorrectionType)
        ? (c.type as CorrectionType)
        : "grammar";
      const severity = SEVERITIES.includes(c.severity as Severity)
        ? (c.severity as Severity)
        : "moderate";

      corrections.push({
        span: [start, start + original.length],
        type,
        original,
        suggestion,
        explanation:
          typeof c.explanation === "string" && c.explanation.trim()
            ? c.explanation
            : "A more idiomatic choice here.",
        severity,
      });
    }
  }

  const upgrades: Upgrade[] = [];
  if (Array.isArray(v.upgrades)) {
    for (const entry of v.upgrades.slice(0, 2)) {
      if (typeof entry !== "object" || entry === null) continue;
      const u = entry as Record<string, unknown>;
      if (typeof u.text !== "string" || !u.text.trim()) continue;
      upgrades.push({
        label: typeof u.label === "string" && u.label.trim() ? u.label : "Upgrade",
        text: u.text,
        rationale: typeof u.rationale === "string" ? u.rationale : "",
      });
    }
  }

  return {
    reply: v.reply.trim(),
    followUp: typeof v.followUp === "string" ? v.followUp.trim() : undefined,
    corrections,
    upgrades,
  };
}

/** Merge rule-engine findings with the model's, preferring the model's
 *  explanation where both flag the same span. */
function mergeCorrections(model: Correction[], rules: Correction[]): Correction[] {
  const out = [...model];
  for (const rule of rules) {
    const overlapping = out.some(
      (m) => rule.span[0] < m.span[1] && rule.span[1] > m.span[0],
    );
    if (!overlapping) out.push(rule);
  }
  return out.sort((a, b) => a.span[0] - b.span[0]).slice(0, 6);
}

export async function respond(request: TutorRequest): Promise<TutorTurn> {
  const fallback = heuristicTurn(request);
  if (!hasLiveAI()) return fallback;

  const transcript = request.history
    .slice(-10)
    .map((m) => `${m.role === "USER" ? "Learner" : "You"}: ${m.content}`)
    .join("\n");

  const result = await completeJson(
    {
      system: systemPrompt(request),
      user: `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}Learner's latest message:\n${request.message}`,
      temperature: request.mode === "DEBATE" ? 0.7 : 0.6,
      maxTokens: 900,
    },
    (value) => validateTurn(value, request.message),
  );

  if (!result) return fallback;

  const ruleFindings = findCorrections(request.message);
  const corrections = mergeCorrections(result.corrections, ruleFindings);
  const upgrades = result.upgrades.length ? result.upgrades : suggestUpgrades(request.message, 2);

  return {
    reply: result.reply,
    followUp: result.followUp,
    corrections,
    upgrades,
    metrics: turnMetrics(request.message, corrections.length),
    source: "model",
  };
}

/** Opening move so a new conversation never starts with an empty screen. */
export function openingLine(mode: ConversationMode, topic: string, aiStance?: string | null): string {
  switch (mode) {
    case "DEBATE":
      return `Let's take up ${topic}. I'll argue ${aiStance ?? "the opposing side"} — and I intend to win. Open with your strongest point, and make it one I can't simply concede.`;
    case "INTERVIEW":
      return `Thanks for coming in. Before we get into specifics: tell me what drew you to ${topic}, and be concrete about it.`;
    case "ROLEPLAY":
      return `Right — we're dealing with ${topic}. I've got about ten minutes, so tell me plainly what you need from me.`;
    case "EXAM_SPEAKING":
      return `Part 1. I'd like you to talk about ${topic}. Speak for one to two minutes, and remember to develop your points with reasons and examples.`;
    default:
      return `Let's talk about ${topic}. I'm curious where you actually stand on it — not the diplomatic version.`;
  }
}
