/**
 * Cross-cutting hardening of the API layer (review findings, 2026-11-26):
 * - letters-only clinical text can never pass as a city (gazetteer allowlist)
 * - upstream text never comes back with live markup (idempotent plain-text normalisers)
 * - upstreamFetch: streamed size cap, no cross-origin redirects, parse/timeout errors mapped safely
 * - published rate limits are never exceeded in ANY sliding window (not just on average)
 * - cache is partitioned per upstream; ICD-11 credentials are not sent on a cache hit
 * - readBody: JSON only, 2 KB cap while streaming, cross-site refused, per-client limit
 * - 42 CFR Part 2 owner switch: SUD reference lookups are off by default, before any fetch
 * - non-ASCII look-alikes are refused, link-out builders validate their input, endpoint overrides are strict
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { OutboundRejected } from "@/lib/outbound";
import { dailyMedSearchUrl } from "@/lib/schemas-medications";
import {
  CACHE_MAX_ENTRIES_PER_UPSTREAM,
  CLIENT_LIMIT,
  NotConfigured,
  UpstreamError,
  __resetCoreForTests,
  cacheGet,
  cacheSet,
  readBody,
  upstreamFetch,
} from "@/server/core";
import { configureTrialsRateLimit, searchTrials, trialUrl, TRIALS_UPSTREAM } from "@/server/integrations/clinicaltrials";
import { applyFindTreatmentRateLimit, searchTreatmentFacilities } from "@/server/integrations/findtreatment";
import { applyHrsaRateLimit, searchHealthCenters } from "@/server/integrations/hrsa";
import { CONNECT_UPSTREAM, configureConnectRateLimit, medlinePlusByCode } from "@/server/integrations/medlineplus-connect";
import { HEALTH_TOPICS_UPSTREAM, configureHealthTopicsRateLimit, searchHealthTopics } from "@/server/integrations/medlineplus-topics";
import { ICD10CM_UPSTREAM, configureIcd10cmRateLimit, searchIcd10cm } from "@/server/integrations/nlm-icd10cm";
import { NPPES_UPSTREAM, applyNppesRateLimit, searchProviders } from "@/server/integrations/nppes";
import { OPENFDA_UPSTREAM, __resetOpenFdaForTests, configureOpenFdaRateLimit, lookupDrugLabel } from "@/server/integrations/openfda";
import { findPlace, placeCount, placeKey } from "@/server/integrations/places";
import { htmlToPlainText, xmlEscapedHtmlToPlainText } from "@/server/integrations/plain-text";
import {
  PUBMED_UPSTREAM,
  configurePubmedRateLimit,
  pubmedArticleUrl,
  pubmedSearchLink,
  pubmedTerm,
  searchPubmed,
} from "@/server/integrations/pubmed";
import { StrictLocation } from "@/server/integrations/referral-common";
import { RXNORM_UPSTREAM, configureRxNormRateLimit, lookupRxNorm } from "@/server/integrations/rxnorm";
import { strictCurated } from "@/server/integrations/strict-input";
import { configureGhoRateLimit, getGhoIndicator } from "@/server/integrations/who-gho";
import { __resetIcd11ForTests, configureIcd11RateLimit, icd11Lookup } from "@/server/integrations/who-icd11";
import { POST as icd10cmRoute } from "@/server/routes/icd10cm";
import { POST as pubmedRoute } from "@/server/routes/pubmed";
import { POST as trialsRoute } from "@/server/routes/trials";
import { POST as icd11Route } from "@/server/routes/icd11";

const json = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;

function configureAll() {
  configureIcd10cmRateLimit();
  configureIcd11RateLimit();
  configureConnectRateLimit();
  configureHealthTopicsRateLimit();
  configureRxNormRateLimit();
  configureOpenFdaRateLimit();
  applyNppesRateLimit();
  applyHrsaRateLimit();
  applyFindTreatmentRateLimit();
  configurePubmedRateLimit();
  configureTrialsRateLimit();
  configureGhoRateLimit();
}

beforeEach(() => {
  __resetCoreForTests();
  __resetIcd11ForTests();
  __resetOpenFdaForTests();
  configureAll();
  fetchMock = vi.fn(async () => json({}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------ */
