import type { TranslationMessage } from "./protocol";

/**
 * Client-side translation state: a pure reducer over the agent's translation
 * stream. It also *checks* the agent's central promise, that committed text is
 * append-only, by counting retractions; the page shows the count so a
 * regression is visible, not just tested.
 */

/** Phase 3: end of speech to full translation, p50 (design doc §0, SVO pairs). */
export const FLUSH_TARGET_MS = 1200;

export const MAX_SENTENCES = 40;
const LATENCY_WINDOW = 100;

export interface TranslatedSentence {
  id: number;
  committed: string;
  tentative: string;
  final: boolean;
}

export interface TranslationState {
  sentences: TranslatedSentence[];
  /** Times committed text was replaced by text that doesn't extend it. Should stay 0. */
  retractions: number;
  flushLatencies: number[];
  mtLatencies: number[];
}

export const EMPTY_TRANSLATION: TranslationState = {
  sentences: [],
  retractions: 0,
  flushLatencies: [],
  mtLatencies: [],
};

const push = (values: number[], value: number | undefined) =>
  value === undefined ? values : [...values, value].slice(-LATENCY_WINDOW);

export function applyTranslation(state: TranslationState, message: TranslationMessage): TranslationState {
  const flushLatencies = push(state.flushLatencies, message.flushMs);
  const mtLatencies = push(state.mtLatencies, message.mtMs);
  const index = state.sentences.findIndex((s) => s.id === message.sentence);
  const existing = index >= 0 ? state.sentences[index] : null;

  // A finished sentence is immutable; a late or duplicate update is ignored.
  if (existing?.final) return { ...state, flushLatencies, mtLatencies };

  const retracted = existing !== null && !message.committed.startsWith(existing.committed);
  const next: TranslatedSentence = {
    id: message.sentence,
    committed: message.committed,
    tentative: message.final ? "" : message.tentative,
    final: message.final,
  };
  const sentences =
    index >= 0
      ? state.sentences.map((s, i) => (i === index ? next : s))
      : [...state.sentences, next].sort((a, b) => a.id - b.id);

  return {
    sentences: sentences.slice(-MAX_SENTENCES),
    retractions: state.retractions + (retracted ? 1 : 0),
    flushLatencies,
    mtLatencies,
  };
}
