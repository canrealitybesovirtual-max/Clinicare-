import "server-only";
/**
 * NLM Clinical Table Search Service: ICD-10-CM (https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search).
 * Docs: https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html  FAQ: https://clinicaltables.nlm.nih.gov/faq.html
 * - Outbound: an ICD-10-CM code, OR a curated term (condition names, differential labels and their ICD-10-CM
 *   titles from src/lib/content.ts, plus content/topics.json English keywords). Never typed text (G5, G17).
 * - Terms: free, provided "as is". FAQ advises <= 25 requests/s; we allow 5/s (burst 10) and cache 7 days
 *   (ICD-10-CM changes once a year, on October 1).
 */
import { z } from "zod";
import { conditions } from "@/lib/content";
import { Icd10CmCode, assertNoPHI, curated } from "@/lib/outbound";
import { UpstreamError, setRateLimit, upstreamFetch } from "@/server/core";
import { HEALTH_TOPICS } from "./medlineplus-topics";
import { clip, htmlToPlainText } from "./plain-text";

export const ICD10CM_UPSTREAM = "nlm-icd10cm";
export const ICD10CM_ENDPOINT = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search";
export const ICD10CM_ATTRIBUTION = "ICD-10-CM codes: NLM Clinical Table Search Service (provided as is)";
export const ICD10CM_SOURCE = "https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html";
export const ICD10CM_MAX_LIST = 20;
export const ICD10CM_DEFAULT_LIST = 10;
export const ICD10CM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function configureIcd10cmRateLimit() {
  setRateLimit(ICD10CM_UPSTREAM, 5, 10);
}
configureIcd10cmRateLimit();

/**
 * ICD-10-CM codes for substance-related disorders (F10-F19) and alcohol/drug counselling (Z71.4x, Z71.5x).
 * Results carrying these codes are flagged so the UI shows the 42 CFR Part 2 banner (G6).
 */
export function isSudIcd10cm(code: string): boolean {
  return /^F1[0-9]/i.test(code) || /^Z71\.[45]/i.test(code);
}

/* ---------------- curated terms ---------------- */
const ICD_TITLE_RE = /\(ICD-10-CM title:\s*([^)]+)\)/i;
const stripParens = (s: string) => s.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

/**
 * accepted value (lower-case) -> the term actually searched.
 * A differential like "Social anxiety disorder (ICD-10-CM title: Social phobia, unspecified)" is searched by its
 * ICD-10-CM title, because the NLM service matches ICD-10-CM wording.
 */
function buildTermMap(): Map<string, { accepted: string; searchFor: string }> {
  const map = new Map<string, { accepted: string; searchFor: string }>();
  const add = (accepted: string, searchFor: string) => {
    const a = accepted.trim();
    const s = searchFor.trim();
    if (a.length < 3 || a.length > 120 || s.length < 3 || s.length > 120) return;
    if (!map.has(a.toLowerCase())) map.set(a.toLowerCase(), { accepted: a, searchFor: s });
  };
  const addLabel = (label: string) => {
    if (/no separate ICD-10-CM code/i.test(label)) return;
    const title = ICD_TITLE_RE.exec(label)?.[1]?.trim();
    const cleaned = stripParens(label);
    add(label, title ?? cleaned);
    add(cleaned, title ?? cleaned);
    if (title) add(title, title);
  };
  for (const c of conditions) {
    addLabel(c.name);
    for (const code of c.icd10cm) add(code.label, code.label);
    for (const d of c.differentials) addLabel(d.label);
  }
  for (const t of HEALTH_TOPICS) add(t.en, t.en);
  return map;
}

const TERM_MAP = buildTermMap();
/** Every value a caller may send as `term` (original casing, sorted). */
export const ICD10CM_TERMS: readonly string[] = [...TERM_MAP.values()].map((v) => v.accepted).sort((a, b) => a.localeCompare(b));

export const Icd10cmTerm = curated(ICD10CM_TERMS).transform((t) => TERM_MAP.get(t.toLowerCase())!.searchFor);
const MaxList = z.number().int().min(1).max(ICD10CM_MAX_LIST).default(ICD10CM_DEFAULT_LIST);

export const Icd10cmInput = z.union([
  z.strictObject({ code: Icd10CmCode, max: MaxList }),
  z.strictObject({ term: Icd10cmTerm, max: MaxList }),
]);
export type Icd10cmInput = z.input<typeof Icd10cmInput>;

export interface Icd10cmItem {
  code: string;
  name: string;
}
export interface Icd10cmResult {
  query: { kind: "code" | "term"; value: string };
  total: number; // matches reported by NLM (may exceed items.length)
  items: Icd10cmItem[];
  sud: boolean; // any SUD code involved => show the Part 2 banner
}

const RawResponse = z.tuple([z.number().int().min(0), z.array(z.string()), z.unknown(), z.array(z.array(z.unknown()))], z.unknown());

export function icd10cmUrl(terms: string, max: number): string {
  const params = new URLSearchParams({ sf: "code,name", df: "code,name", terms, maxList: String(max) });
  return `${ICD10CM_ENDPOINT}?${params}`;
}

/** Look up ICD-10-CM codes by code prefix or curated term. Throws ZodError/OutboundRejected before any fetch. */
export async function searchIcd10cm(raw: Icd10cmInput): Promise<Icd10cmResult> {
  const input = Icd10cmInput.parse(raw);
  const kind = "code" in input ? "code" : "term";
  const value = "code" in input ? input.code : input.term;
  assertNoPHI(value);

  const json = await upstreamFetch<unknown>(icd10cmUrl(value, input.max), { upstream: ICD10CM_UPSTREAM, ttlMs: ICD10CM_TTL_MS });
  const parsed = RawResponse.safeParse(json);
  if (!parsed.success) throw new UpstreamError(ICD10CM_UPSTREAM, 502, "Unexpected response from upstream service");
  const [total, , , display] = parsed.data;

  const items: Icd10cmItem[] = [];
  const seen = new Set<string>();
  for (const row of display) {
    if (items.length >= input.max) break;
    const code = Icd10CmCode.safeParse(typeof row[0] === "string" ? row[0] : "");
    const name = typeof row[1] === "string" ? clip(htmlToPlainText(row[1]), 200) : "";
    if (!code.success || !name || seen.has(code.data)) continue;
    seen.add(code.data);
    items.push({ code: code.data, name });
  }
  return {
    query: { kind, value },
    total,
    items,
    sud: (kind === "code" && isSudIcd10cm(value)) || items.some((i) => isSudIcd10cm(i.code)),
  };
}
