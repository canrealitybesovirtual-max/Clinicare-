import "server-only";
/**
 * MedlinePlus Connect (https://connect.medlineplus.gov/service), docs:
 * https://medlineplus.gov/medlineplus-connect/web-service/
 * - Outbound: ONLY an ICD-10-CM code, the fixed ICD-10-CM code-system OID and a language code (G5, G17).
 *   The optional display-name parameter (mainSearchCriteria.v.dn) is never sent.
 * - Terms: free; 100 requests/minute per IP (excess requests are refused for several minutes). We allow
 *   1 request/s with a burst of 5, and cache 12 h (NLM recommends caching results for 12-24 hours).
 * - Attribution: "Information from MedlinePlus.gov". No MedlinePlus logo; no implied NLM endorsement.
 */
import { z } from "zod";
import { assertNoPHI } from "@/lib/outbound";
import { UpstreamError, assertSudLookupAllowed, setRateLimit, upstreamFetch } from "@/server/core";
import { isSudIcd10cm } from "./nlm-icd10cm";
import { clip, htmlToPlainText, safeHttpsUrl } from "./plain-text";
import { StrictIcd10CmCode } from "./strict-input";

export const CONNECT_UPSTREAM = "medlineplus-connect";
export const CONNECT_ENDPOINT = "https://connect.medlineplus.gov/service";
/** HL7 OID for the ICD-10-CM code system. */
export const ICD10CM_OID = "2.16.840.1.113883.6.90";
export const CONNECT_ATTRIBUTION = "Information from MedlinePlus.gov";
export const CONNECT_SOURCE = "https://medlineplus.gov/medlineplus-connect/";
export const CONNECT_TTL_MS = 12 * 60 * 60 * 1000;
export const CONNECT_MAX_ITEMS = 10;
export const SUMMARY_MAX_CHARS = 400;
const ALLOWED_HOSTS = ["medlineplus.gov", "nlm.nih.gov"] as const;

export function configureConnectRateLimit() {
  // Published: 100 requests/minute per IP. Bucket 1/s burst 5 (<= 65 in a minute); the window is a hard cap of 90.
  setRateLimit(CONNECT_UPSTREAM, 1, 5, { max: 90, ms: 60_000 });
}
configureConnectRateLimit();

export const MedlinePlusLang = z.enum(["en", "es"]);
export const MedlinePlusConnectInput = z.strictObject({
  code: StrictIcd10CmCode,
  lang: MedlinePlusLang.default("en"),
});
export type MedlinePlusConnectInput = z.input<typeof MedlinePlusConnectInput>;

export interface MedlinePlusPage {
  title: string;
  url: string;
  summary: string; // plain text, <= 400 chars
}
export interface MedlinePlusConnectResult {
  code: string;
  language: "en" | "es";
  items: MedlinePlusPage[];
  sud: boolean; // SUD code => show the Part 2 banner (G6)
}

const Text = z.object({ _value: z.string() });
const Entry = z.object({
  title: Text.optional(),
  link: z.array(z.object({ href: z.string(), rel: z.string().optional() })).optional(),
  summary: Text.optional(),
});
const Feed = z.object({
  feed: z.object({
    entry: z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(z.unknown())),
  }),
});

export function connectUrl(code: string, lang: "en" | "es"): string {
  const params = new URLSearchParams({
    "mainSearchCriteria.v.cs": ICD10CM_OID,
    "mainSearchCriteria.v.c": code,
    knowledgeResponseType: "application/json",
    "informationRecipient.languageCode.c": lang,
  });
  return `${CONNECT_ENDPOINT}?${params}`;
}

/** Plain-language MedlinePlus pages for one ICD-10-CM code. Throws ZodError/OutboundRejected before any fetch. */
export async function medlinePlusByCode(raw: MedlinePlusConnectInput): Promise<MedlinePlusConnectResult> {
  const input = MedlinePlusConnectInput.parse(raw);
  assertNoPHI(input.code, input.lang);
  assertSudLookupAllowed(isSudIcd10cm(input.code)); // 42 CFR Part 2 owner switch (core.ts), before any fetch

  const json = await upstreamFetch<unknown>(connectUrl(input.code, input.lang), { upstream: CONNECT_UPSTREAM, ttlMs: CONNECT_TTL_MS });
  const feed = Feed.safeParse(json);
  if (!feed.success) throw new UpstreamError(CONNECT_UPSTREAM, 502, "Unexpected response from upstream service");

  const items: MedlinePlusPage[] = [];
  const seen = new Set<string>();
  for (const rawEntry of feed.data.feed.entry) {
    if (items.length >= CONNECT_MAX_ITEMS) break;
    const e = Entry.safeParse(rawEntry);
    if (!e.success) continue;
    const link = e.data.link?.find((l) => !l.rel || l.rel === "alternate") ?? e.data.link?.[0];
    const url = safeHttpsUrl(link?.href, ALLOWED_HOSTS);
    const title = e.data.title ? clip(htmlToPlainText(e.data.title._value), 200) : "";
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    items.push({ title, url, summary: e.data.summary ? clip(htmlToPlainText(e.data.summary._value), SUMMARY_MAX_CHARS) : "" });
  }
  return { code: input.code, language: input.lang, items, sud: isSudIcd10cm(input.code) };
}
