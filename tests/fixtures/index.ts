/**
 * Small, schema-validated fixtures for the matcher and scoring tests.
 * Fictional "pattern" conditions only: no clinical claims, no DSM text, fake codes.
 */
import { ConditionSchema, SymptomLexiconSchema, type Condition, type Symptom } from "@/lib/schemas";
import type { ScoringInput } from "@/lib/types";
import lexiconJson from "./mini-lexicon.json";
import conditionsJson from "./mini-conditions.json";

export const fxLexicon = SymptomLexiconSchema.parse(lexiconJson);
export const fxSymptoms: Symptom[] = fxLexicon.symptoms;
export const fxConditions: Condition[] = conditionsJson.map((c) => ConditionSchema.parse(c));

export function fxCondition(id: string): Condition {
  const c = fxConditions.find((x) => x.id === id);
  if (!c) throw new Error(`fixture condition ${id} missing`);
  return c;
}

/** Deep copy of a fixture condition with a new id/name (for tie, max-7 and A=0 tests). */
export function cloneCondition(id: string, newId: string, name: string, patch: Partial<Condition> = {}): Condition {
  const copy = structuredClone(fxCondition(id));
  return ConditionSchema.parse({ ...copy, id: newId, name, comorbidities: [], ...patch });
}

/** Neutral input: everything known, nothing gated. */
export function input(symptomIds: string[], over: Partial<ScoringInput> = {}): ScoringInput {
  return {
    symptomIds,
    duration: "gte6m",
    impairment: "yes",
    substancePossible: "no",
    medicalPossible: "no",
    ...over,
  };
}
