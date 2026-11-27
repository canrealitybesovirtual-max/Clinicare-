"use client";
/**
 * Derived, memory-only view of the session: which lexicon symptoms are in play (chips + matches in the
 * already-scrubbed text + follow-up answers), which were noted as absent, which red flags are present, which
 * feared objects or situations were described, and the scored possible considerations.
 * Pure derivation; nothing is stored beyond the session itself.
 *
 * Follow-up answers ("Help me ask more") are folded in on every render from their curated ids. Answers that set
 * duration, impairment, substance or medical are written into the session's own context fields when the clinician
 * picks them, so the fold ignores those effects here and a later edit of the field always wins.
 */
import * as React from "react";
import { conditions, getSymptom, lexicon } from "@/lib/content";
import { applyAnswers, extractTriggers, type AnsweredRecord, type FoldedAnswers, type TriggerHit } from "@/lib/follow-up";
import { matchSymptoms, type MatchResult } from "@/lib/matcher";
import { NO_MATCH_MESSAGE, scoreConditions } from "@/lib/scoring";
import type { RedFlagType, Symptom } from "@/lib/schemas";
import type { ScoringResult } from "@/lib/types";
import { useSession, type SessionState } from "@/state/session";
import { useAiSession } from "@/components/ai/ai-session";

export interface SymptomAnalysis {
  match: MatchResult;
  /** All symptom ids used for scoring: chips first, then text matches, then answer additions (deduplicated). */
  ids: string[];
  /** Added by a follow-up answer (not a chip, not in the text). */
  fromAnswers: ReadonlySet<string>;
  /** Matched in the text but set aside by a follow-up answer ("no real avoidance"). Never a red flag. */
  setAsideByAnswers: string[];
  /** Cultural concepts of distress named in the text or chips: shown with a prompt, never scored. */
  cultural: Symptom[];
  /** Family history and resolved past history from the text: shown, never scored. */
  attributed: MatchResult["attributed"];
  detectedIds: Set<string>;
  /** Negated in the text and not selected as a chip. */
  absent: MatchResult["negated"];
  redFlags: { type: RedFlagType; symptoms: Symptom[] }[];
  /** A substance-use symptom is selected, matched or added by an answer (G6: show the 42 CFR Part 2 prompt). */
  sud: boolean;
  /** Feared objects or situations described in the text (curated ids; the typed words stay on this device). */
  triggers: TriggerHit[];
  folded: FoldedAnswers;
  result: ScoringResult;
}

const SUD_ID = /(?:^|-)(?:alcohol|substance|opioid|cannabis|stimulant|sedative|hallucinogen|inhalant|intoxication|drug)(?:-|$)/;

/**
 * Substance-use symptoms, by the same rule as the server catalog (src/server/ai/catalog.ts): a withdrawal flag,
 * an id that names a substance, or a feature used only by substance-use conditions.
 */
export const SUD_SYMPTOM_IDS: ReadonlySet<string> = (() => {
  const usedBySud = new Set<string>();
  const usedByOther = new Set<string>();
  for (const c of conditions)
    for (const f of c.features) (c.sud || SUD_ID.test(c.id) ? usedBySud : usedByOther).add(f.symptomId);
  const ids = new Set<string>();
  for (const s of lexicon.symptoms)
    if (s.redFlag === "withdrawal" || SUD_ID.test(s.id) || (usedBySud.has(s.id) && !usedByOther.has(s.id))) ids.add(s.id);
  return ids;
})();

const RED_FLAG_ORDER: RedFlagType[] = [
  "suicidality",
  "homicidality",
  "psychosis",
  "mania",
  "eating-disorder-medical",
  "withdrawal",
];

const NO_ANSWERS: readonly AnsweredRecord[] = [];

export function analyze(state: SessionState, answered: readonly AnsweredRecord[] = NO_ANSWERS): SymptomAnalysis {
  const match = matchSymptoms(state.symptomText, lexicon.symptoms);
  const selected = new Set(state.selectedSymptomIds);
  const all = [...new Set([...state.selectedSymptomIds, ...match.matches.map((m) => m.symptomId)])];
  const isCultural = (id: string) => getSymptom(id)?.category === "cultural";
  const cultural = all.filter(isCultural).flatMap((id) => getSymptom(id) ?? []);
  const attributed = match.attributed.filter((a) => !selected.has(a.symptomId));
  const absent = match.negated.filter((n) => !selected.has(n.symptomId));
  const detectedIds = new Set(match.matches.map((m) => m.symptomId));

  const folded = applyAnswers(
    {
      symptomIds: all.filter((id) => !isCultural(id)),
      duration: state.duration,
      impairment: state.impairment,
      substancePossible: state.substancePossible,
      medicalPossible: state.medicalPossible,
    },
    answered,
    { protectedSymptomIds: state.selectedSymptomIds, gates: "ignore" },
  );
  const ids = folded.scoringInput.symptomIds;

  const groups = new Map<RedFlagType, Symptom[]>();
  for (const id of ids) {
    const s = getSymptom(id);
    if (s?.redFlag) groups.set(s.redFlag, [...(groups.get(s.redFlag) ?? []), s]);
  }
  const redFlags = RED_FLAG_ORDER.filter((t) => groups.has(t)).map((type) => ({ type, symptoms: groups.get(type) ?? [] }));
  const result = scoreConditions(folded.scoringInput, conditions, lexicon.symptoms);
  // Text typed but nothing recognized: say so, rather than asking for symptoms that were already described.
  const shown = result.status === "empty" && state.symptomText.trim() ? { ...result, message: NO_MATCH_MESSAGE } : result;
  return {
    match,
    ids,
    fromAnswers: new Set(folded.addedSymptomIds),
    setAsideByAnswers: folded.negatedSymptomIds.filter((id) => detectedIds.has(id)),
    cultural,
    attributed,
    detectedIds,
    absent,
    redFlags,
    sud: ids.some((id) => SUD_SYMPTOM_IDS.has(id)),
    triggers: extractTriggers(state.symptomText),
    folded,
    result: shown,
  };
}

export function useSymptomAnalysis(): SymptomAnalysis {
  const { state } = useSession();
  const [ai] = useAiSession();
  const answered = ai.followUpAnswers;
  return React.useMemo(() => analyze(state, answered), [state, answered]);
}
