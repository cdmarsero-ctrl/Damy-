/**
 * Wire contract between the browser and the interpreter agent.
 *
 * Mirrored in agents/interpreter/protocol.py — the two files must change
 * together. Kept as plain constants and JSON shapes (no codegen) because the
 * surface is tiny and both sides are covered by unit tests.
 */

/** Data-channel topic for control messages; other topics are ignored. */
export const CONTROL_TOPIC = "interpreter.control";

/** Agent → client caption stream. */
export const CAPTIONS_TOPIC = "interpreter.captions";

/**
 * Source languages offered for captions (Deepgram Nova-3). "multi" is its
 * code-switching mode across the same ten languages. The agent re-validates
 * the choice; tests on both sides keep the two lists identical.
 */
export const CAPTION_LANGUAGES = [
  { code: "multi", label: "Auto-detect (10 languages)" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ja", label: "Japanese" },
  { code: "ru", label: "Russian" },
  { code: "hi", label: "Hindi" },
] as const;

export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number]["code"];
export const CAPTION_LANGUAGE_CODES = CAPTION_LANGUAGES.map((l) => l.code) as [
  CaptionLanguage,
  ...CaptionLanguage[],
];

/** Agent → client translation stream. */
export const TRANSLATION_TOPIC = "interpreter.translation";

/** Agent → client voice metrics, one message per spoken sentence. */
export const VOICE_TOPIC = "interpreter.voice";

/** Agent → client echo-check results (Phase 5). */
export const ECHO_TOPIC = "interpreter.echo";

/**
 * Languages to translate into. Mirrors LANGUAGE_NAMES in
 * agents/interpreter/protocol.py (tests on both sides keep them identical).
 */
export const TRANSLATION_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ru", label: "Russian" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" },
  { code: "id", label: "Indonesian" },
] as const;

export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number]["code"];
export const TRANSLATION_LANGUAGE_CODES = TRANSLATION_LANGUAGES.map((l) => l.code) as [
  TranslationLanguage,
  ...TranslationLanguage[],
];

/** Agent participant attributes: current state, not events. */
export const AGENT_ATTR = {
  captions: "captions",
  captionsDetail: "captions.detail",
  translation: "translation",
  translationDetail: "translation.detail",
  voice: "voice",
  voiceDetail: "voice.detail",
  echo: "echo",
  echoDetail: "echo.detail",
} as const;

/** Shared by captions and translation. */
export type CaptionsStatus = "starting" | "live" | "unavailable" | "error";

/**
 * The agent's echo guard. "leaking": it keeps removing the agent's own voice
 * from the learner's microphone, i.e. echo cancellation isn't coping.
 */
export type EchoStatus = "off" | "clean" | "leaking";
export const ECHO_STATUSES: readonly EchoStatus[] = ["off", "clean", "leaking"];

/** Track names. The agent republishes each client track it hears as `echo-<name>`. */
export const TRACK = {
  /** The learner's microphone, after browser AEC/NS/AGC. */
  mic: "mic",
  /** A synthetic tone-burst track used to time the audio round trip. Never played. */
  probe: "probe",
  /** Agent → client: the learner's own voice, delayed by the round trip. */
  echoMic: "echo-mic",
  /** Agent → client: the probe, returned for timing. */
  echoProbe: "echo-probe",
  /** Agent → client: a test tone played through the speaker to check AEC. */
  tone: "tone",
  /** Agent → client: the translation, spoken (Phase 4). */
  voice: "voice",
} as const;

export type ControlMessage =
  | { type: "ping"; id: number; sentAt: number }
  | { type: "pong"; id: number; sentAt: number }
  | { type: "tone"; durationMs: number }
  | { type: "tone-started"; durationMs: number }
  | { type: "echo-check" }
  /** Agent → client: the session is about to end, and why ("time-limit"). */
  | { type: "ending"; reason: string };

export function encodeControl(message: ControlMessage): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(message));
}

/** Returns null for anything malformed rather than throwing: the data channel
 *  is a trust boundary, and one bad packet must not tear the session down. */
export function decodeControl(payload: Uint8Array): ControlMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  switch (m.type) {
    case "ping":
    case "pong":
      return finite(m.id) && finite(m.sentAt) ? { type: m.type, id: m.id, sentAt: m.sentAt } : null;
    case "tone":
    case "tone-started":
      return finite(m.durationMs) && m.durationMs > 0
        ? { type: m.type, durationMs: m.durationMs }
        : null;
    case "echo-check":
      return { type: "echo-check" };
    case "ending":
      return typeof m.reason === "string" ? { type: "ending", reason: m.reason } : null;
    default:
      return null;
  }
}

