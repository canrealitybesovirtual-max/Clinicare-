/**
 * Referral letter, session flow timer, practice vignettes (sandboxed scoring) and the Calm page's pacing math.
 */
import { describe, expect, it } from "vitest";
import { conditions, lexicon } from "@/lib/content";
import { scoreConditions } from "@/lib/scoring";
import { DOC_PART2_NOTICE, docPlainText } from "@/lib/tools/doc-model";
import { REFERRAL_PART2_CONSENT, referralLetterDoc, type ReferralLetterInput } from "@/lib/tools/referral-letter";
import { DEFAULT_FLOW, flowStatus, formatClock, plannedMs, spokenClock } from "@/lib/tools/session-flow";
import { VIGNETTES, compareRuns, stateAtStep } from "@/lib/tools/vignettes";
import { breathState, relaxState } from "@/components/calm/pacing";
import { BREATH_PACES, GROUND_STEPS, RELAX_GROUPS } from "@/components/calm/calm-text";

describe("referral letter", () => {
  const base: ReferralLetterInput = {
    serviceId: "medication-evaluation",
    timing: "routine",
    reasonIds: ["client-request", "limited-progress"],
    concerns: [],
    measures: ["PHQ-9 total 16 of 27 (Moderately severe range)."],
    note: "",
    sessionSud: false,
  };

  it("prints blank lines for the client's name and date of birth, once each, and states no diagnosis", () => {
    const text = docPlainText(referralLetterDoc(base));
    expect(text.match(/^Client name: _+$/gm)?.length).toBe(1);
    expect(text.match(/^Date of birth: _+$/gm)?.length).toBe(1);
    expect(text).toContain("Psychiatric medication evaluation");
    expect(text).toContain("The client asked for this service.");
    expect(text).toContain("Screening totals are not diagnoses.");
    expect(text).toContain("This letter states no diagnosis.");
    for (const c of conditions) expect(text).not.toContain(c.name);
  });

  it("scrubs the optional note again", () => {
    const text = docPlainText(referralLetterDoc({ ...base, note: "Seen at 22 Oak Street, call 555-410-2288" }));
    expect(text).not.toMatch(/22 Oak Street|410-2288/);
  });

  it("adds Part 2 and its consent reminder for substance-use referrals or wording", () => {
    expect(referralLetterDoc(base).part2).toBe(false);
    for (const input of [
      { ...base, serviceId: "substance-use-treatment" as const },
      { ...base, note: "Drinking has increased." },
      { ...base, sessionSud: true },
    ]) {
      const spec = referralLetterDoc(input);
      expect(spec.part2).toBe(true);
      const text = docPlainText(spec);
      expect(text).toContain(DOC_PART2_NOTICE);
      expect(text).toContain(REFERRAL_PART2_CONSENT);
    }
  });
});

describe("session flow", () => {
  it("plans 50 minutes by default", () => {
    expect(plannedMs(DEFAULT_FLOW)).toBe(50 * 60_000);
  });

  it("counts down the current step and the session, and projects an overrun", () => {
    const min = 60_000;
    // Step 1 (check-in, 5 min) started at 0; 3 minutes in.
    expect(flowStatus(DEFAULT_FLOW, 0, 3 * min, 0)).toEqual({
      stepRemainingMs: 2 * min,
      stepOverMs: 0,
      sessionRemainingMs: 47 * min,
      projectedOverMs: 0,
    });
    // Still on check-in at 8 minutes: 3 over, and the rest of the plan would end 3 minutes late.
    expect(flowStatus(DEFAULT_FLOW, 0, 8 * min, 0)).toMatchObject({ stepRemainingMs: 0, stepOverMs: 3 * min, projectedOverMs: 3 * min });
    // Moved to the measure step at 4 minutes, now at 6: a minute early, so no overrun.
    expect(flowStatus(DEFAULT_FLOW, 1, 6 * min, 4 * min)).toMatchObject({ stepRemainingMs: 3 * min, projectedOverMs: 0 });
  });

  it("formats the clock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(64_100)).toBe("1:05");
    expect(formatClock(75 * 60_000)).toBe("75:00");
    expect(spokenClock(61_000)).toBe("1 minute 1 second");
    expect(spokenClock(0)).toBe("0 seconds");
  });
});

