import { describe, expect, it } from "vitest";
import gad7Json from "@content/measures/gad-7.json";
import phq9Json from "@content/measures/phq-9.json";
import licensesJson from "@content/licenses.json";
import { MeasureSchema, type Measure } from "@/lib/schemas";
import { bandFor, emptyAnswers, scoreMeasure } from "@/lib/measures";

const gad7: Measure = MeasureSchema.parse(gad7Json);
const phq9: Measure = MeasureSchema.parse(phq9Json);

/** Answers that sum to `total` (fills items left to right with the max value, remainder in the next item). */
function answersSumming(m: Measure, total: number): number[] {
  const maxV = Math.max(...m.options.map((o) => o.value));
  let left = total;
  return m.items.map(() => {
    const v = Math.min(maxV, left);
    left -= v;
    return v;
  });
}

describe("measure content", () => {
  it.each([
    ["GAD-7", gad7, 7, 21],
    ["PHQ-9", phq9, 9, 27],
  ] as const)("%s has the expected structure", (_name, m, n, max) => {
    expect(m.items.map((i) => i.id)).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)));
    expect(m.options).toEqual([
      { value: 0, label: "Not at all" },
      { value: 1, label: "Several days" },
      { value: 2, label: "More than half the days" },
      { value: 3, label: "Nearly every day" },
    ]);
    expect(m.instructions.startsWith("Over the last 2 weeks, how often have you been bothered by")).toBe(true);
    expect(m.functionalItem?.options).toEqual([
      "Not difficult at all",
      "Somewhat difficult",
      "Very difficult",
      "Extremely difficult",
    ]);
    expect(m.scoring).toMatchObject({ min: 0, max });
    expect(m.reviewedBy).toBe("PENDING");
    expect(m.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.sources.length).toBeGreaterThanOrEqual(1);
    expect(m.copyright).toContain("No permission required to reproduce, translate, display or distribute");
    const lic = (licensesJson.items as Record<string, { status: string }>)[m.licenseKey];
    expect(lic?.status).toBe("confirmed");
    for (const b of m.scoring.bands) expect(b.clinicianNote).toMatch(/clinical judgment decides/);
  });

  it("bands tile the score range with no gaps or overlaps", () => {
    for (const m of [gad7, phq9]) {
      for (let t = m.scoring.min; t <= m.scoring.max; t++) expect(bandFor(m, t), `${m.id} ${t}`).not.toBeNull();
      expect(bandFor(m, m.scoring.max + 1)).toBeNull();
      expect(bandFor(m, -1)).toBeNull();
    }
  });

  it("has the LOINC codes and PHQ-9 item 9 risk rule", () => {
    expect(gad7.loinc).toEqual({ panel: "69737-5", total: "70274-6" });
    expect(phq9.loinc).toEqual({ panel: "44249-1", total: "44261-6" });
    expect(gad7.riskItems).toEqual([]);
    expect(phq9.riskItems).toHaveLength(1);
    expect(phq9.riskItems[0]).toMatchObject({ itemId: "9", threshold: 1 });
    expect(phq9.riskItems[0]?.message).toMatch(/C-SSRS/);
    expect(phq9.riskItems[0]?.message).toMatch(/does not assess or decide risk/);
  });
});

describe("scoreMeasure: GAD-7 bands", () => {
  it.each([
    [0, "Minimal anxiety"],
    [4, "Minimal anxiety"],
    [5, "Mild anxiety"],
    [9, "Mild anxiety"],
    [10, "Moderate anxiety"],
    [14, "Moderate anxiety"],
    [15, "Severe anxiety"],
    [21, "Severe anxiety"],
  ])("total %i => %s", (total, label) => {
    const s = scoreMeasure(gad7, answersSumming(gad7, total));
    expect(s.total).toBe(total);
    expect(s.complete).toBe(true);
    expect(s.answered).toBe(7);
    expect(s.band?.label).toBe(label);
    expect(s.riskFlags).toEqual([]);
  });

  it("mentions the cutoff of 10 in the moderate band note", () => {
    expect(scoreMeasure(gad7, answersSumming(gad7, 10)).band?.clinicianNote).toMatch(/10/);
  });
});

