/**
 * Reverse links between content types for detail pages (server only: reads the whole library).
 * Lives outside the individual loaders so it can import all of them without an import cycle
 * (practice and populations import orientations, so orientations cannot import them back).
 */
import { formulations } from "./formulations";
import { getOrientation } from "./orientations";
import { getPopulation } from "./populations";
import { getPracticeGuide, practiceGuides } from "./practice";
import type { Formulation } from "./schemas-formulations";
import type { Orientation } from "./schemas-orientations";
import type { PracticeGuide } from "./schemas-practice";

/** Every string in any `key` array anywhere inside a value (formulations nest interventionIds at several levels). */
function idsUnder(value: unknown, key: string, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) idsUnder(v, key, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === key && Array.isArray(v)) {
        for (const id of v) if (typeof id === "string") out.add(id);
      } else {
        idsUnder(v, key, out);
      }
    }
  }
  return out;
}

const formulationInterventions = new Map<string, Set<string>>(formulations.map((f) => [f.id, idsUnder(f, "interventionIds")]));

/** Formulation frameworks that link this intervention (A to Z by name). */
export function formulationsForIntervention(interventionId: string): Formulation[] {
  return formulations
    .filter((f) => formulationInterventions.get(f.id)?.has(interventionId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Practice guides that list this intervention as related (A to Z by title). */
export function practiceGuidesForIntervention(interventionId: string): PracticeGuide[] {
  return practiceGuides
    .filter((g) => g.relatedInterventionIds.includes(interventionId))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Orientation profiles for a list of ids (unknown ids dropped). */
export function orientationsFor(ids: readonly string[] | undefined): Orientation[] {
  return (ids ?? []).map((id) => getOrientation(id)).filter((o): o is Orientation => Boolean(o));
}

/** Evidence tiers that call for the emerging-treatments ethics prompt. */
const EMERGING_TIERS = new Set<Orientation["evidenceTier"]>(["emerging", "limited"]);
export const isEmergingTier = (tier: Orientation["evidenceTier"]): boolean => EMERGING_TIERS.has(tier);

/** Display title for a practice guide or population id, falling back to a label built from the id. */
export function practiceTitle(id: string): string {
  return getPracticeGuide(id)?.title ?? slugToLabel(id);
}
export function populationName(id: string): string {
  return getPopulation(id)?.name ?? slugToLabel(id);
}

function slugToLabel(id: string): string {
  const s = id.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