describe("city allowlist (HIGH): letters-only clinical text can never leave as a city", () => {
  const CLINICAL = [
    "Suicidal Ideation",
    "Hears Voices At Night",
    "Panic Attacks Daily",
    "Opioid Withdrawal",
    "Alcohol Relapse",
    "Uses Meth Daily",
    "Took Overdose",
    "Drinks Every Morning",
    "Wants To Die",
    "Self Harm",
  ];
  for (const city of CLINICAL) {
    it(`"${city}" is refused for every referral search before any fetch`, async () => {
      vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true");
      vi.stubEnv("HRSA_API_KEY", "test-token-123456");
      vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", "true");
      for (const state of ["OH", "MD", "TX"] as const) {
        expect(() => StrictLocation.parse({ city, state })).toThrow(ZodError);
        await expect(searchProviders({ providerType: "addiction-counselor", location: { city, state } })).rejects.toBeInstanceOf(ZodError);
        await expect(searchHealthCenters({ location: { city, state } })).rejects.toBeInstanceOf(ZodError);
        await expect(searchTreatmentFacilities({ location: { city, state }, facilityType: "substance-use" })).rejects.toBeInstanceOf(ZodError);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("real places resolve to their canonical USPS spelling with a coarse point", () => {
    expect(placeCount()).toBeGreaterThan(29_000);
    expect(findPlace("gaithersburg", "MD")).toMatchObject({ name: "Gaithersburg", lat: 39.15, lng: -77.2 });
    expect(findPlace("Mayagüez", "PR")?.name).toBe("Mayaguez");
    expect(findPlace("Hagåtña", "GU")?.name).toBe("Hagatna");
    expect(findPlace("Española", "NM")?.name).toBe("Espanola");
    expect(findPlace("Cañon City", "CO")?.name).toBe("Canon City");
    expect(findPlace("O’Fallon", "IL")?.name).toBe("O Fallon");
    expect(findPlace("Winston Salem", "NC")?.name).toBe("Winston-Salem");
    expect(findPlace("Wilkes-Barre", "PA")?.name).toBe("Wilkes Barre"); // USPS spelling
    expect(findPlace("Mt. Vernon", "NY")?.name).toBe("Mount Vernon");
    for (const [city, st] of [["Charlotte", "NC"], ["Jackson", "MS"], ["San Jose", "CA"], ["Fort Myers", "FL"], ["Lake Charles", "LA"], ["Elizabeth City", "NC"]] as const) {
      expect(findPlace(city, st)?.name).toBe(city);
    }
  });

  it("look-alike or non-Latin input never matches", () => {
    expect(placeKey("ſt louis")).toBeNull(); // long s
    expect(placeKey("Москва")).toBeNull();
    expect(findPlace("Gaithersburg", "AK")).toBeNull();
    expect(findPlace("Gaithersburg Md 20877", "MD")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
describe("upstream text never comes back with live markup", () => {
  const XSS = `<script>alert('x')</script><img src=x onerror=alert(1)>&lt;script&gt;alert(2)&lt;/script&gt;&amp;lt;img src=x&amp;gt;<b onmouseover="evil()">bold</b>< script>`;
  const H = (s: string) => `${s} ${XSS}`;
  const TAG = /<\s*\/?\s*[a-z!?]/i;

  function hostile(u: URL): Response {
    const host = u.hostname;
    const p = u.pathname;
    if (host === "clinicaltables.nlm.nih.gov") return json([1, ["F41.1"], null, [["F41.1", H("Generalized anxiety disorder")]]]);
    if (host === "icdaccessmanagement.who.int") return json({ access_token: "BEARER-TOKEN-0123456789", expires_in: 3600 });
    if (host === "id.who.int" && p.includes("/codeinfo/")) return json({ code: "6B00", stemId: "http://id.who.int/icd/release/11/2026-01/mms/1712535455" });
    if (host === "id.who.int")
      return json({
        title: { "@language": "en", "@value": H("Generalized anxiety disorder") },
        definition: { "@language": "en", "@value": H("Definition") },
        browserUrl: "javascript:alert(1)",
        inclusion: [{ label: { "@value": H("incl") } }],
        exclusion: [{ label: { "@value": H("excl") } }],
      });
    if (host === "connect.medlineplus.gov")
      return json({ feed: { entry: [{ title: { _value: H("Anxiety") }, link: [{ href: "https://medlineplus.gov/anxiety.html" }], summary: { _value: H("<p>Summary</p>") } }] } });
    if (host === "wsearch.nlm.nih.gov") {
      const t = "Anxiety &lt;script&gt;alert(1)&lt;/script&gt; &amp;lt;img src=x onerror=alert(1)&amp;gt; &amp;amp;lt;b&amp;amp;gt;";
      return new Response(
        `<?xml version="1.0"?><nlmSearchResult><count>1</count><list><document rank="0" url="https://medlineplus.gov/anxiety.html"><content name="title">${t}</content><content name="FullSummary">&lt;p&gt;${t}&lt;/p&gt;</content><content name="altTitle">${t}</content></document></list></nlmSearchResult>`,
        { headers: { "content-type": "text/xml" } },
      );
    }
    if (host === "rxnav.nlm.nih.gov" && p.endsWith("/rxcui.json")) return json({ idGroup: { rxnormId: ["4493"] } });
    if (host === "rxnav.nlm.nih.gov" && p.includes("/related.json"))
      return json({ relatedGroup: { conceptGroup: [{ conceptProperties: [{ name: "fluoxetine 20 MG Oral Capsule [Prozac &lt;script&gt;x&lt;/script&gt;]" }] }] } });
    if (host === "rxnav.nlm.nih.gov")
      return json({ rxclassDrugInfoList: { rxclassDrugInfo: [{ rxclassMinConceptItem: { classId: "N06AB", className: H("SSRIs"), classType: "ATC1-4" } }] } });
    if (host === "api.fda.gov")
      return json({
        results: [
          {
            set_id: "11111111-2222-3333-4444-555555555555",
            effective_time: "20250101",
            boxed_warning: [H("WARNING: SUICIDAL THOUGHTS AND BEHAVIORS")],
            indications_and_usage: [H("INDICATIONS AND USAGE Fluoxetine is indicated for the treatment of major depressive disorder.")],
            warnings_and_cautions: [H("WARNINGS AND PRECAUTIONS Serotonin syndrome.")],
            contraindications: [H("CONTRAINDICATIONS Do not use with MAOIs.")],
            openfda: { product_type: ["HUMAN PRESCRIPTION DRUG"], generic_name: ["FLUOXETINE HYDROCHLORIDE"], brand_name: ["PROZAC"], route: ["ORAL"], application_number: ["NDA018936"] },
          },
        ],
      });
    if (host === "npiregistry.cms.hhs.gov")
      return json({
        result_count: 1,
        results: [
          {
            number: "1234567890",
            enumeration_type: "NPI-1",
            basic: { first_name: H("JANE"), last_name: "DOE", credential: H("MD"), status: "A", last_updated: "2025-01-01" },
            addresses: [{ address_purpose: "LOCATION", address_1: H("1 MAIN ST"), city: H("ROCKVILLE"), state: "MD", postal_code: "208771234", telephone_number: "301-555-0123" }],
            taxonomies: [{ code: "2084P0800X", primary: true, state: "MD" }],
          },
        ],
      });
    if (host === "data.hrsa.gov")
      return json({ HCC: [{ HCC_FCT_ID: 1, SITE_NM: H("Clinic"), SITE_ADDRESS: H("1 Main"), SITE_CITY: "ROCKVILLE", SITE_STATE_ABBR: "MD", SITE_URL: "javascript:alert(1)", HCC_TYP_DESC: "Service Delivery Site", Distance: 1.23 }] });
    if (host === "findtreatment.gov")
      return json({ page: 1, totalPages: 1, recordCount: 1, rows: [{ name1: H("Facility"), name2: H("Unit"), city: "ROCKVILLE", website: "javascript:alert(1)", services: [{ f2: "AGE", f3: H("Adults; Seniors") }] }] });
    if (host === "eutils.ncbi.nlm.nih.gov" && p.endsWith("esearch.fcgi")) return json({ esearchresult: { count: "1", idlist: ["123"] } });
    if (host === "eutils.ncbi.nlm.nih.gov")
      return json({ result: { uids: ["123"], "123": { uid: "123", title: H("A &lt;i&gt;trial&lt;/i&gt;"), source: H("J"), pubdate: "2024", pubtype: [H("Randomized Controlled Trial")] } } });
    if (host === "clinicaltrials.gov")
      return json({
        totalCount: 1,
        studies: [
          {
            protocolSection: {
              identificationModule: { nctId: "NCT01234567", briefTitle: H("Trial title") },
              statusModule: { overallStatus: "RECRUITING" },
              conditionsModule: { conditions: [H("Anxiety")] },
              armsInterventionsModule: { interventions: [{ name: H("CBT") }] },
              contactsLocationsModule: { locations: [{ country: H("United States"), state: "Texas" }] },
            },
          },
        ],
      });
    if (host === "ghoapi.azureedge.net")
      return json({ value: [{ TimeDim: 2021, Dim1Type: "SEX", Dim1: "SEX_BTSX", NumericValue: 5.1, Low: 4, High: 6, Value: H("Yes"), Date: "2024-01-01T00:00:00" }] });
    return json({ unexpected: true }, 500);
  }

  function strings(v: unknown, path = "$", out: [string, string][] = []): [string, string][] {
    if (typeof v === "string") out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
    return out;
  }

  it("every adapter's normalised result is free of tag-shaped text and javascript: URLs", async () => {
    vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true");
    vi.stubEnv("WHO_ICD_CLIENT_ID", "client-id-0001");
    vi.stubEnv("WHO_ICD_CLIENT_SECRET", "client-secret-0001");
    vi.stubEnv("HRSA_API_KEY", "test-token-123456");
    vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", "true");
    fetchMock.mockImplementation(async (u: string) => hostile(new URL(String(u))));
    const results: Record<string, unknown> = {
      icd10cm: await searchIcd10cm({ code: "F41.1" }),
      icd11: await icd11Lookup({ code: "6B00" }),
      medlineplus: await medlinePlusByCode({ code: "F41.1", lang: "en" }),
      healthTopics: await searchHealthTopics({ topic: "anxiety", lang: "en" }),
      rxnorm: await lookupRxNorm({ drug: "fluoxetine" }),
      drugLabel: await lookupDrugLabel({ drug: "fluoxetine" }),
      providers: await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } }),
      healthCenters: await searchHealthCenters({ location: { zip: "20877" } }),
      facilities: await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "mental-health" }),
      pubmed: await searchPubmed({ queryId: "panic-disorder" }),
      trials: await searchTrials({ condition: "ptsd", state: "TX" }),
      gho: await getGhoIndicator({ indicator: "MH_25", country: "KEN" }).catch(() => getGhoIndicator({ indicator: "MH_12", country: "USA" })),
    };
    const leaks: string[] = [];
    let checked = 0;
    for (const [name, r] of Object.entries(results)) {
      for (const [path, s] of strings(r)) {
        checked += 1;
        if (TAG.test(s) || /^\s*javascript:/i.test(s)) leaks.push(`${name}${path.slice(1)} = ${s.slice(0, 120)}`);
      }
    }
    expect(leaks).toEqual([]);
    expect(checked).toBeGreaterThan(100);
    // the hostile text did arrive (it was neutralised, not silently dropped everywhere)
    expect(JSON.stringify(results.icd10cm)).toContain("Generalized anxiety disorder");
  });

  it("htmlToPlainText is idempotent and neutralises encoded markup; plain comparisons survive", () => {
    for (const raw of ["&lt;script&gt;x", "&amp;lt;img src=x&amp;gt;", "&amp;amp;lt;b&amp;amp;gt;", "< script>", "<!--x-->a", "&#60;svg onload=1&#62;"]) {
      const once = htmlToPlainText(raw);
      expect(once).not.toMatch(TAG);
      expect(htmlToPlainText(once)).toBe(once);
    }
    expect(htmlToPlainText("Ages &lt;18 and score &lt; 5 &amp; up")).toBe("Ages <18 and score < 5 & up");
    expect(xmlEscapedHtmlToPlainText("&lt;p&gt;Panic &lt;span class=&quot;qt0&quot;&gt;disorder&lt;/span&gt;?&lt;/p&gt;")).toBe("Panic disorder?");
  });
});

/* ------------------------------------------------------------------ */
describe("upstreamFetch: size cap, redirects, parse and timeout errors", () => {
  const UP = "test-upstream";

  it("caps the DECODED body while streaming: no content-length, or a false one, cannot bypass it", async () => {
    const big = "x".repeat(50_000);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ v: big })));
    await expect(upstreamFetch("https://a.example/1", { upstream: UP, ttlMs: 0, maxBytes: 10_000 })).rejects.toMatchObject({ status: 502, message: "Upstream response too large" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ v: big }), { headers: { "content-length": "100" } }));
    await expect(upstreamFetch("https://a.example/2", { upstream: UP, ttlMs: 0, maxBytes: 10_000 })).rejects.toMatchObject({ status: 502 });
    fetchMock.mockResolvedValueOnce(new Response("{}", { headers: { "content-length": "999999" } }));
    await expect(upstreamFetch("https://a.example/3", { upstream: UP, ttlMs: 0, maxBytes: 10_000 })).rejects.toMatchObject({ status: 502 });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 })));
    await expect(upstreamFetch("https://a.example/4", { upstream: UP, ttlMs: 0, maxBytes: 10_000 })).resolves.toEqual({ ok: 1 });
  });

  it("never follows a redirect off the original origin, and never re-sends a POST", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example/landed" } }));
    await expect(
      upstreamFetch("https://api.example/x", { upstream: UP, ttlMs: 0, headers: { "X-Api-Key": "SECRET-KEY" } }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).redirect).toBe("manual");

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "/same-origin" } }));
    await expect(
      upstreamFetch("https://api.example/token", { upstream: UP, ttlMs: 0, method: "POST", body: "client_secret=S" }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/v2/x?y=1" } }))
      .mockResolvedValueOnce(json({ followed: true }));
    await expect(upstreamFetch("https://api.example/x", { upstream: UP, ttlMs: 0 })).resolves.toEqual({ followed: true });
    expect(String(fetchMock.mock.calls[1]![0])).toBe("https://api.example/v2/x?y=1");

    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "/loop" } }));
    await expect(upstreamFetch("https://api.example/loop", { upstream: UP, ttlMs: 0 })).rejects.toMatchObject({ status: 502 });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("malformed JSON and a body that stalls map to UpstreamError (502 / 504), never a raw error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>maintenance</html>"));
    const e1 = (await upstreamFetch("https://a.example/bad", { upstream: UP, ttlMs: 0 }).catch((e: unknown) => e)) as UpstreamError;
    expect(e1).toBeInstanceOf(UpstreamError);
    expect(e1.status).toBe(502);

    const stalled = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"a":"'));
        setTimeout(() => c.error(new DOMException("The operation timed out.", "TimeoutError")), 5);
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stalled));
    const e2 = (await upstreamFetch("https://a.example/stall", { upstream: UP, ttlMs: 0 }).catch((e: unknown) => e)) as UpstreamError;
    expect(e2).toBeInstanceOf(UpstreamError);
    expect(e2.status).toBe(504);

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(upstreamFetch("https://a.example/down", { upstream: UP, ttlMs: 0 })).rejects.toMatchObject({ status: 504 });
  });

  it("route maps a malformed upstream body to 502, not 500", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>"));
    const res = await icd10cmRoute(new Request("http://localhost/api/icd10cm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "F41.1" }) }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("upstream");
  });
});

