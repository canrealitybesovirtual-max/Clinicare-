import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { OutboundRejected } from "@/lib/outbound";
import { PART2_NOTICE } from "@/lib/referral-links";
import { NotConfigured, USER_AGENT, UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  NPPES_ATTRIBUTION,
  NPPES_SOURCE_URL,
  PROVIDER_TAXONOMIES,
  PROVIDER_TYPES,
  applyNppesRateLimit,
  searchProviders,
} from "@/server/integrations/nppes";
import { POST, runtime } from "@/server/routes/providers";

/* Shapes copied from a live NPPES v2.1 response (2026-11-26), with invented names/numbers. */
const psychiatrist = {
  number: "1000000001",
  enumeration_type: "NPI-1",
  basic: { first_name: "ALEX", last_name: "O'NEILL-RIVERA", credential: "M.D.", status: "A", last_updated: "2024-10-01", sex: "F" },
  addresses: [
    { address_1: "PO BOX 1", address_purpose: "MAILING", city: "ELSEWHERE", state: "VA", postal_code: "220000000", telephone_number: "703-555-0100" },
    { address_1: "100 MAIN ST", address_2: "STE 2", address_purpose: "LOCATION", city: "GAITHERSBURG", state: "MD", postal_code: "208771234", telephone_number: "3015550101" },
  ],
  taxonomies: [
    { code: "2084N0400X", desc: "Psychiatry & Neurology, Neurology", primary: false, state: "MD", license: "D0000" },
    { code: "2084P0800X", desc: "Psychiatry & Neurology, Psychiatry", primary: true, state: "MD", license: "D0000" },
  ],
};
const neurologistOnly = {
  number: "1000000002",
  enumeration_type: "NPI-1",
  basic: { first_name: "SAM", last_name: "LEE", credential: "MD", status: "A" },
  addresses: [{ address_1: "1 OAK ST", address_purpose: "LOCATION", city: "GAITHERSBURG", state: "MD", postal_code: "20877", telephone_number: "301-555-0102" }],
  taxonomies: [{ code: "2084N0400X", desc: "Psychiatry & Neurology, Neurology", primary: true }],
};
const organization = {
  number: "1000000003",
  enumeration_type: "NPI-2",
  basic: { organization_name: "<b>EXAMPLE</b> BEHAVIORAL HEALTH &amp; WELLNESS LLC", authorized_official_first_name: "PAT", authorized_official_last_name: "DOE", status: "A" },
  addresses: [{ address_1: "9 ELM RD", address_purpose: "LOCATION", city: "GAITHERSBURG", state: "MD", postal_code: "20877", telephone_number: "(301) 555-0103" }],
  taxonomies: [{ code: "2084P0800X", desc: "Psychiatry & Neurology, Psychiatry", primary: true }],
};
const secondPsychiatrist = { ...psychiatrist, number: "1000000004", basic: { ...psychiatrist.basic, first_name: "JO", last_name: "KIM", credential: "DO" } };
const FIXTURE = { result_count: 4, results: [psychiatrist, neurologistOnly, organization, secondPsychiatrist] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const calledUrl = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const route = (body: unknown) =>
  POST(new Request("http://localhost/api/providers", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  __resetCoreForTests();
  applyNppesRateLimit();
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true"); // owner switch; its default (off) is tested below
  fetchMock = vi.fn(async () => json(FIXTURE));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("NPPES providers: upstream URL carries only curated taxonomy + ZIP/city", () => {
  it("ZIP search builds the exact documented query", async () => {
    await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = calledUrl();
    expect(url.origin + url.pathname).toBe("https://npiregistry.cms.hhs.gov/api/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      version: "2.1",
      taxonomy_description: "Psychiatry",
      address_purpose: "LOCATION",
      limit: "80",
      skip: "0",
      postal_code: "20877",
    });
  });

  it("city + state search sends city and state, no ZIP", async () => {
    await searchProviders({ providerType: "clinical-social-worker", location: { city: "Baltimore", state: "MD" }, limit: 50, skip: 200 });
    expect(Object.fromEntries(calledUrl().searchParams)).toEqual({
      version: "2.1",
      taxonomy_description: "Social Worker",
      address_purpose: "LOCATION",
      limit: "200",
      skip: "200",
      city: "Baltimore",
      state: "MD",
    });
  });

  it("every provider type maps to a curated query term and NUCC code(s)", async () => {
    expect(PROVIDER_TYPES).toHaveLength(9);
    const codes = PROVIDER_TYPES.flatMap((t) => PROVIDER_TAXONOMIES[t].codes.map((c) => c.code));
    for (const c of codes) expect(c).toMatch(/^[0-9]{3}[0-9A-Z]{6}X$/);
    expect(new Set(codes)).toEqual(
      new Set(["2084P0800X", "363LP0808X", "103T00000X", "103TC0700X", "101YP2500X", "101YM0800X", "1041C0700X", "106H00000X", "101YA0400X"]),
    );
    for (const t of PROVIDER_TYPES) {
      fetchMock.mockClear();
      __resetCoreForTests();
      applyNppesRateLimit();
      await searchProviders({ providerType: t, location: { zip: "20877" } });
      expect(calledUrl().searchParams.get("taxonomy_description")).toBe(PROVIDER_TAXONOMIES[t].query);
    }
  });

  it("sends a generic User-Agent, GET, no body, no cookies", async () => {
    await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } });
    const init = fetchMock.mock.calls[0]![1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers["User-Agent"]).toBe(USER_AGENT);
    expect(JSON.stringify(init.headers)).not.toMatch(/cookie|@/i);
  });
});

