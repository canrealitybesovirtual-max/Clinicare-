/**
 * Guided follow-up engine (src/lib/follow-up/engine.ts): ranking, safety, applying answers, determinism,
 * the "panic from dogs" case end to end, and no network / no storage.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conditions, lexicon } from "@/lib/content";
import { matchSymptoms } from "@/lib/matcher";
import { containsPHI, scrubPHI } from "@/lib/phi-scrubber";
import { ConditionSchema, SymptomLexiconSchema, type Condition } from "@/lib/schemas";
import { scoreConditions } from "@/lib/scoring";
import { TRIGGER_TOKEN, type FollowUpQuestionDef } from "@/lib/schemas-follow-up";
import type { ScoringInput } from "@/lib/types";
import { followUpBank } from "@/lib/follow-up/bank";
import {
  REVIEW_LABEL,
  applyAnswer,
  applyAnswers,
  followUpSession,
  nextQuestions,
  type AnsweredRecord,
  type FollowUpQuestion,
} from "@/lib/follow-up/engine";
import { extractTriggers } from "@/lib/follow-up/triggers";
import { resourceHints } from "@/lib/follow-up/catalog";

const ROOT = path.resolve(__dirname, "../..");

const blank = (symptomIds: string[] = [], patch: Partial<ScoringInput> = {}): ScoringInput => ({
  symptomIds,
  duration: "unknown",
  impairment: "unknown",
  substancePossible: "unknown",
  medicalPossible: "unknown",
  ...patch,
});

/** What the symptoms screen does today: scrub, match, build the base input. */
function session(text: string, answered: AnsweredRecord[] = [], patch: Partial<ScoringInput> = {}, chips: string[] = [], limit?: number) {
  const scrubbed = scrubPHI(text).clean;
  const m = matchSymptoms(scrubbed, lexicon.symptoms);
  const base = blank([...new Set([...chips, ...m.matches.map((x) => x.symptomId)])], patch);
  return followUpSession({
    baseInput: base,
    scrubbedText: scrubbed,
    answered,
    absentSymptomIds: m.negated.map((x) => x.symptomId),
    protectedSymptomIds: chips,
  }, { limit });
}
const ids = (qs: FollowUpQuestion[]) => qs.map((q) => q.id);

/* ------------------------------------------------------------------ "panic from dogs" */

