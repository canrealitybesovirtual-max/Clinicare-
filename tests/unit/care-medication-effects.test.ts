import { describe, expect, it } from "vitest";
import effectsJson from "@content/care/medication-effects.json";
import { MEDICATIONS } from "@/lib/schemas-medications";
import {
  MEDICATION_EFFECTS,
  MedicationEffectsFileSchema,
  PSYCH_EFFECTS,
  PSYCH_EFFECT_LABELS,
  medicationEffectProblems,
  medicationEffectsFile,
} from "@/lib/schemas-care";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import { labelMentions } from "@/components/medications/label-mentions";

describe("content/care/medication-effects.json", () => {
  it("validates with governance and has no cross-file problems", () => {
    expect(medicationEffectsFile.license).toBe("original");
    expect(medicationEffectsFile.lastVerified).toBe("2026-11-27");
    expect(medicationEffectsFile.reviewedBy).toBe("PENDING");
    expect(medicationEffectProblems()).toEqual([]);
    for (const e of MEDICATION_EFFECTS) {
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      for (const s of [...e.sources, ...e.links]) expect(s.url, e.id).toMatch(/^https:\/\//);
    }
  });

  it("covers the planned examples, outside and inside psychiatry", () => {
    const ids = MEDICATION_EFFECTS.map((e) => e.id);
    for (const id of ["montelukast", "isotretinoin", "corticosteroids", "levetiracetam", "alpha-interferons", "mefloquine"]) expect(ids).toContain(id);
  });

  it("rejects quotes, unknown fields and duplicate ids", () => {
    const quoted = structuredClone(effectsJson) as { effects: { summary: string }[] };
    quoted.effects[0]!.summary = 'The label says "serious events" happen in many people taking it.';
    expect(MedicationEffectsFileSchema.safeParse(quoted).success).toBe(false);
    const extra = structuredClone(effectsJson) as { effects: Record<string, unknown>[] };
    extra.effects[0]!.dose = "x";
    expect(MedicationEffectsFileSchema.safeParse(extra).success).toBe(false);
    const dup = structuredClone(effectsJson) as { effects: unknown[] };
    dup.effects.push(structuredClone(dup.effects[0]));
    expect(MedicationEffectsFileSchema.safeParse(dup).success).toBe(false);
  });

  it("flags unknown medication ids and SUD medicines without the Part 2 flag (G6)", () => {
    const bad = structuredClone(medicationEffectsFile);
    bad.effects[0]!.medicationIds = ["not-a-medicine"];
    const gaba = bad.effects.find((e) => e.medicationIds.includes("gabapentin"))!;
    gaba.sud = false;
    const problems = medicationEffectProblems(bad);
    expect(problems.some((p) => /unknown medication not-a-medicine/.test(p))).toBe(true);
    expect(problems.some((p) => /gabapentin.*sud is false/.test(p))).toBe(true);
  });

  it("gives no doses or stopping instructions, and tags substance wording (G4, G6)", () => {
    for (const e of MEDICATION_EFFECTS) {
      const text = [e.medicine, e.usedFor, e.summary].join(" ");
      expect(text, e.id).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?)\b/i);
      expect(text, e.id).not.toMatch(/\b(?:stop taking|reduce the dose|switch to)\b/i);
      if (mentionsSubstanceUse(text)) expect(e.sud, e.id).toBe(true);
    }
    expect(MEDICATIONS.length).toBeGreaterThan(50);
    for (const p of PSYCH_EFFECTS) expect(PSYCH_EFFECT_LABELS[p].length).toBeGreaterThan(3);
  });
});

describe("label mentions", () => {
  it("finds sentences about mood, behavior, sleep or thinking, in label order", () => {
    const text =
      "Serious neuropsychiatric events have been reported. These included agitation, depression and suicidal thoughts. Take with food. Hallucinations were rare. Insomnia may occur.";
    const m = labelMentions(text);
    expect(m.map((x) => x.sentence)).toEqual([
      "These included agitation, depression and suicidal thoughts.",
      "Hallucinations were rare.",
      "Insomnia may occur.",
    ]);
    expect(m[0]!.effects).toEqual(expect.arrayContaining(["anxiety-agitation", "low-mood", "suicidal-thoughts"]));
    expect(m[1]!.effects).toEqual(["psychosis"]);
  });

  it("does not read respiratory or myocardial depression as low mood", () => {
    expect(labelMentions("Concomitant use with opioids may result in respiratory depression.")).toEqual([]);
    expect(labelMentions("It may depress myocardial contractility.")).toEqual([]);
    expect(labelMentions("Monitor for depression.")[0]!.effects).toEqual(["low-mood"]);
  });

  it("handles empty sections and caps the list", () => {
    expect(labelMentions(null)).toEqual([]);
    expect(labelMentions("")).toEqual([]);
    expect(labelMentions(Array.from({ length: 20 }, () => "Anxiety was reported.").join(" "), 3)).toHaveLength(3);
  });
});
