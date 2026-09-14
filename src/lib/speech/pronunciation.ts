import type { Accent } from "@prisma/client";

import { coverage, diffWords, normalise, similarity, words, type WordDiff } from "../text";

/**
 * Pronunciation scoring from an ASR transcript.
 *
 * What this can and cannot do, stated plainly because it matters:
 *
 * The browser's SpeechRecognition API returns *text*, not phonemes or acoustic
 * confidence. So we score what a listener actually experiences — whether the
 * words came across — rather than pretending to measure formants. In practice
 * this is a strong proxy: an ASR engine trained on native speech mis-transcribes
 * exactly the words a listener would mishear.
 *
 * Four sub-scores:
 *  - accuracy: did the intended words survive transcription
 *  - completeness: how much of the target was attempted
 *  - fluency: speaking rate against a native band, penalising both stalling and rushing
 *  - prosody: rhythm proxy — whether content words were preserved relative to
 *    function words, which is what stress-timing actually protects
 *
 * Swapping in a phoneme-level provider (Azure Pronunciation Assessment, Google
 * STT with confidence) means replacing `score()` and keeping the same shape —
 * see docs/EXTENDING.md#pronunciation.
 */

export interface WordScore {
  word: string;
  score: number;
  status: WordDiff["status"];
  issue?: string;
}

export interface PronunciationScore {
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number;
  overall: number;
  wordScores: WordScore[];
  tips: string[];
}

/** Comfortable native reading rate, words per minute. */
const NATIVE_WPM = { low: 130, high: 180 };

/**
 * Minimal pairs and clusters that reliably defeat learners, with the advice
 * that actually fixes them. Keyed by the sound, matched against target words.
 */
const SOUND_TRAPS: { id: string; test: RegExp; tip: string; accents?: Accent[] }[] = [
  {
    id: "th-voiced",
    test: /\b(?:the|this|that|these|those|they|there|then|though|either|whether|rather|further)\b/i,
    tip: "Voiced /ð/: the tongue tip touches the back of the upper teeth and the voice keeps running. If it comes out as /d/ or /z/, you are stopping the airflow too early.",
  },
  {
    id: "th-unvoiced",
    test: /\b\w*th(?:ink|ought|rough|ree|ank|eory|orough)\w*\b/i,
    tip: "Unvoiced /θ/: same tongue position as /ð/ but no voice. Substituting /s/ or /f/ is the single most audible learner marker in English.",
  },
  {
    id: "consonant-cluster",
    test: /\b\w*(?:sts|sks|lths|ngths|ldst|rlds)\b/i,
    tip: "Three-consonant clusters (texts, strengths, worlds): native speakers reduce rather than insert a vowel. Aim for /teksts/ with a light final cluster, never /tek-sə-tsə/.",
  },
  {
    id: "schwa",
    test: /\b(?:comfortable|temperature|vegetable|interesting|different|separate|literature|restaurant)\b/i,
    tip: "English compresses unstressed syllables to schwa. 'Comfortable' is three syllables (/ˈkʌmftəbl̩/), not four — over-articulating marks you as non-native more than an accent does.",
  },
  {
    id: "word-stress-shift",
    test: /\b(?:photograph|photography|photographic|politics|political|economy|economic|analyse|analysis|analytical)\b/i,
    tip: "Stress moves as the suffix changes: PHOto-graph → phoTOGraphy → photoGRAPHic. Misplaced stress causes more breakdowns in comprehension than any individual sound.",
  },
  {
    id: "linking",
    test: /\b\w+[bcdfgklmnprstvz]\s+[aeiou]\w*/i,
    tip: "Link a final consonant into a following vowel: 'an apple' is /ə-ˈnæpl̩/. Separating every word is what makes fluent speech sound effortful.",
  },
  {
    id: "r-final",
    test: /\b\w+(?:er|or|ar|ur|ir)\b/i,
    tip: "Final /r/ is pronounced in US/CA/IE accents and dropped in standard UK/AU. Pick one and be consistent — mixing them is what sounds unplaced.",
    accents: ["UK", "AU"],
  },
];

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "at", "for", "and", "or", "but", "is", "are",
  "was", "were", "be", "been", "has", "have", "had", "do", "does", "did", "it", "its",
  "that", "this", "as", "with", "by", "from",
]);

export interface ScoreInput {
  target: string;
  transcript: string;
  durationMs: number;
  accent?: Accent;
}

