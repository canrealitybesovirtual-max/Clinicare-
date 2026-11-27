/**
 * Server-side lookups shared by the interventions and plan pages: condition display names, SUD flags and the
 * curated evidence searches (content/evidence-queries.json) that belong to an intervention.
 * Import from SERVER components only (it pulls in the full content library); pass slices to client components.
 */
import evidenceJson from "@content/evidence-queries.json";
import { allConditions, getAnyCondition, planLibraries } from "@/lib/library";
import { EvidenceQueriesFileSchema } from "@/lib/schemas-evidence";
import type { Intervention } from "@/lib/schemas-phase2";

/** Names for plan-library conditions that have no Phase 1 condition file yet (clinician mode only). */
const NAMES: Record<string, string> = {
  "adjustment-disorder": "Adjustment disorder",
  "alcohol-use-disorder": "Alcohol use disorder",
  "insomnia-disorder": "Insomnia disorder",
  "obsessive-compulsive-disorder": "Obsessive-compulsive disorder",
  "persistent-depressive-disorder": "Persistent depressive disorder",
  "prolonged-grief-disorder": "Prolonged grief disorder",
  "social-anxiety-disorder": "Social anxiety disorder",
  "specific-phobia": "Specific phobia",
};

export function conditionLabel(id: string): string {
  const name = getAnyCondition(id)?.name ?? NAMES[id];
  if (name) return name;
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Reference codes for a condition when its condition file has them (clinician mode only). */
export function conditionCodes(id: string): { icd10cm: string[]; icd11: string[] } {
  const c = getAnyCondition(id);
  return { icd10cm: c?.icd10cm.map((x) => x.code) ?? [], icd11: c?.icd11.map((x) => x.code) ?? [] };
}

const SUD_IDS = new Set<string>([
  "alcohol-use-disorder",
  ...planLibraries.filter((p) => p.sud).map((p) => p.conditionId),
  ...allConditions.filter((c) => c.sud).map((c) => c.id),
]);

/** Substance-use condition: show the 42 CFR Part 2 Hub prompt, put the Part 2 notice on exports (G6). */
export function isSudCondition(id: string): boolean {
  return SUD_IDS.has(id);
}

/* ------------------------------------------------------------------ curated evidence searches */

const evidence = EvidenceQueriesFileSchema.parse(evidenceJson);

export interface PubmedTarget {
  queryId: string;
  label: string;
  kind: "intervention" | "condition";
  filterLabel: string;
  sud: boolean;
}

export interface TrialsTarget {
  conditionId: string;
  label: string;
  sud: boolean;
}

/**
 * The curated PubMed strategy for an intervention's family (kind "intervention" listing this id); when none is
 * curated, the condition-level strategy for its first condition that has one. Only the queryId is ever sent.
 */
export function pubmedTargetFor(i: Pick<Intervention, "id" | "conditions">): PubmedTarget | null {
  const entries = Object.entries(evidence.queries);
  const family = entries.find(([, q]) => q.kind === "intervention" && q.interventionIds.includes(i.id));
  const fallback = family ? undefined : i.conditions.map((c) => entries.find(([id, q]) => id === c && q.kind === "condition")).find(Boolean);
  const hit = family ?? fallback;
  if (!hit) return null;
  const [queryId, q] = hit;
  return { queryId, label: q.label, kind: q.kind, filterLabel: evidence.pubmed.filterLabel, sud: q.sud };
}

/** Recruiting-trials search for the intervention's first condition, when that condition is curated. */
export function trialsTargetFor(i: Pick<Intervention, "conditions">): TrialsTarget | null {
  const first = i.conditions[0];
  if (!first) return null;
  const c = evidence.trials.conditions[first];
  return c ? { conditionId: first, label: c.label, sud: c.sud } : null;
}
