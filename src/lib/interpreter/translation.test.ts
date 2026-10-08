import { describe, expect, it } from "vitest";

import {
  TRANSLATION_LANGUAGE_CODES,
  TRANSLATION_TOPIC,
  type TranslationMessage,
  decodeTranslation,
} from "./protocol";
import { applyTranslation, EMPTY_TRANSLATION, MAX_SENTENCES, type TranslationState } from "./translation";

const bytes = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
const tr = (sentence: number, committed: string, tentative = "", final = false, extra: Partial<TranslationMessage> = {}) =>
  ({ type: "translation", sentence, committed, tentative, final, ...extra }) as TranslationMessage;
const run = (...messages: TranslationMessage[]): TranslationState => messages.reduce(applyTranslation, EMPTY_TRANSLATION);

describe("decodeTranslation", () => {
  it("accepts well-formed messages and keeps finite timings only", () => {
    expect(decodeTranslation(bytes(tr(2, "Ayer", "el equipo", false, { mtMs: 210.5 })))).toEqual(
      tr(2, "Ayer", "el equipo", false, { mtMs: 210.5 }),
    );
    expect(decodeTranslation(bytes({ ...tr(0, "Hola.", "", true), flushMs: "slow" }))).toEqual(tr(0, "Hola.", "", true));
  });

  it("rejects malformed payloads", () => {
    for (const bad of [
      "nope",
      "null",
      { type: "caption", sentence: 0, committed: "", tentative: "", final: false },
      { type: "translation", sentence: -1, committed: "", tentative: "", final: false },
      { type: "translation", sentence: 0, committed: 1, tentative: "", final: false },
      { type: "translation", sentence: 0, committed: "", tentative: "" },
    ]) {
      expect(decodeTranslation(bytes(bad))).toBeNull();
    }
  });

  it("matches the agent's topic and language list", () => {
    // agents/interpreter/tests/test_protocol.py checks the same values.
    expect(TRANSLATION_TOPIC).toBe("interpreter.translation");
    expect(TRANSLATION_LANGUAGE_CODES).toEqual([
      "en", "es", "fr", "de", "it", "pt", "nl", "ja", "ko", "zh",
      "ru", "hi", "ar", "tr", "pl", "sv", "uk", "vi", "id",
    ]);
  });
});

describe("translation state", () => {
  it("grows committed text and replaces the tentative tail", () => {
    const state = run(tr(0, "", "Ayer"), tr(0, "Ayer", "el equipo"), tr(0, "Ayer el equipo", "de ventas"));
    expect(state.sentences).toEqual([{ id: 0, committed: "Ayer el equipo", tentative: "de ventas", final: false }]);
    expect(state.retractions).toBe(0);
  });

  it("freezes a sentence once final", () => {
    const state = run(tr(0, "Hola", "a todos"), tr(0, "Hola a todos.", "ignored", true), tr(0, "Hola otra vez", "x"));
    expect(state.sentences).toEqual([{ id: 0, committed: "Hola a todos.", tentative: "", final: true }]);
  });

  it("counts a retraction when committed text stops extending", () => {
    const state = run(tr(0, "El banco del río"), tr(0, "El banco cerró"));
    expect(state.retractions).toBe(1);
    expect(state.sentences[0].committed).toBe("El banco cerró"); // shown as received
  });

  it("collects flush and request timings", () => {
    const state = run(tr(0, "Hola", "", false, { mtMs: 200 }), tr(0, "Hola.", "", true, { mtMs: 180, flushMs: 420 }));
    expect(state.mtLatencies).toEqual([200, 180]);
    expect(state.flushLatencies).toEqual([420]);
  });

  it("orders sentences and keeps a bounded history", () => {
    expect(run(tr(1, "dos"), tr(0, "uno")).sentences.map((s) => s.id)).toEqual([0, 1]);
    let state = EMPTY_TRANSLATION;
    for (let i = 0; i < MAX_SENTENCES + 5; i++) state = applyTranslation(state, tr(i, `s${i}`, "", true));
    expect(state.sentences).toHaveLength(MAX_SENTENCES);
    expect(state.sentences[0].id).toBe(5);
  });
});
