import { describe, expect, it } from "vitest";
import { EMPTY_MESSAGE, SCORING, scoreConditions } from "@/lib/scoring";
import type { Condition } from "@/lib/schemas";
import type { DurationBand, ScoringInput, Suggestion, TriState } from "@/lib/types";
import { cloneCondition, fxCondition, fxConditions, fxSymptoms, input } from "../fixtures";

const score = (inp: ScoringInput, conds: Condition[] = fxConditions) => scoreConditions(inp, conds, fxSymptoms);
const byId = (list: Suggestion[], id: string) => {
  const s = list.find((x) => x.conditionId === id);
  if (!s) throw new Error(`no suggestion ${id}`);
  return s;
};
const flagTypes = (s: Suggestion) => s.flags.map((f) => f.type);

/** panic + fear + palpitations: fx-surge = 100*(0.7*9/9 + 0.3*2/4) = 85; fx-avoid = 100*(0.7*3/8 + 0.3*3/3) = 56.25. */
const SURGE_IDS = ["panic-attacks", "fear-of-attacks", "palpitations"];

describe("scoreConditions: formula", () => {
  it("computes the documented weighted score", () => {
    const r = score(input(SURGE_IDS));
    expect(r.status).toBe("ok");
    expect(r.suggestions.map((s) => [s.conditionId, s.score, s.strength])).toEqual([
      ["fx-surge", 85, "strong"],
      ["fx-avoid", 56, "moderate"],
    ]);
  });

  it("rounds to an integer (low mood: 100*(0.7*5/10 + 0.3*2/7) = 43.57 -> 44)", () => {
    const s = byId(score(input(["depressed-mood", "insomnia"])).suggestions, "fx-low-mood");
    expect(s.score).toBe(44);
    expect(s.strength).toBe("moderate");
  });

  it("uses core weight only when a condition has no associated features (A = 0)", () => {
    const coreOnly = cloneCondition("fx-surge", "fx-core-only", "Core only (fixture)", {
      minCore: 1,
      features: [
        { symptomId: "panic-attacks", kind: "core", weight: 5 },
        { symptomId: "fear-of-attacks", kind: "core", weight: 4 },
        { symptomId: "palpitations", kind: "core", weight: 2 },
        { symptomId: "restlessness", kind: "core", weight: 1 },
      ],
    });
    const r = score(input(["panic-attacks", "palpitations"]), [coreOnly]);
    expect(r.suggestions[0]?.score).toBe(58); // 100 * 7/12 = 58.33
  });

  it("applies the strength thresholds (65 strong, 40 moderate, below possible)", () => {
    const c = cloneCondition("fx-surge", "fx-thresholds", "Thresholds (fixture)", {
      minCore: 1,
      features: [
        { symptomId: "panic-attacks", kind: "core", weight: 5 },
        { symptomId: "fear-of-attacks", kind: "core", weight: 5 },
        { symptomId: "palpitations", kind: "core", weight: 5 },
        { symptomId: "restlessness", kind: "core", weight: 3 },
        { symptomId: "insomnia", kind: "core", weight: 2 },
      ],
    });
    const at = (symptomIds: string[]) => score(input(symptomIds), [c]).suggestions[0];
    expect(at(["panic-attacks", "fear-of-attacks", "restlessness"])).toMatchObject({ score: 65, strength: "strong" });
    expect(at(["fear-of-attacks", "restlessness"])).toMatchObject({ score: 40, strength: "moderate" });
    expect(at(["fear-of-attacks", "insomnia"])).toMatchObject({ score: 35, strength: "possible" });
  });

  it("skips conditions with no matched core feature", () => {
    const r = score(input(["panic-attacks", "palpitations", "insomnia", "fatigue"]));
    // panic is core only in fx-surge; insomnia/fatigue are associated in fx-low-mood; fx-avoid has no core hit.
    expect(r.suggestions.map((s) => s.conditionId)).toEqual(["fx-surge"]);
  });

  it("treats duplicate input ids as one", () => {
    expect(score(input([...SURGE_IDS, "panic-attacks", "palpitations"]))).toEqual(score(input(SURGE_IDS)));
  });
});

