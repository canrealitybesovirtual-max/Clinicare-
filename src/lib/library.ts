/**
 * Full content library (Phase 2/3): interventions, the plan library, ethics codes and legal topics, plus the
 * conditions and handouts already loaded by content.ts (re-used, not parsed twice). Validated with zod (G10).
 * Import this from SERVER components and pass only the slices a client component needs as props: the folders
 * it loads are large and are never needed in the browser as a whole.
 */
import { conditions, handouts, measures, parseAll } from "./content";
import { ethicsRaw } from "./generated/ethics";
import { interventionsRaw } from "./generated/interventions";
import { legalRaw } from "./generated/legal";
import { plansRaw } from "./generated/plans";
import type { Condition, Handout } from "./schemas";
import { EthicsCodeSchema, LegalTopicSchema, type EthicsCode, type LegalTopic } from "./schemas-hub";
import { InterventionSchema, PlanLibrarySchema, type Intervention, type PlanLibrary } from "./schemas-phase2";

const byKey = <T,>(list: readonly T[], key: (t: T) => string) => new Map(list.map((x) => [key(x), x] as const));

export const allConditions: Condition[] = conditions;
export const interventions: Intervention[] = parseAll(interventionsRaw, InterventionSchema, "intervention").sort((a, b) =>
  a.name.localeCompare(b.name),
);
export const planLibraries: PlanLibrary[] = parseAll(plansRaw, PlanLibrarySchema, "plan");
/** Every handout, sorted by title for library listings (content.ts keeps file-name order). */
export const allHandouts: Handout[] = [...handouts].sort((a, b) => a.title.localeCompare(b.title));
export const ethicsCodes: EthicsCode[] = parseAll(ethicsRaw, EthicsCodeSchema, "ethics code");
export const legalTopics: LegalTopic[] = parseAll(legalRaw, LegalTopicSchema, "legal topic");

const interventionMap = byKey(interventions, (i) => i.id);
const planMap = byKey(planLibraries, (p) => p.conditionId);
const handoutMap = byKey(allHandouts, (h) => h.id);
const conditionMap = byKey(allConditions, (c) => c.id);
const builtInMeasureIds = new Set(measures.map((m) => m.id));

export const getIntervention = (id: string) => interventionMap.get(id);
export const getPlanLibrary = (conditionId: string) => planMap.get(conditionId);
export const getAnyHandout = (id: string) => handoutMap.get(id);
export const getAnyCondition = (id: string) => conditionMap.get(id);

export const interventionsFor = (conditionId: string) => interventions.filter((i) => i.conditions.includes(conditionId));

/** Cross-reference problems across the whole library (used by tests and validate-content). */
export function libraryProblems(): string[] {
  const p: string[] = [];
  for (const i of interventions)
    for (const h of i.handoutIds) if (!handoutMap.has(h)) p.push(`interventions/${i.id}: unknown handout ${h}`);
  for (const pl of planLibraries)
    for (const prob of pl.problems) {
      for (const o of prob.shortTermObjectives)
        for (const iid of o.interventionIds) if (!interventionMap.has(iid)) p.push(`plans/${pl.conditionId}: unknown intervention ${iid}`);
      for (const m of prob.measureIds)
        if (!builtInMeasureIds.has(m)) p.push(`plans/${pl.conditionId}: measure ${m} is not a license-confirmed built-in measure (G7)`);
    }
  return p;
}
