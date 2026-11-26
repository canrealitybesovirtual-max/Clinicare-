/**
 * Regression tests for the safety review findings (matcher negation, red-flag recall, false red
 * flags, attribution, scoring holds). Every string below is fictional and comes from the review.
 * They run on the REAL lexicon and conditions: free text -> scrubPHI -> matchSymptoms -> scoreConditions.
 */
import { describe, expect, it } from "vitest";
import { conditions, lexicon } from "@/lib/content";
import { matchSymptoms } from "@/lib/matcher";
import { scrubPHI } from "@/lib/phi-scrubber";
import type { RedFlagType } from "@/lib/schemas";
import { scoreConditions } from "@/lib/scoring";
import type { DurationBand, ScoringInput, Suggestion } from "@/lib/types";
import { cloneCondition, fxSymptoms, input } from "../fixtures";
import { analyze as analyzeSession } from "@/components/symptoms/analysis";
import { initialSession } from "@/state/session";
import { NO_MATCH_MESSAGE, EMPTY_MESSAGE } from "@/lib/scoring";

const ids = (list: { symptomId: string }[]) => list.map((m) => m.symptomId);

function analyze(text: string, duration: DurationBand = "gte6m", over: Partial<ScoringInput> = {}) {
  const match = matchSymptoms(scrubPHI(text).clean, lexicon.symptoms);
  const result = scoreConditions(
    { symptomIds: ids(match.matches), duration, impairment: "yes", substancePossible: "unknown", medicalPossible: "no", ...over },
    conditions,
    lexicon.symptoms,
  );
  return { match, result, flags: [...new Set(result.redFlags.map((f) => f.type))].sort() as RedFlagType[] };
}
const suggestion = (r: { suggestions: Suggestion[] }, id: string) => r.suggestions.find((s) => s.conditionId === id);

describe("negation scope never hides a red flag the client reports (HIGH)", () => {
  it.each([
    ["Denies SI and has been hearing voices at night.", ["suicidal-ideation-active"], ["hallucinations"], ["psychosis"]],
    ["Denies depression and feels hopeless and wants to die.", [], ["depressed-mood", "passive-death-wish"], ["suicidality"]],
    ["Negative for mania and is now spending all her savings and talking fast.", [], ["grandiosity-elevated-mood"], ["mania"]],
    ["Denies SI and hears voices.", ["suicidal-ideation-active"], ["hallucinations"], ["psychosis"]],
  ] as const)("%s", (text, negated, positive, flags) => {
    const { match, flags: got } = analyze(text);
    for (const id of negated) expect(ids(match.negated), `negated ${id}`).toContain(id);
    for (const id of positive) expect(ids(match.matches), `positive ${id}`).toContain(id);
    expect(got).toEqual([...flags].sort());
  });

  it("a red flag is negated only when the cue is close and only list words sit between", () => {
    expect(ids(analyze("Denies any current thoughts of suicide.").match.negated)).toContain("suicidal-ideation-active");
    expect(ids(analyze("Denies SI or HI.").match.negated)).toEqual(["suicidal-ideation-active", "homicidal-ideation"]);
    // Something else said between the cue and the red flag: the flag stays for the clinician.
    expect(analyze("Denies trouble at work lately wants to die.").flags).toEqual(["suicidality"]);
  });
});

describe("red-flag recall (HIGH)", () => {
  it.each([
    ["Endorses suicidality. Considering suicide, wrote goodbye letters, gave away belongings, bought a gun to end things.", "suicidality"],
    ["Thinking about overdosing on her pills.", "suicidality"],
    ["Wants to jump off a bridge.", "suicidality"],
    ["Contemplating suicide.", "suicidality"],
    ["Has a suicide note.", "suicidality"],
    ["Pt no longer wants to live.", "suicidality"],
    ["Denies SI but says she wishes she would not wake up.", "suicidality"],
    ["Wants to kill her husband.", "homicidality"],
    ["Plans to shoot his coworker.", "homicidality"],
    ["Wants to hurt her boss.", "homicidality"],
    ["Believes people can read her thoughts.", "psychosis"],
    ["The TV is talking to her.", "psychosis"],
    ["Responds to voices during the session.", "psychosis"],
    ["Drinks a pint daily; stopped 2 days ago and is now tremulous, sweaty and confused.", "withdrawal"],
  ] as const)("%s -> %s", (text, flag) => {
    expect(analyze(text).flags).toContain(flag);
  });

  it("harm-to-self wording does not read as harm to others", () => {
    expect(analyze("Wants to kill herself.").flags).toEqual(["suicidality"]);
  });
});

