import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import ghoJson from "@content/gho-indicators.json";
import { OutboundRejected } from "@/lib/outbound";
import { containsPHI } from "@/lib/phi-scrubber";
import { GhoIndicatorsFileSchema, WHO_REGIONS } from "@/lib/schemas-evidence";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  GHO_AREAS,
  GHO_INDICATORS,
  GHO_INDICATOR_IDS,
  GHO_SELECT,
  GhoInput,
  configureGhoRateLimit,
  dimensionLabel,
  getGhoIndicator,
  ghoApiBase,
  ghoAttribution,
  ghoIndicatorLink,
  ghoUrl,
  parseGho,
} from "@/server/integrations/who-gho";
import { POST, runtime } from "@/server/routes/gho";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; odata.metadata=minimal" } });

// Row shape verified live 2026-11-26 (ghoapi.azureedge.net, $select-limited). Values are illustrative.
const row = (year: number, dims: [string, string][], numeric: number | null, extra: Record<string, unknown> = {}) => {
  const r: Record<string, unknown> = { TimeDim: year, Dim1Type: null, Dim1: null, Dim2Type: null, Dim2: null, Dim3Type: null, Dim3: null };
  dims.forEach(([t, c], i) => {
    r[`Dim${i + 1}Type`] = t;
    r[`Dim${i + 1}`] = c;
  });
  return {
    ...r,
    Value: numeric === null ? null : `${numeric} [${numeric - 1}-${numeric + 1}]`,
    NumericValue: numeric,
    Low: numeric === null ? null : numeric - 1,
    High: numeric === null ? null : numeric + 1,
    Date: "2026-10-15T16:45:21.063+02:00",
    ...extra,
  };
};
const odata = (rows: unknown[]) => ({ "@odata.context": "https://ghoapi.azureedge.net/api/$metadata#MH_12", value: rows });
const SUICIDE = odata([
  row(2023, [["SEX", "SEX_MLE"]], 21.1),
  row(2023, [["SEX", "SEX_BTSX"]], 13.3),
  row(2023, [["SEX", "SEX_FMLE"]], 5.8),
  row(2023, [["SEX", "SEX_BTSX"]], 99), // duplicate breakdown: first one wins
  row(2022, [["SEX", "SEX_BTSX"]], 12.8),
  row(2022, [["SEX", "SEX_MLE"]], 20.2),
  ...Array.from({ length: 12 }, (_, i) => row(2021 - i, [["SEX", "SEX_BTSX"]], 12 + i / 10, { Date: "2019-01-01T00:00:00+01:00" })),
  { TimeDim: "bad" },
]);

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let savedBase: string | undefined;
beforeEach(() => {
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true"); // 42 CFR Part 2 owner switch; default (off) is tested in hardening.test.ts
  savedBase = process.env.WHO_GHO_API_BASE;
  delete process.env.WHO_GHO_API_BASE;
  __resetCoreForTests();
  configureGhoRateLimit();
  phi.force = false;
  fetchMock = vi.fn(async () => json(SUICIDE));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedBase === undefined) delete process.env.WHO_GHO_API_BASE;
  else process.env.WHO_GHO_API_BASE = savedBase;
});

const urlOf = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/gho", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("content/gho-indicators.json", () => {
  it("validates, with governance fields (G10)", () => {
    const file = GhoIndicatorsFileSchema.parse(ghoJson);
    expect(file.license).toBe("original");
    expect(file.lastVerified).toBe("2026-11-26");
    expect(file.reviewedBy).toBe("PENDING");
    expect(file.sources.length).toBeGreaterThan(0);
    expect(file.endpoint).toBe("https://ghoapi.azureedge.net/api");
    expect(file.endpointStatus).toMatch(/deprecat/i);
  });

  it("includes the verified suicide, workforce and alcohol indicators, each with label, unit and WHO page", () => {
    const codes = Object.values(GHO_INDICATORS).map((i) => i.code);
    for (const c of ["MH_12", "SDGSUICIDE", "MH_6", "MH_9", "MH_7", "MH_8", "SA_0000001688"]) expect(codes).toContain(c);
    for (const ind of Object.values(GHO_INDICATORS)) {
      expect(ind.label.length).toBeGreaterThan(3);
      expect(ind.unit.length).toBeGreaterThan(1);
      expect(new URL(ind.page).hostname).toBe("www.who.int");
    }
    expect(new Set(Object.values(GHO_INDICATORS).map((i) => i.topic))).toEqual(new Set(["suicide", "workforce", "services", "policy", "alcohol"]));
  });

  it("areas: GLOBAL, the six WHO regions, and ISO3 countries; ids and codes pass the PHI scrubber", () => {
    const codes = GHO_AREAS.map((a) => a.code);
    expect(codes).toContain("GLOBAL");
    for (const r of WHO_REGIONS) expect(codes).toContain(r);
    const countries = GHO_AREAS.filter((a) => a.type === "COUNTRY");
    expect(countries.length).toBeGreaterThan(190);
    for (const c of countries) expect(c.code).toMatch(/^[A-Z]{3}$/);
    for (const c of ["USA", "GBR", "IND", "BRA", "KEN", "MEX", "CAN"]) expect(codes).toContain(c);
    for (const v of [...codes, ...GHO_INDICATOR_IDS]) expect(containsPHI(v), v).toBe(false);
  });
});

