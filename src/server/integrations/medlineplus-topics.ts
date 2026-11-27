import "server-only";
/**
 * MedlinePlus Health Topics web service (https://wsearch.nlm.nih.gov/ws/query), docs:
 * https://medlineplus.gov/about/developers/webservices/
 * - Outbound: ONLY a curated keyword from content/topics.json (G5, G17). Never typed text.
 * - Terms: free; 85 requests/minute per IP. We allow 1 request/s with a burst of 5 (<= 65 in any first minute),
 *   and cache 12 h (the topics are refreshed daily, Tuesday-Saturday).
 * - Response is XML whose <content> values are XML-escaped HTML. Parsed with bounded regexes, no new dependency.
 * - Client mode (G3): upstream titles/summaries can name diagnoses. Client-mode UI should show the topic's
 *   clientLabel and link out to the page; clinician mode may show titles and summaries.
 */
import { z } from "zod";
import topicsJson from "@content/topics.json";
import { assertNoPHI } from "@/lib/outbound";
import { HealthTopicsFileSchema, type HealthTopic } from "@/lib/schemas-topics";
import { UpstreamError, assertSudLookupAllowed, setRateLimit, upstreamFetch } from "@/server/core";
import { clip, safeHttpsUrl, xmlEscapedHtmlToPlainText } from "./plain-text";
import { strictCurated } from "./strict-input";

/* ---------------- curated topics (content/topics.json) ---------------- */
// One contract for the file, shared with the CI content validator (src/lib/schemas-topics.ts).
export { HealthTopicSchema, HealthTopicsFileSchema, type HealthTopic } from "@/lib/schemas-topics";
const MEDLINEPLUS_HOSTS = ["medlineplus.gov"] as const;

export const healthTopicsFile = HealthTopicsFileSchema.parse(topicsJson);
export const HEALTH_TOPICS: readonly HealthTopic[] = healthTopicsFile.topics;
const topicByKey = new Map<string, HealthTopic>();
for (const t of HEALTH_TOPICS) for (const k of [t.id, t.en, t.es]) topicByKey.set(k.toLowerCase(), t);

/** Every value a caller may send as `topic`: topic ids plus the English and Spanish keywords. */
export const HEALTH_TOPIC_KEYS: readonly string[] = [...new Set(HEALTH_TOPICS.flatMap((t) => [t.id, t.en, t.es]))];

/* ---------------- input / output ---------------- */
export const HEALTH_TOPICS_UPSTREAM = "medlineplus-topics";
export const HEALTH_TOPICS_ENDPOINT = "https://wsearch.nlm.nih.gov/ws/query";
export const HEALTH_TOPICS_ATTRIBUTION = "Information from MedlinePlus.gov";
export const HEALTH_TOPICS_SOURCE = { en: "https://medlineplus.gov/healthtopics.html", es: "https://medlineplus.gov/spanish/healthtopics.html" } as const;
/** Always fetch this many so each topic/language is one cache entry; `max` trims locally. */
export const HEALTH_TOPICS_RETMAX = 10;
export const HEALTH_TOPICS_TTL_MS = 12 * 60 * 60 * 1000;
export const SUMMARY_MAX_CHARS = 400;

export function configureHealthTopicsRateLimit() {
  // Published: 85 requests/minute per IP. Bucket 1/s burst 5 (<= 65 in a minute); the window is a hard cap of 80.
  setRateLimit(HEALTH_TOPICS_UPSTREAM, 1, 5, { max: 80, ms: 60_000 });
}
configureHealthTopicsRateLimit();

export const HealthTopicsLang = z.enum(["en", "es"]);
export const HealthTopicsInput = z.strictObject({
  topic: strictCurated(HEALTH_TOPIC_KEYS).transform((k) => topicByKey.get(k.toLowerCase())!.id),
  lang: HealthTopicsLang.default("en"),
  max: z.number().int().min(1).max(HEALTH_TOPICS_RETMAX).default(5),
});
export type HealthTopicsInput = z.input<typeof HealthTopicsInput>;

export interface HealthTopicPage {
  title: string;
  url: string;
  summary: string; // plain text, <= 400 chars
  altTitles: string[];
  groups: string[];
}
export interface HealthTopicsResult {
  topic: { id: string; clientLabel: string; page: string; sud: boolean; crisis: boolean };
  language: "en" | "es";
  total: number;
  items: HealthTopicPage[];
}

