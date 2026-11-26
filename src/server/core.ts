import "server-only";
/**
 * Server-side upstream access for /api route handlers (G17).
 * - Never logs URLs, params, bodies or responses (no clinical text ever reaches here; still, log nothing).
 * - Per-upstream token-bucket rate limits that honour each API's published terms.
 * - In-memory TTL cache (responses are public reference data keyed by code/keyword/drug/location).
 * - Timeouts, size cap, generic User-Agent (no personal contact details).
 * Secrets come only from process.env in this file's callers; never NEXT_PUBLIC_*.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { OutboundRejected } from "@/lib/outbound";

export const USER_AGENT = "ClinicianResourceCompanion/0.1 (reference tool)";

export class UpstreamError extends Error {
  constructor(
    public upstream: string,
    public status: number,
    message = "Upstream service unavailable",
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export class NotConfigured extends Error {
  constructor(public upstream: string) {
    super(`${upstream} is not configured on this server`);
    this.name = "NotConfigured";
  }
}

/* ---------------- rate limiting ---------------- */
interface Bucket { tokens: number; updated: number; perSecond: number; burst: number }
const buckets = new Map<string, Bucket>();

/** Configure a limit (requests/second and burst) for an upstream. Defaults to 3 rps, burst 6. */
export function setRateLimit(upstream: string, perSecond: number, burst = Math.max(1, Math.ceil(perSecond * 2))) {
  buckets.set(upstream, { tokens: burst, updated: Date.now(), perSecond, burst });
}

function takeToken(upstream: string): boolean {
  let b = buckets.get(upstream);
  if (!b) {
    setRateLimit(upstream, 3, 6);
    b = buckets.get(upstream)!;
  }
  const now = Date.now();
  b.tokens = Math.min(b.burst, b.tokens + ((now - b.updated) / 1000) * b.perSecond);
  b.updated = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/* ---------------- cache ---------------- */
const MAX_ENTRIES = 1000;
const cache = new Map<string, { expires: number; value: unknown }>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key); // refresh LRU order
  cache.set(key, hit);
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { expires: Date.now() + ttlMs, value });
}

/** Test helper. */
export function __resetCoreForTests() {
  cache.clear();
  buckets.clear();
}

/* ---------------- fetch ---------------- */
export interface UpstreamOptions {
  upstream: string; // e.g. "nlm-icd10cm"
  ttlMs?: number; // cache lifetime (default 24 h)
  timeoutMs?: number; // default 8 s
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  parse?: "json" | "text";
  cacheKey?: string; // defaults to the URL (never contains secrets: tokens go in headers)
  maxBytes?: number; // default 2 MB
}

export async function upstreamFetch<T = unknown>(url: string, opts: UpstreamOptions): Promise<T> {
  const key = `${opts.upstream}:${opts.cacheKey ?? url}`;
  const ttl = opts.ttlMs ?? 24 * 60 * 60 * 1000;
  if (ttl > 0) {
    const hit = cacheGet<T>(key);
    if (hit !== undefined) return hit;
  }
  if (!takeToken(opts.upstream)) throw new UpstreamError(opts.upstream, 429, "Rate limit reached, try again shortly");

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      body: opts.body,
      headers: { "User-Agent": USER_AGENT, Accept: opts.parse === "text" ? "*/*" : "application/json", ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    throw new UpstreamError(opts.upstream, 504, "Upstream service did not respond");
  }
  if (!res.ok) throw new UpstreamError(opts.upstream, res.status);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > (opts.maxBytes ?? 2_000_000)) throw new UpstreamError(opts.upstream, 502, "Upstream response too large");
  const value = (opts.parse === "text" ? await res.text() : await res.json()) as T;
  if (ttl > 0) cacheSet(key, value, ttl);
  return value;
}

/* ---------------- route helpers ---------------- */
export interface ApiOk<T> { ok: true; data: T; attribution: string; source: string; cached?: boolean }
export interface ApiErr { ok: false; error: string; code: "invalid" | "rejected" | "upstream" | "not-configured" | "rate-limited" }

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function ok<T>(data: T, attribution: string, source: string) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data, attribution, source }, { headers: noStore });
}

/** Map any thrown error to a safe JSON error. Never echoes input values. Never logs. */
export function fail(err: unknown) {
  if (err instanceof z.ZodError) return NextResponse.json<ApiErr>({ ok: false, error: "Invalid input", code: "invalid" }, { status: 400, headers: noStore });
  if (err instanceof OutboundRejected)
    return NextResponse.json<ApiErr>({ ok: false, error: "Only codes, curated terms, drug names or a ZIP/city may be sent", code: "rejected" }, { status: 400, headers: noStore });
  if (err instanceof NotConfigured)
    return NextResponse.json<ApiErr>({ ok: false, error: err.message, code: "not-configured" }, { status: 503, headers: noStore });
  if (err instanceof UpstreamError)
    return NextResponse.json<ApiErr>(
      { ok: false, error: err.message, code: err.status === 429 ? "rate-limited" : "upstream" },
      { status: err.status === 429 ? 429 : 502, headers: noStore },
    );
  return NextResponse.json<ApiErr>({ ok: false, error: "Unexpected error", code: "upstream" }, { status: 500, headers: noStore });
}

/** Parse a POST JSON body (max 2 KB) with a zod schema. Bodies are never logged. */
export async function readBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const text = await req.text();
  if (text.length > 2048) throw new z.ZodError([{ code: "custom", message: "body too large", path: [], input: undefined }]);
  let json: unknown;
  try {
    json = JSON.parse(text || "{}");
  } catch {
    throw new z.ZodError([{ code: "custom", message: "invalid JSON", path: [], input: undefined }]);
  }
  return schema.parse(json);
}
