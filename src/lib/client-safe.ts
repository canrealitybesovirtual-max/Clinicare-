/**
 * Client-mode text limits (G3): anything a client sees or receives (client screens, client handout
 * PDFs) must not name a diagnosis, show a code or mention scoring. Source titles often name
 * conditions ("... generalized anxiety disorder ..."), so they pass through this filter first.
 * Pure helpers, shared by the client screen and src/lib/pdf.ts so both apply the same rule.
 */
import type { Source } from "./schemas";

/**
 * Words and codes that must not appear in client-facing text: diagnosis vocabulary, ICD-10-CM
 * F-codes (F41.1), ICD-11 mental-health codes (6A70, 6B00), DSM/ICD references and scoring terms.
 */
export const CLINICAL_TERMS_RE =
  /disorder|anxiety|depress|panic|ptsd|post-?traumatic|phobia|agoraphob|diagnos|\bdsm\b|\bicd\b|\bF\d{2}(?:\.\d{0,3})?\b|\b6[A-E]\d{2}\b|\bscore|severity/i;

export function isClientSafeText(text: string): boolean {
  return !CLINICAL_TERMS_RE.test(text);
}

/** Sources whose title and publisher are both safe to show a client. */
export function clientSafeSources(sources: readonly Source[]): Source[] {
  return sources.filter((s) => isClientSafeText(s.title) && isClientSafeText(s.publisher));
}

/**
 * One credit line per source for client handouts: the full title when it is client-safe, otherwise
 * only the publisher (when that is safe), otherwise nothing. Duplicates are dropped.
 */
export function clientSourceCredits(sources: readonly Source[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    const year = s.year ? `, ${s.year}` : "";
    let credit: string | null = null;
    if (isClientSafeText(s.title) && isClientSafeText(s.publisher)) credit = `${s.title} (${s.publisher}${year})`;
    else if (isClientSafeText(s.publisher)) credit = s.publisher;
    if (credit && !out.includes(credit)) out.push(credit);
  }
  return out;
}
