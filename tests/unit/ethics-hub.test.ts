/**
 * Ethics & Legal Hub, round 4: the ethics-in-practice topic kind, new legal topics and hub prompts, link checks
 * (seeAlso, link-out measures under G7), the AI-in-practice wording against the owner amendment, honest verification
 * status, and the /ethics page grouping, lazy bodies and weight.
 */
import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { SessionProvider } from "@/state/session";
import { legalTopics } from "@/lib/library";
import { legalRaw } from "@/lib/generated/legal";
import {
  HUB_CONTEXTS,
  HUB_PROMPTS,
  LegalTopicSchema,
  legalTopicLinkProblems,
  legalTopicsFor,
  needsHumanCheck,
  type LegalTopic,
} from "@/lib/schemas-hub";
import { HUB_CONTEXT_LABELS, LEGAL_KIND_LABELS, buildHubIndex, hubCountries, topicPlaceLabel } from "@/components/ethics/hub-labels";
import { matchesFacets } from "@/components/ethics/facet-index";
import { HubPrompt } from "@/components/hub/hub-prompt";
import EthicsPage from "@/app/(clinician)/ethics/page";

const h = React.createElement;
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const byId = new Map(legalTopics.map((t) => [t.id, t] as const));

/** Topics this round adds (plan bucket ethics-legal); every one must exist with the planned kind. */
const ETHICS_PRACTICE = [
  "emerging-treatments-and-psychedelics",
  "memory-and-suggestion-safeguards",
  "touch-and-body-based-work",
  "competence-and-scope-of-practice",
  "group-confidentiality",
  "clinician-wellbeing-and-impairment",
  "ethical-decision-making",
  "multiple-relationships-and-boundaries",
  "continuity-and-professional-will",
  "between-session-contact-policy",
  "conversion-practices",
  "treating-and-forensic-roles",
  "contested-practices",
  "clinician-personal-safety",
];
const NEW_LEGAL = [
  "treatment-plans-and-client-access",
  "psychiatric-advance-directives",
  "digital-accessibility",
  "decision-making-capacity",
  "reproductive-health-privacy",
  "military-confidentiality",
  "asylum-and-immigration-evaluations",
  "ai-in-clinical-practice",
  "erpo-and-firearm-transfer",
  "documentation-and-medical-necessity",
  "international-mental-health-law",
];

const base = (over: Partial<LegalTopic> = {}): unknown => ({
  id: "sample-topic",
  title: "Sample topic title",
  jurisdiction: "INTL",
  summary: "A sample summary that is long enough for the schema and says plainly that it is information, not legal advice, for testing only here.",
  keyPoints: ["First key point for the test.", "Second key point for the test.", "Third key point for the test."],
  whatToDo: ["Do the first thing carefully.", "Consult your licensing board or a healthcare attorney."],
  officialLinks: [{ title: "Official page", url: "https://example.org/official" }],
  whenRelevant: ["boundaries"],
  changesOften: false,
  statusAsOf: "2026-06-01",
  verification: { method: "not-verified", note: "Not checked online in this test." },
  sources: [{ title: "Source", publisher: "Publisher", url: "https://example.org/source" }],
  license: "original",
  lastVerified: "2026-11-27",
  reviewedBy: "PENDING",
  ...over,
});

describe("legal topic schema: kind, questions and links", () => {
  it("defaults kind to legal and requires questions for ethics-practice topics", () => {
    expect(LegalTopicSchema.parse(base()).kind).toBe("legal");
    const practice = LegalTopicSchema.safeParse(base({ kind: "ethics-practice" }));
    expect(practice.success).toBe(false);
    expect(JSON.stringify(practice.error?.issues)).toMatch(/questions to ask yourself/);
    const withQuestions = LegalTopicSchema.safeParse(
      base({ kind: "ethics-practice", questions: ["Whose need does this meet?", "Would a colleague agree?", "What would I document?"] }),
    );
    expect(withQuestions.success).toBe(true);
  });

  it("rejects quoted passages in questions and a topic that lists itself in seeAlso", () => {
    expect(LegalTopicSchema.safeParse(base({ questions: ['Did the code say "always"?', "Second question here?", "Third question here?"] })).success).toBe(false);
    expect(LegalTopicSchema.safeParse(base({ seeAlso: ["sample-topic"] })).success).toBe(false);
  });

  it("legalTopicLinkProblems flags unknown seeAlso ids and unregistered or built-in link-out measures (G7)", () => {
    const t = LegalTopicSchema.parse(
      base({ seeAlso: ["no-such-topic"], measuresPending: [{ name: "Some scale", url: "https://example.org/scale", licenseKey: "SOME" }] }),
    );
    expect(legalTopicLinkProblems([t])).toEqual(["legal/sample-topic: seeAlso names unknown topic no-such-topic"]);
    expect(legalTopicLinkProblems([t], {})).toContain("legal/sample-topic: pending measure Some scale has no licenses.json entry SOME (G7)");
    expect(legalTopicLinkProblems([t], { SOME: { status: "confirmed" } }).join()).toMatch(/is confirmed in licenses.json/);
    expect(legalTopicLinkProblems([t], { SOME: { status: "pending" } })).toHaveLength(1); // only the seeAlso problem
  });
});

