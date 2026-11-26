import "server-only";
/**
 * Server-side tightening of the src/lib/outbound.ts validators (G5, G17).
 *
 * outbound.ts upper-/lower-cases BEFORE its ASCII regex, so Unicode case mapping can silently turn one value into
 * another valid one ("ſ41.1" -> "S41.1", the Kelvin sign "K" -> "k"). Only ASCII would leave the server, but it
 * might not be the value the clinician meant. These wrappers refuse such input instead of rewriting it.
 */
import { z } from "zod";
import { Icd10CmCode, Icd11Code } from "@/lib/outbound";

/** Printable ASCII only, checked on the raw value before any case mapping. */
export const AsciiText = z.string().max(200).regex(/^[\x20-\x7E]*$/, "ASCII only");

/** ICD-10-CM code, refusing non-ASCII look-alikes before outbound.ts upper-cases it. */
export const StrictIcd10CmCode = AsciiText.pipe(Icd10CmCode);
/** ICD-11 MMS code, refusing non-ASCII look-alikes before outbound.ts upper-cases it. */
export const StrictIcd11Code = AsciiText.pipe(Icd11Code);

/**
 * True when `input` equals `canonical` except for letter case, where an ASCII character may only match an ASCII
 * character and a non-ASCII character only a non-ASCII one. So "PÁNICO" matches "pánico", but the long s (ſ) can
 * never stand in for "s" and the Kelvin sign can never stand in for "k".
 */
export function sameExceptCase(input: string, canonical: string): boolean {
  if (input.length !== canonical.length) return false;
  for (let i = 0; i < input.length; i++) {
    const a = input[i]!;
    const b = canonical[i]!;
    if (a === b) continue;
    if ((a.charCodeAt(0) < 128) !== (b.charCodeAt(0) < 128)) return false;
    const la = a.toLowerCase();
    if (la.length !== 1 || la !== b.toLowerCase()) return false;
  }
  return true;
}

/**
 * Like outbound.ts curated(): the value must be one of a curated list and resolves to its canonical spelling.
 * Case-insensitive, but no Unicode case mapping may turn a non-ASCII character into an ASCII one (sameExceptCase).
 */
export function strictCurated<T extends string>(allowed: readonly T[]) {
  const byLower = new Map<string, T>();
  for (const a of allowed) if (!byLower.has(a.toLowerCase())) byLower.set(a.toLowerCase(), a);
  return z
    .string()
    .max(200)
    .trim()
    .transform((s, ctx) => {
      const hit = byLower.get(s.toLowerCase());
      if (!hit || !sameExceptCase(s, hit)) {
        ctx.addIssue({ code: "custom", message: "not in curated list" });
        return z.NEVER;
      }
      return hit;
    });
}
