import "server-only";
/**
 * Server-side upstream access for /api route handlers (G17).
 * - Never logs URLs, params, bodies or responses (no clinical text ever reaches here; still, log nothing).
 * - Per-upstream rate limits that honour each API's published terms: a token bucket plus, where an API states a
 *   hard "N per second/minute" limit, a sliding window that can never exceed it (a bucket alone allows burst + rate
 *   in one window).
 * - In-memory TTL cache, partitioned per upstream (one upstream cannot evict another's entries).
 * - Timeouts (headers AND body), a streamed size cap on the DECODED body (chunked, lying or gzip bodies included),
 *   no cross-origin redirects (secrets in headers/bodies never follow a Location header), generic User-Agent.
 * - Request side: JSON only, 2 KB cap enforced while streaming, cross-site browser requests refused, and a
 *   memory-only per-client limit keyed by a salted hash of the client address (never the address itself).
 * Secrets come only from process.env in this file's callers; never NEXT_PUBLIC_*.
 */
import { createHmac, randomBytes } from "node:crypto";
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

/** A request to OUR route that is refused before its body is parsed (wrong type, cross-site, too large, too many). */
export class RequestRejected extends Error {
  constructor(
    public status: 400 | 403 | 413 | 415 | 429,
    message: string,
  ) {
    super(message);
    this.name = "RequestRejected";
  }
}

/* ---------------- rate limiting ---------------- */
interface Bucket { tokens: number; updated: number; perSecond: number; burst: number }
interface Window { max: number; ms: number; stamps: number[] }
const buckets = new Map<string, Bucket>();
const windows = new Map<string, Window>();

/**
 * Configure a limit for an upstream: token bucket (requests/second, burst) and, optionally, a sliding window that
 * enforces a published hard limit exactly (at most `window.max` requests in any `window.ms` milliseconds).
 * Defaults: 3 rps, burst 6, no window.
 */
export function setRateLimit(
  upstream: string,
  perSecond: number,
  burst = Math.max(1, Math.ceil(perSecond * 2)),
  window?: { max: number; ms: number },
) {
  buckets.set(upstream, { tokens: burst, updated: Date.now(), perSecond, burst });
  if (window) windows.set(upstream, { max: Math.max(1, Math.floor(window.max)), ms: window.ms, stamps: [] });
  else windows.delete(upstream);
}

