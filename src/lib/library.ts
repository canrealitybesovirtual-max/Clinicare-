/**
 * Full content library (Phase 2/3): interventions, plan library, all handouts, ethics codes, legal topics.
 * Loaded from the generated static index and validated with zod (G10). Import this from SERVER components
 * and pass only the slices a client component needs as props, to keep client bundles small.
 */
import { conditionsRaw, interventionsRaw, plansRaw, handoutsRaw, ethicsRaw, legalRaw } from "./generated/content-index";
import { ConditionSchema, HandoutSchema, type Condition, type Handout } from "./schemas";
import { InterventionSchema, PlanLibrarySchema, type Intervention, type PlanLibrary } from "./schemas-phase2";
import { EthicsCodeSchema, LegalTopicSchema, type EthicsCode, type LegalTopic } from "./schemas-hub";

function parseAll<T>(raw: unknown[], schema: { parse: (x: unknown) => T }, kind: string): T[] {
  return raw.map((r, i) => {
    try {
      return schema.parse(r);
    } catch (e) {
      const id = (r as { id?: string; conditionId?: string })?.id ?? (r as { conditionId?: string })?.conditionId ?? i;
      throw new Error(`Invalid ${kind} content (${String(id)}): ${(e as Error).message.slice(0, 400)}`);
    }
  });
}

const byKey = <T,>(list: T[], key: (t: T) => string) => new Map(list.map((x) => [key(x), x] as const));

export const allConditions: Condition[] = parseAll(conditionsRaw, ConditionSchema, "condition");
export const interventions: Intervention[] = parseAll(interventionsRaw, InterventionSchema, "intervention").sort((a, b) =>
  a.name.localeCompare(b.name),
);
export const planLibraries: PlanLibrary[] = parseAll(plansRaw, PlanLibrarySchema, "plan");
export const allHandouts: Handout[] = parseAll(handoutsRaw, HandoutSchema, "handout").sort((a, b) => a.title.localeCompare(b.title));
export const ethicsCodes: EthicsCode[] = parseAll(ethicsRaw, EthicsCodeSchema, "ethics code");
export const legalTopics: LegalTopic[] = parseAll(legalRaw, LegalTopicSchema, "legal topic");

const interventionMap = byKey(interventions, (i) => i.id);
const planMap = byKey(planLibraries, (p) => p.conditionId);
const handoutMap = byKey(allHandouts, (h) => h.id);
const conditionMap = byKey(allConditions, (c) => c.id);

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
      for (const m of prob.measureIds) if (m !== "gad-7" && m !== "phq-9") p.push(`plans/${pl.conditionId}: measure ${m} not license-confirmed (G7)`);
    }
  return p;
}
