/**
 * Outbound allowlist (G5, G17, docs/RESOURCES.md). Isomorphic: used by the browser before calling our
 * own /api routes AND by the server before calling any third-party API. The ONLY values that may leave
 * the app are: standard codes, curated keywords, curated drug names, a US ZIP / city + state.
 * Typed clinical free text can never pass these validators.
 */
import { z } from "zod";
import { containsPHI } from "./phi-scrubber";

/** ICD-10-CM code, e.g. F41.1, F43.10, F32.A */
export const Icd10CmCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-TV-Z][0-9][0-9AB](?:\.[0-9A-TV-Z]{1,4})?$/, "ICD-10-CM code");

/** ICD-11 MMS code, e.g. 6B00, 6A70, 6B40.0 */
export const Icd11Code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-HJ-NP-Z]{2}[0-9A-HJ-NP-Z]{2}(?:\.[0-9A-HJ-NP-Z]{1,2})?$/, "ICD-11 code");

export const UsZip = z.string().trim().regex(/^\d{5}$/, "5-digit ZIP");

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI",
  "MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT",
  "VT","VA","VI","WA","WV","WI","WY","GU","AS","MP",
] as const;
export const UsState = z.enum(US_STATES);

/** City names: letters, spaces, periods, apostrophes, hyphens only; 2-40 chars. Must be paired with a state. */
export const City = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z][A-Za-z .'-]*$/, "city name");

/** A location is a ZIP, or a city + state. Never a street address. */
export const Location = z.union([
  z.object({ zip: UsZip }),
  z.object({ city: City, state: UsState }),
]);
export type Location = z.infer<typeof Location>;

/** Value must be one of a curated list (keywords, drug names, condition terms). Case-insensitive. */
export function curated<T extends string>(allowed: readonly T[]) {
  const set = new Map(allowed.map((a) => [a.toLowerCase(), a] as const));
  return z
    .string()
    .trim()
    .transform((s, ctx) => {
      const hit = set.get(s.toLowerCase());
      if (!hit) {
        ctx.addIssue({ code: "custom", message: "not in curated list" });
        return z.NEVER;
      }
      return hit;
    });
}

/** Last line of defence: reject anything the PHI scrubber flags, whatever validator let it through. */
export function assertNoPHI(...values: (string | undefined | null)[]): void {
  for (const v of values) if (v && containsPHI(v)) throw new OutboundRejected("identifier detected");
}

export class OutboundRejected extends Error {
  constructor(reason: string) {
    super(`Outbound value rejected: ${reason}`);
    this.name = "OutboundRejected";
  }
}