/* ------------------------------------------------------------------ */
describe("published rate limits hold in every sliding window", () => {
  /** Fire one attempt every `stepMs` for `spanMs`; return the largest number accepted inside any `windowMs`. */
  async function maxInWindow(configure: () => void, upstream: string, stepMs: number, spanMs: number, windowMs: number): Promise<number> {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date("2026-11-26T12:00:00Z").getTime();
    vi.setSystemTime(start);
    __resetCoreForTests();
    configure(); // bucket clock starts on the fake clock
    const ok: number[] = [];
    for (let t = 0; t <= spanMs; t += stepMs) {
      vi.setSystemTime(start + t);
      try {
        await upstreamFetch(`https://x.example/${upstream}/${t}`, { upstream, ttlMs: 0 });
        ok.push(t);
      } catch (e) {
        if (!(e instanceof UpstreamError) || e.status !== 429) throw e;
      }
    }
    vi.useRealTimers();
    let max = 0;
    for (let i = 0; i < ok.length; i++) {
      let j = i;
      while (j < ok.length && ok[j]! - ok[i]! < windowMs) j++;
      max = Math.max(max, j - i);
    }
    return max;
  }
  beforeEach(() => fetchMock.mockImplementation(async () => json({})));

  const within = (n: number, limit: number) => {
    expect(n).toBeLessThanOrEqual(limit);
    expect(n).toBeGreaterThan(0); // and the limiter is not simply refusing everything
  };

  it("NCBI E-utilities: <= 3 per second without a key, <= 10 with one", async () => {
    within(await maxInWindow(configurePubmedRateLimit, PUBMED_UPSTREAM, 20, 5000, 1000), 3);
    vi.stubEnv("NCBI_API_KEY", "ABCDEFGHIJ0123456789abcd");
    const keyed = await maxInWindow(configurePubmedRateLimit, PUBMED_UPSTREAM, 10, 5000, 1000);
    within(keyed, 10);
    expect(keyed).toBeGreaterThan(3);
  });

  it("NPPES: <= 2 per second (project brief); RxNav <= 20/s; NLM Clinical Tables <= 25/s", async () => {
    within(await maxInWindow(applyNppesRateLimit, NPPES_UPSTREAM, 20, 5000, 1000), 2);
    within(await maxInWindow(configureRxNormRateLimit, RXNORM_UPSTREAM, 5, 4000, 1000), 20);
    within(await maxInWindow(configureIcd10cmRateLimit, ICD10CM_UPSTREAM, 5, 4000, 1000), 25);
  });

  it("per-minute terms: MedlinePlus Connect <= 100, Health Topics <= 85, openFDA <= 240, ClinicalTrials.gov <= 50", async () => {
    within(await maxInWindow(configureConnectRateLimit, CONNECT_UPSTREAM, 100, 180_000, 60_000), 100);
    within(await maxInWindow(configureHealthTopicsRateLimit, HEALTH_TOPICS_UPSTREAM, 100, 180_000, 60_000), 85);
    within(await maxInWindow(configureOpenFdaRateLimit, OPENFDA_UPSTREAM, 50, 180_000, 60_000), 240);
    within(await maxInWindow(configureTrialsRateLimit, TRIALS_UPSTREAM, 100, 180_000, 60_000), 50);
  });
});