describe("scoreConditions: minCore cap", () => {
  it("caps strength at possible and flags partial-core when fewer than minCore core features match", () => {
    // fx-surge: core 5/9 -> 38.9, associated 4/4 -> 30, total 69 (would be strong), but minCore is 2.
    const s = byId(score(input(["panic-attacks", "palpitations", "restlessness", "insomnia"])).suggestions, "fx-surge");
    expect(s.score).toBe(69);
    expect(s.strength).toBe("possible");
    expect(s.flags[0]).toEqual({
      type: "partial-core",
      message: "Only 1 of the 2 key features is present (at least 2 expected); gather more information.",
    });
  });

  it("does not flag partial-core once minCore is reached", () => {
    expect(flagTypes(byId(score(input(SURGE_IDS)).suggestions, "fx-surge"))).not.toContain("partial-core");
  });
});

describe("scoreConditions: gates", () => {
  it("penalises a duration below the gate (x0.6) and cites the note", () => {
    const s = byId(score(input(SURGE_IDS, { duration: "2to4w" })).suggestions, "fx-surge");
    expect(s.score).toBe(51);
    expect(s.strength).toBe("moderate");
    const flag = s.flags.find((f) => f.type === "duration");
    expect(flag?.message).toContain("2 to 4 weeks");
    expect(flag?.message).toContain(fxCondition("fx-surge").durationGate.note);
  });

  it("does not penalise a duration band that reaches the gate", () => {
    const r = score(input(SURGE_IDS, { duration: "1to6m" }));
    expect(byId(r.suggestions, "fx-surge").score).toBe(85);
    expect(flagTypes(byId(r.suggestions, "fx-surge"))).not.toContain("duration");
    // ...while fx-avoid (26-week gate) is penalised by the same band: 56.25 * 0.6 = 33.75.
    expect(byId(r.suggestions, "fx-avoid").score).toBe(34);
  });

  it("penalises the shortest band against a 2-week gate", () => {
    const s = byId(score(input(["depressed-mood", "anhedonia"], { duration: "lt2w" })).suggestions, "fx-low-mood");
    expect(s.score).toBe(42); // 70 * 0.6
    expect(flagTypes(s)).toContain("duration");
  });

  it("adds an info duration flag without penalty when duration is unknown", () => {
    const s = byId(score(input(SURGE_IDS, { duration: "unknown" })).suggestions, "fx-surge");
    expect(s.score).toBe(85);
    expect(s.flags.find((f) => f.type === "duration")?.message).toMatch(/not recorded/);
  });

  it("adds no duration flag at all for a pattern without a duration threshold", () => {
    const c = cloneCondition("fx-surge", "fx-no-gate", "No gate (fixture)", {
      durationGate: { minWeeks: 0, note: "Fixture: no duration threshold." },
    });
    for (const duration of ["unknown", "lt2w"] as DurationBand[]) {
      const s = score(input(SURGE_IDS, { duration }), [c]).suggestions[0];
      expect(s?.score).toBe(85);
      expect(s && flagTypes(s)).not.toContain("duration");
    }
  });

  it("penalises impairment 'no' (x0.6) when impairment is required", () => {
    const s = byId(score(input(SURGE_IDS, { impairment: "no" })).suggestions, "fx-surge");
    expect(s.score).toBe(51);
    expect(flagTypes(s)).toContain("impairment");
  });

  it("adds an info impairment flag without penalty when impairment is unknown", () => {
    const s = byId(score(input(SURGE_IDS, { impairment: "unknown" })).suggestions, "fx-surge");
    expect(s.score).toBe(85);
    expect(s.flags.find((f) => f.type === "impairment")?.message).toMatch(/not yet assessed/);
  });

  it("ignores impairment when the pattern does not require it", () => {
    const c = cloneCondition("fx-surge", "fx-no-impairment", "No impairment gate (fixture)", { impairmentRequired: false });
    for (const impairment of ["no", "unknown"] as TriState[]) {
      const s = score(input(SURGE_IDS, { impairment }), [c]).suggestions[0];
      expect(s?.score).toBe(85);
      expect(s && flagTypes(s)).not.toContain("impairment");
    }
  });

  it("penalises a possible substance explanation (x0.75) and lists substance rule-outs", () => {
    const s = byId(score(input(SURGE_IDS, { substancePossible: "yes" })).suggestions, "fx-surge");
    expect(s.score).toBe(64); // 63.75
    expect(s.strength).toBe("moderate");
    expect(s.flags.find((f) => f.type === "substance")?.message).toContain("Stimulant or caffeine effects (fixture)");
  });

  it("penalises a possible medical explanation (x0.75) and lists medical rule-outs", () => {
    const s = byId(score(input(SURGE_IDS, { medicalPossible: "yes" })).suggestions, "fx-surge");
    expect(s.score).toBe(64);
    const msg = s.flags.find((f) => f.type === "medical")?.message ?? "";
    expect(msg).toContain("Thyroid or cardiac causes (fixture)");
    expect(msg).not.toContain("Stimulant");
  });

  it("falls back to a generic rule-out message when a pattern lists none of that type", () => {
    // fx-avoid has only a medical rule-out.
    const s = byId(score(input(SURGE_IDS, { substancePossible: "yes" })).suggestions, "fx-avoid");
    expect(s.flags.find((f) => f.type === "substance")?.message).toMatch(/substance or medication effects/);
  });

  it("does not penalise substance or medical 'unknown' / 'no'", () => {
    for (const v of ["no", "unknown"] as TriState[]) {
      const s = byId(score(input(SURGE_IDS, { substancePossible: v, medicalPossible: v })).suggestions, "fx-surge");
      expect(s.score).toBe(85);
      expect(flagTypes(s)).toEqual([]);
    }
  });

  it("multiplies all gates together", () => {
    const s = byId(
      score(input(SURGE_IDS, { duration: "lt2w", impairment: "no", substancePossible: "yes", medicalPossible: "yes" })).suggestions,
      "fx-surge",
    );
    expect(s.score).toBe(17); // 85 * 0.6 * 0.6 * 0.75 * 0.75 = 17.2
    expect(s.strength).toBe("possible");
    expect(flagTypes(s)).toEqual(["duration", "impairment", "substance", "medical"]);
  });
});