describe("false red flags from MSE shorthand and everyday words (MEDIUM)", () => {
  it.each([
    "SI: denied. HI: denied. AVH: none.",
    "No SI, HI, or AVH.",
    "SI/HI: denied",
    "Not currently suicidal. No thoughts of self harm.",
    "SI joint pain after a fall.",
    "Dice que si.",
    "Walks 5 kms a day.",
    "Hearing things from her coworkers about layoffs.",
    "Seeing things differently since therapy.",
    "During attacks she is afraid of passing out.",
    "Therapy was an eye opener.",
    "Hi, nice to meet you.",
  ])("%s raises no red flag", (text) => {
    expect(analyze(text).flags).toEqual([]);
  });

  it("'She was sobbing' is not shortness of breath, but 'SOB on exertion' is", () => {
    expect(ids(analyze("She was sobbing.").match.matches)).not.toContain("shortness-of-breath");
    expect(ids(analyze("Reports SOB on exertion.").match.matches)).toContain("shortness-of-breath");
  });

  it("negated SI no longer adds to the depression score", () => {
    const { result } = analyze("SI: denied. Low mood and no interest in anything.", "1to6m");
    expect(suggestion(result, "major-depressive-disorder")?.matched.map((m) => m.symptomId)).not.toContain("suicidal-ideation-active");
  });

  it("fainting tied to food restriction is still an eating-disorder red flag", () => {
    expect(analyze("Restricting to 500 calories a day, lost 20 lb, fainted at work twice.").flags).toEqual(["eating-disorder-medical"]);
  });
});

describe("contractions, 'no longer' and 'without' negate (MEDIUM)", () => {
  it.each([
    ["She doesn't have nightmares or flashbacks. Hasn't had a panic attack in months.", ["nightmares", "flashbacks", "panic-attacks-unspecified"]],
    ["She no longer has panic attacks.", ["panic-attacks-unspecified"]],
    ["Chronic worry without any panic attacks.", ["panic-attacks-unspecified"]],
    ["She didn't have flashbacks this week.", ["flashbacks"]],
  ] as const)("%s", (text, negated) => {
    const { match } = analyze(text);
    for (const id of negated) {
      expect(ids(match.negated), id).toContain(id);
      expect(ids(match.matches), id).not.toContain(id);
    }
  });

  it("a phrase that is itself negative stays positive ('doesn't enjoy anything', 'didn't want to wake up')", () => {
    expect(ids(analyze("Doesn't enjoy anything anymore.").match.matches)).toContain("anhedonia");
    expect(ids(analyze("Didn't want to wake up this morning.").match.matches)).toContain("passive-death-wish");
  });
});

