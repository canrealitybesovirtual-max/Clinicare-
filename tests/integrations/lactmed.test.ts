/**
 * LactMed adapter (NCBI E-utilities, db=books): only curated ingredient names leave the server, only LactMed drug
 * records come back (title and NCBI link, no record text), the NCBI limiter is shared with PubMed, the 42 CFR Part 2
 * switch applies to substance-use treatment medicines, and errors offer the LactMed home page as a link-out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import { OutboundRejected } from "@/lib/outbound";
import { getMedication } from "@/lib/schemas-medications";
import { NotConfigured, UpstreamError, __resetCoreForTests } from "@/server/core";
import { configurePubmedRateLimit } from "@/server/integrations/pubmed";
import {
  LACTMED_ATTRIBUTION,
  LACTMED_SOURCE,
  ingredientsOf,
  lactmedTerm,
  lookupLactMed,
  parseLactMedSummary,
} from "@/server/integrations/lactmed";
import { POST } from "@/server/routes/lactmed";

/* Response shapes as returned live by eutils.ncbi.nlm.nih.gov for db=books on 2026-11-27 (bookinfo omitted). */
const chapter = (uid: string, title: string, accession: string, book = "lactmed", bookAccession = "NBK501922") => ({
  uid,
  title,
  pubdate: "2006/01/01 00:00",
  id: `lactmed/chapter/${uid}/PMC`,
  accessionid: accession,
  rtype: "chapter",
  rid: accession,
  text: "",
  bookaccessionid: bookAccession,
  chapteraccessionid: accession,
  book,
});
const section = (uid: string, title: string) => ({ ...chapter(uid, title, "NBK501470"), rtype: "sec", id: `lactmed/LM585/sec/${uid}/PMC` });

let search: { idlist: string[] };
let summary: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const urls = () => fetchMock.mock.calls.map(([u]) => new URL(u));

beforeEach(() => {
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true");
  vi.stubEnv("NCBI_API_KEY", "");
  vi.stubEnv("NCBI_EMAIL", "");
  __resetCoreForTests();
  configurePubmedRateLimit();
  phi.force = false;
  search = { idlist: ["4573436"] };
  summary = { uids: ["4573436"], "4573436": chapter("4573436", "Sertraline", "NBK501191") };
  fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/esearch.fcgi")) return json({ header: { type: "esearch" }, esearchresult: { count: String(search.idlist.length), ...search } });
    if (u.pathname.endsWith("/esummary.fcgi")) return json({ header: { type: "esummary" }, result: summary });
    return json({ error: "no route" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/lactmed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("lookupLactMed", () => {
  it("sends only the curated ingredient name and returns the LactMed record link", async () => {
    const r = await lookupLactMed({ drug: "Sertraline" });
    expect(r).toMatchObject({ drug: "sertraline", ingredients: ["sertraline"], found: true });
    expect(r.records).toEqual([{ title: "Sertraline", url: "https://www.ncbi.nlm.nih.gov/books/NBK501191/", exact: true }]);
    const [s, m] = urls();
    expect(Object.fromEntries(s!.searchParams)).toEqual({
      db: "books",
      retmode: "json",
      retmax: "10",
      tool: "clinician-resource-companion",
      term: '("sertraline"[title]) AND lactmed[book]',
    });
    expect(Object.fromEntries(m!.searchParams)).toEqual({ db: "books", retmode: "json", tool: "clinician-resource-companion", id: "4573436" });
    expect(r.lactmedUrl).toBe(LACTMED_SOURCE);
  });

  it("looks up each ingredient of a combination product", async () => {
    const med = getMedication("dextromethorphan and bupropion")!;
    expect(ingredientsOf(med)).toEqual(["bupropion", "dextromethorphan"]);
    search = { idlist: ["4571482", "4571000"] }; // second uid illustrative
    summary = { "4571482": chapter("4571482", "Bupropion", "NBK501184"), "4571000": chapter("4571000", "Dextromethorphan", "NBK501456") };
    const r = await lookupLactMed({ drug: med.generic });
    expect(urls()[0]!.searchParams.get("term")).toBe(lactmedTerm(["bupropion", "dextromethorphan"]));
    expect(r.records.map((x) => x.title)).toEqual(["Bupropion", "Dextromethorphan"]);
  });

  it("keeps only LactMed drug records, exact names first", () => {
    const body = {
      result: {
        "1": section("1", "Drug Levels and Effects"),
        "2": chapter("2", "Sertraline", "NBK501191", "other-book", "NBK000001"),
        "3": chapter("3", "Sertraline and Pregnancy", "NBK500003"),
        "4": chapter("4", "Sertraline", "NBK501191"),
        "5": { ...chapter("5", "Bad accession", "javascript:alert(1)") },
      },
    };
    expect(parseLactMedSummary(body, ["1", "2", "3", "4", "5"], ["sertraline"])).toEqual([
      { title: "Sertraline", url: "https://www.ncbi.nlm.nih.gov/books/NBK501191/", exact: true },
      { title: "Sertraline and Pregnancy", url: "https://www.ncbi.nlm.nih.gov/books/NBK500003/", exact: false },
    ]);
    expect(() => parseLactMedSummary({ error: "bad" }, ["1"], ["sertraline"])).toThrow(UpstreamError);
  });

  it("reports no record without a second request", async () => {
    search = { idlist: [] };
    const r = await lookupLactMed({ drug: "sertraline" });
    expect(r).toMatchObject({ found: false, records: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects anything that is not a curated medication, and any flagged value, before a request", async () => {
    await expect(lookupLactMed({ drug: "my client's antidepressant" })).rejects.toBeInstanceOf(ZodError);
    await expect(lookupLactMed({ drug: "sertraline", note: "x" } as never)).rejects.toBeInstanceOf(ZodError);
    phi.force = true;
    await expect(lookupLactMed({ drug: "sertraline" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps substance-use treatment medicines behind the 42 CFR Part 2 owner switch", async () => {
    vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "");
    await expect(lookupLactMed({ drug: "naltrexone" })).rejects.toBeInstanceOf(NotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(lookupLactMed({ drug: "sertraline" })).resolves.toMatchObject({ found: true });
  });

  it("caches a lookup and shares the NCBI limit with PubMed (3 requests in any 1.1 s)", async () => {
    await lookupLactMed({ drug: "sertraline" });
    await lookupLactMed({ drug: "sertraline" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    search = { idlist: ["4568248"] };
    summary = { "4568248": chapter("4568248", "Lithium", "NBK501153") };
    await expect(lookupLactMed({ drug: "lithium" })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends the operator's NCBI email when one is configured", async () => {
    vi.stubEnv("NCBI_EMAIL", "ops@example.org");
    await lookupLactMed({ drug: "sertraline" });
    expect(urls()[0]!.searchParams.get("email")).toBe("ops@example.org");
  });
});

describe("POST /api/lactmed", () => {
  it("returns the records with NLM attribution", async () => {
    const res = await post({ drug: "sertraline" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; attribution: string; source: string; data: { records: unknown[] } };
    expect(body).toMatchObject({ ok: true, attribution: LACTMED_ATTRIBUTION, source: LACTMED_SOURCE });
    expect(body.data.records).toHaveLength(1);
  });

  it("offers the LactMed home page when NCBI fails, and never echoes input", async () => {
    fetchMock.mockImplementation(async () => json({}, 503));
    const res = await post({ drug: "sertraline" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, code: "upstream", fallbackUrl: LACTMED_SOURCE });
    const bad = await post({ drug: "Jane Doe 555-0100" });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).not.toContain("Jane");
  });
});
