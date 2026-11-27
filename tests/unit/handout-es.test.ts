/**
 * Spanish handouts (HandoutSchema.es): every client handout in content/handouts has a Spanish version that keeps the
 * structure of the original (same sections, steps and log columns), every number (doses, phone numbers, times, 0-10
 * scales), the complete crisis information and the Part 2 sentence, stays WinAnsi-safe for the printable PDF, adds
 * no diagnosis words the English avoids (G3), and stays plain (Szigriszt-Pazos / INFLESZ readability).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HandoutSchema, type Handout } from "@/lib/schemas";
import { PDF_PART2_NOTICE_ES, toWinAnsi } from "@/lib/pdf";
import { PART2_NOTICE } from "@/lib/referral-links";
import { isClientSafeText } from "@/lib/client-safe";
import { handoutLangs, localizeHandout } from "@/components/handouts/localize";

const DIR = path.resolve(__dirname, "../../content/handouts");
const handouts: Handout[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => HandoutSchema.parse(JSON.parse(readFileSync(path.join(DIR, f), "utf8"))));

/** Every block a client reads, in order, for one language version. */
function blocks(h: Pick<Handout, "title" | "intro" | "sections" | "safetyNote">, log?: { columns: string[] }): string[] {
  return [
    h.title,
    h.intro,
    ...h.sections.flatMap((s) => [s.heading, ...(s.body ? [s.body] : []), ...(s.steps ?? [])]),
    ...(log?.columns ?? []),
    h.safetyNote,
  ];
}

const numbers = (s: string) => (s.match(/\d+/g) ?? []).sort();

describe.each(handouts.map((h) => [h.id, h] as const))("Spanish version: %s", (_id, h) => {
  const es = h.es;

  it("exists and says it still needs a fluent human review", () => {
    expect(es, "content/handouts must carry an es translation").toBeDefined();
    expect(es?.translatedBy).toMatch(/PENDING human review/);
    expect(handoutLangs(h)).toEqual(["en", "es"]);
  });

  it("keeps the structure of the original", () => {
    if (!es) return;
    expect(es.sections).toHaveLength(h.sections.length);
    h.sections.forEach((s, i) => {
      const t = es.sections[i];
      expect(Boolean(t?.body), `section ${i} body`).toBe(Boolean(s.body));
      expect(t?.steps?.length, `section ${i} steps`).toBe(s.steps?.length);
    });
    expect(es.practiceLog?.columns.length).toBe(h.practiceLog?.columns.length);
  });

  it("keeps every number, block by block", () => {
    if (!es) return;
    const en = blocks(h, h.practiceLog);
    const sp = blocks(es, es.practiceLog);
    expect(sp).toHaveLength(en.length);
    en.forEach((block, i) => expect(numbers(sp[i] ?? ""), `${block.slice(0, 50)} / ${sp[i]?.slice(0, 50)}`).toEqual(numbers(block)));
  });

  it("keeps the complete crisis information in the safety note", () => {
    if (!es) return;
    for (const must of ["988", "findahelpline.com", "911", "1-800-662-4357", "1-800-799-7233", "88788"]) {
      if (h.safetyNote.includes(must)) expect(es.safetyNote, must).toContain(must);
    }
    expect(es.safetyNote).toMatch(/^La seguridad es lo primero:/);
    expect(es.safetyNote).toContain("Esta hoja no reemplaza la atención de un profesional con licencia.");
  });

  it("keeps the 42 CFR Part 2 sentence on substance-use handouts", () => {
    if (!es) return;
    const enHasNotice = blocks(h).some((b) => b.includes(PART2_NOTICE));
    expect(blocks(es).some((b) => b.includes(PDF_PART2_NOTICE_ES))).toBe(enHasNotice);
  });

  it("prints without losing a character in the standard PDF fonts", () => {
    if (!es) return;
    for (const b of blocks(es, es.practiceLog)) expect(toWinAnsi(b), b).toBe(b);
  });

  it("adds no diagnosis or scoring words the English avoids (G3)", () => {
    if (!es) return;
    const en = blocks(h, h.practiceLog);
    const sp = blocks(es, es.practiceLog);
    en.forEach((block, i) => {
      if (isClientSafeText(block)) expect(isClientSafeText(sp[i] ?? ""), sp[i]).toBe(true);
    });
  });
});