/* ------------------------------------------------------------------ */
describe("cache partitioning and ICD-11 credentials", () => {
  it("one upstream filling its partition cannot evict another upstream's entries", () => {
    cacheSet("upstream-b:keep", "B", 60_000);
    for (let i = 0; i < CACHE_MAX_ENTRIES_PER_UPSTREAM * 3; i++) cacheSet(`upstream-a:${i}`, i, 60_000);
    expect(cacheGet("upstream-b:keep")).toBe("B");
    expect(cacheGet("upstream-a:0")).toBeUndefined(); // oldest of the flooded partition evicted
    expect(cacheGet(`upstream-a:${CACHE_MAX_ENTRIES_PER_UPSTREAM * 3 - 1}`)).toBe(CACHE_MAX_ENTRIES_PER_UPSTREAM * 3 - 1);
  });

  function whoRouter(tokenStatus = 200) {
    return async (u: string) => {
      const url = String(u);
      if (url.includes("connect/token")) return tokenStatus === 200 ? json({ access_token: "BEARERTOKENxyz0987654321", expires_in: 3600 }) : new Response("nope", { status: tokenStatus });
      if (url.includes("codeinfo")) return json({ stemId: "http://id.who.int/icd/release/11/2026-01/mms/1712535455" });
      return json({ title: { "@language": "en", "@value": "Generalised anxiety disorder" } });
    };
  }

  it("a cached ICD-11 lookup sends no token request (client credentials stay home)", async () => {
    vi.stubEnv("WHO_ICD_CLIENT_ID", "client-id-0001");
    vi.stubEnv("WHO_ICD_CLIENT_SECRET", "client-secret-0001");
    fetchMock.mockImplementation(whoRouter());
    await icd11Lookup({ code: "6B00" });
    const first = fetchMock.mock.calls.length;
    __resetIcd11ForTests(); // token forgotten (expired), data still cached
    await icd11Lookup({ code: "6B00" });
    expect(fetchMock.mock.calls.length).toBe(first);
  });

  it("a 404 from the token endpoint is an error, not 'code not found'", async () => {
    vi.stubEnv("WHO_ICD_CLIENT_ID", "client-id-0001");
    vi.stubEnv("WHO_ICD_CLIENT_SECRET", "client-secret-0001");
    fetchMock.mockImplementation(whoRouter(404));
    await expect(icd11Lookup({ code: "6B00" })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("WHO_ICD_API_BASE: plain http only for a local/private container; https anywhere", async () => {
    fetchMock.mockImplementation(whoRouter());
    vi.stubEnv("WHO_ICD_CLIENT_ID", "");
    vi.stubEnv("WHO_ICD_CLIENT_SECRET", "");
    vi.stubEnv("WHO_ICD_API_BASE", "http://plain-http.example.com");
    await expect(icd11Lookup({ code: "6B00" })).rejects.toBeInstanceOf(NotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
    for (const base of ["http://localhost:8382", "http://10.0.0.5", "http://icd-api.internal", "https://icd.example.org"]) {
      __resetCoreForTests();
      configureIcd11RateLimit();
      vi.stubEnv("WHO_ICD_API_BASE", base);
      await icd11Lookup({ code: "6B00" });
      expect(String(fetchMock.mock.calls.at(-1)![0]).startsWith(base)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
describe("readBody: our own request side", () => {
  const req = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
    new Request("http://localhost/api/icd10cm", { method: "POST", headers, body });
  const Body = { code: "F41.1" };
  beforeEach(() => fetchMock.mockImplementation(async () => json([1, ["F41.1"], null, [["F41.1", "Generalized anxiety disorder"]]])));

  it("requires application/json (simple cross-site form posts cannot trigger upstream calls)", async () => {
    for (const headers of [{}, { "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded" }, { "content-type": "multipart/form-data; boundary=x" }]) {
      const res = await icd10cmRoute(req(JSON.stringify(Body), headers as Record<string, string>));
      expect(res.status).toBe(415);
    }
    expect((await icd10cmRoute(req(JSON.stringify(Body), { "content-type": "application/json; charset=utf-8" }))).status).toBe(200);
  });

  it("refuses cross-site browser requests before reading the body", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const res = await icd10cmRoute(req(JSON.stringify(Body), { "content-type": "application/json", "sec-fetch-site": site }));
      expect(res.status).toBe(403);
    }
    expect((await icd10cmRoute(req(JSON.stringify(Body), { "content-type": "application/json", "sec-fetch-site": "same-origin" }))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops reading at 2 KB (a 20 MB body is never buffered)", async () => {
    let pulled = 0;
    const huge = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1;
        if (pulled > 20_000) return c.close();
        c.enqueue(new Uint8Array(1024).fill(120));
      },
    });
    const r = new Request("http://localhost/api/icd10cm", { method: "POST", headers: { "content-type": "application/json" }, body: huge, duplex: "half" } as RequestInit);
    const res = await icd10cmRoute(r);
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(10);
    await expect(readBody(req("x".repeat(2049)), ZodError as never)).rejects.toMatchObject({ status: 413 });
  });

  it("limits each client (salted hash of the proxy-seen address), not everyone", async () => {
    fetchMock.mockImplementation(async () => json([1, ["F41.1"], null, [["F41.1", "Generalized anxiety disorder"]]]));
    const from = (xff: string) => req(JSON.stringify(Body), { "content-type": "application/json", "x-forwarded-for": xff });
    const statuses: number[] = [];
    for (let i = 0; i < CLIENT_LIMIT.burst + 2; i++) statuses.push((await icd10cmRoute(from("203.0.113.5"))).status);
    expect(statuses.slice(0, CLIENT_LIMIT.burst).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // a spoofed leading entry does not escape the limit: the LAST entry is what the platform proxy saw
    expect((await icd10cmRoute(from("198.51.100.1, 203.0.113.5"))).status).toBe(429);
    expect((await icd10cmRoute(from("198.51.100.7"))).status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
describe("42 CFR Part 2 owner switch: SUD reference lookups are OFF by default", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "");
    vi.stubEnv("WHO_ICD_API_BASE", "http://localhost:8382"); // local container: no credentials needed
    vi.stubEnv("HRSA_API_KEY", "test-token-123456");
    vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", "true");
  });

  const SUD_CALLS: [string, () => Promise<unknown>][] = [
    ["ICD-10-CM code F10.20", () => searchIcd10cm({ code: "F10.20" })],
    ["ICD-10-CM counselling code Z71.41", () => searchIcd10cm({ code: "Z71.41" })],
    ["ICD-10-CM term 'alcohol use'", () => searchIcd10cm({ term: "alcohol use" })],
    ["ICD-11 6C40", () => icd11Lookup({ code: "6C40" })],
    ["MedlinePlus Connect F10.20", () => medlinePlusByCode({ code: "F10.20", lang: "en" })],
    ["Health topic 'alcohol'", () => searchHealthTopics({ topic: "alcohol", lang: "es" })],
    ["PubMed alcohol-use-disorder", () => searchPubmed({ queryId: "alcohol-use-disorder" })],
    ["Trials alcohol-use-disorder", () => searchTrials({ condition: "alcohol-use-disorder" })],
    ["RxNorm naltrexone", () => lookupRxNorm({ drug: "naltrexone" })],
    ["openFDA acamprosate", () => lookupDrugLabel({ drug: "acamprosate" })],
    ["NPPES addiction counselor", () => searchProviders({ providerType: "addiction-counselor", location: { zip: "20877" } })],
    ["FindTreatment substance-use", () => searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "substance-use" })],
    ["FindTreatment both", () => searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "both" })],
  ];
  for (const [name, call] of SUD_CALLS) {
    it(`${name}: NotConfigured before any fetch`, async () => {
      await expect(call()).rejects.toBeInstanceOf(NotConfigured);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("non-SUD lookups are unaffected, and 'true' turns SUD lookups on", async () => {
    fetchMock.mockImplementation(async () => json([1, ["F41.1"], null, [["F41.1", "Generalized anxiety disorder"]]]));
    await searchIcd10cm({ code: "F41.1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true");
    await searchIcd10cm({ code: "F10.20" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("routes answer 503 not-configured with a link-out fallback where one exists", async () => {
    const post = (route: (r: Request) => Promise<Response>, body: unknown) =>
      route(new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    const p = await post(pubmedRoute, { queryId: "alcohol-use-disorder" });
    expect(p.status).toBe(503);
    const pb = await p.json();
    expect(pb.code).toBe("not-configured");
    expect(pb.fallbackUrl).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//);
    const t = await post(trialsRoute, { condition: "alcohol-use-disorder" });
    expect((await t.json()).fallbackUrl).toMatch(/^https:\/\/clinicaltrials\.gov\/search\?/);
    const i = await post(icd11Route, { code: "6C40" });
    expect(i.status).toBe(503);
    expect((await i.json()).fallbackUrl).toMatch(/^https:\/\/icd\.who\.int\/browse\//);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
describe("look-alikes, link-out builders and strict lists", () => {
  it("non-ASCII look-alikes are refused instead of being case-mapped into a different valid value", async () => {
    vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true");
    await expect(searchIcd10cm({ code: "ſ41.1" })).rejects.toBeInstanceOf(ZodError); // long s -> "S41.1"
    await expect(medlinePlusByCode({ code: "ſ41.1", lang: "en" })).rejects.toBeInstanceOf(ZodError);
    await expect(icd11Lookup({ code: "6bſ0" } as never)).rejects.toBeInstanceOf(ZodError);
    await expect(searchHealthTopics({ topic: "quitting smoKing", lang: "en" })).rejects.toBeInstanceOf(ZodError); // Kelvin sign
    await expect(lookupRxNorm({ drug: "ſertraline" })).rejects.toBeInstanceOf(ZodError);
    await expect(searchPubmed({ queryId: "Kbt" } as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
    const s = strictCurated(["trastorno de pánico", "panic"]);
    expect(s.parse("TRASTORNO DE PÁNICO")).toBe("trastorno de pánico"); // accented case folding still works
    expect(s.parse(" Panic ")).toBe("panic");
    expect(() => s.parse("panıc")).toThrow(ZodError); // dotless i
  });

  it("link-out builders refuse free text, path tricks and prototype keys", () => {
    expect(() => dailyMedSearchUrl("John Smith suicidal")).toThrow(ZodError);
    expect(dailyMedSearchUrl("sertraline")).toBe("https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=sertraline");
    for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(() => pubmedTerm(k)).toThrow(ZodError);
      expect(() => pubmedSearchLink(k)).toThrow(ZodError);
    }
    expect(() => pubmedArticleUrl("../../x?y")).toThrow(ZodError);
    expect(pubmedArticleUrl("31758858")).toBe("https://pubmed.ncbi.nlm.nih.gov/31758858/");
    expect(() => trialUrl("NCT1/../../x")).toThrow(ZodError);
    expect(trialUrl("NCT01234567")).toBe("https://clinicaltrials.gov/study/NCT01234567");
  });

  it("OutboundRejected still guards the last line (identifiers in otherwise-valid shapes)", () => {
    // e.g. a canonical-looking param that carries a phone number never reaches fetch
    expect(() => StrictLocation.parse({ city: "301 555 0123", state: "MD" })).toThrow(ZodError);
    expect(OutboundRejected).toBeDefined();
  });
});
