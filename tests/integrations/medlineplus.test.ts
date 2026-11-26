import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import { OutboundRejected } from "@/lib/outbound";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  CONNECT_ATTRIBUTION,
  SUMMARY_MAX_CHARS,
  configureConnectRateLimit,
  medlinePlusByCode,
} from "@/server/integrations/medlineplus-connect";
import { POST } from "@/server/routes/medlineplus";

const entry = (title: string, href: string, summary?: string) => ({
  title: { _value: title, type: "text" },
  link: [{ href, rel: "alternate" }],
  id: { _value: "tag: medlineplus.gov" },
  ...(summary === undefined ? {} : { summary: { type: "html", _value: summary } }),
});
// Real response shape (verified live 2026-11-26).
const feed = (entries: unknown) => ({ feed: { base: "https://medlineplus.gov/", lang: "en", title: { _value: "MedlinePlus Connect" }, entry: entries } });
const ANXIETY = feed([
  entry(
    "Anxiety",
    "https://medlineplus.gov/anxiety.html?utm_source=mplusconnect&utm_medium=service",
    `<h3>What is anxiety?</h3>\n<p>Anxiety is a feeling of fear &amp; unease. <a href="https://medlineplus.gov/stress.html">Stress</a> can play a role.</p>${"<p>More text here.</p>".repeat(60)}`,
  ),
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
beforeEach(() => {
  __resetCoreForTests();
  configureConnectRateLimit();
  phi.force = false;
  fetchMock = vi.fn(async () => json(ANXIETY));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const urlOf = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/medlineplus", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("medlineplus connect: outbound URL carries only the code, the code system and a language", () => {
  it("builds the exact upstream URL (English default)", async () => {
    await medlinePlusByCode({ code: "f41.1" });
    const u = urlOf();
    expect(`${u.origin}${u.pathname}`).toBe("https://connect.medlineplus.gov/service");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.90",
      "mainSearchCriteria.v.c": "F41.1",
      knowledgeResponseType: "application/json",
      "informationRecipient.languageCode.c": "en",
    });
    expect(u.searchParams.has("mainSearchCriteria.v.dn")).toBe(false); // display text is never sent
    expect(fetchMock.mock.calls[0]![1]!.body).toBeUndefined();
  });

  it("Spanish", async () => {
    const r = await medlinePlusByCode({ code: "F43.10", lang: "es" });
    expect(urlOf().searchParams.get("informationRecipient.languageCode.c")).toBe("es");
    expect(r.language).toBe("es");
  });
});

describe("medlineplus connect: free text, identifiers and long strings never leave the server", () => {
  const bad: unknown[] = [
    { code: "anxiety" },
    { code: "client feels anxious" },
    { code: "123-45-6789" },
    { code: "F41.1", lang: "fr" },
    { code: "F41.1", display: "John Smith" },
    { code: "F41.1".repeat(100) },
    { term: "anxiety" },
    {},
  ];
  it.each(bad.map((b) => [JSON.stringify(b).slice(0, 60), b]))("rejects %s before any fetch", async (_l, body) => {
    await expect(medlinePlusByCode(body as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assertNoPHI runs before fetch", async () => {
    phi.force = true;
    await expect(medlinePlusByCode({ code: "F41.1" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route 400 does not echo the input", async () => {
    const res = await post({ code: "Jane Doe 555-123-4567" });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toMatch(/Jane|555/);
  });
});

describe("medlineplus connect: normalisation", () => {
  it("returns plain-text summaries of at most 400 characters", async () => {
    const r = await medlinePlusByCode({ code: "F41.1" });
    expect(r.items).toHaveLength(1);
    const [page] = r.items;
    expect(page!.title).toBe("Anxiety");
    expect(page!.url).toBe("https://medlineplus.gov/anxiety.html?utm_source=mplusconnect&utm_medium=service");
    expect(page!.summary.startsWith("What is anxiety? Anxiety is a feeling of fear & unease. Stress can play a role.")).toBe(true);
    expect(page!.summary).not.toMatch(/[<>]/);
    expect(page!.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(page!.summary.endsWith("…")).toBe(true);
  });

  it("keeps only https MedlinePlus/NLM links, drops duplicates and caps at 10", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        feed([
          entry("Evil", "https://medlineplus.gov.evil.example/x"),
          entry("Script", "javascript:alert(1)"),
          entry("Plain http", "http://medlineplus.gov/anxiety.html"),
          entry("Genetics", "https://medlineplus.gov/genetics/condition/alcohol-use-disorder", "<p>Short.</p>"),
          entry("Genetics again", "https://medlineplus.gov/genetics/condition/alcohol-use-disorder"),
          { title: { _value: "No link" } },
          ...Array.from({ length: 15 }, (_, i) => entry(`Page ${i}`, `https://medlineplus.gov/p${i}.html`)),
        ]),
      ),
    );
    const r = await medlinePlusByCode({ code: "F10.20" });
    expect(r.items).toHaveLength(10);
    expect(r.items[0]).toEqual({ title: "Genetics", url: "https://medlineplus.gov/genetics/condition/alcohol-use-disorder", summary: "Short." });
    expect(r.items.every((i) => i.url.startsWith("https://medlineplus.gov/"))).toBe(true);
    expect(r.sud).toBe(true); // F10.x => Part 2 banner
  });

  it("no matches -> empty list; a single entry object is accepted", async () => {
    fetchMock.mockResolvedValueOnce(json(feed(undefined)));
    expect((await medlinePlusByCode({ code: "Z99.89" })).items).toEqual([]);
    fetchMock.mockResolvedValueOnce(json(feed(entry("Depression", "https://medlineplus.gov/depression.html"))));
    expect((await medlinePlusByCode({ code: "F32.A" })).items.map((i) => i.title)).toEqual(["Depression"]);
  });
});

describe("medlineplus connect: upstream errors map to safe errors", () => {
  it("HTTP error -> 502", async () => {
    fetchMock.mockResolvedValue(json({}, 503));
    await expect(medlinePlusByCode({ code: "F41.1" })).rejects.toBeInstanceOf(UpstreamError);
    const res = await post({ code: "F41.0" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Upstream service unavailable", code: "upstream" });
  });

  it("unexpected shape -> 502", async () => {
    fetchMock.mockResolvedValue(json({ nope: 1 }));
    await expect(medlinePlusByCode({ code: "F41.1" })).rejects.toMatchObject({ status: 502 });
  });
});

describe("medlineplus connect: caching, rate limiting (100/min terms), attribution", () => {
  it("caches per code and language", async () => {
    await medlinePlusByCode({ code: "F41.1" });
    await medlinePlusByCode({ code: "F41.1", lang: "en" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await medlinePlusByCode({ code: "F41.1", lang: "es" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("burst of 5, then 429 without calling upstream", async () => {
    for (const code of ["F40.00", "F40.01", "F40.02", "F41.0", "F41.1"]) await medlinePlusByCode({ code });
    await expect(medlinePlusByCode({ code: "F41.9" })).rejects.toMatchObject({ status: 429 });
    expect((await post({ code: "F43.10" })).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("route returns data with the MedlinePlus credit line", async () => {
    const res = await post({ code: "F41.1", lang: "en" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attribution).toBe("Information from MedlinePlus.gov");
    expect(body.attribution).toBe(CONNECT_ATTRIBUTION);
    expect(body.source).toMatch(/^https:\/\/medlineplus\.gov\//);
    expect(body.data).toMatchObject({ code: "F41.1", language: "en", sud: false });
  });
});
