import "server-only";
/**
 * PubMed via NCBI E-utilities (ESearch + ESummary). Docs: https://www.ncbi.nlm.nih.gov/books/NBK25499/
 * - Outbound: ONLY a curated search strategy from content/evidence-queries.json, chosen by its key (G5, G17).
 *   ESummary then receives the PMIDs ESearch just returned (upstream-derived numbers, validated as /^\d{1,9}$/;
 *   never caller input). No abstracts are fetched: titles, journal, year and publication types only.
 * - Terms (NCBI usage guidelines): at most 3 requests/second per IP without an API key, 10/second with one; send
 *   `tool` (and `email` if the operator configures one). A sliding window enforces that exactly (3 or 10 in any
 *   1.1 s, a small margin); a token bucket alone would allow burst + rate in one second. One search = 2 requests.
 * - Secrets: NCBI_API_KEY (optional) and NCBI_EMAIL (optional) come only from server env. The key must travel as
 *   a query parameter (NCBI accepts no header), so cache keys are built WITHOUT it, and core never logs URLs.
 * - Results are cached 24 h; PubMed indexing changes daily at most.
 */
import { z } from "zod";
import evidenceJson from "@content/evidence-queries.json";
import { assertNoPHI } from "@/lib/outbound";
import { EvidenceQueriesFileSchema, type EvidenceQuery } from "@/lib/schemas-evidence";
import { UpstreamError, assertSudLookupAllowed, setRateLimit, upstreamFetch } from "@/server/core";
import { clip, htmlToPlainText, xmlEscapedHtmlToPlainText } from "./plain-text";
import { strictCurated } from "./strict-input";

/* ---------------- curated strategies ---------------- */
export const evidenceQueriesFile = EvidenceQueriesFileSchema.parse(evidenceJson);
export const EVIDENCE_QUERIES: Readonly<Record<string, EvidenceQuery>> = evidenceQueriesFile.queries;
export const EVIDENCE_QUERY_IDS: readonly string[] = Object.keys(EVIDENCE_QUERIES);
export const PUBMED_FILTER = evidenceQueriesFile.pubmed.filter;
export const PUBMED_FILTER_LABEL = evidenceQueriesFile.pubmed.filterLabel;

/** The full PubMed term for a curated strategy: topic AND the shared design/date/adult-scope filter. */
export function pubmedTerm(queryId: string): string {
  // Own keys only: a plain-object lookup would resolve "constructor", "toString" and other prototype keys.
  const q = typeof queryId === "string" && Object.hasOwn(EVIDENCE_QUERIES, queryId) ? EVIDENCE_QUERIES[queryId] : undefined;
  if (!q) throw new z.ZodError([{ code: "custom", message: "not in curated list", path: ["queryId"], input: undefined }]);
  return `(${q.query}) AND ${PUBMED_FILTER}`;
}

/* ---------------- constants ---------------- */
export const PUBMED_UPSTREAM = "ncbi-eutils";
export const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
export const PUBMED_TOOL = "clinician-resource-companion";
export const PUBMED_ATTRIBUTION =
  "Citations from PubMed, courtesy of the U.S. National Library of Medicine. Listing does not imply endorsement; appraise each study.";
export const PUBMED_SOURCE = "https://pubmed.ncbi.nlm.nih.gov/";
export const PUBMED_RETMAX = 10;
export const PUBMED_TTL_MS = 24 * 60 * 60 * 1000;
export const PUBMED_TITLE_MAX = 300;

/* ---------------- configuration (server env only) ---------------- */
interface NcbiConfig { apiKey?: string; email?: string }

