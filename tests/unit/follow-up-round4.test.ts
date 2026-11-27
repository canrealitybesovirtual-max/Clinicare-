/**
 * Round 4 follow-up wiring over the REAL content: the trauma timing question decides between the first-month
 * pattern and PTSD, the sedative, tobacco, gambling, pulling/picking and cycle questions document what the
 * clinician recorded (never more), the cognitive check routes to medical care, and every new condition can be
 * reached by a question. Answers only record what the clinician chose; they never decide risk (G9).
 */
import { describe, expect, it } from "vitest";
import { conditions, lexicon } from "@/lib/content";
import { followUpBank, bankProblems, getQuestionDef } from "@/lib/follow-up/bank";
import { applyAnswer, applyAnswers } from "@/lib/follow-up/engine";
import { triggerDictionary } from "@/lib/follow-up/dictionary";
import { scoreConditions } from "@/lib/scoring";
import { resourceHints } from "@/lib/follow-up/catalog";
import { PART2_NOTICE } from "@/lib/referral-links";
import type { ScoringInput } from "@/lib/types";

const NEW_CONDITIONS = [
  "acute-stress-disorder",
  "sedative-hypnotic-use-disorder",
  "gambling-disorder",
  "tobacco-use-disorder",
  "body-focused-repetitive-behaviors",
  "premenstrual-dysphoric-disorder",
] as const;

const input = (symptomIds: string[], patch: Partial<ScoringInput> = {}): ScoringInput => ({
  symptomIds,
  duration: "unknown",
  impairment: "yes",
  substancePossible: "no",
  medicalPossible: "no",
  ...patch,
});
const score = (i: ScoringInput) => scoreConditions(i, conditions, lexicon.symptoms);
const shown = (i: ScoringInput) => score(i).suggestions.map((s) => s.conditionId);
const TRAUMA = ["traumatic-event-exposure", "nightmares", "flashbacks", "avoidance-trauma-reminders", "startle", "insomnia"];

describe("round 4 question banks", () => {
  it("cross-reference cleanly against the lexicon (no unknown ids, no negated red flags)", () => {
    expect(bankProblems({ symptoms: lexicon.symptoms })).toEqual([]);
  });

  it("reach every new condition from a question or a trigger hint", () => {
    const reached = new Set<string>();
    for (const q of followUpBank) for (const id of [...q.discriminates, ...(q.showWhen.conditionIds ?? [])]) reached.add(id);
    for (const info of Object.values(triggerDictionary.categories)) for (const id of info.conditionHints) reached.add(id);
    for (const id of NEW_CONDITIONS) expect(reached.has(id), id).toBe(true);
    expect(triggerDictionary.categories["trauma-reminder"].conditionHints).toContain("acute-stress-disorder");
  });

  it("mark the sedative and tobacco questions for the Part 2 notice, and keep gambling and cycle questions free of it", () => {
    for (const id of ["sedative-control", "tobacco-dependence"]) expect(getQuestionDef(id)?.sud, id).toBe(true);
    for (const id of ["gambling-harms", "mood-cycle-timing", "bfrb-pattern", "ruleout-cognitive-change", "sleep-other-disorders"])
      expect(getQuestionDef(id)?.sud, id).toBe(false);
  });

  it("ask the direct suicide question when gambling harms, sedative harms, recent trauma or premenstrual patterns appear", () => {
    const ask = getQuestionDef("safety-ask-directly");
    for (const id of ["gambling-concealment-harm", "chasing-losses", "sedative-despite-harm", "recent-trauma-past-month"])
      expect(ask?.showWhen.symptomIds, id).toContain(id);
    for (const id of ["acute-stress-disorder", "gambling-disorder", "sedative-hypnotic-use-disorder", "premenstrual-dysphoric-disorder"])
      expect(ask?.showWhen.conditionIds, id).toContain(id);
  });
});

describe("trauma timing decides between the first month and PTSD", () => {
  it("a reaction within the first month documents the recent event and brings the acute pattern forward", () => {
    const r = applyAnswer(input(TRAUMA), "trauma-timing", "2to4w");
    expect(r.addedSymptomIds).toContain("recent-trauma-past-month");
    expect(r.scoringInput.duration).toBe("2to4w");
    const s = score(r.scoringInput);
    expect(s.suggestions[0]?.conditionId).toBe("acute-stress-disorder");
    expect(s.suggestions.find((x) => x.conditionId === "ptsd")?.flags.map((f) => f.type)).toContain("duration");
  });

  it("reactions lasting beyond a month set the recent event aside, so only PTSD remains", () => {
    const withText = input([...TRAUMA, "recent-trauma-past-month"]);
    const r = applyAnswer(withText, "trauma-timing", "1to6m");
    expect(r.negatedSymptomIds).toContain("recent-trauma-past-month");
    expect(shown(r.scoringInput)).toContain("ptsd");
    expect(shown(r.scoringInput)).not.toContain("acute-stress-disorder");
  });
});

