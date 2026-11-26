import "server-only";
/**
 * Shared helpers for the referral integrations (NPPES, HRSA, FindTreatment.gov). Guardrails G5/G17.
 *
 * Location rule: a referral search may carry ONLY a 5-digit ZIP or a city + state (src/lib/outbound.ts).
 * - ZIP -> coarse point from a static Census ZCTA table (content/referrals/zcta-centroids.json, rounded to
 *   0.01 degree, about 1 km). No network call, so the ZIP never leaves the server for geocoding.
 * - City + state -> point from the US Census TIGERweb map service (keyless, public domain). Only the
 *   validated city name and the state FIPS code are sent.
 * Coordinates sent onward are rounded to 2 decimals, so they are never finer than the ZIP or city itself.
 *
 * PHI rule: every outgoing value passes assertNoPHI, EXCEPT a ZIP. A ZIP is itself one of the 18 Safe Harbor
 * identifier types, so the scrubber always flags it; it is the one location value docs/RESOURCES.md allows,
 * and it is accepted only through the strict 5-digit UsZip regex (nothing else can pass that regex).
 */
import { z } from "zod";
import zcta from "@content/referrals/zcta-centroids.json";
import { City, UsState, UsZip, assertNoPHI, type Location } from "@/lib/outbound";
import { UpstreamError, setRateLimit, upstreamFetch } from "@/server/core";

/* ---------------- input ---------------- */

/** Same validators as outbound.ts Location, but unknown keys are REJECTED instead of silently stripped. */
export const StrictLocation = z.union([
  z.strictObject({ zip: UsZip }),
  z.strictObject({ city: City, state: UsState }),
]);
export type StrictLocation = z.infer<typeof StrictLocation>;

/** Search radii offered in the UI (miles). Numbers only, never free text. */
export const RADIUS_MILES = [5, 10, 25, 50] as const;
export const RadiusMiles = z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(50)]);
export type RadiusMiles = z.infer<typeof RadiusMiles>;

/* ---------------- outbound params ---------------- */

/**
 * Build URLSearchParams where every value passes the PHI check, except keys listed in `zipKeys`, which must
 * match the strict 5-digit ZIP regex instead (see the PHI rule above). Throws before anything is fetched.
 */
export function safeParams(values: Record<string, string | number>, zipKeys: readonly string[] = []): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(values)) {
    const value = String(raw);
    if (zipKeys.includes(key)) UsZip.parse(value);
    else assertNoPHI(value);
    params.set(key, value);
  }
  return params;
}

/** Same check for values that go into a JSON body. `secretKeys` (server-side tokens) are not user input. */
export function assertSafeBody(
  body: Record<string, string | number>,
  opts: { zipKeys?: readonly string[]; secretKeys?: readonly string[] } = {},
): void {
  for (const [key, raw] of Object.entries(body)) {
    if (opts.secretKeys?.includes(key)) continue;
    const value = String(raw);
    if (opts.zipKeys?.includes(key)) UsZip.parse(value);
    else assertNoPHI(value);
  }
}

/* ---------------- states ---------------- */

/** USPS state/territory code -> 2-digit state FIPS code (Census). */
export type UsStateCode = z.infer<typeof UsState>;
export const STATE_FIPS: Record<UsStateCode, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13",
  HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25",
  MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36",
  NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48",
  UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56", AS: "60", GU: "66", MP: "69", PR: "72",
  VI: "78",
};

/* ---------------- geocoding ---------------- */

export interface GeoPoint {
  lat: number;
  lng: number;
  source: "census-zcta" | "census-place";
}

/** A ZIP or city that the Census tables do not know. Maps to a safe "upstream" error, never echoes input. */
export class LocationNotFound extends UpstreamError {
  constructor() {
    super("location", 404, "That ZIP code or city was not found. Try a nearby ZIP code.");
    this.name = "LocationNotFound";
  }
}

/** Round to 0.01 degree (about 1 km) so nothing finer than the ZIP/city ever leaves the server. */
export function coarse(n: number): number {
  return Math.round(n * 100) / 100;
}

let zipIndex: Map<string, readonly [number, number]> | null = null;
function zipTable(): Map<string, readonly [number, number]> {
  if (zipIndex) return zipIndex;
  const map = new Map<string, readonly [number, number]>();
  for (const rec of (zcta as { data: string }).data.split(";")) {
    const [zip, coords] = rec.split(":");
    if (!zip || !coords) continue;
    const [lat, lng] = coords.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) map.set(zip, [lat as number, lng as number]);
  }
  zipIndex = map;
  return map;
}

/** Coarse Census ZCTA point for a 5-digit ZIP, or null if the ZIP is not a ZCTA (e.g. PO-box-only ZIPs). */
export function zipCentroid(zip: string): GeoPoint | null {
  const z5 = UsZip.parse(zip);
  const hit = zipTable().get(z5);
  return hit ? { lat: coarse(hit[0]), lng: coarse(hit[1]), source: "census-zcta" } : null;
}

export const TIGERWEB_UPSTREAM = "census-tigerweb";
export const TIGERWEB_MAPSERVER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer";
const DAY = 24 * 60 * 60 * 1000;

