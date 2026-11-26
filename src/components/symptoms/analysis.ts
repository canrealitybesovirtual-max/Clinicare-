"use client";
/**
 * Derived, memory-only view of the session: which lexicon symptoms are in play (chips + matches in
 * the already-scrubbed text), which were noted as absent, and which red flags are present.
 * Pure derivation; nothing is stored beyond the session itself.
 */
import * as React from "react";
import { conditions, getSymptom, lexicon } from "@/lib/content";
import { matchSymptoms, type MatchResult } from "@/lib/matcher";
import { NO_MATCH_MESSAGE, scoreConditions } from "@/lib/scoring";
import type { RedFlagType, Symptom } from "@/lib/schemas";
import type { ScoringResult } from "@/lib/types";
import { useSession, type SessionState } from "@/state/session";

export interface SymptomAnalysis {
  match: MatchResult;
  /** All symptom ids used for scoring: chips first, then text matches (deduplicated). */
  ids: string[];
  /** Cultural concepts of distress named in the text or chips: shown with a prompt, never scored. */
  cultural: Symptom[];
  /** Family history and resolved past history from the text: shown, never scored. */
  attributed: MatchResult["attributed"];
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
  const selected = new Set(state.selectedSymptomIds);
  const all = [...new Set([...state.selectedSymptomIds, ...match.matches.map((m) => m.symptomId)])];
  const isCultural = (id: string) => getSymptom(id)?.category === "cultural";
  const ids = all.filter((id) => !isCultural(id));
  const cultural = all.filter(isCultural).flatMap((id) => getSymptom(id) ?? []);
  const attributed = match.attributed.filter((a) => !selected.has(a.symptomId));
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
  // Text typed but nothing recognized: say so, rather than asking for symptoms that were already described.
  const shown = result.status === "empty" && state.symptomText.trim() ? { ...result, message: NO_MATCH_MESSAGE } : result;
  return {
    match,
    ids,
    cultural,
    attributed,
    detectedIds: new Set(match.matches.map((m) => m.symptomId)),
    absent,
    redFlags,
    result: shown,
  };
}

export function useSymptomAnalysis(): SymptomAnalysis {
  const { state } = useSession();
  return React.useMemo(() => analyze(state), [state]);
}
