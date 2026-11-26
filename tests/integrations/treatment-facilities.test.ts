import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { OutboundRejected } from "@/lib/outbound";
import { PART2_NOTICE, SAMHSA_HELPLINE } from "@/lib/referral-links";
import { NotConfigured, UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  CALL_TO_CONFIRM,
  FINDTREATMENT_ATTRIBUTION,
  FINDTREATMENT_SOURCE_URL,
  applyFindTreatmentRateLimit,
  findTreatmentLink,
  searchTreatmentFacilities,
} from "@/server/integrations/findtreatment";
import {
  StrictLocation,
  assertSafeBody,
  cleanText,
  coarse,
  formatPhone,
  safeParams,
  safeWebsite,
  titleCase,
} from "@/server/integrations/referral-common";
import { POST, runtime } from "@/server/routes/treatment-facilities";

/* Shape from a live FindTreatment.gov v2 response (2026-11-26), invented values. */
const ROWS = {
  page: 1,
  totalPages: 3,
  recordCount: 5,
  rows: [
    {
      _irow: 1,
      name1: "Example Recovery <script>x</script>Center",
      name2: "",
      street1: "12 East Diamond Avenue",
      street2: "Suite A",
      city: "GAITHERSBURG",
      state: "MD",
      zip: "20877",
      phone: "301-555-0120",
      intake1: "(301) 555-0121 x204",
      hotline1: null,
      website: "www.example-recovery.org",
      latitude: "39.1422097",
      longitude: "-77.1978938",
      miles: 0.34,
      services: [
        { f1: "Type of Care", f2: "TC", f3: "Substance use treatment; Mental health treatment" },
        { f1: "Service Setting", f2: "SET", f3: "Outpatient; Intensive outpatient treatment" },
        { f1: "Facility Type", f2: "FT", f3: "Outpatient mental health facility" },
        { f1: "Payment/Insurance/Funding Accepted", f2: "PAY", f3: "Medicare; Medicaid; Cash or self-payment" },
        { f1: "Payment Assistance Available", f2: "PYAS", f3: "Sliding fee scale (fee is based on income and other factors)" },
        { f1: "Age Groups Accepted", f2: "AGE", f3: "Young Adults; Adults; Seniors" },
        { f1: "Language Services", f2: "SL", f3: "Spanish; Services for the deaf and hard of hearing" },
        { f1: "Special Programs/Groups Offered", f2: "SG", f3: "Not returned by the adapter" },
      ],
    },
    {
      _irow: 2,
      name1: "Youth Program",
      name2: "Adolescent Unit",
      street1: "1 Oak St",
      city: "Rockville",
      state: "MD",
      zip: "20850-1234",
      phone: "n/a",
      website: "javascript:alert(1)",
      miles: "2.04",
      services: [{ f1: "Age Groups Accepted", f2: "AGE", f3: "Children/Adolescents" }],
    },
    { _irow: 3, name1: "", street1: "nameless row is dropped" },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const calledUrl = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const route = (body: unknown) => POST(new Request("http://localhost/api/treatment-facilities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const reset = () => {
  __resetCoreForTests();
  applyFindTreatmentRateLimit();
};

beforeEach(() => {
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true"); // 42 CFR Part 2 owner switch; default (off) is tested in hardening.test.ts
  reset();
  fetchMock = vi.fn(async () => json(ROWS));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("FindTreatment.gov: gated on SAMHSA approval", () => {
  it("throws NotConfigured without FINDTREATMENT_ACCESS_APPROVED=true, before any fetch", async () => {
    for (const v of ["", "false", "yes", "1"]) {
      vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", v);
      await expect(searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "both" })).rejects.toBeInstanceOf(NotConfigured);
    }
    const res = await route({ location: { zip: "20877" }, facilityType: "both" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only accepts findtreatment.gov or a SAMHSA host as an override (not any .gov host)", async () => {
    vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", "true");
    for (const host of ["evil.example.com", "attacker-controlled.gov", "findtreatment.gov.evil.com", "evilfindtreatment.gov", "samhsa.gov.example.com"]) {
      vi.stubEnv("FINDTREATMENT_API_HOST", host);
      await expect(searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "mental-health" })).rejects.toBeInstanceOf(NotConfigured);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("FINDTREATMENT_API_HOST", "api.findtreatment.gov");
    await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "mental-health" });
    expect(calledUrl().origin).toBe("https://api.findtreatment.gov");
  });

  it("exports the public locator link fallback with the SAMHSA helpline", () => {
    const link = findTreatmentLink({ city: "Gaithersburg", state: "MD" });
    expect(link.url).toBe("https://findtreatment.gov/");
    expect(link.instructions).toContain("Gaithersburg, MD");
    expect(link.phone?.number).toBe("1-800-662-4357");
  });
});

describe("FindTreatment.gov: outbound query is location + facility type only", () => {
  beforeEach(() => vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", "true"));

  it("ZIP search: exact documented params, lat,lng order, meters, no filters or service codes", async () => {
    await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "substance-use" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = calledUrl();
    expect(url.origin + url.pathname).toBe("https://findtreatment.gov/locator/exportsAsJson/v2");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sAddr: "39.14,-77.19",
      limitType: "2",
      limitValue: "40233.6",
      sType: "sa",
      pageSize: "20",
      page: "1",
      sort: "0",
    });
    for (const k of ["sCodes", "filterFName", "filterFAddress", "filterFPhone", "stateCode", "cut"]) expect(url.searchParams.has(k)).toBe(false);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  it("maps facility types and radius", async () => {
    await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "mental-health", radiusMiles: 5 });
    await searchTreatmentFacilities({ location: { zip: "20878" }, facilityType: "both", radiusMiles: 50, page: 2, pageSize: 10 });
    expect(Object.fromEntries(calledUrl(0).searchParams)).toMatchObject({ sType: "mh", limitValue: "8046.7" });
    expect(Object.fromEntries(calledUrl(1).searchParams)).toMatchObject({ sType: "both", limitValue: "80467.2", page: "2", pageSize: "10" });
  });

  it("city + state uses the local gazetteer point (no geocoding request), then sends only the coarse point", async () => {
    await searchTreatmentFacilities({ location: { city: "Bethesda", state: "MD" }, facilityType: "mental-health" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl(0).searchParams.get("sAddr")).toBe("39.04,-77.15");
    expect(String(fetchMock.mock.calls[0]![0])).not.toMatch(/bethesda/i);
  });

  it("an unknown place or ZIP is a safe error, not a guess, and nothing is fetched", async () => {
    await expect(searchTreatmentFacilities({ location: { city: "Nowhereville", state: "MD" }, facilityType: "mental-health" })).rejects.toBeInstanceOf(ZodError);
    await expect(searchTreatmentFacilities({ location: { zip: "00000" }, facilityType: "mental-health" })).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const bad: [string, unknown][] = [
    ["clinical free text as facility type", { location: { zip: "20877" }, facilityType: "opioid use disorder, relapsed" }],
    ["service codes", { location: { zip: "20877" }, facilityType: "substance-use", sCodes: "OTP,BU" }],
    ["name filter", { location: { zip: "20877" }, facilityType: "substance-use", filterFName: "Rehab" }],
    ["client note", { location: { zip: "20877" }, facilityType: "both", note: "client uses fentanyl daily" }],
    ["coordinates instead of ZIP/city", { location: { lat: 39.1, lng: -77.2 }, facilityType: "both" }],
    ["street address", { location: { city: "12 East Diamond Ave", state: "MD" }, facilityType: "both" }],
    ["page size above 50", { location: { zip: "20877" }, facilityType: "both", pageSize: 51 }],
    ["radius 100", { location: { zip: "20877" }, facilityType: "both", radiusMiles: 100 }],
    ["missing facility type", { location: { zip: "20877" } }],
  ];
  for (const [name, input] of bad) {
    it(`rejects ${name} before any fetch`, async () => {
      await expect(searchTreatmentFacilities(input as never)).rejects.toBeInstanceOf(ZodError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("rejects a name-like city (not a place in that state) and the route never echoes it", async () => {
    await expect(searchTreatmentFacilities({ location: { city: "Jane Doe", state: "MD" }, facilityType: "both" })).rejects.toSatisfy(
      (e) => e instanceof ZodError || e instanceof OutboundRejected,
    );
    const res = await route({ location: { city: "Jane Doe", state: "MD" }, facilityType: "both" });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("Jane Doe");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("FindTreatment.gov: results, Part 2 metadata, errors, caching, rate limiting", () => {
  beforeEach(() => vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", "true"));

  it("normalises rows and keeps only the curated service categories", async () => {
    const r = await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "substance-use" });
    expect(r).toMatchObject({ location: "ZIP 20877", facilityType: "substance-use", radiusMiles: 25, page: 1, totalPages: 3, recordCount: 5 });
    expect(r.facilities).toHaveLength(2);
    expect(r.facilities[0]).toEqual({
      name: "Example Recovery Center",
      program: null,
      address: { line: "12 East Diamond Avenue, Suite A", city: "Gaithersburg", state: "MD", zip5: "20877" },
      phone: "301-555-0120",
      intakePhone: "301-555-0121 ext. 204",
      hotline: null,
      website: "https://www.example-recovery.org/",
      distanceMiles: 0.3,
      services: {
        typeOfCare: ["Substance use treatment", "Mental health treatment"],
        settings: ["Outpatient", "Intensive outpatient treatment"],
        facilityTypes: ["Outpatient mental health facility"],
        emergency: [],
        payment: ["Medicare", "Medicaid", "Cash or self-payment"],
        paymentAssistance: ["Sliding fee scale (fee is based on income and other factors)"],
        ageGroups: ["Young Adults", "Adults", "Seniors"],
        languages: ["Spanish", "Services for the deaf and hard of hearing"],
      },
      acceptsAdults: true,
    });
    const youth = r.facilities[1]!;
    expect(youth.acceptsAdults).toBe(false);
    expect(youth.website).toBeNull(); // javascript: URL rejected
    expect(youth.phone).toBeNull();
    expect(youth.address.zip5).toBe("20850");
    expect(youth.distanceMiles).toBe(2);
    expect(JSON.stringify(r)).not.toContain("Not returned by the adapter");
    expect(JSON.stringify(r)).not.toContain("<script>");
  });

  it("carries the call-to-confirm note, helpline and 42 CFR Part 2 reminder for SUD searches", async () => {
    const sud = await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "substance-use" });
    const both = await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "both" });
    reset(); // burst of 2 used
    const mh = await searchTreatmentFacilities({ location: { zip: "20878" }, facilityType: "mental-health" });
    expect(sud.part2Notice).toContain(PART2_NOTICE);
    expect(both.part2Notice).toContain(PART2_NOTICE);
    expect(mh.part2Notice).toBeNull();
    for (const r of [sud, both, mh]) {
      expect(r.notice).toBe(CALL_TO_CONFIRM);
      expect(r.helpline.number).toBe(SAMHSA_HELPLINE.number);
      expect(r.finder.url).toBe("https://findtreatment.gov/");
    }
  });

  it("maps upstream failures and malformed bodies to UpstreamError; route answers 502 safely", async () => {
    fetchMock.mockImplementation(async () => new Response("unavailable", { status: 503 }));
    await expect(searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "both" })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockImplementation(async () => json({ rows: "not-an-array" }));
    await expect(searchTreatmentFacilities({ location: { zip: "20878" }, facilityType: "both" })).rejects.toBeInstanceOf(UpstreamError);
    reset();
    fetchMock.mockImplementation(async () => {
      throw new TypeError("socket hang up");
    });
    const res = await route({ location: { zip: "20879" }, facilityType: "substance-use" });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("20879");
    expect(text).not.toContain("substance-use");
  });

  it("caches identical queries and rate limits at 1 rps, burst 2", async () => {
    await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "both" });
    await searchTreatmentFacilities({ location: { zip: "20877" }, facilityType: "both" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchTreatmentFacilities({ location: { zip: "20878" }, facilityType: "both" });
    await expect(searchTreatmentFacilities({ location: { zip: "20879" }, facilityType: "both" })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("route returns FindTreatment attribution with the call-to-confirm note", async () => {
    expect(runtime).toBe("nodejs");
    const res = await route({ location: { zip: "20877" }, facilityType: "mental-health" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attribution).toBe(FINDTREATMENT_ATTRIBUTION);
    expect(body.attribution).toMatch(/SAMHSA FindTreatment\.gov/);
    expect(body.attribution).toMatch(/Call to confirm/);
    expect(body.source).toBe(FINDTREATMENT_SOURCE_URL);
  });
});

describe("referral-common helpers", () => {
  it("StrictLocation rejects unknown keys instead of stripping them, and canonicalises cities", () => {
    expect(StrictLocation.parse({ zip: "20877" })).toEqual({ zip: "20877" });
    expect(StrictLocation.parse({ city: " st. paul ", state: "MN" })).toEqual({ city: "Saint Paul", state: "MN" });
    expect(StrictLocation.parse({ city: "Ft Worth", state: "TX" })).toEqual({ city: "Fort Worth", state: "TX" });
    expect(StrictLocation.parse({ city: "Cañon City", state: "CO" })).toEqual({ city: "Canon City", state: "CO" });
    expect(() => StrictLocation.parse({ city: "Hears Voices At Night", state: "MD" })).toThrow(ZodError);
    expect(() => StrictLocation.parse({ zip: "20877", extra: "x" })).toThrow(ZodError);
    expect(() => StrictLocation.parse({ city: "Gaithersburg", state: "MD", zip: "20877" })).toThrow(ZodError);
  });

  it("safeParams / assertSafeBody: PHI check on every value; ZIP only via the strict regex; secrets skipped", () => {
    expect(String(safeParams({ a: "Psychiatry", postal_code: "20877" }, ["postal_code"]))).toBe("a=Psychiatry&postal_code=20877");
    expect(() => safeParams({ postal_code: "20877" })).toThrow(OutboundRejected); // a bare ZIP is a Safe Harbor identifier
    expect(() => safeParams({ postal_code: "20877 x" }, ["postal_code"])).toThrow(ZodError);
    expect(() => safeParams({ q: "call 555-123-4567" })).toThrow(OutboundRejected);
    expect(() => assertSafeBody({ ZipCode: "20877", Token: "A1B2C3D4E5F6G7H8" }, { zipKeys: ["ZipCode"], secretKeys: ["Token"] })).not.toThrow();
    expect(() => assertSafeBody({ Note: "John Smith" })).toThrow(OutboundRejected);
    // canonical gazetteer names are exempt from the name scrubber; anything else is refused
    expect(String(safeParams({ city: "Charlotte" }, [], ["city"]))).toBe("city=Charlotte");
    expect(() => safeParams({ city: "Opioid Withdrawal" }, [], ["city"])).toThrow(ZodError);
  });

  it("normalisers strip markup and unsafe values", () => {
    expect(cleanText("<b>A</b> &amp; B\u0007  C")).toBe("A & B C");
    expect(cleanText("[No Data]")).toBe("");
    expect(cleanText("x".repeat(10), 5)).toBe("xxxx…");
    expect(titleCase("WINSTON-SALEM")).toBe("Winston-Salem");
    expect(titleCase("O'FALLON")).toBe("O'Fallon");
    expect(formatPhone("1 (301) 555-0199")).toBe("301-555-0199");
    expect(formatPhone("12345")).toBeNull();
    expect(safeWebsite("example.org/path")).toBe("https://example.org/path");
    expect(safeWebsite("ftp://example.org")).toBeNull();
    expect(safeWebsite("localhost")).toBeNull();
    expect(coarse(39.141375)).toBe(39.14);
  });
});
