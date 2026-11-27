/**
 * Content contract (zod) for practice guides: content/practice/<id>.json -> PracticeGuideSchema.
 *
 * A practice guide describes one clinical process (building the alliance, setting an agenda, working with an
 * interpreter, ending therapy, a safety or care-coordination step) in the app's own words: when to use it, the steps,
 * example clinician wording, cautions, adaptations and the evidence behind it, with links into the library. It is
 * clinician-facing reference only:
 * - ORIGINAL wording only (G1, G2): every text field refuses double quotation marks, so no quoted passage from a
 *   manual, worksheet, book or code can be pasted in. Example wording (prompts) is written for the app.
 * - Licensed measures other than the built-in GAD-7 and PHQ-9 appear only as link-outs (measuresPending) whose
 *   licenseKey is registered in content/licenses.json (G7). Nothing here scores anything.
 * - Safety guides (category safety-and-risk) always show the crisis resources inline (crisisPanel) and never produce
 *   a risk score, level or category (G9). Guides whose wording touches substance use carry sud, which shows the
 *   42 CFR Part 2 notice (G6).
 * - Governance on every item (G10): sources[], license "original", lastVerified, reviewedBy ("PENDING" until a
 *   licensed clinician signs off).
 * Cross-file checks (links, licenses, Part 2 tagging) live in src/lib/practice.ts (practiceProblems).
 * Isomorphic: no server-only imports. Nothing here is ever sent to an external API (G5, G17).
 */
import { z } from "zod";
import { governance, isoDate, slug } from "./schemas";

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export const PRACTICE_CATEGORIES = [
  "session-process",
  "relationship",
  "measurement-and-goals",
  "formats-and-settings",
  "communication-and-access",
  "professional-practice",
  "safety-and-risk",
  "care-coordination",
  "medical-interface",
  "documents",
] as const;
export const PracticeCategory = z.enum(PRACTICE_CATEGORIES);
export type PracticeCategory = z.infer<typeof PracticeCategory>;

/** Index headings, shown in the fixed order above (never a ranking). */
export const PRACTICE_CATEGORY_LABELS: Record<PracticeCategory, { label: string; line: string }> = {
  "session-process": { label: "Running sessions", line: "Structure, agendas, questioning, between-session practice and first and last sessions." },
  relationship: { label: "The therapeutic relationship", line: "Alliance, validation, rupture and repair, and your own reactions." },
  "measurement-and-goals": { label: "Goals and measurement", line: "Goals, preferences, outcome monitoring and shared decisions." },
  "formats-and-settings": { label: "Formats and settings", line: "Groups, couples and involving family or other supports." },
  "communication-and-access": { label: "Communication, access and care stance", line: "Interpreters, plain language, culture, and trauma-informed and recovery-oriented care." },
  "professional-practice": { label: "Professional practice", line: "Assessment structure, supervision, consultation and unwanted effects." },
  "safety-and-risk": { label: "Safety and risk", line: "Assessment and formulation of risk without scores, de-escalation and follow-up." },
  "care-coordination": { label: "Care coordination", line: "Transitions, warm handoffs, stepped and collaborative care." },
  "medical-interface": { label: "Medical interface", line: "Medicine effects, red flags and medical risk to discuss with prescribers." },
  documents: { label: "Documents and digital tools", line: "Reasoning checks, apps and telehealth." },
};

/** Categories whose guides always show the crisis resources inline (G9). */
export const CRISIS_PANEL_CATEGORIES: ReadonlySet<PracticeCategory> = new Set(["safety-and-risk"]);

/* ------------------------------------------------------------------ */
/* Field helpers                                                       */
/* ------------------------------------------------------------------ */

const QUOTES = /["“”]/;
/** Original wording only: no quoted passages from manuals, worksheets, books or codes. */
const original = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !QUOTES.test(s), "original wording only: no quoted passages (remove double quotes)");

const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "https URLs only");
/** A route inside this app (for example /tools/goals); checked against the app folder by the tests. */
const appRoute = z.string().regex(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/, "an app route such as /tools/goals");

/** One step of the process: a heading with an optional paragraph and optional bullet points. */
export const PracticeStepSchema = z
  .strictObject({
    heading: original(3, 120),
    body: original(10, 900).optional(),
    items: z.array(original(3, 400)).min(1).max(14).optional(),
  })
  .refine((s) => s.body !== undefined || s.items !== undefined, "a step needs a body, items or both");
