/**
 * Content contracts (zod). Every clinical content item carries governance fields (G10):
 * sources[], license, lastVerified, reviewedBy ("PENDING" => "Not yet clinically reviewed" badge).
 * Clinical wording must be ORIGINAL (G1/G2). DSM-5-TR text is never stored here.
 */
import { z } from "zod";

// Content is parsed in the browser too. The CSP has no 'unsafe-eval', so turn off zod's JIT: otherwise
// zod probes `Function("")` on first parse, which the CSP blocks and reports as a violation.
z.config({ jitless: true });

export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case id");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const SourceSchema = z.object({
  title: z.string().min(3),
  publisher: z.string().min(2),
  url: z.url(),
  year: z.number().int().min(1950).max(2100).optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/** Governance block required on every content item (G10). */
export const governance = {
  sources: z.array(SourceSchema).min(1),
  license: z.string().min(2), // "original" for app-authored wording; otherwise the reproduction terms
  lastVerified: isoDate,
  reviewedBy: z.string().min(1), // "PENDING" until a licensed clinician signs off
};

export const RedFlagType = z.enum([
  "suicidality",
  "homicidality",
  "psychosis",
  "mania",
  "eating-disorder-medical",
  "withdrawal",
]);
export type RedFlagType = z.infer<typeof RedFlagType>;

export const SymptomCategory = z.enum([
  "anxiety",
  "panic",
  "avoidance",
  "mood",
  "cognitive",
  "somatic",
  "sleep",
  "trauma",
  "behavioral",
  "safety",
  "context",
  "cultural", // cultural concepts of distress: recognized and shown, never scored or mapped to a condition
]);

/** One entry in the global symptom lexicon. Conditions reference these ids. */
export const SymptomSchema = z.object({
  id: slug,
  label: z.string().min(3), // clinician-facing, original clinical wording
  clientLabel: z.string().min(3), // plain language, 6th-8th grade
  category: SymptomCategory,
  synonyms: z.array(z.string().min(2)).min(2), // lowercase phrases clients/clinicians actually say
  redFlag: RedFlagType.optional(),
});
export type Symptom = z.infer<typeof SymptomSchema>;

export const SymptomLexiconSchema = z.object({
  version: z.string(),
  symptoms: z.array(SymptomSchema).min(10),
  ...governance,
});
export type SymptomLexicon = z.infer<typeof SymptomLexiconSchema>;

export const CodeSchema = z.object({ code: z.string().min(3), label: z.string().min(3) });
/** An ICD-10-CM code of a condition; featureIds names the documented features it fits (phobia type -> its codes). */
export const ConditionCodeSchema = CodeSchema.extend({ featureIds: z.array(slug).min(1).optional() });

export const ConditionFeatureSchema = z.object({
  symptomId: slug,
  kind: z.enum(["core", "associated"]),
  weight: z.number().int().min(1).max(5),
  // Features sharing a group fill ONE slot worth its highest weight (e.g. insomnia / hypersomnia, or
  // unexpected / not-yet-clarified panic attacks), so one symptom area is never counted twice.
  group: slug.optional(),
  // Counts toward strongMinAreas: a distinct symptom area of this pattern, not a nonspecific feature.
  breadthArea: z.boolean().optional(),
});
export type ConditionFeature = z.infer<typeof ConditionFeatureSchema>;

export const ConditionSchema = z.object({
  id: slug,
  name: z.string().min(3),
  icd10cm: z.array(ConditionCodeSchema).min(1),
  icd11: z.array(CodeSchema).min(1),
  dsmPointer: z.string().includes("See DSM-5-TR"),
  summary: z.string().min(40), // original clinical summary, never DSM text
  features: z.array(ConditionFeatureSchema).min(4),
  minCore: z.number().int().min(1), // fewer matched core features => "not enough information"
  durationGate: z.object({ minWeeks: z.number().min(0), note: z.string().min(5) }),
  impairmentRequired: z.boolean(),
  ruleOuts: z
    .array(
      z.object({
        label: z.string().min(3),
        type: z.enum(["substance", "medical", "psychiatric"]),
        note: z.string().min(5),
      }),
    )
    .min(1),
  specifiers: z.array(z.object({ label: z.string(), note: z.string() })),
  differentials: z
    .array(
      z.object({
        label: z.string().min(3),
        icd10cm: z.string().optional(),
        distinguishing: z.string().min(10),
      }),
    )
    .min(2),
  comorbidities: z.array(z.object({ conditionId: slug.optional(), label: z.string(), note: z.string() })),
  measures: z.array(slug), // built-in measure ids (license confirmed)
  // Link-out, "license pending". licenseKey traces the status in content/licenses.json (G7).
  measuresPending: z.array(z.object({ name: z.string(), url: z.url(), note: z.string(), licenseKey: z.string().min(2) })),
  interventions: z
    .array(
      z.object({
        name: z.string(),
        evidence: z.string(),
        note: z.string(),
        // Shown only when one of these symptoms is documented (applied tension: blood-injection-injury fears).
        requiresAny: z.array(slug).min(1).optional(),
      }),
    )
    .min(1),
  handouts: z.array(slug),
  statIds: z.array(slug),
  culturalNotes: z.array(z.string().min(10)).min(1),
  sud: z.boolean().default(false), // 42 CFR Part 2 banner + export notice when true (G6)
  // Features the pattern cannot do without (e.g. trauma exposure for PTSD). Missing => held at "moderate" + flag.
  requiredFeatures: z.array(z.object({ symptomId: slug, note: z.string().min(10) })).default([]),
  // "strong" needs at least this many distinct breadthArea slots matched; otherwise held at "moderate" + flag.
  strongMinAreas: z.number().int().min(1).optional(),
  // Red flags documented in the same input attach a flag here (and may cap the strength).
  redFlagRules: z
    .array(z.object({ type: RedFlagType, capAt: z.enum(["moderate", "possible"]).optional(), message: z.string().min(20) }))
    .default([]),
  licensedDsm: z.literal(false).default(false), // G1 feature flag, off
  wileyLicensed: z.literal(false).default(false), // G2 feature flag, off
  ...governance,
});
export type Condition = z.infer<typeof ConditionSchema>;

