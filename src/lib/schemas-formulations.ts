/**
 * Content contract (zod) for case-formulation frameworks: content/formulations/<id>.json -> FormulationSchema.
 *
 * A formulation is a shared, revisable explanation of how a person's difficulties started and what keeps them going.
 * It is never a diagnosis (G3) and never a risk decision (G9). Rules enforced here:
 * - ORIGINAL wording only (G1, G2): every model is summarized in the app's own words. As a mechanical guard, text
 *   fields may not contain double quotation marks (no quoted passages from manuals, books or criteria sets).
 * - Governance on every item (G10): sources[], license "original", lastVerified, reviewedBy ("PENDING" until a
 *   licensed clinician signs off).
 * - Proprietary or trained-only models carry trainingRequired and link out to the certifying body; no manual scripts.
 * - Codes (ICD-10-CM / ICD-11) appear only with a "See DSM-5-TR" pointer and are reference material for the
 *   clinician; the worksheet never prints them.
 * - The curated maintaining-process and strength factors (the ids plans and the worksheet use) are defined once, in
 *   the transdiagnostic process map; other formulations refer to them by id (factorIds). Cross-file checks live in
 *   src/lib/formulations.ts (formulationProblems).
 *
 * Isomorphic: no server-only imports. Nothing here is ever sent to an external API (G5, G17).
 */
import { z } from "zod";
import { SourceSchema, governance, slug } from "./schemas";

const QUOTES = /["“”]/;
/** Original wording only: no quoted passages. */
const original = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !QUOTES.test(s), "original wording only: no quoted passages (remove double quotes)");

const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "https URLs only");

/** Families used to group the index page. Never a ranking. */
export const FORMULATION_FAMILIES = [
  "integrative",
  "cognitive-behavioral",
  "behavioral",
  "contextual",
  "psychodynamic",
  "transdiagnostic",
  "trauma-and-moral-injury",
  "identity-and-context",
  "health-and-pain",
  "care-systems",
  "classification",
] as const;
export const FormulationFamily = z.enum(FORMULATION_FAMILIES);
export type FormulationFamily = z.infer<typeof FormulationFamily>;

export const FAMILY_LABELS: Record<FormulationFamily, string> = {
  integrative: "Integrative frameworks",
  "cognitive-behavioral": "Cognitive-behavioral",
  behavioral: "Behavioral",
  contextual: "Contextual and acceptance-based",
  psychodynamic: "Psychodynamic and relational",
  transdiagnostic: "Transdiagnostic processes",
  "trauma-and-moral-injury": "Trauma and moral injury",
  "identity-and-context": "Identity, stigma and context",
  "health-and-pain": "Health and pain",
  "care-systems": "Co-occurring care and level of care",
  classification: "Dimensional classification (reference)",
};

/** The 5 Ps rows of the biopsychosocial-spiritual grid. */
export const FIVE_PS = ["predisposing", "precipitating", "perpetuating", "protective"] as const;
export const FiveP = z.enum(FIVE_PS);
export type FiveP = z.infer<typeof FiveP>;

/** The grid columns. */
export const FORMULATION_DOMAINS = ["biological", "psychological", "social", "cultural-spiritual"] as const;
export const FormulationDomain = z.enum(FORMULATION_DOMAINS);
export type FormulationDomain = z.infer<typeof FormulationDomain>;

export const DOMAIN_LABELS: Record<FormulationDomain, string> = {
  biological: "Biological",
  psychological: "Psychological",
  social: "Social",
  "cultural-spiritual": "Cultural and spiritual",
};

/**
 * A curated process that can keep difficulties going (maintaining), a resource that helps (strength), or a life
 * circumstance (context). Defined only in the transdiagnostic process map; its id is a formulation target.
 */
export const FormulationFactorSchema = z.strictObject({
  id: slug,
  /** Clinician-facing name. */
  label: original(3, 60),
  /** Plain words safe to show the client (no diagnosis name, no code). */
  plainLabel: original(3, 80),
  kind: z.enum(["maintaining", "strength", "context"]),
  description: original(30, 400),
  /** Where the factor usually sits on the 5 Ps grid. */
  fivePs: z.array(FiveP).min(1),
  domains: z.array(FormulationDomain).min(1),
  /** Interventions that work on this process, for clinician review. */
  interventionIds: z.array(slug).max(10),
});
export type FormulationFactor = z.infer<typeof FormulationFactorSchema>;

/** What a behavior does for the person (functional analysis). */
export const BehaviorFunctionSchema = z.strictObject({
  id: slug,
  label: original(3, 60),
  plainLabel: original(3, 80),
  description: original(30, 400),
  interventionIds: z.array(slug).min(1).max(10),
});
export type BehaviorFunction = z.infer<typeof BehaviorFunctionSchema>;

/** One part of a framework: a level, a box in a cycle, a phase, or one disorder-specific model. */
export const FormulationPartSchema = z.strictObject({
  id: slug,
  label: original(3, 120),
  prompt: original(20, 700),
  examples: z.array(original(5, 300)).max(8),
  /** Disorder-specific models: the conditions it explains and the interventions, in the usual order of use. */
  conditionIds: z.array(slug).optional(),
  interventionIds: z.array(slug).optional(),
  /** Key reference for this part (primary paper or guideline). */
  reference: SourceSchema.optional(),
  /** Worksheet: curated factor chips offered in this part (ids from the transdiagnostic process map). */
  factorIds: z.array(slug).optional(),
  /** Worksheet: offer the documented symptoms and measure bands of this session (read-only prefill). */
  prefill: z.literal("session").optional(),
  /** Worksheet: offer the behavior-function chips of the functional analysis. */
  functionChips: z.literal(true).optional(),
  /** Worksheet: show this part's factor chips under the four domain headings (the 5 Ps grid). */
  groupByDomain: z.literal(true).optional(),
  /** Worksheet: false for parts that are chips only (no free text). Default true. */
  text: z.boolean().optional(),
});
export type FormulationPart = z.infer<typeof FormulationPartSchema>;