/**
 * Caption stream messages. Mirrors agents/interpreter/captions.py: interims
 * replace each other within a segment, a final freezes it, and the next
 * segment starts. `utteranceEnd` (or a separate utterance-end message) marks
 * a sentence boundary. `latencyMs` is measured on the agent, from the audio
 * arriving there to the caption being sent.
 */
export type CaptionMessage =
  | {
      type: "caption";
      segment: number;
      text: string;
      final: boolean;
      latencyMs?: number;
      utteranceEnd?: boolean;
    }
  | { type: "utterance-end" };

export function decodeCaption(payload: Uint8Array): CaptionMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (m.type === "utterance-end") return { type: "utterance-end" };
  if (m.type !== "caption") return null;
  if (!Number.isInteger(m.segment) || (m.segment as number) < 0) return null;
  if (typeof m.text !== "string" || typeof m.final !== "boolean") return null;
  const latency = typeof m.latencyMs === "number" && Number.isFinite(m.latencyMs) ? m.latencyMs : undefined;
  return {
    type: "caption",
    segment: m.segment as number,
    text: m.text,
    final: m.final,
    ...(latency !== undefined ? { latencyMs: latency } : {}),
    ...(m.utteranceEnd === true ? { utteranceEnd: true } : {}),
  };
}

/**
 * Translation stream messages. Mirrors agents/interpreter/translation.py.
 * `committed` is the full committed text for the sentence so far and only
 * ever grows; `tentative` is the translator's current guess beyond it.
 * `flushMs` (on the final message) runs from the end of speech, as
 * captioned, to the complete translation; `mtMs` is the request that
 * produced this update.
 */
export interface TranslationMessage {
  type: "translation";
  sentence: number;
  committed: string;
  tentative: string;
  final: boolean;
  mtMs?: number;
  flushMs?: number;
}

export function decodeTranslation(payload: Uint8Array): TranslationMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (m.type !== "translation") return null;
  if (!Number.isInteger(m.sentence) || (m.sentence as number) < 0) return null;
  if (typeof m.committed !== "string" || typeof m.tentative !== "string" || typeof m.final !== "boolean") {
    return null;
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const mtMs = num(m.mtMs);
  const flushMs = num(m.flushMs);
  return {
    type: "translation",
    sentence: m.sentence as number,
    committed: m.committed,
    tentative: m.tentative,
    final: m.final,
    ...(mtMs !== undefined ? { mtMs } : {}),
    ...(flushMs !== undefined ? { flushMs } : {}),
  };
}

/**
 * Sent when a sentence's translated speech starts playing. `lagMs` runs from
 * the sentence's source speech reaching the agent to its first translated
 * audio leaving it: the agent-side ear-to-voice lag. `backlogMs` is audio
 * still queued behind it.
 */
export interface VoiceMessage {
  type: "voice";
  sentence: number;
  lagMs?: number;
  backlogMs?: number;
}

export function decodeVoice(payload: Uint8Array): VoiceMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (m.type !== "voice" || !Number.isInteger(m.sentence) || (m.sentence as number) < 0) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const lagMs = num(m.lagMs);
  const backlogMs = num(m.backlogMs);
  return {
    type: "voice",
    sentence: m.sentence as number,
    ...(lagMs !== undefined ? { lagMs } : {}),
    ...(backlogMs !== undefined ? { backlogMs } : {}),
  };
}

/**
 * Result of an echo check: the agent spoke a fixed phrase of `spokenWords`
 * words; `heardWords` of them came back through the microphone (what echo
 * cancellation let through) and `passedWords` also got past the agent's echo
 * guard into captions. `error` instead when the check couldn't run.
 */
export type EchoReport =
  | { type: "echo-report"; spokenWords: number; heardWords: number; passedWords: number }
  | { type: "echo-report"; error: string };

export function decodeEchoReport(payload: Uint8Array): EchoReport | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (m.type !== "echo-report") return null;
  if (typeof m.error === "string") return { type: "echo-report", error: m.error };
  const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
  if (!count(m.spokenWords) || !count(m.heardWords) || !count(m.passedWords)) return null;
  return { type: "echo-report", spokenWords: m.spokenWords, heardWords: m.heardWords, passedWords: m.passedWords };
}
