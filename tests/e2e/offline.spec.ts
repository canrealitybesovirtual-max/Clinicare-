/**
 * Service worker (public/sw.js): it may cache only static same-origin app files, never anything typed
 * and never a query string, and it must not break navigation, online or offline.
 */
import { expect, test, type Page } from "@playwright/test";
import { ROUTES, answerItem, enterSymptomText, gotoReady, navLink } from "./helpers";

const SECRET = "zz-offline-probe-7781";

async function cacheEntries(page: Page) {
  return page.evaluate(async () => {
    const out: { cache: string; url: string; method: string; status: number; body: string }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        out.push({ cache: name, url: req.url, method: req.method, status: res?.status ?? 0, body: res ? await res.text() : "" });
      }
    }
    return out;
  });
}

test.describe("service worker", () => {
  test("caches only static app files and keeps navigation working online and offline", async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL ?? "http://127.0.0.1:3100").origin;
    await gotoReady(page, "/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    // Online: every route still loads through the worker.
    for (const route of ROUTES) {
      const res = await page.goto(route);
      expect(res?.ok(), route).toBe(true);
      expect(res?.fromServiceWorker(), route).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }

    // Typed text and query strings never reach the cache.
    await page.goto(`/symptoms?note=${SECRET}`);
    await enterSymptomText(page, `Worries about everything ${SECRET}, restless, cannot sleep.`);
    await navLink(page, "Measures").click();
    await expect(page).toHaveURL(/\/measures$/);

    const entries = await cacheEntries(page);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const u = new URL(e.url);
      expect(u.origin).toBe(origin);
      expect(e.method).toBe("GET");
      expect(e.status).toBe(200);
      expect(u.search, e.url).toBe("");
      const isStatic =
        ROUTES.includes(u.pathname as (typeof ROUTES)[number]) ||
        u.pathname.startsWith("/_next/static/") ||
        u.pathname.startsWith("/icons/") ||
        u.pathname === "/manifest.webmanifest";
      expect(isStatic, `unexpected cache entry ${e.url}`).toBe(true);
      expect(e.body, e.url).not.toContain(SECRET);
      expect(e.body, e.url).not.toContain("Worries about everything");
    }

    // Offline: cached pages load and work (scripts come from the cache too).
    await context.setOffline(true);
    try {
      await page.goto("/measures/gad-7");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("GAD-7");
      await answerItem(page, 1, 7, "Several days");
      await expect(page.getByText(/^Total 1 of 21\. 1 of 7 items answered\.$/)).toBeAttached();

      // In-app navigation falls back to a full page load, served from the cache.
      await navLink(page, "Handouts").click();
      await expect(page).toHaveURL(/\/handouts$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Handouts");

      // An uncached path gets the cached home page rather than a browser error, which also proves
      // the worker really was offline (online, the server would answer with its 404 page).
      await page.goto("/not-cached-anywhere");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "From symptoms to resources, with the reasoning in view",
      );
    } finally {
      await context.setOffline(false);
    }

    // Back online, the 404 page is served by the network again.
    await page.goto("/not-cached-anywhere");
    await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
  });
});
