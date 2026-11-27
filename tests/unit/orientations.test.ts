// @vitest-environment jsdom
/**
 * Orientation profiles (content/orientations): the schema's guardrails (original wording, honest evidence tiers,
 * training links for trained-only models, a competence prompt), the mapping between profiles and library
 * interventions, a fixed non-ranking order on the index, and server-rendered pages that link every technique to
 * its intervention page and keep the clinician-review label and crisis line visible, with axe structural checks
 * (colour contrast is covered by the e2e suite).
 */
import axe from "axe-core";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contentFiles } from "../../scripts/gen-content-index";
import { interventions } from "@/lib/library";
import { getOrientation, orientationLinks, orientationProblems, orientations, orientationsByFamily } from "@/lib/orientations";
import {
  COMPETENCE_LEGAL_ID,
  ORIENTATION_FAMILIES,
  OrientationSchema,
  isOrientationExempt,
  type Orientation,
} from "@/lib/schemas-orientations";
import OrientationsPage from "@/app/(clinician)/orientations/page";
import OrientationPage, { generateStaticParams } from "@/app/(clinician)/orientations/[id]/page";

const html = (el: ReactElement) =>
  renderToString(el).replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** Axe structural rules on server-rendered markup (contrast needs real CSS, so the e2e suite checks it). */
async function axeViolations(markup: string): Promise<string[]> {
  document.body.innerHTML = `<main>${markup}</main>`;
  const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}
const sample = (): Orientation => structuredClone(getOrientation("cognitive-therapy")!);
const issues = (o: unknown) => {
  const r = OrientationSchema.safeParse(o);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("orientation content", () => {
  it("loads every file in content/orientations", () => {
    expect(orientations.map((o) => `${o.id}.json`).sort()).toEqual(contentFiles("orientations"));
    expect(orientations.length).toBeGreaterThanOrEqual(16);
  });

  it("keeps governance on every profile and points one ethics prompt at practicing within training", () => {
    for (const o of orientations) {
      expect(o.license, o.id).toBe("original");
      expect(o.sources.length, o.id).toBeGreaterThan(0);
      expect(o.ethicsPrompts.some((e) => e.legalIds.includes(COMPETENCE_LEGAL_ID)), o.id).toBe(true);
    }
  });

  it("has no internal cross-reference problems beyond ids that other sections are still adding", () => {
    // Unknown ids (planned interventions, handouts and legal topics) resolve once those sections land; any other
    // problem, such as a one-way link between a profile and an intervention, fails here.
    expect(orientationProblems().filter((p) => !/: unknown /.test(p))).toEqual([]);
  });
});

describe("orientation schema guardrails", () => {
  it("accepts a real profile", () => {
    expect(issues(sample())).toEqual([]);
  });

  it("refuses quoted passages (original wording only)", () => {
    const o = sample();
    o.viewOfChange = `As the manual puts it, "thoughts are not facts", which matters for change in this model.`;
    expect(issues(o).join(" ")).toMatch(/original wording only/);
  });

  it("keeps the headline tier equal to the best-supported model, so a badge never overstates the evidence", () => {
    const o = sample();
    o.evidenceTier = "guideline-recommended";
    o.models = o.models.map((m) => ({ ...m, evidenceTier: "emerging" as const }));
    expect(issues(o).join(" ")).toMatch(/strongest tier/);
  });

  it("needs a training body link when a model is for trained clinicians only", () => {
    const o = sample();
    o.models = o.models.map((m, i) => ({ ...m, trainingRequired: i === 0 }));
    o.trainingPath = [];
    expect(issues(o).join(" ")).toMatch(/trainingPath/);
  });

  it("marks a profile trained-only exactly when every model is", () => {
    const o = sample();
    o.trainingRequired = true;
    expect(issues(o).join(" ")).toMatch(/every model requires specific training/);
  });

  it("requires the competence prompt and cited years in evidence", () => {
    const o = sample();
    o.ethicsPrompts = o.ethicsPrompts.map((e) => ({ ...e, legalIds: ["treatment-plans-and-client-access"] }));
    o.models[0] = { ...o.models[0]!, evidence: "Supported by several guidelines and many trials across conditions." };
    const msgs = issues(o).join(" ");
    expect(msgs).toMatch(new RegExp(COMPETENCE_LEGAL_ID));
    expect(msgs).toMatch(/with its year/);
  });

  it("does not list one intervention as both typical and related", () => {
    const o = sample();
    o.relatedTechniques = [o.typicalTechniques[0]!];
    expect(issues(o).join(" ")).toMatch(/both typical and related/);
  });
});

describe("profiles and the interventions library", () => {
  it("maps every intervention to at least one profile, except care, harm-reduction and safety steps", () => {
    const unmapped = interventions.filter((i) => !(i.orientationIds ?? []).length && !isOrientationExempt(i)).map((i) => i.id);
    expect(unmapped).toEqual([]);
    for (const i of interventions)
      for (const id of i.orientationIds ?? []) expect(getOrientation(id), `${i.id} -> ${id}`).toBeDefined();
  });

  it("links both ways: a mapped intervention is one of its profile's techniques, and vice versa", () => {
    for (const i of interventions)
      for (const id of i.orientationIds ?? []) expect(getOrientation(id)?.typicalTechniques, `${id} lists ${i.id}`).toContain(i.id);
    for (const o of orientations)
      for (const iv of orientationLinks(o).typical) expect(iv.orientationIds, `${iv.id} lists ${o.id}`).toContain(o.id);
  });

  it("exempts only care, harm-reduction and safety steps", () => {
    const exempt = interventions.filter(isOrientationExempt).map((i) => i.id);
    expect(exempt).toEqual(expect.arrayContaining(["collaborative-safety-planning", "lethal-means-counseling", "naloxone-overdose-education"]));
    expect(exempt).not.toContain("thought-record");
  });
});

describe("/orientations", () => {
  const page = html(createElement(OrientationsPage));

  it("groups profiles by family in a fixed order and lists names A to Z, never by evidence", () => {
    const groups = orientationsByFamily();
    const order = groups.map((g) => ORIENTATION_FAMILIES.indexOf(g.family));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const g of groups) expect(g.items.map((o) => o.name)).toEqual([...g.items.map((o) => o.name)].sort((a, b) => a.localeCompare(b)));
    let last = -1;
    for (const g of groups) {
      const at = page.indexOf(`id="family-${g.family}-heading"`);
      expect(at, g.family).toBeGreaterThan(last);
      last = at;
    }
  });

  it("passes axe structural checks", async () => {
    expect(await axeViolations(page)).toEqual([]);
  });

  it("has one h1, a card for every profile and says it does not choose for a client", () => {
    expect(count(page, "<h1")).toBe(1);
    for (const o of orientations) expect(page, o.id).toContain(`href="/orientations/${o.id}"`);
    expect(page).toContain("For clinician review");
    expect(page).toContain("does not rank orientations or choose one for a client");
  });
});

