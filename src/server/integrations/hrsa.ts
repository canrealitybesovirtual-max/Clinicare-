import "server-only";
/**
 * HRSA health centers (sliding-fee primary care, many with behavioral health) near a ZIP or city/state.
 * docs/RESOURCES.md, SPEC 11.1.
 *
 * Service (checked 2026-11-26): data.HRSA.gov HDW web services, Developer Guide
 *   https://data.hrsa.gov/Content/Documents/data-services/DeveloperGuide.pdf
 *   POST https://data.hrsa.gov/HDWAPI3_External/api/v1/GetHealthCentersAroundALocation
 *        { Latitude, Longitude, Radius, MinRecs, MaxRadius, RadiusIncrement, Token } -> { HCC: [...] , with Distance }
 *   POST https://data.hrsa.gov/HDWAPI3_External/api/v1/GetHealthCentersByArea
 *        { StateFipsCode | CountyFipsCode | ZipCode, Token } -> { HCC: [...] }
 * Access requires free registration (https://data.hrsa.gov/tools/web-services/registration, one internet domain
 * per registration) which issues a web token. Without a token the API answers HTTP 400 {"Error":{"code":"ERR002"}}.
 * So: HRSA_API_KEY (server env only) holds the token; without it we throw NotConfigured and the UI shows
 * healthCenterLink() instead. HRSA's public ArcGIS layers (gisportal.hrsa.gov) were not reachable from the
 * build sandbox and were not used.
 *
 * Outbound (G5/G17): a coarse point (0.01 degree) derived from the ZIP/city, or the ZIP, or a state FIPS code,
 * plus the radius. Never anything typed by the clinician.
 */
import { z } from "zod";
import { describeLocation, healthCenterLink, type FinderLink } from "@/lib/referral-links";
import { NotConfigured, UpstreamError, setRateLimit, upstreamFetch } from "@/server/core";
import {
  RadiusMiles,
  STATE_FIPS,
  StrictLocation,
  assertSafeBody,
  cleanText,
  formatPhone,
  resolvePoint,
  roundMiles,
  safeWebsite,
  titleCase,
  zip5,
  type GeoPoint,
} from "./referral-common";

export { healthCenterLink } from "@/lib/referral-links";

export const HRSA_UPSTREAM = "hrsa-hdw";
export const HRSA_API_BASE = "https://data.hrsa.gov/HDWAPI3_External/api/v1";
export const HRSA_SOURCE_URL = "https://data.hrsa.gov/tools/web-services";
export const HRSA_ATTRIBUTION =
  "Data: HRSA Data Warehouse (data.HRSA.gov), Health Center Service Delivery Sites. Listing is not an endorsement; call to confirm services, hours and fees.";

/** Original wording. HRSA-funded health centers must offer a sliding fee discount and serve patients regardless of ability to pay. */
export const SLIDING_FEE_NOTE =
  "HRSA-funded health centers provide care regardless of ability to pay and offer a sliding fee scale based on income. Behavioral health and medication services vary by site, so call to confirm.";

/** HRSA publishes no numeric rate limit for the HDW API; stay conservative: 1 request/s, burst 2. */
export function applyHrsaRateLimit() {
  setRateLimit(HRSA_UPSTREAM, 1, 2);
}
applyHrsaRateLimit();

export const HealthCentersInput = z.strictObject({
  location: StrictLocation,
  radiusMiles: RadiusMiles.default(10),
  limit: z.number().int().min(1).max(50).default(20),
});
export type HealthCentersInput = z.input<typeof HealthCentersInput>;

export interface HealthCenterSite {
  id: string;
  name: string;
  address: { line: string; city: string; state: string; zip5: string };
  phone: string | null;
  website: string | null;
  siteType: string; // "Service Delivery Site" | "Administrative/Service Delivery Site"
  locationType: string; // "Permanent" | "Seasonal" | "Mobile Van" | "Unknown"
  distanceMiles: number | null;
}

export interface HealthCentersResult {
  location: string;
  /** "distance": radius search from the ZIP/city point; "zip": sites in that ZIP; "state-city": sites listed in that city. */
  method: "distance" | "zip" | "state-city";
  radiusMiles: number | null;
  sites: HealthCenterSite[];
  slidingFeeNote: string;
  finder: FinderLink;
}

interface HccRow {
  ROW_ID?: number;
  HCC_FCT_ID?: number | string;
  SITE_NM?: string;
  SITE_ADDRESS?: string;
  SITE_CITY?: string;
  SITE_STATE_ABBR?: string;
  SITE_ZIP_CD?: string;
  SITE_PHONE_NUM?: string;
  SITE_URL?: string;
  HCC_TYP_DESC?: string;
  HCC_LOC_DESC?: string;
  Distance?: number | string;
}
interface HccResponse { HCC?: HccRow[]; Error?: { code?: string; description?: string } }

