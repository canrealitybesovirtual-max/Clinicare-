/**
 * Helpers over content/crisis-lines.json. Pure, no I/O. The country choice is crisis-line
 * routing only (memory-only session field), never client data.
 */
import { crisisLines } from "@/lib/content";

export type CrisisCountry = (typeof crisisLines.countries)[number];

export const OTHER_COUNTRY = "OTHER";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  AU: "Australia",
  NZ: "New Zealand",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
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
