/**
 * Locks in what the "Help me ask more" panel gives for short, everyday fear descriptions, end to end as the
 * Symptom Finder runs it: scrub -> match -> fold answers -> score -> questions, patterns to consider, tap-to-add
 * features and resource pointers. The owner's failing example was "panic from dogs", which used to produce no
 * feedback at all.
 */
import { describe, expect, it } from "vitest";
import { conditions, lexicon } from "@/lib/content";
import { matchSymptoms } from "@/lib/matcher";
import { scrubPHI } from "@/lib/phi-scrubber";
import { scoreConditions } from "@/lib/scoring";
import type { ScoringInput } from "@/lib/types";
import {
  REVIEW_LABEL,
  answerGateEffects,
  followUpSession,
  summarizeTriggers,
  triggerPatterns,
  type AnsweredRecord,
  type FollowUpQuestion,
} from "@/lib/follow-up";
import { resourceHints } from "@/lib/follow-up/catalog";

const DIAGNOSIS_WORDING = /\b(the client has|diagnosis is|diagnosed with|meets criteria|confirms?)\b/i;
const RISK_WORDING = /\b(high|low|moderate|imminent|no) (current )?risk\b|\bis safe\b/i;

/** The screen's pipeline, with the clinician's chips and context fields (answers to gates are written there). */
function run(text: string, answered: AnsweredRecord[] = [], chips: string[] = [], limit?: number) {
  const scrubbed = scrubPHI(text).clean;
  const m = matchSymptoms(scrubbed, lexicon.symptoms);
  const gates = Object.assign({}, ...answered.map((a) => answerGateEffects(a.questionId, a.answerIds))) as Partial<ScoringInput>;
  const baseInput: ScoringInput = {
    symptomIds: [...new Set([...chips, ...m.matches.map((x) => x.symptomId)])],
    duration: "unknown",
    impairment: "unknown",
    substancePossible: "unknown",
    medicalPossible: "unknown",
    ...gates,
  };
  const absent = m.negated.map((x) => x.symptomId);
  const s = followUpSession(
    { baseInput, scrubbedText: scrubbed, answered, absentSymptomIds: absent, protectedSymptomIds: chips, gates: "ignore" },
    { mode: "clinician", limit },
  );
  const patterns = triggerPatterns(s.triggers, s.scoringInput, s.scoringResult, {
    conditions,
    symptoms: lexicon.symptoms,
    extraCategories: s.folded.triggerCategories,
    absentSymptomIds: [...absent, ...s.folded.negatedSymptomIds],
  });
  const hints = resourceHints(s.scoringResult, s.triggers, { surfaces: s.folded.surfaces, triggerCategories: s.folded.triggerCategories });
  return { ...s, patterns, hints, summary: summarizeTriggers(s.triggers) };
}

const ids = (qs: FollowUpQuestion[]) => qs.map((q) => q.id);

function expectReviewOnly(r: ReturnType<typeof run>) {
  for (const q of r.questions) {
    expect(q.label).toBe(REVIEW_LABEL);
    const all = [q.text, q.why, q.whyAsked, ...q.options.map((o) => o.label)].join(" ");
    expect(all, q.id).not.toMatch(DIAGNOSIS_WORDING);
    expect(all, q.id).not.toMatch(RISK_WORDING);
  }
  for (const p of r.patterns) expect(p.label).toBe(REVIEW_LABEL);
  expect(r.hints.label).toBe(REVIEW_LABEL);
}

/** Answer whatever the engine offers from `script`, round by round, the way a clinician would. */
function answerRounds(text: string, script: Record<string, string>, rounds = 4): AnsweredRecord[] {
  const answered: AnsweredRecord[] = [];
  for (let i = 0; i < rounds; i++) {
    for (const q of run(text, answered).questions) {
      const answer = script[q.id];
      if (answer && !answered.some((a) => a.questionId === q.id)) answered.push({ questionId: q.id, answerIds: [answer] });
    }
  }
  return answered;
}

