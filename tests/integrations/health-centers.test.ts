import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { OutboundRejected } from "@/lib/outbound";
import { HRSA_FINDER_URL, healthCenterLink as linkFromLib } from "@/lib/referral-links";
import { NotConfigured, UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  HRSA_API_BASE,
  HRSA_ATTRIBUTION,
  HRSA_SOURCE_URL,
  SLIDING_FEE_NOTE,
  applyHrsaRateLimit,
  healthCenterLink,
  searchHealthCenters,
} from "@/server/integrations/hrsa";
import { TIGERWEB_MAPSERVER, applyGeoRateLimit, zipCentroid } from "@/server/integrations/referral-common";
import { POST, runtime } from "@/server/routes/health-centers";

/* Shape from the HRSA Developer Guide sample (GetHealthCentersAroundALocation), invented values. */
const row = (o: Record<string, unknown>) => ({
  Row_ID: 1,
  SITE_NM: "Example Community Health",
  SITE_URL: "www.example-chc.org",
  HCC_FCT_ID: 1001,
  SITE_ADDRESS: "10 Center St Ste 1",
  SITE_CITY: "GAITHERSBURG",
  STATE_NM: "Maryland",
  SITE_STATE_ABBR: "MD",
  SITE_ZIP_CD: "20877-1111",
  SITE_PHONE_NUM: "301-555-0110",
  HCC_LOC_DESC: "Permanent",
  HCC_TYP_DESC: "Service Delivery Site",
  DW_RECORD_CREATE_DT: "8/18/2026 12:00:00 AM",
  APPROX_VALUE_CD: "N",
  LAT_LON: "39.14 -77.19",
  Distance: 2.345,
  ...o,
});
const HCC = {
  HCC: [
    row({ HCC_FCT_ID: 1003, SITE_NM: "Far Site", Distance: 8.01, SITE_URL: "[No Data]" }),
    row({ HCC_FCT_ID: 1002, SITE_NM: "Admin Office", HCC_TYP_DESC: "Administrative", Distance: 0.2 }),
    row({ HCC_FCT_ID: 1001, Distance: 2.345 }),
    row({ HCC_FCT_ID: 1001, Distance: 2.345 }), // duplicate
    row({ HCC_FCT_ID: 1004, SITE_NM: "Rockville Site", SITE_CITY: "ROCKVILLE", HCC_TYP_DESC: "Administrative/Service Delivery Site", Distance: 5 }),
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const call = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i]! as [string, RequestInit];
  return { url: String(url), init, body: init.body ? JSON.parse(String(init.body)) : undefined };
};
const route = (body: unknown) => POST(new Request("http://localhost/api/health-centers", { method: "POST", body: JSON.stringify(body) }));
const reset = () => {
  __resetCoreForTests();
  applyHrsaRateLimit();
  applyGeoRateLimit();
};

