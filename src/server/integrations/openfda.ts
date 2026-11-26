import "server-only";
/**
 * openFDA drug labeling (https://api.fda.gov/drug/label.json). Docs: https://open.fda.gov/apis/drug/label/
 * Terms: https://open.fda.gov/terms/  Authentication: https://open.fda.gov/apis/authentication/
 * - Outbound: ONLY curated drug names / reference brand names / routes from content/medications.json (G5, G17).
 * - Optional key: OPENFDA_API_KEY (server env only, never NEXT_PUBLIC_*). Sent as the X-Api-Key header, so it is
 *   never part of a URL or a cache key.
 * - Limits: 240 requests/minute (with or without key); 1,000/day per IP without a key, 120,000/day per key.
 *   Token bucket 3/s, burst 6 (<= 186 in any minute) plus a daily counter kept under those caps.
 * - A label document is ~250 KB, so raw responses are NOT cached; the small normalised result is cached 24 h.
 * - Query plan (stop at the first suitable hit, newest label first): reference brand (exact brand name + route) ->
 *   generic-name phrase, single-ingredient, human prescription, same route -> product-data search for the few labels
 *   that lack openFDA harmonisation. HPUS-listed remedy products, non-prescription products and combination products
 *   are rejected unless the entry is itself a combination product.
 * - Output is plain text, trimmed: boxed warning, indications, warnings and precautions, contraindications. Dosage
 *   sections are never returned. Clinician reference only: "not for prescribing decisions".
 */
import { z } from "zod";
import { assertNoPHI } from "@/lib/outbound";
import {
  MedicationDrug,
  dailyMedLabelUrl,
  dailyMedSearchUrl,
  getMedication,
  isSudTreatment,
  type Medication,
} from "@/lib/schemas-medications";
import { NotConfigured, UpstreamError, assertSudLookupAllowed, cacheGet, cacheSet, setRateLimit, upstreamFetch } from "@/server/core";
import { clip, htmlToPlainText } from "./plain-text";

export const OPENFDA_UPSTREAM = "openfda-label";
export const OPENFDA_LABEL_ENDPOINT = "https://api.fda.gov/drug/label.json";
export const DRUG_LABEL_ATTRIBUTION =
  "Data from openFDA (U.S. FDA). Not for prescribing decisions; consult the full prescribing information. openFDA does not endorse this app.";
export const DRUG_LABEL_SOURCE = "https://open.fda.gov/apis/drug/label/";
export const DRUG_LABEL_TTL_MS = 24 * 60 * 60 * 1000;
/** Daily caps kept a little under openFDA's published per-day limits. */
export const OPENFDA_DAILY_CAP = { withoutKey: 950, withKey: 119_000 } as const;
export const LABEL_TEXT_MAX = { boxedWarning: 1500, indications: 1200, warningsAndCautions: 1500, contraindications: 800 } as const;

export function configureOpenFdaRateLimit() {
  // Published: 240 requests/minute. Bucket 3/s burst 6 (<= 186 in a minute); the window is a hard cap of 230.
  setRateLimit(OPENFDA_UPSTREAM, 3, 6, { max: 230, ms: 60_000 });
}
configureOpenFdaRateLimit();

/* ---------------- configuration / daily quota ---------------- */
/** OPENFDA_API_KEY when it looks like an api.data.gov key; otherwise undefined (keyless access). */
export function openFdaApiKey(): string | undefined {
  const k = process.env.OPENFDA_API_KEY?.trim();
  return k && /^[A-Za-z0-9]{20,64}$/.test(k) ? k : undefined;
}

let quota = { day: "", count: 0 };
function takeDailyQuota(keyed: boolean) {
  const day = new Date().toISOString().slice(0, 10);
  if (quota.day !== day) quota = { day, count: 0 };
  if (quota.count >= (keyed ? OPENFDA_DAILY_CAP.withKey : OPENFDA_DAILY_CAP.withoutKey))
    throw new UpstreamError(OPENFDA_UPSTREAM, 429, "Daily request limit reached, try again tomorrow");
  quota.count += 1;
}
/** Test helper. */
export function __resetOpenFdaForTests(count = 0) {
  quota = { day: new Date().toISOString().slice(0, 10), count };
}

