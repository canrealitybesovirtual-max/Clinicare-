/**
 * Client-mode text filter (G3) for text that comes from OUTSIDE the app's own client wording (MedlinePlus titles
 * and summaries, referral descriptions). Builds on src/lib/client-safe.ts and adds diagnosis words that pattern
 * does not list, in English and Spanish (MedlinePlus results can be in Spanish). Conservative on purpose: when in
 * doubt, the text is not shown and a plain label is used instead. Pure; isomorphic.
 */
import { isClientSafeText } from "@/lib/client-safe";

const EXTRA_CLINICAL_RE = new RegExp(
  [
    // English diagnosis words not in CLINICAL_TERMS_RE
    "bipolar",
    "schizo",
    "psychos[ie]s",
    "psychotic",
    "\\bOCD\\b",
    "\\bADHD\\b",
    "obsessive",
    "compulsive",
    "insomnia",
    "\\bAUD\\b",
    "\\bSUD\\b",
    // Spanish diagnosis and scoring words
    "trastorno",
    "ansiedad",
    "depresi",
    "p[aá]nico",
    "fobia",
    "agorafob",
    "diagn[oó]stic",
    "estr[eé]s postraum",
    "\\bTEPT\\b",
    "\\bTOC\\b",
    "esquizofren",
    "insomnio",
    "puntuaci",
    "gravedad",
  ].join("|"),
  "i",
);

/** True when text names no diagnosis, code or score, in English or Spanish. */
export function isPlainSafe(text: string): boolean {
  return isClientSafeText(text) && !EXTRA_CLINICAL_RE.test(text);
}

/** First candidate that is client-safe, or null. */
export function firstPlainSafe(candidates: readonly (string | undefined | null)[]): string | null {
  for (const c of candidates) if (c && c.trim() && isPlainSafe(c)) return c.trim();
  return null;
}
