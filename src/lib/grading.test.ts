import { describe, expect, it } from "vitest";

import { aggregateScore, grade } from "./grading";

describe("grading.MULTIPLE_CHOICE", () => {
  it("marks the key correct", () => {
    const result = grade("MULTIPLE_CHOICE", { answerIndex: 2 }, { answerIndex: 2 });
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it("marks anything else wrong", () => {
    expect(grade("MULTIPLE_CHOICE", { answerIndex: 2 }, { answerIndex: 0 }).score).toBe(0);
  });

  it("treats a missing answer as wrong rather than throwing", () => {
    expect(grade("MULTIPLE_CHOICE", { answerIndex: 2 }, {}).correct).toBe(false);
  });
});

describe("grading.MULTI_SELECT", () => {
  const solution = { answerIndexes: [0, 2, 4] };

  it("awards full credit for the exact set", () => {
    expect(grade("MULTI_SELECT", solution, { answerIndexes: [0, 2, 4] }).score).toBe(1);
  });

  it("awards partial credit for a subset", () => {
    const result = grade("MULTI_SELECT", solution, { answerIndexes: [0, 2] });
    expect(result.score).toBeCloseTo(2 / 3, 2);
    expect(result.correct).toBe(false);
  });

  // Without this penalty, "select everything" would score full marks.
  it("penalises over-selection", () => {
    const result = grade("MULTI_SELECT", solution, { answerIndexes: [0, 1, 2, 3, 4, 5] });
    expect(result.score).toBeLessThan(0.5);
  });

  it("floors at zero rather than going negative", () => {
    expect(grade("MULTI_SELECT", solution, { answerIndexes: [1, 3, 5, 6, 7] }).score).toBe(0);
  });
});

describe("grading.GAP_FILL", () => {
  const solution = { answers: [["suggest", "indicate"], ["establish", "prove"]] };

  it("accepts any listed variant", () => {
    expect(grade("GAP_FILL", solution, { answers: ["indicate", "prove"] }).correct).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(grade("GAP_FILL", solution, { answers: ["  SUGGEST ", "Establish"] }).correct).toBe(true);
  });

  it("gives partial credit per gap", () => {
    expect(grade("GAP_FILL", solution, { answers: ["suggest", "wrong"] }).score).toBe(0.5);
  });

  // A learner who knows the word but mistypes it has a spelling problem, not a
  // knowledge problem, and should not be marked as if they did not know it.
  it("accepts a near-miss as a spelling issue rather than a wrong answer", () => {
    const result = grade("GAP_FILL", solution, { answers: ["sugest", "establish"] });
    expect(result.correct).toBe(true);
    expect(result.issues.some((i) => i.type === "spelling")).toBe(true);
  });

  it("does not accept a genuinely different word as a typo", () => {
    expect(grade("GAP_FILL", solution, { answers: ["contradict", "establish"] }).score).toBe(0.5);
  });

  it("reports an empty gap as missing", () => {
    const result = grade("GAP_FILL", solution, { answers: ["", "establish"] });
    expect(result.issues.some((i) => i.type === "missing")).toBe(true);
  });
});

describe("grading.TRANSFORMATION", () => {
  const solution = {
    answers: ["wish I had told", "wish I'd told"],
    mustInclude: ["wish"],
  };

  it("accepts an exact transformation", () => {
    expect(grade("TRANSFORMATION", solution, { text: "wish I had told" }).correct).toBe(true);
  });

  it("rejects an answer missing the required key word", () => {
    const result = grade("TRANSFORMATION", solution, { text: "regret not telling" });
    expect(result.correct).toBe(false);
    expect(result.issues.some((i) => i.type === "missing")).toBe(true);
  });

  it("rejects a wrong structure even when the key word is present", () => {
    expect(grade("TRANSFORMATION", solution, { text: "wish I told" }).correct).toBe(false);
  });
});

describe("grading.DRAG_ORDER", () => {
  const solution = { order: ["a", "b", "c", "d"] };

  it("awards full marks for the exact sequence", () => {
    expect(grade("DRAG_ORDER", solution, { order: ["a", "b", "c", "d"] }).score).toBe(1);
  });

  it("gives credit for the positions that are right", () => {
    const result = grade("DRAG_ORDER", solution, { order: ["a", "b", "d", "c"] });
    expect(result.score).toBe(0.5);
    expect(result.issues).toHaveLength(2);
  });
});

describe("grading.MATCHING", () => {
  const solution = { pairs: { a: "one", b: "two", c: "three" } };

  it("scores each pair independently", () => {
    const result = grade("MATCHING", solution, { pairs: { a: "one", b: "three", c: "three" } });
    expect(result.score).toBeCloseTo(2 / 3, 2);
  });

  it("counts an unmatched item as wrong", () => {
    expect(grade("MATCHING", solution, { pairs: { a: "one" } }).score).toBeCloseTo(1 / 3, 2);
  });
});

describe("grading.ERROR_CORRECTION", () => {
  const solution = {
    corrections: [
      { accepted: ["I agree with you"], hint: "‘Agree’ is a verb." },
      { accepted: ["it depends on the context"] },
    ],
  };

  it("accepts the corrected line", () => {
    const result = grade("ERROR_CORRECTION", solution, {
      answers: ["I agree with you", "it depends on the context"],
    });
    expect(result.correct).toBe(true);
  });

  it("surfaces the authored hint on a wrong answer", () => {
    const result = grade("ERROR_CORRECTION", solution, {
      answers: ["I am agree with you", "it depends on the context"],
    });
    expect(result.issues[0].message).toContain("verb");
  });
});

describe("grading.DICTATION", () => {
  const solution = { text: "I would have thought she would have told us by now" };

  it("awards full marks for a perfect transcription", () => {
    expect(grade("DICTATION", solution, { text: solution.text }).correct).toBe(true);
  });

  it("scores partial coverage proportionally", () => {
    const result = grade("DICTATION", solution, { text: "I would have thought she told us" });
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThan(1);
  });

  it("names the words that were missed", () => {
    const result = grade("DICTATION", solution, { text: "I thought she told us by now" });
    expect(result.issues.some((i) => i.type === "missing")).toBe(true);
  });

  it("ignores punctuation and case differences", () => {
    const result = grade("DICTATION", solution, {
      text: "I WOULD HAVE THOUGHT, SHE WOULD HAVE TOLD US BY NOW!",
    });
    expect(result.score).toBe(1);
  });
});

describe("grading.REGISTER_SHIFT", () => {
  const solution = {
    mustInclude: ["evidence", "may"],
    mustAvoid: ["everyone knows", "obviously"],
  };

  it("rewards hitting the target register markers", () => {
    const result = grade("REGISTER_SHIFT", solution, {
      text: "The evidence suggests this may be the case.",
    });
    expect(result.score).toBe(1);
  });

  it("penalises informal markers that should have been removed", () => {
    const result = grade("REGISTER_SHIFT", solution, {
      text: "Everyone knows the evidence may show this.",
    });
    expect(result.score).toBeLessThan(1);
    expect(result.issues.some((i) => i.type === "register")).toBe(true);
  });

  // Marker-matching is a floor, not a judgement of style.
  it("always requests a qualitative review", () => {
    expect(
      grade("REGISTER_SHIFT", solution, { text: "The evidence may show this." })
        .needsQualitativeReview,
    ).toBe(true);
  });
});

describe("grading.NOTE_TAKING", () => {
  const solution = {
    keyPoints: [
      "staffing 8% over budget due to agency cover",
      "software renewal cheaper than forecast",
      "no capital spend this quarter",
    ],
  };

  it("credits paraphrased key points, not just verbatim ones", () => {
    const result = grade("NOTE_TAKING", solution, {
      text: "staffing over budget because of agency cover; software renewal cheaper; no capital spend",
    });
    expect(result.score).toBeGreaterThanOrEqual(0.66);
  });

  it("reports which points were not captured", () => {
    const result = grade("NOTE_TAKING", solution, { text: "staffing over budget agency cover" });
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("grading.OPEN_WRITING", () => {
  it("requires the minimum length before it counts as submitted", () => {
    const short = grade("OPEN_WRITING", { minWords: 50 }, { text: "Too short." });
    expect(short.correct).toBe(false);
    expect(short.issues[0].type).toBe("length");
  });

  it("passes the effort floor once long enough", () => {
    const text = Array.from({ length: 60 }, () => "word").join(" ");
    const result = grade("OPEN_WRITING", { minWords: 50 }, { text });
    expect(result.correct).toBe(true);
    expect(result.needsQualitativeReview).toBe(true);
  });
});

describe("grading.aggregateScore", () => {
  it("weights by point value rather than treating exercises equally", () => {
    const score = aggregateScore([
      { score: 1, points: 30 },
      { score: 0, points: 10 },
    ]);
    expect(score).toBe(0.75);
  });

  it("returns zero when nothing is worth any points", () => {
    expect(aggregateScore([])).toBe(0);
    expect(aggregateScore([{ score: 1, points: 0 }])).toBe(0);
  });
});
