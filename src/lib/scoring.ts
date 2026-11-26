/**
 * Explainable, deterministic condition scoring (spec section 4).
 * Pure: no I/O, no clock, no randomness; the same input always gives the same output, whatever the
 * order of input.symptomIds or of the conditions array. Output is a ranked list of POSSIBLE
 * considerations "for clinician review" with matched and missing features; it never states a diagnosis
 * and never decides risk.
 *
 * Per condition (features de-duplicated by symptomId, first entry wins):
 *   C  = total weight of core features        mc = weight of matched core features
 *   A  = total weight of associated features  ma = weight of matched associated features
 *   base = 100 * (0.7 * mc/C + 0.3 * ma/A)     (A = 0 => base = 100 * mc/C)
 *   A condition with no matched core feature is skipped (it is never forced into the list).
 *
 * Gates (each one multiplies the base score and adds a flag, so the clinician can see why):
 *   duration     band known and DURATION_BANDS[band].maxWeeks <= durationGate.minWeeks  => x0.6 + flag
 *                "unknown" and durationGate.minWeeks > 0                                => info flag only
 *   impairment   "no" and impairmentRequired => x0.6 + flag;  "unknown" and impairmentRequired => info flag
 *   substance    substancePossible "yes" => x0.75 + flag listing the condition's substance rule-outs
 *   medical      medicalPossible "yes"   => x0.75 + flag listing the condition's medical rule-outs
 *   partial-core matched core count < minCore => strength capped at "possible" + flag
 *   breadth      the score reaches "strong" but matched associated weight is under 25% of the
 *                condition's associated weight (A > 0)  => score held at 64 ("moderate") + flag.
 *                Key features alone are not a full picture: e.g. low mood + loss of interest with
 *                nothing else documented stays "moderate" until supporting features are recorded.
 *
 * score = round(base * gate multipliers), clamped to 0-100 (then the breadth hold, if it applies).
 * strength: score >= 65 "strong", >= 40 "moderate", otherwise "possible" (after the partial-core cap).
 * Scores below 15 are dropped; the rest are sorted by score desc, then name, then id; at most 7 shown.
 * matched / missing: FeatureRefs with lexicon labels, core first, then weight desc, then file order.
 * comorbidityNotes: when two shown suggestions are both moderate or strong and either one lists the
 *   other in comorbidities[], each gets a note (its own note text when it has one, else the other's).
 * redFlags: every input symptom whose lexicon entry carries redFlag, computed even when nothing is
 *   suggested; sorted by red-flag type order, then label, then id.
 * status: "empty" when there are no symptoms; "insufficient" when symptoms exist but no suggestion
 *   survives (this includes "no condition has a core match"); otherwise "ok".
 */
import { RedFlagType, type Condition, type ConditionFeature, type Symptom } from "./schemas";
import {
  DURATION_BANDS,
  type FeatureRef,
  type RedFlagHit,
  type ScoringInput,
  type ScoringResult,
  type Suggestion,
} from "./types";

export const SCORING = {
  coreShare: 0.7,
  associatedShare: 0.3,
  durationMultiplier: 0.6,
  impairmentMultiplier: 0.6,
  substanceMultiplier: 0.75,
  medicalMultiplier: 0.75,
  strongAt: 65,
  moderateAt: 40,
  breadthShare: 0.25,
  minScore: 15,
  maxSuggestions: 7,
} as const;

export const EMPTY_MESSAGE =
  "Add symptoms (tap a chip or describe the presentation) to see possible considerations for clinician review.";

export function insufficientMessage(conditionCount: number): string {
  return (
    `Not enough information to suggest any of the ${conditionCount} conditions in the Phase 1 knowledge base. ` +
    "The presentation may fall outside this set; do not force a match. Gather more information and use clinical judgment."
  );
}

type Strength = Suggestion["strength"];
type Flag = Suggestion["flags"][number];

const RED_FLAG_ORDER: readonly string[] = RedFlagType.options;

function strengthFor(score: number): Strength {
  if (score >= SCORING.strongAt) return "strong";
  if (score >= SCORING.moderateAt) return "moderate";
  return "possible";
}