describe("practice vignettes", () => {
  const ids = new Set(lexicon.symptoms.map((s) => s.id));
  const run = (v: (typeof VIGNETTES)[number], i: number) => {
    const s = stateAtStep(v, i);
    return scoreConditions({ symptomIds: s.symptomIds, ...s.context }, conditions, lexicon.symptoms);
  };

  it("are labeled fictional and use only lexicon symptom ids", () => {
    for (const v of VIGNETTES) {
      expect(v.title).toMatch(/^Fictional case/);
      for (const step of v.steps) for (const id of step.add) expect(ids.has(id), `${v.id}: ${id}`).toBe(true);
    }
  });

  it("carry no identifiers in their stories", () => {
    for (const v of VIGNETTES)
      for (const s of v.steps) expect(s.story).not.toMatch(/\b(Mr|Mrs|Ms|Dr)\.?\s+[A-Z]|\d{3}-\d{4}|@|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  });

  it("change the suggestions or their flags at every step", () => {
    for (const v of VIGNETTES) {
      const sig = v.steps.map((_, i) =>
        JSON.stringify(run(v, i).suggestions.map((s) => [s.conditionId, s.score, s.strength, s.flags.map((f) => f.type)])),
      );
      for (let i = 1; i < sig.length; i++) expect(sig[i], `${v.id} step ${i + 1}`).not.toBe(sig[i - 1]);
    }
  });

  it("teach the gates they describe", () => {
    const flags = (vid: string, step: number, cond: string) =>
      run(VIGNETTES.find((v) => v.id === vid)!, step).suggestions.find((s) => s.conditionId === cond)?.flags.map((f) => f.type) ?? [];
    expect(flags("worry-and-sleep", 0, "generalized-anxiety-disorder")).toContain("breadth");
    expect(flags("racing-heart", 0, "panic-disorder")).toContain("required");
    expect(flags("racing-heart", 1, "panic-disorder")).toContain("medical");
    expect(flags("after-a-crash", 0, "ptsd")).toContain("required");
    expect(run(VIGNETTES.find((v) => v.id === "after-job-loss")!, 2).redFlags.map((f) => f.type)).toContain("suicidality");
  });

  it("compares two runs", () => {
    const v = VIGNETTES.find((x) => x.id === "after-job-loss")!;
    const changes = compareRuns(run(v, 0).suggestions, run(v, 1).suggestions);
    expect(changes.find((c) => c.conditionId === "adjustment-disorder")?.kind).toBe("new");
    expect(compareRuns(null, run(v, 0).suggestions).every((c) => c.kind === "same")).toBe(true);
    const dropped = compareRuns(run(v, 1).suggestions, []);
    expect(dropped.every((c) => c.kind === "dropped" && c.now === null)).toBe(true);
  });
});

describe("calm pacing", () => {
  it("alternates breathing in and out at the chosen pace", () => {
    expect(breathState(0, 4, 6)).toEqual({ phase: "in", secondsLeft: 4, breaths: 0 });
    expect(breathState(3_200, 4, 6)).toEqual({ phase: "in", secondsLeft: 1, breaths: 0 });
    expect(breathState(4_000, 4, 6)).toEqual({ phase: "out", secondsLeft: 6, breaths: 0 });
    expect(breathState(10_000, 4, 6)).toEqual({ phase: "in", secondsLeft: 4, breaths: 1 });
    expect(breathState(25_500, 4, 6)).toMatchObject({ phase: "out", breaths: 2 });
  });

  it("offers paces where breathing out is longer than breathing in", () => {
    for (const p of BREATH_PACES) expect(p.exhale).toBeGreaterThan(p.inhale);
  });

  it("steps through muscle groups: tighten, then let go, then done", () => {
    expect(relaxState(0, 6, 5, 10)).toEqual({ group: 0, phase: "tighten", secondsLeft: 5 });
    expect(relaxState(5_000, 6, 5, 10)).toEqual({ group: 0, phase: "release", secondsLeft: 10 });
    expect(relaxState(15_000, 6, 5, 10)).toEqual({ group: 1, phase: "tighten", secondsLeft: 5 });
    expect(relaxState(90_000, 6, 5, 10)).toEqual({ group: 6, phase: "done", secondsLeft: 0 });
  });

  it("has Spanish for every exercise string", () => {
    for (const s of GROUND_STEPS) expect(s.title.es && s.body.es).toBeTruthy();
    for (const g of RELAX_GROUPS) expect(g.name.es && g.tighten.es && g.release.es).toBeTruthy();
    expect(GROUND_STEPS.map((s) => s.count)).toEqual([5, 4, 3, 2, 1]);
  });
});