/** NCBI_API_KEY / NCBI_EMAIL from server env. Malformed values are ignored (never sent). */
export function ncbiConfig(): NcbiConfig {
  const key = process.env.NCBI_API_KEY?.trim();
  const email = process.env.NCBI_EMAIL?.trim();
  return {
    apiKey: key && /^[A-Za-z0-9]{20,64}$/.test(key) ? key : undefined,
    email: email && email.length <= 100 && /^[^\s@,;<>"']+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email) ? email : undefined,
  };
}

/** NCBI: 3 requests/second without a key, 10 with one, enforced by a sliding window (never above it). */
export function configurePubmedRateLimit() {
  const rps = ncbiConfig().apiKey ? 10 : 3;
  setRateLimit(PUBMED_UPSTREAM, rps, rps, { max: rps, ms: 1100 });
}
configurePubmedRateLimit();

/* ---------------- input / output ---------------- */
export const PubmedInput = z.strictObject({
  queryId: strictCurated(EVIDENCE_QUERY_IDS),
  max: z.number().int().min(1).max(PUBMED_RETMAX).default(PUBMED_RETMAX),
});
export type PubmedInput = z.input<typeof PubmedInput>;

export interface PubmedArticle {
  pmid: string;
  title: string; // plain text
  journal: string;
  year: number | null;
  pubTypes: string[]; // evidence-relevant publication types, most informative first (<= 5)
  url: string; // https://pubmed.ncbi.nlm.nih.gov/<pmid>/
}

export interface PubmedResult {
  queryId: string;
  label: string;
  kind: "condition" | "intervention";
  interventionIds: string[];
  sud: boolean;
  filterLabel: string;
  total: number; // PubMed hit count for the strategy
  items: PubmedArticle[]; // <= 10, PubMed "Best Match" order
  searchUrl: string; // the same strategy on pubmed.ncbi.nlm.nih.gov (link-out / fallback)
}

/** Link-out for the UI when the API is unavailable: the same curated strategy on the PubMed website. */
export function pubmedSearchLink(queryId: string): string {
  return `${PUBMED_SOURCE}?${new URLSearchParams({ term: pubmedTerm(queryId), sort: "relevance" })}`;
}

export function pubmedArticleUrl(pmid: string): string {
  if (typeof pmid !== "string" || !/^\d{1,9}$/.test(pmid)) {
    throw new z.ZodError([{ code: "custom", message: "PMID", path: ["pmid"], input: undefined }]);
  }
  return `${PUBMED_SOURCE}${pmid}/`;
}

/* ---------------- URL builders (exported for tests) ---------------- */
function withSecrets(params: URLSearchParams, cfg: NcbiConfig): URLSearchParams {
  const p = new URLSearchParams(params);
  if (cfg.email) p.set("email", cfg.email);
  if (cfg.apiKey) p.set("api_key", cfg.apiKey);
  return p;
}

/** Public ESearch parameters (no secrets): db, retmode, retmax, sort, tool, term. */
export function esearchParams(queryId: string): URLSearchParams {
  return new URLSearchParams({
    db: "pubmed",
    retmode: "json",
    retmax: String(PUBMED_RETMAX),
    sort: "relevance",
    tool: PUBMED_TOOL,
    term: pubmedTerm(queryId),
  });
}

/** Public ESummary parameters (no secrets): db, retmode, tool, id. */
export function esummaryParams(pmids: readonly string[]): URLSearchParams {
  return new URLSearchParams({ db: "pubmed", retmode: "json", tool: PUBMED_TOOL, id: pmids.join(",") });
}

/* ---------------- response parsing ---------------- */
const EsearchResponse = z.object({
  esearchresult: z.object({
    count: z.union([z.string(), z.number()]).optional(),
    idlist: z.array(z.string()).optional(),
    ERROR: z.string().optional(),
    errorlist: z.object({ phrasesnotfound: z.array(z.string()).optional(), fieldsnotfound: z.array(z.string()).optional() }).partial().optional(),
  }),
});

const SummaryDoc = z.object({
  uid: z.string(),
  title: z.string().optional(),
  source: z.string().optional(),
  fulljournalname: z.string().optional(),
  pubdate: z.string().optional(),
  epubdate: z.string().optional(),
  sortpubdate: z.string().optional(),
  pubtype: z.array(z.string()).optional(),
  error: z.string().optional(),
});
const EsummaryResponse = z.object({ result: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() });

const PMID = /^\d{1,9}$/;

/** Upstream-derived PMIDs only: digits, de-duplicated, capped. The PHI scrubber's numeric-id rule would flag every
 *  PMID, so these are validated by pattern instead; they never come from the caller. */
function cleanPmids(ids: readonly string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter((id) => PMID.test(id)))].slice(0, PUBMED_RETMAX);
}

/** Most informative first. Other types (except bookkeeping ones) follow in upstream order. */
const PUBTYPE_ORDER = [
  "Practice Guideline",
  "Guideline",
  "Network Meta-Analysis",
  "Meta-Analysis",
  "Systematic Review",
  "Randomized Controlled Trial",
  "Pragmatic Clinical Trial",
  "Equivalence Trial",
  "Clinical Trial, Phase III",
  "Multicenter Study",
  "Comparative Study",
  "Review",
];
const PUBTYPE_DROP = /^(?:Journal Article|Research Support\b.*|Preprint|English Abstract|Comment|Published Erratum)$/;

