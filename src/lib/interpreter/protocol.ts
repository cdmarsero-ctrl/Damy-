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

/** Agent participant attributes: current state, not events. */
export const AGENT_ATTR = {
  captions: "captions",
  captionsDetail: "captions.detail",
} as const;

export type CaptionsStatus = "starting" | "live" | "unavailable" | "error";

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
} as const;

export type ControlMessage =
  | { type: "ping"; id: number; sentAt: number }
  | { type: "pong"; id: number; sentAt: number }
  | { type: "tone"; durationMs: number }
  | { type: "tone-started"; durationMs: number };

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
