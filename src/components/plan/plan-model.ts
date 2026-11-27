/**
 * Treatment Plan Builder model (spec screen 4). Pure TypeScript: no React, no I/O, isomorphic.
 *
 * - Wording comes from the ORIGINAL plan library (content/plans, G2). Nothing is preselected: every problem,
 *   definition, goal, objective, intervention and measure needs a clinician click to enter the plan (G3).
 * - The draft lives only in memory (src/state/session.tsx, G5). Every text in it has already passed the PHI
 *   scrubber (use-scrubbed-field); `toPlanExport` scrubs custom and edited wording once more before export.
 * - No identifier fields exist anywhere in the draft or the export.
 * - Optional formulation step: the clinician taps curated formulation targets (factor ids of the transdiagnostic
 *   process map, never typed text). Objectives carry the targets they work on, and the review flags gaps both ways.
 * - Cross-cutting modules (content/plans/modules) add more problems to any library; their items enter the plan only
 *   when checked, like library items. A substance-use module tags every item it adds (G6).
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import {
  CARE_STEP_LABELS,
  planTextIsSud,
  planTextOf,
  type CareStep,
  type PlanLibrary,
  type PlanModule,
  type PlanProblem,
  type ZCode,
} from "@/lib/schemas-phase2";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
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

/** A curated formulation target (factor of the transdiagnostic process map). */
export interface FormulationTargetOption {
  id: string;
  /** Clinician-facing name. */
  label: string;
  /** Plain words safe to read out with the client (no diagnosis name, no code). */
  plainLabel: string;
  kind: "maintaining" | "strength" | "context";
}

export const FACTOR_KIND_LABELS: Record<FormulationTargetOption["kind"], string> = {
  maintaining: "Keeps difficulties going",
  context: "Life circumstances",
  strength: "Strengths and supports",
};

/* ------------------------------------------------------------------ draft */

export interface PlanTextItem {
  id: string;
  /** Current wording (already PHI-scrubbed). */
  text: string;
  /** The library's original wording; absent for items the clinician added. */
  libraryText?: string;
  selected: boolean;
  /** G6: the library tags this item as recording substance use (42 CFR Part 2 notice on export). */
  sud?: boolean;
}

export interface PlanObjectiveDraft extends PlanTextItem {
  /** Interventions the library links to this objective (suggestions, not selections). */
  suggestedInterventionIds: string[];
  /** Interventions the clinician chose (suggested or added from the library). */
  interventionIds: string[];
  /** Formulation targets this objective works on (library tags, adjustable by the clinician). */
  targets: string[];
  /** Usual stepped-care level of the work (library tag; describes the work, never decides the client's care). */
  step?: CareStep;
}

/** Curated links that come with a library or module problem. */
export interface PlanProblemLinks {
  formulationIds: string[];
  practiceIds: string[];
  handoutIds: string[];
  linkOuts: { title: string; publisher: string; url: string }[];
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
  /** Set when the problem came from a cross-cutting module. */
  moduleId?: string;
  /** Reference ICD-10-CM Z codes for psychosocial problems (never a diagnosis). */
  zCodes: ZCode[];
  links: PlanProblemLinks;
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
  { id: "formulation", label: "Formulation" },
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
  /** Formulation targets the clinician tapped (curated ids only; optional step). */
  formulationTargets: string[];
  /** Cross-cutting modules added to this plan, in the order added. */
  moduleIds: string[];
}

export type ItemList = "definitions" | "goals" | "objectives";

/* ------------------------------------------------------------------ construction */

const item = (id: string, text: string, sud = false): PlanTextItem => ({
  id,
  text,
  libraryText: text,
  selected: false,
  ...(sud ? { sud: true } : {}),
});

const noLinks = (): PlanProblemLinks => ({ formulationIds: [], practiceIds: [], handoutIds: [], linkOuts: [] });

/** Draft form of a library or module problem. `sud` tags every item (a substance-use module, G6). */
function problemDraft(p: PlanProblem, known: ReadonlySet<string>, opts: { moduleId?: string; sud?: boolean } = {}): PlanProblemDraft {
  const all = opts.sud === true;
  return {
    id: p.id,
    label: item(`${p.id}-label`, p.label, all),
    definitions: p.definitions.map((d, i) => item(`${p.id}-def-${i + 1}`, planTextOf(d), all || planTextIsSud(d))),
    goals: p.longTermGoals.map((g, i) => item(`${p.id}-goal-${i + 1}`, planTextOf(g), all || planTextIsSud(g))),
    objectives: p.shortTermObjectives.map((o) => ({
      ...item(`${p.id}-obj-${o.id}`, o.text, all || o.sud),
      suggestedInterventionIds: [...o.interventionIds],
      interventionIds: [],
      targets: [...(o.targets ?? [])],
      ...(o.step ? { step: o.step } : {}),
    })),
    measureIds: p.measureIds.filter((m) => known.has(m)),
    ...(opts.moduleId ? { moduleId: opts.moduleId } : {}),
    zCodes: p.zCodes ? [...p.zCodes] : [],
    links: {
      formulationIds: p.formulationIds ?? [],
      practiceIds: p.practiceIds ?? [],
      handoutIds: p.handoutIds ?? [],
      linkOuts: p.linkOuts ?? [],
    },
  };
}

