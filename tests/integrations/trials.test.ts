import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import { OutboundRejected, US_STATES } from "@/lib/outbound";
import { containsPHI } from "@/lib/phi-scrubber";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  TRIALS_ATTRIBUTION,
  TRIALS_FIELDS,
  TRIALS_SOURCE,
  TRIAL_CONDITIONS,
  TRIAL_COUNTRIES,
  TrialsInput,
  US_STATE_NAMES,
  configureTrialsRateLimit,
  locationExpression,
  parseTrials,
  searchTrials,
  trialsParams,
  trialsSearchLink,
} from "@/server/integrations/clinicaltrials";
import { EVIDENCE_QUERIES } from "@/server/integrations/pubmed";
import { POST, runtime } from "@/server/routes/trials";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Shape verified live 2026-11-26 (v2 /studies, fields-limited). Titles/names are placeholders.
const study = (nctId: string, extra: { locations?: { country?: string; state?: string }[]; phases?: string[]; [k: string]: unknown } = {}) => ({
  protocolSection: {
    identificationModule: { nctId, briefTitle: `Placeholder study ${nctId}` },
    statusModule: { overallStatus: "RECRUITING", lastUpdatePostDateStruct: { date: "2026-05-07" } },
    designModule: { phases: extra.phases ?? ["PHASE2", "PHASE3"], studyType: "INTERVENTIONAL" },
    conditionsModule: { conditions: ["Panic Disorder", "panic disorder", "Agoraphobia"] },
    armsInterventionsModule: { interventions: [{ name: "Internet CBT" }, { name: "Waitlist" }] },
    contactsLocationsModule: {
      locations: extra.locations ?? [
        { country: "United States", state: "Texas" },
        { country: "United States", state: "Georgia" },
        { country: "Georgia" },
        { country: "Canada", state: "Ontario" },
      ],
    },
  },
});
const page = (studies: unknown[], totalCount = studies.length) => ({ totalCount, studies, nextPageToken: "tok" });

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
beforeEach(() => {
  __resetCoreForTests();
  configureTrialsRateLimit();
  phi.force = false;
  fetchMock = vi.fn(async () => json(page([study("NCT06804525"), study("NCT04793828", { phases: ["NA"] })], 26)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const urlOf = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/trials", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const BASE_KEYS = ["countTotal", "fields", "filter.advanced", "filter.overallStatus", "format", "pageSize", "query.cond"];

describe("curated trial conditions and locations", () => {
  it("every trial condition is a curated condition with a plain, identifier-free term", () => {
    expect(Object.keys(TRIAL_CONDITIONS).length).toBeGreaterThanOrEqual(9);
    for (const [id, c] of Object.entries(TRIAL_CONDITIONS)) {
      expect(EVIDENCE_QUERIES[id]?.kind, id).toBe("condition");
      expect(c.term).toMatch(/^[A-Za-z][A-Za-z -]*[A-Za-z]$/);
      expect(containsPHI(c.term), c.term).toBe(false);
    }
    expect(TRIAL_CONDITIONS["alcohol-use-disorder"]!.sud).toBe(true);
  });

  it("country list is ClinicalTrials.gov's own names, and every one passes the PHI scrubber", () => {
    expect(TRIAL_COUNTRIES.length).toBeGreaterThan(200);
    for (const c of ["United States", "Canada", "United Kingdom", "Mexico", "India", "Puerto Rico"]) expect(TRIAL_COUNTRIES).toContain(c);
    for (const c of TRIAL_COUNTRIES) {
      expect(c).toBe(c.trim());
      expect(c).not.toContain('"');
      expect(containsPHI(c), c).toBe(false);
      expect(containsPHI(locationExpression({ kind: "country", value: c, label: c })), c).toBe(false);
    }
  });

  it("every US state code has a full name that passes the PHI scrubber", () => {
    for (const s of US_STATES) {
      expect(US_STATE_NAMES[s], s).toBeTruthy();
      expect(containsPHI(US_STATE_NAMES[s]), s).toBe(false);
    }
  });
});

describe("ClinicalTrials.gov: upstream URL carries only curated terms", () => {
  it("condition only: exact parameters", async () => {
    await searchTrials({ condition: "panic-disorder" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const u = urlOf();
    expect(`${u.origin}${u.pathname}`).toBe("https://clinicaltrials.gov/api/v2/studies");
    expect([...u.searchParams.keys()].sort()).toEqual(BASE_KEYS);
    expect(u.searchParams.get("format")).toBe("json");
    expect(u.searchParams.get("query.cond")).toBe("Panic Disorder");
    expect(u.searchParams.get("filter.overallStatus")).toBe("RECRUITING");
    expect(u.searchParams.get("filter.advanced")).toBe("AREA[StdAge]ADULT");
    expect(u.searchParams.get("fields")).toBe(TRIALS_FIELDS.join(","));
    expect(u.searchParams.get("pageSize")).toBe("10");
    expect(u.searchParams.get("countTotal")).toBe("true");
    // No contact or free-text fields are ever requested.
    expect(u.searchParams.get("fields")).not.toMatch(/Contact|Email|Phone|Official|Description|Summary/i);
  });

  it("accepts the curated term itself, case-insensitively", async () => {
    await searchTrials({ condition: "  post-traumatic stress DISORDER " });
    expect(urlOf().searchParams.get("query.cond")).toBe("Post-traumatic Stress Disorder");
  });

  it("US state -> AREA[LocationState] + United States, from the validated code only", async () => {
    await searchTrials({ condition: "ptsd", state: "TX" });
    const u = urlOf();
    expect([...u.searchParams.keys()].sort()).toEqual([...BASE_KEYS, "query.locn"].sort());
    expect(u.searchParams.get("query.locn")).toBe('AREA[LocationState]"Texas" AND AREA[LocationCountry]"United States"');
  });

  it("Georgia the state and Georgia the country are not confused", async () => {
    await searchTrials({ condition: "ptsd", state: "GA" });
    await searchTrials({ condition: "ptsd", country: "Georgia" });
    expect(urlOf(0).searchParams.get("query.locn")).toBe('AREA[LocationState]"Georgia" AND AREA[LocationCountry]"United States"');
    expect(urlOf(1).searchParams.get("query.locn")).toBe('AREA[LocationCountry]"Georgia"');
  });

  it("US territories are searched as ClinicalTrials.gov countries", async () => {
    await searchTrials({ condition: "insomnia-disorder", state: "PR" });
    expect(urlOf().searchParams.get("query.locn")).toBe('AREA[LocationCountry]"Puerto Rico"');
  });

  it("country -> AREA[LocationCountry] with the curated spelling", async () => {
    await searchTrials({ condition: "Generalized Anxiety Disorder", country: "united kingdom" });
    expect(urlOf().searchParams.get("query.locn")).toBe('AREA[LocationCountry]"United Kingdom"');
    expect(urlOf().searchParams.get("query.cond")).toBe("Generalized Anxiety Disorder");
  });

  it("trialsParams is the exact request (for the UI's transparency panel)", () => {
    const p = trialsParams(TrialsInput.parse({ condition: "agoraphobia", country: "Canada" }));
    expect(Object.fromEntries(p)).toEqual({
      format: "json",
      "query.cond": "Agoraphobia",
      "filter.overallStatus": "RECRUITING",
      "filter.advanced": "AREA[StdAge]ADULT",
      "query.locn": 'AREA[LocationCountry]"Canada"',
      fields: TRIALS_FIELDS.join(","),
      pageSize: "10",
      countTotal: "true",
    });
  });
});

describe("ClinicalTrials.gov: free text, identifiers and bad locations are rejected before any fetch", () => {
  const bad: [string, unknown][] = [
    ["free clinical text", { condition: "client with panic attacks and divorce" }],
    ["uncurated condition", { condition: "Schizophrenia" }],
    ["Essie injection in condition", { condition: 'Panic Disorder" OR AREA[LocationCity]"Boston' }],
    ["state as full name", { condition: "ptsd", state: "Texas" }],
    ["ZIP as state", { condition: "ptsd", state: "20877" }],
    ["city", { condition: "ptsd", city: "Baltimore", state: "MD" }],
    ["unknown country", { condition: "ptsd", country: "Atlantis" }],
    ["Essie injection in country", { condition: "ptsd", country: 'Canada" OR AREA[LocationFacility]"x' }],
    ["state and country together", { condition: "ptsd", state: "TX", country: "Canada" }],
    ["email", { condition: "jane.doe@example.com" }],
    ["phone in country", { condition: "ptsd", country: "301-555-0199" }],
    ["very long string", { condition: "p".repeat(1500) }],
    ["extra key (query.term)", { condition: "ptsd", "query.term": "anything" }],
    ["max too high", { condition: "ptsd", max: 100 }],
    ["missing condition", {}],
  ];
  it.each(bad)("%s -> ZodError, no fetch", async (_label, input) => {
    await expect(searchTrials(input as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PHI scrubber is the last line of defence (OutboundRejected before fetch)", async () => {
    phi.force = true;
    await expect(searchTrials({ condition: "ptsd" })).rejects.toBeInstanceOf(OutboundRejected);
    const res = await post({ condition: "ptsd", state: "TX" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route: invalid / oversized bodies are 400 and never echoed", async () => {
    for (const body of [{ condition: "patient Mary Jones MRN 4455667" }, "{bad json", JSON.stringify({ condition: "y".repeat(3000) })]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).not.toContain("Mary");
      expect(text).not.toContain("4455667");
      expect(text).not.toContain("yyyy");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ClinicalTrials.gov: response normalisation", () => {
  it("maps phases, status, conditions, interventions, sites and canonical links", async () => {
    const r = await searchTrials({ condition: "panic-disorder", state: "TX" });
    expect(r.total).toBe(26);
    expect(r.location).toEqual({ kind: "state", value: "Texas", label: "Texas, United States" });
    expect(r.adultOnly).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toEqual({
      nctId: "NCT06804525",
      title: "Placeholder study NCT06804525",
      status: "Recruiting",
      phase: "Phase 2/Phase 3",
      studyType: "Interventional",
      conditions: ["Panic Disorder", "Agoraphobia"],
      interventions: ["Internet CBT", "Waitlist"],
      locationsCount: 4,
      locationsInArea: 1,
      countries: ["United States", "Georgia", "Canada"],
      lastUpdated: "2026-05-07",
      url: "https://clinicaltrials.gov/study/NCT06804525",
    });
    expect(r.items[1]!.phase).toBe("Not applicable");
    expect(r.condition).toEqual({ id: "panic-disorder", label: "Panic disorder", term: "Panic Disorder", sud: false });
  });

  it("counts sites in a country; no location -> locationsInArea null", () => {
    const body = page([study("NCT00000001")]);
    expect(parseTrials(body, { kind: "country", value: "Georgia", label: "Georgia" }).items[0]!.locationsInArea).toBe(1);
    expect(parseTrials(body, { kind: "state", value: "Georgia", label: "Georgia, United States" }).items[0]!.locationsInArea).toBe(1);
    expect(parseTrials(body, null).items[0]!.locationsInArea).toBeNull();
  });

  it("drops invalid / duplicate studies, strips control characters, caps lists, ignores unrequested fields", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Condition ${String.fromCharCode(65 + i)}`);
    const body = page([
      { protocolSection: { identificationModule: { nctId: "NOT-AN-ID" } } },
      { nope: true },
      {
        protocolSection: {
          ...study("NCT11111111").protocolSection,
          identificationModule: { nctId: "NCT11111111", briefTitle: "Title\u0000 with\ncontrol\tchars" },
          conditionsModule: { conditions: many },
          armsInterventionsModule: { interventions: many.map((name) => ({ name })) },
          statusModule: { overallStatus: "NOT_YET_RECRUITING", lastUpdatePostDateStruct: { date: "yesterday" } },
          designModule: {},
          contactsLocationsModule: { centralContacts: [{ name: "Dr Placeholder", phone: "555-0100", email: "x@example.org" }], locations: [] },
        },
      },
      study("NCT11111111"),
    ]);
    const { items } = parseTrials(body, null);
    expect(items).toHaveLength(1);
    const s = items[0]!;
    expect(s.title).toBe("Title with control chars");
    expect(s.conditions).toHaveLength(8);
    expect(s.interventions).toHaveLength(8);
    expect(s.status).toBe("Not yet recruiting");
    expect(s.phase).toBe("Not reported");
    expect(s.studyType).toBeNull();
    expect(s.lastUpdated).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/Placeholder|555-0100|example\.org/);
  });

  it("respects max and builds a clinicaltrials.gov link-out for the same search", async () => {
    const r = await searchTrials({ condition: "ptsd", country: "Canada", max: 1 });
    expect(r.items).toHaveLength(1);
    const link = new URL(r.searchUrl);
    expect(link.origin + link.pathname).toBe("https://clinicaltrials.gov/search");
    expect(Object.fromEntries(link.searchParams)).toEqual({ cond: "Post-traumatic Stress Disorder", aggFilters: "ages:adult,status:rec", country: "Canada" });
    expect(Object.fromEntries(new URL(trialsSearchLink({ condition: "ptsd", state: "NY" })).searchParams)).toMatchObject({ country: "United States", state: "New York" });
  });
});

describe("ClinicalTrials.gov: errors, caching, rate limiting, attribution", () => {
  it("maps upstream HTTP errors, bad shapes and non-JSON bodies to UpstreamError", async () => {
    fetchMock.mockImplementation(async () => new Response("oops", { status: 500 }));
    await expect(searchTrials({ condition: "ptsd" })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockImplementation(async () => json({ unexpected: true }));
    await expect(searchTrials({ condition: "agoraphobia" })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockImplementation(async () => new Response("<html>down</html>", { status: 200 }));
    await expect(searchTrials({ condition: "insomnia-disorder" })).rejects.toMatchObject({ name: "UpstreamError", status: 502 });
  });

  it("route: upstream failure -> 502 with a clinicaltrials.gov fallback link, no input echoed", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    const res = await post({ condition: "ptsd", state: "TX" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "upstream" });
    expect(body.fallbackUrl).toBe(trialsSearchLink({ condition: "ptsd", state: "TX" }));
    expect(body.error).not.toMatch(/Texas|ptsd/i);
  });

  it("caches identical searches", async () => {
    const a = await searchTrials({ condition: "ptsd", state: "TX" });
    const b = await searchTrials({ condition: "Post-traumatic Stress Disorder", state: "TX" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it("limits to ~45 requests/minute (0.75/s, burst 3), refusing before fetch", async () => {
    await searchTrials({ condition: "ptsd" });
    await searchTrials({ condition: "agoraphobia" });
    await searchTrials({ condition: "panic-disorder" });
    await expect(searchTrials({ condition: "insomnia-disorder" })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const res = await post({ condition: "obsessive-compulsive-disorder" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate-limited");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("route returns data with ClinicalTrials.gov attribution and source", async () => {
    expect(runtime).toBe("nodejs");
    const res = await post({ condition: "alcohol-use-disorder", max: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.attribution).toBe("Source: ClinicalTrials.gov (U.S. NLM). Listing does not imply endorsement.");
    expect(body.attribution).toBe(TRIALS_ATTRIBUTION);
    expect(body.source).toBe(TRIALS_SOURCE);
    expect(body.data.condition.sud).toBe(true); // UI shows the Part 2 banner (G6)
    expect(body.data.items).toHaveLength(1);
  });
});
