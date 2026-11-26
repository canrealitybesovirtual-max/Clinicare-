import "server-only";
/**
 * SAMHSA FindTreatment.gov adapter: mental health and substance use treatment facilities near a ZIP or city/state.
 * docs/RESOURCES.md, SPEC 11.1, guardrails G5/G6/G17.
 *
 * Developer Guide v1.12 (Aug 17, 2026), read 2026-11-26:
 *   https://findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf
 *   GET https://{host}/locator/exportsAsJson/v2?sAddr=..&limitType=2&limitValue=<meters>&sType=sa|mh|both&pageSize=..&page=..&sort=0
 * The guide is written "for the approved user" and specifies no API key or other credential. So this adapter is
 * gated on an operator attestation: FINDTREATMENT_ACCESS_APPROVED=true once SAMHSA has approved this deployment
 * (FindTreatment@samhsa.hhs.gov). Optional FINDTREATMENT_API_HOST overrides the host if SAMHSA assigns one.
 * Without approval we throw NotConfigured and the UI shows findTreatmentLink() instead.
 *
 * Coordinate order: the guide's parameter table says "{lng},{lat}", but its worked examples, and the live service
 * (tested 2026-11-26), use "lat,lng". lng-first returns zero rows. We send "lat,lng".
 *
 * Outbound: ONLY a coarse point (0.01 degree) derived from the ZIP/city, the radius, the facility type
 * (mental health | substance use | both) and paging. No service codes, no name/phone/address filters, nothing
 * about the client. Results are public facility listings.
 */
import { z } from "zod";
import { curated } from "@/lib/outbound";
import {
  PART2_REMINDER,
  SAMHSA_HELPLINE,
  describeLocation,
  findTreatmentLink,
  type FinderLink,
} from "@/lib/referral-links";
import { NotConfigured, UpstreamError, setRateLimit, upstreamFetch } from "@/server/core";
import {
  MILES_TO_METERS,
  RadiusMiles,
  StrictLocation,
  cleanText,
  formatPhone,
  resolvePoint,
  roundMiles,
  safeParams,
  safeWebsite,
  titleCase,
  zip5,
  type GeoPoint,
} from "./referral-common";

export { findTreatmentLink } from "@/lib/referral-links";

export const FINDTREATMENT_UPSTREAM = "samhsa-findtreatment";
export const FINDTREATMENT_DEFAULT_HOST = "findtreatment.gov";
export const FINDTREATMENT_SOURCE_URL = "https://findtreatment.gov/";
export const CALL_TO_CONFIRM =
  "Call to confirm before referring: facility details are self-reported to SAMHSA and can be out of date (services, hours, insurance, waitlists and eligibility change).";
export const FINDTREATMENT_ATTRIBUTION = `Data: SAMHSA FindTreatment.gov. ${CALL_TO_CONFIRM} Listing is not an endorsement.`;

/** No published rate limit; the service sends Cache-Control max-age=600. Stay conservative: 1 request/s, burst 2. */
export function applyFindTreatmentRateLimit() {
  setRateLimit(FINDTREATMENT_UPSTREAM, 1, 2);
}
applyFindTreatmentRateLimit();

export const FACILITY_TYPES = ["mental-health", "substance-use", "both"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];
const S_TYPE: Record<FacilityType, "mh" | "sa" | "both"> = { "mental-health": "mh", "substance-use": "sa", both: "both" };

