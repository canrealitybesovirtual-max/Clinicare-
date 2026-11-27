/**
 * Round 4 theory interventions (orientation-specific models, formulations in practice, couple and systemic work,
 * low-intensity formats). Read straight from content/interventions so the checks hold before the generated index is
 * refreshed. Guards what the schema alone cannot: trained-only models say so and stay overview-level, joint
 * sessions are gated on a private violence screen, crisis options stay visible, faith integration is consent-led,
 * orientation links resolve, and evidence grades name the body, direction and source.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InterventionSchema, type Intervention } from "@/lib/schemas-phase2";

const DIR = path.resolve(__dirname, "../../content/interventions");
const IDS = [
  "unified-protocol",
  "metacognitive-therapy",
  "rumination-focused-cbt",
  "core-belief-work",
  "rebt-disputation",
  "cbasp-situational-analysis",
  "intolerance-of-uncertainty-cbt",
  "stress-inoculation-training",
  "one-session-treatment-phobia",
  "behavioral-chain-analysis",
  "transference-focused-psychotherapy",
  "good-psychiatric-management",
  "dynamic-interpersonal-therapy",
  "supportive-psychotherapy",
  "counselling-for-depression",
  "meaning-centered-and-dignity-therapy",
  "systemic-circular-questioning",
  "cbct-for-ptsd",
  "behavioral-couples-therapy",
  "power-and-gender-role-analysis",
  "well-being-therapy",
  "positive-psychology-practices",
  "problem-management-plus",
  "guided-self-help",
  "social-connection-and-loneliness",
] as const;
type Id = (typeof IDS)[number];

/** Proprietary or certified models: overview and referral only, delivered by trained clinicians. */
const TRAINED_ONLY: Id[] = [
  "unified-protocol",
  "metacognitive-therapy",
  "cbasp-situational-analysis",
  "behavioral-chain-analysis",
  "transference-focused-psychotherapy",
  "dynamic-interpersonal-therapy",
  "counselling-for-depression",
  "meaning-centered-and-dignity-therapy",
  "cbct-for-ptsd",
];
const CONJOINT: Id[] = ["systemic-circular-questioning", "cbct-for-ptsd", "behavioral-couples-therapy"];
const GRADE_BODIES = ["NICE", "VA/DoD", "APA", "APA Div 12", "WHO", "Cochrane", "USPSTF", "AASM", "SAMHSA", "other"];

type Grade = { body: string; guideline: string; year: number; conditionId?: string; direction: string; strength: string; url: string };
type Raw = Intervention & { evidenceGrades?: Grade[] };

const load = (id: Id) => JSON.parse(readFileSync(path.join(DIR, `${id}.json`), "utf8")) as Raw;
const raw = Object.fromEntries(IDS.map((id) => [id, load(id)])) as Record<Id, Raw>;
const all: Raw[] = IDS.map((id) => raw[id]);
const text = (i: Raw) => JSON.stringify(i);

describe("round 4 interventions (interventions-a)", () => {
  it.each(IDS)("%s parses against InterventionSchema with original-content governance", (id) => {
    const r = InterventionSchema.safeParse(raw[id]);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
    expect(raw[id].id).toBe(id);
    expect(raw[id]).toMatchObject({ license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" });
    for (const s of raw[id].sources) expect(s.url, id).toMatch(/^https:\/\//);
  });

  it("marks trained-only models as such and keeps them overview-level with a training route", () => {
    for (const id of TRAINED_ONLY) {
      expect(raw[id].trainingRequired, id).toMatch(/trained (clinicians|counsellors) only/);
      expect(raw[id].name, id).toMatch(/overview and referral|chain analysis/i);
      expect(raw[id].steps.some((s) => /trained|training/i.test(s)) || /Full DBT/.test(text(raw[id])), id).toBe(true);
    }
  });

  it("gates every joint session on a private violence and coercion screen", () => {
    for (const id of CONJOINT) {
      const i = raw[id];
      expect(i.steps[0], id).toMatch(/privately/i);
      expect(i.steps[0], id).toMatch(/violence/i);
      expect(i.contraindications.some((c) => /coercive control/i.test(c)), id).toBe(true);
    }
  });

  it("keeps crisis options visible and never decides risk", () => {
    for (const i of all) {
      const crisis = i.contraindications.find((c) => c.includes("988") && c.includes("findahelpline.com"));
      expect(crisis, i.id).toBeDefined();
      expect(crisis, i.id).toMatch(/does not assess or decide risk/);
    }
  });

  it("carries the Part 2 reminder where the intervention can touch substance-use records", () => {
    for (const id of ["behavioral-couples-therapy", "behavioral-chain-analysis"] as const)
      expect(raw[id].contraindications.some((c) => c.includes("42 CFR Part 2")), id).toBe(true);
  });

  it("offers faith integration only as an optional, consent-led variant", () => {
    const withFaith = all.filter((i) => i.faithIntegrated);
    expect(withFaith.length).toBeGreaterThan(0);
    for (const i of withFaith) {
      expect(i.faithIntegrated!.consentNote, i.id).toMatch(/optional/);
      expect(i.faithIntegrated!.consentNote, i.id).toMatch(/never introduce, impose/);
      expect(i.sources.map((s) => s.url), i.id).toEqual(expect.arrayContaining(["https://aacc.net/aacc-code-of-ethics/"]));
    }
  });

  it("links each intervention to at least one existing orientation profile", () => {
    for (const i of all) {
      expect(i.orientationIds?.length, i.id).toBeGreaterThan(0);
      for (const o of i.orientationIds ?? [])
        expect(existsSync(path.resolve(__dirname, "../../content/orientations", `${o}.json`)), `${i.id} -> ${o}`).toBe(true);
    }
  });

  it("states evidence grades with the rating body, direction, the body's own strength term and a source", () => {
    const graded = all.filter((i) => i.evidenceGrades?.length);
    expect(graded.map((i) => i.id)).toEqual(
      expect.arrayContaining(["stress-inoculation-training", "behavioral-couples-therapy", "guided-self-help", "counselling-for-depression"]),
    );
    for (const i of graded)
      for (const g of i.evidenceGrades!) {
        expect(GRADE_BODIES, i.id).toContain(g.body);
        expect(["for", "against", "insufficient"], i.id).toContain(g.direction);
        expect(Number.isInteger(g.year), i.id).toBe(true);
        expect(g.strength.length, i.id).toBeGreaterThan(2);
        expect(g.url, i.id).toMatch(/^https:\/\//);
        if (g.conditionId) expect(i.conditions, i.id).toContain(g.conditionId);
      }
    // The 2023 VA/DoD update moved stress inoculation training from "suggested" to insufficient evidence.
    expect(raw["stress-inoculation-training"].evidenceGrades!.find((g) => g.year === 2023)?.direction).toBe("insufficient");
  });

  it("keeps clinician scripts free of diagnostic verdicts and never presents routine debriefing or contested methods as treatment", () => {
    for (const i of all) {
      const body = text(i);
      expect(body, i.id).not.toMatch(/\bthe diagnosis is\b|\bmeets (the )?criteria\b|\bconfirmed diagnosis\b/i);
      expect(body, i.id).not.toMatch(/debriefing|recovered memor|rebirthing|conversion therapy/i);
    }
  });
});