describe('"panic from dogs" gives clearly useful feedback', () => {
  const first = run("panic from dogs");

  it("recognizes the trigger (an animal) and, in the text itself, the fear tied to it", () => {
    // Review round 3: the lexicon now reads "panic from <object>" as a fear tied to that object.
    expect(first.summary).toEqual([
      { category: "animal", label: "Animals or insects", objectIds: ["dog"], objectLabels: ["dogs"], phrases: ["dogs"] },
    ]);
    expect(first.scoringInput.symptomIds).toEqual(expect.arrayContaining(["circumscribed-fear", "fear-animals", "panic-attack-cued"]));
    expect(first.scoringResult.status).toBe("ok");
    expect(first.scoringResult.suggestions.map((s) => s.conditionId)).toEqual(["specific-phobia"]);
  });

  it("points to specific phobia as a pattern to consider, with codes, the DSM-5-TR pointer and features", () => {
    expect(first.patterns.map((p) => p.conditionId)).toEqual(["specific-phobia"]);
    const p = first.patterns[0]!;
    expect(p.icd10cm.map((c) => c.code)).toContain("F40.218");
    expect(p.icd11.map((c) => c.code)).toEqual(["6B03"]);
    expect(p.dsmPointer).toMatch(/^See DSM-5-TR/);
    expect(p.matched.map((f) => f.symptomId)).toEqual(expect.arrayContaining(["circumscribed-fear", "fear-animals", "panic-attack-cued"]));
    expect(p.missing.filter((f) => f.kind === "core").map((f) => f.symptomId)).toEqual(["phobic-avoidance"]);
    expect(p.objectLabels).toEqual(["dogs"]);
    const sp = first.scoringResult.suggestions[0]!;
    expect(p.scored).toEqual({ score: sp.score, strength: sp.strength });
  });

  it("offers the missing core feature (avoidance) as tap-to-add, and tapping it re-scores", () => {
    expect(first.patterns[0]?.addable).toEqual(["phobic-avoidance"]);
    const tapped = run("panic from dogs", [], ["phobic-avoidance"]);
    const sp = tapped.scoringResult.suggestions.find((s) => s.conditionId === "specific-phobia");
    expect(sp).toBeDefined();
    expect(sp?.matched.map((f) => f.symptomId)).toEqual(expect.arrayContaining(["circumscribed-fear", "phobic-avoidance"]));
    expect(sp?.missing.length).toBeGreaterThan(0);
    expect(sp?.dsmPointer).toMatch(/See DSM-5-TR/);
    expect(sp!.score).toBeGreaterThan(first.scoringResult.suggestions[0]!.score);
    expect(tapped.patterns[0]?.scored).toEqual({ score: sp?.score, strength: sp?.strength });
  });

  it("asks about panic around dogs or out of the blue, avoidance and how it began", () => {
    expect(ids(first.questions)).toEqual(expect.arrayContaining(["fear-cued-or-unexpected", "fear-avoids-trigger", "fear-onset"]));
    const text = first.questions.map((q) => q.text);
    expect(text).toContain("Do the attacks happen only around dogs, or also out of the blue?");
    expect(text).toContain("How did the fear of dogs begin?");
    expectReviewOnly(first);
  });

  it("asks about impairment and proportion once the first answers describe a fear pattern", () => {
    const answered: AnsweredRecord[] = [
      { questionId: "fear-cued-or-unexpected", answerIds: ["only-trigger"] },
      { questionId: "fear-every-time", answerIds: ["every-time"] },
      { questionId: "fear-avoids-trigger", answerIds: ["avoids"] },
      { questionId: "fear-onset", answerIds: ["long-standing"] },
      { questionId: "gate-duration", answerIds: ["gte6m"] },
    ];
    const next = run("panic from dogs", answered);
    expect(ids(next.questions)).toEqual(expect.arrayContaining(["fear-impairment", "fear-out-of-proportion"]));
    for (const a of answered) expect(ids(next.questions)).not.toContain(a.questionId);
    // The answers re-score locally: specific phobia is now a possible consideration, panic disorder is not.
    const suggested = next.scoringResult.suggestions.map((s) => s.conditionId);
    expect(suggested[0]).toBe("specific-phobia");
    expect(suggested).not.toContain("panic-disorder");
    expect(next.scoringInput.duration).toBe("gte6m");
  });

  it("a bite or attack leads to trauma follow-up questions and keeps PTSD in view only after the event is documented", () => {
    const bite: AnsweredRecord[] = [{ questionId: "fear-onset", answerIds: ["after-event"] }];
    const after = run("panic from dogs", bite);
    expect(after.folded.triggerCategories).toContain("trauma-reminder");
    expect(after.folded.notes[0]).toMatch(/reliving the event and avoiding reminders/);
    // Trauma questions join the next batch (timing of the event), safety first as for any trauma reminder.
    expect(after.questions[0]?.id).toBe("safety-ask-directly");
    expect(after.questions.some((q) => q.domain === "trauma")).toBe(true);
    // The event-link question is queued too, worded about the described fear.
    const queued = run("panic from dogs", bite, [], 10).questions;
    expect(queued.find((q) => q.id === "fear-event-link")?.text).toBe(
      "Did the fear of dogs start after a frightening event, and does the client relive that event (unwanted memories, nightmares or flashbacks)?",
    );
    expect(after.patterns.map((p) => p.conditionId)).toEqual(["specific-phobia", "ptsd"]);
    expect(first.patterns.map((p) => p.conditionId)).not.toContain("ptsd");
    expectReviewOnly(after);
  });

  it("points to graded in vivo exposure, the exposure ladder and referral types, with no measure or Part 2", () => {
    expect(first.hints.interventionIds[0]).toBe("graded-in-vivo-exposure");
    expect(first.hints.handoutIds).toContain("exposure-ladder");
    expect(first.hints.referralKinds).toEqual(expect.arrayContaining(["psychologist", "professional-counselor"]));
    expect(first.hints.measureIds).toEqual([]);
    expect(first.hints.part2).toBe(false);
  });

  it("never decides risk: a suicide statement in the same note is a red flag with the safety question first", () => {
    const r = run("panic from dogs. Says she wants to die.");
    expect(r.scoringResult.redFlags.map((f) => f.type)).toContain("suicidality");
    expect(r.questions[0]?.kind).toBe("safety");
    expect(r.hints.referralKinds[0]).toBe("crisis");
    expectReviewOnly(r);
  });

  it("works through a full round of answers without asking anything twice", () => {
    const answered = answerRounds("panic from dogs", {
      "fear-cued-or-unexpected": "only-trigger",
      "fear-every-time": "every-time",
      "fear-avoids-trigger": "avoids",
      "fear-onset": "long-standing",
      "gate-duration": "gte6m",
      "fear-impairment": "interferes",
      "fear-out-of-proportion": "out-of-proportion",
    });
    expect(answered.map((a) => a.questionId)).toHaveLength(7);
    const done = run("panic from dogs", answered);
    expect(done.scoringInput.impairment).toBe("yes");
    expect(done.scoringResult.suggestions[0]?.conditionId).toBe("specific-phobia");
  });
});

