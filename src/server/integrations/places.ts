import "server-only";
/**
 * US place-name gazetteer (content/referrals/us-places.json): USPS city names per state/territory with a coarse
 * centre point. Guardrails G5/G17.
 *
 * Why: a city is the only location value that looks like free text. A letters-only validator lets typed clinical
 * or substance-use statements ("Hears Voices At Night", "Opioid Withdrawal") through, because they contain no
 * identifier for the PHI scrubber to find. So a referral search city must be a REAL place in the chosen state:
 * the input is matched to this allowlist and replaced by the canonical name from the file. Nothing the clinician
 * typed is ever sent; and because the point comes from this file, a city is never sent anywhere for geocoding.
 *
 * Matching ignores case, accents (Mayagüez = Mayaguez, Cañon City = Canon City), periods, apostrophes, hyphens and
 * spaces (O'Fallon = O Fallon, Winston-Salem = Winston Salem), and treats Saint/St, Sainte/Ste, Fort/Ft and
 * Mount/Mt as the same word. The key is unique per state across the whole file (checked when it was built).
 */
import places from "@content/referrals/us-places.json";
import type { z } from "zod";
import type { UsState } from "@/lib/outbound";

type UsStateCode = z.infer<typeof UsState>;

export interface Place {
  name: string; // canonical USPS spelling, ASCII only
  state: UsStateCode;
  lat: number; // rounded to 0.01 degree
  lng: number;
}

export const PLACES_ATTRIBUTION = (places as { attribution: string }).attribution;

const ALIASES: Record<string, string> = { saint: "st", sainte: "ste", fort: "ft", mount: "mt" };

/** Normalised lookup key, or null when the text cannot be a US place name. */
export function placeKey(name: string): string | null {
  const folded = name.replace(/[\u2018\u2019`]/g, "'").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  if (!/^[a-z][a-z .'-]*$/.test(folded)) return null;
  const words = folded.replace(/'/g, "").replace(/[.-]/g, " ").split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => ALIASES[w] ?? w).join("") : null;
}

let index: Map<string, Map<string, Place>> | null = null;
let canonicalNames: Set<string> | null = null;

function table(): Map<string, Map<string, Place>> {
  if (index) return index;
  const byState = new Map<string, Map<string, Place>>();
  const names = new Set<string>();
  for (const [state, data] of Object.entries((places as { states: Record<string, string> }).states)) {
    const m = new Map<string, Place>();
    for (const rec of data.split(";")) {
      const sep = rec.lastIndexOf(":");
      if (sep <= 0) continue;
      const name = rec.slice(0, sep);
      const [lat, lng] = rec.slice(sep + 1).split(",").map(Number);
      const key = placeKey(name);
      if (!key || !Number.isFinite(lat) || !Number.isFinite(lng) || !/^[A-Za-z][A-Za-z '-]*$/.test(name)) continue;
      m.set(key, { name, state: state as UsStateCode, lat: lat as number, lng: lng as number });
      names.add(name);
    }
    byState.set(state, m);
  }
  index = byState;
  canonicalNames = names;
  return byState;
}

/** The gazetteer place for a city typed in a given state, or null if there is no such place. */
export function findPlace(city: string, state: string): Place | null {
  const key = placeKey(city.trim());
  if (!key) return null;
  return table().get(state)?.get(key) ?? null;
}

/** True only for a canonical name exactly as stored in the gazetteer (used to exempt it from the name scrubber). */
export function isCanonicalPlaceName(name: string): boolean {
  table();
  return canonicalNames!.has(name);
}

/** Number of places loaded (for tests and the content check). */
export function placeCount(): number {
  let n = 0;
  for (const m of table().values()) n += m.size;
  return n;
}
