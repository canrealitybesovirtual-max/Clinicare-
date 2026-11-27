/**
 * Builds the ResourceCatalog from the full content library (src/lib/library.ts) and exposes
 * resourceHints(scoringResult, triggers) with that catalog as the default.
 *
 * library.ts loads every content file, so prefer calling buildResourceCatalog() in a SERVER component and
 * passing the (small, serializable) catalog to the client, where computeResourceHints() from resources.ts
 * does the rest. Importing this module in a client component works too, at the cost of a larger bundle.
 */
import { measures } from "@/lib/content";
import { allConditions, allHandouts, interventions, planLibraries } from "@/lib/library";
import type { ScoringResult } from "@/lib/types";
import { computeResourceHints, type ResourceCatalog, type ResourceHintOptions, type ResourceHints } from "./resources";
import type { TriggerHit } from "./triggers";

export function buildResourceCatalog(): ResourceCatalog {
  const planInterventions: Record<string, string[]> = {};
  for (const p of planLibraries) {
    const ids: string[] = [];
    for (const prob of p.problems) for (const o of prob.shortTermObjectives) for (const id of o.interventionIds) if (!ids.includes(id)) ids.push(id);
    planInterventions[p.conditionId] = ids;
  }
  return {
    conditions: allConditions.map((c) => ({ id: c.id, name: c.name, measures: [...c.measures], handouts: [...c.handouts], sud: c.sud })),
    interventions: interventions.map((i) => ({
      id: i.id,
      name: i.name,
      conditions: [...i.conditions],
      handoutIds: [...i.handoutIds],
      ...(i.suggestWith ? { suggestWith: [...i.suggestWith] } : {}),
    })),
    planInterventions,
    handouts: allHandouts.map((h) => ({ id: h.id, title: h.title, sud: h.sud, ...(h.suggestWith ? { suggestWith: [...h.suggestWith] } : {}) })),
    measureIds: measures.map((m) => m.id), // content.ts exposes license-confirmed measures only (G7)
  };
}

let cached: ResourceCatalog | null = null;

/** The catalog built once from the content library. */
export function defaultResourceCatalog(): ResourceCatalog {
  cached ??= buildResourceCatalog();
  return cached;
}

/**
 * resourceHints(scoringResult, triggers) -> { measureIds, interventionIds, handoutIds, referralKinds, ... }
 * from the library. Pure apart from the one-time catalog build.
 */
export function resourceHints(
  scoringResult: ScoringResult,
  triggers: readonly TriggerHit[],
  opts: ResourceHintOptions & { catalog?: ResourceCatalog } = {},
): ResourceHints {
  return computeResourceHints(scoringResult, triggers, opts.catalog ?? defaultResourceCatalog(), opts);
}
