import { describe, expect, it } from "vitest";

import { estimateLevel, findCorrections, heuristicWriting, profileStyle, suggestUpgrades } from "./heuristics";

/** Convenience: does the engine flag a given rule in this text? */
function flags(text: string, needle: string, genre?: string): boolean {
  return findCorrections(text, genre).some(
    (c) => c.original.toLowerCase().includes(needle.toLowerCase()),
  );
}

describe("heuristics.findCorrections — real advanced-learner errors", () => {
  it("catches calqued prepositions", () => {
    expect(flags("The result depends of the sample size.", "depends of")).toBe(true);
    expect(flags("We discussed about the proposal.", "discussed about")).toBe(true);
    expect(flags("Please explain me the difference.", "explain me")).toBe(true);
  });

  it("catches ‘I am agree’", () => {
    const corrections = findCorrections("I am agree with your conclusion.");
    expect(corrections.some((c) => c.suggestion === "agree")).toBe(true);
  });

  it("catches pluralised uncountables", () => {
    expect(flags("We gathered many informations.", "informations")).toBe(true);
    expect(flags("He gave me several advices.", "advices")).toBe(true);
    expect(flags("The equipments were delivered.", "equipments")).toBe(true);
  });

  it("catches countable/uncountable quantifier confusion", () => {
    expect(flags("A large amount of people attended.", "amount of people")).toBe(true);
    expect(flags("There were less people than expected.", "less people")).toBe(true);
  });

  it("catches subject-verb agreement after existential ‘there’", () => {
    expect(flags("There is many reasons to doubt this.", "there is many")).toBe(true);
  });

  it("catches double comparatives and superlatives", () => {
    expect(flags("This is more easier than the last one.", "more easier")).toBe(true);
    expect(flags("It was the most biggest problem.", "most biggest")).toBe(true);
  });

  it("catches ‘could of’ for ‘could have’", () => {
    const corrections = findCorrections("We could of avoided that.");
    expect(corrections.some((c) => c.suggestion === "could have")).toBe(true);
  });

  it("catches register slippage in formal writing", () => {
    expect(flags("According to me, the policy failed.", "according to me")).toBe(true);
    expect(flags("In my point of view, this is wrong.", "in my point of view")).toBe(true);
    expect(flags("Irregardless of the outcome, we proceed.", "irregardless")).toBe(true);
  });

  it("catches collocation errors that survive into C1 writing", () => {
    expect(flags("They will make a research on this.", "make a research")).toBe(true);
    expect(flags("He is married with a doctor.", "married with")).toBe(true);
  });

  // The engine's design constraint: a false positive costs a learner more
  // confidence than a missed error costs them accuracy.
  describe("precision on correct English", () => {
    const correct = [
      "The result depends on the sample size.",
      "We discussed the proposal at length.",
      "I agree with your conclusion entirely.",
      "A large number of people attended.",
      "There are many reasons to doubt this.",
      "This is easier than the last one.",
      "We could have avoided that outcome.",
      "In my view, the policy failed.",
      "They will conduct research into this question.",
      "Not only did she meet the deadline, but she also came in under budget.",
      "Had it not been for the intervention, the error would have reached the client.",
    ];

    it.each(correct)("does not flag: %s", (sentence) => {
      const corrections = findCorrections(sentence, "ESSAY");
      const grammarIssues = corrections.filter((c) => c.type === "grammar" || c.type === "collocation");
      expect(grammarIssues).toHaveLength(0);
    });
  });

  it("respects genre exemptions", () => {
    const text = "There's a lot of things we can't do here, etc.";
    // In a formal essay, contractions and "a lot of" are register issues.
    expect(findCorrections(text, "ESSAY").some((c) => c.type === "register")).toBe(true);
    // In an email they are unremarkable.
    expect(findCorrections(text, "EMAIL").some((c) => c.ruleId === "a-lot-of-formal")).toBe(false);
  });

  it("returns corrections ordered by position so annotations do not overlap", () => {
    const text = "I am agree that it depends of the informations available.";
    const corrections = findCorrections(text);
    for (let i = 1; i < corrections.length; i += 1) {
      expect(corrections[i].span[0]).toBeGreaterThanOrEqual(corrections[i - 1].span[1]);
    }
  });

  it("anchors every span to the exact substring it claims", () => {
    const text = "The outcome depends of several informations we have not gathered.";
    for (const correction of findCorrections(text)) {
      expect(text.slice(correction.span[0], correction.span[1])).toBe(correction.original);
    }
  });

  it("is stateless across repeated calls despite the global regex flags", () => {
    const text = "It depends of the context.";
    const first = findCorrections(text).length;
    const second = findCorrections(text).length;
    const third = findCorrections(text).length;
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first).toBeGreaterThan(0);
  });
});

