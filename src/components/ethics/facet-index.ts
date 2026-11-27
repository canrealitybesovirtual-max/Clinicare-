/**
 * Shared types, constants and the pure visibility rule for the show/hide facet filter (facet-filter.tsx).
 * Kept out of the "use client" module so server components can import ALL and the types as real values.
 */

/** Facet value meaning "no filter". */
export const ALL = "all";

/** group -> facet -> value -> matching ids. A facet missing from a group does not filter that group. */
export type FacetIndex = Record<string, Record<string, Record<string, readonly string[]>>>;

export interface FacetOption {
  value: string;
  label: string;
}

/** True when the id matches every chosen facet value that applies to its group. */
export function matchesFacets(index: FacetIndex, group: string, id: string, values: Record<string, string>): boolean {
  const facets = index[group];
  if (!facets) return true;
  for (const [facet, value] of Object.entries(values)) {
    if (!value || value === ALL) continue;
    const byValue = facets[facet];
    if (!byValue) continue; // this facet does not apply to the group
    if (!(byValue[value] ?? []).includes(id)) return false;
  }
  return true;
}