function rankPubTypes(types: readonly string[] | undefined): string[] {
  const clean = [...new Set((types ?? []).map((t) => htmlToPlainText(t)).filter((t) => t && t.length <= 60 && !PUBTYPE_DROP.test(t)))];
  const rank = (t: string) => {
    const i = PUBTYPE_ORDER.indexOf(t);
    return i === -1 ? PUBTYPE_ORDER.length : i;
  };
  return clean.sort((a, b) => rank(a) - rank(b)).slice(0, 5);
}

function yearOf(...dates: (string | undefined)[]): number | null {
  for (const d of dates) {
    const m = d ? /\b(19[5-9]\d|20\d\d|2100)\b/.exec(d) : null;
    if (m) return Number(m[1]);
  }
  return null;
}

/** Normalise an ESummary JSON body into articles, in the given PMID order. Exported for tests. */
export function parseEsummary(body: unknown, order: readonly string[]): PubmedArticle[] {
  const parsed = EsummaryResponse.safeParse(body);
  if (!parsed.success || parsed.data.error || !parsed.data.result) {
    throw new UpstreamError(PUBMED_UPSTREAM, 502, "Unexpected response from upstream service");
  }
  const result = parsed.data.result;
  const out: PubmedArticle[] = [];
  for (const pmid of order) {
    const doc = SummaryDoc.safeParse(result[pmid]);
    if (!doc.success || doc.data.error || doc.data.uid !== pmid) continue;
    // Titles may carry markup (<i>, <sup>) and entity-escaped markup (&lt;i&gt;): decode, then strip, to plain text.
    const title = clip(xmlEscapedHtmlToPlainText(doc.data.title ?? ""), PUBMED_TITLE_MAX);
    if (!title) continue;
    out.push({
      pmid,
      title,
      journal: clip(htmlToPlainText(doc.data.source || doc.data.fulljournalname || ""), 120),
      year: yearOf(doc.data.pubdate, doc.data.epubdate, doc.data.sortpubdate),
      pubTypes: rankPubTypes(doc.data.pubtype),
      url: pubmedArticleUrl(pmid),
    });
  }
  return out;
}

/* ---------------- adapter ---------------- */
async function eutils<T>(tool: "esearch" | "esummary", params: URLSearchParams): Promise<T> {
  const cfg = ncbiConfig();
  const publicUrl = `${EUTILS_BASE}/${tool}.fcgi?${params}`;
  try {
    return await upstreamFetch<T>(`${EUTILS_BASE}/${tool}.fcgi?${withSecrets(params, cfg)}`, {
      upstream: PUBMED_UPSTREAM,
      ttlMs: PUBMED_TTL_MS,
      cacheKey: publicUrl, // never includes api_key or email
      timeoutMs: 10_000,
    });
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(PUBMED_UPSTREAM, 502, "Unexpected response from upstream service"); // e.g. non-JSON body
  }
}

/** Evidence links for one curated strategy. Throws ZodError/OutboundRejected before any fetch. */
export async function searchPubmed(raw: PubmedInput): Promise<PubmedResult> {
  const input = PubmedInput.parse(raw);
  const strategy = EVIDENCE_QUERIES[input.queryId]!;
  const params = esearchParams(input.queryId);
  // Every caller-influenced outgoing string goes through the scrubber (curated values must pass it too).
  for (const v of params.values()) assertNoPHI(v);
  assertNoPHI(input.queryId);
  assertSudLookupAllowed(strategy.sud); // 42 CFR Part 2 owner switch (core.ts), before any fetch

  const search = EsearchResponse.safeParse(await eutils<unknown>("esearch", params));
  if (!search.success || search.data.esearchresult.ERROR) {
    throw new UpstreamError(PUBMED_UPSTREAM, 502, "Unexpected response from upstream service");
  }
  const total = Math.max(0, Math.min(Number(search.data.esearchresult.count ?? 0) || 0, 100_000_000));
  const pmids = cleanPmids(search.data.esearchresult.idlist);

  let items: PubmedArticle[] = [];
  if (pmids.length > 0) {
    const sp = esummaryParams(pmids);
    for (const [k, v] of sp) if (k !== "id") assertNoPHI(v);
    items = parseEsummary(await eutils<unknown>("esummary", sp), pmids);
  }

  return {
    queryId: input.queryId,
    label: strategy.label,
    kind: strategy.kind,
    interventionIds: [...strategy.interventionIds],
    sud: strategy.sud,
    filterLabel: PUBMED_FILTER_LABEL,
    total,
    items: items.slice(0, input.max),
    searchUrl: pubmedSearchLink(input.queryId),
  };
}