describe("family and resolved past history are shown but never scored (MEDIUM)", () => {
  it("relatives' conditions are attributed to family history", () => {
    const { match, result } = analyze("Mother has depression and panic attacks. Brother has PTSD from combat.");
    expect(match.matches).toEqual([]);
    expect(match.attributed.map((a) => [a.symptomId, a.reason])).toEqual([
      ["depressed-mood", "family"],
      ["panic-attacks-unspecified", "family"],
      ["traumatic-event-exposure", "family"],
    ]);
    expect(result.suggestions).toEqual([]);
  });

  it("'family history of' covers a comma list; the client's own statement after it still counts", () => {
    const { match } = analyze("Family history of depression, anxiety and nightmares. She has panic attacks out of nowhere.");
    expect(ids(match.attributed)).toEqual(expect.arrayContaining(["depressed-mood", "subjective-anxiety-stress", "nightmares"]));
    expect(ids(match.matches)).toEqual(["panic-attacks-unexpected"]);
  });

  it("a possessive relative ('mother's depression') is attributed; 'and she has' starts the client's own statement", () => {
    expect(ids(analyze("Worried about her mother's depression.").match.attributed)).toContain("depressed-mood");
    const { match } = analyze("Father has depression and she has nightmares.");
    expect(ids(match.attributed)).toEqual(["depressed-mood"]);
    expect(ids(match.matches)).toEqual(["nightmares"]);
  });

  it("resolved past history is attributed as historical", () => {
    const { match, result } = analyze("History of depression in remission; currently euthymic.");
    expect(match.attributed).toEqual([expect.objectContaining({ symptomId: "depressed-mood", reason: "historical" })]);
    expect(result.status).toBe("empty");
  });

  it("red flags are never attributed away", () => {
    const { match, flags } = analyze("Brother has been hearing voices. Past history of suicide attempt.");
    expect(ids(match.matches)).toEqual(expect.arrayContaining(["hallucinations", "suicide-attempt-history"]));
    expect(flags).toEqual(["psychosis", "suicidality"]);
  });
});

describe("generic 'panic attack' is not evidence of unexpected attacks (MEDIUM)", () => {
  it("cued wording routes to situational attacks", () => {
    expect(ids(analyze("Gets anxiety attacks before exams.").match.matches)).toEqual(["panic-attack-cued"]);
    const { match, result } = analyze(
      "Panic attacks only when giving presentations; afraid people will judge her; avoids parties; worried about the next attack.",
    );
    expect(ids(match.matches)).not.toContain("panic-attacks-unexpected");
    expect(suggestion(result, "panic-disorder")?.strength ?? "possible").toBe("possible");
  });

  it("an attack of unknown type asks the clinician to clarify, and panic disorder stays below strong", () => {
    const { result } = analyze(
      "Panic attacks with racing heart, short of breath, sweating, shaking, chest pain and fear of dying. Worried about having another attack and stopped going to the gym.",
      "1to6m",
    );
    const panic = suggestion(result, "panic-disorder");
    expect(panic?.strength).toBe("moderate");
    expect(panic?.flags.find((f) => f.type === "required")?.message).toMatch(/Clarify whether the attacks are unexpected/);
  });
});

describe("textbook clinical wording is recognized (MEDIUM)", () => {
  it.each([
    ["finds it difficult to control the worry", "worry-hard-to-control"],
    ["easy fatigability", "fatigue"],
    ["persistent concern about additional attacks", "persistent-concern-future-attacks"],
    ["fear of being outside the home alone", "avoid-leaving-home-alone"],
    ["worried that escape might be difficult", "fear-escape-help-unavailable"],
    ["requires a companion to shop", "needs-companion"],
    ["avoidance of trauma-related stimuli", "avoidance-trauma-reminders"],
    ["marked hyperarousal", "hypervigilance"],
  ] as const)("%s -> %s", (text, id) => {
    expect(ids(analyze(text).match.matches)).toContain(id);
  });
});

describe("cultural idioms of distress: recognized, never scored (LOW)", () => {
  it("names the idiom without mapping it to a condition", () => {
    const { match, result } = analyze("Ataque de nervios after her mother's death; nervios; thinking too much; heart racing.");
    expect(ids(match.matches)).toContain("cultural-idiom-of-distress");
    for (const s of result.suggestions) expect(s.matched.map((m) => m.symptomId)).not.toContain("cultural-idiom-of-distress");
    expect(result.status).toBe("insufficient");
  });
});