describe("answers record only what the clinician chose", () => {
  it("sedatives: use as prescribed clears the use-disorder features; symptoms between doses add the withdrawal red flag", () => {
    const base = input(["sedative-use-pattern", "sedative-impaired-control"]);
    const asPrescribed = applyAnswer(base, "sedative-control", "as-prescribed");
    expect(asPrescribed.negatedSymptomIds).toEqual(["sedative-impaired-control", "sedative-despite-harm"]);
    expect(shown(asPrescribed.scoringInput)).not.toContain("sedative-hypnotic-use-disorder");

    const between = applyAnswer(input(["sedative-use-pattern"]), "sedative-control", ["between-doses"]);
    expect(between.addedSymptomIds).toEqual(["sedative-withdrawal-signs"]);
    expect(between.surfaces).toEqual(expect.arrayContaining(["part2-notice", "medical-referral"]));
    expect(score(between.scoringInput).redFlags.map((f) => f.type)).toEqual(["withdrawal"]);
  });

  it("tobacco: dependence and quit attempts are documented, readiness adds nothing", () => {
    const r = applyAnswer(input(["tobacco-use-pattern"]), "tobacco-dependence", ["dependence", "quit-attempts", "ready"]);
    expect(r.addedSymptomIds).toEqual(["tobacco-craving-withdrawal", "tobacco-unsuccessful-quit"]);
    expect(r.surfaces).toContain("part2-notice");
    expect(shown(r.scoringInput)[0]).toBe("tobacco-use-disorder");
  });

  it("gambling: 'none of these' sets every gambling feature aside", () => {
    const r = applyAnswer(input(["chasing-losses", "gambling-preoccupation"]), "gambling-harms", "none");
    expect([...r.negatedSymptomIds].sort()).toEqual(["chasing-losses", "gambling-concealment-harm", "gambling-impaired-control", "gambling-preoccupation"]);
    expect(r.scoringInput.symptomIds).toEqual([]);
    expect(shown(r.scoringInput)).not.toContain("gambling-disorder");
  });

  it("cycle timing: daily ratings document the cycle link and clear the required-feature hold; recall alone does not", () => {
    const base = input(["premenstrual-mood-symptoms", "premenstrual-impairment", "irritability"], { duration: "1to6m" });
    const flagsOf = (i: ScoringInput) =>
      score(i).suggestions.find((s) => s.conditionId === "premenstrual-dysphoric-disorder")?.flags.map((f) => f.type) ?? [];
    expect(flagsOf(base)).toContain("required");
    const recall = applyAnswer(base, "mood-cycle-timing", "recall");
    expect(recall.addedSymptomIds).toEqual([]);
    expect(flagsOf(recall.scoringInput)).toContain("required");
    const rated = applyAnswer(base, "mood-cycle-timing", "rated");
    expect(rated.addedSymptomIds).toEqual(["luteal-phase-timing"]);
    expect(flagsOf(rated.scoringInput)).not.toContain("required");
  });

  it("pulling or picking to hurt oneself records self-harm and brings crisis resources forward", () => {
    const r = applyAnswer(input(["skin-picking"]), "bfrb-pattern", ["self-harm"]);
    expect(r.addedSymptomIds).toEqual(["self-harm"]);
    expect(r.surfaces).toEqual(expect.arrayContaining(["crisis-resources", "safety-plan"]));
    expect(score(r.scoringInput).redFlags.map((f) => f.type)).toEqual(["suicidality"]);
  });

  it("the cognitive check routes sudden confusion to same-day medical care and a gradual decline to a cognitive evaluation", () => {
    const sudden = applyAnswer(input(["concentration-difficulty", "depressed-mood"], { medicalPossible: "unknown" }), "ruleout-cognitive-change", "sudden-fluctuating");
    expect(sudden.scoringInput.medicalPossible).toBe("yes");
    expect(sudden.surfaces).toEqual(["urgent-medical"]);
    const mdd = score(sudden.scoringInput).suggestions.find((s) => s.conditionId === "major-depressive-disorder");
    const medical = mdd?.flags.find((f) => f.type === "medical")?.message ?? "";
    expect(medical).toMatch(/Delirium/);
    expect(medical).toMatch(/neurocognitive/);
    const gradual = applyAnswer(input(["concentration-difficulty"], { medicalPossible: "unknown" }), "ruleout-cognitive-change", "gradual-decline");
    expect(gradual.surfaces).toEqual(["medical-referral"]);
  });

  it("other sleep problems: nightmares are documented, restless legs and dream enactment point to medical review", () => {
    const r = applyAnswer(input(["insomnia"]), "sleep-other-disorders", ["restless-legs", "nightmares", "dream-enactment"]);
    expect(r.addedSymptomIds).toEqual(["nightmares"]);
    expect(r.surfaces).toEqual(["medical-referral"]);
  });

  it("folding the same answers twice gives the same result (pure)", () => {
    const answered = [
      { questionId: "trauma-timing", answerIds: ["lt2w"] },
      { questionId: "sedative-control", answerIds: ["control", "harm"] },
    ];
    const a = applyAnswers(input(TRAUMA), answered);
    const b = applyAnswers(input(TRAUMA), answered);
    expect(a).toEqual(b);
    expect(a.addedSymptomIds).toEqual(["recent-trauma-past-month", "sedative-impaired-control", "sedative-despite-harm"]);
  });
});

describe("red-flag resource hints and 42 CFR Part 2 (G6)", () => {
  const hintsFor = (type: string) => {
    const sym = lexicon.symptoms.find((s) => s.redFlag === type);
    expect(sym, type).toBeTruthy();
    return resourceHints(score(input([sym!.id])), []);
  };

  it("a toxicity or overdose red flag carries the Part 2 notice, like withdrawal", () => {
    expect(hintsFor("toxicity-or-overdose").part2Notice).toBe(PART2_NOTICE);
    expect(hintsFor("withdrawal").part2Notice).toBe(PART2_NOTICE);
  });

  it("a new neurological sign alone does not", () => {
    expect(hintsFor("neurological-signs").part2Notice).toBeUndefined();
  });
});
