import { readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import evidenceJson from "@content/evidence-queries.json";
import { OutboundRejected } from "@/lib/outbound";
import { containsPHI } from "@/lib/phi-scrubber";
import { EvidenceQueriesFileSchema, pubmedQueryProblems } from "@/lib/schemas-evidence";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  EVIDENCE_QUERIES,
  EVIDENCE_QUERY_IDS,
  PUBMED_ATTRIBUTION,
  PUBMED_FILTER,
  PUBMED_SOURCE,
  configurePubmedRateLimit,
  ncbiConfig,
  parseEsummary,
  pubmedSearchLink,
  pubmedTerm,
  searchPubmed,
} from "@/server/integrations/pubmed";
import { POST, runtime } from "@/server/routes/pubmed";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Shapes verified live 2026-11-26 (ESearch/ESummary retmode=json). Titles are placeholders, not copied abstracts.
const esearch = (ids: string[], count = ids.length) => ({
  header: { type: "esearch", version: "0.3" },
  esearchresult: { count: String(count), retmax: String(ids.length), retstart: "0", idlist: ids, translationset: [], querytranslation: "x" },
});
const doc = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  pubdate: "2023 Nov 28",
  epubdate: "2023 Nov 28",
  source: "Test J Psychiatry",
  fulljournalname: "Test journal of psychiatry",
  title: `Placeholder <i>title</i> for ${uid} &amp; review.`,
  pubtype: ["Journal Article", "Systematic Review", "Research Support, Non-U.S. Gov't", "Network Meta-Analysis"],
  sortpubdate: "2023/11/28 00:00",
  authors: [{ name: "Author A", authtype: "Author" }],
  ...extra,
});
const esummary = (docs: Record<string, unknown>[]) => ({
  header: { type: "esummary", version: "0.3" },
  result: { uids: docs.map((d) => d.uid), ...Object.fromEntries(docs.map((d) => [d.uid as string, d])) },
});

const IDS = ["38014714", "35045991", "39180929"];
const PANIC_TERM = () => pubmedTerm("panic-disorder");
/** Panic strategy -> the real PMIDs above; any other strategy -> three PMIDs derived from its term. */
function idsFor(term: string): string[] {
  if (term === PANIC_TERM()) return IDS;
  let h = 7;
  for (const ch of term) h = (h * 31 + ch.charCodeAt(0)) % 9_000_000;
  return [0, 1, 2].map((i) => String(10_000_000 + h * 3 + i));
}
type Handler = (url: URL) => Response | Promise<Response>;
let onSearch: Handler;
let onSummary: Handler;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