describe('"panic from dogs" end to end', () => {
  // "panic with dogs" is a phrasing the lexicon does not read, so the trigger dictionary alone carries it; since
  // review round 3 the lexicon reads "panic from dogs" itself (fear of animals, cued panic), tested below.
  it("reads the fear in the text itself", () => {
    const s = session("panic from dogs");
    expect(s.scoringResult.status).toBe("ok");
    expect(s.scoringInput.symptomIds).toEqual(expect.arrayContaining(["panic-attack-cued", "circumscribed-fear", "fear-animals"]));
    expect(s.scoringResult.suggestions.map((x) => x.conditionId)).toEqual(["specific-phobia"]);
    expect(ids(s.questions)).toEqual(expect.arrayContaining(["fear-cued-or-unexpected", "fear-avoids-trigger", "gate-duration"]));
  });

  it("extracts an animal trigger from text the lexicon alone cannot use", () => {
    const s = session("panic with dogs");
    expect(s.scoringResult.status).toBe("empty"); // the original complaint: no feedback at all
    expect(s.triggers).toHaveLength(1);
    expect(s.triggers[0]).toMatchObject({ category: "animal", objectId: "dog", phrase: "dogs", cue: "panic" });
  });

  it("asks first whether the attacks happen only around dogs, about avoidance, and about duration", () => {
    const qs = session("panic with dogs").questions;
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(qs[0]?.id).toBe("fear-cued-or-unexpected");
    expect(qs[0]?.text).toBe("Do the attacks happen only around dogs, or also out of the blue?");
    expect(qs[0]?.options.map((o) => o.label)).toContain("Only around dogs");
    expect(ids(qs)).toContain("fear-avoids-trigger");
    expect(qs.find((q) => q.id === "fear-avoids-trigger")?.text).toContain("steer clear of dogs");
    expect(ids(qs)).toContain("gate-duration");
    expect(qs[0]?.whyAsked).toMatch(/"dogs"/);
    expect(qs[0]?.whyAsked).toMatch(/Nothing in the knowledge base matches yet/);
    expect(qs[0]?.trigger).toEqual({ category: "animal", objectId: "dog", label: "dogs", phrase: "dogs" });
  });

  it("answering only-around-dogs + avoids + 6 months + interferes reshapes the input and moves the picture", () => {
    const answers: AnsweredRecord[] = [];
    const script: Record<string, string> = {
      "fear-cued-or-unexpected": "only-trigger",
      "fear-avoids-trigger": "avoids",
      "gate-duration": "gte6m",
      "fear-impairment": "interferes",
    };
    // Answer whatever the engine offers that is in the script, round by round (as a clinician would).
    for (let round = 0; round < 4; round++) {
      const offered = session("panic with dogs", answers).questions;
      for (const q of offered) if (script[q.id] && !answers.some((a) => a.questionId === q.id)) answers.push({ questionId: q.id, answerIds: [script[q.id] as string] });
    }
    expect(answers.map((a) => a.questionId).sort()).toEqual(Object.keys(script).sort());

    const s = session("panic with dogs", answers);
    expect(s.scoringInput).toEqual({
      symptomIds: ["panic-attack-cued", "circumscribed-fear", "phobic-avoidance"],
      duration: "gte6m",
      impairment: "yes",
      substancePossible: "unknown",
      medicalPossible: "unknown",
    });
    expect(s.folded.negatedSymptomIds).toEqual(expect.arrayContaining(["panic-attacks-unexpected", "panic-attacks-unspecified"]));
    // Answered questions are not asked again.
    for (const a of answers) expect(ids(s.questions)).not.toContain(a.questionId);

    // Against the conditions on disk right now (the other workflow is adding specific phobia).
    const dir = path.join(ROOT, "content/conditions");
    const onDisk: Condition[] = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => ConditionSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))));
    const lex = SymptomLexiconSchema.parse(JSON.parse(readFileSync(path.join(ROOT, "content/symptoms.json"), "utf8")));
    const result = scoreConditions(s.scoringInput, onDisk, lex.symptoms);
    const rank = (id: string) => result.suggestions.findIndex((x) => x.conditionId === id);
    // Panic disorder needs unexpected attacks: after "only around dogs" it is no longer suggested.
    expect(rank("panic-disorder")).toBe(-1);
    if (onDisk.some((c) => c.id === "specific-phobia")) {
      expect(rank("specific-phobia"), "specific phobia should now be suggested above panic disorder").toBeGreaterThanOrEqual(0);
    }

    // The other answer keeps panic disorder in view: the question really discriminates.
    const alt = session("panic with dogs", [{ questionId: "fear-cued-or-unexpected", answerIds: ["also-unexpected"] }]);
    expect(alt.scoringResult.suggestions.map((x) => x.conditionId)).toContain("panic-disorder");
  });

  it("suggests graded exposure, the exposure ladder handout and a psychologist or counselor for an animal trigger", () => {
    const s = session("panic from dogs");
    const h = resourceHints(s.scoringResult, s.triggers);
    expect(h.interventionIds[0]).toBe("graded-in-vivo-exposure");
    expect(h.handoutIds).toContain("exposure-ladder");
    expect(h.referralKinds).toEqual(expect.arrayContaining(["psychologist", "professional-counselor"]));
    expect(h.measureIds).toEqual([]);
    expect(h.label).toBe(REVIEW_LABEL);
  });
});

/* ------------------------------------------------------------------ safety */

