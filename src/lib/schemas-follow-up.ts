/**
 * Content contracts (zod) for the deterministic guided follow-up engine (src/lib/follow-up/**):
 *   content/follow-ups/*.json   question banks (original clinician-facing wording)
 *   content/trigger-objects.json curated dictionary of feared objects and situations
 *
 * Guardrails:
 * - G1/G2: every question, note and option is ORIGINAL wording. Never DSM-5-TR criteria text, never Wiley text.
 * - G9: safety answers only RECORD what the clinician chose. They can add a documented statement (which then
 *   raises the usual red-flag banner) and surface crisis resources, but they can never remove a symptom,
 *   change a gate or estimate risk. No option anywhere may negate a red-flag symptom (checked in bankProblems()).
 * - G10: every file carries sources[], license "original", lastVerified and reviewedBy ("PENDING").
 * - G6: substance-use questions are marked `sud` so the UI shows the 42 CFR Part 2 notice.
 * Nothing here is ever sent anywhere: the engine runs in the browser on memory-only state.
 */
import { z } from "zod";
import { RedFlagType, SourceSchema, SymptomCategory, isoDate, slug } from "./schemas";

/* ------------------------------------------------------------------ shared vocabularies */

export const TRIGGER_CATEGORIES = [
  "animal",
  "natural-environment",
  "blood-injection-injury",
  "situational",
  "choking-vomiting",
  "social",
  "contamination",
  "trauma-reminder",
  "health",
] as const;
export const TriggerCategory = z.enum(TRIGGER_CATEGORIES);
export type TriggerCategory = z.infer<typeof TriggerCategory>;

/** How the feared object was introduced in the text: "afraid of X" (fear), "panic around X" (panic), "avoids X". */
export const TRIGGER_CUE_KINDS = ["fear", "panic", "avoidance"] as const;
export const TriggerCueKind = z.enum(TRIGGER_CUE_KINDS);
export type TriggerCueKind = z.infer<typeof TriggerCueKind>;

/**
 * Referral kinds a hint can point to. The first nine are exactly the NPPES provider types of
 * src/server/integrations/nppes.ts (PROVIDER_TYPES, server-only, so they are restated here; a test keeps
 * them in sync). "crisis", "substance-use" and "peer-support" are directory kinds of schemas-referrals.ts.
 * "primary-care", "urgent-medical" and "sleep-medicine" are medical evaluations (HRSA health center finder
 * or the client's own clinician); nothing is searched automatically.
 */
export const FOLLOW_UP_REFERRAL_KINDS = [
  "psychologist",
  "clinical-psychologist",
  "professional-counselor",
  "mental-health-counselor",
  "clinical-social-worker",
  "marriage-family-therapist",
  "psychiatrist",
  "psychiatric-np",
  "addiction-counselor",
  "primary-care",
  "urgent-medical",
  "sleep-medicine",
  "crisis",
  "substance-use",
  "peer-support",
] as const;
export const FollowUpReferralKind = z.enum(FOLLOW_UP_REFERRAL_KINDS);
export type FollowUpReferralKind = z.infer<typeof FollowUpReferralKind>;

/** The NPPES provider-type subset of FOLLOW_UP_REFERRAL_KINDS (searchable via /api/providers). */
export const NPPES_REFERRAL_KINDS = [
  "psychologist",
  "clinical-psychologist",
  "professional-counselor",
  "mental-health-counselor",
  "clinical-social-worker",
  "marriage-family-therapist",
  "psychiatrist",
  "psychiatric-np",
  "addiction-counselor",
] as const satisfies readonly FollowUpReferralKind[];

/**
 * Static resources an answer can bring to the clinician's attention. They are links and notices chosen by
 * the clinician's own answer, never a computed risk level.
 */
export const SURFACES = [
  "crisis-resources",
  "safety-plan",
  "lethal-means",
  "psychiatric-referral",
  "urgent-medical",
  "medical-referral",
  "part2-notice",
] as const;
export const Surface = z.enum(SURFACES);
export type Surface = z.infer<typeof Surface>;

export const FOLLOW_UP_DOMAINS = [
  "safety",
  "panic-fear",
  "worry",
  "mood",
  "trauma",
  "sleep",
  "alcohol",
  "grief",
  "gates",
  "rule-outs",
] as const;
export const FollowUpDomain = z.enum(FOLLOW_UP_DOMAINS);
export type FollowUpDomain = z.infer<typeof FollowUpDomain>;

/** safety: always first when signals appear. discriminate: tells candidates apart. gate: duration,
 * impairment, substance, medical. core: asks about a key feature the top candidate is missing. */
export const QUESTION_KINDS = ["safety", "discriminate", "gate", "core"] as const;
export const QuestionKind = z.enum(QUESTION_KINDS);
export type QuestionKind = z.infer<typeof QuestionKind>;

