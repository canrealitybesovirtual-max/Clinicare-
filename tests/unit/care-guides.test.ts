/**
 * Safety-and-care practice guides (round 4, safety-care): every planned guide exists and follows the safety rules:
 * crisis resources inline where risk is involved, the For clinician review label, no risk score or level, Part 2
 * tagging where substance use is mentioned, original wording and governance.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPracticeGuide } from "@/lib/practice";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import type { PracticeGuide } from "@/lib/schemas-practice";

const SAFETY_CARE_IDS = [
  "caring-contacts",
  "care-transitions-and-warm-handoffs",
  "self-harm-assessment-and-formulation",
  "in-session-de-escalation",
  "violence-risk-prompts",
  "ipv-screening-and-first-line-support",
  "postpartum-psychosis-vs-intrusive-thoughts",
  "medication-induced-psychiatric-symptoms",
  "psychotropic-red-flags",
  "eating-disorder-medical-risk",
  "stepped-care-and-level-of-care",
  "collaborative-care-and-pcbh",
  "combined-care-decision-points",
  "diagnostic-reasoning-checks",
  "mental-health-app-evaluation",
  "problem-prioritization",
  "clinician-postvention",
  "telehealth-sessions",
] as const;

const ALLOWED = new Set(["safety-and-risk", "care-coordination", "medical-interface", "documents"]);
const guides: PracticeGuide[] = SAFETY_CARE_IDS.map((id) => {
  const g = getPracticeGuide(id);
  if (!g) throw new Error(`missing practice guide ${id}`);
  return g;
});

/** Every string in a guide. */
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
const sentences = (g: PracticeGuide) => strings(g).flatMap((s) => s.split(/(?<=[.!?])\s+/));

describe("safety-care practice guides", () => {
  it("all 18 load, in the safety-care categories, with governance", () => {
    for (const g of guides) {
      expect(ALLOWED.has(g.category), g.id).toBe(true);
      expect(g.license).toBe("original");
      expect(g.lastVerified).toBe("2026-11-27");
      expect(g.reviewedBy).toBe("PENDING");
      expect(g.sources.length, g.id).toBeGreaterThan(0);
      expect(g.forClinicianReview, g.id).toBe(true);
    }
  });

  it("risk-related guides show the crisis resources inline (G9)", () => {
    for (const g of guides) if (g.category === "safety-and-risk") expect(g.crisisPanel, g.id).toBe(true);
    for (const id of ["medication-induced-psychiatric-symptoms", "psychotropic-red-flags", "eating-disorder-medical-risk", "telehealth-sessions"])
      expect(getPracticeGuide(id)!.crisisPanel, id).toBe(true);
  });

  it("never produce a risk score, level or category (G9)", () => {
    for (const g of guides)
      for (const s of sentences(g)) {
        if (/\b(?:low|medium|moderate|high)[- ]risk\b|\brisk (?:score|level|category)\b|\blow, medium or high\b/i.test(s))
          expect(s, `${g.id}: ${s}`).toMatch(/\b(?:no|not|never|without|instead of|rather than|do not|against)\b/i);
      }
  });

  it("say that nothing in the app decides risk where risk is discussed", () => {
    for (const id of ["self-harm-assessment-and-formulation", "violence-risk-prompts", "in-session-de-escalation", "ipv-screening-and-first-line-support", "caring-contacts"])
      expect(
        getPracticeGuide(id)!.cautions.some((c) => /\b(?:judge|decide)s? risk\b/i.test(c) && /\b(?:not|never|nothing)\b/i.test(c)),
        id,
      ).toBe(true);
  });

  it("carry the Part 2 flag whenever their wording mentions substance use (G6)", () => {
    // Citations (sources and link-outs) keep their published titles; the guide's own wording is what is checked.
    for (const g of guides) {
      const { sources: _sources, linkOuts: _linkOuts, ...wording } = g;
      if (strings(wording).some(mentionsSubstanceUse)) expect(g.sud, g.id).toBe(true);
    }
  });

  it("use original wording: no double quotes and no criteria structure (G1)", () => {
    for (const g of guides)
      for (const s of strings(g)) {
        expect(s, g.id).not.toMatch(/["“”]/);
        expect(s, g.id).not.toMatch(/\bcriterion\b|DSM-5(?:-TR)? criteria|\bmeets criteria\b/i);
      }
  });

  it("tool links point at routes that exist", () => {
    const appDir = path.resolve(__dirname, "../../src/app/(clinician)");
    for (const g of guides) if (g.toolHref) expect(existsSync(path.join(appDir, g.toolHref, "page.tsx")), `${g.id}: ${g.toolHref}`).toBe(true);
  });

  it("other measures are link-outs with a license key, never built in (G7)", () => {
    for (const g of guides)
      for (const m of g.measuresPending) {
        expect(m.url).toMatch(/^https:\/\//);
        expect(["PHQ-9", "GAD-7"]).not.toContain(m.licenseKey);
      }
  });
});
