/**
 * Service worker and discreet pages (public/sw.js, src/lib/discreet.ts): a relationship-safety page is never put in
 * the offline cache, so someone checking the device cannot find it in this site's data. Ordinary curated pages are
 * still cached on visit. The worker runs here against fake caches and fetch.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DISCREET_PATHS } from "@/lib/discreet";

type FetchEvent = { request: { method: string; url: string; mode: string }; respondWith: (p: Promise<unknown>) => void };

function loadWorker() {
  const src = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");
  const listeners: Record<string, (e: FetchEvent) => void> = {};
  const stored: string[] = [];
  const cache = { put: (key: string) => void stored.push(String(key)), add: async () => undefined, match: async () => undefined };
  const caches = { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true };
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (type: string, fn: (e: FetchEvent) => void) => void (listeners[type] = fn),
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
  };
  const fetch = async () => ({ ok: true, type: "basic", clone() { return this; } });
  new Function("self", "caches", "fetch", src)(self, caches, fetch);
  return {
    src,
    stored,
    async navigate(path: string) {
      let responded: Promise<unknown> | null = null;
      listeners.fetch!({ request: { method: "GET", url: `https://app.test${path}`, mode: "navigate" }, respondWith: (p) => void (responded = p) });
      if (responded) await responded;
      await new Promise((r) => setTimeout(r, 0));
      return responded !== null;
    },
  };
}

describe("service worker and discreet pages", () => {
  it("never caches or serves a discreet page, with or without a trailing slash", async () => {
    const sw = loadWorker();
    expect(DISCREET_PATHS.length).toBeGreaterThan(0);
    for (const path of DISCREET_PATHS) {
      expect(await sw.navigate(path), path).toBe(false);
      expect(await sw.navigate(`${path}/`), `${path}/`).toBe(false);
    }
    expect(sw.stored.filter((k) => DISCREET_PATHS.some((p) => k.startsWith(p)))).toEqual([]);
  });

  it("still caches an ordinary curated client page on visit", async () => {
    const sw = loadWorker();
    expect(await sw.navigate("/client/topics/sleep")).toBe(true);
    expect(sw.stored).toContain("/client/topics/sleep");
  });

  it("uses a cache version newer than the one that could hold discreet pages", () => {
    const version = /const VERSION = "crc-v(\d+)"/.exec(loadWorker().src)?.[1];
    expect(Number(version)).toBeGreaterThanOrEqual(6);
  });
});
