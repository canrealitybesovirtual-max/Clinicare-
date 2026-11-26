import "server-only";
/**
 * WHO Global Health Observatory (GHO) OData API. Docs: https://www.who.int/data/gho/info/gho-odata-api
 * - Endpoint (verified live 2026-11-26): https://ghoapi.azureedge.net/api/<IndicatorCode>. WHO's legacy page says this
 *   API was to be deprecated near the end of 2025 for a "World Health Data Hub OData API" with standardized field
 *   names; no public URL for it is published yet. WHO_GHO_API_BASE (server env, https on a WHO/Azure-edge host only)
 *   can point at a same-schema mirror; a schema change needs a new normaliser.
 * - Outbound: ONLY a curated indicator code (content/gho-indicators.json) in the path, and an OData filter built
 *   from a curated ISO3 / WHO area code and its fixed area type (G5, G17). No client data exists here at all.
 * - Terms: public, no key, no published rate limit. We send at most 1 request/second (burst 3) and cache 12 h
 *   (WHO refreshes these series a few times a year). Attribution "Source: WHO Global Health Observatory" with the
 *   data year on every value (G13); values older than 5 years are flagged `stale` for review.
 */
import { z } from "zod";
import ghoJson from "@content/gho-indicators.json";
import { assertNoPHI } from "@/lib/outbound";
import { GhoIndicatorsFileSchema, ghoIndicatorCode, type GhoArea, type GhoIndicator } from "@/lib/schemas-evidence";
import { UpstreamError, setRateLimit, upstreamFetch } from "@/server/core";
import { clip, htmlToPlainText, safeHttpsUrl } from "./plain-text";
import { strictCurated } from "./strict-input";

/* ---------------- curated content ---------------- */
export const ghoFile = GhoIndicatorsFileSchema.parse(ghoJson);
export const GHO_INDICATORS: Readonly<Record<string, GhoIndicator>> = ghoFile.indicators;
export const GHO_INDICATOR_IDS: readonly string[] = Object.keys(GHO_INDICATORS);
export const GHO_AREAS: readonly GhoArea[] = ghoFile.areas;
const areaByCode = new Map(GHO_AREAS.map((a) => [a.code, a] as const));
const indicatorByKey = new Map<string, string>();
for (const [id, ind] of Object.entries(GHO_INDICATORS)) for (const k of [id, ind.code]) indicatorByKey.set(k.toLowerCase(), id);
/** Every value a caller may send as `indicator`: indicator ids and their WHO codes. */
export const GHO_INDICATOR_KEYS: readonly string[] = [...new Set(Object.entries(GHO_INDICATORS).flatMap(([id, i]) => [id, i.code]))];
const CURATED_CODES = new Set(Object.values(GHO_INDICATORS).map((i) => i.code));

/* ---------------- constants ---------------- */
export const GHO_UPSTREAM = "who-gho";
export const GHO_DEFAULT_BASE = "https://ghoapi.azureedge.net/api";
export const GHO_ATTRIBUTION = "Source: WHO Global Health Observatory";
export const GHO_SOURCE = "https://www.who.int/data/gho";
export const GHO_TTL_MS = 12 * 60 * 60 * 1000;
export const GHO_TOP = 150; // rows fetched, newest first: enough for the latest year's breakdowns plus a decade of history
export const GHO_MAX_VALUES = 12;
export const GHO_HISTORY_YEARS = 10;
export const GHO_STALE_AFTER_YEARS = 5;
export const GHO_SELECT = "TimeDim,Dim1Type,Dim1,Dim2Type,Dim2,Dim3Type,Dim3,Value,NumericValue,Low,High,Date";
const GHO_HOSTS = ["ghoapi.azureedge.net", "who.int"] as const;

export function configureGhoRateLimit() {
  setRateLimit(GHO_UPSTREAM, 1, 3);
}
configureGhoRateLimit();

