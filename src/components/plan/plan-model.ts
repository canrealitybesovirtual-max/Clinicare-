/**
 * Treatment Plan Builder model (spec screen 4). Pure TypeScript: no React, no I/O, isomorphic.
 *
 * - Wording comes from the ORIGINAL plan library (content/plans, G2). Nothing is preselected: every problem,
 *   definition, goal, objective, intervention and measure needs a clinician click to enter the plan (G3).
 * - The draft lives only in memory (src/state/session.tsx, G5). Every text in it has already passed the PHI
 *   scrubber (use-scrubbed-field); `toPlanExport` scrubs custom and edited wording once more before export.
 * - No identifier fields exist anywhere in the draft or the export.
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import type { PlanLibrary } from "@/lib/schemas-phase2";
import type { PlanExport } from "@/lib/plan-export";

/* ------------------------------------------------------------------ props passed from the server */

/** One plan library plus the display data the builder needs (built in the server page). */
export interface PlanLibraryOption {
  conditionId: string;
  label: string; // condition name (clinician mode only)
  icd10cm: string[]; // reference codes when the condition file has them
  icd11: string[];
  sud: boolean; // 42 CFR Part 2 notice + Hub prompt (G6)
  library: PlanLibrary;
}

export interface InterventionOption {
  id: string;
  name: string;
  modality: string;
  minutes: { min: number; max: number };
  trainingRequired?: string;
  conditions: string[];
}

export interface MeasureOption {
  id: string;
  shortName: string;
  name: string;
}

/* ------------------------------------------------------------------ draft */

export interface PlanTextItem {
  id: string;
  /** Current wording (already PHI-scrubbed). */
  text: string;
  /** The library's original wording; absent for items the clinician added. */
  libraryText?: string;
  selected: boolean;
}

export interface PlanObjectiveDraft extends PlanTextItem {
  /** Interventions the library links to this objective (suggestions, not selections). */
  suggestedInterventionIds: string[];
  /** Interventions the clinician chose (suggested or added from the library). */
  interventionIds: string[];
}

export interface PlanProblemDraft {
  id: string;
  /** The problem statement; `selected` says whether the problem is part of this plan. */
  label: PlanTextItem;
  definitions: PlanTextItem[];
  goals: PlanTextItem[];
  objectives: PlanObjectiveDraft[];
  /** Measures the library suggests for tracking this problem. */
  measureIds: string[];
}

export const MEASURE_SCHEDULES = [
  { value: "every-session", label: "Every session" },
  { value: "every-2-weeks", label: "Every 2 weeks" },
  { value: "every-4-weeks", label: "Every 4 weeks" },
  { value: "baseline-and-review", label: "Baseline and each plan review" },
] as const;
export type MeasureScheduleId = (typeof MEASURE_SCHEDULES)[number]["value"];

export const REVIEW_INTERVALS = [
  { value: "4-weeks", label: "Every 4 weeks" },
  { value: "8-weeks", label: "Every 8 weeks" },
  { value: "12-weeks", label: "Every 12 weeks" },
] as const;
export type ReviewIntervalId = (typeof REVIEW_INTERVALS)[number]["value"];

export interface PlanMeasureDraft {
  included: boolean;
  schedule: MeasureScheduleId;
}

export const PLAN_STEPS = [
  { id: "focus", label: "Focus" },
  { id: "problems", label: "Problems" },
  { id: "definitions", label: "Behavioral definitions" },
  { id: "goals", label: "Long-term goals" },
  { id: "objectives", label: "Objectives" },
  { id: "interventions", label: "Interventions" },
  { id: "measures", label: "Measures" },
  { id: "review", label: "Review and export" },
] as const;
export type PlanStepId = (typeof PLAN_STEPS)[number]["id"];

export interface PlanDraft {
  conditionId: string;
  problems: PlanProblemDraft[];
  measures: Record<string, PlanMeasureDraft>;
  reviewInterval: ReviewIntervalId;
  step: PlanStepId;
  /** Counter for ids of clinician-added items (never derived from typed text). */
  nextCustomId: number;
}

export type ItemList = "definitions" | "goals" | "objectives";

/* ------------------------------------------------------------------ construction */

const item = (id: string, text: string): PlanTextItem => ({ id, text, libraryText: text, selected: false });

