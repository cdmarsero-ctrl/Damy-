/**
 * Phase 5: what the page does about echo (docs/REALTIME-TRANSLATION.md §6.3).
 *
 * Pure, so the rules are unit-tested; client-session.ts applies them.
 */

import type { CaptureCheck } from "./aec";
import type { EchoReport, EchoStatus } from "./protocol";

/**
 * Why the page is in protected mode, or null when it isn't:
 * - "aec-off": the browser reports no echo cancellation on the microphone;
 * - "echo-detected": the agent keeps removing its own voice from the mic.
 *
 * Protected mode mutes the translated voice until the learner confirms
 * headphones, which remove acoustic echo physically. Captions and the
 * translation text carry on regardless.
 */
export type ProtectedReason = "aec-off" | "echo-detected";

export function protectedReason(
  capture: CaptureCheck | null,
  echo: EchoStatus | null,
  headphones: boolean,
): ProtectedReason | null {
  if (headphones) return null;
  if (capture && !capture.ok) return "aec-off";
  if (echo === "leaking") return "echo-detected";
  return null;
}

/**
 * Once in protected mode the page stays there until the learner confirms
 * headphones: echo that comes and goes with how loudly the voice plays would
 * otherwise flip the voice on and off.
 */
export function nextProtection(
  current: ProtectedReason | null,
  capture: CaptureCheck | null,
  echo: EchoStatus | null,
  headphones: boolean,
): ProtectedReason | null {
  if (headphones) return null;
  return current ?? protectedReason(capture, echo, headphones);
}

export type EchoVerdict = "clean" | "guarded" | "leaking";

export interface EchoAssessment {
  verdict: EchoVerdict | "error";
  message: string;
}

/**
 * clean: none of the phrase reached the microphone (echo cancellation, or
 *   headphones, did the job);
 * guarded: some of it got through echo cancellation, and the echo guard
 *   removed all of it, so nothing was re-translated;
 * leaking: some of it reached captions.
 */
export function assessEchoReport(report: EchoReport): EchoAssessment {
  if ("error" in report) return { verdict: "error", message: report.error };
  const { spokenWords, heardWords, passedWords } = report;
  if (heardWords === 0) {
    return {
      verdict: "clean",
      message: `None of the ${spokenWords} spoken words reached the microphone. Echo is cancelled.`,
    };
  }
  if (passedWords === 0) {
    return {
      verdict: "guarded",
      message: `${heardWords} word${heardWords === 1 ? "" : "s"} got past echo cancellation; the echo guard removed ${heardWords === 1 ? "it" : "them all"}, so nothing was re-translated. Headphones are still better.`,
    };
  }
  return {
    verdict: "leaking",
    message: `${passedWords} word${passedWords === 1 ? "" : "s"} of the agent's own voice reached the captions. Use headphones on this device.`,
  };
}
