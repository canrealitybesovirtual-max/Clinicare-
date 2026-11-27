import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const phi = vi.hoisted(() => ({ force: false }));
vi.mock("@/lib/phi-scrubber", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/phi-scrubber")>();
  return { ...real, containsPHI: (s: string) => phi.force || real.containsPHI(s) };
});

import topicsJson from "@content/topics.json";
import { OutboundRejected } from "@/lib/outbound";
import { containsPHI } from "@/lib/phi-scrubber";
import { UpstreamError, __resetCoreForTests } from "@/server/core";
import {
  HEALTH_TOPICS,
  HEALTH_TOPICS_ATTRIBUTION,
  HealthTopicsFileSchema,
  SUMMARY_MAX_CHARS,
  configureHealthTopicsRateLimit,
  parseHealthTopicsXml,
  searchHealthTopics,
} from "@/server/integrations/medlineplus-topics";
import { POST } from "@/server/routes/health-topics";

// Real response shape (verified live 2026-11-26): <content> values are XML-escaped HTML with highlight spans.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const doc = (url: string, fields: [string, string][]) =>
  `<document rank="0" url="${url}">\n${fields.map(([n, v]) => `      <content name="${n}">${esc(v)}</content>`).join("\n")}\n    </document>`;
const xml = (count: number, docs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<nlmSearchResult>\n  <term>x</term>\n  <count>${count}</count>\n  <retstart>0</retstart>\n  <retmax>10</retmax>\n  <list num="${count}" start="0" per="10">\n    ${docs.join("\n    ")}\n  </list>\n</nlmSearchResult>`;

const PANIC = xml(8, [
  doc("https://medlineplus.gov/panicdisorder.html", [
    ["title", '<span class="qt0">Panic</span> <span class="qt1">Disorder</span>'],
    ["organizationName", "National Library of Medicine"],
    ["altTitle", "Panic attacks"],
    ["altTitle", "Panic attacks"],
    ["groupName", "Mental Health and Behavior"],
    ["FullSummary", `What is <span class="qt0">panic</span> disorder?<p>It causes repeated attacks &amp; fear. Caf&#233; &mdash; ok.</p>${"<p>More.</p>".repeat(120)}`],
    ["snippet", "ignored when FullSummary exists"],
  ]),
  doc("https://medlineplus.gov/anxiety.html", [
    ["title", "Anxiety"],
    ["snippet", "What is anxiety? Anxiety is a feeling ..."],
  ]),
  doc("https://evil.example.com/phish.html", [["title", "Phish"]]),
  doc("javascript:alert(1)", [["title", "Script"]]),
  doc("https://medlineplus.gov/notitle.html", [["FullSummary", "no title"]]),
  doc("https://medlineplus.gov/anxiety.html", [["title", "Duplicate"]]),
  doc("https://medlineplus.gov/stress.html", [["title", "Stress"]]),
]);

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
beforeEach(() => {
  vi.stubEnv("ALLOW_SUD_REFERENCE_LOOKUPS", "true"); // 42 CFR Part 2 owner switch; default (off) is tested in hardening.test.ts
  __resetCoreForTests();
  configureHealthTopicsRateLimit();
  phi.force = false;
  fetchMock = vi.fn(async () => new Response(PANIC, { status: 200, headers: { "content-type": "text/xml" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const urlOf = (i = 0) => new URL(String(fetchMock.mock.calls[i]![0]));
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/health-topics", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("content/topics.json", () => {
  it("validates, with governance fields (G10)", () => {
    const file = HealthTopicsFileSchema.parse(topicsJson);
    expect(file.topics.length).toBeGreaterThanOrEqual(30);
    expect(file.license).toBe("original");
    expect(file.lastVerified).toBe("2026-11-27");
    expect(file.reviewedBy).toBe("PENDING");
    expect(file.sources.length).toBeGreaterThan(0);
  });

  it("keywords are plain, curated and identifier-free", () => {
    for (const t of HEALTH_TOPICS) {
      for (const k of [t.en, t.es]) {
        expect(containsPHI(k)).toBe(false);
        expect(k).toMatch(/^[\p{L}][\p{L} '-]{1,59}$/u);
      }
      expect(t.pages.en).toMatch(/^https:\/\/medlineplus\.gov\/[a-z]+\.html$/);
      expect(t.pages.es).toMatch(/^https:\/\/medlineplus\.gov\/spanish\/[a-z]+\.html$/);
    }
  });

  it("client labels name experiences, not diagnoses (G3)", () => {
    const diagnosisWords =
      /disorder|trastorno|depress|ptsd|tept|bipolar|phobi|fobia|ocd|toc\b|adhd|tdah|insomni|panic disorder|post-?traumatic|postraum|schizo|psychos|anorexia|bulimia|seasonal affective/i;
    for (const t of HEALTH_TOPICS) {
      expect(t.clientLabel).not.toMatch(diagnosisWords);
      expect(t.clientLabelEs).not.toMatch(diagnosisWords);
    }
  });

  it("covers the required core topics and flags SUD / crisis topics", () => {
    const en = HEALTH_TOPICS.map((t) => t.en);
    for (const k of ["anxiety", "panic disorder", "depression", "post-traumatic stress disorder", "healthy sleep", "insomnia", "stress", "grief", "alcohol use", "phobias", "obsessive-compulsive disorder", "social anxiety", "self-harm", "suicide prevention", "mental health", "relaxation techniques", "benefits of exercise"])
      expect(en).toContain(k);
    const byId = new Map(HEALTH_TOPICS.map((t) => [t.id, t]));
    expect(byId.get("alcohol")!.sud).toBe(true);
    expect(byId.get("quitting-smoking")!.sud).toBe(false); // tobacco is outside 42 CFR 2.11
    expect(byId.get("suicide-prevention")!.crisis).toBe(true);
    expect(byId.get("self-harm-prevention")!.crisis).toBe(true);
  });
});

describe("health topics: outbound URL carries only a curated keyword", () => {
  it("builds the exact upstream URL by topic id (English)", async () => {
    await searchHealthTopics({ topic: "panic-attacks" });
    const u = urlOf();
    expect(`${u.origin}${u.pathname}`).toBe("https://wsearch.nlm.nih.gov/ws/query");
    expect(Object.fromEntries(u.searchParams)).toEqual({ db: "healthTopics", term: "panic disorder", retmax: "10" });
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("GET");
  });

  it("Spanish uses the Spanish database and keyword; any curated key resolves the topic", async () => {
    await searchHealthTopics({ topic: "Panic Disorder", lang: "es" });
    expect(Object.fromEntries(urlOf().searchParams)).toEqual({ db: "healthTopicsSpanish", term: "trastorno de pánico", retmax: "10" });
    await searchHealthTopics({ topic: "TRASTORNO DE PÁNICO", lang: "en" });
    expect(urlOf(1).searchParams.get("term")).toBe("panic disorder");
  });

  const bad: unknown[] = [
    { topic: "my client cannot sleep since the accident" },
    { topic: "John Smith" },
    { topic: "anxiety", note: "DOB 01/02/1980" },
    { topic: "anxiety", lang: "fr" },
    { topic: "anxiety", max: 11 },
    { topic: "anxiety", max: 0 },
    { topic: "x".repeat(500) },
    { term: "anxiety" },
    {},
  ];
  it.each(bad.map((b) => [JSON.stringify(b).slice(0, 60), b]))("rejects %s before any fetch", async (_l, body) => {
    await expect(searchHealthTopics(body as never)).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assertNoPHI runs before fetch", async () => {
    phi.force = true;
    await expect(searchHealthTopics({ topic: "stress" })).rejects.toBeInstanceOf(OutboundRejected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route 400 does not echo the input", async () => {
    const res = await post({ topic: "Jane Doe, 555-123-4567" });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toMatch(/Jane|555/);
  });
});

describe("health topics: XML normalisation", () => {
  it("decodes, strips markup, filters links and clips summaries", async () => {
    const r = await searchHealthTopics({ topic: "panic-attacks", max: 10 });
    expect(r.total).toBe(8);
    expect(r.items.map((i) => i.url)).toEqual([
      "https://medlineplus.gov/panicdisorder.html",
      "https://medlineplus.gov/anxiety.html",
      "https://medlineplus.gov/stress.html",
    ]);
    const [first, second] = r.items;
    expect(first!.title).toBe("Panic Disorder");
    expect(first!.summary.startsWith("What is panic disorder? It causes repeated attacks & fear. Café — ok.")).toBe(true);
    expect(first!.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(first!.summary).not.toMatch(/[<>]|&[a-z]+;/);
    expect(first!.altTitles).toEqual(["Panic attacks"]);
    expect(first!.groups).toEqual(["Mental Health and Behavior"]);
    expect(second!.summary).toBe("What is anxiety? Anxiety is a feeling ...");
    expect(r.topic).toEqual({ id: "panic-attacks", clientLabel: "Panic attacks", page: "https://medlineplus.gov/panicdisorder.html", sud: false, crisis: false });
  });

  it("`max` trims locally without changing the upstream query (one cache entry per topic/language)", async () => {
    const a = await searchHealthTopics({ topic: "anxiety", max: 1 });
    const b = await searchHealthTopics({ topic: "anxiety", max: 3 });
    expect(a.items).toHaveLength(1);
    expect(b.items).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("empty results and Spanish client labels", async () => {
    fetchMock.mockResolvedValueOnce(new Response('<?xml version="1.0"?>\n<nlmSearchResult>\n  <term>x</term>\n  <count>0</count>\n</nlmSearchResult>'));
    const r = await searchHealthTopics({ topic: "suicide-prevention", lang: "es" });
    expect(r).toMatchObject({ total: 0, items: [], language: "es" });
    expect(r.topic).toMatchObject({ id: "suicide-prevention", crisis: true, page: "https://medlineplus.gov/spanish/suicide.html" });
    expect(r.topic.clientLabel).toBe(HEALTH_TOPICS.find((t) => t.id === "suicide-prevention")!.clientLabelEs);
  });

  it("non-XML or error payloads -> UpstreamError 502", () => {
    expect(() => parseHealthTopicsXml("<html>Service down</html>", 5)).toThrow(UpstreamError);
    expect(() => parseHealthTopicsXml("<nlmSearchResult><error>bad</error></nlmSearchResult>", 5)).toThrow(UpstreamError);
  });
});

describe("health topics: upstream errors, caching, rate limiting (85/min terms), attribution", () => {
  it("HTTP error -> 502 upstream", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 500 }));
    await expect(searchHealthTopics({ topic: "stress" })).rejects.toBeInstanceOf(UpstreamError);
    const res = await post({ topic: "grief" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Upstream service unavailable", code: "upstream" });
  });

  it("caches per topic and language", async () => {
    await searchHealthTopics({ topic: "stress" });
    await searchHealthTopics({ topic: "Stress", lang: "en" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchHealthTopics({ topic: "stress", lang: "es" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("burst of 5, then 429 without calling upstream", async () => {
    for (const topic of ["anxiety", "stress", "grief", "insomnia", "phobias"]) await searchHealthTopics({ topic });
    await expect(searchHealthTopics({ topic: "depression" })).rejects.toMatchObject({ status: 429 });
    expect((await post({ topic: "healthy sleep" })).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("route returns data with the MedlinePlus credit line and a language-specific source", async () => {
    const en = await (await post({ topic: "anxiety" })).json();
    expect(en).toMatchObject({ ok: true, attribution: "Information from MedlinePlus.gov", source: "https://medlineplus.gov/healthtopics.html" });
    expect(en.attribution).toBe(HEALTH_TOPICS_ATTRIBUTION);
    const es = await (await post({ topic: "ansiedad", lang: "es" })).json();
    expect(es.source).toBe("https://medlineplus.gov/spanish/healthtopics.html");
  });
});
