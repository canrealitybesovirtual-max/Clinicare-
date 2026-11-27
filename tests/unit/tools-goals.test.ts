/**
 * Goal writer and goal attainment scaling (src/lib/tools/goals.ts): goal sentences per orientation template, the
 * SMART check, the Kiresuk and Sherman T-score, identifiers scrubbed before export, one blank name line, the crisis
 * box, and the Part 2 notice when goals mention substance use.
 */
import { describe, expect, it } from "vitest";
import { getOrientation } from "@/lib/orientations";
import { docPlainText } from "@/lib/tools/doc-model";
import {
  GAS_RHO,
  GOAL_TEMPLATES,
  composeGoal,
  emptyGasGoal,
  emptyGoalDraft,
  gasMeaning,
  gasSummary,
  gasTScore,
  goalsDoc,
  goalsRecordSubstanceUse,
  reviewSessionError,
  smartCheck,
  type GasGoal,
  type GoalDraft,
} from "@/lib/tools/goals";

type DraftPatch = Omit<Partial<GoalDraft>, "slots"> & { slots?: Partial<GoalDraft["slots"]> };
const draft = (patch: DraftPatch, templateId = "behavioral"): GoalDraft => {
  const base = emptyGoalDraft(templateId);
  return { ...base, ...patch, slots: { ...base.slots, ...patch.slots } };
};

describe("goal templates", () => {
  it("covers the planned orientations, each with its own guidance", () => {
    expect(GOAL_TEMPLATES.map((t) => t.id)).toEqual([
      "behavioral",
      "cognitive",
      "act",
      "dbt",
      "psychodynamic",
      "interpersonal",
      "humanistic",
      "solution-focused",
      "motivational",
      "systemic",
      "trauma-phase",
    ]);
    for (const t of GOAL_TEMPLATES) expect(t.guidance.length).toBeGreaterThan(20);
  });

  it("points only at orientation profiles that exist", () => {
    for (const t of GOAL_TEMPLATES) if (t.orientationId) expect(getOrientation(t.orientationId), t.id).toBeDefined();
  });
});

describe("composeGoal", () => {
  it("is empty until the aim is filled in", () => {
    expect(composeGoal(draft({ slots: { context: "on weekday mornings" } }))).toBe("");
  });

  it("joins the slots with the template's lead words and the review session", () => {
    const goal = composeGoal(
      draft({ slots: { aim: "go for a 20-minute walk", context: "on weekday mornings, 4 days a week", marker: "ticks on the activity log." }, reviewSession: 8 }),
    );
    expect(goal).toBe("Go for a 20-minute walk, on weekday mornings, 4 days a week, tracked by ticks on the activity log, reviewed at session 8.");
  });

  it("opens with the focus choice and does not repeat a lead word already typed", () => {
    const goal = composeGoal(
      draft({ focus: "Role dispute", slots: { aim: "have one conversation about sharing chores", marker: "leading to a plan we both try" } }, "interpersonal"),
    );
    expect(goal).toBe("Role dispute: have one conversation about sharing chores, leading to a plan we both try.");
  });

  it("ignores a focus that is not one of the template's options", () => {
    expect(composeGoal(draft({ focus: "Safety target", slots: { aim: "call one friend" } }, "act"))).toBe("Call one friend.");
  });

  it("scrubs identifiers out of the sentence", () => {
    const goal = composeGoal(draft({ slots: { aim: "call Dr. Smith at 555-123-4567 every week" } }));
    expect(goal).not.toMatch(/555-123-4567|Smith/);
  });
});

describe("smartCheck", () => {
  it("reports which parts are present without judging the goal", () => {
    expect(smartCheck(draft({ slots: { aim: "walk" } }))).toEqual({ specific: false, measurable: false, agreed: false, relevant: false, timeBound: false });
    expect(
      smartCheck(draft({ slots: { aim: "walk", context: "mornings", marker: "log" }, agreed: true, relevant: true, reviewSession: 6 })),
    ).toEqual({ specific: true, measurable: true, agreed: true, relevant: true, timeBound: true });
  });

  it("accepts review session numbers from 1 to 200 only", () => {
    expect(reviewSessionError(8)).toBeNull();
    expect(reviewSessionError(0)).not.toBeNull();
    expect(reviewSessionError(2.5)).not.toBeNull();
    expect(reviewSessionError(201)).not.toBeNull();
  });
});