describe("scoreConditions: states", () => {
  it("returns 'empty' with a message when there are no symptoms", () => {
    expect(score(input([]))).toEqual({ status: "empty", suggestions: [], redFlags: [], message: EMPTY_MESSAGE });
  });

  it("returns 'insufficient' when no condition has a core match, without forcing one", () => {
    const r = score(input(["fatigue", "concentration"]));
    expect(r.status).toBe("insufficient");
    expect(r.suggestions).toEqual([]);
    expect(r.message).toMatch(/not enough information/i);
    expect(r.message).toMatch(/do not force a match/);
    expect(r.message).toContain("3 conditions");
  });

  it("returns 'insufficient' when every core match scores below 15", () => {
    // fear only: fx-surge 31.1 * 0.36 = 11.2, fx-avoid 26.25 * 0.36 = 9.45 -> both dropped.
    const r = score(input(["fear-of-attacks"], { duration: "lt2w", impairment: "no" }));
    expect(r.status).toBe("insufficient");
    expect(r.suggestions).toEqual([]);
  });

  it("ignores unknown symptom ids without throwing", () => {
    const r = score(input(["not-in-lexicon"]));
    expect(r.status).toBe("insufficient");
    expect(r.redFlags).toEqual([]);
  });
});

describe("scoreConditions: red flags", () => {
  it("reports red flags even when nothing is suggested", () => {
    const r = score(input(["hearing-voices", "suicidal-ideation"]));
    expect(r.status).toBe("insufficient");
    expect(r.redFlags).toEqual([
      { symptomId: "suicidal-ideation", type: "suicidality", label: "Thoughts of ending one's own life" },
      { symptomId: "hearing-voices", type: "psychosis", label: "Perceptual disturbances such as hearing voices others do not hear" },
    ]);
  });

  it("orders red flags by type regardless of input order", () => {
    const a = score(input(["hearing-voices", "homicidal-ideation", "suicidal-ideation"])).redFlags.map((f) => f.type);
    const b = score(input(["suicidal-ideation", "hearing-voices", "homicidal-ideation"])).redFlags.map((f) => f.type);
    expect(a).toEqual(["suicidality", "homicidality", "psychosis"]);
    expect(b).toEqual(a);
  });

  it("reports red flags alongside suggestions", () => {
    const r = score(input(["depressed-mood", "anhedonia", "suicidal-ideation"]));
    expect(r.status).toBe("ok");
    expect(r.redFlags.map((f) => f.symptomId)).toEqual(["suicidal-ideation"]);
    expect(byId(r.suggestions, "fx-low-mood").matched.map((m) => m.symptomId)).toContain("suicidal-ideation");
  });

  it("has no red flags for ordinary symptoms", () => {
    expect(score(input(SURGE_IDS)).redFlags).toEqual([]);
  });
});

