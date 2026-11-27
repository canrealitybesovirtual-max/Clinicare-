/**
 * Phase 2 content contracts (offline): interventions library and original treatment-plan library.
 * G2: plan wording is ORIGINAL — never Wiley PracticePlanners problems, goals, objectives or interventions.
 */
import { z } from "zod";
import { governance, slug } from "./schemas";

export const InterventionSchema = z.object({
  id: slug,
  name: z.string().min(3),
  modality: z.string().min(2), // e.g. "CBT", "Relaxation", "Exposure", "Behavioral activation"
  conditions: z.array(slug).min(1), // condition ids it is typically used for
  evidenceLevel: z.string().min(5), // original summary citing the guideline/list that supports it
  minutes: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
  purpose: z.string().min(20), // clinician-facing rationale, original wording
  steps: z.array(z.string().min(5)).min(3), // clinician steps for in-session delivery
  script: z.array(z.string().min(5)).min(3), // what the clinician can say, original wording, plain language
  contraindications: z.array(z.string().min(5)).min(1), // cautions / when to modify or defer
  culturalAdaptations: z.array(z.string().min(10)).min(1),
  faithIntegrated: z
    .object({
      note: z.string().min(20), // optional client-led faith-integrated variant
      consentNote: z.string().min(20), // informed consent before spiritual interventions (AACC / ACA)
    })
    .optional(),
  trainingRequired: z.string().optional(), // e.g. "EMDR: trained clinicians only"
  handoutIds: z.array(slug), // matching client handouts (content/handouts)
  orientationIds: z.array(slug).optional(), // theoretical orientation profiles (content/orientations)
  // Suggested for a condition only when one of these symptoms is documented (applied tension: blood-injection-injury).
  suggestWith: z.array(slug).min(1).optional(),
  ...governance,
});
export type Intervention = z.infer<typeof InterventionSchema>;

export const PlanObjectiveSchema = z.object({
  id: slug,
  text: z.string().min(15), // SMART, measurable, original wording, editable in the builder
  interventionIds: z.array(slug), // links into the interventions library
  // G6: the objective records substance use for this client. Selecting it makes the export carry the Part 2 notice.
  sud: z.boolean().default(false),
});

/**
 * A behavioral definition or long-term goal: plain original wording, or { text, sud: true } when the item records
 * substance use (G6). Selecting a tagged item makes the plan export carry the 42 CFR Part 2 notice.
 */
export const PlanTextSchema = z.union([
  z.string().min(10),
  z.object({ text: z.string().min(10), sud: z.boolean().default(false) }).strict(),
]);
export type PlanText = z.infer<typeof PlanTextSchema>;
export const planTextOf = (t: PlanText): string => (typeof t === "string" ? t : t.text);
export const planTextIsSud = (t: PlanText): boolean => typeof t !== "string" && t.sud;

export const PlanProblemSchema = z.object({
  id: slug,
  label: z.string().min(5), // short problem name, original wording
  definitions: z.array(PlanTextSchema).min(2), // behavioral definitions (observable), original
  longTermGoals: z.array(PlanTextSchema).min(1),
  shortTermObjectives: z.array(PlanObjectiveSchema).min(3),
  measureIds: z.array(slug), // built-in measures for tracking progress (license-confirmed only)
});

export const PlanLibrarySchema = z.object({
  conditionId: slug,
  problems: z.array(PlanProblemSchema).min(1),
  collaborativeNote: z.string().min(20), // reminder to write goals with the client in their own words
  sud: z.boolean().default(false), // substance-use plan: every export must carry the 42 CFR Part 2 notice (G6)
  ...governance,
});
export type PlanLibrary = z.infer<typeof PlanLibrarySchema>;
