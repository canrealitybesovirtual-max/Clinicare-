"use client";
/**
 * Browser -> our own /api routes only (CSP connect-src 'self'). POST bodies so values never appear in URLs or
 * server request logs. Callers must pass values already validated by src/lib/outbound.ts.
 */
export type ApiResult<T> =
  | { ok: true; data: T; attribution: string; source: string }
  | { ok: false; error: string; code: string };

export async function callApi<T>(route: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: "You appear to be offline, or the service is unavailable.", code: "network" };
  }
}
