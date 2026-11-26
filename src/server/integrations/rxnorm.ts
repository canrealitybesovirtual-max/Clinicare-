import "server-only";
/**
 * RxNorm / RxClass via the NLM RxNav REST API (https://rxnav.nlm.nih.gov/REST). Docs:
 * https://lhncbc.nlm.nih.gov/RxNav/APIs/index.html  Terms: https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html
 * - Outbound: ONLY a curated drug name from content/medications.json (G5, G17), plus the RxCUI that RxNav itself
 *   returned (digits only). Never typed text.
 * - Terms: free, no key; no more than 20 requests/second per IP. We allow 8/s with a burst of 8 (<= 16 in any second)
 *   and cache 7 days (RxNorm is released monthly with weekly updates). One lookup = 4 requests.
 * - Classes: ATC (WHO ATC via RxNorm) and DailyMed EPC/MOA only. SNOMED CT and other licence-restricted sources
 *   are not requested.
 * - Normalised output never includes product strengths or dose forms (no dosing content): brand names only.
 * - Clinician mode only. Education for referral conversations, not prescribing.
 */
import { z } from "zod";
import { assertNoPHI } from "@/lib/outbound";
import {
  MedicationDrug,
  dailyMedSearchUrl,
  getMedication,
  isSudTreatment,
  medicationsFile,
  rxNavConceptUrl,
  type Medication,
} from "@/lib/schemas-medications";
import { UpstreamError, assertSudLookupAllowed, cacheSet, setRateLimit, upstreamFetch } from "@/server/core";
import { clip, htmlToPlainText } from "./plain-text";

export const RXNORM_UPSTREAM = "nlm-rxnav";
export const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";
export const RXNORM_ATTRIBUTION =
  "This product uses publicly available data courtesy of the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.";
export const RXNORM_SOURCE = "https://lhncbc.nlm.nih.gov/RxNav/";
export const RXNORM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RXNORM_MAX_BRANDS = 20;
export const RXNORM_MAX_CLASSES = 12;

export function configureRxNormRateLimit() {
  // Terms: no more than 20 requests/second per IP. Bucket 8/s burst 8 (<= 16 in a second), window hard cap 18.
  setRateLimit(RXNORM_UPSTREAM, 8, 8, { max: 18, ms: 1000 });
}
configureRxNormRateLimit();

export const RxNormInput = z.strictObject({ drug: MedicationDrug });
export type RxNormInput = z.input<typeof RxNormInput>;

export interface RxNormBrand {
  name: string;
  /** Every RxNorm branded product with this name contains more than one ingredient (e.g. Contrave for naltrexone). */
  combination: boolean;
}
export interface RxNormClass {
  id: string;
  name: string;
  type: "ATC" | "EPC" | "MOA"; // ATC level 1-4, FDA Established Pharmacologic Class, Mechanism of Action
  source: "ATC" | "DAILYMED";
}
export interface RxNormResult {
  drug: string; // curated generic name
  medicationId: string;
  queryName: string; // the RxNorm name that was sent
  found: boolean;
  rxcui: string | null;
  /** The live RxCUI equals the RxCUI curated in content/medications.json (false => content needs review). */
  matchesCurated: boolean;
  brands: RxNormBrand[];
  classes: RxNormClass[];
  links: { rxnav: string | null; dailyMedSearch: string; medlinePlus: { title: string; url: string }[] };
}

/* ---------------- URLs (exported for tests) ---------------- */
export function rxcuiByNameUrl(name: string): string {
  return `${RXNAV_BASE}/rxcui.json?${new URLSearchParams({ name, search: "0" })}`;
}
export function relatedBrandedUrl(rxcui: string): string {
  return `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?${new URLSearchParams({ tty: "SBD" })}`;
}
export function classByDrugNameUrl(name: string, relaSource: "ATC" | "DAILYMED"): string {
  return `${RXNAV_BASE}/rxclass/class/byDrugName.json?${new URLSearchParams({ drugName: name, relaSource })}`;
}

