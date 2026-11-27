/**
 * Side-by-side comparison of 2 or 3 possible considerations from the session (diagnoses/compare). Pure.
 *
 * Works only from what the app already holds: the session's scored suggestions (matched and missing features),
 * each condition's own original content (duration note, rule-outs, differentials with distinguishing notes, codes,
 * the See DSM-5-TR pointer) and the follow-up questions declared to tell conditions apart (discriminates[]).
 * It adds no score, no ranking and no verdict (G3): it lays the patterns next to each other for clinician review.
 */
import type { Condition } from "@/lib/schemas";
import { TRIGGER_TOKEN, type FollowUpQuestionDef } from "@/lib/schemas-follow-up";
import type { FeatureRef, Suggestion } from "@/lib/types";

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;
/** Most questions shown under "Questions that help tell them apart". */
export const COMPARE_QUESTIONS_MAX = 6;

export interface CompareFeature {
  symptomId: string;
  label: string;
  kind: FeatureRef["kind"];
  documented: boolean;
}

export interface CompareColumn {
  conditionId: string;
  name: string;
  icd10cm: readonly { code: string; label: string }[];
  icd11: readonly { code: string; label: string }[];
  dsmPointer: string;
  coreMatched: FeatureRef[];
  coreMissing: FeatureRef[];
  supportingMatched: FeatureRef[];
  supportingMissing: FeatureRef[];
  /** Features on this pattern's list that none of the other compared patterns list. */
  distinctive: CompareFeature[];
  durationNote: string;
  ruleOuts: Condition["ruleOuts"];
  /** This condition's own distinguishing notes that point at another compared pattern. */
  versus: { otherId: string; otherName: string; text: string }[];
  sud: boolean;
}

export interface CompareQuestion {
  id: string;
  text: string;
  why: string;
  /** Compared conditions the question is declared to bear on. */
  conditionIds: string[];
}

export interface CompareResult {
  columns: CompareColumn[];
  /** Features every compared pattern lists, with whether they are documented. */
  shared: CompareFeature[];
  questions: CompareQuestion[];
}

/** The first suggestions in the session's order (the default comparison), at most COMPARE_MIN. */
export function defaultSelection(suggestions: readonly Suggestion[]): string[] {
  return suggestions.slice(0, COMPARE_MIN).map((s) => s.conditionId);
}

const baseName = (s: string) =>
  s
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toLowerCase();

/** Does a differential entry of one condition name the other condition (by ICD-10-CM code or by name)? */
export function differentialPointsAt(diff: Condition["differentials"][number], other: Condition): boolean {
  const code = diff.icd10cm;
  if (code && other.icd10cm.some((c) => c.code.startsWith(code))) return true;
  const label = baseName(diff.label);
  const name = baseName(other.name);
  return label === name || label.startsWith(`${name} `) || name.startsWith(`${label} `);
}

function features(s: Suggestion): CompareFeature[] {
  return [
    ...s.matched.map((f) => ({ symptomId: f.symptomId, label: f.label, kind: f.kind, documented: true })),
    ...s.missing.map((f) => ({ symptomId: f.symptomId, label: f.label, kind: f.kind, documented: false })),
  ];
}

const questionText = (q: FollowUpQuestionDef): string | null => (q.text.includes(TRIGGER_TOKEN) ? (q.textNoTrigger ?? null) : q.text);

/**
 * Builds the comparison for the chosen suggestions (in the order given). Suggestions whose condition is unknown
 * are skipped. Questions bearing on two or more compared conditions come first, then those bearing on one.
 */
export function compareSuggestions(
  chosen: readonly Suggestion[],
  lookup: (id: string) => Condition | undefined,
  bank: readonly FollowUpQuestionDef[],
): CompareResult {
  const pairs = chosen
    .slice(0, COMPARE_MAX)
    .flatMap((s) => {
      const c = lookup(s.conditionId);
      return c ? [{ s, c }] : [];
    });
  const ids = pairs.map((p) => p.c.id);
  const featureSets = pairs.map((p) => new Set(p.c.features.map((f) => f.symptomId)));

  const columns: CompareColumn[] = pairs.map(({ s, c }, i) => {
    const others = pairs.filter((_, j) => j !== i);
    return {
      conditionId: c.id,
      name: s.name,
      icd10cm: c.icd10cm,
      icd11: c.icd11,
      dsmPointer: c.dsmPointer,
      coreMatched: s.matched.filter((f) => f.kind === "core"),
      coreMissing: s.missing.filter((f) => f.kind === "core"),
      supportingMatched: s.matched.filter((f) => f.kind === "associated"),
      supportingMissing: s.missing.filter((f) => f.kind === "associated"),
      distinctive: features(s).filter((f) => featureSets.every((set, j) => j === i || !set.has(f.symptomId))),
      durationNote: c.durationGate.note,
      ruleOuts: c.ruleOuts,
      versus: others.flatMap(({ c: other }) =>
        c.differentials.filter((d) => differentialPointsAt(d, other)).map((d) => ({ otherId: other.id, otherName: other.name, text: d.distinguishing })),
      ),
      sud: c.sud,
    };
  });

  const first = pairs[0];
  const shared = first && pairs.length >= COMPARE_MIN ? features(first.s).filter((f) => featureSets.every((set) => set.has(f.symptomId))) : [];

  const questions = bank
    .map((q) => ({ q, hits: q.discriminates.filter((id) => ids.includes(id)), text: questionText(q) }))
    .filter((x): x is { q: FollowUpQuestionDef; hits: string[]; text: string } => x.hits.length > 0 && x.text !== null)
    .sort((a, b) => b.hits.length - a.hits.length || a.q.priority - b.q.priority)
    .slice(0, COMPARE_QUESTIONS_MAX)
    .map(({ q, hits, text }) => ({ id: q.id, text, why: q.why.replaceAll(TRIGGER_TOKEN, "the feared object or situation"), conditionIds: hits }));

  return { columns, shared, questions };
}
