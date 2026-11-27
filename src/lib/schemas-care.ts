/**
 * Content contract + loader for content/care/medication-effects.json (clinician mode only): medicines whose
 * current FDA labeling lists psychiatric effects (depression, suicidal thoughts, agitation, sleep change, psychosis,
 * a switch into a high, confusion), for medical-interface conversations with prescribers.
 *
 * - Education only, never prescribing advice (G4): no doses, no switching or stopping advice; questions go to the
 *   prescriber. Wording is original (G1, G2): label facts are summarized, never copied, and text fields refuse
 *   double quotation marks.
 * - medicationIds point at curated entries of content/medications.json. Only those curated names can be looked up
 *   live (POST /api/drug-label sends the curated name only, G5, G17); other medicines are link-outs.
 * - Governance (G10): sources[] on every entry and on the file; license "original", lastVerified, reviewedBy.
 * Isomorphic: no server-only imports.
 */
import { z } from "zod";
import effectsJson from "@content/care/medication-effects.json";
import { getMedication } from "./schemas-medications";
import { SourceSchema, governance, slug } from "./schemas";

const QUOTES = /["“”]/;
const original = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !QUOTES.test(s), "original wording only: no quoted passages (remove double quotes)");

export const PSYCH_EFFECTS = [
  "low-mood",
  "suicidal-thoughts",
  "anxiety-agitation",
  "irritability-aggression",
  "sleep-change",
  "psychosis",
  "mania-activation",
  "confusion",
] as const;
export const PsychEffect = z.enum(PSYCH_EFFECTS);
export type PsychEffect = z.infer<typeof PsychEffect>;

export const PSYCH_EFFECT_LABELS: Record<PsychEffect, string> = {
  "low-mood": "Low mood or depression",
  "suicidal-thoughts": "Suicidal thoughts or behavior",
  "anxiety-agitation": "Anxiety, restlessness or agitation",
  "irritability-aggression": "Irritability, hostility or aggression",
  "sleep-change": "Sleep changes or vivid dreams",
  psychosis: "Hallucinations or other psychotic symptoms",
  "mania-activation": "A switch into a high (mania or hypomania)",
  confusion: "Confusion or memory problems",
};

/** Where the effect sits in the current FDA label (checked on lastVerified). */
export const LABEL_STATUSES = ["boxed-warning", "warning", "precaution"] as const;
export const LABEL_STATUS_LABELS: Record<(typeof LABEL_STATUSES)[number], string> = {
  "boxed-warning": "Boxed warning",
  warning: "Warnings and precautions",
  precaution: "Precautions",
};

const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "https URLs only");

export const MedicationEffectSchema = z.strictObject({
  id: slug,
  /** Generic name or class, as clinicians would say it. */
  medicine: original(3, 90),
  /** What it is usually prescribed for, in plain words (never a client's condition). */
  usedFor: original(3, 140),
  effects: z.array(PsychEffect).min(1).max(PSYCH_EFFECTS.length),
  labelStatus: z.enum(LABEL_STATUSES),
  /** What the label says, summarized in the app's own words, with what to do. */
  summary: original(40, 600),
  /** Curated medications.json ids that the live label check can look up. */
  medicationIds: z.array(slug).max(8),
  links: z.array(z.strictObject({ title: original(3, 120), publisher: original(2, 120), url: httpsUrl })).max(3),
  sources: z.array(SourceSchema).min(1),
  sud: z.boolean().default(false),
});
export type MedicationEffect = z.infer<typeof MedicationEffectSchema>;

export const MedicationEffectsFileSchema = z
  .strictObject({
    id: z.literal("medication-effects"),
    title: original(3, 120),
    about: original(40, 700),
    effects: z.array(MedicationEffectSchema).min(5),
    ...governance,
    license: z.literal("original"),
  })
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.effects.forEach((e, i) => {
      if (seen.has(e.id)) ctx.addIssue({ code: "custom", message: `duplicate effect id ${e.id}`, path: ["effects", i, "id"] });
      seen.add(e.id);
      if (new Set(e.effects).size !== e.effects.length) ctx.addIssue({ code: "custom", message: `${e.id}: duplicate effect`, path: ["effects", i] });
    });
  });
export type MedicationEffectsFile = z.infer<typeof MedicationEffectsFileSchema>;

export const medicationEffectsFile: MedicationEffectsFile = MedicationEffectsFileSchema.parse(effectsJson);
export const MEDICATION_EFFECTS: readonly MedicationEffect[] = medicationEffectsFile.effects;

/** Cross-file checks (validate-content and tests): medicationIds resolve, and SUD-treatment medicines are flagged. */
export function medicationEffectProblems(file: MedicationEffectsFile = medicationEffectsFile, today = new Date().toISOString().slice(0, 10)): string[] {
  const p: string[] = [];
  if (file.lastVerified > today) p.push(`care/medication-effects: lastVerified in the future: ${file.lastVerified}`);
  for (const e of file.effects)
    for (const id of e.medicationIds) {
      const med = getMedication(id);
      if (!med || med.id !== id) p.push(`care/medication-effects/${e.id}: unknown medication ${id}`);
      else if ((med.sudRelated || med.category === "aud") && !e.sud)
        p.push(`care/medication-effects/${e.id}: links ${id}, which has substance use treatment uses, but sud is false (G6)`);
    }
  return p;
}