describe("other everyday phrasings", () => {
  it('"freaks out on bridges": situational trigger, specific phobia scored, proportion and avoidance asked', () => {
    const r = run("freaks out on bridges");
    expect(r.summary[0]).toMatchObject({ category: "situational", objectIds: ["bridge"] });
    expect(r.patterns[0]).toMatchObject({ conditionId: "specific-phobia", matched: [expect.objectContaining({ symptomId: "circumscribed-fear" })] });
    expect(r.patterns[0]?.scored).toBeDefined();
    expect(ids(r.questions)).toEqual(expect.arrayContaining(["fear-out-of-proportion", "fear-avoids-trigger"]));
    expect(r.hints.interventionIds[0]).toBe("graded-in-vivo-exposure");
    expectReviewOnly(r);
  });

  it('"can\'t fly": flying is recognized, and the question separates the flight itself from fear of being trapped', () => {
    const r = run("can't fly");
    expect(r.summary[0]).toMatchObject({ category: "situational", objectIds: ["flying"], objectLabels: ["flying"] });
    expect(r.patterns.map((p) => p.conditionId)).toEqual(["specific-phobia", "agoraphobia"]);
    expect(r.patterns[0]?.addable).toEqual(expect.arrayContaining(["circumscribed-fear", "phobic-avoidance"]));
    expect(ids(r.questions)).toContain("fear-escape-several-places");
    expect(r.questions.find((q) => q.id === "fear-escape-several-places")?.text).toMatch(/about flying itself/);
    expectReviewOnly(r);
  });

  it('"scared of needles": blood-injection-injury trigger, fainting asked, primary care among the referrals', () => {
    const r = run("scared of needles");
    expect(r.summary[0]).toMatchObject({ category: "blood-injection-injury", objectIds: ["needle"] });
    expect(ids(r.questions)).toContain("fear-fainting");
    expect(r.patterns[0]).toMatchObject({ conditionId: "specific-phobia", addable: ["phobic-avoidance"] });
    expect(r.hints.referralKinds).toContain("primary-care");
    expect(r.hints.part2).toBe(false);
    expectReviewOnly(r);
  });

  it('"nervous around people at work": social trigger, social anxiety pattern, judgment and avoidance asked', () => {
    const r = run("nervous around people at work");
    expect(r.summary[0]).toMatchObject({ category: "social", objectIds: ["workplace-social"], objectLabels: ["people at work"] });
    expect(r.patterns.map((p) => p.conditionId)).toEqual(["social-anxiety-disorder"]);
    expect(r.patterns[0]?.addable).toEqual(["social-situation-avoidance"]);
    expect(ids(r.questions)).toEqual(expect.arrayContaining(["fear-social-scrutiny", "fear-social-avoids"]));
    expect(r.hints.interventionIds[0]).toBe("social-anxiety-cognitive-techniques");
    expect(r.hints.part2).toBe(false);
    expectReviewOnly(r);
  });

  it('"afraid to leave the house": agoraphobia is offered beside specific phobia, leading with going out alone', () => {
    const r = run("afraid to leave the house");
    expect(r.scoringResult.status).toBe("empty");
    expect(r.summary[0]).toMatchObject({ category: "situational", objectIds: ["leaving-home"], objectLabels: ["leaving the house"] });
    expect(r.patterns.map((p) => p.conditionId)).toEqual(["specific-phobia", "agoraphobia"]);
    expect(r.patterns[1]?.addable[0]).toBe("avoid-leaving-home-alone");
    expect(ids(r.questions)).toContain("fear-escape-several-places");
    // Questions use the curated label, never the typed words.
    for (const q of r.questions) expect(q.text).not.toContain("leave the house");
    expect(r.questions.find((q) => q.id === "fear-avoids-trigger")?.text).toContain("steer clear of leaving the house");
    expectReviewOnly(r);
  });

  it('"panics on bridges": the bridge is offered as a fear of heights, not as a fear of animals', () => {
    const r = run("panics on bridges");
    expect(r.summary[0]).toMatchObject({ category: "situational", objectIds: ["bridge"] });
    expect(r.patterns[0]?.conditionId).toBe("specific-phobia");
    expect(r.patterns[0]?.addable).toContain("fear-heights");
    expect(r.patterns[0]?.addable).not.toContain("fear-animals");
    // Once tapped, the other phobia types are not listed as missing: one documented type fills the slot.
    const tapped = run("panics on bridges", [], ["fear-heights", "circumscribed-fear"]);
    const sp = tapped.scoringResult.suggestions.find((s) => s.conditionId === "specific-phobia");
    expect(sp?.missing.map((f) => f.symptomId)).not.toContain("fear-animals");
    expectReviewOnly(r);
  });

  it("tap-to-add never offers a red-flag symptom or one noted as absent", () => {
    const redFlagIds = new Set(lexicon.symptoms.filter((s) => s.redFlag).map((s) => s.id));
    for (const text of ["panic from dogs", "can't fly", "afraid to leave the house", "nervous around people at work"]) {
      for (const p of run(text).patterns) for (const id of p.addable) expect(redFlagIds.has(id), `${text}: ${id}`).toBe(false);
    }
    const r = run("panic from dogs", [{ questionId: "fear-avoids-trigger", answerIds: ["no-avoidance"] }]);
    expect(r.patterns[0]?.addable).not.toContain("phobic-avoidance");
  });

  it("is deterministic and keeps scoring identical to a direct scoreConditions call", () => {
    const a = run("afraid to leave the house");
    const b = run("afraid to leave the house");
    expect(JSON.stringify(a.questions)).toBe(JSON.stringify(b.questions));
    expect(a.scoringResult).toEqual(scoreConditions(a.scoringInput, conditions, lexicon.symptoms));
  });
});

