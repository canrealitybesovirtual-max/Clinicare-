/**
 * Curated option lists for the location search. Isomorphic; safe for client bundles.
 * PROVIDER_TYPE_OPTIONS mirrors PROVIDER_TYPES / PROVIDER_TAXONOMIES in src/server/integrations/nppes.ts (server
 * only, so it cannot be imported here); tests/integrations/ui-b-provider-types.test.ts keeps them in sync.
 * FACILITY_TYPE_OPTIONS mirrors FACILITY_TYPES in src/server/integrations/findtreatment.ts.
 */
import { US_STATES } from "@/lib/outbound";

export const PROVIDER_TYPE_OPTIONS = [
  { id: "psychiatrist", label: "Psychiatrist (MD/DO)", sud: false },
  { id: "psychiatric-np", label: "Psychiatric-mental health nurse practitioner", sud: false },
  { id: "psychologist", label: "Psychologist", sud: false },
  { id: "clinical-psychologist", label: "Clinical psychologist", sud: false },
  { id: "professional-counselor", label: "Licensed professional counselor (LPC)", sud: false },
  { id: "mental-health-counselor", label: "Mental health counselor (LMHC / LCPC)", sud: false },
  { id: "clinical-social-worker", label: "Licensed clinical social worker (LCSW)", sud: false },
  { id: "marriage-family-therapist", label: "Marriage and family therapist (LMFT)", sud: false },
  { id: "addiction-counselor", label: "Addiction counselor", sud: true },
] as const;
export type ProviderTypeId = (typeof PROVIDER_TYPE_OPTIONS)[number]["id"];

export function providerOption(id: ProviderTypeId) {
  return PROVIDER_TYPE_OPTIONS.find((p) => p.id === id)!;
}

export const FACILITY_TYPE_OPTIONS = [
  { id: "mental-health", label: "Mental health", sud: false },
  { id: "substance-use", label: "Substance use", sud: true },
  { id: "both", label: "Mental health and substance use", sud: true },
] as const;
export type FacilityTypeId = (typeof FACILITY_TYPE_OPTIONS)[number]["id"];

/** Mirrors RADIUS_MILES in src/server/integrations/referral-common.ts. */
export const RADIUS_OPTIONS = [5, 10, 25, 50] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

export const SEARCH_MODES = ["providers", "health-centers", "treatment-facilities"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  providers: "Providers",
  "health-centers": "Health centers",
  "treatment-facilities": "Treatment facilities",
};

/** Page sizes sent to the routes (each route caps at 50). */
export const PAGE_SIZE = { providers: 20, "health-centers": 25, "treatment-facilities": 20 } as const;

type UsStateCode = (typeof US_STATES)[number];

export const US_STATE_NAMES: Record<UsStateCode, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", VI: "U.S. Virgin Islands", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};

/** States sorted by name for the select. */
export const STATE_OPTIONS: readonly { code: UsStateCode; name: string }[] = [...US_STATES]
  .map((code) => ({ code, name: US_STATE_NAMES[code] }))
  .sort((a, b) => a.name.localeCompare(b.name));
