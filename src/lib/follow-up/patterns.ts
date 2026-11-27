/**
 * Patterns to consider for a described fear ("panic from dogs"), even before anything in the knowledge base
 * scores. For each trigger category in play, the curated dictionary (content/trigger-objects.json
 * `conditionHints`) names the conditions to keep in mind; the ones in the knowledge base are returned with their
 * ICD-10-CM / ICD-11 codes, the "See DSM-5-TR" pointer, the features already documented and the ones not yet
 * documented, and up to four of those as tap-to-add symptom ids.
 *
 * Every pattern is labeled "For clinician review": something to consider and check, never a diagnosis. A pattern
 * with a required feature that is not documented (for example, PTSD without a documented event) waits until it is.
 * A category's first available hint always shows; later hints only when a feature of theirs is documented, they
 * already score, or one of their features names the described object (agoraphobia for "leaving the house", not
 * for "bridges").
 * Red-flag symptoms are never offered as tap-to-add here (they are added only by the clinician's own answers or
 * chips). Pure and deterministic: no I/O, nothing stored.
 */
import { normalizeText } from "@/lib/matcher";
import type { Condition, Symptom } from "@/lib/schemas";
import { featureMatch } from "@/lib/scoring";
import { TRIGGER_CATEGORIES, type TriggerCategory, type TriggerObjectsFile } from "@/lib/schemas-follow-up";
import type { FeatureRef, ScoringInput, ScoringResult, Suggestion } from "@/lib/types";
import { triggerDictionary } from "./dictionary";
import { REVIEW_LABEL } from "./engine";
import { objectLabel, type TriggerHit } from "./triggers";

export interface TriggerPattern {
  conditionId: string;
  name: string;
  icd10cm: { code: string; label: string }[];
  icd11: { code: string; label: string }[];
  dsmPointer: string;
  category: TriggerCategory;
  /** Curated labels of the objects that brought this pattern up ("dogs"). */
  objectLabels: string[];
  /** Original wording from the dictionary: what to clarify for this kind of fear. */
  clinicianNote: string;
  matched: FeatureRef[];
  missing: FeatureRef[];
  /** Up to 4 symptom ids not yet documented, most relevant first: offer them as tap-to-add chips. */
  addable: string[];
  /** Set when the same pattern is already among the scored possible considerations. */
  scored?: Pick<Suggestion, "score" | "strength">;
  label: typeof REVIEW_LABEL;
}

export interface TriggerPatternOptions {
  conditions: readonly Condition[];
  symptoms: readonly Symptom[];
  /** Extra categories from answers (applyAnswers().triggerCategories), e.g. "trauma-reminder" after "after a bite". */
  extraCategories?: readonly TriggerCategory[];
  /** Symptom ids known to be absent (negated in the text or by an answer): never offered as chips. */
  absentSymptomIds?: readonly string[];
  dictionary?: TriggerObjectsFile;
  /** Default 2. */
  limit?: number;
}

const MAX_ADDABLE = 4;