describe("/orientations/[id]", () => {
  it("prerenders a page for every profile", () => {
    expect(generateStaticParams().map((p) => p.id).sort()).toEqual(orientations.map((o) => o.id).sort());
  });

  it.each(orientations.map((o) => o.id))("%s: one h1, review label, crisis line and a link for every technique", async (id) => {
    const o = getOrientation(id)!;
    const page = html(await OrientationPage({ params: Promise.resolve({ id }) }));
    expect(count(page, "<h1")).toBe(1);
    expect(page).toContain("For clinician review");
    expect(page).toContain("call or text 988");
    expect(page).toContain("findahelpline.com");
    const links = orientationLinks(o);
    for (const iv of [...links.typical, ...links.related]) expect(page, iv.id).toContain(`href="/interventions/${iv.id}"`);
    for (const f of links.formulations) expect(page, f.id).toContain(`href="/formulations/${f.id}"`);
    for (const t of o.trainingPath) expect(page, t.url).toContain(`href="${t.url}" target="_blank" rel="noopener noreferrer"`);
    for (const s of o.sources) expect(page, s.url).toContain(s.url);
  });

  it.each(["cognitive-therapy", "integrative-common-factors", "somatic-and-parts-based-therapies"])("%s passes axe structural checks", async (id) => {
    expect(await axeViolations(html(await OrientationPage({ params: Promise.resolve({ id }) })))).toEqual([]);
  });

  it("flags trained-only profiles and describes them as overviews for referral", async () => {
    const page = html(await OrientationPage({ params: Promise.resolve({ id: "somatic-and-parts-based-therapies" }) }));
    expect(page).toContain("Trained clinicians only");
    expect(page).toContain("overview for referral");
    expect(page).not.toContain('id="script"'); // overviews only: no read-aloud manual wording
  });

  it("shows the responsiveness prompts without asking anything about the client", async () => {
    const page = html(await OrientationPage({ params: Promise.resolve({ id: "integrative-common-factors" }) }));
    expect(page).toContain("Adapting therapy to the person");
    expect(page).toContain("never asks for these characteristics");
    expect(page).not.toMatch(/<(input|textarea|select)\b/);
  });
});
