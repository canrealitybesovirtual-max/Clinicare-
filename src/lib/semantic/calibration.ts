/**
 * Calibration set for the on-device semantic matcher (DEFAULT_THRESHOLD / DEFAULT_MARGIN in core.ts).
 * Original, invented paraphrases of the way clients and clinicians describe symptoms; no real client
 * text. Used by `npx tsx scripts/build-lexicon-embeddings.ts --calibrate` and
 * tests/integrations/semantic.test.ts.
 *
 * Each case lists `expect`: groups of lexicon ids, one group per symptom the text describes (any id in a
 * group counts as finding it), and `also`: further ids a clinician would accept as sensible. A RegExp
 * also accepts ids the lexicon adds later (for example an animal-fear symptom). Negative cases
 * (`expect: []`) should return nothing at the chosen settings.
 */
import type { SemanticSuggestion } from "./core";

export type IdMatcher = string | RegExp;

export interface CalibrationCase {
  text: string;
  expect: readonly (readonly IdMatcher[])[];
  also?: readonly IdMatcher[];
}

/** Ids that would count as an animal / specific-object fear if the lexicon adds one. */
export const SPECIFIC_FEAR_PATTERN = /phobi|animal|specific-(fear|object)|feared-(object|situation)|circumscribed-fear/;
const PANIC_CUED: readonly IdMatcher[] = ["panic-attack-cued", "panic-attacks-unspecified", SPECIFIC_FEAR_PATTERN];

export const SEMANTIC_CALIBRATION_SET: readonly CalibrationCase[] = [
  // Panic and specific fears
  { text: "panic from dogs", expect: [PANIC_CUED] },
  { text: "freaks out near dogs", expect: [PANIC_CUED], also: ["subjective-anxiety-stress"] },
  { text: "gets panicky every time she sees a spider", expect: [PANIC_CUED] },
  { text: "cant breathe in crowds", expect: [["shortness-of-breath", "avoid-crowds-lines", "panic-attack-cued"]] },
  {
    text: "out of nowhere her heart starts racing and she thinks shes dying",
    expect: [["panic-attacks-unexpected", "panic-attacks-unspecified"], ["fear-of-dying"]],
    also: ["palpitations"],
  },
  { text: "heart pounds out of my chest", expect: [["palpitations"]] },
  { text: "afraid he will lose control and go crazy", expect: [["fear-losing-control"]] },
  { text: "dreads having another attack", expect: [["persistent-concern-future-attacks", "anticipatory-anxiety"]] },
  { text: "hot flashes and chills during the attacks", expect: [["chills-heat-sensations"]] },
  { text: "pins and needles in her fingers", expect: [["numbness-tingling"]] },
  { text: "dizzy and lightheaded like he might pass out", expect: [["dizziness"]] },
  { text: "everything feels unreal like a dream", expect: [["derealization-depersonalization"]] },
  { text: "hands shake and she sweats a lot", expect: [["trembling"], ["sweating"]] },
  { text: "tight pressure in the chest", expect: [["chest-pain"]] },
  { text: "feels sick to her stomach before meetings", expect: [["nausea-abdominal-distress", "anticipatory-anxiety"]] },
  // Avoidance
  { text: "wont take the bus or the subway anymore", expect: [["avoid-public-transport"]] },
  { text: "only goes out if her husband comes along", expect: [["needs-companion", "avoid-leaving-home-alone"]] },
  { text: "hasnt left the apartment by himself in months", expect: [["avoid-leaving-home-alone", "needs-companion"]] },
  // Worry and tension
  { text: "worried about everything all the time", expect: [["worry-excessive", "worry-hard-to-control"]], also: ["subjective-anxiety-stress"] },
  { text: "cant shut her mind off from worrying", expect: [["worry-hard-to-control", "worry-excessive"]] },
  { text: "jaw and shoulders always tense", expect: [["muscle-tension"]] },
  { text: "pacing and cant sit still", expect: [["restlessness", "psychomotor-change"]] },
  { text: "snaps at his kids over nothing", expect: [["irritability"]] },
  { text: "keeps losing track of what she is reading", expect: [["concentration-difficulty"]] },
  // Mood and sleep
  { text: "no interest in anything anymore", expect: [["anhedonia"]] },
  { text: "feels down and empty most days", expect: [["depressed-mood"]], also: ["emotional-numbing-detachment"] },
  { text: "lies awake until 3am every night", expect: [["insomnia"]] },
  { text: "sleeping 14 hours a day", expect: [["hypersomnia"]], also: ["fatigue"] },
  { text: "exhausted all the time with no energy", expect: [["fatigue"]] },
  { text: "barely eating and dropped a lot of weight", expect: [["appetite-change", "severe-food-restriction"]] },
  { text: "feels like a total failure", expect: [["worthlessness-guilt"]], also: ["negative-beliefs", "depressed-mood"] },
  { text: "stopped seeing her friends", expect: [["social-withdrawal"]] },
  { text: "full of energy after two hours of sleep", expect: [["decreased-need-for-sleep"]], also: ["grandiosity-elevated-mood"] },
  // Safety: suggested for clinician review only; never a risk decision
  { text: "wishes she could go to sleep and never wake up", expect: [["passive-death-wish", "suicidal-ideation-active"]] },
  { text: "has been thinking about killing himself", expect: [["suicidal-ideation-active", "passive-death-wish"]] },
  { text: "cuts her arms when she gets upset", expect: [["self-harm"]] },
  { text: "hears voices that nobody else hears", expect: [["hallucinations"]] },
  { text: "thinks the neighbors are spying on him", expect: [["paranoia-delusions"]], also: ["hypervigilance"] },
  { text: "gets the shakes when he stops drinking", expect: [["alcohol-benzo-withdrawal"]], also: ["trembling"] },
  // Trauma
  { text: "keeps reliving the crash", expect: [["flashbacks", "intrusive-memories"]], also: ["traumatic-event-exposure"] },
  { text: "bad dreams about the assault", expect: [["nightmares"]], also: ["traumatic-event-exposure", "intrusive-memories"] },
  { text: "jumps at every loud noise", expect: [["startle", "hypervigilance"]] },
  { text: "always scanning the room for danger", expect: [["hypervigilance"]] },
  { text: "avoids driving past where the accident happened", expect: [["avoidance-trauma-reminders"]], also: ["traumatic-event-exposure"] },
  { text: "feels numb and cut off from her family", expect: [["emotional-numbing-detachment"]], also: ["social-withdrawal"] },
  { text: "the smell of smoke sets her off", expect: [["cue-reactivity"]] },
  { text: "cant remember parts of the attack", expect: [["trauma-memory-gaps"]], also: ["traumatic-event-exposure"] },
  { text: "drives way too fast since the accident", expect: [["reckless-self-destructive"]], also: ["traumatic-event-exposure"] },
  // Multi-symptom notes (each group must be found)
  {
    text: "She panics around dogs, cant sleep at night and feels worthless.",
    expect: [PANIC_CUED, ["insomnia"], ["worthlessness-guilt"]],
    also: ["depressed-mood"],
  },
  {
    text: "Since the crash he has nightmares, jumps at loud noises and avoids driving.",
    expect: [["nightmares"], ["startle", "hypervigilance"], ["avoidance-trauma-reminders"]],
    also: ["traumatic-event-exposure", "intrusive-memories", "avoid-public-transport"],
  },
  {
    text: "Denies SI. Reports low mood and no interest in her hobbies.",
    expect: [["depressed-mood"], ["anhedonia"]],
  },
  {
    text: "Worries constantly about money and the kids, muscles always tight, wiped out by noon.",
    expect: [["worry-excessive", "worry-hard-to-control"], ["muscle-tension"], ["fatigue"]],
  },
  { text: "No nightmares or flashbacks, but she startles easily.", expect: [["startle", "hypervigilance"]] },
  // Negative cases: ordinary, non-symptom text and negated mentions
  { text: "works as a teacher and has two kids", expect: [] },
  { text: "came to the session on time", expect: [] },
  { text: "the weather was nice today", expect: [] },
  { text: "plays soccer on the weekends", expect: [] },
  { text: "recently started a new job at the bank", expect: [] },
  { text: "likes walking her dogs in the park", expect: [] },
  { text: "no nightmares", expect: [] },
  { text: "denies suicidal thoughts", expect: [] },
  { text: "no panic attacks this week", expect: [] },
  { text: "is not afraid of dogs", expect: [] },
];