/**
 * TIGERweb publishes no numeric limit; stay well below anything abusive: 1 request/s. Burst 4 because one cold
 * city lookup can take 3 calls (layer list, incorporated places, census-designated places); results are cached
 * for 30 days and the layer list for 7, so steady-state traffic is far lower.
 */
export function applyGeoRateLimit() {
  setRateLimit(TIGERWEB_UPSTREAM, 1, 4);
}
applyGeoRateLimit();

interface ArcLayerList { layers?: { id?: unknown; name?: unknown }[]; error?: unknown }
interface ArcQueryResult { features?: { attributes?: Record<string, unknown> }[]; error?: unknown }

/** Discover the place layers by name (layer ids change between TIGERweb vintages). Cached 7 days. */
async function placeLayerIds(): Promise<number[]> {
  const meta = await upstreamFetch<ArcLayerList>(`${TIGERWEB_MAPSERVER}?${safeParams({ f: "json" })}`, {
    upstream: TIGERWEB_UPSTREAM,
    ttlMs: 7 * DAY,
  });
  if (!meta || meta.error || !Array.isArray(meta.layers)) throw new UpstreamError(TIGERWEB_UPSTREAM, 502, "Place lookup unavailable");
  const ids: number[] = [];
  for (const pattern of [/^incorporated places$/i, /^census designated places$/i]) {
    const layer = meta.layers.find((l) => typeof l.name === "string" && pattern.test(l.name.trim()));
    if (layer && typeof layer.id === "number") ids.push(layer.id);
  }
  if (!ids.length) throw new UpstreamError(TIGERWEB_UPSTREAM, 502, "Place lookup unavailable");
  return ids;
}

function coord(value: unknown, max: number): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) return null; // Number("") is 0
  const n = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

/** Census place (incorporated place, then census-designated place) internal point for a city + state. */
export async function placeCentroid(city: string, state: string): Promise<GeoPoint> {
  const name = City.parse(city);
  const st = UsState.parse(state);
  assertNoPHI(name);
  // City allows only letters, spaces, . ' - ; apostrophes are doubled for the ArcGIS SQL literal.
  const where = `STATE='${STATE_FIPS[st]}' AND UPPER(BASENAME)='${name.toUpperCase().replace(/'/g, "''")}'`;
  for (const id of await placeLayerIds()) {
    const params = safeParams({ where, outFields: "BASENAME,STATE,INTPTLAT,INTPTLON", returnGeometry: "false", f: "json" });
    const res = await upstreamFetch<ArcQueryResult>(`${TIGERWEB_MAPSERVER}/${id}/query?${params}`, {
      upstream: TIGERWEB_UPSTREAM,
      ttlMs: 30 * DAY,
    });
    if (!res || res.error) throw new UpstreamError(TIGERWEB_UPSTREAM, 502, "Place lookup unavailable");
    const attrs = res.features?.[0]?.attributes;
    const lat = coord(attrs?.INTPTLAT, 90);
    const lng = coord(attrs?.INTPTLON, 180);
    if (lat !== null && lng !== null) return { lat: coarse(lat), lng: coarse(lng), source: "census-place" };
  }
  throw new LocationNotFound();
}

/** ZIP -> local table; city + state -> TIGERweb. Throws LocationNotFound or UpstreamError. */
export async function resolvePoint(location: Location): Promise<GeoPoint> {
  if ("zip" in location) {
    const point = zipCentroid(location.zip);
    if (!point) throw new LocationNotFound();
    return point;
  }
  return placeCentroid(location.city, location.state);
}

export const MILES_TO_METERS = 1609.344;

/* ---------------- response normalisation ---------------- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Strip HTML tags, decode the common entities, drop control characters, collapse whitespace, cap length. */
export function cleanText(value: unknown, max = 160): string {
  if (value === null || value === undefined) return "";
  let s = String(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? " ");
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (/^\[?no data\]?$/i.test(s) || /^(null|undefined|n\/a)$/i.test(s)) return "";
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** "GAITHERSBURG" -> "Gaithersburg", "O'FALLON" -> "O'Fallon", "WINSTON-SALEM" -> "Winston-Salem". */
export function titleCase(value: unknown, max = 80): string {
  const s = cleanText(value, max).toLowerCase();
  return s.replace(/(^|[\s'\-./(])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** US phone -> "301-555-0123" (keeps an extension); null when there is no usable number. */
export function formatPhone(value: unknown): string | null {
  const s = cleanText(value, 40);
  if (!s) return null;
  const ext = /(?:x|ext\.?|extension)\s*(\d{1,6})\s*$/i.exec(s)?.[1];
  const main = ext ? s.slice(0, s.search(/(?:x|ext\.?|extension)\s*\d{1,6}\s*$/i)) : s;
  let digits = main.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return ext ? `${formatted} ext. ${ext}` : formatted;
}

export function zip5(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

/** Normalise a listed website to an absolute http(s) URL, or null. */
export function safeWebsite(value: unknown): string | null {
  const s = cleanText(value, 300);
  if (!s || /\s/.test(s)) return null;
  const candidate = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function roundMiles(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
}
