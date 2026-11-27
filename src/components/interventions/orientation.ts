/**
 * Theoretical orientation families for filtering the interventions and handouts libraries.
 * Content-driven: each intervention lists its orientation profiles in `orientationIds` (content/interventions),
 * and the profiles live in content/orientations. Items without a profile are care, harm-reduction and safety
 * steps (validate-content enforces this both ways). Server-side only: it reads the orientations loader.
 */
import { getOrientation, orientations } from "@/lib/orientations";

export interface OrientationOption {
  id: string;
  label: string;
}

/** Orientation profiles, A to Z (never ranked). */
export const ORIENTATIONS: readonly OrientationOption[] = orientations.map((o) => ({ id: o.id, label: o.shortName }));

export const OTHER_ORIENTATION: OrientationOption = { id: "care-steps", label: "Care, harm-reduction and safety steps" };

/** Orientation ids for one intervention (never empty: items without a profile fall under care steps). */
export function orientationsOf(i: { orientationIds?: readonly string[] }): string[] {
  const ids = (i.orientationIds ?? []).filter((id) => getOrientation(id));
  return ids.length ? [...ids] : [OTHER_ORIENTATION.id];
}

export function orientationLabel(id: string): string {
  return getOrientation(id)?.shortName ?? OTHER_ORIENTATION.label;
}

/** True when the id names a real orientation profile (has a /orientations/<id> page). */
export const isOrientationProfile = (id: string): boolean => Boolean(getOrientation(id));