describe("the newer conditions reach their own follow-up questions", () => {
  const questionIds = (text: string, chips: string[] = [], answered: AnsweredRecord[] = []) => ids(run(text, answered, chips, 8).questions);

  it("eating: the pattern questions, with body warning signs in the safety tier once restriction is documented", () => {
    const q = questionIds("", ["binge-eating-episodes", "compensatory-exercise-fasting", "shape-weight-overvaluation"]);
    expect(q).toEqual(expect.arrayContaining(["eating-pattern", "eating-after-episode"]));
    // Safety questions lead (asking directly about suicide, then the body warning signs), before any other kind.
    const restricting = run("", [], ["low-body-weight", "fear-weight-gain"], 8).questions;
    const firstOther = restricting.findIndex((x) => x.kind !== "safety");
    expect(ids(restricting.slice(0, firstOther))).toEqual(expect.arrayContaining(["eating-medical-signs"]));
  });

  it("attention: asks whether it goes back to childhood", () => {
    expect(questionIds("", ["inattention-disorganization", "time-management-procrastination"])).toContain("attention-since-childhood");
  });

  it("psychosis: safety first, then when the experiences show up", () => {
    const q = questionIds("", ["hallucinations", "paranoia-delusions"]);
    expect(q[0]).toMatch(/^safety-/);
    expect(q).toEqual(expect.arrayContaining(["psychosis-when", "psychosis-other-changes"]));
  });

  it("bipolar: what changes during highs and how far they went", () => {
    const q = questionIds("", ["grandiosity-elevated-mood", "decreased-need-for-sleep"]);
    expect(q).toEqual(expect.arrayContaining(["mood-high-features", "mood-high-impact"]));
  });

  it("health worry, appearance and belongings reach their questions", () => {
    expect(questionIds("", ["health-anxiety-preoccupation"])).toEqual(expect.arrayContaining(["health-symptoms-or-fear", "health-checking"]));
    expect(questionIds("", ["appearance-preoccupation"])).toContain("appearance-habits");
    expect(questionIds("", ["difficulty-discarding"])).toContain("keeping-things-home");
  });

  it("opioids: overdose safety is in the safety tier and carries the Part 2 notice", () => {
    const r = run("", [], ["opioid-use-pattern", "opioid-impaired-control"], 8);
    const firstOther = r.questions.findIndex((x) => x.kind !== "safety");
    const overdose = r.questions.findIndex((x) => x.id === "opioid-overdose-safety");
    expect(overdose).toBeGreaterThanOrEqual(0);
    expect(overdose).toBeLessThan(firstOther);
    expect(r.questions[overdose]?.part2Notice).toMatch(/42 CFR Part 2/);
    expect(ids(r.questions)).toContain("opioid-control");
  });
});