describe("scoreMeasure: PHQ-9 bands", () => {
  it.each([
    [0, "None-minimal"],
    [4, "None-minimal"],
    [5, "Mild"],
    [9, "Mild"],
    [10, "Moderate"],
    [14, "Moderate"],
    [15, "Moderately severe"],
    [19, "Moderately severe"],
    [20, "Severe"],
    [27, "Severe"],
  ])("total %i => %s", (total, label) => {
    const s = scoreMeasure(phq9, answersSumming(phq9, total));
    expect(s.total).toBe(total);
    expect(s.complete).toBe(true);
    expect(s.band?.label).toBe(label);
  });
});

describe("scoreMeasure: edge cases", () => {
  it("all zero", () => {
    const s = scoreMeasure(phq9, Array(9).fill(0));
    expect(s).toEqual({
      total: 0,
      answered: 9,
      complete: true,
      band: { label: "None-minimal", clinicianNote: phq9.scoring.bands[0]?.clinicianNote },
      riskFlags: [],
    });
  });

  it("all max (PHQ-9 raises the item 9 flag)", () => {
    const s = scoreMeasure(phq9, Array(9).fill(3));
    expect(s.total).toBe(27);
    expect(s.band?.label).toBe("Severe");
    expect(s.riskFlags).toEqual([{ itemId: "9", message: phq9.riskItems[0]?.message }]);
    const g = scoreMeasure(gad7, Array(7).fill(3));
    expect(g.total).toBe(21);
    expect(g.band?.label).toBe("Severe anxiety");
  });

  it("incomplete => band null, partial total and count", () => {
    const s = scoreMeasure(gad7, [3, 3, null, 2]);
    expect(s).toMatchObject({ total: 8, answered: 3, complete: false, band: null });
    expect(scoreMeasure(gad7, emptyAnswers(gad7))).toMatchObject({ total: 0, answered: 0, complete: false, band: null });
    expect(scoreMeasure(gad7, [])).toMatchObject({ answered: 0, complete: false, band: null });
  });

  it("emptyAnswers has one null per item", () => {
    expect(emptyAnswers(phq9)).toEqual(Array(9).fill(null));
  });

  it("invalid values throw", () => {
    expect(() => scoreMeasure(gad7, [4])).toThrow(RangeError);
    expect(() => scoreMeasure(gad7, [-1])).toThrow(RangeError);
    expect(() => scoreMeasure(gad7, [1.5])).toThrow(RangeError);
    expect(() => scoreMeasure(gad7, [Number.NaN])).toThrow(RangeError);
    expect(() => scoreMeasure(gad7, ["2" as unknown as number])).toThrow(RangeError);
    expect(() => scoreMeasure(gad7, Array(8).fill(0))).toThrow(RangeError);
  });

  it("PHQ-9 item 9 flags at 1 and not at 0, even when incomplete", () => {
    const at = (v: number | null) => {
      const a: (number | null)[] = emptyAnswers(phq9);
      a[8] = v;
      return a;
    };
    const flagged = scoreMeasure(phq9, at(1));
    expect(flagged.complete).toBe(false);
    expect(flagged.band).toBeNull();
    expect(flagged.riskFlags.map((r) => r.itemId)).toEqual(["9"]);
    expect(scoreMeasure(phq9, at(2)).riskFlags).toHaveLength(1);
    expect(scoreMeasure(phq9, at(3)).riskFlags).toHaveLength(1);
    expect(scoreMeasure(phq9, at(0)).riskFlags).toEqual([]);
    expect(scoreMeasure(phq9, at(null)).riskFlags).toEqual([]);
    // complete with item 9 = 0: no flag
    expect(scoreMeasure(phq9, [3, 3, 3, 3, 3, 3, 3, 3, 0]).riskFlags).toEqual([]);
  });
});