describe("round 4 topics", () => {
  it("adds every planned topic with the planned kind, and every file parses", () => {
    expect(legalRaw.length).toBe(legalTopics.length);
    for (const id of ETHICS_PRACTICE) expect(byId.get(id)?.kind, id).toBe("ethics-practice");
    for (const id of NEW_LEGAL) expect(byId.get(id)?.kind, id).toBe("legal");
    for (const t of legalTopics.filter((x) => x.kind === "ethics-practice")) expect(t.questions?.length, t.id).toBeGreaterThanOrEqual(3);
  });

  it("keeps every seeAlso link inside the hub", () => {
    expect(legalTopicLinkProblems(legalTopics)).toEqual([]);
  });

  it("is honest about verification: unchecked topics say so and show the re-check badge", () => {
    for (const id of [...ETHICS_PRACTICE, ...NEW_LEGAL]) {
      const t = byId.get(id)!;
      expect(t.verification.method, id).toBe("not-verified");
      expect(needsHumanCheck(t), id).toBe(true);
      expect(t.reviewedBy, id).toBe("PENDING");
      expect(t.lastVerified, id).toBe("2026-11-27");
      expect(t.statusAsOf <= t.lastVerified, id).toBe(true);
    }
  });

  it("keeps the not-legal-advice summary and a final consult step on every topic", () => {
    for (const t of legalTopics) {
      expect(t.summary, t.id).toMatch(/not legal advice/i);
      expect(t.whatToDo.at(-1), t.id).toMatch(/consult/i);
    }
  });

  it("never claims HIPAA certification, never mentions homeopathy and never uses criteria wording", () => {
    const body = JSON.stringify(legalRaw);
    expect(body).not.toMatch(/HIPAA[ -](certified|approved|certification)/i);
    expect(body).not.toMatch(/homeopath/i);
    expect(body).not.toMatch(/\bcriterion\b|meets (the )?criteria/i);
  });

  it("describes the optional AI assistant exactly as the owner amendment allows", () => {
    const ai = byId.get("ai-in-clinical-practice")!;
    const app = ai.appPositioning ?? "";
    for (const must of [/off by default/i, /business associate agreement/i, /for each session/i, /PHI scrubber/i, /For clinician review/, /never a diagnosis or a risk decision/i, /never offered in client mode/i, /records nothing/i]) {
      expect(app, String(must)).toMatch(must);
    }
    expect(app).not.toMatch(/provides? therapy|acts as a therapist/i);
    expect(JSON.stringify(ai)).toMatch(/consent/i);
    expect(ai.keyPoints.join(" ")).toMatch(/scribe/i);
    // The older topics that described the app's AI use agree with the amendment.
    expect(byId.get("informed-consent-technology")!.appPositioning).toMatch(/off by default/);
    expect(byId.get("fda-cds")!.appPositioning).not.toMatch(/no AI model is used/i);
  });

  it("presents conversion and contested practices only as cautions", () => {
    for (const id of ["conversion-practices", "contested-practices"]) expect(byId.get(id)!.kind, id).toBe("ethics-practice");
    expect(byId.get("contested-practices")!.summary).toMatch(/cautions, not recommendations/);
    expect(byId.get("conversion-practices")!.whatToDo[0]).toMatch(/^Never set changing sexual orientation or gender identity as a goal/);
    expect(HUB_PROMPTS["faith-based"].legalIds).toContain("conversion-practices");
  });

  it("links out to measures only, with a license key (ProQOL is never scored here)", () => {
    const pending = legalTopics.flatMap((t) => t.measuresPending ?? []);
    expect(pending.map((m) => m.licenseKey)).toEqual(["ProQOL"]);
    for (const m of pending) expect(m.url).toMatch(/^https:\/\//);
  });

  it("extends language access and subpoenas without losing earlier points", () => {
    const la = byId.get("language-access-interpreters")!;
    expect(la.keyPoints.join(" ")).toMatch(/Title VI/);
    expect(la.keyPoints.join(" ")).toMatch(/92\.201/);
    expect(la.appPositioning).toMatch(/machine-assisted/);
    const sp = byId.get("subpoenas-and-court-orders")!;
    expect(sp.keyPoints.join(" ")).toMatch(/Jaffee v\. Redmond/);
    expect(sp.keyPoints.join(" ")).toMatch(/Standard 9\.04/);
    expect(sp.keyPoints.join(" ")).toMatch(/fact witness/);
  });
});

describe("hub prompts and labels", () => {
  it("has a label and a message for every context, linking only to items that exist", () => {
    const ids = new Set(legalTopics.map((t) => t.id));
    for (const ctx of HUB_CONTEXTS) {
      expect(HUB_CONTEXT_LABELS[ctx], ctx).toBeTruthy();
      expect(HUB_PROMPTS[ctx].message.length, ctx).toBeGreaterThan(40);
      for (const id of HUB_PROMPTS[ctx].legalIds) expect(ids.has(id), `${ctx}:${id}`).toBe(true);
    }
    for (const ctx of ["emerging-treatment", "letters-and-forms", "groups"] as const) expect(HUB_CONTEXTS).toContain(ctx);
  });

  it("renders the new prompts with a link into the hub", () => {
    const html = text(renderToString(h(HubPrompt, { context: "letters-and-forms" })));
    expect(html).toContain(HUB_PROMPTS["letters-and-forms"].message);
    expect(html).toContain('href="/ethics#treating-and-forensic-roles"');
  });

  it("labels where a topic applies, and ethics-in-practice topics show in every country", () => {
    expect(topicPlaceLabel(byId.get("ethical-decision-making")!)).toBe("Any country: check your own code");
    expect(topicPlaceLabel(byId.get("military-confidentiality")!)).toBe("US federal law");
    const countries = hubCountries([], legalTopics);
    const index = buildHubIndex([], legalTopics, countries);
    for (const c of countries)
      for (const id of ETHICS_PRACTICE) expect(matchesFacets(index, "legal", id, { country: c }), `${c}:${id}`).toBe(true);
    expect(legalTopicsFor(legalTopics, { country: "GB" }).map((t) => t.id)).toContain("international-mental-health-law");
    expect(legalTopicsFor(legalTopics, { country: "GB" }).map((t) => t.id)).not.toContain("military-confidentiality");
  });
});

describe("/ethics page", () => {
  const page = text(renderToString(h(SessionProvider, null, h(EthicsPage))));
  const at = (needle: string) => page.indexOf(needle);

  it("groups topics under Ethics in practice and Laws and regulations, after the codes", () => {
    const codes = at('id="codes-heading"');
    const practice = at('id="practice-heading"');
    const laws = at('id="legal-heading"');
    expect(codes).toBeGreaterThan(0);
    expect(practice).toBeGreaterThan(codes);
    expect(laws).toBeGreaterThan(practice);
    for (const id of ETHICS_PRACTICE) {
      expect(at(`id="${id}"`), id).toBeGreaterThan(practice);
      expect(at(`id="${id}"`), id).toBeLessThan(laws);
    }
    for (const id of NEW_LEGAL) expect(at(`id="${id}"`), id).toBeGreaterThan(laws);
    expect(page).toContain(LEGAL_KIND_LABELS["ethics-practice"]);
    expect(page).toContain("For clinician review");
  });

  it("keeps the long parts out of the server HTML and the page light", () => {
    const t = byId.get("group-confidentiality")!;
    expect(page).toContain(t.summary);
    expect(page).not.toContain(t.questions![0]);
    expect(page).not.toContain(t.verification.note);
    expect(page).toContain("Key points, questions to ask and what to do");
    expect(page.length).toBeLessThan(300_000);
  });

  it("lists every hub prompt and keeps the jurisdiction warning on each topic", () => {
    for (const ctx of HUB_CONTEXTS) expect(page, ctx).toContain(HUB_PROMPTS[ctx].message);
    const warnings = page.split("Laws and codes vary by state and country").length - 1;
    expect(warnings).toBe(legalTopics.length);
  });
});