describe("scoring: required features and red flags change the reading (HIGH)", () => {
  it("PTSD without a documented traumatic event is held at moderate with a flag", () => {
    const { result } = analyze(
      "Nightmares, flashbacks, intrusive memories, avoids reminders, triggered by reminders, jumpy, always on guard, feels numb, blames herself, irritable, can't concentrate, can't sleep.",
    );
    const ptsd = suggestion(result, "ptsd");
    expect(ptsd?.strength).toBe("moderate");
    expect(ptsd?.score).toBeLessThan(65);
    expect(ptsd?.flags.find((f) => f.type === "required")?.message).toMatch(/traumatic event is not documented/);
  });

  it("the same picture with the event documented can be strong", () => {
    const { result } = analyze(
      "Assaulted last year. Nightmares, flashbacks, intrusive memories, avoids reminders, triggered by reminders, jumpy, always on guard, feels numb, blames herself, irritable, can't concentrate, can't sleep.",
    );
    expect(suggestion(result, "ptsd")?.strength).toBe("strong");
  });

  it("documented mania holds MDD at moderate and points to bipolar disorder", () => {
    const { result, flags } = analyze(
      "Low mood and loss of interest for 3 weeks, can't sleep, exhausted, feels worthless. Last spring had 4 days of no sleep but full of energy, spending sprees, felt invincible.",
      "1to6m",
    );
    expect(flags).toEqual(["mania"]);
    const mdd = suggestion(result, "major-depressive-disorder");
    expect(mdd?.strength).toBe("moderate");
    expect(mdd?.flags.find((f) => f.type === "red-flag")?.message).toMatch(/bipolar disorder \(ICD-10-CM F31\.x\)/);
  });

  it("psychotic symptoms next to depression add the psychotic-features flag", () => {
    const { result } = analyze(
      "Low mood and loss of interest, can't sleep, exhausted, feels worthless, can't concentrate, no appetite. Hearing voices telling her she is bad.",
      "1to6m",
    );
    expect(suggestion(result, "major-depressive-disorder")?.flags.find((f) => f.type === "red-flag")?.message).toMatch(/F32\.3 \/ F33\.3/);
  });

  it("withdrawal signs add a substance flag to every suggestion even with the substance toggle unset", () => {
    const { result, flags } = analyze(
      "Every morning shaky, needs a drink in the morning; sudden panic out of nowhere, worried about another attack.",
      "1to6m",
    );
    expect(flags).toEqual(["withdrawal"]);
    const panic = suggestion(result, "panic-disorder");
    expect(panic?.flags.find((f) => f.type === "substance")?.message).toMatch(/withdrawal is documented.*Alcohol or benzodiazepine withdrawal/);
  });
});

describe("scoring: breadth counts distinct symptom areas (MEDIUM)", () => {
  it("GAD with one supporting area documented stays moderate", () => {
    const { result } = analyze("Worried about everything, can't stop worrying, anxious, upset stomach, tired.");
    const gad = suggestion(result, "generalized-anxiety-disorder");
    expect(gad?.strength).toBe("moderate");
    expect(gad?.flags.find((f) => f.type === "breadth")?.message).toMatch(/Only 1 of the symptom areas/);
  });

  it("MDD counts sleeping too little and too much as one area, and passive and active SI as one", () => {
    const { result } = analyze("Low mood, no interest in anything, can't sleep, sleeping all day, wants to die, suicidal thoughts.", "1to6m");
    const mdd = suggestion(result, "major-depressive-disorder");
    expect(mdd?.strength).toBe("moderate");
    expect(mdd?.flags.map((f) => f.type)).toContain("breadth");
  });
});