describe("safety questions", () => {
  it("come first whenever depressive signals appear", () => {
    const qs = session("low mood most days, feels worthless").questions;
    expect(qs[0]?.id).toBe("safety-ask-directly");
    expect(qs[0]?.tier).toBe(0);
    expect(qs[0]?.whyAsked).toMatch(/never estimates risk/);
  });

  it("are offered for trauma reminders and for substance signals too, but not for a plain dog fear", () => {
    expect(ids(session("afraid of driving since the accident").questions)).toContain("safety-ask-directly");
    expect(ids(session("can't sleep", [], { substancePossible: "yes" }).questions)).toContain("safety-ask-directly");
    expect(ids(session("panic from dogs").questions)).not.toContain("safety-ask-directly");
  });

  it("a 'yes' records the statement, raises the red flag and surfaces crisis resources and safety planning", () => {
    const base = blank(["depressed-mood"]);
    const r = applyAnswer(base, "safety-ask-directly", ["suicidal-thoughts"]);
    expect(r.scoringInput.symptomIds).toEqual(["depressed-mood", "suicidal-ideation-active"]);
    expect(r.surfaces).toEqual(["crisis-resources", "safety-plan", "lethal-means"]);
    const result = scoreConditions(r.scoringInput, conditions, lexicon.symptoms);
    expect(result.redFlags.map((f) => f.type)).toContain("suicidality");
    // Follow-ups for means and the safety plan are offered next, still first in line.
    const next = nextQuestions({ scoringInput: r.scoringInput, scoringResult: result, triggers: [], answered: [r.record] });
    expect(ids(next).slice(0, 2)).toEqual(["safety-lethal-means", "safety-plan"]);
  });

  it("a 'no' changes nothing, and 'not asked yet' keeps the question in the queue", () => {
    const base = blank(["depressed-mood", "passive-death-wish"]);
    const no = applyAnswer(base, "safety-ask-directly", "denied");
    expect(no.scoringInput).toEqual(base);
    expect(no.surfaces).toEqual([]);
    const later = applyAnswer(base, "safety-ask-directly", "not-yet");
    expect(later.keepOpen).toBe(true);
    const result = scoreConditions(base, conditions, lexicon.symptoms);
    expect(ids(nextQuestions({ scoringInput: base, scoringResult: result, triggers: [], answered: [later.record] }))).toContain("safety-ask-directly");
    expect(ids(nextQuestions({ scoringInput: base, scoringResult: result, triggers: [], answered: [no.record] }))).not.toContain("safety-ask-directly");
  });

  it("never removes a red-flag symptom, even if a (malformed) bank tried to", () => {
    const evil = {
      ...(followUpBank.find((q) => q.id === "gate-impairment") as FollowUpQuestionDef),
      id: "evil-negation",
      options: [
        { id: "x", label: "x", effects: { negateSymptomIds: ["suicidal-ideation-active", "anhedonia"] }, surfaces: [], keepOpen: false, exclusive: false },
        { id: "y", label: "y", effects: {}, surfaces: [], keepOpen: false, exclusive: false },
      ],
    } satisfies FollowUpQuestionDef;
    const r = applyAnswer(blank(["suicidal-ideation-active", "anhedonia"]), "evil-negation", "x", { bank: [...followUpBank, evil] });
    expect(r.scoringInput.symptomIds).toEqual(["suicidal-ideation-active"]);
  });

  it("no rendered question or option carries a risk level", () => {
    const s = session("hopeless, wants to die, drinking heavily, nightmares since the assault");
    const json = JSON.stringify(s.questions);
    expect(json).not.toMatch(/"risk(Level|Score)?"\s*:/i);
    expect(json).not.toMatch(/\b(high|low|moderate) risk\b/i);
  });
});

/* ------------------------------------------------------------------ ranking and explanation */

