import { describe, expect, it } from "vitest";
import { conditions, getCondition, lexicon } from "@/lib/content";
import { followUpBank } from "@/lib/follow-up";
import { scoreConditions } from "@/lib/scoring";
import { TRIGGER_TOKEN } from "@/lib/schemas-follow-up";
import type { Suggestion } from "@/lib/types";
import {
  COMPARE_MAX,
  COMPARE_QUESTIONS_MAX,
  compareSuggestions,
  defaultSelection,
  differentialPointsAt,
} from "@/lib/tools/differential-compare";

const score = (ids: string[]) =>
  scoreConditions({ symptomIds: ids, duration: "gte6m", impairment: "yes", substancePossible: "no", medicalPossible: "no" }, conditions, lexicon.symptoms);

/** Worry plus low mood: generalized anxiety and depression both come up. */
const MIXED = ["worry-excessive", "worry-hard-to-control", "depressed-mood", "anhedonia", "insomnia", "fatigue", "concentration-difficulty", "muscle-tension"];

function suggestions(): Suggestion[] {
  const r = score(MIXED);
  expect(r.status).toBe("ok");
  return r.suggestions;
}
const pick = (list: Suggestion[], ...ids: string[]) => ids.map((id) => list.find((s) => s.conditionId === id)!);

describe("differential compare", () => {
  it("defaults to the first two suggestions in the session's order", () => {
    const list = suggestions();
    expect(defaultSelection(list)).toEqual(list.slice(0, 2).map((s) => s.conditionId));
    expect(defaultSelection(list.slice(0, 1))).toHaveLength(1);
  });

  it("lays two patterns side by side with matched, missing, distinctive and shared features", () => {
    const list = suggestions();
    const chosen = pick(list, "generalized-anxiety-disorder", "major-depressive-disorder");
    expect(chosen.every(Boolean)).toBe(true);
    const { columns, shared } = compareSuggestions(chosen, getCondition, followUpBank);
    expect(columns.map((c) => c.conditionId)).toEqual(["generalized-anxiety-disorder", "major-depressive-disorder"]);
    const [gad, mdd] = columns as [(typeof columns)[number], (typeof columns)[number]];
    expect(gad.coreMatched.map((f) => f.symptomId)).toEqual(expect.arrayContaining(["worry-excessive", "worry-hard-to-control"]));
    expect(gad.distinctive.map((f) => f.symptomId)).toContain("worry-excessive");
    expect(gad.distinctive.map((f) => f.symptomId)).not.toContain("insomnia");
    expect(mdd.distinctive.map((f) => f.symptomId)).toContain("anhedonia");
    expect(shared.map((f) => f.symptomId)).toEqual(expect.arrayContaining(["insomnia", "fatigue", "concentration-difficulty"]));
    expect(shared.find((f) => f.symptomId === "insomnia")!.documented).toBe(true);
    for (const c of columns) expect(c.dsmPointer).toContain("See DSM-5-TR");
  });

  it("brings each pattern's own distinguishing note about the other", () => {
    const list = suggestions();
    const { columns } = compareSuggestions(pick(list, "generalized-anxiety-disorder", "major-depressive-disorder"), getCondition, followUpBank);
    const gadNote = columns[0]!.versus.find((v) => v.otherId === "major-depressive-disorder");
    expect(gadNote?.text).toBe(getCondition("generalized-anxiety-disorder")!.differentials.find((d) => d.label === "Major depressive disorder")!.distinguishing);
  });

  it("matches differentials by ICD-10-CM code or by name, ignoring parenthetical titles", () => {
    const panic = getCondition("panic-disorder")!;
    const gad = getCondition("generalized-anxiety-disorder")!;
    const social = getCondition("social-anxiety-disorder")!;
    expect(differentialPointsAt({ label: "Generalized anxiety disorder", icd10cm: "F41.1", distinguishing: "x".repeat(10) }, gad)).toBe(true);
    expect(differentialPointsAt({ label: "Social anxiety disorder (ICD-10-CM title: Social phobia, unspecified)", distinguishing: "x".repeat(10) }, social)).toBe(true);
    expect(differentialPointsAt({ label: "Normal stress response", distinguishing: "x".repeat(10) }, panic)).toBe(false);
  });

  it("lists discriminating follow-up questions without the trigger placeholder, at most a few", () => {
    const list = suggestions();
    const { questions } = compareSuggestions(pick(list, "generalized-anxiety-disorder", "major-depressive-disorder"), getCondition, followUpBank);
    expect(questions.length).toBeLessThanOrEqual(COMPARE_QUESTIONS_MAX);
    for (const q of questions) {
      expect(q.text).not.toContain(TRIGGER_TOKEN);
      expect(q.why).not.toContain(TRIGGER_TOKEN);
      expect(q.conditionIds.length).toBeGreaterThan(0);
    }
    const counts = questions.map((q) => q.conditionIds.length);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("compares at most three and skips unknown conditions", () => {
    const list = suggestions();
    expect(compareSuggestions(list, getCondition, followUpBank).columns.length).toBeLessThanOrEqual(COMPARE_MAX);
    const ghost = { ...list[0]!, conditionId: "not-a-condition" };
    expect(compareSuggestions([ghost, list[1]!], getCondition, followUpBank).columns.map((c) => c.conditionId)).toEqual([list[1]!.conditionId]);
  });

  it("adds no verdict wording of its own (G3)", () => {
    const list = suggestions();
    const out = JSON.stringify(compareSuggestions(list.slice(0, 3), getCondition, followUpBank));
    expect(out).not.toMatch(/\bthe diagnosis is\b|\bmost likely\b|\bconfirmed diagnosis\b/i);
  });
});