describe("scoring engine: groups, required features, area minimum and red-flag rules (fixtures)", () => {
  const SURGE = ["panic-attacks", "fear-of-attacks", "palpitations"];

  it("features in one group fill one slot at the highest matched weight", () => {
    const grouped = cloneCondition("fx-surge", "fx-grouped", "Grouped (fixture)", {
      features: [
        { symptomId: "panic-attacks", kind: "core", weight: 5, group: "attacks" },
        { symptomId: "palpitations", kind: "core", weight: 3, group: "attacks" },
        { symptomId: "fear-of-attacks", kind: "core", weight: 4 },
        { symptomId: "restlessness", kind: "associated", weight: 1 },
        { symptomId: "insomnia", kind: "associated", weight: 1 },
      ],
    });
    const at = (symptomIds: string[]) => scoreConditions(input(symptomIds), [grouped], fxSymptoms).suggestions[0];
    // C = 5 (group) + 4 = 9, A = 2. Both group members matched still count 5, not 8:
    // 100 * (0.7 * 9/9 + 0.3 * 1/2) = 85.
    expect(at(["panic-attacks", "palpitations", "fear-of-attacks", "restlessness"])?.score).toBe(85);
    expect(at(["panic-attacks", "fear-of-attacks", "restlessness"])?.score).toBe(85);
    // Only the lighter member: 3 of the slot's 5 -> 100 * (0.7 * 7/9 + 0.15) = 69.4.
    expect(at(["palpitations", "fear-of-attacks", "restlessness"])?.score).toBe(69);
  });

  it("a missing required feature holds a strong match at 64 with its note", () => {
    const c = cloneCondition("fx-surge", "fx-required", "Required (fixture)", {
      requiredFeatures: [{ symptomId: "insomnia", note: "Fixture: the required feature is not documented." }],
    });
    const s = scoreConditions(input(SURGE), [c], fxSymptoms).suggestions[0];
    expect(s).toMatchObject({ score: 64, strength: "moderate" });
    expect(s?.flags.find((f) => f.type === "required")?.message).toMatch(/^Fixture: the required feature is not documented\. Strength held/);
    expect(scoreConditions(input([...SURGE, "insomnia"]), [c], fxSymptoms).suggestions[0]?.strength).toBe("strong");
  });

  it("strongMinAreas holds a strong match until enough distinct areas are documented", () => {
    const c = cloneCondition("fx-surge", "fx-areas", "Areas (fixture)", {
      strongMinAreas: 2,
      features: [
        { symptomId: "panic-attacks", kind: "core", weight: 5 },
        { symptomId: "fear-of-attacks", kind: "core", weight: 4 },
        { symptomId: "palpitations", kind: "associated", weight: 2, breadthArea: true },
        { symptomId: "restlessness", kind: "associated", weight: 1, breadthArea: true },
        { symptomId: "insomnia", kind: "associated", weight: 1, breadthArea: true },
      ],
    });
    expect(scoreConditions(input(SURGE), [c], fxSymptoms).suggestions[0]).toMatchObject({ score: 64, strength: "moderate" });
    expect(scoreConditions(input([...SURGE, "insomnia"]), [c], fxSymptoms).suggestions[0]?.strength).toBe("strong");
  });

  it("a red-flag rule adds its message and applies its cap only when that red flag is present", () => {
    const c = cloneCondition("fx-surge", "fx-rules", "Rules (fixture)", {
      redFlagRules: [{ type: "psychosis", capAt: "moderate", message: "Fixture: psychotic symptoms change how to read this." }],
    });
    const plain = scoreConditions(input(SURGE), [c], fxSymptoms).suggestions[0];
    expect(plain?.strength).toBe("strong");
    expect(plain?.flags.map((f) => f.type)).not.toContain("red-flag");
    const r = scoreConditions(input([...SURGE, "hearing-voices"]), [c], fxSymptoms);
    expect(r.redFlags.map((f) => f.type)).toEqual(["psychosis"]);
    expect(r.suggestions[0]).toMatchObject({ score: 64, strength: "moderate" });
    expect(r.suggestions[0]?.flags.find((f) => f.type === "red-flag")?.message).toMatch(/^Fixture: psychotic symptoms/);
  });
});

describe("Symptom Finder analysis: messages and non-scored mentions (LOW)", () => {
  it("says nothing was recognized when text was typed but nothing matched", () => {
    const typed = analyzeSession({ ...initialSession, symptomText: "Talked about the weather and her commute." });
    expect(typed.result.status).toBe("empty");
    expect(typed.result.message).toBe(NO_MATCH_MESSAGE);
    expect(analyzeSession(initialSession).result.message).toBe(EMPTY_MESSAGE);
  });

  it("keeps cultural idioms and family history out of the scored ids but lists them", () => {
    const a = analyzeSession({ ...initialSession, symptomText: "Nervios since the move. Mother has depression." });
    expect(a.ids).toEqual([]);
    expect(a.cultural.map((s) => s.id)).toEqual(["cultural-idiom-of-distress"]);
    expect(a.attributed.map((x) => x.symptomId)).toEqual(["depressed-mood"]);
  });
});
