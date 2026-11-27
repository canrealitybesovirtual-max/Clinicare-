import "server-only";
/**
 * LactMed (Drugs and Lactation Database, NICHD) via NCBI E-utilities on the Bookshelf database (db=books).
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25499/  Database: https://www.ncbi.nlm.nih.gov/books/NBK501922/
 * - Outbound: ONLY the ingredient names of one curated medication from content/medications.json (G5, G17); ESummary
 *   then receives the Bookshelf uids ESearch just returned (digits only, never caller input).
 * - What comes back: the LactMed record for each ingredient (title and Bookshelf link). Record text is not fetched
 *   or shown: clinicians read the current record on NCBI. Education only, never a prescribing or feeding decision.
 * - Terms: NCBI usage guidelines (3 requests/second per IP without an API key, `tool` on every request, `email`
 *   only if the operator configures one). LactMed shares the PubMed limiter ("ncbi-eutils"), because NCBI counts
 *   every E-utilities request from this server together. One lookup = 2 requests.
 * - Copyright: NLM states that information created by or for the US government on its site is in the public domain
 *   and asks for acknowledgment (LACTMED_ATTRIBUTION).
 * - Records are reviewed monthly at most: cached 7 days. Clinician mode only.
 */
import { z } from "zod";
import { assertNoPHI } from "@/lib/outbound";
import { MedicationDrug, getMedication, isSudTreatment, type Medication } from "@/lib/schemas-medications";
import { UpstreamError, assertSudLookupAllowed, cacheSet, upstreamFetch } from "@/server/core";
import { EUTILS_BASE, PUBMED_TOOL, PUBMED_UPSTREAM, ncbiConfig } from "./pubmed";
import { clip, htmlToPlainText } from "./plain-text";

export const LACTMED_UPSTREAM = PUBMED_UPSTREAM;
export const LACTMED_BOOK = "lactmed";
export const LACTMED_BOOK_ACCESSION = "NBK501922";
export const LACTMED_SOURCE = `https://www.ncbi.nlm.nih.gov/books/${LACTMED_BOOK_ACCESSION}/`;
export const LACTMED_ATTRIBUTION =
  "Drugs and Lactation Database (LactMed), National Institute of Child Health and Human Development, via NCBI Bookshelf, courtesy of the U.S. National Library of Medicine. Education only: decisions belong with the prescriber and the person.";
export const LACTMED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LACTMED_MAX_RECORDS = 4;

export const LactMedInput = z.strictObject({ drug: MedicationDrug });
export type LactMedInput = z.input<typeof LactMedInput>;

export interface LactMedRecord {
  title: string; // plain text, e.g. "Sertraline"
  url: string; // https://www.ncbi.nlm.nih.gov/books/NBK.../
  /** The record's title is one of the medication's ingredient names. */
  exact: boolean;
}

export interface LactMedResult {
  drug: string; // curated generic name
  medicationId: string;
  ingredients: string[]; // the names that were sent
  found: boolean;
  records: LactMedRecord[];
  /** LactMed on NCBI, where the clinician can search any record (link-out and fallback). */
  lactmedUrl: string;
}

/* ---------------- curated names (exported for tests) ---------------- */
const INGREDIENT = /^[a-z][a-z -]{1,58}[a-z]$/;

/** The single ingredients of a curated medication: "bupropion / dextromethorphan" -> both names. */
export function ingredientsOf(med: Pick<Medication, "generic" | "rxnormName">): string[] {
  const names = (med.rxnormName ?? med.generic).split(" / ").map((n) => n.trim());
  if (!names.length || names.some((n) => !INGREDIENT.test(n))) {
    throw new z.ZodError([{ code: "custom", message: "ingredient name", path: ["drug"], input: undefined }]);
  }
  return [...new Set(names)];
}

/** ESearch term: the ingredient names as titles, inside the LactMed book only. */
export function lactmedTerm(ingredients: readonly string[]): string {
  const titles = ingredients.map((n) => `"${n}"[title]`).join(" OR ");
  return `(${titles}) AND ${LACTMED_BOOK}[book]`;
}

/** Public ESearch parameters (no secrets). */
export function lactmedEsearchParams(ingredients: readonly string[]): URLSearchParams {
  return new URLSearchParams({ db: "books", retmode: "json", retmax: "10", tool: PUBMED_TOOL, term: lactmedTerm(ingredients) });
}

/** Public ESummary parameters (no secrets). */
export function lactmedEsummaryParams(uids: readonly string[]): URLSearchParams {
  return new URLSearchParams({ db: "books", retmode: "json", tool: PUBMED_TOOL, id: uids.join(",") });
}

