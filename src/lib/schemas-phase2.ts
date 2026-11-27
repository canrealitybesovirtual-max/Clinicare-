/**
 * Phase 2 content contracts (offline): interventions library and original treatment-plan library.
 * G2: plan wording is ORIGINAL — never Wiley PracticePlanners problems, goals, objectives or interventions.
 */
import { z } from "zod";
import { governance, slug } from "./schemas";
import { EvidenceGradeSchema, MAX_EVIDENCE_GRADES } from "./schemas-governance";

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
  // Structured ratings from named guideline bodies (direction, strength, year, link); validated against conditions.
  evidenceGrades: z.array(EvidenceGradeSchema).max(MAX_EVIDENCE_GRADES).optional(),
  // Suggested for a condition only when one of these symptoms is documented (applied tension: blood-injection-injury).
  suggestWith: z.array(slug).min(1).optional(),
  ...governance,
});
export type Intervention = z.infer<typeof InterventionSchema>;

/**
 * Stepped-care level of an objective (optional tag, shown as a badge and a filter in the builder). It describes
 * the usual intensity of the work, never a decision about the client: the clinician chooses the level of care.
 */
export const CARE_STEPS = ["low-intensity", "high-intensity", "specialist", "crisis-or-urgent"] as const;
export const CareStepSchema = z.enum(CARE_STEPS);
export type CareStep = z.infer<typeof CareStepSchema>;
export const CARE_STEP_LABELS: Record<CareStep, string> = {
  "low-intensity": "Low intensity",
  "high-intensity": "High intensity",
  specialist: "Specialist care",
  "crisis-or-urgent": "Crisis or urgent care",
};

export const PlanObjectiveSchema = z.object({
  id: slug,
  text: z.string().min(15), // SMART, measurable, original wording, editable in the builder
  interventionIds: z.array(slug), // links into the interventions library
  // G6: the objective records substance use for this client. Selecting it makes the export carry the Part 2 notice.
  sud: z.boolean().default(false),
  // Formulation targets this objective works on: curated factor ids of the transdiagnostic process map
  // (content/formulations/transdiagnostic-process-map.json). Checked in src/lib/plan-modules.ts (planContentProblems).
  targets: z.array(slug).min(1).max(4).optional(),
  step: CareStepSchema.optional(),
});
export type PlanObjective = z.infer<typeof PlanObjectiveSchema>;

/** An ICD-10-CM Z code (factors influencing health status, Z55-Z65 and nearby) with its official code title. */
export const ZCodeSchema = z
  .object({
    code: z.string().regex(/^Z\d{2}(\.\w{1,4})?$/, "ICD-10-CM Z code"),
    label: z.string().min(5).max(120),
  })
  .strict();
export type ZCode = z.infer<typeof ZCodeSchema>;

/** A link to an official resource the clinician may share (never a scraped or re-hosted worksheet, G8). */
export const PlanLinkOutSchema = z
  .object({
    title: z.string().min(3).max(120),
    publisher: z.string().min(2).max(120),
    url: z.url().refine((u) => u.startsWith("https://"), "https URLs only"),
  })
  .strict();

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
  // Psychosocial problems only: reference Z codes the clinician may record (never a diagnosis, G3).
  zCodes: z.array(ZCodeSchema).min(1).max(6).optional(),
  // Optional links shown with the problem: formulation frameworks, practice guides and client handouts.
  formulationIds: z.array(slug).max(4).optional(),
  practiceIds: z.array(slug).max(6).optional(),
  handoutIds: z.array(slug).max(6).optional(),
  linkOuts: z.array(PlanLinkOutSchema).max(4).optional(),
});
export type PlanProblem = z.infer<typeof PlanProblemSchema>;

export const PlanLibrarySchema = z.object({
  conditionId: slug,
  problems: z.array(PlanProblemSchema).min(1),
  collaborativeNote: z.string().min(20), // reminder to write goals with the client in their own words
  sud: z.boolean().default(false), // substance-use plan: every export must carry the 42 CFR Part 2 notice (G6)
  ...governance,
});
export type PlanLibrary = z.infer<typeof PlanLibrarySchema>;

/**
 * A cross-cutting plan module (content/plans/modules/<id>.json): problems that can be added to any plan library
 * (appliesTo "any") or to the listed condition libraries, such as safety-focused objectives, sleep, engagement or
 * psychosocial (Z code) problems. Same original-wording rules as the libraries (G2). Objectives in a module may
 * link any library intervention (no condition match is required). A module with sud: true makes every export that
 * includes one of its items carry the 42 CFR Part 2 notice (G6). crisisPanel: the builder shows crisis resources
 * inline next to the module (G9); nothing in a module decides or rates risk.
 */
export const PlanModuleSchema = z.object({
  id: slug,
  title: z.string().min(5).max(90),
  summary: z.string().min(30).max(400),
  appliesTo: z.union([z.literal("any"), z.array(slug).min(1)]),
  problems: z.array(PlanProblemSchema).min(1).max(10),
  collaborativeNote: z.string().min(20),
  sud: z.boolean().default(false),
  crisisPanel: z.boolean().default(false),
  ...governance,
});
export type PlanModule = z.infer<typeof PlanModuleSchema>;