/** A fresh draft for one plan library. Nothing is selected (G3: a clinician click adds each item). */
export function createDraft(option: Pick<PlanLibraryOption, "conditionId" | "library">, measures: readonly MeasureOption[]): PlanDraft {
  const { library } = option;
  const known = new Set(measures.map((m) => m.id));
  return {
    conditionId: option.conditionId,
    problems: library.problems.map((p) => ({
      id: p.id,
      label: item(`${p.id}-label`, p.label),
      definitions: p.definitions.map((d, i) => item(`${p.id}-def-${i + 1}`, d)),
      goals: p.longTermGoals.map((g, i) => item(`${p.id}-goal-${i + 1}`, g)),
      objectives: p.shortTermObjectives.map((o) => ({
        ...item(`${p.id}-obj-${o.id}`, o.text),
        suggestedInterventionIds: [...o.interventionIds],
        interventionIds: [],
      })),
      measureIds: p.measureIds.filter((m) => known.has(m)),
    })),
    measures: Object.fromEntries(measures.map((m) => [m.id, { included: false, schedule: "every-2-weeks" as const }])),
    reviewInterval: "8-weeks",
    step: "focus",
    nextCustomId: 1,
  };
}

/* ------------------------------------------------------------------ immutable updates */

const mapProblem = (d: PlanDraft, problemId: string, fn: (p: PlanProblemDraft) => PlanProblemDraft): PlanDraft => ({
  ...d,
  problems: d.problems.map((p) => (p.id === problemId ? fn(p) : p)),
});

function mapItems<T extends PlanTextItem>(items: T[], itemId: string, fn: (i: T) => T): T[] {
  return items.map((i) => (i.id === itemId ? fn(i) : i));
}

export function setStep(d: PlanDraft, step: PlanStepId): PlanDraft {
  return { ...d, step };
}

export function toggleProblem(d: PlanDraft, problemId: string, selected: boolean): PlanDraft {
  return mapProblem(d, problemId, (p) => ({ ...p, label: { ...p.label, selected } }));
}

export function setProblemLabel(d: PlanDraft, problemId: string, text: string): PlanDraft {
  return mapProblem(d, problemId, (p) => ({ ...p, label: { ...p.label, text } }));
}

export function toggleItem(d: PlanDraft, problemId: string, list: ItemList, itemId: string, selected: boolean): PlanDraft {
  return mapProblem(d, problemId, (p) => {
    if (list === "objectives") return { ...p, objectives: mapItems(p.objectives, itemId, (o) => ({ ...o, selected })) };
    return { ...p, [list]: mapItems(p[list], itemId, (i) => ({ ...i, selected })) };
  });
}

export function setItemText(d: PlanDraft, problemId: string, list: ItemList, itemId: string, text: string): PlanDraft {
  return mapProblem(d, problemId, (p) => {
    if (list === "objectives") return { ...p, objectives: mapItems(p.objectives, itemId, (o) => ({ ...o, text })) };
    return { ...p, [list]: mapItems(p[list], itemId, (i) => ({ ...i, text })) };
  });
}

/** Add an empty, selected item the clinician writes (with the client, in their words). */
export function addCustomItem(d: PlanDraft, problemId: string, list: ItemList): { draft: PlanDraft; id: string } {
  const id = `custom-${d.nextCustomId}`;
  const next = { ...d, nextCustomId: d.nextCustomId + 1 };
  const base: PlanTextItem = { id, text: "", selected: true };
  return {
    id,
    draft: mapProblem(next, problemId, (p) =>
      list === "objectives"
        ? { ...p, objectives: [...p.objectives, { ...base, suggestedInterventionIds: [], interventionIds: [] }] }
        : { ...p, [list]: [...p[list], base] },
    ),
  };
}

/** Remove a clinician-added item (library items are deselected instead, so their wording stays available). */
export function removeCustomItem(d: PlanDraft, problemId: string, list: ItemList, itemId: string): PlanDraft {
  return mapProblem(d, problemId, (p) => {
    if (list === "objectives") return { ...p, objectives: p.objectives.filter((o) => o.id !== itemId || o.libraryText !== undefined) };
    return { ...p, [list]: p[list].filter((i) => i.id !== itemId || i.libraryText !== undefined) };
  });
}

/** Add a problem written by the clinician. Its definitions, goals and objectives start empty. */
export function addCustomProblem(d: PlanDraft): { draft: PlanDraft; id: string } {
  const id = `custom-${d.nextCustomId}`;
  const problem: PlanProblemDraft = {
    id,
    label: { id: `${id}-label`, text: "", selected: true },
    definitions: [],
    goals: [],
    objectives: [],
    measureIds: [],
  };
  return { id, draft: { ...d, nextCustomId: d.nextCustomId + 1, problems: [...d.problems, problem] } };
}

export function removeCustomProblem(d: PlanDraft, problemId: string): PlanDraft {
  return { ...d, problems: d.problems.filter((p) => p.id !== problemId || p.label.libraryText !== undefined) };
}

