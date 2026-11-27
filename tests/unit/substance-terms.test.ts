/**
 * 42 CFR Part 2 detector (G6, src/lib/substance-terms.ts): realistic session wording about drugs other than alcohol
 * must add the Part 2 notice to every export that checks it (session note, referral letter, safety plan, treatment
 * plan), while ordinary clinical wording that only looks similar does not.
 */
import { describe, expect, it } from "vitest";
import { getPlanLibrary } from "@/lib/library";
import { measures } from "@/lib/content";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import { noteRecordsSubstanceUse, type NoteSection } from "@/lib/notes/note";
import { referralRecordsSubstanceUse, type ReferralLetterInput } from "@/lib/tools/referral-letter";
import { safetyPlanMentionsSubstances } from "@/lib/tools/safety-plan";
import { addCustomItem, createDraft, planRecordsSubstanceUse, setItemText, toggleProblem } from "@/components/plan/plan-model";

/** Session wording a first detector missed (review round 3), plus the alcohol phrasing it already caught. */
const SUBSTANCE_PHRASINGS = [
  "Taking oxycodone not prescribed to her, about 4 pills a day.",
  "Smokes pot nightly; vapes THC on weekends.",
  "Uses Xanax from a friend to sleep.",
  "Got high on ketamine at a party last month.",
  "Snorting Percocet; trying to cut down on oxy.",
  "Takes Adderall that is not prescribed to him before exams.",
  "Used MDMA and mushrooms at a festival.",
  "Kratom daily for two years and cannot stop.",
  "Shooting up most days.",
  "Drinking 6 beers most nights.",
];

/** Everyday clinical wording that must not add the notice. */
const ORDINARY = [
  "Fear of needles since childhood; fainted at a blood draw.",
  "Joint pain in both knees limits walking.",
  "Acid reflux at night wakes him up.",
  "Processing speed is slow on testing.",
  "Takes sertraline 50 mg as prescribed; no side effects.",
  "High on energy this week, sleeping 7 hours.",
];

const section = (text: string): NoteSection => ({ id: "s", heading: "Subjective", hint: "", text });

const letter = (note: string): ReferralLetterInput => ({
  serviceId: "medication-evaluation",
  timing: "routine",
  reasonIds: [],
  concerns: [],
  measures: [],
  note,
  sessionSud: false,
});

function planWith(text: string) {
  const library = getPlanLibrary("generalized-anxiety-disorder")!;
  const opts = measures.map((m) => ({ id: m.id, shortName: m.shortName, name: m.name }));
  let d = createDraft({ conditionId: library.conditionId, library }, opts);
  const pid = d.problems[0]!.id;
  d = toggleProblem(d, pid, true);
  const added = addCustomItem(d, pid, "objectives");
  return setItemText(added.draft, pid, "objectives", added.id, text);
}

describe("substance-use wording adds the Part 2 notice on every export", () => {
  it.each(SUBSTANCE_PHRASINGS)("%s", (text) => {
    expect(mentionsSubstanceUse(text)).toBe(true);
    expect(noteRecordsSubstanceUse([section(text)], false)).toBe(true);
    expect(referralRecordsSubstanceUse(letter(text))).toBe(true);
    expect(safetyPlanMentionsSubstances({ "early-signs": text })).toBe(true);
    expect(planRecordsSubstanceUse(planWith(text), { sud: false })).toBe(true);
  });
});

describe("ordinary clinical wording does not", () => {
  it.each(ORDINARY)("%s", (text) => {
    expect(mentionsSubstanceUse(text)).toBe(false);
    expect(noteRecordsSubstanceUse([section(text)], false)).toBe(false);
    expect(referralRecordsSubstanceUse(letter(text))).toBe(false);
    expect(safetyPlanMentionsSubstances({ "early-signs": text })).toBe(false);
    expect(planRecordsSubstanceUse(planWith(text), { sud: false })).toBe(false);
  });
});
