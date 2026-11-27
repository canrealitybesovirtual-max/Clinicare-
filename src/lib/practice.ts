/**
 * Practice guides (content/practice), validated with zod at load time (G10), and their links into the library:
 * interventions, handouts, formulations, legal and ethics topics, other guides and the orientation profiles that
 * point to them. Like library.ts, import this from SERVER components only and pass client components the slices
 * they need (the index search gets titles, categories and summaries).
 * Guides are reference content for clinicians. Nothing here stores, scores or decides anything about a person.
 */
import { parseAll } from "./content";
import { getFormulation } from "./formulations";
import { practiceRaw } from "./generated/practice";
import { getAnyHandout, getIntervention, legalTopics } from "./library";
import { orientations } from "./orientations";
import { PART2_NOTICE } from "./referral-links";
import type { Handout } from "./schemas";
import type { Formulation } from "./schemas-formulations";
import type { LegalTopic } from "./schemas-hub";
import type { Orientation } from "./schemas-orientations";
import type { Intervention } from "./schemas-phase2";
import {
  PRACTICE_CATEGORIES,
  PRACTICE_CATEGORY_LABELS,
  PracticeGuideSchema,
  type PracticeCategory,
  type PracticeGuide,
} from "./schemas-practice";

export { PART2_NOTICE };

/** Every guide, A to Z by title. */
export const practiceGuides: PracticeGuide[] = parseAll(practiceRaw, PracticeGuideSchema, "practice guide").sort((a, b) =>
  a.title.localeCompare(b.title),
);

const guideMap = new Map(practiceGuides.map((g) => [g.id, g] as const));
const legalMap = new Map(legalTopics.map((t) => [t.id, t] as const));

export const getPracticeGuide = (id: string): PracticeGuide | undefined => guideMap.get(id);

export interface PracticeGroup {
  category: PracticeCategory;
  label: string;
  line: string;
  items: PracticeGuide[];
}

/** Guides grouped by category in the fixed category order (never a ranking); empty categories are left out. */
export function practiceByCategory(list: readonly PracticeGuide[] = practiceGuides): PracticeGroup[] {
  return PRACTICE_CATEGORIES.map((category) => ({
    category,
    ...PRACTICE_CATEGORY_LABELS[category],
    items: list.filter((g) => g.category === category),
  })).filter((g) => g.items.length > 0);
}

const resolved = <T,>(ids: readonly string[], get: (id: string) => T | undefined): T[] =>
  ids.map(get).filter((x): x is T => x !== undefined);

export interface PracticeLinks {
  interventions: Intervention[];
  handouts: Handout[];
  formulations: Formulation[];
  legal: LegalTopic[];
  guides: PracticeGuide[];
  /** Orientation profiles that list this guide among their related practice guides. */
  orientations: Orientation[];
}

/** The library entries a guide links to, in the guide's order. Unknown ids are skipped (validate-content reports them). */
export function practiceLinks(g: PracticeGuide): PracticeLinks {
  return {
    interventions: resolved(g.relatedInterventionIds, getIntervention),
    handouts: resolved(g.relatedHandoutIds, getAnyHandout),
    formulations: resolved(g.relatedFormulationIds, getFormulation),
    legal: resolved(g.relatedLegalIds, (id) => legalMap.get(id)),
    guides: resolved(g.relatedPracticeIds, getPracticeGuide),
    orientations: orientations.filter((o) => o.relatedPracticeIds.includes(g.id)),
  };
}

/** Ids the guides may point at. A folder that does not exist yet is passed as undefined and not checked. */
export interface PracticeRefs {
  interventions: ReadonlySet<string>;
  handouts: ReadonlySet<string>;
  formulations: ReadonlySet<string>;
  legal: ReadonlySet<string>;
  /** Substance-use handouts (G6): linking one makes the guide a Part 2 guide. */
  sudHandouts: ReadonlySet<string>;
  licenses: Readonly<Record<string, { status: string }>>;
  populations?: ReadonlySet<string>;
}

/** Cross-file checks used by scripts/validate-content.ts and the unit tests. Returns error strings. */
export function practiceProblems(
  list: readonly PracticeGuide[],
  refs: PracticeRefs,
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const g of list) {
    if (ids.has(g.id)) p.push(`practice: duplicate id ${g.id}`);
    ids.add(g.id);
  }
  for (const g of list) {
    const where = `practice/${g.id}`;
    if (g.lastVerified > today) p.push(`${where}: lastVerified in the future: ${g.lastVerified}`);
    const unknown = (kind: string, values: readonly string[], known: ReadonlySet<string> | undefined) => {
      if (!known) return;
      for (const id of values) if (!known.has(id)) p.push(`${where}: unknown ${kind} ${id}`);
    };
    unknown("intervention", g.relatedInterventionIds, refs.interventions);
    unknown("handout", g.relatedHandoutIds, refs.handouts);
    unknown("formulation", g.relatedFormulationIds, refs.formulations);
    unknown("legal topic", g.relatedLegalIds, refs.legal);
    unknown("practice guide", g.relatedPracticeIds, ids);
    unknown("population", g.relatedPopulationIds, refs.populations);

    // G7: other measures are link-outs only, with a licenses.json entry that is not confirmed.
    for (const m of g.measuresPending) {
      const lic = refs.licenses[m.licenseKey];
      if (!lic) p.push(`${where}: pending measure ${m.name} has no licenses.json entry ${m.licenseKey} (G7)`);
      else if (lic.status === "confirmed") p.push(`${where}: ${m.name} is confirmed in licenses.json; build it in or drop it from measuresPending`);
    }

    // G6: a guide that links a substance-use handout shows the Part 2 notice.
    if (g.relatedHandoutIds.some((h) => refs.sudHandouts.has(h)) && !g.sud) p.push(`${where}: links a substance-use handout but sud is false (G6)`);
  }
  return p;
}