const ENV_KEYS = ["NCBI_API_KEY", "NCBI_EMAIL"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true"); // 42 CFR Part 2 owner switch; default (off) is tested in hardening.test.ts
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  __resetCoreForTests();
  configurePubmedRateLimit();
  phi.force = false;
  // Distinct PMIDs per strategy (ESummary results are cached by PMID set, as they should be).
  onSearch = (u) => json(esearch(idsFor(u.searchParams.get("term")!), 250));
  onSummary = (u) => json(esummary(u.searchParams.get("id")!.split(",").map((id) => doc(id))));
  fetchMock = vi.fn(async (raw: string) => {
    const u = new URL(raw);
    if (u.pathname.endsWith("/esearch.fcgi")) return onSearch(u);
    if (u.pathname.endsWith("/esummary.fcgi")) return onSummary(u);
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const urlOf = (i: number) => new URL(String(fetchMock.mock.calls[i]![0]));
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/pubmed", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

const REQUIRED_CONDITIONS = [
  "panic-disorder",
  "agoraphobia",
  "generalized-anxiety-disorder",
  "major-depressive-disorder",
  "ptsd",
  "social-anxiety-disorder",
  "obsessive-compulsive-disorder",
  "alcohol-use-disorder",
  "insomnia-disorder",
];
const REQUIRED_INTERVENTIONS = [
  "cbt",
  "exposure-therapy",
  "behavioral-activation",
  "act",
  "dbt",
  "mbct",
  "ipt",
  "motivational-interviewing",
  "emdr",
  "cognitive-processing-therapy",
  "prolonged-exposure",
  "cbt-i",
  "relaxation-training",
  "erp",
];

describe("content/evidence-queries.json (PubMed strategies)", () => {
  it("validates, with governance fields (G10)", () => {
    const file = EvidenceQueriesFileSchema.parse(evidenceJson);
    expect(file.license).toBe("original");
    expect(file.lastVerified).toBe("2026-11-26");
    expect(file.reviewedBy).toBe("PENDING");
    expect(file.sources.length).toBeGreaterThan(0);
  });

  it("has one strategy per required condition and intervention family, each with a human label", () => {
    for (const id of REQUIRED_CONDITIONS) expect(EVIDENCE_QUERIES[id]?.kind, id).toBe("condition");
    for (const id of REQUIRED_INTERVENTIONS) expect(EVIDENCE_QUERIES[id]?.kind, id).toBe("intervention");
    for (const q of Object.values(EVIDENCE_QUERIES)) expect(q.label.length).toBeGreaterThan(3);
    expect(EVIDENCE_QUERIES["alcohol-use-disorder"]!.sud).toBe(true);
  });

  it("every strategy uses MeSH terms or tagged fields, is well-formed, and passes the PHI scrubber", () => {
    expect(pubmedQueryProblems(PUBMED_FILTER)).toEqual([]);
    for (const id of EVIDENCE_QUERY_IDS) {
      const term = pubmedTerm(id);
      expect(pubmedQueryProblems(term), id).toEqual([]);
      expect(containsPHI(term), id).toBe(false);
      expect(containsPHI(id), id).toBe(false);
      expect(term).toMatch(/\[(mh|tiab)\]/);
    }
    for (const id of REQUIRED_CONDITIONS) expect(EVIDENCE_QUERIES[id]!.query, id).toMatch(/\[mh\]/);
  });

  it("shared filter limits to SR / MA / RCT, last 10 years, adult scope, no retractions", () => {
    expect(PUBMED_FILTER).toContain("systematic review[pt]");
    expect(PUBMED_FILTER).toContain("meta-analysis[pt]");
    expect(PUBMED_FILTER).toContain("randomized controlled trial[pt]");
    expect(PUBMED_FILTER).toContain('"last 10 years"[dp]');
    expect(PUBMED_FILTER).toContain("NOT retracted publication[pt]");
    expect(PUBMED_FILTER).toMatch(/NOT \(\(child\[mh\].*\) NOT adult\[mh\]\)/);
  });

  it("linked intervention ids exist in content/interventions", () => {
    const dir = path.resolve(__dirname, "../../content/interventions");
    const ids = new Set(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
    for (const [qid, q] of Object.entries(EVIDENCE_QUERIES)) for (const iv of q.interventionIds) expect(ids.has(iv), `${qid} -> ${iv}`).toBe(true);
  });

  it("the validator rejects malformed or unexpected query syntax", () => {
    expect(pubmedQueryProblems('"Panic Disorder"[mh')).not.toEqual([]);
    expect(pubmedQueryProblems('"Panic Disorder"mh]')).not.toEqual([]);
    expect(pubmedQueryProblems('("Panic Disorder"[mh]')).not.toEqual([]);
    expect(pubmedQueryProblems('"Panic Disorder[mh]')).not.toEqual([]);
    expect(pubmedQueryProblems('"Panic Disorder"[au]')).not.toEqual([]);
    expect(pubmedQueryProblems("panic and (cbt[tiab])")).not.toEqual([]);
    expect(pubmedQueryProblems('panic[tiab] AND')).not.toEqual([]);
    expect(pubmedQueryProblems("panic[tiab] #1")).not.toEqual([]);
    expect(() => EvidenceQueriesFileSchema.parse({ ...evidenceJson, queries: { x: { kind: "condition", label: "Bad", query: "panic[zz]" } } })).toThrow();
  });
});

describe("PubMed: upstream URLs carry only the curated strategy", () => {
  it("ESearch then ESummary with exactly the documented parameters", async () => {
    const r = await searchPubmed({ queryId: "panic-disorder" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const s = urlOf(0);
    expect(`${s.origin}${s.pathname}`).toBe("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
    expect([...s.searchParams.keys()].sort()).toEqual(["db", "retmax", "retmode", "sort", "term", "tool"]);
    expect(s.searchParams.get("db")).toBe("pubmed");
    expect(s.searchParams.get("retmode")).toBe("json");
    expect(s.searchParams.get("retmax")).toBe("10");
    expect(s.searchParams.get("sort")).toBe("relevance");
    expect(s.searchParams.get("tool")).toBe("clinician-resource-companion");
    expect(s.searchParams.get("term")).toBe(`(${EVIDENCE_QUERIES["panic-disorder"]!.query}) AND ${PUBMED_FILTER}`);

    const m = urlOf(1);
    expect(`${m.origin}${m.pathname}`).toBe("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
    expect([...m.searchParams.keys()].sort()).toEqual(["db", "id", "retmode", "tool"]);
    expect(m.searchParams.get("id")).toBe(IDS.join(","));
    expect(r.items.map((a) => a.pmid)).toEqual(IDS);
    expect(fetchMock.mock.calls[0]![1]?.method ?? "GET").toBe("GET");
  });

  it("accepts the curated key case-insensitively; every key maps to its own term", async () => {
    await searchPubmed({ queryId: "  CBT-I " });
    expect(urlOf(0).searchParams.get("term")).toBe(pubmedTerm("cbt-i"));
    for (const id of EVIDENCE_QUERY_IDS) expect(pubmedTerm(id).startsWith(`(${EVIDENCE_QUERIES[id]!.query}) AND `)).toBe(true);
  });

  it("adds NCBI_API_KEY / NCBI_EMAIL only from server env, and never into the cache key", async () => {
    process.env.NCBI_API_KEY = "abcdef0123456789abcdef0123456789ab";
    process.env.NCBI_EMAIL = "ops@example.org";
    __resetCoreForTests();
    configurePubmedRateLimit();
    await searchPubmed({ queryId: "erp" });
    expect(urlOf(0).searchParams.get("api_key")).toBe("abcdef0123456789abcdef0123456789ab");
    expect(urlOf(0).searchParams.get("email")).toBe("ops@example.org");
    expect(urlOf(1).searchParams.get("api_key")).toBe("abcdef0123456789abcdef0123456789ab");
    // Same strategy without secrets is served from the same cache entry (key excludes secrets).
    delete process.env.NCBI_API_KEY;
    delete process.env.NCBI_EMAIL;
    await searchPubmed({ queryId: "erp" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed key / email values (never sent)", async () => {
    process.env.NCBI_API_KEY = "short key with spaces";
    process.env.NCBI_EMAIL = "not an email";
    expect(ncbiConfig()).toEqual({ apiKey: undefined, email: undefined });
    await searchPubmed({ queryId: "emdr" });
    expect(urlOf(0).searchParams.has("api_key")).toBe(false);
    expect(urlOf(0).searchParams.has("email")).toBe(false);
  });

  it("does not call ESummary when there are no hits", async () => {
    onSearch = () => json(esearch([], 0));
    const r = await searchPubmed({ queryId: "written-exposure-therapy" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ total: 0, items: [] });
  });

  it("only upstream PMIDs that are plain digits are forwarded to ESummary (capped at 10)", async () => {
    onSearch = () => json(esearch(["111", "abc", "1,2", "222", "111", "33333333333", ...Array.from({ length: 12 }, (_, i) => String(1000 + i))]));
    await searchPubmed({ queryId: "act" });
    const ids = urlOf(1).searchParams.get("id")!.split(",");
    expect(ids.slice(0, 2)).toEqual(["111", "222"]);
    expect(ids).toHaveLength(10);
    for (const id of ids) expect(id).toMatch(/^\d{1,9}$/);
  });
});

describe("PubMed: free text and identifiers are rejected before any fetch", () => {
  const bad: [string, unknown][] = [
    ["free clinical text", { queryId: "client reports panic attacks after divorce" }],
    ["raw PubMed syntax", { queryId: '"Panic Disorder"[mh]' }],
    ["label instead of key", { queryId: "Panic disorder: treatment evidence" }],
    ["email", { queryId: "jane.doe@example.com" }],
    ["SSN", { queryId: "123-45-6789" }],
    ["phone", { queryId: "(301) 555-0199" }],
    ["very long string", { queryId: "a".repeat(1500) }],
    ["number", { queryId: 42 }],
    ["missing", {}],
    ["extra key", { queryId: "cbt", term: "anything" }],
    ["max too high", { queryId: "cbt", max: 50 }],
  ];
  it.each(bad)("%s -> ZodError, no fetch", async (_label, input) => {
    await expect(searchPubmed(input as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PHI scrubber is the last line of defence (OutboundRejected before fetch)", async () => {
    phi.force = true;
    await expect(searchPubmed({ queryId: "cbt" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
    const res = await post({ queryId: "cbt" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route: invalid / oversized bodies are 400 and never echoed", async () => {
    for (const body of [{ queryId: "patient John Smith DOB 01/02/1960" }, "not json", JSON.stringify({ queryId: "x".repeat(3000) })]) {
      const res = await post(body);
      expect([400, 413]).toContain(res.status); // 413: body over the 2 KB cap
      const text = await res.text();
      expect(text).not.toContain("John");
      expect(text).not.toContain("xxxx");
      expect(JSON.parse(text)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PubMed: response normalisation", () => {
  it("strips markup, keeps order, ranks publication types, extracts year, builds canonical links", async () => {
    onSummary = () =>
      json(
        esummary([
          doc("39180929", { title: "Third &lt;b&gt;bold&lt;/b&gt; <sup>2</sup> title", pubdate: "", epubdate: "2025 Jan 3", pubtype: ["Randomized Controlled Trial", "Journal Article"] }),
          doc("38014714"),
          doc("35045991", { source: "", fulljournalname: "Fallback Journal", pubdate: "2022 Jan 19", pubtype: ["Review", "Practice Guideline", "Comment"] }),
        ]),
      );
    const r = await searchPubmed({ queryId: "panic-disorder" });
    expect(r.items.map((a) => a.pmid)).toEqual(IDS);
    const [a, b, c] = r.items;
    expect(a).toEqual({
      pmid: "38014714",
      title: "Placeholder title for 38014714 & review.",
      journal: "Test J Psychiatry",
      year: 2023,
      pubTypes: ["Network Meta-Analysis", "Systematic Review"],
      url: "https://pubmed.ncbi.nlm.nih.gov/38014714/",
    });
    expect(b!.journal).toBe("Fallback Journal");
    expect(b!.pubTypes).toEqual(["Practice Guideline", "Review"]);
    expect(c!.title).toBe("Third bold 2 title");
    expect(c!.year).toBe(2025);
    expect(c!.title).not.toMatch(/[<>]/);
    expect(r).toMatchObject({ queryId: "panic-disorder", kind: "condition", total: 250, sud: false });
    expect(r.searchUrl).toBe(pubmedSearchLink("panic-disorder"));
    expect(new URL(r.searchUrl).searchParams.get("term")).toBe(pubmedTerm("panic-disorder"));
  });

  it("skips error / mismatched / untitled summaries and respects max", async () => {
    onSummary = () =>
      json(esummary([doc("38014714", { error: "cannot get document summary" }), doc("35045991", { uid: "999" }), doc("39180929", { title: "" })]));
    const r = await searchPubmed({ queryId: "panic-disorder" });
    expect(r.items).toEqual([]);
    const items = parseEsummary(esummary(IDS.map((id) => doc(id))), IDS);
    expect(items).toHaveLength(3);
    __resetCoreForTests();
    configurePubmedRateLimit();
    onSummary = (u) => json(esummary(u.searchParams.get("id")!.split(",").map((id) => doc(id))));
    expect((await searchPubmed({ queryId: "ipt", max: 2 })).items).toHaveLength(2);
  });

  it("intervention strategies report the intervention ids they support", async () => {
    const r = await searchPubmed({ queryId: "relaxation-training" });
    expect(r.kind).toBe("intervention");
    expect(r.interventionIds).toEqual(["progressive-muscle-relaxation", "applied-relaxation"]);
  });
});

describe("PubMed: errors, caching, rate limiting, attribution", () => {
  it("maps upstream HTTP errors, ESearch ERROR payloads and non-JSON bodies to UpstreamError", async () => {
    onSearch = () => new Response("oops", { status: 500 });
    await expect(searchPubmed({ queryId: "cbt" })).rejects.toBeInstanceOf(UpstreamError);
    onSearch = () => json({ esearchresult: { ERROR: "Invalid query" } });
    await expect(searchPubmed({ queryId: "act" })).rejects.toBeInstanceOf(UpstreamError);
    onSearch = () => new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } });
    __resetCoreForTests();
    configurePubmedRateLimit();
    await expect(searchPubmed({ queryId: "dbt" })).rejects.toMatchObject({ name: "UpstreamError", status: 502 });
    onSearch = () => json(esearch(IDS));
    onSummary = () => json({ error: "Too many UIDs" });
    await expect(searchPubmed({ queryId: "mbct" })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("route: upstream failure -> 502 with a PubMed link-out fallback, no input echoed", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    const res = await post({ queryId: "emdr" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "upstream" });
    expect(body.fallbackUrl).toBe(pubmedSearchLink("emdr"));
    expect(new URL(body.fallbackUrl).hostname).toBe("pubmed.ncbi.nlm.nih.gov");
  });

  it("upstream 429 maps to rate-limited", async () => {
    onSearch = () => new Response(JSON.stringify({ error: "API rate limit exceeded" }), { status: 429 });
    const res = await post({ queryId: "ipt" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: "rate-limited" });
  });

  it("caches identical strategies (both calls)", async () => {
    const a = await searchPubmed({ queryId: "cbt" });
    const b = await searchPubmed({ queryId: "CBT" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(b).toEqual(a);
  });

  it("limits to 3 requests/second with no burst above it (no key), refusing before fetch", async () => {
    await searchPubmed({ queryId: "cbt" }); // esearch + esummary = 2 tokens
    await expect(searchPubmed({ queryId: "act" })).rejects.toMatchObject({ status: 429 }); // esearch ok, esummary refused
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const res = await post({ queryId: "dbt" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate-limited");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("allows 10 requests/second with an API key", async () => {
    process.env.NCBI_API_KEY = "abcdef0123456789abcdef0123456789ab";
    __resetCoreForTests();
    configurePubmedRateLimit();
    for (const queryId of ["cbt", "act", "dbt", "ipt", "emdr"]) await searchPubmed({ queryId });
    expect(fetchMock).toHaveBeenCalledTimes(10);
    await expect(searchPubmed({ queryId: "mbct" })).rejects.toMatchObject({ status: 429 });
  });

  it("route returns data with PubMed attribution and source", async () => {
    expect(runtime).toBe("nodejs");
    const res = await post({ queryId: "behavioral-activation", max: 2 });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.attribution).toBe(PUBMED_ATTRIBUTION);
    expect(body.attribution).toMatch(/PubMed/);
    expect(body.attribution).toMatch(/National Library of Medicine/);
    expect(body.attribution).toMatch(/does not imply endorsement/);
    expect(body.source).toBe(PUBMED_SOURCE);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.filterLabel).toMatch(/last 10 years/);
  });
});