function uniqueFeatures(features: ConditionFeature[]): ConditionFeature[] {
  const seen = new Set<string>();
  return features.filter((f) => (seen.has(f.symptomId) ? false : (seen.add(f.symptomId), true)));
}

function orderFeatures(list: ConditionFeature[]): ConditionFeature[] {
  return list
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.kind === b.f.kind ? 0 : a.f.kind === "core" ? -1 : 1) || b.f.weight - a.f.weight || a.i - b.i)
    .map((x) => x.f);
}

function compareText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function listOrFallback(labels: string[], fallback: string): string {
  return labels.length > 0 ? `Consider ruling out: ${labels.join("; ")}.` : fallback;
}

function gateFlags(cond: Condition, input: ScoringInput): { multiplier: number; flags: Flag[] } {
  let multiplier = 1;
  const flags: Flag[] = [];

  const gateWeeks = cond.durationGate.minWeeks;
  if (input.duration === "unknown") {
    if (gateWeeks > 0)
      flags.push({ type: "duration", message: `Duration not recorded, so no adjustment was made. ${cond.durationGate.note}` });
  } else {
    const band = DURATION_BANDS[input.duration];
    if (band && band.maxWeeks <= gateWeeks) {
      multiplier *= SCORING.durationMultiplier;
      flags.push({
        type: "duration",
        message: `Reported duration (${band.label.toLowerCase()}) is shorter than this pattern usually requires; score reduced. ${cond.durationGate.note}`,
      });
    }
  }

  if (cond.impairmentRequired) {
    if (input.impairment === "no") {
      multiplier *= SCORING.impairmentMultiplier;
      flags.push({
        type: "impairment",
        message: "No clinically significant distress or impairment was indicated, which this pattern usually involves; score reduced.",
      });
    } else if (input.impairment === "unknown") {
      flags.push({
        type: "impairment",
        message: "Distress or functional impairment not yet assessed, so no adjustment was made. Confirm before relying on this suggestion.",
      });
    }
  }

  if (input.substancePossible === "yes") {
    multiplier *= SCORING.substanceMultiplier;
    const labels = cond.ruleOuts.filter((r) => r.type === "substance").map((r) => r.label);
    flags.push({
      type: "substance",
      message: `A substance or medication could account for these symptoms; score reduced. ${listOrFallback(
        labels,
        "Consider substance or medication effects before attributing symptoms to this pattern.",
      )}`,
    });
  }

  if (input.medicalPossible === "yes") {
    multiplier *= SCORING.medicalMultiplier;
    const labels = cond.ruleOuts.filter((r) => r.type === "medical").map((r) => r.label);
    flags.push({
      type: "medical",
      message: `A medical condition could account for these symptoms; score reduced. ${listOrFallback(
        labels,
        "Consider medical causes before attributing symptoms to this pattern.",
      )}`,
    });
  }

  return { multiplier, flags };
}

