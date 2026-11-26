import "server-only";
/**
 * Shared helpers for the referral integrations (NPPES, HRSA, FindTreatment.gov). Guardrails G5/G17.
 *
 * Location rule: a referral search may carry ONLY a 5-digit ZIP or a city + state (src/lib/outbound.ts).
 * - ZIP -> coarse point from a static Census ZCTA table (content/referrals/zcta-centroids.json, rounded to
 *   0.01 degree, about 1 km). No network call, so the ZIP never leaves the server for geocoding.
 * - City + state -> the city must be a REAL place in that state (content/referrals/us-places.json, see
 *   ./places.ts). The typed value is replaced by the canonical gazetteer name, and the coarse point comes from the
 *   same file. No network call: a city is never sent anywhere for geocoding, and letters-only clinical text
 *   ("Opioid Withdrawal") can never pass as a city.
 * Coordinates sent onward are rounded to 2 decimals, so they are never finer than the ZIP or city itself.
 *
 * PHI rule: every outgoing value passes assertNoPHI, EXCEPT (a) a ZIP, which is itself a Safe Harbor identifier
 * type that the scrubber always flags; it is the one location value docs/RESOURCES.md allows and passes only the
 * strict 5-digit UsZip regex; and (b) a canonical gazetteer city name, which is curated data from our own file
 * (the scrubber flags real cities such as Charlotte or Jackson as first names).
 */
import { z } from "zod";
import zcta from "@content/referrals/zcta-centroids.json";
import { UsState, UsZip, assertNoPHI, type Location } from "@/lib/outbound";
import { UpstreamError } from "@/server/core";
import { findPlace, isCanonicalPlaceName } from "./places";
import { htmlToPlainText } from "./plain-text";

/* ---------------- input ---------------- */

/**
 * City as typed: letters (accents allowed), spaces, periods, apostrophes, hyphens; 2-40 characters. Shape only;
 * StrictLocation then requires a gazetteer match for the state and swaps in the canonical name.
 */
export const CityInput = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[\p{L}][\p{L}\p{M} .'\u2019-]*$/u, "city name");

/**
 * Same shape as outbound.ts Location, but unknown keys are REJECTED instead of silently stripped, and a city must
 * be a real place in that state. Output carries the canonical gazetteer spelling, never the typed text.
 */
export const StrictLocation = z.union([
  z.strictObject({ zip: UsZip }),
  z.strictObject({ city: CityInput, state: UsState }).transform((loc, ctx) => {
    const place = findPlace(loc.city, loc.state);
    if (!place) {
      ctx.addIssue({ code: "custom", message: "not a recognised city in that state; try a ZIP code", path: ["city"] });
      return z.NEVER;
    }
    return { city: place.name, state: loc.state };
  }),
]);
export type StrictLocation = z.output<typeof StrictLocation>;

/** Search radii offered in the UI (miles). Numbers only, never free text. */
export const RADIUS_MILES = [5, 10, 25, 50] as const;
export const RadiusMiles = z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(50)]);
export type RadiusMiles = z.infer<typeof RadiusMiles>;

/* ---------------- outbound params ---------------- */

/**
 * Build URLSearchParams where every value passes the PHI check, except keys listed in `zipKeys`, which must
 * match the strict 5-digit ZIP regex instead, and keys in `placeKeys`, which must be a canonical gazetteer city
 * name (see the PHI rule above). Throws before anything is fetched.
 */
export function safeParams(
  values: Record<string, string | number>,
  zipKeys: readonly string[] = [],
  placeKeys: readonly string[] = [],
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(values)) {
    const value = String(raw);
    if (zipKeys.includes(key)) UsZip.parse(value);
    else if (placeKeys.includes(key)) assertCanonicalPlace(value);
    else assertNoPHI(value);
    params.set(key, value);
  }
  return params;
}

/** A city about to leave the server must be a canonical gazetteer name (never text the clinician typed). */
export function assertCanonicalPlace(value: string): void {
  if (!isCanonicalPlaceName(value)) throw new z.ZodError([{ code: "custom", message: "not a canonical place name", path: ["city"], input: undefined }]);
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
  source: "census-zcta" | "place-gazetteer";
}

/** A ZIP that the Census tables do not know. Maps to a safe "upstream" error, never echoes input. */
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

/** Coarse point for a city + state from the local gazetteer (no network). Throws LocationNotFound if unknown. */
export function placeCentroid(city: string, state: string): GeoPoint {
  const place = findPlace(city, UsState.parse(state));
  if (!place) throw new LocationNotFound();
  return { lat: coarse(place.lat), lng: coarse(place.lng), source: "place-gazetteer" };
}

/** ZIP -> Census ZCTA table; city + state -> gazetteer. Both local. Throws LocationNotFound for an unknown ZIP. */
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

/** Upstream text -> plain text (tags stripped, entities decoded, markup neutralised), no "no data" markers, capped. */
export function cleanText(value: unknown, max = 160): string {
  if (value === null || value === undefined) return "";
  const s = htmlToPlainText(String(value));
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
