"use client";
import * as React from "react";
import { useSession } from "@/state/session";
import { FacetFilterProvider } from "@/components/ethics/facet-filter";
import { ALL, type FacetIndex } from "@/components/ethics/facet-index";

/**
 * Directory filter that starts on the crisis-line country already chosen in this session (memory only),
 * falling back to every region. The choice is routing only, never client data.
 */
export function DirectoryFilterProvider({
  index,
  items,
  regions,
  children,
}: {
  index: FacetIndex;
  items: Record<string, readonly string[]>;
  regions: readonly string[];
  children: React.ReactNode;
}) {
  const { state } = useSession();
  const region = regions.includes(state.country) ? state.country : ALL;
  return (
    <FacetFilterProvider index={index} items={items} initial={{ region }}>
      {children}
    </FacetFilterProvider>
  );
}
