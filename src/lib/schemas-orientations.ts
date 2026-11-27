/**
 * Content contract (zod) for theoretical orientation profiles: content/orientations/<id>.json -> OrientationSchema.
 *
 * A profile describes one school or family of psychotherapy in the app's own words: how it understands problems
 * and change, the therapist's stance, a typical session, how goals are written, the library techniques that belong
 * to it, the formulation frameworks it uses, the evidence for its main models, the training path, and ethics and
 * cultural prompts. It is clinician-facing reference only:
 * - The app never ranks orientations or chooses one for a client. Evidence tiers describe the research base of each
 *   model; they are not a fit score, and lists are ordered by family and name, never by tier.
 * - Proprietary or trained-only models (DBT, EMDR, MBT, TFP, CFT, IFS, SE and others) get an overview, a
 *   "trained clinicians only" flag and a link to the certifying body. There is deliberately no script field: manual
 *   wording is never reproduced here.
 * - ORIGINAL wording only (G1, G2): every text field refuses double quotation marks, so no quoted passage from a
 *   manual, book or code can be pasted in.
 * - Governance on every item (G10): sources[], license "original", lastVerified, reviewedBy ("PENDING" until a
 *   licensed clinician signs off).
 * Isomorphic: no server-only imports.
 */
import { z } from "zod";
import { governance, slug } from "./schemas";

/* ------------------------------------------------------------------ */
/* Families and evidence tiers                                         */
/* ------------------------------------------------------------------ */

export const ORIENTATION_FAMILIES = [
  "behavioral",
  "cognitive",
  "contextual",
  "psychodynamic",
  "interpersonal",
  "humanistic-experiential",
  "existential",
  "systemic",
  "postmodern",
  "multicultural-feminist",
  "trauma-focused",
  "somatic-parts",
  "positive",
  "integrative",
] as const;
export const OrientationFamily = z.enum(ORIENTATION_FAMILIES);
export type OrientationFamily = z.infer<typeof OrientationFamily>;

export const ORIENTATION_FAMILY_LABELS: Record<OrientationFamily, string> = {
  behavioral: "Behavioral",
  cognitive: "Cognitive",
  contextual: "Contextual and third-wave",
  psychodynamic: "Psychodynamic",
  interpersonal: "Interpersonal",
  "humanistic-experiential": "Humanistic and experiential",
  existential: "Existential",
  systemic: "Systemic, family and couples",
  postmodern: "Narrative and solution-focused",
  "multicultural-feminist": "Multicultural, feminist and liberation",
  "trauma-focused": "Trauma-focused",
  "somatic-parts": "Somatic and parts-based",
  positive: "Positive psychology",
  integrative: "Integrative and common factors",
};

export const EVIDENCE_TIERS = ["guideline-recommended", "research-supported", "emerging", "limited"] as const;
export const EvidenceTier = z.enum(EVIDENCE_TIERS);
export type EvidenceTier = z.infer<typeof EvidenceTier>;

/** Plain-language meaning of each tier, shown wherever a tier badge appears. */
export const EVIDENCE_TIER_LABELS: Record<EvidenceTier, { label: string; meaning: string }> = {
  "guideline-recommended": {
    label: "Guideline-recommended",
    meaning: "Recommended for at least one condition in a current major guideline (for example NICE, VA/DoD or APA).",
  },
  "research-supported": {
    label: "Research-supported",
    meaning: "Several controlled trials or meta-analyses support it, without a major guideline recommendation.",
  },
  emerging: {
    label: "Emerging evidence",
    meaning: "A few small or early controlled trials; promising but uncertain.",
  },
  limited: {
    label: "Limited evidence",
    meaning: "Mainly uncontrolled, case or developer-led studies so far.",
  },
};

/** Strongest tier first; used only to check that a profile's tier matches its best-supported model. */
const TIER_STRENGTH: Record<EvidenceTier, number> = {
  "guideline-recommended": 3,
  "research-supported": 2,
  emerging: 1,
  limited: 0,
};