export function toggleIntervention(d: PlanDraft, problemId: string, objectiveId: string, interventionId: string, selected: boolean): PlanDraft {
  return mapProblem(d, problemId, (p) => ({
    ...p,
    objectives: mapItems(p.objectives, objectiveId, (o) => ({
      ...o,
      interventionIds: selected
        ? o.interventionIds.includes(interventionId)
          ? o.interventionIds
          : [...o.interventionIds, interventionId]
        : o.interventionIds.filter((x) => x !== interventionId),
    })),
  }));
}

export function setMeasure(d: PlanDraft, measureId: string, patch: Partial<PlanMeasureDraft>): PlanDraft {
  const prev = d.measures[measureId] ?? { included: false, schedule: "every-2-weeks" as const };
  return { ...d, measures: { ...d.measures, [measureId]: { ...prev, ...patch } } };
}

export function setReviewInterval(d: PlanDraft, reviewInterval: ReviewIntervalId): PlanDraft {
  return { ...d, reviewInterval };
}

/* ------------------------------------------------------------------ queries */

export const selectedProblems = (d: PlanDraft) => d.problems.filter((p) => p.label.selected);

export function isEdited(i: PlanTextItem): boolean {
  return i.libraryText !== undefined && i.text !== i.libraryText;
}

export function isCustom(i: PlanTextItem): boolean {
  return i.libraryText === undefined;
}

/** Text that will appear in the plan: trimmed; empty when nothing usable is left. */
export function planText(i: PlanTextItem): string {
  return i.text.replace(/\s+/g, " ").trim();
}

/** Measures suggested by the selected problems (license-confirmed measures only). */
export function suggestedMeasureIds(d: PlanDraft): Set<string> {
  return new Set(selectedProblems(d).flatMap((p) => p.measureIds));
}

export interface PlanCounts {
  problems: number;
  definitions: number;
  goals: number;
  objectives: number;
  interventions: number;
  measures: number;
}

export function planCounts(d: PlanDraft): PlanCounts {
  const probs = selectedProblems(d);
  const sel = <T extends PlanTextItem>(list: T[]) => list.filter((i) => i.selected && planText(i));
  return {
    problems: probs.length,
    definitions: probs.reduce((n, p) => n + sel(p.definitions).length, 0),
    goals: probs.reduce((n, p) => n + sel(p.goals).length, 0),
    objectives: probs.reduce((n, p) => n + sel(p.objectives).length, 0),
    interventions: probs.reduce((n, p) => n + sel(p.objectives).reduce((m, o) => m + o.interventionIds.length, 0), 0),
    measures: Object.values(d.measures).filter((m) => m.included).length,
  };
}

/* ------------------------------------------------------------------ export */

/** Custom or edited wording is scrubbed again right before export (idempotent on clean text). */
function exportText(i: PlanTextItem): string {
  const t = planText(i);
  return isCustom(i) || isEdited(i) ? scrubPHI(t).clean : t;
}

const scheduleLabel = (id: MeasureScheduleId) => MEASURE_SCHEDULES.find((s) => s.value === id)?.label ?? id;
const reviewLabel = (id: ReviewIntervalId) => REVIEW_INTERVALS.find((s) => s.value === id)?.label ?? id;

/** The plain export model (selected items only) for src/lib/plan-export.ts. */
export function toPlanExport(
  d: PlanDraft,
  ctx: {
    option: PlanLibraryOption;
    interventions: ReadonlyMap<string, Pick<InterventionOption, "name">>;
    measures: readonly MeasureOption[];
  },
): PlanExport {
  const { option } = ctx;
  return {
    focus: { label: option.label, icd10cm: option.icd10cm, icd11: option.icd11 },
    sud: option.sud,
    collaborativeNote: option.library.collaborativeNote,
    problems: selectedProblems(d)
      .map((p) => ({
        label: exportText(p.label) || "Problem (wording to be added with the client)",
        definitions: p.definitions.filter((i) => i.selected).map(exportText).filter(Boolean),
        goals: p.goals.filter((i) => i.selected).map(exportText).filter(Boolean),
        objectives: p.objectives
          .filter((o) => o.selected && planText(o))
          .map((o) => ({
            text: exportText(o),
            interventions: o.interventionIds.map((id) => ctx.interventions.get(id)?.name).filter((n): n is string => !!n),
          })),
      })),
    measures: ctx.measures
      .filter((m) => d.measures[m.id]?.included)
      .map((m) => ({ name: m.name, shortName: m.shortName, schedule: scheduleLabel(d.measures[m.id]!.schedule) })),
    reviewInterval: reviewLabel(d.reviewInterval),
    sources: option.library.sources.map((s) => ({ title: s.title, publisher: s.publisher, year: s.year, url: s.url })),
    reviewedBy: option.library.reviewedBy,
    lastVerified: option.library.lastVerified,
  };
}