beforeEach(() => {
  reset();
  fetchMock = vi.fn(async () => json(HCC));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("HRSA health centers: not configured without a registered token", () => {
  it("throws NotConfigured before any fetch and the route answers 503 not-configured", async () => {
    vi.stubEnv("HRSA_API_KEY", "");
    await expect(searchHealthCenters({ location: { zip: "20877" } })).rejects.toBeInstanceOf(NotConfigured);
    const res = await route({ location: { zip: "20877" } });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exports an official finder link fallback", () => {
    const link = healthCenterLink({ zip: "20877" });
    expect(link).toEqual(linkFromLib({ zip: "20877" }));
    expect(link.url).toBe(HRSA_FINDER_URL);
    expect(link.url).toBe("https://findahealthcenter.hrsa.gov/");
    expect(link.instructions).toContain("ZIP 20877");
    expect(healthCenterLink({ city: "Gaithersburg", state: "MD" }).instructions).toContain("Gaithersburg, MD");
  });
});

describe("HRSA health centers: outbound request", () => {
  beforeEach(() => vi.stubEnv("HRSA_API_KEY", "test-hdw-token"));

  it("ZIP -> local Census point -> POST GetHealthCentersAroundALocation with only coarse point + radius", async () => {
    await searchHealthCenters({ location: { zip: "20877" }, radiusMiles: 10, limit: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no geocoding call for a ZIP
    const { url, init, body } = call();
    expect(url).toBe(`${HRSA_API_BASE}/GetHealthCentersAroundALocation`);
    expect(new URL(url).search).toBe(""); // nothing in the URL, token included
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(body).toEqual({ Latitude: 39.14, Longitude: -77.19, Radius: 10, MinRecs: 20, MaxRadius: 10, RadiusIncrement: 5, Token: "test-hdw-token" });
    expect(zipCentroid("20877")).toEqual({ lat: 39.14, lng: -77.19, source: "census-zcta" });
  });

  it("ZIP that is not a ZCTA falls back to GetHealthCentersByArea { ZipCode }", async () => {
    const r = await searchHealthCenters({ location: { zip: "00000" } });
    const { url, body } = call();
    expect(url).toBe(`${HRSA_API_BASE}/GetHealthCentersByArea`);
    expect(body).toEqual({ ZipCode: "00000", Token: "test-hdw-token" });
    expect(r.method).toBe("zip");
    expect(r.radiusMiles).toBeNull();
  });

  it("city + state -> TIGERweb place point (city + state FIPS only) -> radius search", async () => {
    fetchMock.mockImplementation(async (u: string) => {
      if (u.startsWith(`${TIGERWEB_MAPSERVER}?`)) return json({ layers: [{ id: 28, name: "Incorporated Places" }, { id: 29, name: "Incorporated Places Labels" }, { id: 30, name: "Census Designated Places" }] });
      if (u.startsWith(`${TIGERWEB_MAPSERVER}/28/query?`)) return json({ features: [{ attributes: { BASENAME: "Gaithersburg", STATE: "24", INTPTLAT: "+39.1346176", INTPTLON: "-077.2131346" } }] });
      return json(HCC);
    });
    const r = await searchHealthCenters({ location: { city: "Gaithersburg", state: "MD" }, radiusMiles: 25 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Object.fromEntries(new URL(call(0).url).searchParams)).toEqual({ f: "json" });
    expect(Object.fromEntries(new URL(call(1).url).searchParams)).toEqual({
      where: "STATE='24' AND UPPER(BASENAME)='GAITHERSBURG'",
      outFields: "BASENAME,STATE,INTPTLAT,INTPTLON",
      returnGeometry: "false",
      f: "json",
    });
    expect(call(2).body).toMatchObject({ Latitude: 39.13, Longitude: -77.21, Radius: 25, MaxRadius: 25 });
    expect(r.method).toBe("distance");
    expect(r.location).toBe("Gaithersburg, MD");
  });

  it("escapes apostrophes in city names for the ArcGIS where clause", async () => {
    fetchMock.mockImplementation(async (u: string) => {
      if (u.startsWith(`${TIGERWEB_MAPSERVER}?`)) return json({ layers: [{ id: 28, name: "Incorporated Places" }] });
      if (u.includes("/query?")) return json({ features: [{ attributes: { INTPTLAT: "38.8", INTPTLON: "-90.7" } }] });
      return json(HCC);
    });
    await searchHealthCenters({ location: { city: "O'Fallon", state: "MO" } });
    expect(new URL(call(1).url).searchParams.get("where")).toBe("STATE='29' AND UPPER(BASENAME)='O''FALLON'");
  });

  it("if the place lookup fails, falls back to a state-wide area search filtered to the city", async () => {
    fetchMock.mockImplementation(async (u: string) => (u.startsWith(TIGERWEB_MAPSERVER) ? new Response("down", { status: 503 }) : json(HCC)));
    const r = await searchHealthCenters({ location: { city: "Rockville", state: "MD" } });
    const last = call(fetchMock.mock.calls.length - 1);
    expect(last.url).toBe(`${HRSA_API_BASE}/GetHealthCentersByArea`);
    expect(last.body).toEqual({ StateFipsCode: "24", Token: "test-hdw-token" });
    expect(r.method).toBe("state-city");
    expect(r.sites.map((s) => s.name)).toEqual(["Rockville Site"]);
  });

  const bad: [string, unknown][] = [
    ["free text location", { location: { city: "near my client's house on 5th", state: "MD" } }],
    ["street address", { location: { city: "10 Center St", state: "MD" } }],
    ["ZIP+4", { location: { zip: "20877-1111" } }],
    ["unsupported radius", { location: { zip: "20877" }, radiusMiles: 7 }],
    ["string radius", { location: { zip: "20877" }, radiusMiles: "10" }],
    ["extra key", { location: { zip: "20877" }, reason: "uninsured client with depression" }],
    ["county name field", { location: { zip: "20877" }, county: "Montgomery" }],
    ["limit 0", { location: { zip: "20877" }, limit: 0 }],
  ];
  for (const [name, input] of bad) {
    it(`rejects ${name} before any fetch`, async () => {
      await expect(searchHealthCenters(input as never)).rejects.toBeInstanceOf(ZodError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("rejects a name-like city with OutboundRejected before any fetch", async () => {
    await expect(searchHealthCenters({ location: { city: "John Smith", state: "MD" } })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validation runs before the configuration check", async () => {
    vi.stubEnv("HRSA_API_KEY", "");
    await expect(searchHealthCenters({ location: { zip: "bad" } } as never)).rejects.toBeInstanceOf(ZodError);
  });
});

describe("HRSA health centers: normalisation, errors, caching, rate limiting", () => {
  beforeEach(() => vi.stubEnv("HRSA_API_KEY", "test-hdw-token"));

  it("drops administrative-only sites, dedupes, sorts by distance and normalises fields", async () => {
    const r = await searchHealthCenters({ location: { zip: "20877" } });
    expect(r.sites.map((s) => s.name)).toEqual(["Example Community Health", "Rockville Site", "Far Site"]);
    expect(r.sites[0]).toEqual({
      id: "1001",
      name: "Example Community Health",
      address: { line: "10 Center St Ste 1", city: "Gaithersburg", state: "MD", zip5: "20877" },
      phone: "301-555-0110",
      website: "https://www.example-chc.org/",
      siteType: "Service Delivery Site",
      locationType: "Permanent",
      distanceMiles: 2.3,
    });
    expect(r.sites[2]!.website).toBeNull();
    expect(r.slidingFeeNote).toBe(SLIDING_FEE_NOTE);
    expect(r.finder.url).toBe("https://findahealthcenter.hrsa.gov/");
    const lim = await searchHealthCenters({ location: { zip: "20877" }, limit: 1 });
    expect(lim.sites).toHaveLength(1);
  });

  it("maps an invalid token (HTTP 400 ERR002) and error payloads to safe UpstreamErrors", async () => {
    fetchMock.mockImplementation(async () => json({ Error: { code: "ERR002", description: "Invalid token was submitted." } }, 400));
    const e = await searchHealthCenters({ location: { zip: "20877" } }).catch((x) => x);
    expect(e).toBeInstanceOf(UpstreamError);
    expect(e.message).toMatch(/access token/);
    expect(e.message).not.toContain("test-hdw-token");
    fetchMock.mockImplementation(async () => json({ Error: { code: "ERR009", description: "Something" } }));
    await expect(searchHealthCenters({ location: { zip: "20878" } })).rejects.toBeInstanceOf(UpstreamError);
    reset();
    const res = await route({ location: { zip: "20879" } });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("test-hdw-token");
    expect(text).not.toContain("20879");
  });

  it("caches by validated query (never by token) and rate limits at 1 rps, burst 2", async () => {
    await searchHealthCenters({ location: { zip: "20877" } });
    vi.stubEnv("HRSA_API_KEY", "rotated-token");
    await searchHealthCenters({ location: { zip: "20877" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchHealthCenters({ location: { zip: "20877" }, radiusMiles: 25 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(searchHealthCenters({ location: { zip: "20850" } })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("route returns HRSA attribution and source", async () => {
    expect(runtime).toBe("nodejs");
    const res = await route({ location: { zip: "20877" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attribution).toBe(HRSA_ATTRIBUTION);
    expect(body.attribution).toMatch(/HRSA/);
    expect(body.attribution).toMatch(/not an endorsement/);
    expect(body.source).toBe(HRSA_SOURCE_URL);
    expect(JSON.stringify(body)).not.toContain("test-hdw-token");
  });
});
