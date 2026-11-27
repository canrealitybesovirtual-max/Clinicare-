/**
 * Practice guides (content/practice): every planned guide loads with governance, original wording and verified-style
 * sources; safety guides show the crisis resources; substance-use links carry the Part 2 flag; pending measures are
 * link-outs; tool links point at real app routes; the cross-file checks catch broken links; and the index groups
 * guides in the fixed category order without ranking them.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { licenses } from "@/lib/content";
import { handouts } from "@/lib/library";
import { orientations } from "@/lib/orientations";
import { getPracticeGuide, practiceByCategory, practiceGuides, practiceLinks, practiceProblems, type PracticeRefs } from "@/lib/practice";
import { PRACTICE_CATEGORIES, PracticeGuideSchema, type PracticeGuide } from "@/lib/schemas-practice";

const ROOT = path.resolve(__dirname, "../..");

/** The guides this section owns (the safety-care section writes the safety, coordination and medical guides). */
const PRACTICE_IDS = [
  "alliance-and-rupture-repair",
  "outcome-monitoring",
  "preferences-goals-and-readiness",
  "goals-by-orientation",
  "goal-attainment-scaling",
  "shared-decision-making",
  "validation-levels",
  "socratic-questioning",
  "session-structure",
  "between-session-practice",
  "intake-assessment",
  "mental-status-exam",
  "working-with-interpreters",
  "group-formats",
  "couples-and-conjoint-sessions",
  "involving-family-and-supports",
  "supervision-and-consultation",
  "clinician-reactions-and-self-disclosure",
  "ending-therapy-and-boosters",
  "teach-back-and-plain-language",
  "unwanted-effects-of-therapy",
  "multicultural-orientation-and-broaching",
  "first-sessions-and-role-induction",
  "trauma-informed-care",
  "recovery-and-harm-reduction",
] as const;

const mine = (): PracticeGuide[] => PRACTICE_IDS.map((id) => getPracticeGuide(id)!).filter(Boolean);

/** Every text field a reader sees, one string at a time. */
function texts(g: PracticeGuide): string[] {
  return [
    g.title,
    g.summary,
    ...g.whenToUse,
    ...g.steps.flatMap((s) => [s.heading, s.body ?? "", ...(s.items ?? [])]),
    ...g.prompts,
    ...g.cautions,
    ...(g.adaptations ?? []).flatMap((a) => [a.context, a.adaptation]),
    g.evidenceSummary ?? "",
  ].filter(Boolean);
}

