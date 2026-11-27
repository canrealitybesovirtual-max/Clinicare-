/**
 * Round 4 interventions, bucket b (trauma, substance use, serious mental illness, suicide-specific care, sleep,
 * pain, life-stage and population-focused programs, neuromodulation and light). Read straight from
 * content/interventions so the checks hold before the generated index is refreshed. Guards what the schema alone
 * cannot: trained-only models stay overview-level, crisis options stay visible and risk stays with the clinician,
 * substance-use entries carry the exact Part 2 notice, measures other than PHQ-9/GAD-7 are link-outs only,
 * contested practices appear only as cautions, client-facing scripts name no diagnosis, and orientation links and
 * evidence grades are well formed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InterventionSchema, type Intervention } from "@/lib/schemas-phase2";
import { ORIENTATION_EXEMPT_IDS } from "@/lib/schemas-orientations";
import symptomsJson from "../../content/symptoms.json";

const DIR = path.resolve(__dirname, "../../content/interventions");
const PART2_NOTICE = "42 CFR Part 2 prohibits unauthorized use or disclosure of these records.";

/** New ids with the orientation profiles they map to ([] = care, safety or referral step, exempt by id). */
const NEW: Record<string, string[]> = {
  "cognitive-therapy-for-ptsd": ["trauma-focused-therapies", "cognitive-therapy"],
  "imagery-rehearsal-therapy": ["cognitive-therapy", "trauma-focused-therapies"],
  "present-centered-therapy": ["integrative-common-factors"],
  "integrated-ptsd-sud-treatment": ["trauma-focused-therapies", "behavior-therapy"],
  "psychological-first-aid-and-recovery-skills": [],
  "community-reinforcement-approach": ["behavior-therapy"],
  "craft-for-family-members": ["behavior-therapy", "systemic-family-and-couples-therapy"],
  "twelve-step-and-mutual-help-facilitation": [],
  "brief-alcohol-intervention": ["humanistic-experiential-therapy"],
  "mindfulness-oriented-recovery-enhancement": ["mindfulness-and-compassion-based-therapies", "positive-psychology"],
  "family-focused-therapy-bipolar": ["systemic-family-and-couples-therapy", "behavior-therapy"],
  "bipolar-relapse-signature-plan": ["cognitive-therapy"],
  "smi-community-support-referral": [],
  "eating-disorder-specialist-therapies": ["cognitive-therapy", "psychodynamic-therapy"],
  "suicide-specific-psychotherapies": ["cognitive-therapy", "dialectical-behavior-therapy"],
  "suicide-bereavement-support": ["integrative-common-factors"],
  "ocd-appraisal-cognitive-therapy": ["cognitive-therapy"],
  "brief-behavioral-treatment-insomnia": ["behavior-therapy"],
  "cbt-and-act-for-chronic-pain": ["cognitive-therapy", "acceptance-and-commitment-therapy"],
  "perinatal-depression-programs": ["cognitive-therapy", "interpersonal-therapies"],
  "late-life-depression-programs": ["cognitive-therapy", "behavior-therapy"],
  "reminiscence-and-life-review": ["existential-therapy", "integrative-common-factors"],
  "dementia-caregiver-support": ["cognitive-therapy", "behavior-therapy"],
  "lgbtq-affirmative-cbt": ["cognitive-therapy", "multicultural-feminist-liberation"],
  "racial-trauma-and-race-based-stress": ["multicultural-feminist-liberation", "trauma-focused-therapies"],
  "culturally-adapted-cbt": ["cognitive-therapy", "multicultural-feminist-liberation"],
  "ipv-safety-planning": [],
  "bright-light-therapy": [],
  "neuromodulation-referral": [],
};
const IDS = Object.keys(NEW);

/** Proprietary, certified or protocol-trained models: overview and referral only. */
const TRAINED_ONLY = [
  "cognitive-therapy-for-ptsd",
  "integrated-ptsd-sud-treatment",
  "community-reinforcement-approach",
  "craft-for-family-members",
  "mindfulness-oriented-recovery-enhancement",
  "family-focused-therapy-bipolar",
  "eating-disorder-specialist-therapies",
  "suicide-specific-psychotherapies",
  "culturally-adapted-cbt",
];
const SUD_CONDITIONS = new Set([
  "alcohol-use-disorder",
  "opioid-use-disorder",
  "stimulant-use-disorder",
  "cannabis-use-disorder",
  "sedative-hypnotic-use-disorder",
]);
const GRADE_BODIES = ["NICE", "VA/DoD", "APA", "APA Div 12", "WHO", "Cochrane", "USPSTF", "AASM", "SAMHSA", "other"];
/** Measures that are not built in: they may be named only as link-outs (G7). */
const LINK_OUT_MEASURES = /\b(AUDIT-C|AUDIT|Edinburgh Postnatal Depression Scale|EPDS|Mini-Cog|MoCA|Danger Assessment)\b/;
const DIAGNOSIS_WORDS = /PTSD|bipolar|disorder|depress|anorexia|bulimia|\bOCD\b|schizophren|psychos|psychotic|insomnia|panic|anxiety disorder|addict|alcoholi|diagnos/i;

