/**
 * Re-derives the arithmetic behind a suggestion's score for the "Why suggested" panel, using the
 * same constants and rules as src/lib/scoring.ts. Display only; the score shown is always the
 * engine's own suggestion.score.
 */
import type { Condition } from "@/lib/schemas";
import { SCORING } from "@/lib/scoring";
import { DURATION_BANDS, type ScoringInput, type Suggestion } from "@/lib/types";

export interface ScoreExplanation {
  coreTotal: number;
  coreMatched: number;
  assocTotal: number;
  assocMatched: number;
  base: number;
  gates: { label: string; multiplier: number }[];
  coreCount: number;
  coreHits: number;
  minCore: number;
}

export function explainScore(cond: Condition, s: Suggestion, input: Omit<ScoringInput, "symptomIds">): ScoreExplanation {
  const all = [...s.matched, ...s.missing];
  const sum = (list: typeof all) => list.reduce((n, f) => n + f.weight, 0);
  const coreTotal = sum(all.filter((f) => f.kind === "core"));
  const assocTotal = sum(all.filter((f) => f.kind === "associated"));
  const coreMatched = sum(s.matched.filter((f) => f.kind === "core"));
  const assocMatched = sum(s.matched.filter((f) => f.kind === "associated"));
  const base =
    assocTotal > 0
      ? 100 * (SCORING.coreShare * (coreMatched / coreTotal) + SCORING.associatedShare * (assocMatched / assocTotal))
      : 100 * (coreMatched / coreTotal);

  const gates: ScoreExplanation["gates"] = [];
  if (input.duration !== "unknown") {
    const band = DURATION_BANDS[input.duration];
    if (band.maxWeeks <= cond.durationGate.minWeeks)
      gates.push({ label: "Duration shorter than usual for this pattern", multiplier: SCORING.durationMultiplier });
  }
  if (cond.impairmentRequired && input.impairment === "no")
    gates.push({ label: "No distress or impairment indicated", multiplier: SCORING.impairmentMultiplier });
  if (input.substancePossible === "yes")
    gates.push({ label: "Substance or medication could explain", multiplier: SCORING.substanceMultiplier });
  if (input.medicalPossible === "yes")
    gates.push({ label: "Medical condition could explain", multiplier: SCORING.medicalMultiplier });

  return {
    coreTotal,
    coreMatched,
    assocTotal,
    assocMatched,
    base,
    gates,
    coreCount: all.filter((f) => f.kind === "core").length,
    coreHits: s.matched.filter((f) => f.kind === "core").length,
    minCore: cond.minCore,
  };
}

export const STRENGTH_LABEL: Record<Suggestion["strength"], string> = {
  strong: "Strong match",
  moderate: "Moderate match",
  possible: "Possible match",
};