/* ---------------- response parsing (exported for tests) ---------------- */
const EsearchResponse = z.object({
  esearchresult: z.object({ idlist: z.array(z.string()).optional(), ERROR: z.string().optional() }).loose(),
});
const EsummaryResponse = z.object({ result: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() });
const BookDoc = z
  .object({
    uid: z.string(),
    title: z.string(),
    rtype: z.string(),
    book: z.string(),
    bookaccessionid: z.string(),
    accessionid: z.string().regex(/^NBK\d{4,8}$/),
  })
  .loose();

const UID = /^\d{1,10}$/;

/** Upstream-derived uids only: digits, de-duplicated, capped. */
export function cleanUids(ids: readonly string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter((id) => UID.test(id)))].slice(0, 10);
}

/** LactMed drug records (chapters of the LactMed book) from an ESummary body, exact ingredient matches first. */
export function parseLactMedSummary(body: unknown, uids: readonly string[], ingredients: readonly string[]): LactMedRecord[] {
  const parsed = EsummaryResponse.safeParse(body);
  if (!parsed.success || parsed.data.error || !parsed.data.result) {
    throw new UpstreamError(LACTMED_UPSTREAM, 502, "Unexpected response from upstream service");
  }
  const names = new Set(ingredients.map((n) => n.toLowerCase()));
  const records: LactMedRecord[] = [];
  for (const uid of uids) {
    const doc = BookDoc.safeParse(parsed.data.result[uid]);
    if (!doc.success || doc.data.uid !== uid) continue;
    const d = doc.data;
    if (d.book !== LACTMED_BOOK || d.bookaccessionid !== LACTMED_BOOK_ACCESSION || d.rtype !== "chapter") continue;
    const title = clip(htmlToPlainText(d.title), 120);
    if (!title) continue;
    records.push({ title, url: `https://www.ncbi.nlm.nih.gov/books/${d.accessionid}/`, exact: names.has(title.toLowerCase()) });
  }
  return records.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, LACTMED_MAX_RECORDS);
}

/* ---------------- adapter ---------------- */
async function eutils(tool: "esearch" | "esummary", params: URLSearchParams): Promise<unknown> {
  const cfg = ncbiConfig();
  const publicUrl = `${EUTILS_BASE}/${tool}.fcgi?${params}`;
  const sent = new URLSearchParams(params);
  if (cfg.email) sent.set("email", cfg.email);
  if (cfg.apiKey) sent.set("api_key", cfg.apiKey);
  try {
    return await upstreamFetch<unknown>(`${EUTILS_BASE}/${tool}.fcgi?${sent}`, {
      upstream: LACTMED_UPSTREAM,
      ttlMs: LACTMED_TTL_MS,
      cacheKey: publicUrl, // never includes api_key or email
      timeoutMs: 10_000,
    });
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(LACTMED_UPSTREAM, 502, "Unexpected response from upstream service");
  }
}

/** LactMed records for one curated medication. Throws ZodError/OutboundRejected before any fetch. */
export async function lookupLactMed(raw: LactMedInput): Promise<LactMedResult> {
  const input = LactMedInput.parse(raw);
  const med = getMedication(input.drug)!;
  const ingredients = ingredientsOf(med);
  const searchParams = lactmedEsearchParams(ingredients);
  for (const v of searchParams.values()) assertNoPHI(v);
  assertSudLookupAllowed(isSudTreatment(med)); // 42 CFR Part 2 owner switch (core.ts), before any fetch

  const base = {
    drug: med.generic,
    medicationId: med.id,
    ingredients,
    lactmedUrl: LACTMED_SOURCE,
  };
  const search = EsearchResponse.safeParse(await eutils("esearch", searchParams));
  if (!search.success || search.data.esearchresult.ERROR) {
    throw new UpstreamError(LACTMED_UPSTREAM, 502, "Unexpected response from upstream service");
  }
  const uids = cleanUids(search.data.esearchresult.idlist);
  if (!uids.length) return { ...base, found: false, records: [] };

  const summaryParams = lactmedEsummaryParams(uids);
  const body = await eutils("esummary", summaryParams);
  let records: LactMedRecord[];
  try {
    records = parseLactMedSummary(body, uids, ingredients);
  } catch (e) {
    cacheSet(`${LACTMED_UPSTREAM}:${EUTILS_BASE}/esummary.fcgi?${summaryParams}`, null, -1); // do not keep a bad body
    throw e;
  }
  return { ...base, found: records.length > 0, records };
}