/* ------------------------------------------------------------------ */
/* Interventions that are care steps rather than psychotherapy          */
/* ------------------------------------------------------------------ */

/**
 * Library interventions that are care coordination, harm reduction or safety steps rather than techniques of a
 * psychotherapy school. They may carry no orientationIds; every other intervention must map to a profile.
 */
export const ORIENTATION_EXEMPT_MODALITY = /^(Care coordination|Harm reduction|Suicide prevention)\b/;
export const ORIENTATION_EXEMPT_IDS: ReadonlySet<string> = new Set([
  "bright-light-therapy",
  "collaborative-safety-planning",
  "coordinated-specialty-care-referral",
  "eating-disorder-medical-monitoring",
  "ipv-safety-planning",
  "lethal-means-counseling",
  "medication-referral",
  "moud-referral",
  "naloxone-overdose-education",
  "neuromodulation-referral",
  "psychological-first-aid-and-recovery-skills",
  "smi-community-support-referral",
  "twelve-step-and-mutual-help-facilitation",
]);

export function isOrientationExempt(i: { id: string; modality: string }): boolean {
  return ORIENTATION_EXEMPT_IDS.has(i.id) || ORIENTATION_EXEMPT_MODALITY.test(i.modality);
}

/** The practice-within-competence topic every profile's ethics prompts must point to. */
export const COMPETENCE_LEGAL_ID = "competence-and-scope-of-practice";

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const QUOTES = /["“”]/;
/** Original wording only: no quoted passages from manuals, books or codes. */
const original = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !QUOTES.test(s), "original wording only: no quoted passages (remove double quotes)");

const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "https URLs only");
/** A 4-digit year, so an evidence statement always says when the cited body or study reported it. */
const CITES_YEAR = /\b(19|20)\d{2}\b/;
const citesYear = (min: number, max: number) => original(min, max).refine((s) => CITES_YEAR.test(s), "cite the body or study with its year");

export const KeyConceptSchema = z.strictObject({
  term: original(2, 80),
  meaning: original(20, 400),
});

/** One named model inside a profile (for example REBT inside cognitive therapy), with its own evidence tier. */
export const OrientationModelSchema = z.strictObject({
  name: original(2, 120),
  summary: original(30, 700),
  evidenceTier: EvidenceTier,
  evidence: citesYear(20, 500),
  trainingRequired: z.boolean(),
});
export type OrientationModel = z.infer<typeof OrientationModelSchema>;

/** A link to the body that trains or certifies clinicians in the model (link-out only). */
export const TrainingLinkSchema = z.strictObject({
  body: original(3, 140),
  url: httpsUrl,
  note: original(10, 300),
});

/** An ethics reminder tied to legal or ethics-practice topics in the hub (content/legal ids). */
export const EthicsPromptSchema = z.strictObject({
  prompt: original(20, 400),
  legalIds: z.array(slug).min(1).max(4),
});

/** A technique the library does not have yet: plain name only, never an id. */
export const MissingTechniqueSchema = z.strictObject({
  name: original(3, 120),
  note: original(10, 300),
});

/**
 * A client characteristic beyond diagnosis that research links to adapting the therapy (reactance, coping style,
 * preferences, readiness, religious commitment). Reading material for the clinician: the app never asks for these
 * characteristics and never matches a client to anything.
 */
export const ResponsivenessSchema = z.strictObject({
  characteristic: original(3, 80),
  adaptation: original(30, 500),
  evidence: citesYear(20, 400),
  practiceIds: z.array(slug).max(3),
});

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => (seen.has(v) ? true : (seen.add(v), false)));
}