/* ---------------------------------------------------------------- readability */

const STRONG = new Set([..."aeoáéóíú"]);
const VOWEL = /[aeiouáéíóúü]/;

/** Spanish syllables: vowel groups, split where two strong vowels meet (hiatus: "po-e-ta", "dí-a"). Numbers ~ read aloud. */
function syllables(word: string): number {
  if (/^\d+$/.test(word)) return word.length <= 2 ? 2 : word.length;
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, "").replace(/y$/, "i");
  if (!w) return 0;
  let n = 0;
  let prev: string | null = null;
  for (const ch of w) {
    if (VOWEL.test(ch)) {
      if (prev === null || (STRONG.has(ch) && STRONG.has(prev))) n++;
      prev = ch;
    } else prev = null;
  }
  return Math.max(1, n);
}

const wordsOf = (s: string) =>
  s
    .split(/[\s–—/-]+/)
    .map((w) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""))
    .filter((w) => /[\p{L}\d]/u.test(w));

function sentencesOf(block: string): string[] {
  const text = /[.!?]\s*$/.test(block) ? block : `${block}.`;
  return text.split(/(?<=[.!?])\s+/).filter((s) => wordsOf(s).length > 0);
}

/** Szigriszt-Pazos perspicuity (INFLESZ scale): 65-80 "bastante fácil", 55-65 "normal". */
function inflesz(blocksIn: readonly string[]): number {
  let sentences = 0;
  let words = 0;
  let syl = 0;
  for (const b of blocksIn) {
    for (const s of sentencesOf(b)) {
      const ws = wordsOf(s);
      sentences++;
      words += ws.length;
      syl += ws.reduce((sum, w) => sum + syllables(w), 0);
    }
  }
  return 206.835 - 62.3 * (syl / words) - words / sentences;
}

describe("Spanish reading level", () => {
  it("counts syllables the way Spanish splits them", () => {
    expect(["día", "ciudad", "poeta", "país", "respiración", "cuídate", "que", "hoy", "ahora", "creo"].map(syllables)).toEqual([
      2, 2, 3, 2, 4, 3, 1, 1, 3, 2,
    ]);
  });

  it("keeps every handout in the 'fairly easy' band (INFLESZ >= 65) and the set at 70 or more", () => {
    const prose = (h: Handout) => {
      const es = h.es;
      if (!es) return [];
      return [es.intro, ...es.sections.flatMap((s) => [...(s.body ? [s.body] : []), ...(s.steps ?? [])]), es.safetyNote];
    };
    for (const h of handouts) expect(inflesz(prose(h)), h.id).toBeGreaterThanOrEqual(65);
    expect(inflesz(handouts.flatMap(prose))).toBeGreaterThanOrEqual(70);
  });
});

describe("localizeHandout", () => {
  const pmr = handouts.find((h) => h.id === "pmr-homework");
  if (!pmr) throw new Error("pmr-homework missing");

  it("uses the translation for Spanish and keeps non-text fields from the original", () => {
    const es = localizeHandout(pmr, "es");
    expect(es.lang).toBe("es");
    expect(es.title).toBe(pmr.es?.title);
    expect(es.practiceLog?.rows).toBe(pmr.practiceLog?.rows);
    expect(es.practiceLog?.columns).toEqual(pmr.es?.practiceLog?.columns);
    expect(es.translatedBy).toMatch(/PENDING/);
  });

  it("falls back to English when a handout has no translation", () => {
    const { es: _es, ...rest } = pmr;
    const englishOnly = rest as Handout;
    const en = localizeHandout(englishOnly, "es");
    expect(en.lang).toBe("en");
    expect(en.title).toBe(pmr.title);
    expect(en.translatedBy).toBeUndefined();
    expect(handoutLangs(englishOnly)).toEqual(["en"]);
  });
});
