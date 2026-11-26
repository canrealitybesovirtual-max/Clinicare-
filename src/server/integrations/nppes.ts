import "server-only";
/**
 * CMS NPPES NPI Registry adapter: licensed behavioral-health providers near a ZIP or city/state.
 * docs/RESOURCES.md, SPEC 11.1. API: https://npiregistry.cms.hhs.gov/api/?version=2.1 (free, no key;
 * max 200 results per request, skip up to 1,000 per query).
 *
 * Outbound (G5/G17): a curated NUCC taxonomy description, a ZIP or city + state, and paging numbers. Nothing else.
 * Inbound: PUBLIC provider records (names, credentials, practice addresses are published by CMS). They are not
 * client data. We return only what a referral needs and drop everything else (no sex, no license numbers,
 * no mailing addresses, no authorized-official details).
 *
 * NPPES matches taxonomy_description against a taxonomy's classification OR specialization alone (the combined
 * "Classification, Specialization" text returns error 14), so each provider type queries one term and the
 * results are then filtered to the exact NUCC code(s). Codes and descriptions below were checked against
 * live NPPES records on 2026-11-26 (NPPES stores the NUCC Health Care Provider Taxonomy code set).
 */
import { z } from "zod";
import { PART2_REMINDER, describeLocation, providerRegistryLink, type FinderLink } from "@/lib/referral-links";
import { UpstreamError, assertSudLookupAllowed, setRateLimit, upstreamFetch } from "@/server/core";
import { PLACES_ATTRIBUTION } from "./places";
import { StrictLocation, cleanText, formatPhone, safeParams, titleCase, zip5 } from "./referral-common";
import { strictCurated } from "./strict-input";

export const NPPES_UPSTREAM = "cms-nppes";
export const NPPES_ENDPOINT = "https://npiregistry.cms.hhs.gov/api/";
export const NPPES_SOURCE_URL = "https://npiregistry.cms.hhs.gov/";
export const NPPES_ATTRIBUTION = `Data: CMS NPPES NPI Registry. Listing is not an endorsement; verify licensure and availability. City names: ${PLACES_ATTRIBUTION}.`;

/**
 * Requested by the project brief: at most 2 requests per second to NPPES (CMS publishes no number). The sliding
 * window enforces it exactly (2 in any 1.1 s); the bucket alone would allow burst + rate = 4 in one second.
 */
export function applyNppesRateLimit() {
  setRateLimit(NPPES_UPSTREAM, 2, 2, { max: 2, ms: 1100 });
}
applyNppesRateLimit();

