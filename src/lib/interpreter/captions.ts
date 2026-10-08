import type { CaptionMessage } from "./protocol";

/**
 * Client-side caption state: a pure reducer over the agent's caption stream,
 * so the rendering rules (interims replace, finals freeze, utterances break
 * lines) are unit-tested rather than living in a component.
 */

/** Phase 2 exit criterion: captions within this of speech, p50 (agent-measured). */
export const CAPTION_TARGET_MS = 300;

/** Enough history for a few minutes of speech; older lines scroll away. */
export const MAX_SEGMENTS = 80;
const LATENCY_WINDOW = 100;

export interface CaptionSegment {
  id: number;
  text: string;
  final: boolean;
  /** Last segment of a sentence/utterance: the line breaks after it. */
  endsUtterance: boolean;
}

export interface CaptionState {
  segments: CaptionSegment[];
  latencies: number[];
}

export const EMPTY_CAPTIONS: CaptionState = { segments: [], latencies: [] };

export function applyCaption(state: CaptionState, message: CaptionMessage): CaptionState {
  if (message.type === "utterance-end") {
    const segments = [...state.segments];
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].final) {
        segments[i] = { ...segments[i], endsUtterance: true };
        break;
      }
    }
    return { ...state, segments };
  }

  const latencies =
    message.latencyMs !== undefined
      ? [...state.latencies, message.latencyMs].slice(-LATENCY_WINDOW)
      : state.latencies;

  const index = state.segments.findIndex((s) => s.id === message.segment);
  const existing = index >= 0 ? state.segments[index] : null;
  // Finals are immutable; a late or duplicated message must not reopen one.
  if (existing?.final) return { ...state, latencies };

  let segments: CaptionSegment[];
  if (message.final && message.text === "") {
    // The recogniser withdrew what it showed (noise, or a dropped stream).
    segments = state.segments.filter((s) => s.id !== message.segment);
  } else {
    const next: CaptionSegment = {
      id: message.segment,
      text: message.text,
      final: message.final,
      endsUtterance: message.final && message.utteranceEnd === true,
    };
    segments =
      index >= 0
        ? state.segments.map((s, i) => (i === index ? next : s))
        : [...state.segments, next].sort((a, b) => a.id - b.id);
  }
  return { segments: segments.slice(-MAX_SEGMENTS), latencies };
}

export interface CaptionLine {
  /** Frozen text: what the recogniser has committed to. */
  committed: string;
  /** Interim tail, still being revised. Shown differently. */
  pending: string;
}

/** Groups segments into one line per utterance. */
export function captionLines(state: CaptionState): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: CaptionLine = { committed: "", pending: "" };
  const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

  for (const segment of state.segments) {
    if (segment.final) current.committed = join(current.committed, segment.text);
    else current.pending = join(current.pending, segment.text);
    if (segment.endsUtterance) {
      lines.push(current);
      current = { committed: "", pending: "" };
    }
  }
  if (current.committed || current.pending) lines.push(current);
  return lines;
}