describe("everyday fear and paranoia phrasings reach the right symptoms (review round 3)", () => {
  const matched = (text: string) => matchSymptoms(text, lexicon.symptoms).matches.map((m) => m.symptomId);

  it.each([
    ["panic from dogs", ["fear-animals", "circumscribed-fear", "panic-attack-cued"]],
    ["panic attacks around dogs", ["fear-animals", "circumscribed-fear", "panic-attack-cued"]],
    ["freaks out when she sees a dog", ["fear-animals", "circumscribed-fear"]],
    ["panics when he sees a spider", ["fear-animals", "panic-attack-cued"]],
    ["neighbors are spying on him", ["paranoia-delusions"]],
    ["thinks the FBI is tapping his phone", ["paranoia-delusions"]],
  ])("%s", (text, expected) => {
    expect(matched(text)).toEqual(expect.arrayContaining(expected));
  });

  it("the Symptom Finder's own placeholder example finds the fear, not just the racing heart", () => {
    expect(matched("panic from dogs; heart racing; now avoids the park")).toEqual(expect.arrayContaining(["fear-animals", "palpitations"]));
  });

  it("ordinary wording near those phrases stays unmatched", () => {
    expect(matched("panic from stress at work")).not.toContain("fear-animals");
    expect(matched("she loves spy movies with people")).not.toContain("paranoia-delusions");
    expect(matched("my boss is watching me closely at work")).not.toContain("paranoia-delusions");
  });
});

describe("blood-injection-injury resources wait for a blood, needle or injury fear", () => {
  it("a fear of dogs is never offered applied tension", () => {
    const r = run("afraid of dogs, avoids the park");
    expect(r.scoringResult.suggestions.map((s) => s.conditionId)).toContain("specific-phobia");
    expect(r.hints.interventionIds).not.toContain("applied-tension");
    expect(r.hints.handoutIds).not.toContain("applied-tension-practice");
  });

  it("a needle fear with fainting is", () => {
    const r = run("terrified of needles, fainted at a blood draw, avoids the doctor");
    expect(r.hints.interventionIds).toContain("applied-tension");
    expect(r.hints.handoutIds).toContain("applied-tension-practice");
  });
});
