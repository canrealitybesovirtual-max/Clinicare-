/**
 * Theoretical orientation profiles (content/orientations), validated with zod (G10), and their links into the
 * library: techniques (interventions), ethics prompts (legal topics) and client handouts. Like library.ts, import
 * this from SERVER components only and pass client components the slices they need.
 * Profiles are reference content for clinicians. Nothing here ranks orientations or picks one for a client: the
 * index groups them by family in a fixed order and lists names A to Z within a family.
 */
import { parseAll } from "./content";
import { getFormulation } from "./formulations";
import { orientationsRaw } from "./generated/orientations";
import { getAnyHandout, getIntervention, interventions, legalTopics } from "./library";
import type { Handout } from "./schemas";
import type { Formulation } from "./schemas-formulations";
import type { LegalTopic } from "./schemas-hub";
import type { Intervention } from "./schemas-phase2";
import {
  ORIENTATION_FAMILIES,
  ORIENTATION_FAMILY_LABELS,
  OrientationSchema,
  isOrientationExempt,
  type Orientation,
  type OrientationFamily,
} from "./schemas-orientations";

export const orientations: Orientation[] = parseAll(orientationsRaw, OrientationSchema, "orientation").sort((a, b) =>
  a.name.localeCompare(b.name),
);

const orientationMap = new Map(orientations.map((o) => [o.id, o] as const));
const legalMap = new Map(legalTopics.map((t) => [t.id, t] as const));

export const getOrientation = (id: string): Orientation | undefined => orientationMap.get(id);

export interface OrientationGroup {
  family: OrientationFamily;
  label: string;
  items: Orientation[];
}

/** Profiles grouped by family in the fixed family order (never by evidence); families without a profile are left out. */
export function orientationsByFamily(): OrientationGroup[] {
  return ORIENTATION_FAMILIES.map((family) => ({
    family,
    label: ORIENTATION_FAMILY_LABELS[family],
    items: orientations.filter((o) => o.family === family),
  })).filter((g) => g.items.length > 0);
}

const resolved = <T,>(ids: readonly string[], get: (id: string) => T | undefined): T[] =>
  ids.map(get).filter((x): x is T => x !== undefined);

/** The library entries a profile links to, in the profile's order. Unknown ids are skipped (validate-content reports them). */
export function orientationLinks(o: Orientation): {
  typical: Intervention[];
  related: Intervention[];
  formulations: Formulation[];
  handouts: Handout[];
  ethics: { prompt: string; topics: LegalTopic[] }[];
} {
  return {
    typical: resolved(o.typicalTechniques, getIntervention),
    related: resolved(o.relatedTechniques, getIntervention),
    formulations: resolved(o.formulationIds, getFormulation),
    handouts: resolved(o.handoutIds, getAnyHandout),
    ethics: o.ethicsPrompts.map((e) => ({ prompt: e.prompt, topics: resolved(e.legalIds, (id) => legalMap.get(id)) })),
  };
}

/**
 * Cross-reference problems between profiles and the library (used by scripts/validate-content.ts and the tests):
 * - every typical technique exists and lists the profile in its orientationIds, and every intervention that lists a
 *   profile appears among that profile's typical techniques, so a profile page shows all of its techniques;
 * - every intervention maps to at least one existing profile unless it is a care, harm-reduction or safety step
 *   (isOrientationExempt);
 * - related techniques, ethics topics and handouts exist.
 * Links to formulations, practice guides and populations are checked by the validator against content/.
 */
export function orientationProblems(): string[] {
  const p: string[] = [];
  for (const o of orientations) {
    const where = `orientations/${o.id}`;
    for (const id of o.typicalTechniques) {
      const iv = getIntervention(id);
      if (!iv) p.push(`${where}: unknown typical technique ${id}`);
      else if (!iv.orientationIds?.includes(o.id)) p.push(`${where}: typical technique ${id} does not list ${o.id} in its orientationIds`);
    }
    for (const id of o.relatedTechniques) if (!getIntervention(id)) p.push(`${where}: unknown related technique ${id}`);
    for (const e of o.ethicsPrompts) for (const id of e.legalIds) if (!legalMap.has(id)) p.push(`${where}: unknown legal topic ${id}`);
    for (const id of o.handoutIds) if (!getAnyHandout(id)) p.push(`${where}: unknown handout ${id}`);
  }
  for (const i of interventions) {
    const where = `interventions/${i.id}`;
    const ids = i.orientationIds ?? [];
    if (ids.length === 0 && !isOrientationExempt(i))
      p.push(`${where}: no orientationIds; map it to at least one profile in content/orientations`);
    for (const id of ids) {
      const o = orientationMap.get(id);
      if (!o) p.push(`${where}: unknown orientation ${id}`);
      else if (!o.typicalTechniques.includes(i.id)) p.push(`orientations/${id}: typicalTechniques is missing ${i.id}, which lists this profile`);
    }
  }
  return p;
}