export const MeasureSchema = z.object({
  id: slug,
  name: z.string(),
  shortName: z.string(),
  licenseKey: z.string(), // must exist with status "confirmed" in content/licenses.json (G7)
  instructions: z.string(),
  items: z.array(z.object({ id: z.string(), text: z.string().min(5) })).min(1),
  options: z.array(z.object({ value: z.number().int(), label: z.string() })).min(2),
  functionalItem: z.object({ text: z.string(), options: z.array(z.string()).min(2) }).optional(),
  scoring: z.object({
    min: z.number().int(),
    max: z.number().int(),
    bands: z
      .array(z.object({ min: z.number().int(), max: z.number().int(), label: z.string(), clinicianNote: z.string() }))
      .min(2),
  }),
  riskItems: z.array(z.object({ itemId: z.string(), threshold: z.number().int(), message: z.string() })),
  citation: z.string(),
  copyright: z.string(),
  loinc: z.object({ panel: z.string(), total: z.string().optional() }).optional(),
  ...governance,
});
export type Measure = z.infer<typeof MeasureSchema>;

/** Spanish version of a client handout: same structure, translated from the app's own original English. */
export const HandoutTranslationSchema = z.object({
  title: z.string(),
  intro: z.string(),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string().optional(), steps: z.array(z.string()).optional() }))
    .min(1),
  practiceLog: z.object({ columns: z.array(z.string()).min(2) }).optional(),
  safetyNote: z.string(),
  translatedBy: z.string().min(1), // "machine-assisted, PENDING human review" until a fluent reviewer signs off
});
export type HandoutTranslation = z.infer<typeof HandoutTranslationSchema>;

export const HandoutSchema = z.object({
  id: slug,
  title: z.string(),
  audience: z.literal("client"),
  readingLevel: z.string(), // e.g. "6-8"
  estimatedMinutes: z.number().int().positive(),
  intro: z.string(),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string().optional(), steps: z.array(z.string()).optional() }))
    .min(1),
  practiceLog: z.object({ columns: z.array(z.string()).min(2), rows: z.number().int().min(1) }).optional(),
  safetyNote: z.string(),
  sud: z.boolean().default(false), // substance-use content: PDF footer carries the 42 CFR Part 2 notice on every page (G6)
  // Suggested for a condition only when one of these symptoms is documented (applied tension: blood-injection-injury).
  suggestWith: z.array(slug).min(1).optional(),
  es: HandoutTranslationSchema.optional(), // Spanish version (client mode / client PDF)
  ...governance,
});
export type Handout = z.infer<typeof HandoutSchema>;

export const StatSchema = z.object({
  id: slug,
  text: z.string().min(10), // original sentence stating the figure
  value: z.string(), // e.g. "19.1%"
  region: z.enum(["US", "Global"]),
  dataYear: z.string(), // year(s) the data describe, e.g. "2001-2003" or "2021"
  publisher: z.string(),
  url: z.url(),
  ...governance,
});
export type Stat = z.infer<typeof StatSchema>;

export const StatsFileSchema = z.object({ stats: z.array(StatSchema).min(1) });

export const LicensesSchema = z.object({
  items: z.record(
    z.string(),
    z.object({ status: z.string(), terms: z.string(), source: z.string().nullable(), lastVerified: z.string().nullable() }).passthrough(),
  ),
});

/**
 * Crisis lines (G9, G10). lastVerified stays null until a PERSON loads the official site and checks the
 * numbers; `npm run validate:content -- --release` fails while any entry is unverified.
 */
export const CrisisLinesSchema = z.object({
  sources: z.array(SourceSchema).min(1),
  license: z.string().min(2),
  reviewedBy: z.string().min(1),
  international: z.object({ name: z.string(), url: z.url(), lastVerified: isoDate.nullable() }),
  countries: z.array(
    z.object({
      country: z.string().length(2),
      emergency: z.string(),
      crisis: z.string(),
      url: z.url(),
      lastVerified: isoDate.nullable(),
    }),
  ),
});
export type CrisisLines = z.infer<typeof CrisisLinesSchema>;
