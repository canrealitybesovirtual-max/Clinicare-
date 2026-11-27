/**
 * Display labels and index builders for the Ethics & Legal Hub (screen 8). Pure; used by the server page.
 * Filtering uses the content helpers (ethicsCodesFor, legalTopicsFor) so the hub follows one rule set.
 */
import {
  HUB_CONTEXTS,
  PROFESSIONS,
  ethicsCodesFor,
  legalTopicsFor,
  type EditionStatus,
  type EthicsCode,
  type HubContext,
  type LegalJurisdiction,
  type LegalTopic,
  type VerificationMethod,
} from "@/lib/schemas-hub";
import type { FacetIndex } from "./facet-filter";

/** Countries most users choose, listed first in the country select. */
export const PRIORITY_COUNTRIES = ["US", "CA", "GB", "IE", "AU", "NZ"] as const;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

const FALLBACK_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  AU: "Australia",
  NZ: "New Zealand",
};

/** "GB" -> "United Kingdom". Unknown codes are returned as is. */
export function countryLabel(code: string): string {
  if (code === "INTL") return "International";
  try {
    return regionNames?.of(code) ?? FALLBACK_NAMES[code] ?? code;
  } catch {
    return FALLBACK_NAMES[code] ?? code;
  }
}

export const EDITION_STATUS_LABELS: Record<EditionStatus, string> = {
  current: "Current edition",
  "revision-in-progress": "Revision in progress",
  "edition-unconfirmed": "Edition not confirmed",
};

export const VERIFICATION_LABELS: Record<VerificationMethod, string> = {
  "official-page": "Checked on the official page",
  "search-index": "Confirmed through search results that index the official pages",
  secondary: "Confirmed only through secondary sources",
  "not-verified": "Not checked online",
};

export function jurisdictionLabel(j: LegalJurisdiction, appliesIn?: readonly string[]): string {
  if (j === "US-federal") return "US federal law";
  if (j === "US-state-varies") return "US: varies by state";
  if (j === "INTL") {
    if (!appliesIn?.length) return "International";
    return appliesIn.length > 4 ? `International (${appliesIn.length} countries)` : `International: ${appliesIn.map(countryLabel).join(", ")}`;
  }
  return countryLabel(j);
}

export function scopeLabel(code: Pick<EthicsCode, "scope" | "countries" | "regionLabel">): string {
  if (code.scope === "global") return "Global framework";
  if (code.scope === "regional") return code.regionLabel ?? "Regional";
  return code.countries.map(countryLabel).join(", ");
}

/** Short, original names for the situations that trigger hub prompts. */
export const HUB_CONTEXT_LABELS: Record<HubContext, string> = {
  "faith-based": "Faith-integrated or spiritual interventions",
  sud: "Substance use",
  telehealth: "Telehealth and distance care",
  assessment: "Measures, assessment and suggestions",
  "duty-to-warn": "Threats of harm, abuse or imminent self-harm",
  technology: "Technology and digital tools",
};

export { HUB_CONTEXTS };

/** Every country any code or topic names, priority countries first, then alphabetical by English name. */
export function hubCountries(codes: readonly EthicsCode[], topics: readonly LegalTopic[]): string[] {
  const set = new Set<string>(PRIORITY_COUNTRIES);
  for (const c of codes) for (const k of c.countries) if (k !== "INTL") set.add(k);
  for (const t of topics) {
    if (t.jurisdiction !== "US-federal" && t.jurisdiction !== "US-state-varies" && t.jurisdiction !== "INTL") set.add(t.jurisdiction);
    for (const k of t.appliesIn ?? []) set.add(k);
  }
  const priority = PRIORITY_COUNTRIES.filter((c) => set.has(c));
  const rest = [...set].filter((c) => !(PRIORITY_COUNTRIES as readonly string[]).includes(c));
  rest.sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
  return [...priority, ...rest];
}

/** Facet index for the hub: codes filter by profession and country, legal topics by country. */
export function buildHubIndex(codes: readonly EthicsCode[], topics: readonly LegalTopic[], countries: readonly string[]): FacetIndex {
  const ids = <T extends { id: string }>(list: T[]) => list.map((x) => x.id);
  return {
    ethics: {
      profession: Object.fromEntries(PROFESSIONS.map((p) => [p, ids(ethicsCodesFor(codes, { profession: p }))])),
      country: Object.fromEntries(countries.map((c) => [c, ids(ethicsCodesFor(codes, { country: c }))])),
    },
    legal: {
      country: Object.fromEntries(countries.map((c) => [c, ids(legalTopicsFor(topics, { country: c }))])),
    },
  };
}