export const GATE_FIELDS = ["duration", "impairment", "substance", "medical"] as const;
export const GateField = z.enum(GATE_FIELDS);
export type GateField = z.infer<typeof GateField>;

const DurationBandSchema = z.enum(["unknown", "lt2w", "2to4w", "1to6m", "gte6m"]);
const TriStateSchema = z.enum(["yes", "no", "unknown"]);

/** Placeholder replaced by the extracted trigger phrase (e.g. "dogs"). */
export const TRIGGER_TOKEN = "<trigger>";

/* ------------------------------------------------------------------ question bank */

/** The small, closed vocabulary of answer effects. Every effect is applied by applyAnswer(), purely. */
export const AnswerEffectsSchema = z
  .strictObject({
    addSymptomIds: z.array(slug).optional(),
    negateSymptomIds: z.array(slug).optional(),
    setDuration: DurationBandSchema.optional(),
    setImpairment: TriStateSchema.optional(),
    setSubstancePossible: TriStateSchema.optional(),
    setMedicalPossible: TriStateSchema.optional(),
    addTriggerCategory: TriggerCategory.optional(),
  })
  .superRefine((e, ctx) => {
    const add = new Set(e.addSymptomIds ?? []);
    for (const id of e.negateSymptomIds ?? [])
      if (add.has(id)) ctx.addIssue({ code: "custom", message: `${id} is both added and negated`, path: ["negateSymptomIds"] });
  });
export type AnswerEffects = z.infer<typeof AnswerEffectsSchema>;

export const AnswerOptionSchema = z.strictObject({
  id: slug,
  label: z.string().min(2).max(160),
  /** Label used when no trigger was extracted (only needed when `label` contains <trigger>). */
  labelNoTrigger: z.string().min(2).max(160).optional(),
  effects: AnswerEffectsSchema.default({}),
  surfaces: z.array(Surface).default([]),
  /** Short original note shown after the clinician picks this option. */
  note: z.string().min(10).max(400).optional(),
  /** "Not asked yet" / "not sure": recorded, but the question stays in the queue. */
  keepOpen: z.boolean().default(false),
  /** Multi-select questions: this option cannot be combined with others ("none", "not asked yet"). */
  exclusive: z.boolean().default(false),
  /** Show only when a trigger was (or was not) extracted. */
  when: z.enum(["trigger", "no-trigger"]).optional(),
});
export type AnswerOption = z.infer<typeof AnswerOptionSchema>;

/** A question is offered when ANY listed signal is present (OR). */
export const ShowWhenSchema = z
  .strictObject({
    triggerCategories: z.array(TriggerCategory).min(1).optional(),
    triggerCues: z.array(TriggerCueKind).min(1).optional(),
    symptomIds: z.array(slug).min(1).optional(),
    symptomCategories: z.array(SymptomCategory).min(1).optional(),
    /** Condition ids among the top 3 suggestions (ids not yet in the knowledge base are allowed). */
    conditionIds: z.array(slug).min(1).optional(),
    redFlags: z.array(RedFlagType).min(1).optional(),
    substanceYes: z.literal(true).optional(),
    medicalYes: z.literal(true).optional(),
    /** Any of these answers was given earlier. */
    answered: z.array(z.strictObject({ questionId: slug, answerIds: z.array(slug).min(1) })).min(1).optional(),
    /** Any scored symptom or any trigger is present (used by the generic gates). */
    anySignal: z.literal(true).optional(),
  })
  .refine((w) => Object.values(w).some((v) => v !== undefined), "showWhen needs at least one signal");
export type ShowWhen = z.infer<typeof ShowWhenSchema>;

