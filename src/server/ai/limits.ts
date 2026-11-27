import "server-only";
/**
 * Request limits for the assistant, memory only (nothing persisted, nothing logged).
 * - Per client: at most PER_CLIENT.max requests in any PER_CLIENT.ms window. The client is keyed by a salted HMAC
 *   of the address the platform proxy saw (the LAST X-Forwarded-For entry, else X-Real-IP), the same rule as
 *   src/server/core.ts; the address itself is never stored. Requests with no address (local dev, tests) share one
 *   key, so they are limited too.
 * - Whole server: at most GLOBAL.max requests per GLOBAL.ms, a cost ceiling for the API key.
 * A sliding window is used instead of a token bucket so "10 per minute" can never be exceeded by a burst.
 */
import { createHmac, randomBytes } from "node:crypto";

export const ASSISTANT_LIMITS = {
  perClient: { max: 10, ms: 60_000 },
  global: { max: 30, ms: 60_000 },
  maxClients: 5000,
} as const;

const SALT = randomBytes(16);
const clients = new Map<string, number[]>();
const globalStamps: number[] = [];

function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  const ip = last || req.headers.get("x-real-ip")?.trim();
  if (!ip || ip.length > 64) return "local";
  return createHmac("sha256", SALT).update(ip).digest("base64url").slice(0, 22);
}

function prune(stamps: number[], now: number, ms: number) {
  while (stamps.length && (now - stamps[0]! >= ms || now < stamps[0]!)) stamps.shift();
}

/** True when the request may proceed (and counts it). False means answer 429. */
export function takeAssistantToken(req: Request, now: number = Date.now()): boolean {
  const { perClient, global, maxClients } = ASSISTANT_LIMITS;
  prune(globalStamps, now, global.ms);
  if (globalStamps.length >= global.max) return false;
  const k = clientKey(req);
  const stamps = clients.get(k) ?? [];
  clients.delete(k); // refresh LRU order
  prune(stamps, now, perClient.ms);
  if (clients.size >= maxClients) clients.delete(clients.keys().next().value as string);
  clients.set(k, stamps);
  if (stamps.length >= perClient.max) return false;
  stamps.push(now);
  globalStamps.push(now);
  return true;
}

/** Test helper. */
export function __resetAssistantLimitsForTests() {
  clients.clear();
  globalStamps.length = 0;
}
