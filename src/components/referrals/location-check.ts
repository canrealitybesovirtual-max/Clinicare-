/**
 * Validates the referral search location in the browser before anything is sent (G5, G17, docs/RESOURCES.md).
 * Only two shapes can leave the device: a 5-digit ZIP, or a city + state that passes src/lib/outbound.ts.
 * A city is checked with the PHI scrubber first, so text that looks like a name or other identifier is never sent.
 *
 * Cities that are also first names (Austin, Charlotte, Madison, Jackson) are the one exception: when the WHOLE
 * field is exactly a city name in the bundled USPS gazetteer (content/referrals/us-places.json) for the chosen
 * state, it is allowed through, and the canonical gazetteer spelling is what gets sent, never the typed text.
 * The gazetteer's names (src/lib/generated/us-place-names.json, generated from that file without its centre
 * points) load on demand, only when the scrubber flags a city. The server checks the city against the full file
 * again (src/server/integrations/places.ts).
 */
import { City, Location, UsState, UsZip } from "@/lib/outbound";
import { scrubPHI } from "@/lib/phi-scrubber";

export type LocationMode = "zip" | "city";

export type LocationCheck =
  | { ok: true; location: Location }
  | { ok: false; field: "zip" | "city" | "state"; message: string; identifier?: boolean };

const PLACEHOLDER = /\[[A-Z][A-Z_0-9]*\]/;

export const IDENTIFIER_MESSAGE =
  "That looked like it might be a name or other identifier, so it was removed and not sent. If it is a city, type just the city name as the US Postal Service spells it, or search by ZIP code.";

/* ------------------------------------------------------------------ gazetteer (exact city names) */

/** Lower-cased, space-normalised city name -> canonical USPS spelling, per state and across all states. */
export interface PlaceIndex {
  byState: ReadonlyMap<string, ReadonlyMap<string, string>>;
  all: ReadonlyMap<string, string>;
}

const placeKey = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Builds the index from a gazetteer `states` field: "Name;Name" per state (the generated names-only copy) or
 * "Name:lat,lng;Name:lat,lng" (content/referrals/us-places.json). Names only either way.
 */
export function buildPlaceIndex(states: Readonly<Record<string, string>>): PlaceIndex {
  const byState = new Map<string, Map<string, string>>();
  const all = new Map<string, string>();
  for (const [state, data] of Object.entries(states)) {
    const names = new Map<string, string>();
    for (const rec of data.split(";")) {
      const cut = rec.lastIndexOf(":");
      const name = cut < 0 ? rec : rec.slice(0, cut);
      if (!City.safeParse(name).success) continue;
      names.set(placeKey(name), name);
      all.set(placeKey(name), name);
    }
    byState.set(state, names);
  }
  return { byState, all };
}

let placeIndex: Promise<PlaceIndex> | null = null;

/** Loads the gazetteer once, as its own chunk; a failed load (offline) is retried on the next call. */
export function loadPlaceIndex(): Promise<PlaceIndex> {
  placeIndex ??= import("@/lib/generated/us-place-names.json").then(
    (m) => buildPlaceIndex((m.default as { states: Record<string, string> }).states),
    (e: unknown) => {
      placeIndex = null;
      throw e;
    },
  );
  return placeIndex;
}

/**
 * The canonical gazetteer name when the whole value is exactly a city name (case and spacing aside), in `state`
 * when given or in any state otherwise; null for anything else ("Austin Smith", "Charlotte 555-0100", "[NAME]").
 */
export function gazetteerCity(raw: string, index: PlaceIndex, state?: string): string | null {
  const key = placeKey(raw);
  const names = state === undefined ? index.all : index.byState.get(state);
  return names?.get(key) ?? null;
}

/* ------------------------------------------------------------------ check */

/**
 * `places` is the loaded gazetteer, when the caller has it. Without it a city the scrubber flags is refused, as
 * before; with it, an exact gazetteer city in the chosen state is accepted under its canonical spelling.
 */
export function checkLocation(
  mode: LocationMode,
  input: { zip: string; city: string; state: string },
  places: PlaceIndex | null = null,
): LocationCheck {
  if (mode === "zip") {
    const zip = UsZip.safeParse(input.zip);
    return zip.success ? { ok: true, location: { zip: zip.data } } : { ok: false, field: "zip", message: "Enter a 5-digit US ZIP code." };
  }
  const raw = input.city.trim();
  if (!raw) return { ok: false, field: "city", message: "Enter a city, or search by ZIP code instead." };
  const state = UsState.safeParse(input.state);
  if (PLACEHOLDER.test(raw) || scrubPHI(raw).findings.length > 0) {
    const known = places ? gazetteerCity(raw, places) : null;
    if (!known) return { ok: false, field: "city", message: IDENTIFIER_MESSAGE, identifier: true };
    if (!state.success) return { ok: false, field: "state", message: "Choose the state or territory." };
    const inState = gazetteerCity(raw, places!, state.data);
    if (!inState) {
      return { ok: false, field: "city", message: `${known} is not listed as a city in that state. Check the state, or search by ZIP code.` };
    }
    return { ok: true, location: { city: inState, state: state.data } };
  }
  const city = City.safeParse(raw);
  if (!city.success) {
    return {
      ok: false,
      field: "city",
      message: "Use the USPS spelling with letters only, no accents or numbers (for example St. Louis or Canon City), or enter a ZIP code.",
    };
  }
  if (!state.success) return { ok: false, field: "state", message: "Choose the state or territory." };
  const loc = Location.safeParse({ city: city.data, state: state.data });
  return loc.success ? { ok: true, location: loc.data } : { ok: false, field: "city", message: "Enter a ZIP code instead." };
}
