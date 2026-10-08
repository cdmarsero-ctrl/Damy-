import { describe, expect, it } from "vitest";

import { applyCaption, captionLines, type CaptionState, EMPTY_CAPTIONS, MAX_SEGMENTS } from "./captions";
import { CAPTION_LANGUAGE_CODES, type CaptionMessage, decodeCaption } from "./protocol";

const bytes = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
const cap = (segment: number, text: string, final = false, extra: Partial<CaptionMessage> = {}) =>
  ({ type: "caption", segment, text, final, ...extra }) as CaptionMessage;
const run = (...messages: CaptionMessage[]): CaptionState => messages.reduce(applyCaption, EMPTY_CAPTIONS);

describe("decodeCaption", () => {
  it("accepts captions and utterance ends", () => {
    expect(decodeCaption(bytes({ type: "caption", segment: 3, text: "hi", final: false, latencyMs: 182.4 }))).toEqual(
      { type: "caption", segment: 3, text: "hi", final: false, latencyMs: 182.4 },
    );
    expect(decodeCaption(bytes({ type: "caption", segment: 0, text: "Hi.", final: true, utteranceEnd: true }))).toEqual(
      { type: "caption", segment: 0, text: "Hi.", final: true, utteranceEnd: true },
    );
    expect(decodeCaption(bytes({ type: "utterance-end" }))).toEqual({ type: "utterance-end" });
  });

  it("rejects malformed payloads and drops bad optional fields", () => {
    for (const bad of [
      "not json",
      "null",
      { type: "caption", segment: -1, text: "x", final: true },
      { type: "caption", segment: 1.5, text: "x", final: true },
      { type: "caption", segment: 1, text: 3, final: true },
      { type: "caption", segment: 1, text: "x" },
      { type: "shout" },
    ]) {
      expect(decodeCaption(bytes(bad))).toBeNull();
    }
    expect(decodeCaption(bytes({ type: "caption", segment: 1, text: "x", final: false, latencyMs: "fast" }))).toEqual({
      type: "caption",
      segment: 1,
      text: "x",
      final: false,
    });
  });

  it("offers the languages the agent accepts", () => {
    // agents/interpreter/tests/test_protocol.py checks the same list.
    expect(CAPTION_LANGUAGE_CODES).toEqual(["multi", "en", "es", "fr", "de", "it", "pt", "nl", "ja", "ru", "hi"]);
  });
});

describe("caption state", () => {
  it("replaces interims in place and freezes finals", () => {
    const state = run(cap(0, "hel"), cap(0, "hello wor"), cap(0, "Hello world.", true), cap(0, "late interim"));
    expect(state.segments).toEqual([{ id: 0, text: "Hello world.", final: true, endsUtterance: false }]);
  });

  it("groups segments into lines at utterance ends", () => {
    const state = run(
      cap(0, "Good morning,", true),
      cap(1, "everyone.", true, { utteranceEnd: true }),
      cap(2, "Today we", true),
      cap(3, "will look"),
    );
    expect(captionLines(state)).toEqual([
      { committed: "Good morning, everyone.", pending: "" },
      { committed: "Today we", pending: "will look" },
    ]);
  });

  it("marks the last final on a separate utterance-end message", () => {
    const state = run(cap(0, "Yes.", true), cap(1, "and"), { type: "utterance-end" });
    expect(state.segments.map((s) => s.endsUtterance)).toEqual([true, false]);
    expect(captionLines(state)).toEqual([
      { committed: "Yes.", pending: "" },
      { committed: "", pending: "and" },
    ]);
  });

  it("removes a segment the recogniser withdraws with an empty final", () => {
    const state = run(cap(0, "Hi.", true), cap(1, "uhm"), cap(1, "", true));
    expect(state.segments.map((s) => s.id)).toEqual([0]);
  });

  it("orders a segment that arrives without interims", () => {
    const state = run(cap(2, "two"), cap(1, "one", true));
    expect(state.segments.map((s) => s.id)).toEqual([1, 2]);
  });

  it("keeps a bounded history and latency window", () => {
    let state = EMPTY_CAPTIONS;
    for (let i = 0; i < MAX_SEGMENTS + 20; i++) state = applyCaption(state, cap(i, `w${i}`, true, { latencyMs: i }));
    expect(state.segments).toHaveLength(MAX_SEGMENTS);
    expect(state.segments[0].id).toBe(20);
    expect(state.latencies.at(-1)).toBe(MAX_SEGMENTS + 19);
  });

  it("collects agent-measured latency from interims and finals", () => {
    const state = run(cap(0, "a", false, { latencyMs: 150 }), cap(0, "a b", true, { latencyMs: 250 }), cap(1, "c"));
    expect(state.latencies).toEqual([150, 250]);
  });
});
