/**
 * Lightweight text analytics used for writing feedback, readability reporting
 * and the deterministic fallback when no AI provider is configured.
 *
 * Everything here is dependency-free and deterministic so the same numbers can
 * be computed on the client (live word count, readability meter) and on the
 * server (stored feedback) without disagreeing.
 */

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'’\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Vowel-group syllable estimate. Accurate enough for readability indices. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface Readability {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  avgSyllablesPerWord: number;
  /** Flesch Reading Ease — lower means denser. C1/C2 prose typically 30-50. */
  fleschReadingEase: number;
  /** US grade level. */
  fleschKincaidGrade: number;
  /** Type-token ratio — lexical variety. */
  typeTokenRatio: number;
  /** Share of content words. Academic prose runs high (0.5+). */
  lexicalDensity: number;
  longSentences: number;
}

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so", "if", "then", "than", "that",
  "this", "these", "those", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us",
  "them", "my", "your", "his", "its", "our", "their", "is", "am", "are", "was", "were", "be",
  "been", "being", "do", "does", "did", "have", "has", "had", "will", "would", "can", "could",
  "shall", "should", "may", "might", "must", "of", "in", "on", "at", "to", "from", "by", "with",
  "about", "as", "into", "over", "after", "before", "between", "through", "during", "without",
  "within", "along", "across", "there", "here", "when", "where", "who", "whom", "which", "what",
  "how", "why", "not", "no", "also", "very", "just",
]);

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function analyse(text: string): Readability {
  const w = words(text);
  const s = sentences(text);
  const wordCount = w.length;
  const sentenceCount = Math.max(1, s.length);
  const syllableTotal = w.reduce((sum, word) => sum + syllables(word), 0);

  const avgSentenceLength = wordCount / sentenceCount;
  const avgSyllablesPerWord = wordCount ? syllableTotal / wordCount : 0;

  const unique = new Set(w).size;
  const content = w.filter((word) => !FUNCTION_WORDS.has(word)).length;

  return {
    wordCount,
    sentenceCount: s.length,
    avgSentenceLength: round(avgSentenceLength),
    avgSyllablesPerWord: round(avgSyllablesPerWord),
    fleschReadingEase: round(206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord),
    fleschKincaidGrade: round(0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59),
    typeTokenRatio: wordCount ? round(unique / wordCount) : 0,
    lexicalDensity: wordCount ? round(content / wordCount) : 0,
    longSentences: s.filter((sentence) => words(sentence).length > 35).length,
  };
}

// --- normalisation used by the grader --------------------------------------

/** Casing, punctuation and whitespace-insensitive comparison key. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\w\s'"-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** 0-1 similarity, used to accept near-misses with a "watch your spelling" note. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

/** Word-level alignment, powering dictation and pronunciation comparisons. */
export interface WordDiff {
  word: string;
  status: "match" | "missing" | "extra" | "near";
}

/**
 * Longest-common-subsequence alignment. A greedy scan mislabels a single
 * inserted word as a cascade of mismatches, which reads as "you got everything
 * wrong" to a learner who dropped one article.
 */
export function diffWords(expected: string, actual: string): WordDiff[] {
  const exp = normalise(expected).split(" ").filter(Boolean);
  const act = normalise(actual).split(" ").filter(Boolean);

  const near = (a: string, b: string) => a === b || similarity(a, b) >= 0.75;

  // lcs[i][j] = length of the best alignment of exp[i..] with act[j..]
  const lcs: number[][] = Array.from({ length: exp.length + 1 }, () =>
    new Array<number>(act.length + 1).fill(0),
  );
  for (let i = exp.length - 1; i >= 0; i -= 1) {
    for (let j = act.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = near(exp[i], act[j])
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: WordDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < exp.length && j < act.length) {
    if (near(exp[i], act[j])) {
      out.push({ word: exp[i], status: exp[i] === act[j] ? "match" : "near" });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ word: exp[i], status: "missing" });
      i += 1;
    } else {
      out.push({ word: act[j], status: "extra" });
      j += 1;
    }
  }
  while (i < exp.length) {
    out.push({ word: exp[i], status: "missing" });
    i += 1;
  }
  while (j < act.length) {
    out.push({ word: act[j], status: "extra" });
    j += 1;
  }
  return out;
}

/** Share of expected words recovered — the accuracy term for dictation. */
export function coverage(diff: WordDiff[]): number {
  const expected = diff.filter((d) => d.status !== "extra").length;
  if (expected === 0) return 0;
  const hit = diff.filter((d) => d.status === "match").length;
  const partial = diff.filter((d) => d.status === "near").length;
  return Math.min(1, (hit + partial * 0.5) / expected);
}
