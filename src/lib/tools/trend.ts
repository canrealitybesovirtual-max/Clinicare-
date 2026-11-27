/**
 * Measure trend (tools/trend): GAD-7 / PHQ-9 totals entered by session number. Pure: no React, no I/O, no storage.
 *
 * Only published, cited definitions are built in:
 * - PHQ-9 response (total at least 50% below the baseline) and remission (total below 5), as NCQA's HEDIS
 *   "Depression Remission or Response" measure defines them, starting from an elevated baseline (above 9).
 * - PHQ-9 change of 5 or more points: the minimal clinically important difference for individual change estimated
 *   by Löwe et al. (2004).
 * - GAD-7 change of 4 or more points: the minimal clinically important difference estimated in a 2020 Journal of
 *   Affective Disorders study. No GAD-7 response or remission rule is built in.
 * Markers are prompts for clinician review, never an outcome decision. Points are session numbers, not dates (G5).
 */
import type { Source } from "@/lib/schemas";

export interface TrendPoint {
  session: number;
  total: number;
}

export interface TrendRule {
  id: "response" | "remission" | "change";
  label: string;
  definition: string;
  source: Source;
}

export interface MeasureTrendRules {
  measureId: "phq-9" | "gad-7";
  /** Response: a total at or below this share of the baseline. */
  responseShare?: number;
  /** Remission: a total below this value. */
  remissionBelow?: number;
  /** Response and remission apply only when the baseline is at least this. */
  elevatedFrom?: number;
  /** Change from baseline treated as clinically meaningful (points). */
  meaningfulChange: number;
  rules: TrendRule[];
  /** Caveats printed with the definitions. */
  notes: string[];
}

const NCQA: Source = {
  title: "Depression Remission or Response for Adolescents and Adults (DRR-E), HEDIS measure",
  publisher: "National Committee for Quality Assurance (NCQA)",
  url: "https://www.ncqa.org/hedis/measures/depression-remission-or-response-for-adolescents-and-adults/",
};
const LOWE_2004: Source = {
  title: "Monitoring depression treatment outcomes with the Patient Health Questionnaire-9 (PMID 15550799)",
  publisher: "Medical Care, via PubMed (US National Library of Medicine)",
  url: "https://pubmed.ncbi.nlm.nih.gov/15550799/",
  year: 2004,
};
const GAD7_MCID_2020: Source = {
  title: "Sensitivity to change and minimal clinically important difference of the 7-item Generalized Anxiety Disorder Questionnaire (GAD-7)",
  publisher: "Journal of Affective Disorders",
  url: "https://doi.org/10.1016/j.jad.2020.01.032",
  year: 2020,
};

export const TREND_RULES: Record<MeasureTrendRules["measureId"], MeasureTrendRules> = {
  "phq-9": {
    measureId: "phq-9",
    responseShare: 0.5,
    remissionBelow: 5,
    elevatedFrom: 10,
    meaningfulChange: 5,
    rules: [
      { id: "response", label: "Response", definition: "A total at least 50% lower than the baseline (first) total.", source: NCQA },
      { id: "remission", label: "Remission", definition: "A total below 5.", source: NCQA },
      {
        id: "change",
        label: "Meaningful change",
        definition:
          "A change of 5 or more points from the baseline: the minimal clinically important difference for one person's change (twice the standard error of measurement).",
        source: LOWE_2004,
      },
    ],
    notes: [
      "Response and remission are marked only when the baseline total is 10 or more, the elevated starting point NCQA uses (a total above 9).",
      "NCQA looks for response or remission 4 to 8 months after the elevated total. This chart counts sessions, not months, so it marks every later session that meets the score rule.",
    ],
  },
  "gad-7": {
    measureId: "gad-7",
    meaningfulChange: 4,
    rules: [
      {
        id: "change",
        label: "Meaningful change",
        definition: "A change of 4 or more points from the baseline: the minimal clinically important difference estimated for the GAD-7.",
        source: GAD7_MCID_2020,
      },
    ],
    notes: [
      "The 4-point estimate comes from a sample in a chronic-depression treatment trial; the authors call for confirmation in other groups.",
      "No GAD-7 response or remission rule is built in. Read the trend with the severity bands and your clinical judgment.",
    ],
  },
};

export const TREND_GOVERNANCE = { license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" } as const;
export const MAX_SESSION = 200;

/** Why a point cannot be added, or null when it is valid. */
export function pointError(session: number, total: number, range: { min: number; max: number }): string | null {
  if (!Number.isInteger(session) || session < 1 || session > MAX_SESSION) return `Session # must be a whole number from 1 to ${MAX_SESSION}.`;
  if (!Number.isInteger(total) || total < range.min || total > range.max) return `Total must be a whole number from ${range.min} to ${range.max}.`;
  return null;
}

/** Add a point; a second entry for the same session number replaces the first. Sorted by session. */
export function upsertPoint(points: readonly TrendPoint[], p: TrendPoint): TrendPoint[] {
  return [...points.filter((x) => x.session !== p.session), p].sort((a, b) => a.session - b.session);
}

export function removePoint(points: readonly TrendPoint[], session: number): TrendPoint[] {
  return points.filter((x) => x.session !== session);
}

export interface TrendRow extends TrendPoint {
  band: string | null;
  /** Points from baseline (negative = lower total). Null on the baseline row. */
  change: number | null;
  /** Percent change from baseline, rounded. Null on the baseline row or when the baseline is 0. */
  percentChange: number | null;
  response: boolean;
  remission: boolean;
  /** Lower by at least the meaningful-change threshold. */
  improved: boolean;
  /** Higher by at least the meaningful-change threshold. */
  worsened: boolean;
}

export interface TrendSummary {
  rows: TrendRow[];
  baseline: TrendPoint | null;
  latest: TrendPoint | null;
  /** Response/remission rules exist for this measure and the baseline is elevated enough to apply them. */
  markersApply: boolean;
  firstResponse: number | null;
  firstRemission: number | null;
}

export function analyzeTrend(
  points: readonly TrendPoint[],
  rules: MeasureTrendRules,
  bands: readonly { min: number; max: number; label: string }[],
): TrendSummary {
  const sorted = [...points].sort((a, b) => a.session - b.session);
  const baseline = sorted[0] ?? null;
  const markersApply =
    !!baseline && (rules.responseShare !== undefined || rules.remissionBelow !== undefined) && baseline.total >= (rules.elevatedFrom ?? 0);
  const bandOf = (t: number) => bands.find((b) => t >= b.min && t <= b.max)?.label ?? null;

  const rows: TrendRow[] = sorted.map((p, i) => {
    const later = i > 0 && !!baseline;
    const change = later ? p.total - baseline.total : null;
    return {
      ...p,
      band: bandOf(p.total),
      change,
      percentChange: later && baseline.total > 0 ? Math.round(((p.total - baseline.total) / baseline.total) * 100) : null,
      response: later && markersApply && rules.responseShare !== undefined && p.total <= baseline.total * rules.responseShare,
      remission: later && markersApply && rules.remissionBelow !== undefined && p.total < rules.remissionBelow,
      improved: change !== null && -change >= rules.meaningfulChange,
      worsened: change !== null && change >= rules.meaningfulChange,
    };
  });

  return {
    rows,
    baseline,
    latest: sorted[sorted.length - 1] ?? null,
    markersApply,
    firstResponse: rows.find((r) => r.response)?.session ?? null,
    firstRemission: rows.find((r) => r.remission)?.session ?? null,
  };
}