export const OrientationSchema = z
  .strictObject({
    id: slug,
    name: original(3, 100),
    shortName: original(2, 40),
    family: OrientationFamily,
    /** One or two sentences for the index card. */
    summary: original(40, 360),
    keyConcepts: z.array(KeyConceptSchema).min(3).max(10),
    viewOfProblem: original(60, 900),
    viewOfChange: original(60, 900),
    therapistStance: original(60, 900),
    /** A typical session, step by step. */
    sessionShape: z.array(original(10, 300)).min(3).max(8),
    /** How goals are written in this orientation (read by the goal writer tool). */
    goalStyle: original(40, 600),
    /** How progress is noticed and measured. */
    progressMarkers: z.array(original(10, 300)).min(2).max(6),
    /** Library interventions that belong to this orientation; each lists this profile in its orientationIds. */
    typicalTechniques: z.array(slug).max(60),
    /** Library interventions that only partly fit (borrowed or generic pieces). */
    relatedTechniques: z.array(slug).max(12),
    missingTechniques: z.array(MissingTechniqueSchema).max(8),
    /** Formulation frameworks (content/formulations ids). */
    formulationIds: z.array(slug).max(6),
    models: z.array(OrientationModelSchema).min(1).max(8),
    /** Strongest tier among the models (checked below), so the index badge never overstates the evidence. */
    evidenceTier: EvidenceTier,
    evidenceSummary: citesYear(80, 1400),
    bestFit: z.array(original(10, 300)).min(2).max(8),
    cautions: z.array(original(10, 400)).min(2).max(10),
    whenToRefer: z.array(original(10, 300)).min(1).max(6),
    /** Evidence-based ways to adapt any therapy to the person (used by the integrative profile). */
    responsiveness: z.array(ResponsivenessSchema).max(8).optional(),
    /** True when every model in the profile is for trained clinicians only (checked against models below). */
    trainingRequired: z.boolean(),
    trainingNote: original(30, 600),
    trainingPath: z.array(TrainingLinkSchema).max(6),
    ethicsPrompts: z.array(EthicsPromptSchema).min(1).max(6),
    culturalNotes: z.array(original(20, 500)).min(1).max(6),
    /** Client handouts that support this orientation's work (content/handouts ids). */
    handoutIds: z.array(slug).max(8),
    /** Practice guides (content/practice ids) and population adaptations (content/populations ids). */
    relatedPracticeIds: z.array(slug).max(8),
    relatedPopulationIds: z.array(slug).max(8),
    ...governance,
    license: z.literal("original"),
  })
  .superRefine((o, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    const strongest = Math.max(...o.models.map((m) => TIER_STRENGTH[m.evidenceTier]));
    if (TIER_STRENGTH[o.evidenceTier] !== strongest)
      issue("evidenceTier must equal the strongest tier among the models", ["evidenceTier"]);
    if (o.trainingRequired !== o.models.every((m) => m.trainingRequired))
      issue("trainingRequired must be true exactly when every model requires specific training", ["trainingRequired"]);
    if (o.models.some((m) => m.trainingRequired) && o.trainingPath.length === 0)
      issue("a trained-only model needs a trainingPath link to its certifying or training body", ["trainingPath"]);
    if (!o.ethicsPrompts.some((e) => e.legalIds.includes(COMPETENCE_LEGAL_ID)))
      issue(`one ethics prompt must point to ${COMPETENCE_LEGAL_ID} (practicing within training)`, ["ethicsPrompts"]);
    const lists: [string, readonly string[]][] = [
      ["typicalTechniques", o.typicalTechniques],
      ["relatedTechniques", o.relatedTechniques],
      ["formulationIds", o.formulationIds],
      ["handoutIds", o.handoutIds],
      ["relatedPracticeIds", o.relatedPracticeIds],
      ["relatedPopulationIds", o.relatedPopulationIds],
    ];
    for (const [field, values] of lists) for (const d of duplicates(values)) issue(`duplicate id ${d}`, [field]);
    for (const id of o.relatedTechniques)
      if (o.typicalTechniques.includes(id)) issue(`${id} is listed as both typical and related`, ["relatedTechniques"]);
    if (o.typicalTechniques.length + o.relatedTechniques.length === 0)
      issue("list at least one library technique (typical or related)", ["typicalTechniques"]);
  });
export type Orientation = z.infer<typeof OrientationSchema>;
