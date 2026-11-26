import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import { OutboundRejected } from "@/lib/outbound";
import { MEDICATIONS } from "@/lib/schemas-medications";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  RXNAV_BASE,
  RXNORM_ATTRIBUTION,
  RXNORM_MAX_BRANDS,
  RXNORM_SOURCE,
  brandsFromRelated,
  classesFromRxClass,
  configureRxNormRateLimit,
  lookupRxNorm,
} from "@/server/integrations/rxnorm";
import { POST } from "@/server/routes/rxnorm";

/* Real response shapes (verified live against rxnav.nlm.nih.gov on 2026-11-26). */
const RXCUI = (id?: string) => ({ idGroup: id ? { rxnormId: [id] } : {} });
const sbd = (rxcui: string, name: string) => ({ rxcui, name, synonym: "", tty: "SBD", language: "ENG", suppress: "N", umlscui: "" });
const RELATED = (names: string[]) => ({
  relatedGroup: { rxcui: null, termType: ["SBD"], conceptGroup: [{ tty: "SBD", conceptProperties: names.map((n, i) => sbd(String(900000 + i), n)) }] },
});
const cls = (rxcui: string, name: string, classId: string, className: string, classType: string, rela: string, relaSource: string) => ({
  minConcept: { rxcui, name, tty: "IN" },
  rxclassMinConceptItem: { classId, className, classType },
  rela,
  relaSource,
});
const ATC = { rxclassDrugInfoList: { rxclassDrugInfo: [cls("36437", "sertraline", "N06AB", "Selective serotonin reuptake inhibitors", "ATC1-4", "", "ATC")] } };
const DAILYMED = {
  rxclassDrugInfoList: {
    rxclassDrugInfo: [
      cls("36437", "sertraline", "N0000000109", "Serotonin Uptake Inhibitors", "MOA", "has_moa", "DAILYMED"),
      cls("36437", "sertraline", "N0000175696", "Serotonin Reuptake Inhibitor", "EPC", "has_epc", "DAILYMED"),
      cls("36437", "sertraline", "N0000175696", "Serotonin Reuptake Inhibitor", "EPC", "has_epc", "DAILYMED"), // duplicate
      cls("36437", "sertraline", "N0000182137", "Cytochrome P450 2D6 Inhibitors", "MOA", "has_moa", "DAILYMED"),
      cls("36437", "sertraline", "D000001", "Some Disease", "DISEASE", "may_treat", "DAILYMED"), // ignored type
    ],
  },
};
const SERTRALINE_SBD = RELATED([
  "sertraline 100 MG Oral Tablet [Zoloft]",
  "sertraline 25 MG Oral Tablet [Zoloft]",
  "sertraline 20 MG/ML Oral Solution [Zoloft]",
]);

type Handler = (u: URL) => unknown;
let routes: Record<string, Handler>;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

function defaultRoutes(rxcui = "36437"): Record<string, Handler> {
  return {
    "/REST/rxcui.json": () => RXCUI(rxcui),
    [`/REST/rxcui/${rxcui}/related.json`]: () => SERTRALINE_SBD,
    "/REST/rxclass/class/byDrugName.json": (u) => (u.searchParams.get("relaSource") === "ATC" ? ATC : DAILYMED),
  };
}

