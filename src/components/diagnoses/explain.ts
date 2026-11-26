/**
 * Re-derives the arithmetic behind a suggestion's score for the "Why suggested" panel, using the
 * engine's own breakdown (src/lib/scoring.ts scoreBreakdown: grouped features count once). Display
 * only; the score shown is always the engine's own suggestion.score, including any hold.
 */
import type { Condition } from "@/lib/schemas";
import { SCORING, scoreBreakdown } from "@/lib/scoring";
import { DURATION_BANDS, type ScoringInput, type Suggestion } from "@/lib/types";

export interface ScoreExplanation {
  coreTotal: number;
  coreMatched: number;
  assocTotal: number;
  assocMatched: number;
  base: number;
  gates: { label: string; multiplier: number }[];
  /** round(base x gates), clamped to 0-100, before any hold. */
  raw: number;
  /** Set when the engine held the score below `raw` (breadth, required feature, red flag). */
  heldAt?: number;
  holdReasons: string[];
  coreCount: number;
  coreHits: number;
  minCore: number;
}

const HOLD_LABEL: Partial<Record<Suggestion["flags"][number]["type"], string>> = {
  breadth: "too few supporting features or symptom areas documented",
  required: "a required feature is not documented",
  "red-flag": "a red flag in the same input",
};

export function explainScore(cond: Condition, s: Suggestion, input: Omit<ScoringInput, "symptomIds">): ScoreExplanation {
  const bd = scoreBreakdown(cond, new Set(s.matched.map((f) => f.symptomId)));

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

  const product = gates.reduce((n, g) => n * g.multiplier, 1);
  const raw = Math.min(100, Math.max(0, Math.round(bd.base * product)));
  const held = s.score < raw;
  const holdReasons = held
    ? [...new Set(s.flags.flatMap((f) => (HOLD_LABEL[f.type] ? [HOLD_LABEL[f.type] as string] : [])))]
    : [];

  return {
    coreTotal: bd.coreTotal,
    coreMatched: bd.coreMatched,
    assocTotal: bd.assocTotal,
    assocMatched: bd.assocMatched,
    base: bd.base,
    gates,
    raw,
    heldAt: held ? s.score : undefined,
    holdReasons,
    coreCount: bd.coreSlots,
    coreHits: bd.coreHits,
    minCore: cond.minCore,
  };
}

export const STRENGTH_LABEL: Record<Suggestion["strength"], string> = {
  strong: "Strong match",
  moderate: "Moderate match",
  possible: "Possible match",
};
