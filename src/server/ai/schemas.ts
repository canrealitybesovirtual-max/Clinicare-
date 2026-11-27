import "server-only";
/**
 * Contracts for the assistant.
 * - AssistInput: what the browser may send (strict; curated ids only; text already PHI-scrubbed in the browser and
 *   re-checked on the server). The answered history is accepted only with a server-issued seal (src/server/ai/seal.ts),
 *   so it can never carry text the server did not itself produce.
 * - ModelOutputSchema: the structured-output schema sent to the API (output_config.format). Deliberately loose
 *   (no length or count limits: the API does not enforce them anyway); the server validates, filters and caps.
 * - AssistResult: what the route returns, labeled "For clinician review". Owner amendment: follow-up questions plus
 *   curated ids (symptoms, measures, interventions, referral kinds) only. No condition suggestions, no diagnosis, no
 *   risk decision; the app's own deterministic scorer stays the only source of "possible considerations".
 */
import { z } from "zod";
import { curated } from "@/lib/outbound";
import { SEAL_PATTERN } from "./seal";
import type { ReferralKind } from "@/lib/schemas-referrals";
import { getCatalog } from "./catalog";

export const DURATION_VALUES = ["unknown", "lt2w", "2to4w", "1to6m", "gte6m"] as const;
export const SET_DURATION_VALUES = ["lt2w", "2to4w", "1to6m", "gte6m"] as const;
export const TRI_STATE = ["yes", "no", "unknown"] as const;
export const SET_IMPAIRMENT_VALUES = ["yes", "no"] as const;

export const INPUT_LIMITS = {
  textChars: 1500,
  symptomIds: 80,
  candidateConditionIds: 12,
  answered: 20,
} as const;

export const OUTPUT_LIMITS = {
  questions: 5,
  answersPerQuestion: 4,
  effectsPerAnswer: 6,
  measures: 4,
  interventions: 6,
  referralKinds: 4,
  questionChars: 240,
  whyChars: 240,
  answerChars: 100,
} as const;

const catalog = getCatalog();
const TriState = z.enum(TRI_STATE);

export const AssistInput = z
  .strictObject({
    /** The clinician switched the assistant on for this session (UI toggle, memory only). Required on every call. */
    optIn: z.literal(true),
    text: z.string().max(INPUT_LIMITS.textChars).default(""),
    symptomIds: z.array(curated(catalog.allSymptomIds)).max(INPUT_LIMITS.symptomIds).default([]),
    duration: z.enum(DURATION_VALUES).default("unknown"),
    impairment: TriState.default("unknown"),
    /** Accepted so the UI can send its scoring state as-is; NEVER forwarded (42 CFR Part 2). */
    substancePossible: TriState.default("unknown"),
    medicalPossible: TriState.default("unknown"),
    candidateConditionIds: z.array(curated(catalog.allConditionIds)).max(INPUT_LIMITS.candidateConditionIds).default([]),
    /**
     * Follow-up answers already chosen, echoed back exactly as an earlier response returned them (question id, the
     * question text, the answer label and that answer's seal). Records whose seal does not verify are dropped.
     */
    answered: z
      .array(
        z.strictObject({
          questionId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "question id"),
          questionText: z.string().min(1).max(OUTPUT_LIMITS.questionChars),
          answerLabel: z.string().min(1).max(OUTPUT_LIMITS.answerChars),
          seal: z.string().regex(SEAL_PATTERN, "seal"),
        }),
      )
      .max(INPUT_LIMITS.answered)
      .default([]),
    lang: z.enum(["en", "es"]).default("en"),
  })
  .refine((v) => v.text.trim().length > 0 || v.symptomIds.length > 0 || v.candidateConditionIds.length > 0, {
    message: "Nothing to work from: add text, symptoms or candidate patterns",
  });
export type AssistInput = z.input<typeof AssistInput>;
export type AssistInputParsed = z.output<typeof AssistInput>;

/* ---------------- structured output sent to the API ---------------- */
export const ModelAnswer = z.object({
  label: z.string().describe("Short answer option the clinician can click, in the requested language: an observation, never a diagnosis or a condition name"),
  addSymptomIds: z.array(z.string()).describe("Catalog symptom ids this answer documents as present; may be empty"),
  negateSymptomIds: z.array(z.string()).describe("Catalog symptom ids this answer rules out; may be empty; never safety symptoms"),
  setDuration: z.enum(SET_DURATION_VALUES).describe("Only when the answer states how long the pattern has lasted").optional(),
  setImpairment: z.enum(SET_IMPAIRMENT_VALUES).describe("Only when the answer states whether daily functioning is affected").optional(),
});
export const ModelQuestion = z.object({
  id: z.string().describe("Short kebab-case id, unique in this response"),
  text: z.string().describe("The follow-up question for the clinician to ask or consider"),
  why: z.string().describe("One sentence: what the answer helps the clinician tell apart"),
  answers: z.array(ModelAnswer).describe("2 to 4 answer options"),
});
export const ModelOutputSchema = z.object({
  questions: z.array(ModelQuestion).describe("At most 5 follow-up questions, most useful first"),
  resources: z.object({
    measureIds: z.array(z.string()).describe("Catalog measure ids"),
    interventionIds: z.array(z.string()).describe("Catalog intervention ids, at most 6"),
    referralKinds: z.array(z.string()).describe("Catalog referral kinds, at most 4"),
  }),
  safetyPrompt: z
    .string()
    .describe("Only when the state suggests possible danger: one sentence asking the clinician to assess safety directly and use crisis resources. Never a risk level.")
    .optional(),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/* ---------------- what the route returns ---------------- */
export interface AssistAnswer {
  label: string;
  addSymptomIds: string[];
  negateSymptomIds: string[];
  setDuration?: (typeof SET_DURATION_VALUES)[number];
  setImpairment?: (typeof SET_IMPAIRMENT_VALUES)[number];
  /** Server-issued; send it back unchanged in `answered` with this question's id and text and this label. */
  seal: string;
}
export interface AssistQuestion {
  id: string;
  text: string;
  /** "Why this helps"; empty when the model's reason was dropped by the server-side checks. */
  why: string;
  answers: AssistAnswer[];
}
export interface AssistResult {
  label: "For clinician review";
  generatedBy: "Claude (Anthropic)";
  /** The model that produced the answer (a server-side fallback model when the requested one declined). */
  model: string;
  /** "declined": the model (and any fallback) refused; lists are empty and the app's own tools still apply. */
  status: "ok" | "declined";
  fallbackUsed: boolean;
  questions: AssistQuestion[];
  resources: { measureIds: string[]; interventionIds: string[]; referralKinds: ReferralKind[] };
  /** Display names for the resource ids (app content). */
  resourceLabels: {
    measures: Record<string, string>;
    interventions: Record<string, { name: string; modality: string }>;
    referralKinds: Partial<Record<ReferralKind, string>>;
  };
  /** Fixed app wording (never model wording). Present when a red flag was documented or the model raised one. */
  safetyPrompt?: string;
  /** True when substance-related ids or answers were held back from the request (42 CFR Part 2). */
  substanceInfoWithheld: boolean;
  /** Answered records that were not sent because their seal did not verify (e.g. after a key rotation). */
  droppedAnswers: number;
  disclaimer: string;
}