/** A fresh draft for one plan library. Nothing is selected (G3: a clinician click adds each item). */
export function createDraft(option: Pick<PlanLibraryOption, "conditionId" | "library">, measures: readonly MeasureOption[]): PlanDraft {
  const known = new Set(measures.map((m) => m.id));
  return {
    conditionId: option.conditionId,
    problems: option.library.problems.map((p) => problemDraft(p, known)),
    measures: Object.fromEntries(measures.map((m) => [m.id, { included: false, schedule: "every-2-weeks" as const }])),
    reviewInterval: "8-weeks",
    step: "focus",
    nextCustomId: 1,
    formulationTargets: [],
    moduleIds: [],
  };
}

/** True when a module can be added to the plan library of this condition. */
export const moduleApplies = (m: Pick<PlanModule, "appliesTo">, conditionId: string) => m.appliesTo === "any" || m.appliesTo.includes(conditionId);

/**
 * Add a module's problems to the draft, unselected (G3). Adding the same module twice, or a module that does not
 * apply to this library, changes nothing.
 */
export function addModule(d: PlanDraft, module: PlanModule, measures: readonly MeasureOption[]): PlanDraft {
  if (d.moduleIds.includes(module.id) || !moduleApplies(module, d.conditionId)) return d;
  const known = new Set(measures.map((m) => m.id));
  const have = new Set(d.problems.map((p) => p.id));
  const added = module.problems.filter((p) => !have.has(p.id)).map((p) => problemDraft(p, known, { moduleId: module.id, sud: module.sud }));
  return { ...d, moduleIds: [...d.moduleIds, module.id], problems: [...d.problems, ...added] };
}

/** True when anything from this module is in the plan (so removing it would discard the clinician's choices). */
export function moduleHasSelections(d: PlanDraft, moduleId: string): boolean {
  return d.problems.some(
    (p) =>
      p.moduleId === moduleId &&
      (p.label.selected || [...p.definitions, ...p.goals, ...p.objectives].some((i) => i.selected || isEdited(i) || isCustom(i))),
  );
}