/* ---------------- input / output ---------------- */
export const DrugLabelInput = z.strictObject({ drug: MedicationDrug });
export type DrugLabelInput = z.input<typeof DrugLabelInput>;

export type LabelMatch = "reference-brand" | "generic-name" | "product-data";
export interface DrugLabelResult {
  drug: string; // curated generic name
  medicationId: string;
  found: boolean;
  matchedBy: LabelMatch | null;
  brandNames: string[];
  genericName: string | null;
  routes: string[];
  applicationNumber: string | null; // NDA / ANDA / BLA number of the label shown
  boxedWarning: string | null; // plain text, trimmed
  indications: string | null;
  warningsAndCautions: string | null; // "Warnings and Precautions" (or "Warnings" on older labels)
  contraindications: string | null;
  effectiveTime: string | null; // YYYY-MM-DD
  setId: string | null;
  dailyMedUrl: string; // the label on DailyMed, or a DailyMed search when no label was found
  /** True when any section was shortened: the UI must point to the full label. */
  trimmed: boolean;
}

/* ---------------- query plan (exported for tests) ---------------- */
export interface LabelQueryStep {
  kind: LabelMatch;
  search: string;
}

const q = (s: string) => `"${s}"`;

export function drugLabelQueries(med: Medication): LabelQueryStep[] {
  const lab = med.label ?? {};
  const route = lab.route ?? "ORAL";
  const name = lab.name ?? med.generic;
  if (lab.unharmonized) return [{ kind: "product-data", search: `spl_product_data_elements:${q(name)}` }];
  const steps: LabelQueryStep[] = [];
  if (lab.brand) steps.push({ kind: "reference-brand", search: `openfda.brand_name.exact:${q(lab.brand)} AND openfda.route:${q(route)}` });
  const parts = [`openfda.generic_name:${q(name)}`];
  if (!lab.combination) parts.push(`NOT openfda.generic_name:${q("and")}`);
  for (const x of lab.exclude ?? []) parts.push(`NOT openfda.generic_name:${q(x)}`);
  parts.push(`openfda.product_type:${q("HUMAN PRESCRIPTION DRUG")}`, `openfda.route:${q(route)}`);
  steps.push({ kind: "generic-name", search: parts.join(" AND ") });
  return steps;
}

export function drugLabelUrl(search: string): string {
  return `${OPENFDA_LABEL_ENDPOINT}?${new URLSearchParams({ search, limit: "1", sort: "effective_time:desc" })}`;
}

/* ---------------- response parsing / normalisation (exported for tests) ---------------- */
const strs = z.array(z.string()).optional().catch(undefined);
const LabelDoc = z
  .object({
    set_id: z.string().optional().catch(undefined),
    effective_time: z.string().optional().catch(undefined),
    boxed_warning: strs,
    indications_and_usage: strs,
    warnings_and_cautions: strs,
    warnings: strs,
    contraindications: strs,
    spl_unclassified_section: strs,
    spl_product_data_elements: strs,
    openfda: z
      .object({
        brand_name: strs,
        generic_name: strs,
        route: strs,
        product_type: strs,
        application_number: strs,
      })
      .loose()
      .optional()
      .catch(undefined),
  })
  .loose();
type LabelDoc = z.infer<typeof LabelDoc>;
const LabelResponse = z.object({ results: z.array(z.unknown()).min(1) }).loose();

const HEADING =
  /^(?:\d{1,2}(?:\.\d{1,2})?\s*)?(?:BOXED WARNING|INDICATIONS(?:\s+AN\s?D\s+USAGE)?|WARNINGS AND PRECAUTIONS|WARNINGS|CONTRAINDICATIONS)\b[\s:.-]*/i;

/**
 * Label text tidy-up: drop PLR cross-reference markers ("( 5.1 , 5.2 )", "[see Clinical Studies (14)]"),
 * fix spacing before punctuation and drop a sentence that merely repeats the one before it ("None. None.").
 */