describe("WHO GHO: upstream URL carries only a curated code and area", () => {
  it("country: exact path and OData parameters", async () => {
    await getGhoIndicator({ indicator: "suicide-rate-age-standardized", country: "USA" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const u = urlOf();
    expect(`${u.origin}${u.pathname}`).toBe("https://ghoapi.azureedge.net/api/MH_12");
    expect([...u.searchParams.keys()].sort()).toEqual(["$filter", "$orderby", "$select", "$top"]);
    expect(u.searchParams.get("$filter")).toBe("SpatialDim eq 'USA' and SpatialDimType eq 'COUNTRY'");
    expect(u.searchParams.get("$orderby")).toBe("TimeDim desc");
    expect(u.searchParams.get("$select")).toBe(GHO_SELECT);
    expect(u.searchParams.get("$top")).toBe("150");
  });

  it("global and WHO-region areas use their own area type", async () => {
    await getGhoIndicator({ indicator: "suicide-rate-crude", country: "GLOBAL" });
    await getGhoIndicator({ indicator: "suicide-rate-crude", country: "sear" });
    expect(urlOf(0).pathname).toBe("/api/SDGSUICIDE");
    expect(urlOf(0).searchParams.get("$filter")).toBe("SpatialDim eq 'GLOBAL' and SpatialDimType eq 'GLOBAL'");
    expect(urlOf(1).searchParams.get("$filter")).toBe("SpatialDim eq 'SEAR' and SpatialDimType eq 'REGION'");
  });

  it("accepts the WHO code as the indicator key (case-insensitive) and long-digit codes are sent as curated", async () => {
    await getGhoIndicator({ indicator: "sa_0000001688", country: "gbr" });
    expect(urlOf().pathname).toBe("/api/SA_0000001688");
    expect(urlOf().searchParams.get("$filter")).toBe("SpatialDim eq 'GBR' and SpatialDimType eq 'COUNTRY'");
    expect(ghoUrl(GhoInput.parse({ indicator: "MH_6", country: "BRA" }))).toBe(
      "https://ghoapi.azureedge.net/api/MH_6?%24filter=SpatialDim+eq+%27BRA%27+and+SpatialDimType+eq+%27COUNTRY%27&%24orderby=TimeDim+desc&%24select=" +
        encodeURIComponent(GHO_SELECT) +
        "&%24top=150",
    );
  });

  it("WHO_GHO_API_BASE is honoured only for https WHO / Azure-edge hosts", () => {
    process.env.WHO_GHO_API_BASE = "https://ghoapi.azureedge.net/api/";
    expect(ghoApiBase()).toBe("https://ghoapi.azureedge.net/api");
    process.env.WHO_GHO_API_BASE = "https://data.who.int/odata/v1?x=1#y";
    expect(ghoApiBase()).toBe("https://data.who.int/odata/v1");
    for (const bad of ["http://ghoapi.azureedge.net/api", "https://evil.example.com/api", "https://who.int.evil.com/api", "not a url"]) {
      process.env.WHO_GHO_API_BASE = bad;
      expect(ghoApiBase(), bad).toBe("https://ghoapi.azureedge.net/api");
    }
  });
});

describe("WHO GHO: free text, identifiers and OData injection are rejected before any fetch", () => {
  const bad: [string, unknown][] = [
    ["country name instead of ISO3", { indicator: "suicide-rate-crude", country: "United States" }],
    ["ISO2", { indicator: "suicide-rate-crude", country: "US" }],
    ["numeric country code", { indicator: "suicide-rate-crude", country: "840" }],
    ["OData injection in country", { indicator: "suicide-rate-crude", country: "USA' or SpatialDim ne 'x" }],
    ["uncurated indicator code", { indicator: "MH_99", country: "USA" }],
    ["OData path injection in indicator", { indicator: "MH_12?$filter=1", country: "USA" }],
    ["free text", { indicator: "suicide rate for my client in Ohio", country: "USA" }],
    ["ZIP", { indicator: "suicide-rate-crude", country: "20877" }],
    ["email", { indicator: "suicide-rate-crude", country: "jane.doe@example.com" }],
    ["very long string", { indicator: "m".repeat(1500), country: "USA" }],
    ["extra key", { indicator: "suicide-rate-crude", country: "USA", $filter: "x" }],
    ["missing country", { indicator: "suicide-rate-crude" }],
  ];
  it.each(bad)("%s -> ZodError, no fetch", async (_label, input) => {
    await expect(getGhoIndicator(input as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PHI scrubber is the last line of defence (OutboundRejected before fetch)", async () => {
    phi.force = true;
    await expect(getGhoIndicator({ indicator: "suicide-rate-crude", country: "USA" })).rejects.toBeInstanceOf(OutboundRejected);
    const res = await post({ indicator: "suicide-rate-crude", country: "USA" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route: invalid / oversized bodies are 400 and never echoed", async () => {
    for (const body of [{ indicator: "suicide-rate-crude", country: "Robert Johnson 555-12-3456" }, "nope", JSON.stringify({ indicator: "z".repeat(3000), country: "USA" })]) {
      const res = await post(body);
      expect([400, 413]).toContain(res.status); // 413: body over the 2 KB cap
      const text = await res.text();
      expect(text).not.toContain("Robert");
      expect(text).not.toContain("555-12");
      expect(text).not.toContain("zzzz");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("WHO GHO: response normalisation", () => {
  const NOW = new Date("2026-11-26T00:00:00Z");

  it("latest year, headline first, dimension labels, uncertainty range, history oldest-first", async () => {
    const r = await getGhoIndicator({ indicator: "suicide-rate-age-standardized", country: "USA" });
    expect(r.found).toBe(true);
    expect(r.latestYear).toBe(2023);
    expect(r.values.map((v) => v.dimensions.map((d) => d.label).join("/"))).toEqual(["Both sexes", "Female", "Male"]);
    expect(r.headline).toEqual({
      year: 2023,
      value: 13.3,
      text: "13.3 (12.3–14.3)",
      low: 12.3,
      high: 14.3,
      dimensions: [{ type: "SEX", typeLabel: "Sex", code: "SEX_BTSX", label: "Both sexes" }],
      headline: true,
    });
    expect(r.history).toHaveLength(10);
    expect(r.history.at(-1)).toEqual({ year: 2023, value: 13.3, text: "13.3 (12.3–14.3)" });
    expect(r.history[0]!.year).toBe(2014);
    expect(r.updated).toBe("2026-10-15");
    expect(r.stale).toBe(false);
    expect(r.attribution).toBe("Source: WHO Global Health Observatory, 2023 data");
    expect(r.area).toEqual({ code: "USA", name: "United States of America", type: "COUNTRY" });
    expect(r.indicator).toMatchObject({ id: "suicide-rate-age-standardized", code: "MH_12", unit: "per 100,000 population" });
    expect(r.sourceUrl).toBe(GHO_INDICATORS["suicide-rate-age-standardized"]!.page);
  });

  it("multi-dimension headline (sex + age group) and age-group labels", () => {
    const ind = GHO_INDICATORS["suicide-rate-crude"]!;
    const body = odata([
      row(2021, [["SEX", "SEX_MLE"], ["AGEGROUP", "AGEGROUP_YEARS15-29"]], 18),
      row(2021, [["SEX", "SEX_BTSX"], ["AGEGROUP", "AGEGROUP_YEARS80PLUS"]], 20),
      row(2021, [["SEX", "SEX_BTSX"], ["AGEGROUP", "AGEGROUP_YEARSALL"]], 14),
      row(2021, [["SEX", "SEX_BTSX"], ["AGEGROUP", "AGEGROUP_YEARS15-29"]], 12),
    ]);
    const r = parseGho(body, ind, NOW);
    expect(r.headline!.value).toBe(14);
    expect(r.values[0]!.dimensions.map((d) => d.label)).toEqual(["Both sexes", "All ages"]);
    expect(r.values.map((v) => v.dimensions.map((d) => d.label).join("/"))).toEqual(["Both sexes/All ages", "Both sexes/15–29 years", "Both sexes/80+ years", "Male/15–29 years"]);
    expect(dimensionLabel("AGEGROUP_YEARS65PLUS")).toBe("65+ years");
    expect(dimensionLabel("AGEGROUP_YEARSUNDER15")).toBe("Under 15 years");
    expect(dimensionLabel("RESIDENCEAREATYPE_URB")).toBe("Urb");
  });

  it("text indicators (Yes/No), stale flag for values older than 5 years (G13)", () => {
    const ind = GHO_INDICATORS["mental-health-policy"]!;
    const r = parseGho(odata([row(2016, [], null, { Value: "Yes" }), row(2014, [], null, { Value: "No" })]), ind, NOW);
    expect(r.latestYear).toBe(2016);
    expect(r.headline).toMatchObject({ text: "Yes", value: null, year: 2016 });
    expect(r.history.map((h) => h.text)).toEqual(["No", "Yes"]);
    expect(r.stale).toBe(true);
    expect(parseGho(odata([row(2021, [], 1)]), GHO_INDICATORS["psychiatrists-rate"]!, NOW).stale).toBe(false);
  });

  it("no data for an area -> found false (UI shows the WHO link-out), invalid rows ignored, values capped", () => {
    const ind = GHO_INDICATORS["psychiatrists-rate"]!;
    expect(parseGho(odata([]), ind, NOW)).toMatchObject({ found: false, latestYear: null, headline: null, values: [], history: [] });
    expect(parseGho(odata([{ TimeDim: 1800, NumericValue: 1 }, row(2016, [], null)]), ind, NOW).found).toBe(false);
    const many = odata(Array.from({ length: 20 }, (_, i) => row(2020, [["AGEGROUP", `AGEGROUP_YEARS${i * 5}-${i * 5 + 4}`]], i)));
    expect(parseGho(many, GHO_INDICATORS["suicide-rate-crude"]!, NOW).values).toHaveLength(12);
    // Atlas workforce rows have no uncertainty interval (verified live: Low/High null).
    const workforce = parseGho(odata([row(2016, [], 10.54202, { Value: "10.542", Low: null, High: null })]), ind, NOW);
    expect(workforce.headline!.text).toBe("10.54");
    expect(workforce.headline!.value).toBe(10.542);
  });

  it("text values are plain and clipped", () => {
    const ind = GHO_INDICATORS["mental-health-legislation"]!;
    const r = parseGho(odata([row(2017, [], null, { Value: `Yes\u0000\u0007 ${"x".repeat(100)}` })]), ind, NOW);
    expect(r.headline!.text.length).toBeLessThanOrEqual(60);
    expect(r.headline!.text).not.toMatch(/[\u0000-\u001f]/);
  });
});

describe("WHO GHO: errors, caching, rate limiting, attribution", () => {
  it("maps upstream HTTP errors, bad shapes and non-JSON bodies to UpstreamError", async () => {
    fetchMock.mockImplementation(async () => new Response("oops", { status: 500 }));
    await expect(getGhoIndicator({ indicator: "suicide-rate-crude", country: "USA" })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockImplementation(async () => json({ error: { code: "", message: "bad" } }));
    await expect(getGhoIndicator({ indicator: "suicide-rate-crude", country: "GBR" })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockImplementation(async () => new Response("<html>gateway</html>", { status: 200 }));
    await expect(getGhoIndicator({ indicator: "suicide-rate-crude", country: "IND" })).rejects.toMatchObject({ name: "UpstreamError", status: 502 });
  });

  it("route: upstream failure -> 502 with the WHO indicator page as fallback", async () => {
    fetchMock.mockImplementation(async () => new Response("not found", { status: 404 }));
    const res = await post({ indicator: "alcohol-per-capita", country: "MEX" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "upstream" });
    expect(body.fallbackUrl).toBe(GHO_INDICATORS["alcohol-per-capita"]!.page);
    expect(body.fallbackUrl).toBe(ghoIndicatorLink("SA_0000001688"));
    expect(JSON.stringify(body)).not.toContain("MEX");
  });

  it("network failure -> safe upstream error", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    const res = await post({ indicator: "suicide-rate-crude", country: "USA" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, code: "upstream" });
  });

  it("caches identical requests", async () => {
    const a = await getGhoIndicator({ indicator: "suicide-rate-age-standardized", country: "USA" });
    const b = await getGhoIndicator({ indicator: "MH_12", country: "usa" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it("limits to 1 request/second (burst 3), refusing before fetch", async () => {
    await getGhoIndicator({ indicator: "suicide-rate-crude", country: "USA" });
    await getGhoIndicator({ indicator: "suicide-rate-crude", country: "GBR" });
    await getGhoIndicator({ indicator: "suicide-rate-crude", country: "IND" });
    await expect(getGhoIndicator({ indicator: "suicide-rate-crude", country: "BRA" })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const res = await post({ indicator: "suicide-rate-crude", country: "KEN" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate-limited");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("route returns data with WHO attribution that names the data year (G13)", async () => {
    expect(runtime).toBe("nodejs");
    const res = await post({ indicator: "suicide-rate-age-standardized", country: "USA" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.attribution).toBe("Source: WHO Global Health Observatory, 2023 data");
    expect(body.attribution).toMatch(/^Source: WHO Global Health Observatory/);
    expect(body.source).toBe(GHO_INDICATORS["suicide-rate-age-standardized"]!.page);
    expect(body.data.latestYear).toBe(2023);
    expect(ghoAttribution(null)).toBe("Source: WHO Global Health Observatory");
  });
});