function scoreOne(
  cond: Condition,
  present: ReadonlySet<string>,
  input: ScoringInput,
  labelOf: (id: string) => string,
): Suggestion | null {
  const features = uniqueFeatures(cond.features);
  const core = features.filter((f) => f.kind === "core");
  const assoc = features.filter((f) => f.kind === "associated");
  const C = core.reduce((n, f) => n + f.weight, 0);
  const A = assoc.reduce((n, f) => n + f.weight, 0);
  const coreHits = core.filter((f) => present.has(f.symptomId));
  if (C === 0 || coreHits.length === 0) return null;

  const mc = coreHits.reduce((n, f) => n + f.weight, 0);
  const assocHits = assoc.filter((f) => present.has(f.symptomId));
  const ma = assocHits.reduce((n, f) => n + f.weight, 0);
  const base = A > 0 ? 100 * (SCORING.coreShare * (mc / C) + SCORING.associatedShare * (ma / A)) : 100 * (mc / C);

  const { multiplier, flags } = gateFlags(cond, input);
  let score = Math.min(100, Math.max(0, Math.round(base * multiplier)));

  let strength = strengthFor(score);
  if (coreHits.length < cond.minCore) {
    strength = "possible";
    const verb = coreHits.length === 1 ? "is" : "are";
    flags.unshift({
      type: "partial-core",
      message: `Only ${coreHits.length} of the ${core.length} key features ${verb} present (at least ${cond.minCore} expected); gather more information.`,
    });
  } else if (strength === "strong" && A > 0 && ma / A < SCORING.breadthShare) {
    score = SCORING.strongAt - 1;
    strength = "moderate";
    flags.push({
      type: "breadth",
      message: `Few supporting features are documented yet (${assocHits.length} of ${assoc.length} associated features); score reduced to ${score} so the match stays moderate until more of the picture is documented.`,
    });
  }

  const toRef = (f: ConditionFeature): FeatureRef => ({
    symptomId: f.symptomId,
    label: labelOf(f.symptomId),
    kind: f.kind,
    weight: f.weight,
  });
  const ordered = orderFeatures(features);

  return {
    conditionId: cond.id,
    name: cond.name,
    icd10cm: cond.icd10cm.map((c) => ({ code: c.code, label: c.label })),
    icd11: cond.icd11.map((c) => ({ code: c.code, label: c.label })),
    dsmPointer: cond.dsmPointer,
    score,
    strength,
    matched: ordered.filter((f) => present.has(f.symptomId)).map(toRef),
    missing: ordered.filter((f) => !present.has(f.symptomId)).map(toRef),
    flags,
    comorbidityNotes: [],
  };
}

function addComorbidityNotes(shown: Suggestion[], byId: ReadonlyMap<string, Condition>): void {
  const eligible = (s: Suggestion) => s.strength === "strong" || s.strength === "moderate";
  for (const s of shown) {
    if (!eligible(s)) continue;
    const own = byId.get(s.conditionId)?.comorbidities ?? [];
    for (const other of shown) {
      if (other === s || !eligible(other)) continue;
      const theirs = byId.get(other.conditionId)?.comorbidities ?? [];
      const co =
        own.find((c) => c.conditionId === other.conditionId) ?? theirs.find((c) => c.conditionId === s.conditionId);
      if (co) s.comorbidityNotes.push(`${other.name} is also suggested. ${co.note}`);
    }
  }
}

/** Rank possible considerations for clinician review. Pure and deterministic. */
export function scoreConditions(input: ScoringInput, conditions: Condition[], symptoms: Symptom[]): ScoringResult {
  const ids = [...new Set(input.symptomIds)];
  if (ids.length === 0) return { status: "empty", suggestions: [], redFlags: [], message: EMPTY_MESSAGE };

  const lexicon = new Map<string, Symptom>();
  for (const s of symptoms) if (!lexicon.has(s.id)) lexicon.set(s.id, s);
  const labelOf = (id: string) => lexicon.get(id)?.label ?? id;
  const present: ReadonlySet<string> = new Set(ids);

  const redFlags: RedFlagHit[] = [];
  for (const id of ids) {
    const s = lexicon.get(id);
    if (s?.redFlag) redFlags.push({ symptomId: s.id, type: s.redFlag, label: s.label });
  }
  redFlags.sort(
    (a, b) =>
      RED_FLAG_ORDER.indexOf(a.type) - RED_FLAG_ORDER.indexOf(b.type) ||
      compareText(a.label, b.label) ||
      compareText(a.symptomId, b.symptomId),
  );

  const byId = new Map<string, Condition>();
  for (const c of conditions) if (!byId.has(c.id)) byId.set(c.id, c);

  const scored: Suggestion[] = [];
  for (const cond of byId.values()) {
    const s = scoreOne(cond, present, input, labelOf);
    if (s && s.score >= SCORING.minScore) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score || compareText(a.name, b.name) || compareText(a.conditionId, b.conditionId));
  const suggestions = scored.slice(0, SCORING.maxSuggestions);
  addComorbidityNotes(suggestions, byId);

  if (suggestions.length === 0) {
    return { status: "insufficient", suggestions: [], redFlags, message: insufficientMessage(byId.size) };
  }
  return { status: "ok", suggestions, redFlags };
}