const hit = (m: IdMatcher, id: string): boolean => (typeof m === "string" ? m === id : m.test(id));

export function isRelevant(c: CalibrationCase, symptomId: string): boolean {
  return c.expect.some((g) => g.some((m) => hit(m, symptomId))) || (c.also ?? []).some((m) => hit(m, symptomId));
}

export interface CalibrationReport {
  threshold: number;
  cases: number;
  groups: number;
  negatives: number;
  /** Returned suggestions that are relevant / all returned suggestions (negative cases included). */
  precision: number;
  /** Expected groups found / expected groups. */
  recall: number;
  /** Positive cases whose first suggestion is relevant / positive cases. */
  top1: number;
  /** Negative cases with no suggestion at all / negative cases. */
  negativesClean: number;
  misses: string[];
  falsePositives: string[];
}

/** `results[i]` are the suggestions for `cases[i]`; anything below `threshold` is ignored. */
export function evaluateCalibration(
  cases: readonly CalibrationCase[],
  results: readonly (readonly SemanticSuggestion[])[],
  threshold: number,
): CalibrationReport {
  let returned = 0;
  let relevantReturned = 0;
  let groups = 0;
  let found = 0;
  let positives = 0;
  let top1 = 0;
  let negatives = 0;
  let clean = 0;
  const misses: string[] = [];
  const falsePositives: string[] = [];
  cases.forEach((c, i) => {
    const r = (results[i] ?? []).filter((s) => s.score >= threshold);
    returned += r.length;
    for (const s of r) {
      if (isRelevant(c, s.symptomId)) relevantReturned++;
      else falsePositives.push(`${c.text} -> ${s.symptomId} (${s.score}, "${s.phrase}")`);
    }
    if (c.expect.length === 0) {
      negatives++;
      if (r.length === 0) clean++;
      return;
    }
    positives++;
    if (r[0] && isRelevant(c, r[0].symptomId)) top1++;
    c.expect.forEach((g, gi) => {
      groups++;
      if (r.some((s) => g.some((m) => hit(m, s.symptomId)))) found++;
      else misses.push(c.expect.length > 1 ? `${c.text} [group ${gi + 1}]` : c.text);
    });
  });
  const ratio = (a: number, b: number): number => (b === 0 ? 1 : Math.round((a / b) * 1000) / 1000);
  return {
    threshold,
    cases: cases.length,
    groups,
    negatives,
    precision: ratio(relevantReturned, returned),
    recall: ratio(found, groups),
    top1: ratio(top1, positives),
    negativesClean: ratio(clean, negatives),
    misses,
    falsePositives,
  };
}