export const FollowUpQuestionDefSchema = z
  .strictObject({
    id: slug,
    kind: QuestionKind,
    domain: FollowUpDomain,
    select: z.enum(["one", "many"]).default("one"),
    /** Clinician-facing question. May contain <trigger>. */
    text: z.string().min(10).max(320),
    /** Used when no trigger was extracted. Required when `text` contains <trigger> and the question can show without one. */
    textNoTrigger: z.string().min(10).max(320).optional(),
    /** "Why this helps": short, original, clinician-facing. May contain <trigger>. */
    why: z.string().min(20).max(600),
    options: z.array(AnswerOptionSchema).min(2).max(8),
    showWhen: ShowWhenSchema,
    /** Optional second condition that must ALSO hold (AND), e.g. "duration answered" AND "low mood present". */
    alsoRequires: ShowWhenSchema.optional(),
    /** Symptom ids the question asks about: skipped once every target is known (present or noted absent). */
    targets: z.array(slug).default([]),
    /** Skipped once this ScoringInput field is no longer "unknown". */
    gate: GateField.optional(),
    /** Condition ids this question helps tell apart (ids not yet in the knowledge base are allowed). */
    discriminates: z.array(slug).default([]),
    /** At most one question per group in one batch (e.g. several ways of asking about duration). */
    group: slug.optional(),
    /** Lower runs first among equally ranked questions. */
    priority: z.number().int().min(0).max(99).default(50),
    /** Substance-use content: the UI must show the 42 CFR Part 2 notice with it (G6). */
    sud: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate option id", path: ["options"] });
    if (!q.options.some((o) => !o.keepOpen))
      ctx.addIssue({ code: "custom", message: "needs at least one option that answers the question", path: ["options"] });
    const triggerOnly = Object.keys(q.showWhen).every((k) => k === "triggerCategories" || k === "triggerCues");
    if (q.text.includes(TRIGGER_TOKEN) && !triggerOnly && !q.textNoTrigger)
      ctx.addIssue({ code: "custom", message: "text uses <trigger> but there is no textNoTrigger", path: ["textNoTrigger"] });
    q.options.forEach((o, i) => {
      if (o.label.includes(TRIGGER_TOKEN) && !triggerOnly && !o.labelNoTrigger && o.when !== "trigger")
        ctx.addIssue({ code: "custom", message: "label uses <trigger> but there is no labelNoTrigger", path: ["options", i] });
      if (q.kind === "safety") {
        const e = o.effects;
        if (e.negateSymptomIds?.length || e.setDuration || e.setImpairment || e.setSubstancePossible || e.setMedicalPossible)
          ctx.addIssue({ code: "custom", message: "safety answers may only record a statement (addSymptomIds) and surface resources", path: ["options", i] });
      }
      if (o.exclusive && q.select === "one")
        ctx.addIssue({ code: "custom", message: "exclusive only applies to multi-select questions", path: ["options", i] });
    });
    if (q.kind === "gate" && !q.gate) ctx.addIssue({ code: "custom", message: "gate questions name their gate", path: ["gate"] });
  });
export type FollowUpQuestionDef = z.infer<typeof FollowUpQuestionDefSchema>;

export const FollowUpBankFileSchema = z
  .strictObject({
    id: slug,
    title: z.string().min(3),
    domain: FollowUpDomain,
    about: z.string().min(20),
    questions: z.array(FollowUpQuestionDefSchema).min(1),
    sources: z.array(SourceSchema).min(1),
    license: z.literal("original"),
    lastVerified: isoDate,
    reviewedBy: z.string().min(1),
  })
  .superRefine((f, ctx) => {
    const ids = f.questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate question id", path: ["questions"] });
    f.questions.forEach((q, i) => {
      if (q.domain !== f.domain) ctx.addIssue({ code: "custom", message: `question domain ${q.domain} != file domain ${f.domain}`, path: ["questions", i] });
    });
  });
export type FollowUpBankFile = z.infer<typeof FollowUpBankFileSchema>;

/* ------------------------------------------------------------------ trigger dictionary */

export const TriggerObjectSchema = z.strictObject({
  id: slug,
  category: TriggerCategory,
  label: z.string().min(2).max(60), // display label, plural where natural ("dogs")
  terms: z.array(z.string().min(2).max(60)).min(1), // lowercase phrases incl. irregular plurals and variants
});
export type TriggerObject = z.infer<typeof TriggerObjectSchema>;

export const TriggerCategoryInfoSchema = z.strictObject({
  label: z.string().min(3),
  clinicianNote: z.string().min(20).max(500), // original wording
  conditionHints: z.array(slug), // condition ids to keep in mind (may not be in the knowledge base yet)
  interventionIds: z.array(slug), // content/interventions ids
  handoutIds: z.array(slug), // content/handouts ids
  measureIds: z.array(slug), // license-confirmed built-in measures only (G7)
  referralKinds: z.array(FollowUpReferralKind).min(1),
});
export type TriggerCategoryInfo = z.infer<typeof TriggerCategoryInfoSchema>;

export const TriggerObjectsFileSchema = z
  .strictObject({
    version: z.string().min(1),
    about: z.string().min(20),
    categories: z.record(TriggerCategory, TriggerCategoryInfoSchema),
    objects: z.array(TriggerObjectSchema).min(100),
    sources: z.array(SourceSchema).min(1),
    license: z.literal("original"),
    lastVerified: isoDate,
    reviewedBy: z.string().min(1),
  })
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.objects.forEach((o, i) => {
      if (seen.has(o.id)) ctx.addIssue({ code: "custom", message: `duplicate object id ${o.id}`, path: ["objects", i] });
      seen.add(o.id);
      for (const t of o.terms)
        if (t !== t.toLowerCase()) ctx.addIssue({ code: "custom", message: `term "${t}" must be lowercase`, path: ["objects", i] });
    });
  });
export type TriggerObjectsFile = z.infer<typeof TriggerObjectsFileSchema>;