export function tidyLabelText(text: string): string {
  const cleaned = text
    .replace(/\[\s*see\b[^\[\]]{0,200}\]/gi, "")
    .replace(/\(\s*\d{1,2}(?:\.\d{1,2})?(?:\s*[,;]\s*\d{1,2}(?:\.\d{1,2})?){0,8}\s*\)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  const out: string[] = [];
  for (const s of cleaned.split(/(?<=[.!?])\s+/)) if (s && s !== out[out.length - 1]) out.push(s);
  return out.join(" ");
}

const DSM_REF = /\bDSM\b|DSM-|Diagnostic and Statistical Manual/i;

/**
 * G1: some older labels restate DSM diagnostic descriptions inside INDICATIONS. Keep only the text before the first
 * sentence that cites the DSM; the full label stays one click away on DailyMed.
 */
export function cutAtDsmReference(text: string): { text: string; cut: boolean } {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const i = sentences.findIndex((s) => DSM_REF.test(s));
  if (i < 0) return { text, cut: false };
  if (i > 0) return { text: sentences.slice(0, i).join(" ").trim(), cut: true };
  // The very first "sentence" cites the DSM (bullet-style highlights): keep what precedes the citation clause.
  const first = sentences[0]!;
  const head = first.slice(0, DSM_REF.exec(first)!.index).replace(DSM_DANGLING, "").trim();
  return { text: head ? `${head}…` : "", cut: true };
}
const DSM_DANGLING = /[\s,;:(]*(?:(?:as )?defined (?:by|in)|(?:in order )?to meet|according to|per)?(?:\s+the)?[\s,;:(]*$/i;

/** Plain text, leading section heading removed, tidied, DSM restatements cut, clipped. */
export function sectionText(values: string[] | undefined, max: number): { text: string | null; trimmed: boolean } {
  const { text: joined, cut } = cutAtDsmReference(tidyLabelText(htmlToPlainText((values ?? []).join(" ")).replace(HEADING, "")));
  if (!joined) return { text: null, trimmed: cut };
  const text = clip(joined, max);
  return { text, trimmed: cut || text.length < joined.length };
}

function indicationsOf(doc: LabelDoc): string[] | undefined {
  if (doc.indications_and_usage?.length) return doc.indications_and_usage;
  // Older (non-PLR) labels sometimes carry INDICATIONS inside an unclassified section.
  const hit = doc.spl_unclassified_section?.find((s) => /^\s*INDICATIONS\b/i.test(s));
  return hit ? [hit] : undefined;
}

function isoDate(v: string | undefined): string | null {
  const m = v && /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function uniq(values: string[] | undefined, max: number, len: number): string[] {
  const out = new Map<string, string>();
  for (const v of values ?? []) {
    const t = clip(htmlToPlainText(v), len);
    if (t && !out.has(t.toLowerCase())) out.set(t.toLowerCase(), t);
  }
  return [...out.values()].slice(0, max);
}

/** Reject HPUS-listed remedy, combination or non-prescription hits for a single-ingredient entry. */
export function isSuitableLabel(doc: LabelDoc, med: Medication, kind: LabelMatch): boolean {
  const productData = (doc.spl_product_data_elements ?? []).join(" ");
  if (/\bHPUS\b/i.test(productData) || (doc.spl_unclassified_section ?? []).some((t) => /\bHPUS\b/i.test(t))) return false;
  if (kind === "product-data") return productData.toLowerCase().includes((med.label?.name ?? med.generic).toLowerCase());
  const types = doc.openfda?.product_type ?? [];
  if (types.length && !types.includes("HUMAN PRESCRIPTION DRUG")) return false;
  if (!med.label?.combination) {
    const generics = doc.openfda?.generic_name ?? [];
    if (generics.some((g) => /,|\band\b|\//i.test(g))) return false;
  }
  return true;
}

export function normalizeLabel(doc: LabelDoc, med: Medication, kind: LabelMatch): DrugLabelResult {
  const sections = {
    boxedWarning: sectionText(doc.boxed_warning, LABEL_TEXT_MAX.boxedWarning),
    indications: sectionText(indicationsOf(doc), LABEL_TEXT_MAX.indications),
    warningsAndCautions: sectionText(doc.warnings_and_cautions?.length ? doc.warnings_and_cautions : doc.warnings, LABEL_TEXT_MAX.warningsAndCautions),
    contraindications: sectionText(doc.contraindications, LABEL_TEXT_MAX.contraindications),
  };
  const setId = doc.set_id && /^[0-9a-f-]{36}$/i.test(doc.set_id) ? doc.set_id.toLowerCase() : null;
  const app = doc.openfda?.application_number?.find((a) => /^(?:NDA|ANDA|BLA)\d{4,8}$/.test(a)) ?? null;
  return {
    drug: med.generic,
    medicationId: med.id,
    found: true,
    matchedBy: kind,
    brandNames: uniq(doc.openfda?.brand_name, 6, 80),
    genericName: uniq(doc.openfda?.generic_name, 1, 120)[0] ?? null,
    routes: uniq(doc.openfda?.route, 3, 40),
    applicationNumber: app,
    boxedWarning: sections.boxedWarning.text,
    indications: sections.indications.text,
    warningsAndCautions: sections.warningsAndCautions.text,
    contraindications: sections.contraindications.text,
    effectiveTime: isoDate(doc.effective_time),
    setId,
    dailyMedUrl: (setId && dailyMedLabelUrl(setId)) || dailyMedSearchUrl(med.generic),
    trimmed: Object.values(sections).some((s) => s.trimmed),
  };
}

/** Link-out result when no current label matched (UI shows the DailyMed search link). */
export function labelNotFound(med: Medication): DrugLabelResult {
  return {
    drug: med.generic,
    medicationId: med.id,
    found: false,
    matchedBy: null,
    brandNames: [],
    genericName: null,
    routes: [],
    applicationNumber: null,
    boxedWarning: null,
    indications: null,
    warningsAndCautions: null,
    contraindications: null,
    effectiveTime: null,
    setId: null,
    dailyMedUrl: dailyMedSearchUrl(med.generic),
    trimmed: false,
  };
}

/* ---------------- adapter ---------------- */
async function fetchFirst(search: string): Promise<LabelDoc | null> {
  const key = openFdaApiKey();
  takeDailyQuota(Boolean(key));
  let raw: unknown;
  try {
    raw = await upstreamFetch<unknown>(drugLabelUrl(search), {
      upstream: OPENFDA_UPSTREAM,
      ttlMs: 0, // raw label documents are large; the normalised result is cached instead
      timeoutMs: 10_000,
      maxBytes: 6_000_000,
      headers: key ? { "X-Api-Key": key } : undefined,
    });
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) return null; // openFDA answers "no matches" with HTTP 404
    // 401/403 (e.g. API_KEY_INVALID): a configuration problem, so the UI shows the DailyMed link-out instead.
    if (e instanceof UpstreamError && e.upstream === OPENFDA_UPSTREAM && (e.status === 401 || e.status === 403)) {
      throw new NotConfigured("openFDA drug label lookup");
    }
    throw e;
  }
  const r = LabelResponse.safeParse(raw);
  if (!r.success) throw new UpstreamError(OPENFDA_UPSTREAM, 502, "Unexpected response from upstream service");
  const doc = LabelDoc.safeParse(r.data.results[0]);
  if (!doc.success) throw new UpstreamError(OPENFDA_UPSTREAM, 502, "Unexpected response from upstream service");
  return doc.data;
}

/** Current FDA label highlights for one curated medication. Throws ZodError/OutboundRejected before any fetch. */
export async function lookupDrugLabel(raw: DrugLabelInput): Promise<DrugLabelResult> {
  const input = DrugLabelInput.parse(raw);
  const med = getMedication(input.drug)!;
  const lab = med.label ?? {};
  assertNoPHI(med.generic, lab.name, lab.brand, lab.route, ...(lab.exclude ?? []));
  assertSudLookupAllowed(isSudTreatment(med)); // 42 CFR Part 2 owner switch (core.ts), before any fetch

  const cacheKey = `${OPENFDA_UPSTREAM}:result:${med.id}`;
  const hit = cacheGet<DrugLabelResult>(cacheKey);
  if (hit) return hit;

  let result = labelNotFound(med);
  for (const step of drugLabelQueries(med)) {
    const doc = await fetchFirst(step.search);
    if (doc && isSuitableLabel(doc, med, step.kind)) {
      result = normalizeLabel(doc, med, step.kind);
      break;
    }
  }
  cacheSet(cacheKey, result, DRUG_LABEL_TTL_MS);
  return result;
}
