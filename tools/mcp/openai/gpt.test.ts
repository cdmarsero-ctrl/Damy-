import { describe, expect, it } from "vitest";

import { ModelResponseError, buildRequest, buildReviewPrompt, isReasoningModel } from "./gpt";

const base = {
  system: "sys",
  user: "usr",
  model: "gpt-4o",
  temperature: 0.3,
  maxTokens: 100,
  timeoutMs: 1_000,
};

describe("isReasoningModel", () => {
  it("recognises the families that reject temperature", () => {
    for (const model of ["o1", "o1-mini", "o3", "o4-mini", "gpt-5", "GPT-5-mini", " o3 "]) {
      expect(isReasoningModel(model), model).toBe(true);
    }
  });

  it("leaves the standard chat models alone", () => {
    for (const model of ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-3.5-turbo", "omni-moderation"]) {
      expect(isReasoningModel(model), model).toBe(false);
    }
  });
});

describe("buildRequest", () => {
  it("sends temperature and max_tokens to a standard model", () => {
    const request = buildRequest(base);

    expect(request).toMatchObject({ model: "gpt-4o", temperature: 0.3, max_tokens: 100 });
    expect(request).not.toHaveProperty("max_completion_tokens");
  });

  it("swaps to max_completion_tokens and drops temperature for a reasoning model", () => {
    const request = buildRequest({ ...base, model: "gpt-5" });

    expect(request).toMatchObject({ model: "gpt-5", max_completion_tokens: 100 });
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("max_tokens");
  });

  it("puts the system message first", () => {
    expect(buildRequest(base).messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });
});

describe("buildReviewPrompt", () => {
  it("orders context, focus, then the fenced code", () => {
    const prompt = buildReviewPrompt({
      code: "const x = 1;",
      context: "A parser.",
      focus: "Off-by-one errors.",
      language: "ts",
    });

    expect(prompt.indexOf("A parser.")).toBeLessThan(prompt.indexOf("Off-by-one errors."));
    expect(prompt).toContain("```ts\nconst x = 1;\n```");
  });

  it("omits sections that were not supplied", () => {
    const prompt = buildReviewPrompt({ code: "x", focus: "   " });

    expect(prompt).not.toContain("Context:");
    expect(prompt).not.toContain("Review focus:");
    expect(prompt).toContain("```\nx\n```");
  });
});

describe("ModelResponseError", () => {
  it("is exported so the retry policy can single it out", () => {
    // Regression guard: an unusable-but-accepted response used to be a plain Error,
    // which `isRetryable` treats as transient — billing a second call for a request
    // that will fail the same way.
    expect(new ModelResponseError("x")).toBeInstanceOf(Error);
  });
});
