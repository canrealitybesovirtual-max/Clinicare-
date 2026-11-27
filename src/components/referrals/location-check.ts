/**
 * Validates the referral search location in the browser before anything is sent (G5, G17, docs/RESOURCES.md).
 * Only two shapes can leave the device: a 5-digit ZIP, or a city + state that passes src/lib/outbound.ts.
 * A city is checked with the PHI scrubber first, so text that looks like a name or other identifier is never sent.
 * (Some real cities are also first names, e.g. Austin or Charlotte; the scrubber removes them too, and the UI
 * suggests searching by ZIP instead.) The server then accepts a city only if it is a real place in that state.
 */
import { City, Location, UsState, UsZip } from "@/lib/outbound";
import { scrubPHI } from "@/lib/phi-scrubber";

export type LocationMode = "zip" | "city";

export type LocationCheck =
  | { ok: true; location: Location }
  | { ok: false; field: "zip" | "city" | "state"; message: string; identifier?: boolean };

const PLACEHOLDER = /\[[A-Z][A-Z_0-9]*\]/;

export const IDENTIFIER_MESSAGE =
  "That looked like it might be a name or other identifier, so it was removed and not sent. Some city names are also first names (for example Austin or Charlotte): search by ZIP code instead.";

export function checkLocation(mode: LocationMode, input: { zip: string; city: string; state: string }): LocationCheck {
  if (mode === "zip") {
    const zip = UsZip.safeParse(input.zip);
    return zip.success ? { ok: true, location: { zip: zip.data } } : { ok: false, field: "zip", message: "Enter a 5-digit US ZIP code." };
  }
  const raw = input.city.trim();
  if (!raw) return { ok: false, field: "city", message: "Enter a city, or search by ZIP code instead." };
  if (PLACEHOLDER.test(raw) || scrubPHI(raw).findings.length > 0) {
    return { ok: false, field: "city", message: IDENTIFIER_MESSAGE, identifier: true };
  }
  const city = City.safeParse(raw);
  if (!city.success) {
    return {
      ok: false,
      field: "city",
      message: "Use the USPS spelling with letters only, no accents or numbers (for example St. Louis or Canon City), or enter a ZIP code.",
    };
  }
  const state = UsState.safeParse(input.state);
  if (!state.success) return { ok: false, field: "state", message: "Choose the state or territory." };
  const loc = Location.safeParse({ city: city.data, state: state.data });
  return loc.success ? { ok: true, location: loc.data } : { ok: false, field: "city", message: "Enter a ZIP code instead." };
}
