/**
 * Cross-cutting treatment-plan modules (content/plans/modules), validated with zod at load time (G10), plus the
 * cross-file checks for every plan library and module (scripts/validate-content.ts and the unit tests).
 *
 * A module adds original-wording problems to any plan library (appliesTo "any") or to the listed condition
 * libraries: safety-focused objectives, sleep, engagement, maintenance, coordination, psychosocial (Z code)
 * problems and more. Import from SERVER components and pass the builder only the slices it needs.
 * Nothing here scores, ranks or decides anything about a person (G3, G9).
 */
import { parseAll } from "./content";
import { mentionsSubstanceUse } from "./substance-terms";
import { PlanModuleSchema, planTextIsSud, planTextOf, type PlanLibrary, type PlanModule, type PlanProblem } from "./schemas-phase2";
import careCoordination from "@content/plans/modules/care-coordination-and-social-needs.json";
import chronicPain from "@content/plans/modules/chronic-pain-with-mood-or-anxiety.json";
import engagement from "@content/plans/modules/engagement-and-attendance.json";
import maintenance from "@content/plans/modules/maintenance-and-ending.json";
import perfectionism from "@content/plans/modules/perfectionism-self-esteem-procrastination.json";
import perinatal from "@content/plans/modules/perinatal-adaptations.json";
import progressReview from "@content/plans/modules/progress-review-and-stepping-up.json";
import psychosocial from "@content/plans/modules/psychosocial-problems.json";
import sleep from "@content/plans/modules/sleep-disturbance.json";
import substanceCoping from "@content/plans/modules/substance-use-as-coping.json";
import suicideSafety from "@content/plans/modules/suicide-and-self-harm-safety.json";
import workStress from "@content/plans/modules/work-stress-and-return-to-work.json";

/** Exact 42 CFR Part 2 notice (owner decision 2026-11-27, CLAUDE.md). */
const PART2_NOTICE = "42 CFR Part 2 prohibits unauthorized use or disclosure of these records.";

/**
 * Every module file, in file-name order. content/plans/modules is not a generated folder module (its folder name is
 * not one level under content/), so the list is kept here; tests/unit/plan-modules.test.ts and validate-content
 * fail when a file in the folder is missing from it.
 */
const MODULES_RAW: readonly unknown[] = [
  careCoordination,
  chronicPain,
  engagement,
  maintenance,
  perfectionism,
  perinatal,
  progressReview,
  psychosocial,
  sleep,
  substanceCoping,
  suicideSafety,
  workStress,
];

export const planModules: PlanModule[] = parseAll(MODULES_RAW, PlanModuleSchema, "plan module");

const moduleMap = new Map(planModules.map((m) => [m.id, m] as const));
export const getPlanModule = (id: string): PlanModule | undefined => moduleMap.get(id);

/** Modules that can be added to the plan library of this condition, general modules first, then A to Z. */
export function modulesFor(conditionId: string, list: readonly PlanModule[] = planModules): PlanModule[] {
  return list
    .filter((m) => m.appliesTo === "any" || m.appliesTo.includes(conditionId))
    .sort((a, b) => Number(a.appliesTo === "any") - Number(b.appliesTo === "any") || a.title.localeCompare(b.title));
}

/** Ids that plan content may point at. A folder that does not exist yet is passed as undefined and not checked. */
export interface PlanContentRefs {
  /** Library interventions and the conditions each lists. */
  interventions: ReadonlyMap<string, { conditions: readonly string[] }>;
  /** License-confirmed built-in measures (G7). */
  measures: ReadonlySet<string>;
  conditions: ReadonlySet<string>;
  handouts: ReadonlySet<string>;
  /** Substance-use handouts (G6): only substance-use libraries and modules may link them. */
  sudHandouts: ReadonlySet<string>;
  /** Curated factor ids of the transdiagnostic process map (formulation targets). */
  formulationTargets: ReadonlySet<string>;
  formulations: ReadonlySet<string>;
  practice?: ReadonlySet<string>;
}

type Owner = { where: string; sud: boolean; module: boolean };