describe("goal attainment scaling", () => {
  it("uses the conventional correlation of 0.3", () => {
    expect(GAS_RHO).toBe(0.3);
  });

  it("computes the Kiresuk and Sherman T-score", () => {
    expect(gasTScore([])).toBeNull();
    expect(gasTScore([{ weight: 1, level: 0 }])).toBe(50);
    expect(gasTScore([{ weight: 1, level: 2 }])).toBe(70);
    expect(gasTScore([{ weight: 1, level: -1 }])).toBe(40);
    // Three equally weighted goals at +1: 50 + 10 * 3 / sqrt(0.7 * 3 + 0.3 * 9) = 63.7
    expect(gasTScore([1, 1, 1].map((level) => ({ weight: 1, level })))).toBe(63.7);
    // Weights 2 and 1 at +1 and -1: 50 + 10 * 1 / sqrt(0.7 * 5 + 0.3 * 9) = 54.0
    expect(gasTScore([{ weight: 2, level: 1 }, { weight: 1, level: -1 }])).toBe(54);
  });

  it("gives a review score only when every goal is rated", () => {
    const a: GasGoal = { ...emptyGasGoal("walk 3 days a week"), outcome: 1 };
    const b: GasGoal = emptyGasGoal();
    expect(gasSummary([a, b])).toEqual({ baselineT: gasTScore([{ weight: 1, level: -1 }, { weight: 1, level: -1 }]), reviewT: null, rated: 1 });
    expect(gasSummary([a, { ...b, outcome: 0 }]).reviewT).toBe(gasTScore([{ weight: 1, level: 1 }, { weight: 1, level: 0 }]));
  });

  it("describes the score in plain words", () => {
    expect(gasMeaning(50)).toMatch(/expected level/);
    expect(gasMeaning(63.7)).toMatch(/better than expected/);
    expect(gasMeaning(40)).toMatch(/less than expected/);
  });
});

describe("goalsDoc", () => {
  const gas: GasGoal = {
    ...emptyGasGoal("Walk on 3 mornings a week"),
    title: "Morning walks",
    levels: { "-2": "No walks", "-1": "One walk a week", "0": "Walk on 3 mornings a week", "1": "4 mornings", "2": "5 mornings" },
    outcome: 1,
  };

  it("prints one blank name line, the goals, the scale, notes and the crisis box", () => {
    const doc = goalsDoc({ goals: ["Go for a walk on weekday mornings, reviewed at session 8."], gas: [gas] });
    const fills = doc.blocks.filter((b) => b.kind === "fill");
    expect(fills).toEqual([{ kind: "fill", label: "Name" }]);
    expect(doc.blocks.some((b) => b.kind === "crisis")).toBe(true);
    const text = docPlainText(doc);
    expect(text).toContain("Go for a walk on weekday mornings");
    expect(text).toContain("+1 Somewhat more than expected: 4 mornings");
    expect(text).toContain(`Review T-score: ${gasTScore([{ weight: 1, level: 1 }])}`);
    expect(doc.part2).toBe(false);
  });

  it("scrubs identifiers typed into the scale", () => {
    const text = docPlainText(goalsDoc({ goals: [], gas: [{ ...gas, title: "Walk with jane.doe@example.com" }] }));
    expect(text).not.toContain("jane.doe@example.com");
  });

  it("adds the Part 2 notice when goals mention substance use", () => {
    const input = { goals: ["Cut down to two drinks of alcohol on Fridays, reviewed at session 6."], gas: [] };
    expect(goalsRecordSubstanceUse(input)).toBe(true);
    const doc = goalsDoc(input);
    expect(doc.part2).toBe(true);
    expect(docPlainText(doc)).toContain("42 CFR Part 2 prohibits unauthorized use or disclosure of these records.");
  });
});
