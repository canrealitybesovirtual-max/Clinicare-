"use client";
/**
 * Runs one live reference lookup through our own /api route (callApi) for a CURATED medication id, never typed text.
 * Loads on mount, aborts on unmount, and exposes retry for rate-limited, offline and upstream errors.
 */
import * as React from "react";
import { callApi } from "@/lib/api-client";

export type LiveState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T; attribution: string; source: string }
  | { status: "error"; code: string; message: string; fallbackUrl?: string };

export function useLiveLookup<T>(route: "rxnorm" | "drug-label", drug: string) {
  const [state, setState] = React.useState<LiveState<T>>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const ac = new AbortController();
    setState({ status: "loading" });
    void callApi<T>(route, { drug }, ac.signal).then((res) => {
      if (ac.signal.aborted) return;
      if (res.ok) {
        setState({ status: "ok", data: res.data, attribution: res.attribution, source: res.source });
      } else {
        const raw = res as { code?: string; error?: string; fallbackUrl?: unknown };
        setState({
          status: "error",
          code: raw.code ?? "upstream",
          message: raw.error ?? "",
          fallbackUrl: typeof raw.fallbackUrl === "string" && raw.fallbackUrl.startsWith("https://") ? raw.fallbackUrl : undefined,
        });
      }
    });
    return () => ac.abort();
  }, [route, drug, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}

/** Original copy for lookup errors. */
export function lookupErrorCopy(code: string, message: string): { title: string; body: string; retry: boolean } {
  switch (code) {
    case "not-configured":
      return {
        title: "Live lookup is not available on this server",
        body: "Use the official pages linked below instead.",
        retry: false,
      };
    case "rate-limited":
      return {
        title: "Too many lookups right now",
        body: message && /tomorrow/i.test(message) ? message : "Wait about 10 seconds, then try again.",
        retry: true,
      };
    case "network":
      return { title: "You appear to be offline", body: "Live lookups need a connection. The summary on this page still works.", retry: true };
    default:
      return { title: "The reference service did not respond", body: message || "Try again in a moment.", retry: true };
  }
}