describe("scoreConditions: matched and missing features", () => {
  it("lists matched and missing features with lexicon labels, core first then weight desc", () => {
    const s = byId(score(input(["panic-attacks", "palpitations"])).suggestions, "fx-surge");
    expect(s.matched).toEqual([
      { symptomId: "panic-attacks", label: "Sudden surges of intense fear with strong body alarm", kind: "core", weight: 5 },
      { symptomId: "palpitations", label: "Racing or pounding heartbeat", kind: "associated", weight: 2 },
    ]);
    expect(s.missing.map((m) => [m.symptomId, m.kind, m.weight])).toEqual([
      ["fear-of-attacks", "core", 4],
      ["restlessness", "associated", 1],
      ["insomnia", "associated", 1],
    ]);
    expect(s.missing[0]?.label).toBe("Ongoing apprehension about having further fear surges");
  });

  it("leaves out unmatched members of a group whose slot is already filled", () => {
    const grouped = cloneCondition("fx-surge", "fx-grouped", "Grouped (fixture)", {
      features: [
        { symptomId: "panic-attacks", kind: "core", weight: 5 },
        { symptomId: "fear-of-attacks", kind: "core", weight: 4 },
        { symptomId: "palpitations", kind: "associated", weight: 1, group: "body" },
        { symptomId: "restlessness", kind: "associated", weight: 1, group: "body" },
        { symptomId: "insomnia", kind: "associated", weight: 1 },
      ],
    });
    const s = byId(score(input(["panic-attacks", "palpitations"]), [grouped]).suggestions, "fx-grouped");
    expect(s.matched.map((m) => m.symptomId)).toEqual(["panic-attacks", "palpitations"]);
    // restlessness shares the filled "body" slot, so it would add nothing: not listed as missing.
    expect(s.missing.map((m) => m.symptomId)).toEqual(["fear-of-attacks", "insomnia"]);
    // With the slot empty, every member is still listed.
    const empty = byId(score(input(["panic-attacks", "fear-of-attacks"]), [grouped]).suggestions, "fx-grouped");
    expect(empty.missing.map((m) => m.symptomId)).toEqual(["palpitations", "restlessness", "insomnia"]);
  });

  it("falls back to the id as label when the lexicon lacks the symptom", () => {
    const s = scoreConditions(input(SURGE_IDS), fxConditions, []).suggestions[0];
    expect(s?.matched[0]?.label).toBe("panic-attacks");
  });

  it("copies codes and the DSM pointer from the condition", () => {
    const s = byId(score(input(SURGE_IDS)).suggestions, "fx-surge");
    expect(s.icd10cm).toEqual([{ code: "X00.1", label: "Fixture code, not a real classification" }]);
    expect(s.icd11[0]?.code).toBe("XX01");
    expect(s.dsmPointer).toContain("See DSM-5-TR");
  });
});

describe("scoreConditions: comorbidity notes", () => {
  it("adds notes to both conditions of a pair suggested at moderate or strong", () => {
    const r = score(input(SURGE_IDS));
    expect(byId(r.suggestions, "fx-surge").comorbidityNotes).toEqual([
      "Avoidance pattern (fixture) is also suggested. Fixture: these two patterns are often seen together.",
    ]);
    expect(byId(r.suggestions, "fx-avoid").comorbidityNotes).toEqual([
      "Surge pattern (fixture) is also suggested. Fixture: avoidance often follows repeated surges.",
    ]);
  });

  it("adds no notes when one side is only 'possible'", () => {
    const r = score(input(SURGE_IDS, { duration: "1to6m" })); // fx-avoid drops to 34
    expect(byId(r.suggestions, "fx-avoid").strength).toBe("possible");
    for (const s of r.suggestions) expect(s.comorbidityNotes).toEqual([]);
  });

  it("uses the other condition's note when only one side lists the pair", () => {
    const avoidNoLink = cloneCondition("fx-avoid", "fx-avoid", "Avoidance pattern (fixture)");
    const r = score(input(SURGE_IDS), [fxCondition("fx-surge"), avoidNoLink, fxCondition("fx-low-mood")]);
    expect(byId(r.suggestions, "fx-avoid").comorbidityNotes).toEqual([
      "Surge pattern (fixture) is also suggested. Fixture: these two patterns are often seen together.",
    ]);
  });

  it("adds no notes for unrelated or unlinked comorbidities", () => {
    const r = score(input(["depressed-mood", "anhedonia", "panic-attacks", "fear-of-attacks"]));
    expect(byId(r.suggestions, "fx-low-mood").comorbidityNotes).toEqual([]);
  });
});