/** Whole-word containment on normalized text ("crosses the street to avoid dogs" contains "dogs"). */
function mentions(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function triggerPatterns(
  triggers: readonly TriggerHit[],
  input: ScoringInput,
  result: ScoringResult,
  opts: TriggerPatternOptions,
): TriggerPattern[] {
  const dict = opts.dictionary ?? triggerDictionary;
  const limit = Math.max(0, opts.limit ?? 2);
  const hits = triggers.filter((h) => !h.negated);

  // Categories in order of first mention (a trauma reminder's own category right after it), then answer categories.
  const objectsByCategory = new Map<TriggerCategory, string[]>();
  const addObject = (c: TriggerCategory, objectId?: string) => {
    const list = objectsByCategory.get(c) ?? [];
    if (objectId && !list.includes(objectId)) list.push(objectId);
    objectsByCategory.set(c, list);
  };
  for (const h of hits) {
    addObject(h.category, h.objectId);
    if (h.baseCategory) addObject(h.baseCategory, h.objectId);
  }
  for (const c of TRIGGER_CATEGORIES) {
    if (!opts.extraCategories?.includes(c) || objectsByCategory.has(c)) continue;
    // An answer category (a fear tied to an event) applies to the objects already described.
    objectsByCategory.set(c, [...new Set(hits.map((h) => h.objectId))]);
  }
  if (objectsByCategory.size === 0 || limit === 0) return [];

  const conditionById = new Map(opts.conditions.map((c) => [c.id, c] as const));
  const lex = new Map(opts.symptoms.map((s) => [s.id, s] as const));
  const labelOf = (id: string) => lex.get(id)?.label ?? id;
  const present = new Set(input.symptomIds);
  const absent = new Set(opts.absentSymptomIds ?? []);
  const scored = new Map(result.suggestions.map((s) => [s.conditionId, s] as const));
  const objectTerms = (ids: readonly string[]) =>
    dict.objects.filter((o) => ids.includes(o.id)).flatMap((o) => [o.label, ...o.terms].map((t) => normalizeText(t)).filter(Boolean));

  const out: TriggerPattern[] = [];
  const offered = new Set<string>();
  for (const [category, objectIds] of objectsByCategory) {
    const info = dict.categories[category];
    const terms = objectTerms(objectIds);
    // 1 when the symptom's own wording names the described object ("cant leave the house" for leaving the house).
    const relevance = (f: FeatureRef) => {
      const s = lex.get(f.symptomId);
      const text = s ? [s.label, ...s.synonyms].map((x) => normalizeText(x)) : [];
      return text.some((t) => terms.some((term) => mentions(t, term))) ? 1 : 0;
    };
    let shownForCategory = 0;
    for (const conditionId of info.conditionHints) {
      if (out.length >= limit) return out;
      const cond = conditionById.get(conditionId);
      if (!cond || out.some((p) => p.conditionId === conditionId)) continue;
      if (cond.requiredFeatures.some((r) => !present.has(r.symptomId))) continue;

      const { matched, missing } = featureMatch(cond, present, labelOf);
      // The category's first pattern always shows; later ones only with something pointing to them already.
      if (shownForCategory > 0 && matched.length === 0 && !scored.has(conditionId) && !missing.some((f) => relevance(f) > 0)) continue;
      shownForCategory++;
      const panicCue = hits.some((h) => h.cue === "panic" && objectIds.includes(h.objectId));
      const candidates = missing.filter((f) => {
        const s = lex.get(f.symptomId);
        if (!s || s.redFlag || absent.has(f.symptomId) || offered.has(f.symptomId)) return false;
        // Core features, plus panic features of the pattern when the fear was described as panic.
        return f.kind === "core" || (panicCue && s.category === "panic");
      });
      const addable = candidates
        .map((f, i) => ({ f, i, r: relevance(f) }))
        .sort((a, b) => (a.f.kind === b.f.kind ? 0 : a.f.kind === "core" ? -1 : 1) || b.r - a.r || b.f.weight - a.f.weight || a.i - b.i)
        .slice(0, MAX_ADDABLE)
        .map((x) => x.f.symptomId);
      for (const id of addable) offered.add(id);

      const s = scored.get(conditionId);
      out.push({
        conditionId,
        name: cond.name,
        icd10cm: cond.icd10cm.map((c) => ({ code: c.code, label: c.label })),
        icd11: cond.icd11.map((c) => ({ code: c.code, label: c.label })),
        dsmPointer: cond.dsmPointer,
        category,
        objectLabels: objectIds.map((id) => objectLabel(id, dict)),
        clinicianNote: info.clinicianNote,
        matched,
        missing,
        addable,
        ...(s ? { scored: { score: s.score, strength: s.strength } } : {}),
        label: REVIEW_LABEL,
      });
    }
  }
  return out;
}