export const TreatmentFacilitiesInput = z.strictObject({
  location: StrictLocation,
  facilityType: curated(FACILITY_TYPES),
  radiusMiles: RadiusMiles.default(25),
  page: z.number().int().min(1).max(50).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type TreatmentFacilitiesInput = z.input<typeof TreatmentFacilitiesInput>;

export interface TreatmentFacility {
  name: string;
  program: string | null; // name2: program or unit name
  address: { line: string; city: string; state: string; zip5: string };
  phone: string | null;
  intakePhone: string | null;
  hotline: string | null;
  website: string | null;
  distanceMiles: number | null;
  /** Curated subset of the listing's service categories (public facility attributes). */
  services: {
    typeOfCare: string[];
    settings: string[];
    facilityTypes: string[];
    emergency: string[];
    payment: string[];
    paymentAssistance: string[];
    ageGroups: string[];
    languages: string[];
  };
  /** true if the listing names an adult age group; false if it lists only others; null if not reported. */
  acceptsAdults: boolean | null;
}

export interface TreatmentFacilitiesResult {
  location: string;
  facilityType: FacilityType;
  radiusMiles: number;
  page: number;
  totalPages: number;
  recordCount: number;
  facilities: TreatmentFacility[];
  notice: string; // call-to-confirm note (known data-quality issues)
  part2Notice: string | null; // 42 CFR Part 2 reminder for substance-use searches
  helpline: { label: string; number: string };
  finder: FinderLink;
}

interface FtService { f1?: string; f2?: string; f3?: string }
interface FtRow {
  name1?: string;
  name2?: string | null;
  street1?: string;
  street2?: string | null;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  intake1?: string | null;
  hotline1?: string | null;
  website?: string | null;
  miles?: number | string;
  services?: FtService[];
}
interface FtResponse { page?: number; totalPages?: number; recordCount?: number; rows?: FtRow[] }

/** Approved endpoint, or NotConfigured. */
export function findTreatmentEndpoint(): string {
  if (process.env.FINDTREATMENT_ACCESS_APPROVED?.trim().toLowerCase() !== "true") {
    throw new NotConfigured("FindTreatment.gov facility search");
  }
  const host = process.env.FINDTREATMENT_API_HOST?.trim() || FINDTREATMENT_DEFAULT_HOST;
  if (!/^(?:[a-z0-9-]+\.)+gov$/i.test(host)) throw new NotConfigured("FindTreatment.gov facility search");
  return `https://${host}/locator/exportsAsJson/v2`;
}

/** Exact upstream URL for a validated query and resolved point (exported for tests and the live smoke check). */
export function buildFindTreatmentUrl(endpoint: string, q: z.output<typeof TreatmentFacilitiesInput>, point: GeoPoint): string {
  const params = safeParams({
    sAddr: `${point.lat},${point.lng}`,
    limitType: "2", // distance search
    limitValue: (q.radiusMiles * MILES_TO_METERS).toFixed(1),
    sType: S_TYPE[q.facilityType],
    pageSize: String(q.pageSize),
    page: String(q.page),
    sort: "0", // nearest first
  });
  return `${endpoint}?${params}`;
}

const SERVICE_FIELDS: Record<string, keyof TreatmentFacility["services"]> = {
  TC: "typeOfCare",
  SET: "settings",
  FT: "facilityTypes",
  EMS: "emergency",
  PAY: "payment",
  PYAS: "paymentAssistance",
  AGE: "ageGroups",
  SL: "languages",
};

function splitList(value: unknown): string[] {
  return cleanText(value, 1200)
    .split(";")
    .map((s) => cleanText(s, 120))
    .filter(Boolean)
    .slice(0, 12);
}

function normalize(row: FtRow): TreatmentFacility | null {
  const name = cleanText(row.name1, 140);
  if (!name) return null;
  const services: TreatmentFacility["services"] = {
    typeOfCare: [], settings: [], facilityTypes: [], emergency: [], payment: [], paymentAssistance: [], ageGroups: [], languages: [],
  };
  for (const s of Array.isArray(row.services) ? row.services.slice(0, 60) : []) {
    const key = s.f2 ? SERVICE_FIELDS[s.f2] : undefined;
    if (key && services[key].length === 0) services[key] = splitList(s.f3);
  }
  const acceptsAdults = services.ageGroups.length
    ? services.ageGroups.some((g) => /\badults?\b|\bseniors?\b/i.test(g))
    : null;
  const line = [cleanText(row.street1, 120), cleanText(row.street2, 60)].filter(Boolean).join(", ");
  return {
    name,
    program: cleanText(row.name2, 140) || null,
    address: { line, city: titleCase(row.city, 60), state: cleanText(row.state, 2).toUpperCase(), zip5: zip5(row.zip) },
    phone: formatPhone(row.phone),
    intakePhone: formatPhone(row.intake1),
    hotline: formatPhone(row.hotline1),
    website: safeWebsite(row.website),
    distanceMiles: roundMiles(row.miles),
    services,
    acceptsAdults,
  };
}

/** Treatment facilities near a ZIP or city/state. Requires FINDTREATMENT_ACCESS_APPROVED=true. */
export async function searchTreatmentFacilities(input: TreatmentFacilitiesInput): Promise<TreatmentFacilitiesResult> {
  const q = TreatmentFacilitiesInput.parse(input);
  const endpoint = findTreatmentEndpoint();
  const point = await resolvePoint(q.location);
  const url = buildFindTreatmentUrl(endpoint, q, point);
  const res = await upstreamFetch<FtResponse>(url, { upstream: FINDTREATMENT_UPSTREAM, ttlMs: 6 * 60 * 60 * 1000 });
  if (!res || typeof res !== "object" || (res.rows !== undefined && !Array.isArray(res.rows))) {
    throw new UpstreamError(FINDTREATMENT_UPSTREAM, 502, "Unexpected response from FindTreatment.gov");
  }
  const facilities = (res.rows ?? [])
    .slice(0, q.pageSize)
    .map(normalize)
    .filter((f): f is TreatmentFacility => f !== null);
  const int = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fallback);
  return {
    location: describeLocation(q.location),
    facilityType: q.facilityType,
    radiusMiles: q.radiusMiles,
    page: int(res.page, q.page),
    totalPages: int(res.totalPages, 0),
    recordCount: int(res.recordCount, facilities.length),
    facilities,
    notice: CALL_TO_CONFIRM,
    part2Notice: q.facilityType === "mental-health" ? null : PART2_REMINDER,
    helpline: { label: SAMHSA_HELPLINE.label, number: SAMHSA_HELPLINE.number },
    finder: findTreatmentLink(q.location),
  };
}