/** Remove a module and its problems. Refused (draft unchanged) while anything from it is selected or edited. */
export function removeModule(d: PlanDraft, moduleId: string): PlanDraft {
  if (!d.moduleIds.includes(moduleId) || moduleHasSelections(d, moduleId)) return d;
  return { ...d, moduleIds: d.moduleIds.filter((id) => id !== moduleId), problems: d.problems.filter((p) => p.moduleId !== moduleId) };
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

const toggleIn = (list: readonly string[], id: string, on: boolean): string[] =>
  on ? (list.includes(id) ? [...list] : [...list, id]) : list.filter((x) => x !== id);

/** Tap a formulation target on or off (curated ids only; the caller passes ids from the process map). */
export function toggleFormulationTarget(d: PlanDraft, targetId: string, selected: boolean): PlanDraft {
  return { ...d, formulationTargets: toggleIn(d.formulationTargets, targetId, selected) };
}

/** Link an objective to a formulation target, or unlink it. */
export function toggleObjectiveTarget(d: PlanDraft, problemId: string, objectiveId: string, targetId: string, on: boolean): PlanDraft {
  return mapProblem(d, problemId, (p) => ({
    ...p,
    objectives: mapItems(p.objectives, objectiveId, (o) => ({ ...o, targets: toggleIn(o.targets, targetId, on) })),
  }));
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
        ? { ...p, objectives: [...p.objectives, { ...base, suggestedInterventionIds: [], interventionIds: [], targets: [] }] }
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
    zCodes: [],
    links: noLinks(),
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
  formulation: number;
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
    formulation: d.formulationTargets.length,
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

/**
 * G6: the plan records substance use when the library is a substance-use library, a selected library item is tagged
 * sud, or any selected wording (library, edited or the clinician's own) mentions alcohol or other substances.
 * Then the builder shows the Part 2 Hub prompt and every export carries the 42 CFR Part 2 notice.
 */
export function planRecordsSubstanceUse(d: PlanDraft, option: Pick<PlanLibraryOption, "sud">): boolean {
  if (option.sud) return true;
  for (const p of selectedProblems(d)) {
    const items: PlanTextItem[] = [p.label, ...p.definitions, ...p.goals, ...p.objectives].filter((i) => i.selected || i === p.label);
    for (const i of items) {
      if (i.sud) return true;
      if (mentionsSubstanceUse(planText(i))) return true;
    }
  }
  return false;
}

/** Selected problems and their selected, non-empty objectives, numbered as in the review and the exports. */
function exportedObjectives(d: PlanDraft) {
  return selectedProblems(d).flatMap((p, pi) =>
    p.objectives.filter((o) => o.selected && planText(o)).map((o, oi) => ({ problem: p, objective: o, ref: `Problem ${pi + 1}, objective ${oi + 1}` })),
  );
}

export interface FormulationCoverage {
  /** Each tapped formulation target, in the order tapped, with the objectives that work on it. */
  targets: { id: string; refs: string[] }[];
  /** Chosen objectives that work on none of the tapped targets. */
  unlinked: { ref: string; text: string; problemId: string; objectiveId: string }[];
}

/**
 * For clinician review: which tapped formulation targets the chosen objectives work on, and which objectives are not
 * linked to any of them. Empty when the optional formulation step was skipped. Never a judgment about the client.
 */
export function formulationCoverage(d: PlanDraft): FormulationCoverage {
  if (!d.formulationTargets.length) return { targets: [], unlinked: [] };
  const chosen = new Set(d.formulationTargets);
  const rows = exportedObjectives(d);
  return {
    targets: d.formulationTargets.map((id) => ({ id, refs: rows.filter((r) => r.objective.targets.includes(id)).map((r) => r.ref) })),
    unlinked: rows
      .filter((r) => !r.objective.targets.some((t) => chosen.has(t)))
      .map((r) => ({ ref: r.ref, text: planText(r.objective), problemId: r.problem.id, objectiveId: r.objective.id })),
  };
}

/** Modules that contribute at least one selected problem to the plan, in the order they were added. */
export function modulesInPlan<M extends Pick<PlanModule, "id">>(d: PlanDraft, modules: readonly M[]): M[] {
  const used = new Set(selectedProblems(d).flatMap((p) => (p.moduleId ? [p.moduleId] : [])));
  return d.moduleIds.flatMap((id) => modules.filter((m) => m.id === id && used.has(id)));
}

const zCodeText = (z: ZCode) => `${z.code} (${z.label})`;

/** The plain export model (selected items only) for src/lib/plan-export.ts. */
export function toPlanExport(
  d: PlanDraft,
  ctx: {
    option: PlanLibraryOption;
    interventions: ReadonlyMap<string, Pick<InterventionOption, "name">>;
    measures: readonly MeasureOption[];
    /** Cross-cutting modules the draft may use (only those with a selected problem reach the export). */
    modules?: readonly PlanModule[];
    /** Curated formulation targets (labels for the formulation summary). */
    targets?: readonly FormulationTargetOption[];
  },
): PlanExport {
  const { option } = ctx;
  const used = modulesInPlan(d, ctx.modules ?? []);
  const coverage = formulationCoverage(d);
  const targetMap = new Map((ctx.targets ?? []).map((t) => [t.id, t] as const));
  const sources = [...option.library.sources, ...used.flatMap((m) => m.sources)].filter(
    (s, i, all) => all.findIndex((x) => x.url === s.url) === i,
  );
  return {
    focus: { label: option.label, icd10cm: option.icd10cm, icd11: option.icd11 },
    sud: planRecordsSubstanceUse(d, option),
    collaborativeNote: option.library.collaborativeNote,
    moduleNotes: used.map((m) => ({ title: m.title, note: m.collaborativeNote })),
    formulation: coverage.targets.length
      ? {
          factors: coverage.targets.flatMap((t) => {
            const f = targetMap.get(t.id);
            return f ? [{ label: f.label, kind: FACTOR_KIND_LABELS[f.kind], refs: t.refs }] : [];
          }),
          unlinked: coverage.unlinked.map((u) => u.ref),
        }
      : undefined,
    problems: selectedProblems(d).map((p) => ({
      label: exportText(p.label) || "Problem (wording to be added with the client)",
      zCodes: p.zCodes.map(zCodeText),
      definitions: p.definitions.filter((i) => i.selected).map(exportText).filter(Boolean),
      goals: p.goals.filter((i) => i.selected).map(exportText).filter(Boolean),
      objectives: p.objectives
        .filter((o) => o.selected && planText(o))
        .map((o) => ({
          text: exportText(o),
          interventions: o.interventionIds.map((id) => ctx.interventions.get(id)?.name).filter((n): n is string => !!n),
          ...(o.step ? { careLevel: CARE_STEP_LABELS[o.step] } : {}),
        })),
    })),
    measures: ctx.measures
      .filter((m) => d.measures[m.id]?.included)
      .map((m) => ({ name: m.name, shortName: m.shortName, schedule: scheduleLabel(d.measures[m.id]!.schedule) })),
    reviewInterval: reviewLabel(d.reviewInterval),
    sources: sources.map((s) => ({ title: s.title, publisher: s.publisher, year: s.year, url: s.url })),
    // Review status of the combination: pending while the library or any module in it is pending.
    reviewedBy: [option.library, ...used].some((x) => x.reviewedBy === "PENDING") ? "PENDING" : option.library.reviewedBy,
    // The oldest verification date among the library and the modules in the plan.
    lastVerified: [option.library, ...used].map((x) => x.lastVerified).sort()[0]!,
  };
}