function token(): string {
  const t = process.env.HRSA_API_KEY?.trim();
  if (!t) throw new NotConfigured("HRSA health center search");
  return t;
}

type HrsaRequest =
  | { method: "GetHealthCentersAroundALocation"; body: Record<string, string | number>; cacheKey: string }
  | { method: "GetHealthCentersByArea"; body: Record<string, string | number>; cacheKey: string };

/** The exact request for a validated query (exported for tests). The token is added by the caller, never cached. */
export function buildHrsaRequest(
  q: z.output<typeof HealthCentersInput>,
  point: GeoPoint | null,
): HrsaRequest {
  if (point) {
    const body = {
      Latitude: point.lat,
      Longitude: point.lng,
      Radius: q.radiusMiles,
      MinRecs: q.limit,
      MaxRadius: q.radiusMiles, // never widen past what the clinician chose
      RadiusIncrement: 5,
    };
    return { method: "GetHealthCentersAroundALocation", body, cacheKey: `around:${point.lat},${point.lng}:${q.radiusMiles}:${q.limit}` };
  }
  if ("zip" in q.location) {
    return { method: "GetHealthCentersByArea", body: { ZipCode: q.location.zip }, cacheKey: `zip:${q.location.zip}` };
  }
  const fips = STATE_FIPS[q.location.state];
  return { method: "GetHealthCentersByArea", body: { StateFipsCode: fips }, cacheKey: `state:${fips}` };
}

function normalize(row: HccRow): HealthCenterSite | null {
  const name = cleanText(row.SITE_NM, 120);
  const siteType = cleanText(row.HCC_TYP_DESC, 60);
  if (!name || /^administrative$/i.test(siteType)) return null; // administrative-only offices see no patients
  return {
    id: String(row.HCC_FCT_ID ?? row.ROW_ID ?? name),
    name,
    address: {
      line: cleanText(row.SITE_ADDRESS, 120),
      city: titleCase(row.SITE_CITY, 60),
      state: cleanText(row.SITE_STATE_ABBR, 2).toUpperCase(),
      zip5: zip5(row.SITE_ZIP_CD),
    },
    phone: formatPhone(row.SITE_PHONE_NUM),
    website: safeWebsite(row.SITE_URL),
    siteType: siteType || "Service Delivery Site",
    locationType: cleanText(row.HCC_LOC_DESC, 40) || "Unknown",
    distanceMiles: roundMiles(row.Distance),
  };
}

/** Sliding-fee health center sites near a ZIP or city/state. Requires HRSA_API_KEY (the HDW web token). */
export async function searchHealthCenters(input: HealthCentersInput): Promise<HealthCentersResult> {
  const q = HealthCentersInput.parse(input);
  const secret = token();

  let point: GeoPoint | null = null;
  try {
    point = await resolvePoint(q.location);
  } catch (e) {
    if (!(e instanceof UpstreamError)) throw e; // unknown ZIP or geocoder down: fall back to an area search
  }
  const req = buildHrsaRequest(q, point);
  assertSafeBody(req.body, { zipKeys: ["ZipCode"] });

  let res: HccResponse;
  try {
    res = await upstreamFetch<HccResponse>(`${HRSA_API_BASE}/${req.method}`, {
      upstream: HRSA_UPSTREAM,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req.body, Token: secret }),
      cacheKey: req.cacheKey, // POST: key on the validated query, never on the token
      ttlMs: 24 * 60 * 60 * 1000,
    });
  } catch (e) {
    // HDW answers HTTP 400 {"Error":{"code":"ERR002"}} for a missing/invalid/unregistered-domain token.
    if (e instanceof UpstreamError && e.upstream === HRSA_UPSTREAM && (e.status === 400 || e.status === 401 || e.status === 403)) {
      throw new UpstreamError(HRSA_UPSTREAM, 502, "The HRSA service did not accept this server's access token. Use Find a Health Center instead.");
    }
    throw e;
  }
  if (!res || typeof res !== "object" || res.Error) throw new UpstreamError(HRSA_UPSTREAM, 502, "The HRSA health center service could not run this search");

  const method: HealthCentersResult["method"] = point ? "distance" : "zip" in q.location ? "zip" : "state-city";
  const cityFilter = "city" in q.location ? q.location.city.toLowerCase() : null;
  const seen = new Set<string>();
  const sites: HealthCenterSite[] = [];
  for (const row of Array.isArray(res.HCC) ? res.HCC : []) {
    const site = normalize(row);
    if (!site || seen.has(site.id)) continue;
    if (method === "state-city" && site.address.city.toLowerCase() !== cityFilter) continue;
    seen.add(site.id);
    sites.push(site);
  }
  sites.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity) || a.name.localeCompare(b.name));

  return {
    location: describeLocation(q.location),
    method,
    radiusMiles: point ? q.radiusMiles : null,
    sites: sites.slice(0, q.limit),
    slidingFeeNote: SLIDING_FEE_NOTE,
    finder: healthCenterLink(q.location),
  };
}