export type PracticeStep = z.infer<typeof PracticeStepSchema>;

/** A public page outside the app (decision aid, guideline, training body). Link-out only; nothing is copied. */
export const PracticeLinkOutSchema = z.strictObject({
  title: original(3, 200),
  publisher: original(2, 160),
  url: httpsUrl,
  note: original(5, 300).optional(),
  lastVerified: isoDate.optional(),
});
export type PracticeLinkOut = z.infer<typeof PracticeLinkOutSchema>;

/** A licensed measure that is NOT built in: link-out only, its licenseKey registered in content/licenses.json (G7). */
export const PendingMeasureSchema = z.strictObject({
  name: original(2, 160),
  url: httpsUrl,
  licenseKey: z.string().min(2).max(40),
});
export type PendingMeasure = z.infer<typeof PendingMeasureSchema>;

/** How the process changes for a group, setting or format (adult scope). */
export const PracticeAdaptationSchema = z.strictObject({
  context: original(3, 100),
  adaptation: original(20, 600),
});
export type PracticeAdaptation = z.infer<typeof PracticeAdaptationSchema>;

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => (seen.has(v) ? true : (seen.add(v), false)));
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

export const PracticeGuideSchema = z
  .strictObject({
    id: slug,
    title: original(3, 120),
    category: PracticeCategory,
    /** What the process is for, in one to three sentences (index card and page intro). */
    summary: original(40, 700),
    whenToUse: z.array(original(10, 400)).min(1).max(10),
    steps: z.array(PracticeStepSchema).min(2).max(14),
    /** Example clinician wording, written for the app (never quoted from a manual). */
    prompts: z.array(original(10, 400)).max(16),
    /** Pitfalls, contraindications and limits. */
    cautions: z.array(original(10, 500)).min(1).max(12),
    /** Ways to adapt the process to a person, setting or format. */
    adaptations: z.array(PracticeAdaptationSchema).max(10).optional(),
    /** What the research says, with the body or study and its year. */
    evidenceSummary: original(40, 1400)
      .refine((s) => /\b(19|20)\d{2}\b/.test(s), "cite the body or study with its year")
      .optional(),
    /** True when the guide suggests anything; the page then shows the For clinician review label. */
    forClinicianReview: z.boolean(),
    /** True to show the crisis resources inline (always true for safety-and-risk). */
    crisisPanel: z.boolean(),
    /** True when the wording touches substance use: the page shows the 42 CFR Part 2 notice (G6). */
    sud: z.boolean(),
    relatedInterventionIds: z.array(slug).max(12),
    relatedHandoutIds: z.array(slug).max(10),
    relatedFormulationIds: z.array(slug).max(6),
    relatedLegalIds: z.array(slug).max(8),
    relatedPracticeIds: z.array(slug).max(10),
    relatedPopulationIds: z.array(slug).max(10),
    /** An in-app tool that supports the process (for example /tools/goals). */
    toolHref: appRoute.optional(),
    linkOuts: z.array(PracticeLinkOutSchema).max(8),
    measuresPending: z.array(PendingMeasureSchema).max(8),
    ...governance,
    license: z.literal("original"),
  })
  .superRefine((g, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    if (CRISIS_PANEL_CATEGORIES.has(g.category) && !g.crisisPanel)
      issue(`a ${g.category} guide must show the crisis resources (crisisPanel true)`, ["crisisPanel"]);
    const lists: [string, readonly string[]][] = [
      ["relatedInterventionIds", g.relatedInterventionIds],
      ["relatedHandoutIds", g.relatedHandoutIds],
      ["relatedFormulationIds", g.relatedFormulationIds],
      ["relatedLegalIds", g.relatedLegalIds],
      ["relatedPracticeIds", g.relatedPracticeIds],
      ["relatedPopulationIds", g.relatedPopulationIds],
    ];
    for (const [field, values] of lists) for (const d of duplicates(values)) issue(`duplicate id ${d}`, [field]);
    if (g.relatedPracticeIds.includes(g.id)) issue("a guide cannot list itself", ["relatedPracticeIds"]);
    for (const d of duplicates(g.linkOuts.map((l) => l.url))) issue(`duplicate link-out ${d}`, ["linkOuts"]);
  });
export type PracticeGuide = z.infer<typeof PracticeGuideSchema>;