function takeToken(upstream: string): boolean {
  let b = buckets.get(upstream);
  if (!b) {
    setRateLimit(upstream, 3, 6);
    b = buckets.get(upstream)!;
  }
  const now = Date.now();
  b.tokens = Math.min(b.burst, b.tokens + (Math.max(0, now - b.updated) / 1000) * b.perSecond); // clock steps back: no refill
  b.updated = now;
  const w = windows.get(upstream);
  if (w) {
    while (w.stamps.length && (now - w.stamps[0]! >= w.ms || now < w.stamps[0]!)) w.stamps.shift();
    if (w.stamps.length >= w.max) return false;
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  w?.stamps.push(now);
  return true;
}

/* ---------------- cache (partitioned per upstream) ---------------- */
/** Entries per upstream partition. A partition is the key prefix before the first ":" (always the upstream id). */
export const CACHE_MAX_ENTRIES_PER_UPSTREAM = 300;
const cache = new Map<string, Map<string, { expires: number; value: unknown }>>();

function partitionOf(key: string): string {
  const i = key.indexOf(":");
  return i > 0 ? key.slice(0, i) : "_";
}

/** Keys are "<upstream>:<rest>" (upstreamFetch builds them that way; direct callers must too). */
export function cacheGet<T>(key: string): T | undefined {
  const part = cache.get(partitionOf(key));
  const hit = part?.get(key);
  if (!part || !hit) return undefined;
  if (hit.expires < Date.now()) {
    part.delete(key);
    return undefined;
  }
  part.delete(key); // refresh LRU order
  part.set(key, hit);
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  const name = partitionOf(key);
  let part = cache.get(name);
  if (!part) cache.set(name, (part = new Map()));
  if (ttlMs <= 0) {
    part.delete(key);
    return;
  }
  if (!part.has(key) && part.size >= CACHE_MAX_ENTRIES_PER_UPSTREAM) part.delete(part.keys().next().value as string);
  part.set(key, { expires: Date.now() + ttlMs, value });
}

/** The cached value upstreamFetch would return for this upstream + cache key (or URL), without fetching. */
export function cachedUpstream<T>(upstream: string, cacheKeyOrUrl: string): T | undefined {
  return cacheGet<T>(`${upstream}:${cacheKeyOrUrl}`);
}

/** Test helper. */
export function __resetCoreForTests() {
  cache.clear();
  buckets.clear();
  windows.clear();
  clients.clear();
}

/* ---------------- fetch ---------------- */
export interface UpstreamOptions {
  upstream: string; // e.g. "nlm-icd10cm"
  ttlMs?: number; // cache lifetime (default 24 h)
  timeoutMs?: number; // default 8 s, covers headers AND body
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  parse?: "json" | "text";
  cacheKey?: string; // defaults to the URL (never contains secrets: tokens go in headers)
  maxBytes?: number; // default 2 MB, counted on the decoded body while it streams
}

/** GET requests may follow at most this many SAME-ORIGIN redirects. POSTs and cross-origin redirects are refused. */
export const MAX_SAME_ORIGIN_REDIRECTS = 3;

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

/** Read a response body with a running byte cap; cancels the stream as soon as the cap is passed. */
async function readCapped(res: Response, upstream: string, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new UpstreamError(upstream, 502, "Upstream response too large");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new UpstreamError(upstream, 502, "Upstream response too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function upstreamFetch<T = unknown>(url: string, opts: UpstreamOptions): Promise<T> {
  const key = `${opts.upstream}:${opts.cacheKey ?? url}`;
  const ttl = opts.ttlMs ?? 24 * 60 * 60 * 1000;
  if (ttl > 0) {
    const hit = cacheGet<T>(key);
    if (hit !== undefined) return hit;
  }
  if (!takeToken(opts.upstream)) throw new UpstreamError(opts.upstream, 429, "Rate limit reached, try again shortly");

  const method = opts.method ?? "GET";
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  const origin = new URL(url).origin;
  let target = url;
  let res: Response | undefined;
  for (let hop = 0; ; hop++) {
    try {
      res = await fetch(target, {
        method,
        body: opts.body,
        headers: { "User-Agent": USER_AGENT, Accept: opts.parse === "text" ? "*/*" : "application/json", ...opts.headers },
        signal,
        cache: "no-store",
        // Never let fetch follow a Location header on its own: undici forwards custom headers (API keys) and
        // re-sends POST bodies (tokens, client secrets) to whatever origin a redirect names.
        redirect: "manual",
      });
    } catch {
      throw new UpstreamError(opts.upstream, 504, "Upstream service did not respond");
    }
    if (res.status < 300 || res.status > 399) break;
    await res.body?.cancel().catch(() => undefined);
    const location = res.headers.get("location");
    let next: URL | null = null;
    try {
      next = location ? new URL(location, target) : null;
    } catch {
      next = null;
    }
    if (method !== "GET" || !next || next.origin !== origin || hop >= MAX_SAME_ORIGIN_REDIRECTS) {
      throw new UpstreamError(opts.upstream, 502, "Upstream service redirected unexpectedly");
    }
    target = next.toString();
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new UpstreamError(opts.upstream, res.status);
  }

  let text: string;
  try {
    text = await readCapped(res, opts.upstream, opts.maxBytes ?? 2_000_000);
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    if (isAbort(e)) throw new UpstreamError(opts.upstream, 504, "Upstream service did not respond");
    throw new UpstreamError(opts.upstream, 502, "Upstream response could not be read");
  }
  let value: T;
  if (opts.parse === "text") value = text as T;
  else {
    try {
      value = JSON.parse(text) as T;
    } catch {
      throw new UpstreamError(opts.upstream, 502, "Unexpected response from upstream service");
    }
  }
  if (ttl > 0) cacheSet(key, value, ttl);
  return value;
}

/* ---------------- 42 CFR Part 2 owner switch ---------------- */
/**
 * Substance-use REFERENCE lookups (SUD codes, the alcohol topic, SUD search strategies and trial conditions,
 * SUD-related medications, substance-use facility and addiction-counselor searches) send only curated values with
 * no client data, but CLAUDE.md says never to transmit substance-use information and to ask the owner when a task
 * conflicts. Until the owner confirms in writing that curated reference lookups are outside that rule, they stay
 * OFF: the adapter throws NotConfigured and the UI shows its link-out fallback. The owner turns them on with
 * ALLOW_SUD_REFERENCE_LOOKUPS=true (docs/DEPLOY.md).
 */
export const SUD_LOOKUPS = "Substance-use reference lookups";
export function sudLookupsAllowed(): boolean {
  return process.env.ALLOW_SUD_REFERENCE_LOOKUPS?.trim().toLowerCase() === "true";
}
/** Call BEFORE any fetch when the outgoing value is substance-use related. */
export function assertSudLookupAllowed(isSud: boolean): void {
  if (isSud && !sudLookupsAllowed()) throw new NotConfigured(SUD_LOOKUPS);
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
  if (err instanceof RequestRejected)
    return NextResponse.json<ApiErr>(
      { ok: false, error: err.message, code: err.status === 429 ? "rate-limited" : "invalid" },
      { status: err.status, headers: err.status === 429 ? { ...noStore, "Retry-After": "10" } : noStore },
    );
  if (err instanceof NotConfigured)
    return NextResponse.json<ApiErr>({ ok: false, error: err.message, code: "not-configured" }, { status: 503, headers: noStore });
  if (err instanceof UpstreamError)
    return NextResponse.json<ApiErr>(
      { ok: false, error: err.message, code: err.status === 429 ? "rate-limited" : "upstream" },
      { status: err.status === 429 ? 429 : 502, headers: noStore },
    );
  return NextResponse.json<ApiErr>({ ok: false, error: "Unexpected error", code: "upstream" }, { status: 500, headers: noStore });
}

/* ---------------- per-client limit (memory only, salted hash, never the address) ---------------- */
/** Generous enough for a clinic sharing one address; stops one client draining shared upstream quotas. */
export const CLIENT_LIMIT = { perSecond: 2, burst: 30, maxClients: 5000 } as const;
const CLIENT_SALT = randomBytes(16);
const clients = new Map<string, { tokens: number; updated: number }>();

/**
 * The address the platform proxy saw: the LAST X-Forwarded-For entry (proxies append; earlier entries are
 * client-supplied and spoofable), else X-Real-IP. Returns null when neither is present (tests, local dev).
 */
function clientKey(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  const ip = last || req.headers.get("x-real-ip")?.trim();
  if (!ip || ip.length > 64) return null;
  return createHmac("sha256", CLIENT_SALT).update(ip).digest("base64url").slice(0, 22);
}

function takeClientToken(req: Request): boolean {
  const k = clientKey(req);
  if (!k) return true;
  const now = Date.now();
  let c = clients.get(k);
  if (c) clients.delete(k); // refresh LRU order
  else c = { tokens: CLIENT_LIMIT.burst, updated: now };
  c.tokens = Math.min(CLIENT_LIMIT.burst, c.tokens + (Math.max(0, now - c.updated) / 1000) * CLIENT_LIMIT.perSecond);
  c.updated = now;
  if (clients.size >= CLIENT_LIMIT.maxClients) clients.delete(clients.keys().next().value as string);
  const allowed = c.tokens >= 1;
  if (allowed) c.tokens -= 1;
  clients.set(k, c);
  return allowed;
}

export const MAX_BODY_BYTES = 2048;

/** Stream-read our own request body with a hard byte cap (never buffers more than the cap). */
async function readRequestText(req: Request): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new RequestRejected(413, "Request too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Parse a POST JSON body (max 2 KB) with a zod schema. Bodies are never logged.
 * Refuses, before reading the body: too many requests from one client (429), cross-site browser requests (403),
 * a declared length over the cap (413), and anything that is not application/json (415).
 */
export async function readBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  if (!takeClientToken(req)) throw new RequestRejected(429, "Too many requests, try again shortly");
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new RequestRejected(403, "Cross-site requests are not accepted");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new RequestRejected(413, "Request too large");
  const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new RequestRejected(415, "Send JSON (Content-Type: application/json)");
  const text = await readRequestText(req);
  let json: unknown;
  try {
    json = JSON.parse(text || "{}");
  } catch {
    throw new z.ZodError([{ code: "custom", message: "invalid JSON", path: [], input: undefined }]);
  }
  return schema.parse(json);
}
