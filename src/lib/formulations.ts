/**
 * Case-formulation frameworks (content/formulations), validated with zod at load time (G10). Import from SERVER
 * components and pass client components only the slices they need (the worksheet gets its templates and chips).
 *
 * The curated formulation targets (maintaining processes, context and strengths) are defined once, by the
 * transdiagnostic process map; treatment-plan objectives and the worksheet refer to them by id. Behavior functions
 * are defined once, by the functional analysis. Nothing here scores, ranks or decides anything about a person.
 */
import { parseAll } from "./content";
import { formulationsRaw } from "./generated/formulations";
import { PART2_NOTICE } from "./referral-links";
import {
  FAMILY_LABELS,
  FORMULATION_FAMILIES,
  FormulationSchema,
  type BehaviorFunction,
  type Formulation,
  type FormulationFactor,
  type FormulationFamily,
} from "./schemas-formulations";

export const PROCESS_MAP_ID = "transdiagnostic-process-map";
export const FUNCTIONAL_ANALYSIS_ID = "functional-analysis";

/** Every framework, in file-name order. */
export const formulations: Formulation[] = parseAll(formulationsRaw, FormulationSchema, "formulation");

const formulationMap = new Map(formulations.map((f) => [f.id, f] as const));
export const getFormulation = (id: string): Formulation | undefined => formulationMap.get(id);

/** The curated factors (formulation targets), in the process map's order. */
export const formulationFactors: FormulationFactor[] = formulationMap.get(PROCESS_MAP_ID)?.factors ?? [];
/** Ids that plan objectives may use as `targets` and that the worksheet offers as chips. */
export const FORMULATION_TARGET_IDS: readonly string[] = formulationFactors.map((f) => f.id);
const factorMap = new Map(formulationFactors.map((f) => [f.id, f] as const));
export const getFormulationFactor = (id: string): FormulationFactor | undefined => factorMap.get(id);

/** What a behavior can do for the person (functional analysis). */
export const behaviorFunctions: BehaviorFunction[] = formulationMap.get(FUNCTIONAL_ANALYSIS_ID)?.functions ?? [];

/** The worksheet that opens first: the general, cross-orientation 5 Ps grid. */
export const DEFAULT_WORKSHEET_ID = "five-ps-biopsychosocial-spiritual";

/** Frameworks with an interactive worksheet: the 5 Ps grid first, then A to Z. */
export const worksheetFormulations: Formulation[] = formulations
  .filter((f) => f.worksheet)
  .sort((a, b) => Number(b.id === DEFAULT_WORKSHEET_ID) - Number(a.id === DEFAULT_WORKSHEET_ID) || a.name.localeCompare(b.name));

export interface FormulationGroup {
  family: FormulationFamily;
  label: string;
  items: Formulation[];
}

/** Frameworks grouped by family in the fixed family order (never a ranking); empty families are left out. */
export function formulationsByFamily(list: readonly Formulation[] = formulations): FormulationGroup[] {
  return FORMULATION_FAMILIES.map((family) => ({
    family,
    label: FAMILY_LABELS[family],
    items: list.filter((f) => f.family === family).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);
}

/** Ids the frameworks may point at. A folder that does not exist yet is passed as undefined and not checked. */
export interface FormulationRefs {
  interventions: ReadonlySet<string>;
  handouts: ReadonlySet<string>;
  conditions: ReadonlySet<string>;
  legal: ReadonlySet<string>;
  /** Substance-use handouts and conditions (G6): linking one makes the framework a Part 2 framework. */
  sudHandouts: ReadonlySet<string>;
  sudConditions: ReadonlySet<string>;
  licenses: Readonly<Record<string, { status: string }>>;
  orientations?: ReadonlySet<string>;
  practice?: ReadonlySet<string>;
  populations?: ReadonlySet<string>;
}

/** Cross-file checks used by scripts/validate-content.ts and the unit tests. Returns error strings. */
export function formulationProblems(list: readonly Formulation[], refs: FormulationRefs, today = new Date().toISOString().slice(0, 10)): string[] {
  const p: string[] = [];
  const seen = new Set<string>();
  for (const f of list) {
    if (seen.has(f.id)) p.push(`formulations: duplicate id ${f.id}`);
    seen.add(f.id);
  }

  const map = list.find((f) => f.id === PROCESS_MAP_ID);
  if (!map?.factors?.length) p.push(`formulations/${PROCESS_MAP_ID}: must define the curated factors (formulation targets)`);
  const factorIds = new Set((map?.factors ?? []).map((x) => x.id));
  const fa = list.find((f) => f.id === FUNCTIONAL_ANALYSIS_ID);
  if (!fa?.functions?.length) p.push(`formulations/${FUNCTIONAL_ANALYSIS_ID}: must define the behavior functions`);

  for (const f of list) {
    const where = `formulations/${f.id}`;
    if (f.factors && f.id !== PROCESS_MAP_ID) p.push(`${where}: only ${PROCESS_MAP_ID} defines factors; refer to them with factorIds`);
    if (f.functions && f.id !== FUNCTIONAL_ANALYSIS_ID) p.push(`${where}: only ${FUNCTIONAL_ANALYSIS_ID} defines behavior functions`);
    if (f.lastVerified > today) p.push(`${where}: lastVerified in the future: ${f.lastVerified}`);

    const unknown = (kind: string, ids: readonly string[] | undefined, known: ReadonlySet<string> | undefined) => {
      if (!known) return;
      for (const id of ids ?? []) if (!known.has(id)) p.push(`${where}: unknown ${kind} ${id}`);
    };
    unknown("factor", f.factorIds, factorIds);
    unknown("intervention", f.interventionIds, refs.interventions);
    unknown("handout", f.handoutIds, refs.handouts);
    unknown("condition", f.conditionIds, refs.conditions);
    unknown("legal topic", f.legalIds, refs.legal);
    unknown("orientation", f.orientationIds, refs.orientations);
    unknown("practice guide", f.practiceIds, refs.practice);
    unknown("population", f.populationIds, refs.populations);
    for (const part of f.structure) {
      unknown(`factor in ${part.id}`, part.factorIds, factorIds);
      unknown(`intervention in ${part.id}`, part.interventionIds, refs.interventions);
      unknown(`condition in ${part.id}`, part.conditionIds, refs.conditions);
    }
    for (const x of f.factors ?? []) unknown(`intervention in factor ${x.id}`, x.interventionIds, refs.interventions);
    for (const x of f.functions ?? []) unknown(`intervention in function ${x.id}`, x.interventionIds, refs.interventions);

    // G7: other measures are link-outs only, with a licenses.json entry that is not confirmed.
    for (const m of f.measuresPending) {
      const lic = refs.licenses[m.licenseKey];
      if (!lic) p.push(`${where}: pending measure ${m.name} has no licenses.json entry ${m.licenseKey} (G7)`);
      else if (lic.status === "confirmed") p.push(`${where}: ${m.name} is confirmed in licenses.json; build it in or drop it from measuresPending`);
    }

    // G6: substance-use links make it a Part 2 framework, which states the exact notice.
    const linksSud =
      f.handoutIds.some((h) => refs.sudHandouts.has(h)) || [...f.conditionIds, ...f.structure.flatMap((s) => s.conditionIds ?? [])].some((c) => refs.sudConditions.has(c));
    if (linksSud && !f.sud) p.push(`${where}: links substance-use content but sud is false (G6)`);
    if (f.sud && !f.cautions.some((c) => c.includes(PART2_NOTICE))) p.push(`${where}: sud framework cautions must include the 42 CFR Part 2 notice (G6)`);
  }
  return p;
}