export const FormulationCodeSchema = z.strictObject({
  system: z.enum(["ICD-11", "ICD-10-CM"]),
  code: z.string().regex(/^[0-9A-Z]{3,4}(\.[0-9A-Z]{1,4})?$/, "ICD code"),
  label: original(3, 160),
});

export const TrainingLinkSchema = z.strictObject({
  body: original(3, 160),
  url: httpsUrl,
  note: original(5, 300),
});

export const FormulationLinkOutSchema = z.strictObject({
  title: original(3, 200),
  publisher: original(2, 160),
  url: httpsUrl,
  note: original(5, 300).optional(),
});

export const PendingMeasureSchema = z.strictObject({
  name: original(2, 120),
  url: httpsUrl,
  /** Key in content/licenses.json; must not be "confirmed" (link-out only, G7). */
  licenseKey: z.string().min(2),
  note: original(5, 300).optional(),
});

export const FormulationSchema = z
  .strictObject({
    id: slug,
    name: original(3, 120),
    /** Short name for the worksheet picker and cards. */
    shortName: original(3, 40),
    family: FormulationFamily,
    /** Theoretical orientation profiles this framework belongs to (content/orientations). */
    orientationIds: z.array(slug),
    purpose: original(60, 900),
    whenToUse: z.array(original(10, 400)).min(2),
    structure: z.array(FormulationPartSchema).min(2),
    /** Only the transdiagnostic process map defines factors. */
    factors: z.array(FormulationFactorSchema).optional(),
    /** Only the functional analysis defines behavior functions. */
    functions: z.array(BehaviorFunctionSchema).optional(),
    /** Factors (from the process map) that this framework draws on. */
    factorIds: z.array(slug).optional(),
    steps: z.array(original(10, 500)).min(3),
    collaborativeTips: z.array(original(10, 400)).min(1),
    cautions: z.array(original(10, 600)).min(1),
    conditionIds: z.array(slug),
    interventionIds: z.array(slug),
    handoutIds: z.array(slug),
    practiceIds: z.array(slug),
    populationIds: z.array(slug),
    legalIds: z.array(slug),
    /** Reference codes (clinician view only), always with the DSM-5-TR pointer. */
    codes: z.array(FormulationCodeSchema).optional(),
    dsmPointer: z.string().includes("See DSM-5-TR").optional(),
    trainingRequired: original(20, 500).optional(),
    trainingPath: z.array(TrainingLinkSchema).max(4).optional(),
    /** True when the framework has an interactive, memory-only worksheet (/formulations/builder). */
    worksheet: z.boolean(),
    /** Substance-use framework: pages and exports carry the 42 CFR Part 2 notice (G6). */
    sud: z.boolean(),
    linkOuts: z.array(FormulationLinkOutSchema).max(6),
    measuresPending: z.array(PendingMeasureSchema),
    ...governance,
  })
  .superRefine((f, ctx) => {
    const dupes = (values: readonly string[], path: string) => {
      const seen = new Set<string>();
      for (const v of values) {
        if (seen.has(v)) ctx.addIssue({ code: "custom", path: [path], message: `duplicate id ${v}` });
        seen.add(v);
      }
    };
    dupes(f.structure.map((s) => s.id), "structure");
    dupes((f.factors ?? []).map((x) => x.id), "factors");
    dupes((f.functions ?? []).map((x) => x.id), "functions");
    if (f.codes?.length && !f.dsmPointer) ctx.addIssue({ code: "custom", path: ["dsmPointer"], message: "codes need a See DSM-5-TR pointer" });
    if (f.trainingPath?.length && !f.trainingRequired)
      ctx.addIssue({ code: "custom", path: ["trainingRequired"], message: "trainingPath needs a trainingRequired note" });
    for (const s of f.structure)
      if (s.groupByDomain && !s.factorIds?.length)
        ctx.addIssue({ code: "custom", path: ["structure", s.id], message: "groupByDomain needs factorIds" });
    const worksheetParts = f.structure.some((s) => s.factorIds || s.prefill || s.functionChips || s.groupByDomain || s.text === false);
    if (worksheetParts && !f.worksheet) ctx.addIssue({ code: "custom", path: ["worksheet"], message: "worksheet fields set but worksheet is false" });
    if (f.structure.some((s) => s.functionChips) && !f.functions?.length)
      ctx.addIssue({ code: "custom", path: ["functions"], message: "functionChips needs functions" });
    if (f.license !== "original") ctx.addIssue({ code: "custom", path: ["license"], message: 'formulations are app-authored: license "original"' });
  });
export type Formulation = z.infer<typeof FormulationSchema>;

/** Route of the memory-only worksheet for a framework. Curated id only in the URL. */
export function worksheetHref(id: string): string {
  return `/formulations/builder?template=${id}`;
}