type Grade = { body: string; guideline: string; year: number; conditionId?: string; population?: string; direction: string; strength: string; url: string };
type Raw = Intervention & { evidenceGrades?: Grade[] };

const load = (id: string) => JSON.parse(readFileSync(path.join(DIR, `${id}.json`), "utf8")) as Raw;
const raw = Object.fromEntries(IDS.map((id) => [id, load(id)])) as Record<string, Raw>;
const all = IDS.map((id) => raw[id]!);
const symptomIds = new Set((symptomsJson as { symptoms: { id: string; redFlag?: string }[] }).symptoms.map((s) => s.id));

describe("round 4 interventions (interventions-b)", () => {
  it.each(IDS)("%s parses against InterventionSchema with original-content governance", (id) => {
    const i = raw[id]!;
    const r = InterventionSchema.safeParse(i);
    expect(r.success ? [] : r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`)).toEqual([]);
    expect(i.id).toBe(id);
    expect(i).toMatchObject({ license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" });
    for (const s of i.sources) expect(s.url, id).toMatch(/^https:\/\//);
  });

  it("maps each entry to its planned orientation profiles, and leaves care and safety steps exempt", () => {
    for (const [id, planned] of Object.entries(NEW)) {
      const i = raw[id]!;
      if (planned.length === 0) {
        expect(i.orientationIds, id).toBeUndefined();
        expect(ORIENTATION_EXEMPT_IDS.has(id), id).toBe(true);
        continue;
      }
      expect(i.orientationIds, id).toEqual(planned);
      for (const o of planned) expect(existsSync(path.resolve(__dirname, "../../content/orientations", `${o}.json`)), `${id} -> ${o}`).toBe(true);
    }
  });

  it("keeps trained-only models overview-level, with a training route and a referral step", () => {
    for (const id of TRAINED_ONLY) {
      const i = raw[id]!;
      expect(i.trainingRequired, id).toMatch(/trained clinicians only/);
      expect(i.trainingRequired, id).toMatch(/Otherwise refer/);
      expect(i.name, id).toMatch(/overview and referral/i);
      expect(i.steps.some((s) => /\brefer\b/i.test(s)), id).toBe(true);
    }
  });

  it("keeps crisis options visible and leaves every risk decision with the clinician", () => {
    for (const i of all) {
      const crisis = i.contraindications.find((c) => c.includes("988") && c.includes("findahelpline.com"));
      expect(crisis, i.id).toBeDefined();
      expect(crisis, i.id).toMatch(/This app does not judge risk; you do\./);
    }
    const ssp = raw["suicide-specific-psychotherapies"]!;
    expect(ssp.steps[0]).toMatch(/clinical judgment/);
    expect(ssp.contraindications.some((c) => /Do not use risk scores/.test(c))).toBe(true);
    expect(raw["ipv-safety-planning"]!.purpose).toMatch(/Nothing in this app scores danger/);
  });

  it("offers suicide-specific care only where suicidality is documented, using real symptom ids", () => {
    const suicidality = (symptomsJson as { symptoms: { id: string; redFlag?: string }[] }).symptoms
      .filter((s) => s.redFlag === "suicidality")
      .map((s) => s.id);
    expect([...raw["suicide-specific-psychotherapies"]!.suggestWith!].sort()).toEqual([...suicidality].sort());
    for (const i of all) for (const s of i.suggestWith ?? []) expect(symptomIds.has(s), `${i.id} suggestWith ${s}`).toBe(true);
    expect(raw["imagery-rehearsal-therapy"]!.suggestWith).toEqual(["nightmares"]);
  });

  it("carries the exact Part 2 notice wherever a substance-use condition is listed", () => {
    const sud = all.filter((i) => i.conditions.some((c) => SUD_CONDITIONS.has(c)));
    expect(sud.map((i) => i.id)).toEqual(
      expect.arrayContaining(["integrated-ptsd-sud-treatment", "community-reinforcement-approach", "brief-alcohol-intervention", "brief-behavioral-treatment-insomnia"]),
    );
    for (const i of sud) expect(i.contraindications.some((c) => c.includes(PART2_NOTICE)), i.id).toBe(true);
  });

  it("names measures other than PHQ-9 and GAD-7 only as link-outs", () => {
    for (const i of all)
      for (const text of [i.purpose, ...i.steps, ...i.contraindications])
        if (LINK_OUT_MEASURES.test(text)) expect(text, i.id).toMatch(/link-out|trained, certified|licenses? (is|are)? ?not yet confirmed/i);
    const alcohol = raw["brief-alcohol-intervention"]!;
    expect(alcohol.purpose).toMatch(/never enter responses here/);
  });

  it("presents contested practices only as cautions", () => {
    const pfa = raw["psychological-first-aid-and-recovery-skills"]!;
    for (const s of [...pfa.steps, ...pfa.script]) if (/debrief/i.test(s)) expect(s).toMatch(/Do not/);
    expect(pfa.contraindications.some((c) => /debriefing/.test(c) && /only as a caution/.test(c))).toBe(true);
    expect(pfa.evidenceGrades!.filter((g) => /debriefing/i.test(g.strength)).every((g) => g.direction === "against")).toBe(true);
    const lgbtq = raw["lgbtq-affirmative-cbt"]!;
    expect(lgbtq.contraindications[0]).toMatch(/^Never attempt to change/);
    expect(lgbtq.purpose).toMatch(/never aims to change sexual orientation or gender identity/);
  });

  it("keeps neuromodulation and light therapy at information-and-referral level with their key cautions", () => {
    const light = raw["bright-light-therapy"]!;
    expect(light.contraindications[0]).toMatch(/mania or hypomania/);
    expect(light.contraindications[0]).toMatch(/prescriber/);
    expect(light.contraindications.some((c) => /eye/i.test(c))).toBe(true);
    const neuro = raw["neuromodulation-referral"]!;
    expect(neuro.contraindications[0]).toMatch(/belong to the prescriber/);
    expect(neuro.contraindications.some((c) => /memory/.test(c))).toBe(true);
  });

  it("keeps client-facing scripts free of diagnosis names", () => {
    for (const i of all) for (const line of i.script) expect(line, i.id).not.toMatch(DIAGNOSIS_WORDS);
  });

  it("states evidence grades with the rating body, direction, the body's own strength term and a source", () => {
    const graded = all.filter((i) => i.evidenceGrades?.length);
    expect(graded.length).toBeGreaterThanOrEqual(20);
    for (const i of graded)
      for (const g of i.evidenceGrades!) {
        expect(GRADE_BODIES, i.id).toContain(g.body);
        expect(["for", "against", "insufficient"], i.id).toContain(g.direction);
        expect(Number.isInteger(g.year), i.id).toBe(true);
        expect(g.strength.length, i.id).toBeGreaterThan(2);
        expect(g.url, i.id).toMatch(/^https:\/\//);
        if (g.conditionId) expect(i.conditions, i.id).toContain(g.conditionId);
      }
    // The 2023 VA/DoD PTSD update suggests cognitive therapy for PTSD and present-centered therapy, and found
    // insufficient evidence for or against imagery rehearsal for PTSD-related nightmares.
    const vadod = (id: string) => raw[id]!.evidenceGrades!.find((g) => g.body === "VA/DoD" && g.year === 2023);
    expect(vadod("cognitive-therapy-for-ptsd")?.direction).toBe("for");
    expect(vadod("present-centered-therapy")?.direction).toBe("for");
    expect(vadod("imagery-rehearsal-therapy")?.direction).toBe("insufficient");
  });

  it("wires round 4 handouts and new conditions into existing entries without dropping earlier links", () => {
    const existing = (id: string) => load(id);
    expect(existing("habit-reversal-training").conditions).toEqual(["body-dysmorphic-disorder", "body-focused-repetitive-behaviors"]);
    expect(existing("prolonged-exposure").conditions).toContain("acute-stress-disorder");
    expect(existing("cbti-stimulus-control").handoutIds).toEqual(expect.arrayContaining(["how-sleep-works", "racing-mind-at-bedtime"]));
    expect(existing("moud-referral").handoutIds).toEqual(["overdose-safety", "relapse-prevention-plan", "medicines-for-opioid-use"]);
    const family = existing("family-psychoeducation-psychosis");
    expect(family.handoutIds).toEqual(["staying-well-plan", "listening-to-someone-you-love"]);
    expect(family.evidenceLevel).toMatch(/at least 10 planned sessions/);
  });
});
