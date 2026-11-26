/**
 * Pure helpers behind the Phase 1 UI: crisis-number parsing, caret mapping after PHI redaction,
 * the "Why suggested" arithmetic (must reproduce the engine's score), and the de-identified
 * example vignettes (no identifiers, and they still produce the intended suggestions).
 */
import { describe, expect, it } from "vitest";
import { conditions, crisisLines, lexicon } from "@/lib/content";
import { matchSymptoms } from "@/lib/matcher";
import { scrubPHI } from "@/lib/phi-scrubber";
import { scoreConditions } from "@/lib/scoring";
import type { DurationBand, ScoringInput, TriState } from "@/lib/types";
import { crisisCanText, crisisNumber, emergencyNumbers, findCountry } from "@/components/crisis/crisis-data";
import { mapCaret } from "@/components/symptoms/use-scrubbed-field";
import { explainScore } from "@/components/diagnoses/explain";
import { EXAMPLES } from "@/components/symptoms/symptom-meta";

describe("crisis-data", () => {
  it("parses a dialable number for every listed country", () => {
    for (const c of crisisLines.countries) {
      expect(crisisNumber(c), c.country).toMatch(/^\d{3,8}$/);
      expect(emergencyNumbers(c).length, c.country).toBeGreaterThan(0);
    }
  });
  it("handles the US, Canada, UK and multi-number emergency entries", () => {
    const us = findCountry("US")!;
    expect(crisisNumber(us)).toBe("988");
    expect(crisisCanText(us)).toBe(true);
    expect(crisisNumber(findCountry("CA")!)).toBe("988");
    expect(crisisNumber(findCountry("GB")!)).toBe("116123");
    expect(crisisCanText(findCountry("GB")!)).toBe(false);
    expect(emergencyNumbers(findCountry("IE")!)).toEqual(["112", "999"]);
    expect(findCountry("OTHER")).toBeUndefined();
  });
});

describe("mapCaret", () => {
  it("keeps the caret after the same characters once identifiers become placeholders", () => {
    const text = "Call 555-123-4567 today";
    const { clean, findings } = scrubPHI(text);
    expect(findings.length).toBeGreaterThan(0);
    const caret = text.indexOf(" today");
    expect(clean.slice(mapCaret(caret, findings))).toBe(" today");
    expect(mapCaret(0, findings)).toBe(0);
  });
  it("moves a caret inside a redacted span to the end of its placeholder", () => {
    const text = "Call 555-123-4567 today";
    const { clean, findings } = scrubPHI(text);
    const inside = text.indexOf("123");
    const pos = mapCaret(inside, findings);
    expect(clean.slice(0, pos).endsWith("]")).toBe(true);
  });
});

describe("example vignettes", () => {
  const expected: Record<string, string[]> = {
    "panic-agoraphobia": ["panic-disorder", "agoraphobia"],
    "worry-low-mood": ["generalized-anxiety-disorder", "major-depressive-disorder"],
    "trauma-nightmares": ["ptsd"],
  };
  for (const ex of EXAMPLES) {
    it(`${ex.id}: contains no identifiers and suggests the intended conditions`, () => {
      expect(scrubPHI(ex.text).findings).toEqual([]);
      const ids = matchSymptoms(ex.text, lexicon.symptoms).matches.map((m) => m.symptomId);
      const r = scoreConditions(
        { symptomIds: ids, duration: "unknown", impairment: "unknown", substancePossible: "unknown", medicalPossible: "unknown" },
        conditions,
        lexicon.symptoms,
      );
      expect(r.status).toBe("ok");
      const shown = r.suggestions.map((s) => s.conditionId);
      for (const id of expected[ex.id] ?? []) expect(shown).toContain(id);
    });
  }
});

describe("explainScore", () => {
  const durations: DurationBand[] = ["unknown", "lt2w", "1to6m", "gte6m"];
  const tri: TriState[] = ["unknown", "yes", "no"];
  it("reproduces the engine score for every suggestion and context combination", () => {
    let checked = 0;
    for (const ex of EXAMPLES) {
      const ids = matchSymptoms(ex.text, lexicon.symptoms).matches.map((m) => m.symptomId);
      for (const duration of durations)
        for (const impairment of tri)
          for (const substancePossible of tri)
            for (const medicalPossible of tri) {
              const ctx: Omit<ScoringInput, "symptomIds"> = { duration, impairment, substancePossible, medicalPossible };
              const r = scoreConditions({ symptomIds: ids, ...ctx }, conditions, lexicon.symptoms);
              for (const s of r.suggestions) {
                const cond = conditions.find((c) => c.id === s.conditionId)!;
                const ex2 = explainScore(cond, s, ctx);
                const product = ex2.gates.reduce((n, g) => n * g.multiplier, 1);
                expect(Math.min(100, Math.max(0, Math.round(ex2.base * product)))).toBe(ex2.raw);
                // The engine's score is the raw score, or a hold below it that the flags explain.
                expect(ex2.heldAt ?? ex2.raw).toBe(s.score);
                if (ex2.heldAt !== undefined) {
                  expect(ex2.heldAt).toBeLessThan(ex2.raw);
                  expect(ex2.holdReasons.length).toBeGreaterThan(0);
                }
                checked++;
              }
            }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
