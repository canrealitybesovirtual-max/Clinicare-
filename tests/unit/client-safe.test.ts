/**
 * Client-mode text limits (G3, src/lib/client-safe.ts and src/components/client/plain-text.ts): diagnosis words,
 * ICD-10-CM and ICD-11 codes and scoring words are caught in English and Spanish; ordinary client wording,
 * crisis numbers and vitamins are not.
 */
import { describe, expect, it } from "vitest";
import { allConditions } from "@/lib/library";
import { clientSafeSources, isClientSafeText } from "@/lib/client-safe";
import { firstPlainSafe, isPlainSafe } from "@/components/client/plain-text";

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

  it("keeps only sources whose title and publisher are both safe", () => {
    const kept = clientSafeSources([
      { title: "Breathing basics", publisher: "Health Agency", url: "https://example.org/a" },
      { title: "Insomnia (G47.00) care", publisher: "Health Agency", url: "https://example.org/b" },
    ]);
    expect(kept.map((s) => s.url)).toEqual(["https://example.org/a"]);
  });
});

describe("isPlainSafe (Spanish and extra English diagnosis words)", () => {
  it("catches Spanish diagnosis and scoring words", () => {
    for (const t of ["Trastorno de ansiedad", "depresión", "ataque de pánico", "fobias", "diagnóstico", "insomnio", "puntuación", "gravedad", "TEPT", "TOC"]) {
      expect(isPlainSafe(t), t).toBe(false);
    }
  });

  it("lets plain Spanish through", () => {
    for (const t of ["Preocupación y nervios", "Llame o envíe un mensaje de texto al 988", "Cómo dormir mejor"]) {
      expect(isPlainSafe(t), t).toBe(true);
    }
  });

  it("picks the first safe title, or none", () => {
    expect(firstPlainSafe(["Bipolar Disorder", "", "  Mood changes  "])).toBe("Mood changes");
    expect(firstPlainSafe(["Insomnia", "Trastorno del sueño"])).toBeNull();
  });
});
