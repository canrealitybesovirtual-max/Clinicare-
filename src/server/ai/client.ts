import "server-only";
/**
 * The only place the Anthropic SDK is constructed (owner amendment, CLAUDE.md 2026-11-27).
 * - Key from the server environment only, passed explicitly (no profile / auth-token discovery).
 * - Base URL pinned to the Anthropic API, so no environment variable can redirect requests elsewhere.
 * - SDK logging off, OpenTelemetry spans AND trace propagation off (spans can carry message content; propagation
 *   headers can carry OpenTelemetry baggage), no retries (one 20 s budget).
 * - Every request goes through pinnedFetch(): it refuses any URL but a POST to API_BASE_URL + /v1/messages,
 *   any redirect, any body that asks for a message thread or other stored state, and it rebuilds the headers from an
 *   allowlist (so ANTHROPIC_CUSTOM_HEADERS, traceparent / baggage and cookies are never sent) with only the
 *   anthropic-beta values this app uses.
 * - Never uses message threads (not eligible for zero data retention) or any other server-side storage.
 */
import Anthropic from "@anthropic-ai/sdk"; // guardrail-ok: G16 owner amendment
import { NotConfigured, UpstreamError } from "@/server/core";
import { ASSISTANT_NAME, FALLBACK_BETA, REQUEST_TIMEOUT_MS } from "./config";

export const UPSTREAM = "anthropic";
const API_BASE_URL = "https://api.anthropic.com"; // guardrail-ok: G16 owner amendment

export type BetaCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

export interface AssistantRequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
}

/** The slice of the SDK the assistant uses. Tests inject a fake with the same shape. */
export interface AssistantClient {
  beta: { messages: { create(body: BetaCreateParams, options?: AssistantRequestOptions): PromiseLike<BetaMessage> } };
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

const API_ORIGIN = new URL(API_BASE_URL).origin;
const ALLOWED_PATH = "/v1/messages";
/** Request headers that may leave this server. Everything else (custom env headers, tracing, cookies) is dropped. */
const ALLOWED_HEADERS = new Set(["authorization", "x-api-key", "anthropic-version", "anthropic-beta", "content-type", "accept", "user-agent", "content-length"]);
const ALLOWED_HEADER_PREFIX = "x-stainless-"; // SDK runtime metadata (OS, arch, retry count); no request content
export const ALLOWED_BETAS: ReadonlySet<string> = new Set([FALLBACK_BETA]);
/** Body fields that would keep content server-side or widen what the request can do. Refused outright. */
const FORBIDDEN_BODY_FIELDS = ["thread", "container", "mcp_servers", "tools", "metadata", "context_management", "diagnostics", "user_profile_id"];

/** The refusal pinnedFetch throws; mapSdkError turns it into a fixed 502 (never retried, never echoed). */
export class PinnedRequestRefused extends Error {
  constructor(reason: string) {
    super(`assistant request refused: ${reason}`);
    this.name = "PinnedRequestRefused";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * The SDK's fetch. Exported for tests (they pass a fake `base` and inspect what would have been sent).
 */
export function pinnedFetch(base: FetchLike = (i, init) => globalThis.fetch(i, init)): FetchLike {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== API_ORIGIN || url.pathname !== ALLOWED_PATH) throw new PinnedRequestRefused("destination");
    for (const k of url.searchParams.keys()) if (k !== "beta") throw new PinnedRequestRefused("query");
    if ((init.method ?? "GET").toUpperCase() !== "POST") throw new PinnedRequestRefused("method");
    if (typeof init.body !== "string") throw new PinnedRequestRefused("body");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      throw new PinnedRequestRefused("body");
    }
    for (const f of FORBIDDEN_BODY_FIELDS) if (f in body) throw new PinnedRequestRefused(`field ${f}`);

    const headers = new Headers();
    new Headers(init.headers).forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === "anthropic-beta") {
        const betas = value.split(",").map((b) => b.trim()).filter((b) => ALLOWED_BETAS.has(b));
        if (betas.length) headers.set(k, betas.join(","));
      } else if (ALLOWED_HEADERS.has(k) || k.startsWith(ALLOWED_HEADER_PREFIX)) headers.set(k, value);
    });
    return base(url.toString(), { method: "POST", headers, body: init.body, signal: init.signal, redirect: "error", credentials: "omit" });
  };
}

const clients = new Map<string, AssistantClient>();

/** One client per key per process. */
export function anthropicClient(apiKey: string): AssistantClient {
  let c = clients.get(apiKey);
  if (!c) {
    if (clients.size > 2) clients.clear(); // a rotated key never accumulates old clients
    c = new Anthropic({
      apiKey,
      baseURL: API_BASE_URL,
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
      logLevel: "off",
      logger: silent,
      openTelemetry: { traces: false, propagation: false },
      fetch: pinnedFetch(),
    });
    clients.set(apiKey, c);
  }
  return c;
}

/**
 * Typed SDK errors -> the app's error classes (most specific first; never string matching). Messages are fixed
 * app wording: nothing from the request or the upstream body is echoed.
 */
export function mapSdkError(err: unknown): Error {
  if (err instanceof NotConfigured || err instanceof UpstreamError) return err;
  if (err instanceof PinnedRequestRefused) return new UpstreamError(UPSTREAM, 502, "The assistant request was blocked by the server's safety checks.");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError)
    return new NotConfigured(ASSISTANT_NAME); // bad key, workspace not allowed, or model not available to the org
  if (err instanceof Anthropic.RateLimitError) return new UpstreamError(UPSTREAM, 429, "The assistant is busy. Try again in a minute.");
  if (err instanceof Anthropic.BadRequestError) return new UpstreamError(UPSTREAM, 502, "The assistant could not process this request.");
  if (err instanceof Anthropic.InternalServerError) return new UpstreamError(UPSTREAM, 502, "The assistant is temporarily unavailable.");
  if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError)
    return new UpstreamError(UPSTREAM, 504, "The assistant did not answer in time.");
  if (err instanceof Anthropic.APIConnectionError) return new UpstreamError(UPSTREAM, 504, "The assistant could not be reached.");
  if (err instanceof Anthropic.APIError) return new UpstreamError(UPSTREAM, 502, "The assistant is temporarily unavailable.");
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
    return new UpstreamError(UPSTREAM, 504, "The assistant did not answer in time.");
  return new UpstreamError(UPSTREAM, 502, "The assistant returned an unexpected response.");
}