beforeEach(() => {
  __resetCoreForTests();
  configureRxNormRateLimit();
  phi.force = false;
  routes = defaultRoutes();
  fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url);
    const h = routes[u.pathname];
    return h ? json(h(u)) : json({ error: "no route" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const urls = () => fetchMock.mock.calls.map((c) => new URL(String(c[0])));
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/rxnorm", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("rxnorm: outbound URLs carry only a curated drug name or an RxNav-issued RxCUI", () => {
  it("builds exactly four upstream URLs with exact query params", async () => {
    await lookupRxNorm({ drug: "sertraline" });
    const got = urls();
    expect(got).toHaveLength(4);
    for (const u of got) expect(u.origin + "/REST").toBe(RXNAV_BASE);
    expect(got.map((u) => [u.pathname, Object.fromEntries(u.searchParams)])).toEqual([
      ["/REST/rxcui.json", { name: "sertraline", search: "0" }],
      ["/REST/rxcui/36437/related.json", { tty: "SBD" }],
      ["/REST/rxclass/class/byDrugName.json", { drugName: "sertraline", relaSource: "ATC" }],
      ["/REST/rxclass/class/byDrugName.json", { drugName: "sertraline", relaSource: "DAILYMED" }],
    ]);
    for (const c of fetchMock.mock.calls) expect(c[1]!.method).toBe("GET");
  });

  it("accepts any case and the medication id; combination products use the curated RxNorm name", async () => {
    routes = defaultRoutes("2611256");
    const r = await lookupRxNorm({ drug: "Dextromethorphan AND Bupropion" });
    expect(r).toMatchObject({ drug: "dextromethorphan and bupropion", medicationId: "dextromethorphan-bupropion", queryName: "bupropion / dextromethorphan" });
    expect(urls()[0]!.searchParams.get("name")).toBe("bupropion / dextromethorphan");
    __resetCoreForTests();
    configureRxNormRateLimit();
    fetchMock.mockClear();
    routes = defaultRoutes("9639");
    await lookupRxNorm({ drug: "selegiline-transdermal" });
    expect(urls()[0]!.searchParams.get("name")).toBe("selegiline");
  });

  it("every curated query value is a plain name and passes the PHI scrubber", async () => {
    const { containsPHI } = await import("@/lib/phi-scrubber");
    for (const m of MEDICATIONS) {
      const q = m.rxnormName ?? m.generic;
      expect(q).toMatch(/^[a-z][a-z /-]+[a-z]$/);
      expect(containsPHI(q)).toBe(false);
    }
  });

  const bad: unknown[] = [
    { drug: "my client takes 50 mg of sertraline" },
    { drug: "Zoloft" }, // brand names are not accepted as input
    { drug: "John Smith" },
    { drug: "555-123-4567" },
    { drug: "sertraline", note: "DOB 01/02/1980" },
    { drug: "x".repeat(500) },
    { drug: 42 },
    { name: "sertraline" },
    {},
  ];
  it.each(bad.map((b) => [JSON.stringify(b).slice(0, 50), b]))("rejects %s before any fetch", async (_l, body) => {
    await expect(lookupRxNorm(body as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assertNoPHI runs before any fetch", async () => {
    phi.force = true;
    await expect(lookupRxNorm({ drug: "lithium" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an RxCUI that is not digits is never sent back upstream", async () => {
    routes["/REST/rxcui.json"] = () => ({ idGroup: { rxnormId: ["../../evil?x=1"] } });
    const r = await lookupRxNorm({ drug: "sertraline" });
    expect(r).toMatchObject({ found: false, rxcui: null, brands: [], classes: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("route 400 does not echo the input", async () => {
    const res = await post({ drug: "Jane Doe 555-123-4567" });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/Jane|555/);
    expect(JSON.parse(text)).toEqual({ ok: false, error: "Invalid input", code: "invalid" });
    const big = await post(JSON.stringify({ drug: "a".repeat(3000) }));
    expect(big.status).toBe(400);
  });
});

describe("rxnorm: normalisation", () => {
  it("returns brands without strengths, de-duplicated classes and canonical links", async () => {
    const r = await lookupRxNorm({ drug: "sertraline" });
    expect(r).toMatchObject({ found: true, rxcui: "36437", matchesCurated: true });
    expect(r.brands).toEqual([{ name: "Zoloft", combination: false }]);
    expect(JSON.stringify(r)).not.toMatch(/\bMG\b|Oral Tablet/);
    expect(r.classes).toEqual([
      { id: "N06AB", name: "Selective serotonin reuptake inhibitors", type: "ATC", source: "ATC" },
      { id: "N0000175696", name: "Serotonin Reuptake Inhibitor", type: "EPC", source: "DAILYMED" },
      { id: "N0000000109", name: "Serotonin Uptake Inhibitors", type: "MOA", source: "DAILYMED" },
      { id: "N0000182137", name: "Cytochrome P450 2D6 Inhibitors", type: "MOA", source: "DAILYMED" },
    ]);
    expect(r.links).toEqual({
      rxnav: "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=36437",
      dailyMedSearch: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=sertraline",
      medlinePlus: [{ title: "Sertraline", url: "https://medlineplus.gov/druginfo/meds/a697048.html" }],
    });
  });

  it("flags combination-only brands, drops veterinary products listed in RxNorm, caps the list", () => {
    const b = brandsFromRelated(
      RELATED([
        "naltrexone 50 MG Oral Tablet [ReVia]",
        "1 ML naltrexone 380 MG/ML Injection [Vivitrol]",
        "12 HR bupropion hydrochloride 90 MG / naltrexone hydrochloride 8 MG Extended Release Oral Tablet [Contrave]",
        "fluoxetine 8 MG Chewable Tablet [RECONCILE]",
        "clomipramine 20 MG Oral Tablet [Clomicalm]",
        "no bracket here",
        "x [<b>Bold</b>]",
      ]),
    );
    expect(b).toEqual([
      { name: "Bold", combination: false },
      { name: "ReVia", combination: false },
      { name: "Vivitrol", combination: false },
      { name: "Contrave", combination: true },
    ]);
    const many = brandsFromRelated(RELATED(Array.from({ length: 40 }, (_, i) => `drug ${i} MG Oral Tablet [Brand${i}]`)));
    expect(many).toHaveLength(RXNORM_MAX_BRANDS);
  });

  it("a brand sold both alone and in combination counts as single-ingredient", () => {
    expect(brandsFromRelated(RELATED(["a 1 MG / b 2 MG Oral Tablet [Mixed]", "a 1 MG Oral Tablet [Mixed]"]))).toEqual([{ name: "Mixed", combination: false }]);
  });

  it("ignores unknown class types and malformed class ids", () => {
    const out = classesFromRxClass(
      { rxclassDrugInfoList: { rxclassDrugInfo: [cls("1", "x", "N06AB", "SSRIs", "ATC1-4", "", "ATC"), cls("1", "x", "bad id!", "Bad", "EPC", "", "DAILYMED"), cls("1", "x", "C1", "Chem", "CHEM", "", "MEDRT")] } },
      "ATC",
    );
    expect(out).toEqual([{ id: "N06AB", name: "SSRIs", type: "ATC", source: "ATC" }]);
    expect(classesFromRxClass({}, "ATC")).toEqual([]);
  });

  it("not found: one request, empty result with link-outs", async () => {
    routes["/REST/rxcui.json"] = () => RXCUI();
    const r = await lookupRxNorm({ drug: "gepirone" });
    expect(r).toMatchObject({ found: false, rxcui: null, matchesCurated: false, brands: [], classes: [] });
    expect(r.links.rxnav).toBeNull();
    expect(r.links.dailyMedSearch).toBe("https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=gepirone");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("matchesCurated is false when RxNorm returns a different RxCUI than the curated one", async () => {
    routes = defaultRoutes("111");
    const r = await lookupRxNorm({ drug: "sertraline" });
    expect(r).toMatchObject({ found: true, rxcui: "111", matchesCurated: false });
  });
});

describe("rxnorm: upstream errors, caching, rate limiting (NLM: <= 20 req/s per IP), attribution", () => {
  it("HTTP error -> UpstreamError; route answers 502 with a generic message", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 500 }));
    await expect(lookupRxNorm({ drug: "sertraline" })).rejects.toBeInstanceOf(UpstreamError);
    const res = await post({ drug: "lithium" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Upstream service unavailable", code: "upstream" });
  });

  it("unexpected JSON shape -> 502, network failure -> 502", async () => {
    routes["/REST/rxcui.json"] = () => ({ idGroup: "nope" });
    await expect(lookupRxNorm({ drug: "sertraline" })).rejects.toMatchObject({ status: 502 });
    routes = defaultRoutes(); // the malformed response was not cached: the retry goes upstream and succeeds
    await expect(lookupRxNorm({ drug: "sertraline" })).resolves.toMatchObject({ found: true, rxcui: "36437" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await post({ drug: "lithium" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, code: "upstream" });
  });

  it("caches each request (7 days), so a repeat lookup makes no upstream calls", async () => {
    await lookupRxNorm({ drug: "sertraline" });
    await lookupRxNorm({ drug: "Sertraline" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("burst of 8 requests (two lookups), then 429 without calling upstream", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
    __resetCoreForTests();
    configureRxNormRateLimit();
    await lookupRxNorm({ drug: "sertraline" });
    routes = defaultRoutes("4493");
    await lookupRxNorm({ drug: "fluoxetine" });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    await expect(lookupRxNorm({ drug: "paroxetine" })).rejects.toMatchObject({ status: 429 });
    const res = await post({ drug: "citalopram" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: "rate-limited" });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    vi.setSystemTime(new Date("2026-11-26T12:00:01Z")); // 1 s later: 8 tokens back
    routes = defaultRoutes("32937");
    await lookupRxNorm({ drug: "paroxetine" });
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("route returns data with the NLM attribution statement and the RxNav source", async () => {
    const body = await (await post({ drug: "sertraline" })).json();
    expect(body).toMatchObject({ ok: true, attribution: RXNORM_ATTRIBUTION, source: RXNORM_SOURCE });
    expect(body.attribution).toMatch(/courtesy of the U\.S\. National Library of Medicine/);
    expect(body.attribution).toMatch(/does not endorse/);
    expect(body.data.brands).toEqual([{ name: "Zoloft", combination: false }]);
  });

  it("sends a generic User-Agent and no credentials", async () => {
    await lookupRxNorm({ drug: "sertraline" });
    const headers = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(headers.get("user-agent")).toBe("ClinicianResourceCompanion/0.1 (reference tool)");
    expect(headers.get("authorization")).toBeNull();
  });
});
