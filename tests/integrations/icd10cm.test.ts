import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

// Lets one test prove assertNoPHI runs before any fetch (last line of defence behind the validators).
const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import { conditions } from "@/lib/content";
import { OutboundRejected } from "@/lib/outbound";
import { containsPHI } from "@/lib/phi-scrubber";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  ICD10CM_ATTRIBUTION,
  ICD10CM_SOURCE,
  ICD10CM_TERMS,
  configureIcd10cmRateLimit,
  isSudIcd10cm,
  searchIcd10cm,
} from "@/server/integrations/nlm-icd10cm";
import { POST } from "@/server/routes/icd10cm";

// Real response shape (verified live 2026-11-26): [total, codes[], extra, display[][]]
const PTSD = [
  3,
  ["F43.10", "F43.11", "F43.12"],
  null,
  [
    ["F43.10", "Post-traumatic stress disorder, unspecified"],
    ["F43.11", "Post-traumatic stress disorder, acute"],
    ["F43.12", "Post-traumatic stress disorder, chronic"],
  ],
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
beforeEach(() => {
  __resetCoreForTests();
  configureIcd10cmRateLimit();
  phi.force = false;
  fetchMock = vi.fn(async () => json(PTSD));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const urlOf = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const paramsOf = (i = 0) => Object.fromEntries(urlOf(i).searchParams);
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/icd10cm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("icd10cm: outbound URL carries only a code or a curated term", () => {
  it("code lookup builds the exact upstream URL", async () => {
    const r = await searchIcd10cm({ code: " f43.1 " });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const u = urlOf();
    expect(`${u.origin}${u.pathname}`).toBe("https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search");
    expect(paramsOf()).toEqual({ sf: "code,name", df: "code,name", terms: "F43.1", maxList: "10" });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(r.query).toEqual({ kind: "code", value: "F43.1" });
    expect(r.items).toEqual([
      { code: "F43.10", name: "Post-traumatic stress disorder, unspecified" },
      { code: "F43.11", name: "Post-traumatic stress disorder, acute" },
      { code: "F43.12", name: "Post-traumatic stress disorder, chronic" },
    ]);
    expect(r.total).toBe(3);
  });

  it("a differential label is searched by its ICD-10-CM title", async () => {
    await searchIcd10cm({ term: "Social anxiety disorder (ICD-10-CM title: Social phobia, unspecified)" });
    expect(paramsOf().terms).toBe("Social phobia, unspecified");
  });

  it("condition names, ICD titles and topic keywords are accepted case-insensitively", async () => {
    await searchIcd10cm({ term: "GENERALIZED ANXIETY DISORDER", max: 5 });
    await searchIcd10cm({ term: "Posttraumatic stress disorder (PTSD)" });
    await searchIcd10cm({ term: "insomnia" });
    expect(paramsOf(0)).toEqual({ sf: "code,name", df: "code,name", terms: "Generalized anxiety disorder", maxList: "5" });
    expect(paramsOf(1).terms).toBe("Posttraumatic stress disorder");
    expect(paramsOf(2).terms).toBe("insomnia");
  });

  it("the curated list is built from content and contains no identifiers", () => {
    for (const c of conditions) expect(ICD10CM_TERMS).toContain(c.name);
    expect(ICD10CM_TERMS.length).toBeGreaterThan(30);
    for (const t of ICD10CM_TERMS) {
      expect(containsPHI(t)).toBe(false);
      expect(t.length).toBeLessThanOrEqual(120);
    }
  });

  it("maxList is capped at 20", async () => {
    await searchIcd10cm({ code: "F41", max: 20 });
    expect(paramsOf().maxList).toBe("20");
    await expect(searchIcd10cm({ code: "F41", max: 21 })).rejects.toBeInstanceOf(ZodError);
    await expect(searchIcd10cm({ code: "F41", max: 0 })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("icd10cm: free text, identifiers and long strings never leave the server", () => {
  const bad: unknown[] = [
    { term: "client reports panic attacks at work" },
    { term: "John Smith panic disorder" },
    { term: "panic disorder ".repeat(40) },
    { term: "Panic disorder", note: "MRN 1234567" },
    { code: "F41.1", term: "Panic disorder" },
    { code: "123-45-6789" },
    { code: "F41.1 John Smith" },
    { code: "555-123-4567" },
    { code: "panic" },
    { code: 4110 },
    { term: "" },
    {},
    null,
  ];
  it.each(bad.map((b) => [JSON.stringify(b)?.slice(0, 60), b]))("rejects %s before any fetch", async (_label, body) => {
    await expect(searchIcd10cm(body as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assertNoPHI runs on the outgoing value before fetch", async () => {
    phi.force = true;
    await expect(searchIcd10cm({ code: "F41.1" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route errors never echo the planted identifier", async () => {
    const res = await post({ term: "John Smith 555-123-4567" });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/John|555/);
    expect(JSON.parse(text)).toMatchObject({ ok: false, code: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route rejects oversized and malformed bodies", async () => {
    expect((await post(JSON.stringify({ term: "x".repeat(3000) }))).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("icd10cm: normalisation", () => {
  it("drops malformed rows, strips markup, de-duplicates and caps the list", async () => {
    fetchMock.mockResolvedValueOnce(
      json([
        59,
        [],
        null,
        [
          ["F41.1", "Generalized <b>anxiety</b> disorder"],
          ["F41.1", "duplicate"],
          ["NOT-A-CODE", "junk"],
          [42, "junk"],
          ["F41.9", "Anxiety disorder, unspecified"],
          ["F40.8", "Other phobic anxiety disorders"],
        ],
      ]),
    );
    const r = await searchIcd10cm({ term: "anxiety", max: 2 });
    expect(r.total).toBe(59);
    expect(r.items).toEqual([
      { code: "F41.1", name: "Generalized anxiety disorder" },
      { code: "F41.9", name: "Anxiety disorder, unspecified" },
    ]);
  });

  it("flags substance-related codes for the Part 2 banner", async () => {
    expect(isSudIcd10cm("F10.20")).toBe(true);
    expect(isSudIcd10cm("Z71.41")).toBe(true);
    expect(isSudIcd10cm("F41.1")).toBe(false);
    fetchMock.mockResolvedValueOnce(json([1, ["F10.20"], null, [["F10.20", "Alcohol dependence, uncomplicated"]]]));
    expect((await searchIcd10cm({ term: "alcohol use" })).sud).toBe(true);
    expect((await searchIcd10cm({ code: "F43.1" })).sud).toBe(false);
  });
});

describe("icd10cm: upstream errors map to safe errors", () => {
  it("HTTP error -> UpstreamError -> 502 upstream", async () => {
    fetchMock.mockResolvedValue(json({ error: "boom" }, 500));
    await expect(searchIcd10cm({ code: "F41.1" })).rejects.toBeInstanceOf(UpstreamError);
    const res = await post({ code: "F41.2" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Upstream service unavailable", code: "upstream" });
  });

  it("unexpected response shape -> 502", async () => {
    fetchMock.mockResolvedValue(json({ unexpected: true }));
    await expect(searchIcd10cm({ code: "F41.1" })).rejects.toMatchObject({ name: "UpstreamError", status: 502 });
  });

  it("network failure -> 504 UpstreamError -> 502 route", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(searchIcd10cm({ code: "F41.1" })).rejects.toMatchObject({ status: 504 });
    expect((await post({ code: "F41.3" })).status).toBe(502);
  });
});

describe("icd10cm: caching, rate limiting, attribution", () => {
  it("caches identical lookups", async () => {
    await searchIcd10cm({ code: "F41.1" });
    await searchIcd10cm({ code: "f41.1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchIcd10cm({ code: "F41.1", max: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enforces the configured burst (10) and then answers 429 without calling upstream", async () => {
    const codes = ["F40", "F41", "F42", "F43", "F44", "F45", "F48", "F50", "F51", "F60"];
    for (const code of codes) await searchIcd10cm({ code });
    expect(fetchMock).toHaveBeenCalledTimes(10);
    await expect(searchIcd10cm({ code: "F63" })).rejects.toMatchObject({ status: 429 });
    const res = await post({ code: "F64" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: "rate-limited" });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("route returns data with attribution and no-store", async () => {
    const res = await post({ code: "F43.1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, attribution: ICD10CM_ATTRIBUTION, source: ICD10CM_SOURCE });
    expect(body.attribution).toBe("ICD-10-CM codes: NLM Clinical Table Search Service (provided as is)");
    expect(body.data.items).toHaveLength(3);
  });
});
