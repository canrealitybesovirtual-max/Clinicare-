/**
 * Client-mode text limits (G3, src/lib/client-safe.ts): diagnosis words, ICD-10-CM and ICD-11 codes and scoring
 * words are caught in English and Spanish; ordinary client wording, crisis numbers and vitamins are not. Every
 * client handout PDF (English and Spanish) credits its sources without naming a condition.
 */
import { describe, expect, it } from "vitest";
import { allConditions, allHandouts } from "@/lib/library";
import { clientSafeSources, clientSourceCredits, firstClientSafe, isClientSafeText } from "@/lib/client-safe";
import { handoutPdfLines } from "@/lib/pdf";

describe("isClientSafeText", () => {
  it("catches every ICD-10-CM and ICD-11 code in the knowledge base", () => {
    const codes = allConditions.flatMap((c) => [...c.icd10cm, ...c.icd11].map((x) => x.code));
    expect(codes.length).toBeGreaterThan(20);
    for (const code of codes) expect(isClientSafeText(`See ${code} for details`), code).toBe(false);
  });

  it("catches non-F codes such as sleep and social-context codes", () => {
    for (const code of ["G47.00", "G47.0", "Z63.4", "F41", "F41.1", "6A70", "6B00", "7A00", "7A01", "7B01"]) {
      expect(isClientSafeText(`code ${code}`), code).toBe(false);
    }
  });

  it("catches diagnosis and scoring words", () => {
    for (const t of ["Generalized anxiety disorder", "a diagnosis", "PTSD care", "your score", "severity bands", "DSM-5-TR"]) {
      expect(isClientSafeText(t), t).toBe(false);
    }
  });

  it("lets ordinary client wording through", () => {
    for (const t of ["Call or text 988", "Open 24/7", "Vitamin B12 and your health", "COVID-19 and stress", "Breathing basics", "Step 3 of 5"]) {
      expect(isClientSafeText(t), t).toBe(true);
    }
  });

  it("keeps safe sources, reduces condition-named ones to a publisher credit on the home page, and drops unsafe publishers", () => {
    const kept = clientSafeSources([
      { title: "Breathing basics", publisher: "Health Agency", url: "https://example.org/a", year: 2020 },
      { title: "Insomnia (G47.00) care", publisher: "Health Agency", url: "https://example.org/b" },
      { title: "Sleep tips", publisher: "Health Agency", url: "https://example.org/topics/bipolar-disorder" },
      { title: "Sleep tips", publisher: "Depression Society", url: "https://example.net/c" },
      { title: "Coping", publisher: "Eating Help", url: "https://www.eating-disorders.example/" },
    ]);
    expect(kept).toEqual([
      { title: "Breathing basics", publisher: "Health Agency", url: "https://example.org/a", year: 2020 },
      { title: "Health Agency", publisher: "Health Agency", url: "https://example.org/" },
    ]);
    expect(clientSafeSources(kept)).toEqual(kept);
  });
});

describe("isClientSafeText (Spanish and extra English diagnosis words)", () => {
  it("catches Spanish diagnosis and scoring words", () => {
    for (const t of ["Trastorno de ansiedad", "depresión", "ataque de pánico", "fobias", "diagnóstico", "insomnio", "puntuación", "gravedad", "TEPT", "TOC"]) {
      expect(isClientSafeText(t), t).toBe(false);
    }
  });

  it("catches every condition name in the knowledge base, and its short form without 'disorder'", () => {
    // Everyday words left as they are on purpose: "alcohol use" is itself a client topic.
    const everyday = new Set(["Adjustment", "Alcohol use"]);
    for (const c of allConditions) {
      expect(isClientSafeText(c.name), c.name).toBe(false);
      const short = c.name.replace(/\s*disorder\b/i, "").trim();
      if (!everyday.has(short)) expect(isClientSafeText(short), short).toBe(false);
    }
  });

  it("catches shorthand for the newer conditions in English and Spanish", () => {
    for (const t of [
      "Anorexia", "Bulimia", "Binge eating", "Borderline", "Hoarding", "Body dysmorphia", "Cyclothymia", "Mania",
      "Hypochondria", "Attention deficit", "Opioid use and your health", "Cannabis use", "Trastorno por atracón",
      "Dismorfia corporal", "Ciclotimia", "Hipocondría", "Déficit de atención", "TDAH", "Acumulación compulsiva",
    ]) {
      expect(isClientSafeText(t), t).toBe(false);
    }
  });

  it("lets plain Spanish through", () => {
    for (const t of ["Preocupación y nervios", "Llame o envíe un mensaje de texto al 988", "Cómo dormir mejor"]) {
      expect(isClientSafeText(t), t).toBe(true);
    }
  });

  it("picks the first safe title, or none", () => {
    expect(firstClientSafe(["Bipolar Disorder", "", "  Mood changes  "])).toBe("Mood changes");
    expect(firstClientSafe(["Insomnia", "Trastorno del sueño"])).toBeNull();
  });
});

describe("client handout PDFs credit sources without naming a condition", () => {
  // Condition names from content/conditions/*.json, their short forms without "disorder", and the Spanish names
  // a Spanish source title would use. "Alcohol use" and "Adjustment" are everyday words on purpose.
  const everyday = new Set(["adjustment", "alcohol use"]);
  const names = [
    ...new Set(
      allConditions.flatMap((c) => {
        const full = c.name.toLowerCase();
        const short = full.replace(/\s*disorder\b/, "").trim();
        return everyday.has(short) ? [full] : [full, short];
      }),
    ),
  ];
  const spanish = ["trastorno", "esquizofrenia", "bipolar", "tdah", "anorexia", "bulimia", "fobia", "pánico", "depresión", "ansiedad"];
  const CREDIT_START = { en: "Based on information from:", es: "Basado en información de:" } as const;
  const CREDIT_END = { en: "Talk with your counselor", es: "Hable con su consejero" } as const;

  /** The credit paragraph of one handout PDF, its wrapped lines joined back into one string. */
  function creditText(lines: string[], lang: "en" | "es"): string {
    const start = lines.findIndex((l) => l.startsWith(CREDIT_START[lang]));
    if (start < 0) return "";
    const end = lines.findIndex((l, i) => i > start && l.startsWith(CREDIT_END[lang]));
    return lines.slice(start, end < 0 ? undefined : end).join(" ").toLowerCase();
  }

  it("covers every handout, with credits on most of them", () => {
    expect(allHandouts.length).toBeGreaterThan(30);
    const withCredits = allHandouts.filter((h) => clientSourceCredits(h.sources).length > 0);
    expect(withCredits.length).toBeGreaterThan(allHandouts.length / 2);
  });

  for (const lang of ["en", "es"] as const) {
    it(`no condition name in any ${lang} credit line`, () => {
      for (const h of allHandouts) {
        const credits = creditText(handoutPdfLines(h, lang), lang === "es" && h.es ? "es" : "en");
        for (const name of [...names, ...spanish]) expect(credits.includes(name), `${h.id} (${lang}): ${name}`).toBe(false);
        expect(isClientSafeText(credits), `${h.id} (${lang})`).toBe(true);
      }
    });
  }

  it("still credits the publisher when a title names a condition", () => {
    const credits = clientSourceCredits([
      { title: "Psychosis and schizophrenia in adults", publisher: "NICE", url: "https://example.org/a", year: 2014 },
      { title: "Family intervention for schizophrenia", publisher: "Cochrane", url: "https://example.org/b" },
    ]);
    expect(credits).toEqual(["NICE", "Cochrane"]);
  });
});