describe("practice guide content", () => {
  it("loads every planned guide", () => {
    for (const id of PRACTICE_IDS) expect(getPracticeGuide(id), id).toBeDefined();
    expect(new Set(practiceGuides.map((g) => g.id)).size).toBe(practiceGuides.length);
  });

  it("carries governance: original license, verified date, pending review and https sources", () => {
    for (const g of mine()) {
      expect(g.license, g.id).toBe("original");
      expect(g.lastVerified, g.id).toBe("2026-11-27");
      expect(g.reviewedBy, g.id).toBe("PENDING");
      expect(g.sources.length, g.id).toBeGreaterThan(0);
      for (const s of g.sources) expect(s.url, `${g.id} ${s.title}`).toMatch(/^https:\/\//);
    }
  });

  it("is written in original wording without criteria language or a final diagnosis", () => {
    for (const g of mine())
      for (const t of texts(g)) {
        expect(t, g.id).not.toMatch(/["“”]/);
        expect(t, g.id).not.toMatch(/\bcriteri(on|a)\b|\bmeets criteria\b|\bthe diagnosis is\b|homeopath/i);
      }
  });

  it("never scores or grades risk", () => {
    for (const g of mine())
      for (const t of texts(g)) expect(t, g.id).not.toMatch(/\b(low|moderate|medium|high)[- ]risk (patient|client|category|level)\b|\brisk score of\b/i);
  });

  it("shows the crisis resources on every safety guide and on guides that talk about suicide", () => {
    for (const g of practiceGuides) if (g.category === "safety-and-risk") expect(g.crisisPanel, g.id).toBe(true);
    for (const g of mine()) if (texts(g).some((t) => /\bsuicid/i.test(t))) expect(g.crisisPanel, g.id).toBe(true);
  });

  it("flags Part 2 whenever a substance-use handout is linked", () => {
    const sudHandouts = new Set(handouts.filter((h) => h.sud).map((h) => h.id));
    for (const g of practiceGuides)
      if (g.relatedHandoutIds.some((h) => sudHandouts.has(h))) expect(g.sud, g.id).toBe(true);
    for (const id of ["preferences-goals-and-readiness", "intake-assessment", "recovery-and-harm-reduction", "couples-and-conjoint-sessions"])
      expect(getPracticeGuide(id)?.sud, id).toBe(true);
  });

  it("keeps other measures as pending link-outs (only GAD-7 and PHQ-9 are built in)", () => {
    for (const g of practiceGuides)
      for (const m of g.measuresPending) {
        expect(m.licenseKey, g.id).not.toMatch(/^(PHQ-9|GAD-7)$/);
        const lic = licenses.items[m.licenseKey];
        if (lic) expect(lic.status, `${g.id} ${m.licenseKey}`).not.toBe("confirmed");
      }
  });

  it("links each tool to a route that exists in the app", () => {
    for (const g of mine()) {
      if (!g.toolHref) continue;
      const page = path.join(ROOT, "src/app/(clinician)", g.toolHref, "page.tsx");
      expect(existsSync(page), `${g.id} -> ${g.toolHref}`).toBe(true);
    }
    expect(getPracticeGuide("goals-by-orientation")?.toolHref).toBe("/tools/goals");
    expect(getPracticeGuide("shared-decision-making")?.toolHref).toBe("/tools/option-grid");
  });

  it("uses blank lines, not placeholders, in message templates", () => {
    for (const g of mine()) for (const p of g.prompts) expect(p, g.id).not.toMatch(/\[[A-Za-z ]+\]|<[a-z ]+>/);
    expect(getPracticeGuide("ending-therapy-and-boosters")?.prompts.some((p) => p.includes("____") && p.includes("988"))).toBe(true);
  });

  it("marks trained-only models and keeps contested practices as cautions", () => {
    const dbt = getPracticeGuide("group-formats")!;
    expect(texts(dbt).some((t) => /trained clinicians only/i.test(t))).toBe(true);
    const tic = getPracticeGuide("trauma-informed-care")!;
    expect(tic.cautions.some((c) => /debriefing/i.test(c))).toBe(true);
    expect(tic.cautions.some((c) => /suggestive/i.test(c))).toBe(true);
  });

  it("covers every practice guide that orientation profiles point to from this section", () => {
    const planned = new Set<string>(PRACTICE_IDS);
    for (const o of orientations)
      for (const id of o.relatedPracticeIds) if (planned.has(id)) expect(getPracticeGuide(id), `${o.id} -> ${id}`).toBeDefined();
  });
});

describe("practice loader", () => {
  it("groups guides in the fixed category order with no empty groups", () => {
    const groups = practiceByCategory();
    const order = groups.map((g) => PRACTICE_CATEGORIES.indexOf(g.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(practiceGuides.length);
  });

  it("resolves links in the guide's order and finds orientations that point back", () => {
    const g = getPracticeGuide("alliance-and-rupture-repair")!;
    const links = practiceLinks(g);
    expect(links.interventions.map((i) => i.id)).toEqual(g.relatedInterventionIds.filter((id) => links.interventions.some((i) => i.id === id)));
    for (const o of links.orientations) expect(o.relatedPracticeIds).toContain(g.id);
  });

  const guide = PracticeGuideSchema.parse({
    ...getPracticeGuide("session-structure")!,
    relatedInterventionIds: ["problem-solving", "not-an-intervention"],
    relatedHandoutIds: ["drinking-diary"],
    relatedPracticeIds: ["missing-guide"],
    measuresPending: [{ name: "Example confirmed measure", url: "https://pubmed.ncbi.nlm.nih.gov/11556941/", licenseKey: "PHQ-9" }],
    sud: false,
  });
  const refs: PracticeRefs = {
    interventions: new Set(["problem-solving"]),
    handouts: new Set(["drinking-diary"]),
    formulations: new Set(),
    legal: new Set(),
    sudHandouts: new Set(["drinking-diary"]),
    licenses: { "PHQ-9": { status: "confirmed" } },
  };

  it("reports unknown links, built-in measures listed as pending, and missing Part 2 flags", () => {
    const p = practiceProblems([guide], refs, "2026-11-27");
    expect(p).toContain("practice/session-structure: unknown intervention not-an-intervention");
    expect(p).toContain("practice/session-structure: unknown practice guide missing-guide");
    expect(p.some((x) => x.includes("is confirmed in licenses.json"))).toBe(true);
    expect(p).toContain("practice/session-structure: links a substance-use handout but sud is false (G6)");
  });

  it("reports duplicate ids and future verification dates", () => {
    const p = practiceProblems([guide, guide], refs, "2026-01-01");
    expect(p).toContain("practice: duplicate id session-structure");
    expect(p.some((x) => x.includes("lastVerified in the future"))).toBe(true);
  });

  it("rejects a safety guide without the crisis panel and quoted wording", () => {
    const base = getPracticeGuide("intake-assessment")!;
    expect(PracticeGuideSchema.safeParse({ ...base, category: "safety-and-risk", crisisPanel: false }).success).toBe(false);
    expect(PracticeGuideSchema.safeParse({ ...base, prompts: ['Say "exactly this" to the client.'] }).success).toBe(false);
    expect(PracticeGuideSchema.safeParse({ ...base, relatedPracticeIds: [base.id] }).success).toBe(false);
  });
});