/** GHO API base: WHO_GHO_API_BASE if it is an https URL on an allowed WHO host, else the public endpoint. */
export function ghoApiBase(): string {
  const raw = process.env.WHO_GHO_API_BASE?.trim();
  const safe = raw ? safeHttpsUrl(raw, GHO_HOSTS) : null;
  if (!safe) return GHO_DEFAULT_BASE;
  const u = new URL(safe); // drop any query string or fragment
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

/* ---------------- input / output ---------------- */
export const GhoInput = z.strictObject({
  indicator: strictCurated(GHO_INDICATOR_KEYS).transform((k) => indicatorByKey.get(k.toLowerCase())!),
  country: strictCurated(GHO_AREAS.map((a) => a.code)),
});
export type GhoInput = z.input<typeof GhoInput>;
type ParsedGhoInput = z.output<typeof GhoInput>;

export interface GhoDimension { type: string; typeLabel: string; code: string; label: string }
export interface GhoValue {
  year: number;
  value: number | null; // numeric indicators
  text: string; // display text, e.g. "13.3 (11.6–15.2)" or "Yes"
  low: number | null;
  high: number | null;
  dimensions: GhoDimension[];
  headline: boolean;
}
export interface GhoResult {
  indicator: { id: string; code: string; label: string; whoName: string; unit: string; valueType: "numeric" | "text"; topic: string; note?: string; page: string };
  area: { code: string; name: string; type: "COUNTRY" | "REGION" | "GLOBAL" };
  found: boolean;
  latestYear: number | null;
  headline: GhoValue | null; // headline breakdown (e.g. both sexes) for latestYear
  values: GhoValue[]; // every breakdown for latestYear, headline first (<= 12)
  history: { year: number; value: number | null; text: string }[]; // headline series, oldest first (<= 10 years)
  updated: string | null; // WHO's last-update date for the latest-year values (YYYY-MM-DD)
  stale: boolean; // latestYear is more than 5 years old (G13: flag for review)
  attribution: string; // "Source: WHO Global Health Observatory, 2023 data"
  sourceUrl: string; // WHO indicator page (link-out / fallback)
}

/** Link-out for the UI when the API is unavailable: the WHO indicator page. */
export function ghoIndicatorLink(indicatorKey: string): string {
  const id = typeof indicatorKey === "string" ? indicatorByKey.get(indicatorKey.toLowerCase()) : undefined;
  return id ? GHO_INDICATORS[id]!.page : GHO_SOURCE;
}

/** "Source: WHO Global Health Observatory, 2023 data" (G13: always show the year). */
export function ghoAttribution(year: number | null): string {
  return year ? `${GHO_ATTRIBUTION}, ${year} data` : GHO_ATTRIBUTION;
}

/* ---------------- URL builder ---------------- */
/** OData filter from curated values only: SpatialDim eq '<code>' and SpatialDimType eq '<type>'. */
export function ghoFilter(area: GhoArea): string {
  if (!/^[A-Z]{3,6}$/.test(area.code)) throw new z.ZodError([{ code: "custom", message: "area code", path: ["country"], input: undefined }]);
  return `SpatialDim eq '${area.code}' and SpatialDimType eq '${area.type}'`;
}

export function ghoParams(area: GhoArea): URLSearchParams {
  return new URLSearchParams({ $filter: ghoFilter(area), $orderby: "TimeDim desc", $select: GHO_SELECT, $top: String(GHO_TOP) });
}

/** Exact upstream URL for a validated input. Exported for tests. */
export function ghoUrl(input: ParsedGhoInput): string {
  const ind = GHO_INDICATORS[input.indicator]!;
  const area = areaByCode.get(input.country)!;
  return `${ghoApiBase()}/${encodeURIComponent(ind.code)}?${ghoParams(area)}`;
}

/* ---------------- response parsing ---------------- */
const nullableStr = z.string().max(200).nullable().optional();
const Row = z.object({
  TimeDim: z.number().int().min(1900).max(2100),
  Dim1Type: nullableStr,
  Dim1: nullableStr,
  Dim2Type: nullableStr,
  Dim2: nullableStr,
  Dim3Type: nullableStr,
  Dim3: nullableStr,
  Value: z.string().max(200).nullable().optional(),
  NumericValue: z.number().nullable().optional(),
  Low: z.number().nullable().optional(),
  High: z.number().nullable().optional(),
  Date: nullableStr,
});
type Row = z.infer<typeof Row>;
const ResponseSchema = z.object({ value: z.array(z.unknown()) });

const DIM_TYPE = /^[A-Z]{2,30}$/;
const DIM_CODE = /^[A-Z][A-Z0-9_+-]{1,59}$/;

/** Human label for a GHO dimension code: curated label, else a readable form of the code. */
export function dimensionLabel(code: string): string {
  const curatedLabel = ghoFile.dimensionLabels[code];
  if (curatedLabel) return curatedLabel;
  let m = /^AGEGROUP_YEARS(\d{1,3})-(\d{1,3})$/.exec(code);
  if (m) return `${m[1]}–${m[2]} years`;
  m = /^AGEGROUP_YEARS(\d{1,3})PLUS$/.exec(code);
  if (m) return `${m[1]}+ years`;
  m = /^AGEGROUP_YEARSUNDER(\d{1,3})$/.exec(code);
  if (m) return `Under ${m[1]} years`;
  const tail = code.includes("_") ? code.slice(code.indexOf("_") + 1) : code;
  const s = tail.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dimensionsOf(r: Row): GhoDimension[] {
  const out: GhoDimension[] = [];
  for (const [t, c] of [[r.Dim1Type, r.Dim1], [r.Dim2Type, r.Dim2], [r.Dim3Type, r.Dim3]] as const) {
    if (!t || !c || !DIM_TYPE.test(t) || !DIM_CODE.test(c)) continue;
    out.push({ type: t, typeLabel: ghoFile.dimensionTypeLabels[t] ?? dimensionLabel(t), code: c, label: dimensionLabel(c) });
  }
  return out;
}

function isHeadline(dims: GhoDimension[], headline: Record<string, string>): boolean {
  return Object.entries(headline).every(([type, code]) => {
    const d = dims.find((x) => x.type === type);
    return !d || d.code === code;
  });
}

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function toValue(r: Row, ind: GhoIndicator): GhoValue | null {
  const dims = dimensionsOf(r);
  const headline = isHeadline(dims, ind.headline);
  if (ind.valueType === "text") {
    const t = clip(htmlToPlainText((r.Value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")), 60);
    if (!t) return null;
    return { year: r.TimeDim, value: null, text: t, low: null, high: null, dimensions: dims, headline };
  }
  const num = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null);
  const v = num(r.NumericValue);
  if (v === null) return null;
  const low = num(r.Low);
  const high = num(r.High);
  const range = low !== null && high !== null ? ` (${fmt(low, ind.decimals)}–${fmt(high, ind.decimals)})` : "";
  return { year: r.TimeDim, value: v, text: `${fmt(v, ind.decimals)}${range}`, low, high, dimensions: dims, headline };
}

const DIM_ORDER = ["SEX_BTSX", "SEX_FMLE", "SEX_MLE", "AGEGROUP_YEARSALL"];
function sortKey(v: GhoValue): string {
  return v.dimensions
    .map((d) => {
      const i = DIM_ORDER.indexOf(d.code);
      const age = /^AGEGROUP_YEARS(\d{1,3})/.exec(d.code);
      return i >= 0 ? `0${i}` : age ? `1${age[1]!.padStart(3, "0")}` : `2${d.code}`;
    })
    .join("|");
}

function isoDay(s: string | null | undefined): string | null {
  const m = s ? /^(\d{4}-\d{2}-\d{2})/.exec(s) : null;
  return m ? m[1]! : null;
}

/** Normalise GHO OData rows into the latest values + headline history. Exported for tests. */
export function parseGho(
  body: unknown,
  ind: GhoIndicator,
  now: Date = new Date(),
): Pick<GhoResult, "found" | "latestYear" | "headline" | "values" | "history" | "updated" | "stale"> {
  const parsed = ResponseSchema.safeParse(body);
  if (!parsed.success) throw new UpstreamError(GHO_UPSTREAM, 502, "Unexpected response from upstream service");
  const rows: Row[] = [];
  for (const raw of parsed.data.value) {
    const r = Row.safeParse(raw);
    if (r.success) rows.push(r.data);
  }
  const values = rows.map((r) => ({ r, v: toValue(r, ind) })).filter((x): x is { r: Row; v: GhoValue } => x.v !== null);
  if (values.length === 0) return { found: false, latestYear: null, headline: null, values: [], history: [], updated: null, stale: false };

  const latestYear = Math.max(...values.map((x) => x.v.year));
  const seen = new Set<string>();
  const latest = values
    .filter((x) => x.v.year === latestYear)
    .filter((x) => {
      const k = x.v.dimensions.map((d) => d.code).join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  latest.sort((a, b) => Number(b.v.headline) - Number(a.v.headline) || sortKey(a.v).localeCompare(sortKey(b.v)));
  const headline = latest.find((x) => x.v.headline)?.v ?? null;

  const byYear = new Map<number, GhoValue>();
  for (const { v } of values) if (v.headline && !byYear.has(v.year)) byYear.set(v.year, v);
  const history = [...byYear.values()]
    .sort((a, b) => b.year - a.year)
    .slice(0, GHO_HISTORY_YEARS)
    .reverse()
    .map((v) => ({ year: v.year, value: v.value, text: v.text }));

  const dates = latest.map((x) => isoDay(x.r.Date)).filter((d): d is string => !!d).sort();
  return {
    found: true,
    latestYear,
    headline,
    values: latest.slice(0, GHO_MAX_VALUES).map((x) => x.v),
    history,
    updated: dates.at(-1) ?? null,
    stale: now.getUTCFullYear() - latestYear > GHO_STALE_AFTER_YEARS,
  };
}

/* ---------------- adapter ---------------- */
/** Latest WHO GHO values for one curated indicator and one curated area. Throws ZodError/OutboundRejected before any fetch. */
export async function getGhoIndicator(raw: GhoInput): Promise<GhoResult> {
  const input = GhoInput.parse(raw);
  const ind = GHO_INDICATORS[input.indicator]!;
  const area = areaByCode.get(input.country)!;
  // The indicator code is a WHO standard code taken from the curated file (some contain long digit runs, e.g.
  // SA_0000001688, which the scrubber's numeric-id rule would flag), so it is checked by allowlist + pattern.
  if (!CURATED_CODES.has(ind.code) || !ghoIndicatorCode.safeParse(ind.code).success) {
    throw new z.ZodError([{ code: "custom", message: "not in curated list", path: ["indicator"], input: undefined }]);
  }
  const params = ghoParams(area);
  for (const v of params.values()) assertNoPHI(v);
  assertNoPHI(input.indicator, area.code);

  let body: unknown;
  try {
    body = await upstreamFetch<unknown>(ghoUrl(input), { upstream: GHO_UPSTREAM, ttlMs: GHO_TTL_MS, timeoutMs: 15_000 });
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(GHO_UPSTREAM, 502, "Unexpected response from upstream service"); // e.g. non-JSON body
  }
  const data = parseGho(body, ind);
  return {
    indicator: { id: input.indicator, code: ind.code, label: ind.label, whoName: ind.whoName, unit: ind.unit, valueType: ind.valueType, topic: ind.topic, note: ind.note, page: ind.page },
    area: { code: area.code, name: area.name, type: area.type },
    ...data,
    attribution: ghoAttribution(data.latestYear),
    sourceUrl: ind.page,
  };
}
