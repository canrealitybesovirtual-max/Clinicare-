/**
 * Measure scoring (spec section 3, screen 3; section 9).
 * Pure: no I/O, no storage. Answers live only in the caller's memory-only session state.
 *
 * - answers[i] is the chosen option value for measure.items[i]; null/undefined = not answered yet.
 * - Every non-null answer must be one of measure.options[].value, otherwise scoreMeasure throws.
 * - total = sum of answered items; band is reported only once every item is answered.
 * - Risk flags are raised as soon as a risk item meets its threshold, even on an incomplete form.
 *   A flag is a prompt for the clinician to follow up; the app never decides risk (G9).
 * - The functional-difficulty question is not scored and is not part of answers[].
 */
import type { Measure } from "./schemas";
import type { MeasureScore } from "./types";

export type MeasureBand = Measure["scoring"]["bands"][number];
export type MeasureAnswer = number | null | undefined;

/** The band whose [min, max] range contains total, or null when total is outside every band. */
export function bandFor(measure: Measure, total: number): MeasureBand | null {
  return measure.scoring.bands.find((b) => total >= b.min && total <= b.max) ?? null;
}

/** A fresh, unanswered answer array for a measure (one null per item). */
export function emptyAnswers(measure: Measure): (number | null)[] {
  return measure.items.map(() => null);
}

export function scoreMeasure(measure: Measure, answers: readonly MeasureAnswer[]): MeasureScore {
  if (answers.length > measure.items.length) {
    throw new RangeError(`${measure.shortName}: ${answers.length} answers for ${measure.items.length} items`);
  }
  const allowed = new Set(measure.options.map((o) => o.value));
  let total = 0;
  let answered = 0;
  measure.items.forEach((item, i) => {
    const v = answers[i];
    if (v === null || v === undefined) return;
    if (typeof v !== "number" || !Number.isInteger(v) || !allowed.has(v)) {
      throw new RangeError(`${measure.shortName} item ${item.id}: invalid answer ${String(v)}`);
    }
    total += v;
    answered += 1;
  });

  const complete = answered === measure.items.length;
  const band = complete ? bandFor(measure, total) : null;

  const riskFlags: MeasureScore["riskFlags"] = [];
  for (const r of measure.riskItems) {
    const idx = measure.items.findIndex((it) => it.id === r.itemId);
    const v = idx >= 0 ? answers[idx] : null;
    if (typeof v === "number" && v >= r.threshold) riskFlags.push({ itemId: r.itemId, message: r.message });
  }

  return {
    total,
    answered,
    complete,
    band: band ? { label: band.label, clinicianNote: band.clinicianNote } : null,
    riskFlags,
  };
}
