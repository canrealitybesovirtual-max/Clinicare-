"use client";
/**
 * Derived, memory-only view of the session: which lexicon symptoms are in play (chips + matches in
 * the already-scrubbed text), which were noted as absent, and which red flags are present.
 * Pure derivation; nothing is stored beyond the session itself.
 */
import * as React from "react";
import { conditions, getSymptom, lexicon } from "@/lib/content";
import { matchSymptoms, type MatchResult } from "@/lib/matcher";
import { scoreConditions } from "@/lib/scoring";
import type { RedFlagType, Symptom } from "@/lib/schemas";
import type { ScoringResult } from "@/lib/types";
import { useSession, type SessionState } from "@/state/session";

export interface SymptomAnalysis {
  match: MatchResult;
  /** All symptom ids used for scoring: chips first, then text matches (deduplicated). */
  ids: string[];
  detectedIds: Set<string>;
  /** Negated in the text and not selected as a chip. */
  absent: MatchResult["negated"];
  redFlags: { type: RedFlagType; symptoms: Symptom[] }[];
  result: ScoringResult;
}

const RED_FLAG_ORDER: RedFlagType[] = [
  "suicidality",
  "homicidality",
  "psychosis",
  "mania",
  "eating-disorder-medical",
  "withdrawal",
];

export function analyze(state: SessionState): SymptomAnalysis {
  const match = matchSymptoms(state.symptomText, lexicon.symptoms);
  const ids = [...new Set([...state.selectedSymptomIds, ...match.matches.map((m) => m.symptomId)])];
  const selected = new Set(state.selectedSymptomIds);
  const absent = match.negated.filter((n) => !selected.has(n.symptomId));
  const groups = new Map<RedFlagType, Symptom[]>();
  for (const id of ids) {
    const s = getSymptom(id);
    if (s?.redFlag) groups.set(s.redFlag, [...(groups.get(s.redFlag) ?? []), s]);
  }
  const redFlags = RED_FLAG_ORDER.filter((t) => groups.has(t)).map((type) => ({ type, symptoms: groups.get(type) ?? [] }));
  const result = scoreConditions(
    {
      symptomIds: ids,
      duration: state.duration,
      impairment: state.impairment,
      substancePossible: state.substancePossible,
      medicalPossible: state.medicalPossible,
    },
    conditions,
    lexicon.symptoms,
  );
  return { match, ids, detectedIds: new Set(match.matches.map((m) => m.symptomId)), absent, redFlags, result };
}

export function useSymptomAnalysis(): SymptomAnalysis {
  const { state } = useSession();
  return React.useMemo(() => analyze(state), [state]);
}
