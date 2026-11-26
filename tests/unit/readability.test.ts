/**
 * Client-facing reading level (spec section 3, client mode: 6th-8th grade).
 * Flesch-Kincaid grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59.
 * Syllables use the common vowel-group heuristic, numbers are counted as they are read aloud.
 */
import { describe, expect, it } from "vitest";
import { getHandout, lexicon } from "@/lib/content";

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS: Record<number, string> = { 2: "twenty", 3: "thirty", 4: "forty", 5: "fifty", 6: "sixty", 7: "seventy", 8: "eighty", 9: "ninety" };

/** Syllables in one word. Numbers: 0-99 as words ("15" = fifteen), longer ones digit by digit ("988" = nine eight eight). */
function countSyllables(word: string): number {
  if (/^\d+$/.test(word)) {
    const n = Number(word);
    if (n < 20) return countSyllables(ONES[n] ?? "");
    if (n < 100) return countSyllables(TENS[Math.floor(n / 10)] ?? "") + (n % 10 ? countSyllables(ONES[n % 10] ?? "") : 0);
    return [...word].reduce((sum, d) => sum + countSyllables(ONES[Number(d)] ?? ""), 0);
  }
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // Silent endings: -es / -ed / -e after a consonant other than l ("muscle" keeps its -le syllable).
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Words of a sentence: split on spaces, slashes, hyphens and dashes; surrounding punctuation dropped. */
function wordsOf(sentence: string): string[] {
  return sentence
    .split(/[\s–—/-]+/)
    .map((w) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter((w) => /[A-Za-z0-9]/.test(w));
}

/** Sentences of a block. A block (intro, step, body) always ends a sentence, even without a period. */
function sentencesOf(block: string): string[] {
  const text = /[.!?]\s*$/.test(block) ? block : `${block}.`;
  return text.split(/(?<=[.!?])\s+/).filter((s) => wordsOf(s).length > 0);
}

interface Readability {
  sentences: number;
  words: number;
  syllables: number;
  grade: number;
}

function readability(blocks: readonly string[]): Readability {
  let sentences = 0;
  let words = 0;
  let syllables = 0;
  for (const block of blocks) {
    for (const s of sentencesOf(block)) {
      const ws = wordsOf(s);
      sentences++;
      words += ws.length;
      syllables += ws.reduce((n, w) => n + countSyllables(w), 0);
    }
  }
  const grade = sentences && words ? 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59 : 0;
  return { sentences, words, syllables, grade };
}

const pmr = getHandout("pmr-homework");

/** Everything a client reads on the PMR sheet: intro, section bodies and steps, and the safety note. */
function pmrBlocks(): string[] {
  if (!pmr) return [];
  return [pmr.intro, ...pmr.sections.flatMap((s) => [s.body ?? "", ...(s.steps ?? [])]), pmr.safetyNote].filter(
    (b) => b.trim().length > 0,
  );
}

describe("syllable counting", () => {
  it.each([
    ["the", 1],
    ["sheet", 1],
    ["breathe", 1],
    ["feel", 1],
    ["muscle", 2],
    ["muscles", 2],
    ["tightened", 2],
    ["shoulders", 2],
    ["practice", 2],
    ["notice", 2],
    ["people", 2],
    ["relaxation", 4],
    ["15", 2],
    ["20", 2],
    ["988", 3],
  ])("%s has %i syllable(s)", (word, n) => {
    expect(countSyllables(word)).toBe(n);
  });

  it("ignores punctuation-only tokens", () => {
    expect(countSyllables("--")).toBe(0);
  });
});

describe("Flesch-Kincaid grade", () => {
  it("rates plain short sentences low and dense academic prose high (the metric can fail)", () => {
    expect(readability(["Sit down. Take a slow breath. Let your hands rest."]).grade).toBeLessThan(3);
    expect(
      readability([
        "Comprehensive psychophysiological evaluation necessitates multidisciplinary collaboration and individualized pharmacotherapeutic considerations.",
      ]).grade,
    ).toBeGreaterThan(12);
  });

  it("treats a block without final punctuation as one sentence", () => {
    expect(readability(["Turn your phone to silent", "Close your eyes"]).sentences).toBe(2);
  });
});

describe("PMR homework handout reading level", () => {
  it("exists and declares a 6-8 reading level for clients", () => {
    expect(pmr).toBeDefined();
    expect(pmr?.audience).toBe("client");
    expect(pmr?.readingLevel).toBe("6-8");
  });

  it("has body text at or below Flesch-Kincaid grade 8.5", () => {
    const r = readability(pmrBlocks());
    expect(r.words).toBeGreaterThan(300);
    expect(r.grade).toBeLessThanOrEqual(8.5);
  });

  it("keeps sentences short (average 15 words or fewer)", () => {
    const r = readability(pmrBlocks());
    expect(r.words / r.sentences).toBeLessThanOrEqual(15);
  });

  it("keeps every section, the intro and the safety note at or below grade 10", () => {
    if (!pmr) throw new Error("pmr-homework handout missing");
    const parts: [string, string[]][] = [
      ["intro", [pmr.intro]],
      ...pmr.sections.map((s): [string, string[]] => [s.heading, [s.body ?? "", ...(s.steps ?? [])].filter(Boolean)]),
      ["safetyNote", [pmr.safetyNote]],
    ];
    for (const [name, blocks] of parts) expect(readability(blocks).grade, name).toBeLessThanOrEqual(10);
  });
});

describe("client-mode symptom wording", () => {
  it("keeps symptom client labels at or below grade 8.5 overall", () => {
    const r = readability(lexicon.symptoms.map((s) => s.clientLabel));
    expect(r.grade).toBeLessThanOrEqual(8.5);
  });
});
