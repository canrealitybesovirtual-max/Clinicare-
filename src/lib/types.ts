/** Shared runtime types (contracts between scoring, UI and tests). */
import type { RedFlagType } from "./schemas";

export type DurationBand = "unknown" | "lt2w" | "2to4w" | "1to6m" | "gte6m";
export type TriState = "yes" | "no" | "unknown";
export type Onset = "unknown" | "sudden" | "gradual" | "after-event";

/** Duration bands in weeks [min, max). A condition's gate is "below threshold" when max <= minWeeks. */
export const DURATION_BANDS: Record<Exclude<DurationBand, "unknown">, { label: string; minWeeks: number; maxWeeks: number }> = {
  lt2w: { label: "Under 2 weeks", minWeeks: 0, maxWeeks: 2 },
  "2to4w": { label: "2 to 4 weeks", minWeeks: 2, maxWeeks: 4 },
  "1to6m": { label: "1 to 6 months", minWeeks: 4, maxWeeks: 26 },
  gte6m: { label: "6 months or longer", minWeeks: 26, maxWeeks: Number.POSITIVE_INFINITY },
};

export interface ScoringInput {
  symptomIds: string[]; // de-duplicated lexicon ids (from chips + matched text)
  duration: DurationBand;
  impairment: TriState;
  substancePossible: TriState; // substance/medication could explain symptoms
  medicalPossible: TriState; // medical condition could explain symptoms
}

export type SuggestionFlagType =
  | "duration"
  | "impairment"
  | "substance"
  | "medical"
  | "partial-core"
  | "breadth"
  | "required" // a feature the pattern cannot do without is not documented
  | "red-flag"; // a red flag in the same input changes how to read this suggestion

export interface FeatureRef {
  symptomId: string;
  label: string;
  kind: "core" | "associated";
  weight: number;
}

export interface Suggestion {
  conditionId: string;
  name: string;
  icd10cm: { code: string; label: string }[];
  icd11: { code: string; label: string }[];
  dsmPointer: string;
  score: number; // 0-100, deterministic
  strength: "strong" | "moderate" | "possible";
  matched: FeatureRef[];
  missing: FeatureRef[]; // core first, then associated, by weight desc
  flags: { type: SuggestionFlagType; message: string }[];
  comorbidityNotes: string[]; // e.g. panic + agoraphobia both suggested
}

export interface RedFlagHit {
  symptomId: string;
  type: RedFlagType;
  label: string;
}

export interface ScoringResult {
  status: "empty" | "insufficient" | "ok";
  suggestions: Suggestion[]; // 0-7, sorted by score desc then name
  redFlags: RedFlagHit[];
  message?: string; // shown for "empty" / "insufficient"
}

export type PhiType =
  | "NAME"
  | "ADDRESS"
  | "ZIP"
  | "DATE"
  | "AGE_OVER_89"
  | "PHONE"
  | "FAX"
  | "EMAIL"
  | "SSN"
  | "MRN"
  | "HEALTH_PLAN_ID"
  | "ACCOUNT"
  | "LICENSE"
  | "VEHICLE"
  | "DEVICE"
  | "URL"
  | "IP"
  | "BIOMETRIC"
  | "OTHER_ID";

export interface PhiFinding {
  type: PhiType;
  start: number; // index in ORIGINAL text
  end: number;
}

export interface ScrubResult {
  clean: string; // each finding replaced by `[${type}]`
  findings: PhiFinding[];
}

export interface MeasureScore {
  total: number; // sum of answered items
  answered: number;
  complete: boolean;
  band: { label: string; clinicianNote: string } | null; // null until complete
  riskFlags: { itemId: string; message: string }[];
}