describe("NPPES providers: free text and identifiers are rejected before any fetch", () => {
  const bad: [string, unknown][] = [
    ["free-text provider type", { providerType: "my client John has panic attacks", location: { zip: "20877" } }],
    ["taxonomy text instead of curated id", { providerType: "Psychiatry & Neurology, Psychiatry", location: { zip: "20877" } }],
    ["ZIP+4", { providerType: "psychiatrist", location: { zip: "20877-1234" } }],
    ["short ZIP", { providerType: "psychiatrist", location: { zip: "2087" } }],
    ["street address as city", { providerType: "psychiatrist", location: { city: "123 Main Street", state: "MD" } }],
    ["city without state", { providerType: "psychiatrist", location: { city: "Baltimore" } }],
    ["unknown state", { providerType: "psychiatrist", location: { city: "Baltimore", state: "XX" } }],
    ["zip and city together", { providerType: "psychiatrist", location: { zip: "20877", city: "Gaithersburg", state: "MD" } }],
    ["extra key on location", { providerType: "psychiatrist", location: { zip: "20877", note: "client lives near here" } }],
    ["extra top-level key", { providerType: "psychiatrist", location: { zip: "20877" }, notes: "client reports panic" }],
    ["long city", { providerType: "psychiatrist", location: { city: "A".repeat(41), state: "MD" } }],
    ["limit above 50", { providerType: "psychiatrist", location: { zip: "20877" }, limit: 51 }],
    ["skip above 1000", { providerType: "psychiatrist", location: { zip: "20877" }, skip: 1001 }],
    ["string limit", { providerType: "psychiatrist", location: { zip: "20877" }, limit: "20" }],
    ["email in provider type", { providerType: "jane.doe@example.com", location: { zip: "20877" } }],
  ];
  for (const [name, input] of bad) {
    it(`rejects ${name}`, async () => {
      await expect(searchProviders(input as never)).rejects.toBeInstanceOf(ZodError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("rejects a person's name in the city field (not a place in that state)", async () => {
    await expect(searchProviders({ providerType: "psychiatrist", location: { city: "John Smith", state: "MD" } })).rejects.toSatisfy(
      (e) => e instanceof ZodError || e instanceof OutboundRejected,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  for (const city of ["Suicidal Ideation", "Hears Voices At Night", "Opioid Withdrawal", "Alcohol Relapse", "Uses Meth Daily"]) {
    it(`never sends letters-only clinical or substance-use text as city= ("${city}")`, async () => {
      await expect(
        searchProviders({ providerType: "addiction-counselor", location: { city, state: "OH" } }),
      ).rejects.toBeInstanceOf(ZodError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("sends the canonical gazetteer spelling, not the typed text", async () => {
    await searchProviders({ providerType: "psychiatrist", location: { city: "st. louis", state: "MO" } });
    await searchProviders({ providerType: "psychiatrist", location: { city: "CHARLOTTE", state: "NC" } });
    expect(calledUrl(0).searchParams.get("city")).toBe("Saint Louis");
    expect(calledUrl(1).searchParams.get("city")).toBe("Charlotte");
  });

  it("addiction-counselor searches stay off until the owner enables SUD reference lookups (42 CFR Part 2)", async () => {
    vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "");
    await expect(searchProviders({ providerType: "addiction-counselor", location: { zip: "20877" } })).rejects.toBeInstanceOf(NotConfigured);
    const res = await route({ providerType: "addiction-counselor", location: { zip: "20877" } });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
    await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } }); // non-SUD types unaffected
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("route answers 400 without echoing the planted identifiers", async () => {
    const planted = ["John Smith", "555-123-4567", "123-45-6789", "jane.doe@example.com", "01/02/1980"];
    for (const p of planted) {
      const res = await route({ providerType: p, location: { city: p, state: "MD" }, notes: p });
      expect(res.status).toBe(400);
      expect(await res.text()).not.toContain(p);
    }
    const big = await route(JSON.stringify({ providerType: "psychiatrist", location: { zip: "20877" }, pad: "x".repeat(3000) }));
    expect(big.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("NPPES providers: normalisation", () => {
  it("filters to the exact taxonomy and returns only referral fields", async () => {
    const r = await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } });
    expect(r.results.map((p) => p.npi)).toEqual(["1000000001", "1000000003", "1000000004"]);
    const [p, org] = r.results;
    expect(p).toEqual({
      npi: "1000000001",
      kind: "individual",
      displayName: "Alex O'Neill-Rivera, M.D.",
      credential: "M.D.",
      taxonomy: { code: "2084P0800X", description: "Psychiatry & Neurology, Psychiatry", primary: true, state: "MD" },
      address: { line: "100 MAIN ST, STE 2", city: "Gaithersburg", state: "MD", zip5: "20877" },
      phone: "301-555-0101",
      lastUpdated: "2024-10-01",
      registryUrl: "https://npiregistry.cms.hhs.gov/provider-view/1000000001",
    });
    expect(org!.kind).toBe("organization");
    expect(org!.displayName).toBe("EXAMPLE BEHAVIORAL HEALTH & WELLNESS LLC");
    expect(org!.phone).toBe("301-555-0103");
    const text = JSON.stringify(r);
    for (const dropped of ["PO BOX", "ELSEWHERE", "D0000", '"sex"', "PAT", "DOE"]) expect(text).not.toContain(dropped);
    expect(r.part2Notice).toBeNull();
    expect(r.location).toBe("ZIP 20877");
    expect(r.finder.url).toBe("https://npiregistry.cms.hhs.gov/search");
  });

  it("pages by raw upstream offset", async () => {
    const page = await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" }, limit: 2 });
    expect(page.results).toHaveLength(2);
    expect(page.nextSkip).toBe(3); // consumed records 0..2, next page starts at the 4th raw record
    __resetCoreForTests();
    applyNppesRateLimit();
    const all = await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" }, limit: 20 });
    expect(all.nextSkip).toBeNull(); // short upstream page: nothing more
    fetchMock.mockImplementation(async () => json({ result_count: 200, results: Array.from({ length: 200 }, () => neurologistOnly) }));
    const capped = await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" }, limit: 50, skip: 900 });
    expect(capped.nextSkip).toBeNull(); // 900 + 200 would exceed the 1,000 skip cap
  });

  it("addiction counselor results carry the 42 CFR Part 2 reminder", async () => {
    fetchMock.mockImplementation(async () =>
      json({ results: [{ ...psychiatrist, taxonomies: [{ code: "101YA0400X", desc: "Counselor, Addiction (Substance Use Disorder)", primary: true }] }] }),
    );
    const r = await searchProviders({ providerType: "addiction-counselor", location: { zip: "10001" } });
    expect(r.results).toHaveLength(1);
    expect(r.part2Notice).toContain(PART2_NOTICE);
    expect(calledUrl().searchParams.get("taxonomy_description")).toBe("Addiction (Substance Use Disorder)");
  });
});

describe("NPPES providers: errors, caching, rate limiting, attribution", () => {
  it("maps upstream HTTP errors and NPPES Errors payloads to UpstreamError", async () => {
    fetchMock.mockImplementation(async () => new Response("oops", { status: 500 }));
    await expect(searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockImplementation(async () => json({ Errors: [{ description: "No taxonomy codes found", field: "taxonomy_description", number: "14" }] }));
    await expect(searchProviders({ providerType: "psychiatrist", location: { zip: "20878" } })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    __resetCoreForTests(); // two requests used the burst above
    applyNppesRateLimit();
    const res = await route({ providerType: "psychiatrist", location: { zip: "20879" } });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "upstream" });
    expect(JSON.stringify(body)).not.toContain("20879");
  });

  it("caches identical queries", async () => {
    const a = await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } });
    const b = await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it("limits to 2 requests per second (burst 2), refusing before fetch", async () => {
    await searchProviders({ providerType: "psychiatrist", location: { zip: "20877" } });
    await searchProviders({ providerType: "psychiatrist", location: { zip: "20878" } });
    await expect(searchProviders({ providerType: "psychiatrist", location: { zip: "20879" } })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const res = await route({ providerType: "psychiatrist", location: { zip: "20880" } });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate-limited");
  });

  it("route returns data with NPPES attribution and source", async () => {
    expect(runtime).toBe("nodejs");
    const res = await route({ providerType: "psychiatrist", location: { zip: "20877" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.attribution).toBe(NPPES_ATTRIBUTION);
    expect(body.attribution).toMatch(/CMS NPPES NPI Registry/);
    expect(body.attribution).toMatch(/not an endorsement/);
    expect(body.source).toBe(NPPES_SOURCE_URL);
    expect(body.data.results).toHaveLength(3);
  });
});