export const PROVIDER_TYPES = [
  "psychiatrist",
  "psychiatric-np",
  "psychologist",
  "clinical-psychologist",
  "professional-counselor",
  "mental-health-counselor",
  "clinical-social-worker",
  "marriage-family-therapist",
  "addiction-counselor",
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface TaxonomyCode {
  code: string; // NUCC Health Care Provider Taxonomy code
  description: string; // as published (NUCC / NPPES "desc")
}

export interface ProviderTypeSpec {
  label: string; // shown in the UI
  query: string; // NPPES taxonomy_description term (curated, constant)
  codes: readonly TaxonomyCode[]; // results are filtered to these codes
  part2?: boolean; // substance-use referral: show the 42 CFR Part 2 reminder
}

export const PROVIDER_TAXONOMIES: Record<ProviderType, ProviderTypeSpec> = {
  psychiatrist: {
    label: "Psychiatrist (MD/DO)",
    query: "Psychiatry",
    codes: [{ code: "2084P0800X", description: "Psychiatry & Neurology, Psychiatry" }],
  },
  "psychiatric-np": {
    label: "Psychiatric-mental health nurse practitioner",
    query: "Psych/Mental Health",
    codes: [{ code: "363LP0808X", description: "Nurse Practitioner, Psych/Mental Health" }],
  },
  psychologist: {
    label: "Psychologist",
    query: "Psychologist",
    codes: [
      { code: "103T00000X", description: "Psychologist" },
      { code: "103TC0700X", description: "Psychologist, Clinical" },
    ],
  },
  "clinical-psychologist": {
    label: "Clinical psychologist",
    query: "Psychologist",
    codes: [{ code: "103TC0700X", description: "Psychologist, Clinical" }],
  },
  "professional-counselor": {
    label: "Licensed professional counselor (LPC)",
    query: "Professional",
    codes: [{ code: "101YP2500X", description: "Counselor, Professional" }],
  },
  "mental-health-counselor": {
    label: "Mental health counselor (LMHC / LCPC)",
    query: "Mental Health",
    codes: [{ code: "101YM0800X", description: "Counselor, Mental Health" }],
  },
  "clinical-social-worker": {
    label: "Licensed clinical social worker (LCSW)",
    query: "Social Worker",
    codes: [{ code: "1041C0700X", description: "Social Worker, Clinical" }],
  },
  "marriage-family-therapist": {
    label: "Marriage and family therapist (LMFT)",
    query: "Marriage & Family Therapist",
    codes: [{ code: "106H00000X", description: "Marriage & Family Therapist" }],
  },
  "addiction-counselor": {
    label: "Addiction counselor",
    query: "Addiction (Substance Use Disorder)",
    codes: [{ code: "101YA0400X", description: "Counselor, Addiction (Substance Use Disorder)" }],
    part2: true,
  },
};

/** NPPES limits: 200 results per request, skip at most 1,000. Our page size is capped at 50. */
export const NPPES_MAX_UPSTREAM_LIMIT = 200;
export const NPPES_MAX_SKIP = 1000;

export const ProvidersInput = z.strictObject({
  providerType: strictCurated(PROVIDER_TYPES),
  location: StrictLocation,
  limit: z.number().int().min(1).max(50).default(20),
  skip: z.number().int().min(0).max(NPPES_MAX_SKIP).default(0),
});
export type ProvidersInput = z.input<typeof ProvidersInput>;

export interface ProviderRecord {
  npi: string;
  kind: "individual" | "organization";
  displayName: string; // organization name, or "First Last, Credential" from the PUBLIC registry
  credential: string | null;
  taxonomy: { code: string; description: string; primary: boolean; state: string | null };
  address: { line: string; city: string; state: string; zip5: string };
  phone: string | null;
  lastUpdated: string | null; // YYYY-MM-DD, from the registry
  registryUrl: string; // canonical public record
}

export interface ProvidersResult {
  providerType: ProviderType;
  providerLabel: string;
  taxonomyCodes: readonly TaxonomyCode[];
  location: string;
  results: ProviderRecord[];
  /** Pass back as `skip` for the next page; null when there are no more (or the 1,000 skip cap is reached). */
  nextSkip: number | null;
  notice: string;
  part2Notice: string | null;
  finder: FinderLink;
}

/* ---------------- upstream shapes (only fields we read) ---------------- */
interface NppesAddress {
  address_1?: string;
  address_2?: string;
  address_purpose?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
}
interface NppesTaxonomy { code?: string; desc?: string; primary?: boolean; state?: string | null }
interface NppesBasic {
  organization_name?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  credential?: string;
  status?: string;
  last_updated?: string;
}
interface NppesRecord {
  number?: string | number;
  enumeration_type?: string;
  basic?: NppesBasic;
  addresses?: NppesAddress[];
  taxonomies?: NppesTaxonomy[];
}
interface NppesResponse {
  result_count?: number;
  results?: NppesRecord[];
  Errors?: { description?: string; field?: string; number?: string }[];
}

/** Exact upstream URL for a validated query (exported for tests and the live smoke check). */
export function buildNppesUrl(q: z.output<typeof ProvidersInput>): string {
  const spec = PROVIDER_TAXONOMIES[q.providerType];
  const values: Record<string, string> = {
    version: "2.1",
    taxonomy_description: spec.query,
    address_purpose: "LOCATION", // match practice locations, not mailing addresses
    limit: String(upstreamLimit(q.limit)),
    skip: String(q.skip),
  };
  if ("zip" in q.location) values.postal_code = q.location.zip;
  else {
    values.city = q.location.city;
    values.state = q.location.state;
  }
  // city is the canonical gazetteer name (StrictLocation), never the typed text
  return `${NPPES_ENDPOINT}?${safeParams(values, ["postal_code"], ["city"])}`;
}

/** Ask for more than we show: results are filtered to exact NUCC codes after they arrive. */
function upstreamLimit(limit: number): number {
  return Math.min(NPPES_MAX_UPSTREAM_LIMIT, Math.max(50, limit * 4));
}

function credentialOf(raw: unknown): string | null {
  const s = cleanText(raw, 40).replace(/[^A-Za-z0-9.,\-/ ()]/g, "").trim();
  return s || null;
}

function normalize(rec: NppesRecord, codes: readonly TaxonomyCode[]): ProviderRecord | null {
  const npi = String(rec.number ?? "");
  if (!/^\d{10}$/.test(npi)) return null;
  const basic = rec.basic ?? {};
  if (basic.status && basic.status !== "A") return null; // active records only
  const wanted = new Set(codes.map((c) => c.code));
  const matches = (rec.taxonomies ?? []).filter((t) => t.code && wanted.has(t.code));
  if (!matches.length) return null;
  const tax = matches.find((t) => t.primary) ?? matches[0]!;
  const loc = (rec.addresses ?? []).find((a) => a.address_purpose === "LOCATION");
  if (!loc) return null;

  const isOrg = rec.enumeration_type === "NPI-2" || (!!basic.organization_name && !basic.last_name);
  const credential = isOrg ? null : credentialOf(basic.credential);
  const person = [titleCase(basic.first_name, 40), titleCase(basic.last_name, 60)].filter(Boolean).join(" ");
  const displayName = isOrg
    ? cleanText(basic.organization_name, 120)
    : credential
      ? `${person}, ${credential}`
      : person;
  if (!displayName) return null;

  const line = [cleanText(loc.address_1, 100), cleanText(loc.address_2, 60)].filter(Boolean).join(", ");
  const updated = /^\d{4}-\d{2}-\d{2}$/.test(basic.last_updated ?? "") ? basic.last_updated! : null;
  return {
    npi,
    kind: isOrg ? "organization" : "individual",
    displayName,
    credential,
    taxonomy: {
      code: tax.code!,
      description: codes.find((c) => c.code === tax.code)?.description ?? cleanText(tax.desc, 120),
      primary: tax.primary === true,
      state: /^[A-Z]{2}$/.test(tax.state ?? "") ? tax.state! : null,
    },
    address: {
      line,
      city: titleCase(loc.city, 60),
      state: cleanText(loc.state, 2).toUpperCase(),
      zip5: zip5(loc.postal_code),
    },
    phone: formatPhone(loc.telephone_number),
    lastUpdated: updated,
    registryUrl: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
  };
}

/** Search NPPES for one curated provider type near a ZIP or city/state. */
export async function searchProviders(input: ProvidersInput): Promise<ProvidersResult> {
  const q = ProvidersInput.parse(input); // re-validate: callers other than the route cannot bypass the schema
  const spec = PROVIDER_TAXONOMIES[q.providerType];
  assertSudLookupAllowed(spec.part2 === true); // 42 CFR Part 2 owner switch (core.ts), before any fetch
  const url = buildNppesUrl(q);
  const body = await upstreamFetch<NppesResponse>(url, { upstream: NPPES_UPSTREAM, ttlMs: 24 * 60 * 60 * 1000 });
  if (!body || typeof body !== "object") throw new UpstreamError(NPPES_UPSTREAM, 502, "Unexpected response from the NPI Registry");
  if (Array.isArray(body.Errors) && body.Errors.length) throw new UpstreamError(NPPES_UPSTREAM, 502, "The NPI Registry could not run this search");

  const raw = Array.isArray(body.results) ? body.results : [];
  const results: ProviderRecord[] = [];
  const seen = new Set<string>();
  let consumed = 0;
  for (const rec of raw) {
    if (results.length >= q.limit) break;
    consumed += 1;
    const p = normalize(rec, spec.codes);
    if (p && !seen.has(p.npi)) {
      seen.add(p.npi);
      results.push(p);
    }
  }
  const fullPage = raw.length >= upstreamLimit(q.limit);
  const more = consumed < raw.length || fullPage;
  const next = q.skip + consumed;
  return {
    providerType: q.providerType,
    providerLabel: spec.label,
    taxonomyCodes: spec.codes,
    location: describeLocation(q.location),
    results,
    nextSkip: more && next <= NPPES_MAX_SKIP ? next : null,
    notice:
      "Public NPI Registry records. Inclusion is not an endorsement or a quality rating, and records can be out of date. Verify licensure with the state board and confirm availability, fees and insurance directly.",
    part2Notice: spec.part2 ? PART2_REMINDER : null,
    finder: providerRegistryLink(q.location),
  };
}
