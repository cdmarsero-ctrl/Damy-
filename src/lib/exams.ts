import type { Cefr, ExamName } from "@prisma/client";

/**
 * Score conversion for the four supported examinations.
 *
 * These are *indicative* conversions built from each board's published
 * raw-to-scale guidance. Real conversions are re-equated per sitting and are
 * not public, so the UI labels every number here as an estimate. Getting this
 * wrong in the confident direction is how learners walk into an exam
 * expecting a band they will not get.
 */

export interface Scoring {
  scaled: number;
  label: string;
  cefr: Cefr;
  /** Copy shown beneath the score. */
  interpretation: string;
}

export const EXAM_LABEL: Record<ExamName, string> = {
  IELTS: "IELTS Academic",
  TOEFL: "TOEFL iBT",
  CAE: "Cambridge C1 Advanced",
  CPE: "Cambridge C2 Proficiency",
};

export const EXAM_BLURB: Record<ExamName, string> = {
  IELTS: "Band 0-9 across four skills. Most universities ask for 6.5-7.5 overall with no band below 6.",
  TOEFL: "0-120, thirty points per section. Competitive programmes typically want 100+.",
  CAE: "Cambridge scale 160-210. A pass at grade C (180) certifies C1.",
  CPE: "Cambridge scale 180-230. A pass at grade C (200) certifies C2 — the highest general English qualification.",
};

/** IELTS band from proportion correct, following the published 40-item tables. */
function ieltsBand(ratio: number): number {
  const table: [number, number][] = [
    [0.975, 9], [0.9, 8.5], [0.85, 8], [0.8, 7.5], [0.75, 7],
    [0.65, 6.5], [0.575, 6], [0.5, 5.5], [0.4, 5], [0.3, 4.5],
    [0.25, 4], [0.15, 3.5], [0.1, 3],
  ];
  for (const [threshold, band] of table) {
    if (ratio >= threshold) return band;
  }
  return 2.5;
}

/** Cambridge scale score, linear within the band the ratio falls into. */
function cambridgeScale(ratio: number, exam: "CAE" | "CPE"): number {
  const floor = exam === "CAE" ? 160 : 180;
  const ceiling = exam === "CAE" ? 210 : 230;
  return Math.round(floor + ratio * (ceiling - floor));
}

function cambridgeGrade(scale: number, exam: "CAE" | "CPE"): string {
  const gradeA = exam === "CAE" ? 200 : 220;
  const gradeB = exam === "CAE" ? 193 : 213;
  const gradeC = exam === "CAE" ? 180 : 200;
  const b2Level = exam === "CAE" ? 160 : 180;

  if (scale >= gradeA) return `Grade A (${scale})`;
  if (scale >= gradeB) return `Grade B (${scale})`;
  if (scale >= gradeC) return `Grade C (${scale})`;
  if (scale >= b2Level) return `${exam === "CAE" ? "B2" : "C1"} certificate (${scale})`;
  return `Below pass (${scale})`;
}

export function toBand(exam: ExamName, rawScore: number, maxScore: number): Scoring {
  const ratio = maxScore > 0 ? Math.max(0, Math.min(1, rawScore / maxScore)) : 0;

  switch (exam) {
    case "IELTS": {
      const band = ieltsBand(ratio);
      return {
        scaled: band,
        label: `Band ${band.toFixed(1)}`,
        cefr: band >= 8 ? "C2" : band >= 7 ? "C1" : "B2",
        interpretation:
          band >= 8
            ? "Very good to expert user. Comfortably above the requirement for any English-medium programme."
            : band >= 7
              ? "Good user. Meets the standard requirement at most universities."
              : band >= 6.5
                ? "Competent user. Sufficient for many programmes; some competitive ones ask for 7."
                : "Below the usual academic threshold. Target accuracy before range.",
      };
    }

    case "TOEFL": {
      // Each section is out of 30; this module reports one section's worth.
      const sectionScore = Math.round(ratio * 30);
      return {
        scaled: sectionScore,
        label: `${sectionScore}/30`,
        cefr: sectionScore >= 28 ? "C2" : sectionScore >= 24 ? "C1" : "B2",
        interpretation:
          sectionScore >= 28
            ? "Advanced. Equivalent to roughly 110+ overall if sustained across sections."
            : sectionScore >= 24
              ? "High-intermediate to advanced — around 100 overall, the usual competitive threshold."
              : "Intermediate. Work on this section specifically before the next full practice test.",
      };
    }

    case "CAE":
    case "CPE": {
      const scale = cambridgeScale(ratio, exam);
      const passMark = exam === "CAE" ? 180 : 200;
      return {
        scaled: scale,
        label: cambridgeGrade(scale, exam),
        cefr: exam === "CPE" ? (scale >= 200 ? "C2" : "C1") : scale >= 180 ? "C1" : "B2",
        interpretation:
          scale >= passMark
            ? `A pass at this level certifies ${exam === "CAE" ? "C1" : "C2"}. Cambridge certificates do not expire.`
            : `Below the ${passMark} pass mark. You would still receive a certificate at the level below.`,
      };
    }
  }
}

/** Sensible study-plan pacing from a target date. */
export function studyPlan(daysRemaining: number | null): string {
  if (daysRemaining === null) return "Set your exam date in Settings and this becomes a countdown with weekly targets.";
  if (daysRemaining < 0) return "Your exam date has passed. Update it in Settings to start a new cycle.";
  if (daysRemaining <= 7) {
    return "Final week: full timed papers only. Stop learning new material — consolidate what is already there and protect your sleep.";
  }
  if (daysRemaining <= 30) {
    return "Under a month: two timed sections a week, with a full paper every weekend. Review every error until you can explain why the right answer is right.";
  }
  if (daysRemaining <= 90) {
    return "Three months: build the skills now and save full papers for the last month. One section per week, plus daily vocabulary review.";
  }
  return "Plenty of runway. Focus on general proficiency — exam technique has a ceiling, and you have not hit it yet.";
}