describe("scoreConditions: ordering, limits, determinism", () => {
  it("breaks score ties by name, independent of condition order", () => {
    const beta = cloneCondition("fx-surge", "fx-beta", "Beta pattern (fixture)");
    const alpha = cloneCondition("fx-surge", "fx-alpha", "Alpha pattern (fixture)");
    for (const conds of [
      [beta, alpha],
      [alpha, beta],
    ]) {
      expect(score(input(SURGE_IDS), conds).suggestions.map((s) => s.name)).toEqual([
        "Alpha pattern (fixture)",
        "Beta pattern (fixture)",
      ]);
    }
  });

  it("shows at most 7 suggestions", () => {
    const many = Array.from({ length: 10 }, (_, i) => cloneCondition("fx-surge", `fx-clone-${i}`, `Clone ${String(i).padStart(2, "0")}`));
    const r = score(input(SURGE_IDS), many.reverse());
    expect(r.suggestions).toHaveLength(SCORING.maxSuggestions);
    expect(r.suggestions.map((s) => s.name)).toEqual(["Clone 00", "Clone 01", "Clone 02", "Clone 03", "Clone 04", "Clone 05", "Clone 06"]);
  });

  it("is deterministic: same result for shuffled symptoms and conditions", () => {
    const ids = ["panic-attacks", "fear-of-attacks", "avoid-leaving-home", "palpitations", "depressed-mood", "insomnia"];
    const a = score(input(ids, { duration: "1to6m", impairment: "unknown" }));
    const b = score(input([...ids].reverse(), { duration: "1to6m", impairment: "unknown" }), [...fxConditions].reverse());
    expect(b).toEqual(a);
    expect(score(input(ids, { duration: "1to6m", impairment: "unknown" }))).toEqual(a);
  });

  it("does not mutate its inputs", () => {
    const conds = structuredClone(fxConditions);
    const syms = structuredClone(fxSymptoms);
    const inp = input([...SURGE_IDS, "avoid-leaving-home"], { substancePossible: "yes" });
    const inpCopy = structuredClone(inp);
    scoreConditions(inp, conds, syms);
    expect(conds).toEqual(fxConditions);
    expect(syms).toEqual(fxSymptoms);
    expect(inp).toEqual(inpCopy);
  });

  it("keeps scores within 0-100 and every invariant over many generated inputs", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const durations: DurationBand[] = ["unknown", "lt2w", "2to4w", "1to6m", "gte6m"];
    const tri: TriState[] = ["yes", "no", "unknown"];
    const banned = /\b(diagnosed|diagnosis is|meets|confirmed|definitely|certainly)\b/i;
    for (let i = 0; i < 300; i++) {
      const symptomIds = fxSymptoms.filter(() => rand() < 0.35).map((s) => s.id);
      const r = score({
        symptomIds,
        duration: pick(durations),
        impairment: pick(tri),
        substancePossible: pick(tri),
        medicalPossible: pick(tri),
      });
      expect(r.suggestions.length).toBeLessThanOrEqual(7);
      if (symptomIds.length === 0) expect(r.status).toBe("empty");
      else expect(r.status).toBe(r.suggestions.length > 0 ? "ok" : "insufficient");
      r.suggestions.forEach((s, k) => {
        expect(Number.isInteger(s.score)).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(SCORING.minScore);
        expect(s.score).toBeLessThanOrEqual(100);
        const prev = r.suggestions[k - 1];
        if (prev) expect(prev.score).toBeGreaterThanOrEqual(s.score);
        const capped = s.flags.some((f) => f.type === "partial-core");
        const expected = s.score >= 65 ? "strong" : s.score >= 40 ? "moderate" : "possible";
        expect(s.strength).toBe(capped ? "possible" : expected);
        expect(s.matched.length).toBeGreaterThan(0);
        expect(s.matched.length + s.missing.length).toBe(fxCondition(s.conditionId).features.length);
        for (const text of [...s.flags.map((f) => f.message), ...s.comorbidityNotes]) expect(text).not.toMatch(banned);
      });
      if (r.message) expect(r.message).not.toMatch(banned);
    }
  });
});
