/**
 * Pure measurement helpers for the loopback console.
 *
 * Everything here works on plain numbers and sample buffers so it can be unit
 * tested without a browser; the component only feeds it analyser readings.
 */

/** Phase 1 exit criterion: audio round trip through the agent, p50. */
export const LOOPBACK_TARGET_MS = 150;

/** Level treated as digital silence. Keeps log10(0) out of the arithmetic. */
export const SILENCE_DB = -100;

export function rmsDb(samples: ArrayLike<number>): number {
  if (samples.length === 0) return SILENCE_DB;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface LatencySummary {
  samples: number;
  p50: number;
  min: number;
  max: number;
  meetsTarget: boolean;
}

export function summariseLatency(values: number[], targetMs = LOOPBACK_TARGET_MS): LatencySummary | null {
  const p50 = median(values);
  if (p50 === null) return null;
  return {
    samples: values.length,
    p50,
    min: Math.min(...values),
    max: Math.max(...values),
    meetsTarget: p50 <= targetMs,
  };
}

/**
 * Onset detector for the timing probe: the burst is a full-scale tone, so the
 * returned probe track jumps from near silence to well above this threshold.
 * A fixed threshold is enough because the probe never passes through a
 * microphone or any gain stage.
 */
export const PROBE_ONSET_DB = -30;

export function isOnset(levelDb: number, thresholdDb = PROBE_ONSET_DB): boolean {
  return levelDb >= thresholdDb;
}

export type LeakVerdict = "pass" | "marginal" | "fail";

export interface LeakAssessment {
  /** Mean mic level while quiet, before the tone. */
  baselineDb: number;
  /** Mean mic level while the tone plays through the speaker. */
  toneDb: number;
  /** How much the tone raised the processed mic signal. ~0 dB = fully cancelled. */
  leakDb: number;
  verdict: LeakVerdict;
}

/**
 * Compares the processed microphone level with and without the test tone
 * playing. With AEC working, the tone is removed before the track reaches us,
 * so the level stays at the room's noise floor. Averaging in the power domain
 * keeps one loud reading from dominating the dB mean.
 *
 * Thresholds: under 3 dB is indistinguishable from ordinary noise-floor
 * wander; over 8 dB means the tone is clearly audible to ASR.
 */
export function assessLeak(baseline: number[], duringTone: number[]): LeakAssessment | null {
  if (baseline.length === 0 || duringTone.length === 0) return null;
  const meanDb = (levels: number[]) => {
    const power = levels.reduce((sum, db) => sum + 10 ** (db / 10), 0) / levels.length;
    return power > 0 ? Math.max(SILENCE_DB, 10 * Math.log10(power)) : SILENCE_DB;
  };
  const baselineDb = meanDb(baseline);
  const toneDb = meanDb(duringTone);
  const leakDb = Math.max(0, toneDb - baselineDb);
  const verdict: LeakVerdict = leakDb < 3 ? "pass" : leakDb < 8 ? "marginal" : "fail";
  return { baselineDb, toneDb, leakDb, verdict };
}