/* ---------------- XML parsing ---------------- */
const DOC_RE = /<document\b([^>]*)>([\s\S]*?)<\/document>/g;
const CONTENT_RE = /<content\s+name="([A-Za-z]{1,40})"\s*>([\s\S]*?)<\/content>/g;

/** Parse the web service XML into normalised pages. Exported for tests. */
export function parseHealthTopicsXml(xml: string, max: number): { total: number; items: HealthTopicPage[] } {
  if (!/<nlmSearchResult\b/.test(xml) || /<error\b/i.test(xml.slice(0, 2000))) {
    throw new UpstreamError(HEALTH_TOPICS_UPSTREAM, 502, "Unexpected response from upstream service");
  }
  const total = Number(/<count>(\d{1,9})<\/count>/.exec(xml)?.[1] ?? 0);
  const items: HealthTopicPage[] = [];
  const seen = new Set<string>();
  for (const doc of xml.matchAll(DOC_RE)) {
    if (items.length >= max) break;
    const rawUrl = /\burl="([^"]{1,500})"/.exec(doc[1] ?? "")?.[1];
    const url = safeHttpsUrl(rawUrl ? xmlEscapedHtmlToPlainText(rawUrl) : null, MEDLINEPLUS_HOSTS);
    if (!url || seen.has(url)) continue;
    const fields = new Map<string, string[]>();
    for (const c of (doc[2] ?? "").matchAll(CONTENT_RE)) {
      const name = c[1]!;
      const text = xmlEscapedHtmlToPlainText(c[2] ?? "");
      if (!text) continue;
      fields.set(name, [...(fields.get(name) ?? []), text]);
    }
    const title = fields.get("title")?.[0];
    if (!title) continue;
    seen.add(url);
    const summary = fields.get("FullSummary")?.[0] ?? fields.get("snippet")?.[0] ?? "";
    items.push({
      title: clip(title, 200),
      url,
      summary: clip(summary, SUMMARY_MAX_CHARS),
      altTitles: [...new Set(fields.get("altTitle") ?? [])].slice(0, 5).map((s) => clip(s, 100)),
      groups: [...new Set(fields.get("groupName") ?? [])].slice(0, 5).map((s) => clip(s, 100)),
    });
  }
  return { total, items };
}

/* ---------------- adapter ---------------- */
export function healthTopicsUrl(keywordValue: string, lang: "en" | "es"): string {
  const params = new URLSearchParams({
    db: lang === "es" ? "healthTopicsSpanish" : "healthTopics",
    term: keywordValue,
    retmax: String(HEALTH_TOPICS_RETMAX),
  });
  return `${HEALTH_TOPICS_ENDPOINT}?${params}`;
}

/** Search MedlinePlus health topics for one curated keyword. Throws ZodError/OutboundRejected before any fetch. */
export async function searchHealthTopics(raw: HealthTopicsInput): Promise<HealthTopicsResult> {
  const input = HealthTopicsInput.parse(raw);
  const topic = topicByKey.get(input.topic)!;
  const term = input.lang === "es" ? topic.es : topic.en;
  assertNoPHI(term, input.lang);
  assertSudLookupAllowed(topic.sud); // 42 CFR Part 2 owner switch (core.ts), before any fetch
  const xml = await upstreamFetch<string>(healthTopicsUrl(term, input.lang), {
    upstream: HEALTH_TOPICS_UPSTREAM,
    parse: "text",
    ttlMs: HEALTH_TOPICS_TTL_MS,
    headers: { Accept: "application/xml, text/xml" },
  });
  if (typeof xml !== "string") throw new UpstreamError(HEALTH_TOPICS_UPSTREAM, 502, "Unexpected response from upstream service");
  const { total, items } = parseHealthTopicsXml(xml, input.max);
  return {
    topic: {
      id: topic.id,
      clientLabel: input.lang === "es" ? topic.clientLabelEs : topic.clientLabel,
      page: topic.pages[input.lang],
      sud: topic.sud,
      crisis: topic.crisis,
    },
    language: input.lang,
    total,
    items,
  };
}