describe("heuristics.profileStyle", () => {
  const c2Text = `Not only did the committee ignore the evidence, but it also commissioned a second report.
    Although the findings were consistent, the recommendations were not. Having reviewed both documents,
    one might reasonably conclude that the exercise was largely performative. It is, however, worth noting
    that the underlying measurement problem remains unresolved. Consequently, any implementation would
    arguably require a considerably more rigorous evaluation framework.`;

  it("detects marked structures that signal grammatical range", () => {
    const profile = profileStyle(c2Text);
    expect(profile.advancedStructures.length).toBeGreaterThanOrEqual(2);
    expect(profile.advancedStructures).toContain("Negative inversion");
  });

  it("counts hedging devices", () => {
    expect(profileStyle(c2Text).hedgeCount).toBeGreaterThan(0);
  });

  it("reports discourse marker variety by function, not raw count", () => {
    const profile = profileStyle(c2Text);
    expect(profile.markerCategories.length).toBeGreaterThanOrEqual(2);
  });

  it("identifies over-repeated content words", () => {
    const repetitive = "The system failed. The system was replaced. The system failed again. The system is gone.";
    expect(profileStyle(repetitive).repeatedWords[0]?.word).toBe("system");
  });

  it("measures passive density as a ratio, not a flat warning", () => {
    const passive = "The report was written. The data were collected. The results were analysed.";
    expect(profileStyle(passive).passiveRatio).toBeGreaterThan(0.5);
    const active = "We wrote the report. We collected the data. We analysed the results.";
    expect(profileStyle(active).passiveRatio).toBeLessThan(0.3);
  });
});

describe("heuristics.estimateLevel", () => {
  it("rates dense, hedged, structurally varied prose above simple prose", () => {
    const simple = "I like the book. It is good. The story is nice. I read it fast.";
    const advanced = `Not only does the argument rest on a contested premise, but it also conflates
      two distinct phenomena. It is arguably the case that the underlying mechanism remains poorly
      understood, and any conclusion drawn from such evidence should be treated as provisional.
      Nevertheless, the broader implication is worth pursuing further.`;

    const simpleLevel = estimateLevel(simple, 0);
    const advancedLevel = estimateLevel(advanced, 0);
    expect(["C1", "C2"]).toContain(advancedLevel);
    expect(simpleLevel).toBe("B2");
  });

  it("penalises a high error rate", () => {
    const text = `Not only does the argument rest on a contested premise, but it also conflates
      two distinct phenomena, and it is arguably the case that the mechanism remains poorly understood.`;
    const clean = estimateLevel(text, 0);
    const errorRidden = estimateLevel(text, 12);
    const order = { B2: 0, C1: 1, C2: 2 };
    expect(order[errorRidden]).toBeLessThanOrEqual(order[clean]);
  });
});

describe("heuristics.suggestUpgrades", () => {
  it("offers a higher-register rewrite of something the learner wrote", () => {
    const upgrades = suggestUpgrades("I think this is very important for the project.");
    expect(upgrades.length).toBeGreaterThan(0);
    expect(upgrades[0].rationale).toBeTruthy();
  });

  it("returns nothing when there is nothing obvious to upgrade", () => {
    expect(suggestUpgrades("Notwithstanding these caveats, the conclusion holds.")).toHaveLength(0);
  });

  it("respects the requested limit", () => {
    const text = "I think this is very important because of this, and many people believe it.";
    expect(suggestUpgrades(text, 2).length).toBeLessThanOrEqual(2);
  });
});

describe("heuristics.heuristicWriting", () => {
  const strong = `The proposition that expertise has been devalued deserves closer examination than it
    usually receives. It is widely held that universal access to information has flattened the distinction
    between the specialist and the amateur; the evidence, however, suggests a more complicated picture.
    Although search has indeed democratised access to facts, it has not democratised the judgement required
    to weigh them. Not only does this distinction survive the internet, it arguably matters more because of it.
    Admittedly, professional bodies have at times used credentialism to protect position rather than standards,
    and any defence of expertise must reckon with that record. Nevertheless, the conclusion that follows is not
    that expertise is obsolete but that it must be demonstrated rather than asserted.`;

  it("returns a band for every criterion", () => {
    const report = heuristicWriting({
      genre: "ESSAY",
      cefr: "C1",
      prompt: "Has expertise been devalued by universal access to information?",
      text: strong,
    });
    expect(Object.keys(report.criteria)).toHaveLength(5);
    for (const value of Object.values(report.criteria)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(9);
      // Half-band granularity, as IELTS reports.
      expect(value * 2).toBe(Math.round(value * 2));
    }
  });

  it("scores a strong text above a weak one", () => {
    const weak = "Nowadays social media is very bad. Everyone knows this. In my point of view it is a big problem. There is many reasons.";
    const strongReport = heuristicWriting({ genre: "ESSAY", cefr: "C1", prompt: "Discuss social media.", text: strong });
    const weakReport = heuristicWriting({ genre: "ESSAY", cefr: "C1", prompt: "Discuss social media.", text: weak });
    expect(strongReport.overallBand).toBeGreaterThan(weakReport.overallBand);
  });

  it("always returns at least one strength and one priority", () => {
    const report = heuristicWriting({ genre: "ESSAY", cefr: "B2", prompt: "Discuss.", text: "It is short." });
    expect(report.strengths.length).toBeGreaterThan(0);
    expect(report.priorities.length).toBeGreaterThan(0);
  });

  it("labels itself as rules-engine output so the UI can say so", () => {
    const report = heuristicWriting({ genre: "ESSAY", cefr: "C1", prompt: "Discuss.", text: strong });
    expect(report.source).toBe("rules");
  });

  it("flags under-length submissions as a priority", () => {
    const report = heuristicWriting({
      genre: "ESSAY",
      cefr: "C1",
      prompt: "Discuss the role of expertise.",
      text: "Expertise matters. People should listen to experts more often than they do.",
    });
    expect(report.priorities.join(" ")).toMatch(/under-developed|words/i);
  });
});
