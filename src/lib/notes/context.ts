/**
 * Reads the memory-only session into the note helper's context (read-only; nothing is written back).
 * Curated ids become curated wording: lexicon labels, measure bands, intervention names, plan objectives.
 */
import { scoreMeasure } from "@/lib/measures";
import type { Measure, Symptom } from "@/lib/schemas";
import { planText, selectedProblems, type PlanDraft } from "@/components/plan/plan-model";
import type { NoteContext, NoteMeasure } from "./note";

export interface NoteSessionInput {
  /** Symptom ids in play (chips, text matches, follow-up answers), as the Symptom Finder scores them. */
  symptoms: readonly Symptom[];
  cultural: readonly Symptom[];
  redFlags: readonly Symptom[];
  measureAnswers: Readonly<Record<string, readonly (number | null)[]>>;
  plan: PlanDraft | null;
}

/** Measures with at least one answer, scored with the app's own scorer. */
export function sessionMeasures(measures: readonly Measure[], answers: NoteSessionInput["measureAnswers"]): NoteMeasure[] {
  return measures.flatMap((m) => {
    const a = answers[m.id];
    if (!a || a.every((v) => v === null)) return [];
    const score = scoreMeasure(m, a);
    return [
      {
        shortName: m.shortName,
        total: score.total,
        max: m.scoring.max,
        answered: score.answered,
        items: m.items.length,
        band: score.band?.label ?? null,
        riskMessages: score.riskFlags.map((f) => f.message),
      },
    ];
  });
}

/** Selected plan objectives and the interventions chosen for them (names from the library). */
export function planSelections(plan: PlanDraft | null, interventionNames: Readonly<Record<string, string>>) {
  if (!plan) return { objectives: [] as string[], interventions: [] as string[] };
  const objectives = selectedProblems(plan).flatMap((p) => p.objectives.filter((o) => o.selected && planText(o)));
  const ids = [...new Set(objectives.flatMap((o) => o.interventionIds))];
  return {
    objectives: objectives.map(planText),
    interventions: ids.map((id) => interventionNames[id]).filter((n): n is string => !!n),
  };
}

export function noteContext(
  input: NoteSessionInput,
  measures: readonly Measure[],
  interventionNames: Readonly<Record<string, string>>,
): NoteContext {
  const { objectives, interventions } = planSelections(input.plan, interventionNames);
  return {
    concerns: input.symptoms.map((s) => s.label),
    cultural: input.cultural.map((s) => s.label),
    redFlags: input.redFlags.map((s) => s.label),
    measures: sessionMeasures(measures, input.measureAnswers),
    interventions,
    objectives,
  };
}
