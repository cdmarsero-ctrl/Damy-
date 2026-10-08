/**
 * Wire contract between the browser and the interpreter agent.
 *
 * Mirrored in agents/interpreter/protocol.py — the two files must change
 * together. Kept as plain constants and JSON shapes (no codegen) because the
 * surface is tiny and both sides are covered by unit tests.
 */

/** Data-channel topic for control messages; other topics are ignored. */
export const CONTROL_TOPIC = "interpreter.control";

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