/* ---------------- response shapes (only the fields we read) ---------------- */
const RxcuiResponse = z.object({ idGroup: z.object({ rxnormId: z.array(z.string()).optional() }).loose() }).loose();
const RelatedResponse = z
  .object({
    relatedGroup: z
      .object({
        conceptGroup: z
          .array(z.object({ conceptProperties: z.array(z.object({ name: z.string() }).loose()).optional() }).loose())
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose();
const ClassResponse = z
  .object({
    rxclassDrugInfoList: z
      .object({
        rxclassDrugInfo: z
          .array(
            z
              .object({
                rxclassMinConceptItem: z.object({ classId: z.string(), className: z.string(), classType: z.string() }).loose(),
              })
              .loose(),
          )
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new UpstreamError(RXNORM_UPSTREAM, 502, "Unexpected response from upstream service");
  return r.data;
}

/* ---------------- normalisers (exported for tests) ---------------- */
const BRACKET = /\[([^\]\[]{1,60})\]\s*$/;

/** Branded clinical drug names -> brand names. Strengths and dose forms are discarded. */
export function brandsFromRelated(raw: unknown, exclusions: readonly string[] = medicationsFile.brandExclusions): RxNormBrand[] {
  const data = parse(RelatedResponse, raw);
  const excluded = new Set(exclusions.map((e) => e.toLowerCase()));
  const seen = new Map<string, { name: string; single: boolean }>();
  for (const g of data.relatedGroup?.conceptGroup ?? []) {
    for (const c of g.conceptProperties ?? []) {
      const m = BRACKET.exec(c.name);
      if (!m) continue;
      const name = clip(htmlToPlainText(m[1]!), 60);
      if (!name || excluded.has(name.toLowerCase())) continue;
      const single = !c.name.includes(" / ");
      const prev = seen.get(name.toLowerCase());
      seen.set(name.toLowerCase(), { name, single: single || (prev?.single ?? false) });
    }
  }
  return [...seen.values()]
    .sort((a, b) => Number(b.single) - Number(a.single) || a.name.localeCompare(b.name))
    .slice(0, RXNORM_MAX_BRANDS)
    .map((b) => ({ name: b.name, combination: !b.single }));
}

const CLASS_TYPES: Record<string, RxNormClass["type"]> = { "ATC1-4": "ATC", EPC: "EPC", MOA: "MOA" };

export function classesFromRxClass(raw: unknown, source: RxNormClass["source"]): RxNormClass[] {
  const data = parse(ClassResponse, raw);
  const out: RxNormClass[] = [];
  const seen = new Set<string>();
  for (const row of data.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
    const item = row.rxclassMinConceptItem;
    const type = CLASS_TYPES[item.classType];
    if (!type || !/^[A-Za-z0-9]{1,20}$/.test(item.classId)) continue;
    const key = `${type}:${item.classId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: item.classId, name: clip(htmlToPlainText(item.className), 120), type, source });
  }
  return out;
}

/* ---------------- adapter ---------------- */
function get(url: string): Promise<unknown> {
  return upstreamFetch<unknown>(url, { upstream: RXNORM_UPSTREAM, ttlMs: RXNORM_TTL_MS, timeoutMs: 8000 });
}

/** Fetch + parse; an unexpected shape is evicted from the cache (core keys entries as "<upstream>:<url>"). */
async function getParsed<T>(url: string, parseFn: (raw: unknown) => T): Promise<T> {
  const raw = await get(url);
  try {
    return parseFn(raw);
  } catch (e) {
    cacheSet(`${RXNORM_UPSTREAM}:${url}`, null, -1);
    throw e;
  }
}

function linksFor(med: Medication, rxcui: string | null): RxNormResult["links"] {
  return { rxnav: rxcui ? rxNavConceptUrl(rxcui) : null, dailyMedSearch: dailyMedSearchUrl(med.generic), medlinePlus: med.medlinePlus };
}

/** RxCUI, brand names and drug classes for one curated medication. Throws ZodError/OutboundRejected before any fetch. */
export async function lookupRxNorm(raw: RxNormInput): Promise<RxNormResult> {
  const input = RxNormInput.parse(raw);
  const med = getMedication(input.drug)!;
  const queryName = med.rxnormName ?? med.generic;
  assertNoPHI(queryName);
  assertSudLookupAllowed(isSudTreatment(med)); // 42 CFR Part 2 owner switch (core.ts), before any fetch

  const ids = (await getParsed(rxcuiByNameUrl(queryName), (raw) => parse(RxcuiResponse, raw))).idGroup.rxnormId ?? [];
  const rxcui = ids.find((id) => /^\d{1,10}$/.test(id)) ?? null; // only digits ever go back upstream
  const base = { drug: med.generic, medicationId: med.id, queryName };
  if (!rxcui) return { ...base, found: false, rxcui: null, matchesCurated: false, brands: [], classes: [], links: linksFor(med, null) };

  const [brands, atc, dailymed] = await Promise.all([
    getParsed(relatedBrandedUrl(rxcui), (raw) => brandsFromRelated(raw)),
    getParsed(classByDrugNameUrl(queryName, "ATC"), (raw) => classesFromRxClass(raw, "ATC")),
    getParsed(classByDrugNameUrl(queryName, "DAILYMED"), (raw) => classesFromRxClass(raw, "DAILYMED")),
  ]);
  const classes = [...atc, ...dailymed]
    .sort((a, b) => ["ATC", "EPC", "MOA"].indexOf(a.type) - ["ATC", "EPC", "MOA"].indexOf(b.type))
    .slice(0, RXNORM_MAX_CLASSES);
  return {
    ...base,
    found: true,
    rxcui,
    matchesCurated: rxcui === med.rxcui,
    brands,
    classes,
    links: linksFor(med, rxcui),
  };
}
