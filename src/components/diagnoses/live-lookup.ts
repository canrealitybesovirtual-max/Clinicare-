"use client";
/**
 * Lazy reference lookups through our own /api routes (callApi). Shared by clinician panels (ICD-10-CM, ICD-11,
 * MedlinePlus Connect) and client-mode topic results (MedlinePlus Health Topics).
 *
 * - Nothing is fetched until the caller passes a body (body === null means "idle"), so a panel fetches only once
 *   the clinician opens it.
 * - Bodies hold ONLY curated values: codes, curated topic ids, a language code (G5, G17). Callers never put typed
 *   text in a body; the routes re-validate everything server-side.
 * - Successful results are kept in a per-component, in-memory map so switching language back does not refetch.
 *   Nothing is written to browser storage, the URL or any log.
 * - Errors keep the route's code so the UI can offer retry (rate-limited, offline, upstream) or a link-out
 *   fallback (not-configured), and `fallbackUrl` when the route supplies one (ICD-11).
 */
import * as React from "react";
import { callApi } from "@/lib/api-client";

export type LookupRoute = "icd10cm" | "icd11" | "medlineplus" | "health-topics";

export type LookupErrorCode = "not-configured" | "rate-limited" | "network" | "invalid" | "rejected" | "upstream";

export type LookupState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T; attribution: string; source: string }
  | { status: "error"; code: LookupErrorCode; message: string; fallbackUrl?: string };

const KNOWN_CODES: readonly LookupErrorCode[] = ["not-configured", "rate-limited", "network", "invalid", "rejected", "upstream"];

/** Normalise any error body from callApi into a LookupState error. Exported for tests. */
export function toLookupError(raw: unknown): Extract<LookupState<never>, { status: "error" }> {
  const r = (raw ?? {}) as { code?: unknown; error?: unknown; fallbackUrl?: unknown };
  const code = KNOWN_CODES.includes(r.code as LookupErrorCode) ? (r.code as LookupErrorCode) : "upstream";
  const fallbackUrl = typeof r.fallbackUrl === "string" && /^https:\/\/[^\s]+$/.test(r.fallbackUrl) ? r.fallbackUrl : undefined;
  return { status: "error", code, message: typeof r.error === "string" ? r.error.slice(0, 300) : "", fallbackUrl };
}

/**
 * Run one lookup for `body` (null = do nothing yet). Re-runs when the body changes or on retry().
 * Aborts the in-flight request on change or unmount.
 */
export function useLookup<T>(route: LookupRoute, body: Record<string, string | number> | null) {
  const key = body ? JSON.stringify(body) : null;
  const [state, setState] = React.useState<LookupState<T>>({ status: "idle" });
  const [attempt, setAttempt] = React.useState(0);
  const cache = React.useRef(new Map<string, Extract<LookupState<T>, { status: "ok" }>>());

  React.useEffect(() => {
    if (key === null) {
      setState((s) => (s.status === "idle" ? s : { status: "idle" }));
      return;
    }
    const hit = cache.current.get(key);
    if (hit) {
      setState(hit);
      return;
    }
    const ac = new AbortController();
    setState({ status: "loading" });
    void callApi<T>(route, JSON.parse(key) as Record<string, unknown>, ac.signal).then((res) => {
      if (ac.signal.aborted) return;
      if (res.ok) {
        const ok = { status: "ok" as const, data: res.data, attribution: res.attribution, source: res.source };
        cache.current.set(key, ok);
        setState(ok);
      } else {
        setState(toLookupError(res));
      }
    });
    return () => ac.abort();
  }, [route, key, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}

export interface LookupErrorCopy {
  title: string;
  body: string;
  retry: boolean;
}

/** Original wording for lookup errors. `plain` = client-mode reading level. */
export function lookupErrorCopy(code: LookupErrorCode, message: string, plain = false): LookupErrorCopy {
  const sudSwitch = /substance-use reference lookups/i.test(message);
  switch (code) {
    case "not-configured":
      if (plain) return { title: "This list is not available right now", body: "You can still open the page linked below.", retry: false };
      return sudSwitch
        ? {
            title: "Substance-use reference lookups are turned off on this server",
            body: "The owner setting for 42 CFR Part 2 reference lookups is off. Use the official link below instead.",
            retry: false,
          }
        : { title: "This lookup is not set up on this server", body: "Use the official link below instead.", retry: false };
    case "rate-limited":
      return {
        title: plain ? "Too many people are looking right now" : "Too many lookups right now",
        body: "Wait about 10 seconds, then try again.",
        retry: true,
      };
    case "network":
      return plain
        ? { title: "You seem to be offline", body: "Connect to the internet, then try again.", retry: true }
        : { title: "You appear to be offline", body: "Live lookups need a connection. Everything else on this page still works.", retry: true };
    case "invalid":
    case "rejected":
      return plain
        ? { title: "This could not be looked up", body: "Try the page linked below instead.", retry: false }
        : { title: "This value cannot be looked up", body: "Only codes and curated terms can be sent.", retry: false };
    default:
      return plain
        ? { title: "The health library did not answer", body: "Try again in a moment.", retry: true }
        : { title: "The reference service did not respond", body: "Try again in a moment.", retry: true };
  }
}