export function score(input: ScoreInput): PronunciationScore {
  const { target, transcript, durationMs, accent = "UK" } = input;
  const diff = diffWords(target, transcript);
  const targetWords = words(target);
  const spokenWords = words(transcript);

  // --- accuracy -------------------------------------------------------------
  const accuracy = coverage(diff) * 100;

  // --- completeness ---------------------------------------------------------
  const attempted = diff.filter((d) => d.status !== "missing").length;
  const completeness = targetWords.length
    ? Math.min(100, (attempted / targetWords.length) * 100)
    : 0;

  // --- fluency --------------------------------------------------------------
  const minutes = Math.max(durationMs, 1) / 60_000;
  const wpm = spokenWords.length / minutes;
  let fluency: number;
  if (wpm >= NATIVE_WPM.low && wpm <= NATIVE_WPM.high) {
    fluency = 100;
  } else if (wpm < NATIVE_WPM.low) {
    fluency = Math.max(30, 100 - (NATIVE_WPM.low - wpm) * 0.8);
  } else {
    // Rushing costs less than stalling, but still costs.
    fluency = Math.max(45, 100 - (wpm - NATIVE_WPM.high) * 0.5);
  }

  // --- prosody --------------------------------------------------------------
  // Stress-timed English protects content words and swallows function words.
  // A speaker with poor rhythm loses content words first — the reverse of a
  // native speaker, whose function words are the ones ASR drops.
  const contentTargets = targetWords.filter((w) => !FUNCTION_WORDS.has(w));
  const contentHit = contentTargets.filter((w) =>
    diff.some((d) => d.word === w && (d.status === "match" || d.status === "near")),
  ).length;
  const contentRate = contentTargets.length ? contentHit / contentTargets.length : 1;
  const overallRate = targetWords.length ? (accuracy / 100) : 1;
  // Content words held up better than average → good stress placement.
  const prosody = Math.max(
    30,
    Math.min(100, 60 + (contentRate - overallRate) * 120 + contentRate * 30),
  );

  // --- per-word -------------------------------------------------------------
  const wordScores: WordScore[] = diff.map((d) => {
    if (d.status === "match") return { word: d.word, score: 100, status: d.status };
    if (d.status === "near") {
      return {
        word: d.word,
        score: 70,
        status: d.status,
        issue: "Recognised, but not cleanly — the vowel or a final consonant is drifting.",
      };
    }
    if (d.status === "extra") {
      return { word: d.word, score: 0, status: d.status, issue: "Not in the target — an inserted or repeated word." };
    }
    return {
      word: d.word,
      score: 0,
      status: d.status,
      issue: soundIssueFor(d.word) ?? "Not recognised. Slow down and give this word its full stress.",
    };
  });

  // --- tips -----------------------------------------------------------------
  const tips: string[] = [];
  const problemWords = wordScores.filter((w) => w.score < 100).map((w) => w.word);

  for (const trap of SOUND_TRAPS) {
    if (trap.accents && !trap.accents.includes(accent)) continue;
    const hitsProblem = problemWords.some((w) => trap.test.test(w));
    const inTarget = trap.test.test(target);
    if (inTarget && (hitsProblem || accuracy < 85)) {
      tips.push(trap.tip);
    }
    if (tips.length >= 3) break;
  }

  if (wpm < NATIVE_WPM.low && spokenWords.length > 3) {
    tips.push(
      `You averaged ${Math.round(wpm)} words per minute; natural delivery sits around ${NATIVE_WPM.low}-${NATIVE_WPM.high}. Read the whole sentence through once silently, then say it as a single breath group.`,
    );
  } else if (wpm > NATIVE_WPM.high + 40) {
    tips.push(
      `At ${Math.round(wpm)} words per minute you are outrunning your articulation. Speed without clear stress reads as less fluent, not more.`,
    );
  }

  if (prosody < 65 && tips.length < 4) {
    tips.push(
      "Your stressed syllables are not standing out enough. Try tapping the rhythm: content words land on the beat, function words fill the gaps between.",
    );
  }
  if (tips.length === 0) {
    tips.push(
      accuracy >= 95
        ? "Clean and intelligible throughout. Next step: work on intonation — does your pitch fall for statements and rise for genuine questions?"
        : "Solid overall. Isolate the words scored below 100 and drill them in a carrier sentence rather than alone.",
    );
  }

  const overall =
    accuracy * 0.4 + completeness * 0.2 + fluency * 0.2 + prosody * 0.2;

  return {
    accuracy: round(accuracy),
    fluency: round(fluency),
    completeness: round(completeness),
    prosody: round(prosody),
    overall: round(overall),
    wordScores,
    tips: tips.slice(0, 4),
  };
}

function soundIssueFor(word: string): string | undefined {
  for (const trap of SOUND_TRAPS) {
    if (trap.test.test(word)) return trap.tip;
  }
  return undefined;
}

function round(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
}

/** Did the learner say substantially the right thing, ignoring ASR noise? */
export function isCloseEnough(target: string, transcript: string): boolean {
  return similarity(normalise(target), normalise(transcript)) >= 0.85;
}
