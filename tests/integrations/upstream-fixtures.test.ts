/**
 * E2E upstream fixture mode (src/server/core.ts, E2E_UPSTREAM_FIXTURES=1). It must:
 * - stay off unless asked, and be ignored on any hosting platform (RENDER / VERCEL set), so a deployment always
 *   talks to the real upstreams with their real limits;
 * - never touch the network while on (fetch is stubbed to fail the test);
 * - answer every curated lookup the app can make (every condition code, every medication), through the real
 *   adapters and routes, so the Playwright suite exercises real parsing and real UI states;
 * - reproduce error paths (429, 404, not configured) from fixture entries.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allConditions } from "@/lib/library";
import medicationsFile from "@content/medications.json";
import {
  HOSTING_PLATFORM_MARKERS,
  UPSTREAM_FIXTURES_DIR,
  UpstreamFixtureFile,
  __resetCoreForTests,
  __resetUpstreamFixturesForTests,
  upstreamFetch,
  upstreamFixturesEnabled,
} from "@/server/core";
import { __resetIcd11ForTests } from "@/server/integrations/who-icd11";
import { __resetOpenFdaForTests } from "@/server/integrations/openfda";
import { POST as icd10cm } from "@/server/routes/icd10cm";
import { POST as icd11 } from "@/server/routes/icd11";
import { POST as medlineplus } from "@/server/routes/medlineplus";
import { POST as healthTopics } from "@/server/routes/health-topics";
import { POST as providers } from "@/server/routes/providers";
import { POST as healthCenters } from "@/server/routes/health-centers";
import { POST as treatmentFacilities } from "@/server/routes/treatment-facilities";
import { POST as rxnorm } from "@/server/routes/rxnorm";
import { POST as drugLabel } from "@/server/routes/drug-label";
import { POST as pubmed } from "@/server/routes/pubmed";
import { POST as trials } from "@/server/routes/trials";
import { POST as gho } from "@/server/routes/gho";
import { POST as lactmed } from "@/server/routes/lactmed";

type Handler = (req: Request) => Promise<Response>;
const call = async (handler: Handler, body: unknown) => {
  const res = await handler(
    new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> & { ok: boolean; data?: Record<string, unknown>; code?: string } };
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  for (const k of HOSTING_PLATFORM_MARKERS) vi.stubEnv(k, undefined);
  vi.stubEnv("E2E_UPSTREAM_FIXTURES", "1");
  vi.stubEnv("CRC_FIXTURE_BUILD", "1"); // what next.config.ts inlines for a fixture build
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true");
  vi.stubEnv("HRSA_API_KEY", "e2e-fixture-token");
  vi.stubEnv("FINDTREATMENT_ACCESS_APPROVED", "true");
  vi.stubEnv("WHO_ICD_CLIENT_ID", "e2e-fixture-client");
  vi.stubEnv("WHO_ICD_CLIENT_SECRET", "e2e-fixture-secret");
  __resetCoreForTests();
  __resetUpstreamFixturesForTests();
  __resetIcd11ForTests();
  __resetOpenFdaForTests();
  fetchMock = vi.fn(async () => {
    throw new Error("network must not be used in fixture mode");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fixture mode switch", () => {
  it("is off unless E2E_UPSTREAM_FIXTURES is exactly 1", () => {
    const build = { CRC_FIXTURE_BUILD: "1" };
    expect(upstreamFixturesEnabled({ ...build })).toBe(false);
    expect(upstreamFixturesEnabled({ ...build, E2E_UPSTREAM_FIXTURES: "true" })).toBe(false);
    expect(upstreamFixturesEnabled({ ...build, E2E_UPSTREAM_FIXTURES: "0" })).toBe(false);
    expect(upstreamFixturesEnabled({ ...build, E2E_UPSTREAM_FIXTURES: "1" })).toBe(true);
  });

  it("is off in any build that did not opt in at build time, even with the runtime variable set", () => {
    expect(upstreamFixturesEnabled({ E2E_UPSTREAM_FIXTURES: "1" })).toBe(false);
    expect(upstreamFixturesEnabled({ E2E_UPSTREAM_FIXTURES: "1", CRC_FIXTURE_BUILD: "0" })).toBe(false);
  });

  it("is ignored on hosting platforms, whatever the variable says", () => {
    const on = { E2E_UPSTREAM_FIXTURES: "1", CRC_FIXTURE_BUILD: "1" };
    expect(HOSTING_PLATFORM_MARKERS).toEqual(expect.arrayContaining(["RENDER", "VERCEL", "NETLIFY", "K_SERVICE"]));
    expect(upstreamFixturesEnabled({ ...on, RENDER: "true" })).toBe(false);
    expect(upstreamFixturesEnabled({ ...on, RENDER: "" })).toBe(false);
    expect(upstreamFixturesEnabled({ ...on, VERCEL: "1" })).toBe(false);
    expect(upstreamFixturesEnabled({ ...on, NETLIFY: "true" })).toBe(false);
    expect(upstreamFixturesEnabled({ ...on, K_SERVICE: "app" })).toBe(false);
  });

  it("with RENDER set, a route goes to the real network path (fetch is called)", async () => {
    vi.stubEnv("RENDER", "true");
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify([1, ["F41.1"], null, [["F41.1", "Generalized anxiety disorder"]]]), { headers: { "content-type": "application/json" } }),
    );
    const r = await call(icd10cm, { code: "F41.1" });
    expect(r.json.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^https:\/\/clinicaltables\.nlm\.nih\.gov\//);
  });

  it("a request no fixture matches fails with 502 and never reaches the network", async () => {
    await expect(upstreamFetch("https://example.invalid/x", { upstream: "no-such-upstream" })).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fixture files", () => {
  const files = readdirSync(UPSTREAM_FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  it("cover every upstream adapter", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(
      [
        "clinicaltrials-gov",
        "cms-nppes",
        "hrsa-hdw",
        "medlineplus-connect",
        "medlineplus-topics",
        "ncbi-eutils",
        "nlm-icd10cm",
        "nlm-rxnav",
        "openfda-label",
        "samhsa-findtreatment",
        "who-gho",
        "who-icd11",
        "who-icd11-token",
      ].sort(),
    );
  });
  for (const f of files) {
    it(`${f} parses and names its own upstream`, () => {
      const parsed = UpstreamFixtureFile.parse(JSON.parse(readFileSync(path.join(UPSTREAM_FIXTURES_DIR, f), "utf8")));
      expect(parsed.upstream).toBe(f.replace(/\.json$/, ""));
    });
  }
});

describe("every route answers from fixtures through the real adapters (no network)", () => {
  it("ICD-10-CM: every curated condition code", async () => {
    for (const c of allConditions)
      for (const { code } of c.icd10cm) {
        const r = await call(icd10cm, { code });
        expect(r.json.ok, code).toBe(true);
        expect((r.json.data!.items as { code: string }[]).map((i) => i.code), code).toContain(code);
      }
  });

  it("ICD-11: every curated condition code (token + codeinfo + entity)", async () => {
    for (const c of allConditions)
      for (const { code, label } of c.icd11) {
        const r = await call(icd11, { code, lang: "en" });
        expect(r.json.ok, code).toBe(true);
        expect(r.json.data).toMatchObject({ code, found: true, title: label });
      }
  });

  it("MedlinePlus Connect and Health Topics, English and Spanish", async () => {
    for (const lang of ["en", "es"]) {
      const m = await call(medlineplus, { code: "F41.1", lang });
      expect(m.json.ok).toBe(true);
      expect((m.json.data!.items as unknown[]).length).toBeGreaterThan(0);
      const t = await call(healthTopics, { topic: "stress", lang, max: 5 });
      expect(t.json.ok).toBe(true);
      expect((t.json.data!.items as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it("referrals: providers (every type), health centers and treatment facilities", async () => {
    for (const providerType of [
      "psychiatrist",
      "psychiatric-np",
      "psychologist",
      "clinical-psychologist",
      "professional-counselor",
      "mental-health-counselor",
      "clinical-social-worker",
      "marriage-family-therapist",
      "addiction-counselor",
    ]) {
      const r = await call(providers, { providerType, location: { zip: "62701" }, limit: 20 });
      expect(r.json.ok, providerType).toBe(true);
      expect((r.json.data!.results as unknown[]).length, providerType).toBeGreaterThan(0);
    }
    const h = await call(healthCenters, { location: { city: "Springfield", state: "IL" }, radiusMiles: 10, limit: 25 });
    expect(h.json.ok).toBe(true);
    expect((h.json.data!.sites as unknown[]).length).toBe(3);
    for (const facilityType of ["mental-health", "substance-use", "both"]) {
      const f = await call(treatmentFacilities, { location: { zip: "62701" }, facilityType, radiusMiles: 25 });
      expect(f.json.ok, facilityType).toBe(true);
      expect(f.json.data!.part2Notice === null, facilityType).toBe(facilityType === "mental-health");
    }
  });

  it("medications: every curated drug gets its curated RxCUI and a label", async () => {
    const meds = (medicationsFile as { medications: { id: string; generic: string; label?: { unharmonized?: boolean } }[] }).medications;
    for (const m of meds) {
      const r = await call(rxnorm, { drug: m.generic });
      expect(r.json.ok, m.id).toBe(true);
      expect(r.json.data, m.id).toMatchObject({ found: true, matchesCurated: true });
      const l = await call(drugLabel, { drug: m.generic });
      expect(l.json.ok, m.id).toBe(true);
      if (!m.label?.unharmonized) expect(l.json.data!.found, m.id).toBe(true);
    }
  });

  it("evidence: PubMed, ClinicalTrials.gov and WHO GHO", async () => {
    const p = await call(pubmed, { queryId: "cbt" });
    expect(p.json.ok).toBe(true);
    expect((p.json.data!.items as unknown[]).length).toBe(3);
    const t = await call(trials, { condition: "panic-disorder" });
    expect(t.json.ok).toBe(true);
    expect((t.json.data!.items as unknown[]).length).toBe(2);
    const g = await call(gho, { indicator: "suicide-rate-age-standardized", country: "GLOBAL" });
    expect(g.json.ok).toBe(true);
    expect(g.json.data).toMatchObject({ found: true, latestYear: 2021 });
  });

  it("LactMed: a curated drug gets the books fixture, not the PubMed one", async () => {
    const r = await call(lactmed, { drug: "sertraline" });
    expect(r.json.ok).toBe(true);
    expect(r.json.data).toMatchObject({ found: true });
    expect((r.json.data!.records as { url: string }[])[0]!.url).toBe("https://www.ncbi.nlm.nih.gov/books/NBK9910001/");
  });

  it("error entries: a 429 fixture maps to rate-limited, unknown ICD-11 codes to not found", async () => {
    const r = await call(providers, { providerType: "psychologist", location: { zip: "99950" } });
    expect(r.status).toBe(429);
    expect(r.json.code).toBe("rate-limited");
    const empty = await call(providers, { providerType: "psychologist", location: { zip: "59001" } });
    expect(empty.json.ok).toBe(true);
    expect(empty.json.data!.results).toEqual([]);
    const unknown = await call(icd11, { code: "6A00", lang: "en" });
    expect(unknown.json.ok).toBe(true);
    expect(unknown.json.data!.found).toBe(false);
  });

  it("route-level checks still run before any fixture (Part 2 switch off => not configured)", async () => {
    vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "");
    const r = await call(icd10cm, { code: "F10.20" });
    expect(r.status).toBe(503);
    expect(r.json.code).toBe("not-configured");
  });

  afterEach(() => {
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