describe("ranking", () => {
  it("discriminating questions name the candidates they bear on", () => {
    const qs = session("unexpected panic attacks, heart racing").questions;
    const q = qs.find((x) => x.id === "fear-cued-or-unexpected");
    expect(q?.text).toBe("Do the panic attacks come out of the blue, or only in particular situations?");
    expect(q?.whyAsked).toMatch(/Panic disorder/);
    expect(q?.discriminates.map((d) => d.conditionId)).toEqual(expect.arrayContaining(["panic-disorder", "agoraphobia"]));
  });

  it("asks about a missing key feature of the top candidate", () => {
    const qs = session("low mood most days").questions;
    const q = qs.find((x) => x.id === "mood-interest");
    expect(q?.tier).toBe(3);
    expect(q?.whyAsked).toMatch(/key feature of Major depressive disorder/);
  });

  it("a blood-injection-injury trigger yields trigger-specific questions", () => {
    const s = session("afraid of needles");
    const trig = s.questions.filter((q) => q.trigger);
    expect(trig.length).toBeGreaterThanOrEqual(3);
    for (const q of trig) expect(q.trigger?.category).toBe("blood-injection-injury");
    expect(ids(s.questions)).toContain("fear-fainting");
  });

  it("offers gates only while unknown, and at most one question per group", () => {
    const known = session("worries about everything", [], { duration: "gte6m", impairment: "yes" }).questions;
    expect(ids(known)).not.toContain("gate-duration");
    expect(ids(known)).not.toContain("gate-impairment");
    for (const text of ["low mood most days", "nightmares since the assault", "can't sleep", "panic from dogs"]) {
      const qs = session(text).questions;
      const groups = qs.map((q) => followUpBank.find((d) => d.id === q.id)?.group).filter(Boolean);
      expect(new Set(groups).size, text).toBe(groups.length);
    }
  });

  it("skips a question once every symptom it asks about is known", () => {
    const qs = session("worries about everything and can't control the worry").questions;
    expect(ids(qs)).not.toContain("worry-control");
    const absent = session("denies nightmares, flashbacks or intrusive memories", [], {}, ["traumatic-event-exposure"]).questions;
    expect(ids(absent)).not.toContain("trauma-reliving");
  });

  it("follows answer dependencies: substances -> alcohol pattern -> withdrawal (a safety check)", () => {
    const a1: AnsweredRecord[] = [{ questionId: "ruleout-substances", answerIds: ["alcohol"] }];
    const s1 = session("can't sleep", a1);
    expect(ids(s1.questions)).toContain("alcohol-pattern");
    const pattern = s1.questions.find((q) => q.id === "alcohol-pattern");
    expect(pattern?.sud).toBe(true);
    expect(pattern?.part2Notice).toMatch(/42 CFR Part 2/);
    const s2 = session("can't sleep", [...a1, { questionId: "alcohol-pattern", answerIds: ["heavy"] }]);
    expect(ids(s2.questions).slice(0, 2)).toEqual(expect.arrayContaining(["alcohol-withdrawal", "safety-ask-directly"]));
    const w = applyAnswer(s2.scoringInput, "alcohol-withdrawal", "yes");
    expect(w.surfaces).toEqual(["urgent-medical", "part2-notice"]);
    expect(w.scoringInput.symptomIds).toContain("alcohol-benzo-withdrawal");
  });

  it("an AND condition keeps mood-only questions out of a fear presentation", () => {
    const qs = session("panic from dogs", [{ questionId: "gate-duration", answerIds: ["gte6m"] }]).questions;
    expect(ids(qs)).not.toContain("mood-years");
    const mood = session("low mood most days", [{ questionId: "gate-duration", answerIds: ["gte6m"] }], {}, [], 10).questions;
    expect(ids(mood)).toContain("mood-years");
  });

  it("every rendered question is labeled, explained, fully templated and PHI-free", () => {
    const texts = [
      "panic from dogs",
      "Maria Lopez is afraid of needles since the accident; low mood; drinking a lot",
      "worries about germs, can't sleep",
      "freaks out around spiders and avoids parties",
      "grieving, low mood",
    ];
    for (const t of texts) {
      for (const q of session(t).questions) {
        expect(q.label).toBe(REVIEW_LABEL);
        expect(q.whyAsked.length).toBeGreaterThan(10);
        expect(q.why.length).toBeGreaterThan(10);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        const all = [q.text, q.why, q.whyAsked, ...q.options.flatMap((o) => [o.label, o.note ?? ""])].join(" ");
        expect(all, q.id).not.toContain(TRIGGER_TOKEN);
        expect(all, q.id).not.toMatch(/Maria|Lopez/);
        expect(containsPHI(all), q.id).toBe(false);
      }
    }
  });

  it("respects the limit and returns nothing in client mode", () => {
    const s = session("low mood, nightmares since the assault, panic attacks");
    const ctx = { scoringInput: s.scoringInput, scoringResult: s.scoringResult, triggers: s.triggers, answered: [] };
    expect(nextQuestions(ctx, { limit: 3 })).toHaveLength(3);
    expect(nextQuestions(ctx, { limit: 0 })).toEqual([]);
    expect(nextQuestions(ctx).length).toBeLessThanOrEqual(5);
    expect(nextQuestions(ctx, { mode: "client" })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ applying answers */

describe("applyAnswer / applyAnswers", () => {
  it("is pure: the input object is never mutated", () => {
    const base = blank(["panic-attacks-unspecified"]);
    const copy = structuredClone(base);
    applyAnswer(base, "fear-cued-or-unexpected", "only-trigger");
    expect(base).toEqual(copy);
  });

  it("applies the effect vocabulary (add, negate, duration, impairment, substance, medical, trigger category)", () => {
    let input = blank(["panic-attacks-unspecified"]);
    input = applyAnswer(input, "fear-cued-or-unexpected", "also-unexpected").scoringInput;
    expect(input.symptomIds).toEqual(["panic-attacks-unexpected", "panic-attack-cued"]);
    expect(applyAnswer(input, "gate-duration", "1to6m").scoringInput.duration).toBe("1to6m");
    expect(applyAnswer(input, "gate-impairment", "no").scoringInput.impairment).toBe("no");
    expect(applyAnswer(input, "ruleout-substances", ["caffeine", "medication"]).scoringInput.substancePossible).toBe("yes");
    expect(applyAnswer(input, "ruleout-medical-anxiety", "checked-clear").scoringInput.medicalPossible).toBe("no");
    expect(applyAnswer(input, "worry-scope", "illness").triggerCategories).toEqual(["health"]);
  });

  it("rejects unknown ids, two answers to a single-choice question, and exclusive options combined", () => {
    const base = blank();
    expect(() => applyAnswer(base, "no-such-question", "x")).toThrow(RangeError);
    expect(() => applyAnswer(base, "gate-duration", "forever")).toThrow(RangeError);
    expect(() => applyAnswer(base, "gate-duration", ["lt2w", "gte6m"])).toThrow(RangeError);
    expect(() => applyAnswer(base, "trauma-reliving", ["memories", "none"])).toThrow(RangeError);
    expect(() => applyAnswer(base, "gate-duration", [])).toThrow(RangeError);
  });

  it("folds answers in order, keeps the last answer per question, skips unknown records and protects chips", () => {
    const base = blank(["panic-attacks-unexpected"]);
    const answered: AnsweredRecord[] = [
      { questionId: "gate-duration", answerIds: ["lt2w"] },
      { questionId: "nope", answerIds: ["x"] },
      { questionId: "fear-cued-or-unexpected", answerIds: ["only-trigger"] },
      { questionId: "gate-duration", answerIds: ["gte6m"] },
    ];
    const f = applyAnswers(base, answered);
    expect(f.scoringInput.duration).toBe("gte6m");
    expect(f.invalid).toEqual([{ questionId: "nope", answerIds: ["x"] }]);
    expect(f.scoringInput.symptomIds).toEqual(["panic-attack-cued", "circumscribed-fear"]);
    // Net "noted absent": the removed chip-free id and the id the answer rules out.
    expect(f.negatedSymptomIds).toEqual(["panic-attacks-unexpected", "panic-attacks-unspecified"]);
    const kept = applyAnswers(base, answered, { protectedSymptomIds: ["panic-attacks-unexpected"] });
    expect(kept.scoringInput.symptomIds).toEqual(["panic-attacks-unexpected", "panic-attack-cued", "circumscribed-fear"]);
  });

  it("multi-select answers apply in bank order whatever the order given", () => {
    const a = applyAnswer(blank(), "trauma-reliving", ["flashbacks", "memories"]);
    const b = applyAnswer(blank(), "trauma-reliving", ["memories", "flashbacks"]);
    expect(a).toEqual(b);
    expect(a.scoringInput.symptomIds).toEqual(["intrusive-memories", "flashbacks"]);
  });
});

/* ------------------------------------------------------------------ determinism and privacy */

describe("determinism, no network, no storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives identical output for identical input, whatever the order of symptoms, bank or conditions", () => {
    const s = session("low mood, nightmares since the assault, unexpected panic attacks, avoids crowds");
    const ctx = { scoringInput: s.scoringInput, scoringResult: s.scoringResult, triggers: s.triggers, answered: [] };
    const first = nextQuestions(ctx);
    expect(nextQuestions(ctx)).toEqual(first);
    const shuffled = { ...ctx, scoringInput: { ...ctx.scoringInput, symptomIds: [...ctx.scoringInput.symptomIds].reverse() } };
    expect(nextQuestions(shuffled)).toEqual(first);
    expect(nextQuestions(ctx, { bank: [...followUpBank].reverse(), conditions: [...conditions].reverse() })).toEqual(first);
  });

  it("never calls the network while extracting, ranking, applying and hinting", () => {
    const boom = vi.fn(() => {
      throw new Error("network access attempted");
    });
    vi.stubGlobal("fetch", boom);
    vi.stubGlobal("XMLHttpRequest", boom);
    vi.stubGlobal("WebSocket", boom);
    vi.stubGlobal("navigator", { sendBeacon: boom });
    const s = session("panic from dogs; low mood; drinks heavily", [
      { questionId: "fear-cued-or-unexpected", answerIds: ["only-trigger"] },
      { questionId: "safety-ask-directly", answerIds: ["denied"] },
    ]);
    resourceHints(s.scoringResult, s.triggers, { surfaces: s.folded.surfaces });
    expect(boom).not.toHaveBeenCalled();
  });

  it("source files contain no network, storage, logging or AI calls", () => {
    const dir = path.join(ROOT, "src/lib/follow-up");
    const files = [...readdirSync(dir).map((f) => path.join(dir, f)), path.join(ROOT, "src/lib/schemas-follow-up.ts")];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
      expect(src, f).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(src, f).not.toMatch(/anthropic|openai|Date\.now|new Date|Math\.random/);
    }
    expect(existsSync(path.join(dir, "engine.ts"))).toBe(true);
  });
});