function problemChecks(prob: PlanProblem, owner: Owner, refs: PlanContentRefs, out: string[]): void {
  const at = `${owner.where} ${prob.id}`;
  const objectiveIds = new Set<string>();
  for (const o of prob.shortTermObjectives) {
    if (objectiveIds.has(o.id)) out.push(`${at}: duplicate objective id ${o.id}`);
    objectiveIds.add(o.id);
    for (const t of o.targets ?? []) if (!refs.formulationTargets.has(t)) out.push(`${at} ${o.id}: unknown formulation target ${t}`);
    // Library-wide existence and condition matching are checked in library.ts / validate-content.ts; module
    // objectives may link any intervention, so only existence is checked for them here.
    if (owner.module) for (const i of o.interventionIds) if (!refs.interventions.has(i)) out.push(`${at} ${o.id}: unknown intervention ${i}`);
  }
  if (owner.module) for (const m of prob.measureIds) if (!refs.measures.has(m)) out.push(`${at}: measure ${m} is not a license-confirmed built-in measure (G7)`);
  for (const f of prob.formulationIds ?? []) if (!refs.formulations.has(f)) out.push(`${at}: unknown formulation ${f}`);
  for (const h of prob.handoutIds ?? []) {
    if (!refs.handouts.has(h)) out.push(`${at}: unknown handout ${h}`);
    else if (refs.sudHandouts.has(h) && !owner.sud) out.push(`${at}: links substance-use handout ${h} but is not a substance-use library or module (G6)`);
  }
  if (refs.practice) for (const g of prob.practiceIds ?? []) if (!refs.practice.has(g)) out.push(`${at}: unknown practice guide ${g}`);
  // G6: in a module that is not a substance-use module, wording that mentions substance use must be tagged sud,
  // so that selecting it always brings the Part 2 notice.
  if (owner.module && !owner.sud) {
    if (mentionsSubstanceUse(prob.label)) out.push(`${at}: problem label mentions substance use; move it to a substance-use module (G6)`);
    for (const t of [...prob.definitions, ...prob.longTermGoals])
      if (mentionsSubstanceUse(planTextOf(t)) && !planTextIsSud(t)) out.push(`${at}: untagged substance-use wording "${planTextOf(t).slice(0, 50)}" (G6)`);
    for (const o of prob.shortTermObjectives) if (mentionsSubstanceUse(o.text) && !o.sud) out.push(`${at} ${o.id}: untagged substance-use wording (G6)`);
  }
}

/**
 * Cross-file checks for plan libraries and modules: formulation targets, links to formulations, handouts and practice
 * guides, module interventions and measures, Part 2 tagging, and problem ids that stay unique when a module is added
 * to any library (the builder keys draft items by problem id). Pure; returns error strings.
 */
export function planContentProblems(libraries: readonly PlanLibrary[], modules: readonly PlanModule[], refs: PlanContentRefs): string[] {
  const out: string[] = [];
  const problemOwner = new Map<string, string>();
  const claim = (id: string, where: string) => {
    const prev = problemOwner.get(id);
    if (prev) out.push(`${where}: problem id ${id} is also used by ${prev} (problem ids must be unique across plans and modules)`);
    else problemOwner.set(id, where);
  };
  for (const lib of libraries) {
    const where = `plans/${lib.conditionId}`;
    for (const prob of lib.problems) {
      claim(prob.id, where);
      problemChecks(prob, { where, sud: lib.sud, module: false }, refs, out);
    }
  }
  const moduleIds = new Set<string>();
  for (const m of modules) {
    const where = `plans/modules/${m.id}`;
    if (moduleIds.has(m.id)) out.push(`${where}: duplicate module id`);
    moduleIds.add(m.id);
    if (m.appliesTo !== "any") for (const c of m.appliesTo) if (!refs.conditions.has(c)) out.push(`${where}: appliesTo unknown condition ${c}`);
    if (m.sud && !m.collaborativeNote.includes(PART2_NOTICE)) out.push(`${where}: substance-use module note must include the 42 CFR Part 2 notice (G6)`);
    for (const prob of m.problems) {
      claim(prob.id, where);
      problemChecks(prob, { where, sud: m.sud, module: true }, refs, out);
    }
  }
  return out;
}
