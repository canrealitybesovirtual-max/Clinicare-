/**
 * Crisis lines from content/crisis-lines.json, plus pure helpers. The JSON is imported and validated here on its
 * own, so the crisis button (on every screen) does not pull the whole content library into the browser bundle.
 * The country choice is crisis-line routing only (memory-only session field), never client data.
 */
import crisisJson from "@content/crisis-lines.json";
import { CrisisLinesSchema } from "@/lib/schemas";
import type { Lang } from "@/lib/i18n/core";
import { COUNTRY_NAMES } from "@/lib/i18n/shell";

export const crisisLines = CrisisLinesSchema.parse(crisisJson);

export type CrisisCountry = (typeof crisisLines.countries)[number];

export const OTHER_COUNTRY = "OTHER";

/** False while any entry still waits for a person to check it on the official site (G9/G10). */
export const crisisLinesVerified =
  crisisLines.international.lastVerified !== null && crisisLines.countries.every((c) => c.lastVerified !== null);

export function countryName(code: string, lang: Lang = "en"): string {
  const name = COUNTRY_NAMES[code as keyof typeof COUNTRY_NAMES];
  return name ? name[lang] : code;
}

export function findCountry(code: string): CrisisCountry | undefined {
  return crisisLines.countries.find((c) => c.country === code);
}

/** "112 / 999" -> ["112", "999"]. */
export function emergencyNumbers(c: CrisisCountry): string[] {
  return c.emergency
    .split("/")
    .map((s) => s.replace(/[^\d]/g, ""))
    .filter(Boolean);
}

/** First dialable number in the crisis text: "Samaritans 116 123" -> "116123", "9-8-8 ..." -> "988". */
export function crisisNumber(c: CrisisCountry): string | null {
  const m = c.crisis.match(/\d[\d\s-]*\d|\d/);
  return m ? m[0].replace(/[^\d]/g, "") : null;
}

/** Whether the listed line says it accepts text messages. */
export function crisisCanText(c: CrisisCountry): boolean {
  return /\btext\b/i.test(c.crisis);
}

/** Human-readable domain for a URL ("https://www.samaritans.org/ireland" -> "samaritans.org/ireland"). */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
