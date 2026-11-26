/**
 * PHI-leak test (G5, G17). A vignette with planted FAKE identifiers is typed into the Symptom Finder,
 * then the clinician walks through possible diagnoses, a measure and two PDF downloads. Every request
 * the browser makes (pages and the service worker) is captured with its URL, headers and body, and
 * nothing typed may appear in any of them, in the DOM after scrubbing, in a PDF, or in any browser
 * storage API. Only same-origin requests are allowed.
 *
 * All identifiers below are fictional test values.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";
import {
  ROOT,
  answerItem,
  choose,
  downloadVia,
  gotoReady,
  navLink,
  pdfText,
  visibleTextAndValues,
} from "./helpers";

const PLANTED = {
  name: "Jonathan Q. Testperson",
  ssn: "123-45-6789",
  phone: "(555) 867-5309",
  email: "jq.testperson@example.com",
  mrn: "00123456",
  address: "742 Evergreen Terrace",
  dob: "03/14/1961",
} as const;

/** Original clinical wording (not one of the in-app examples, so it cannot appear in any bundle). */
const CLINICAL =
  "Reports sudden panic attacks out of nowhere with heart racing, short of breath and dizzy, and says it felt like dying. " +
  "Now always worried about the next attack and avoids crowds, buses and stores unless a friend comes along.";

const VIGNETTE =
  `Client ${PLANTED.name}, DOB ${PLANTED.dob}, SSN ${PLANTED.ssn}, phone ${PLANTED.phone}, ` +
  `email ${PLANTED.email}, MRN ${PLANTED.mrn}, lives at ${PLANTED.address}. ${CLINICAL}`;

/** Every planted value plus the forms it could take on the wire (encoded, digits only, fragments). */
function needles(): string[] {
  const base = Object.values(PLANTED) as string[];
  const extra = [
    "Jonathan",
    "Testperson",
    "jq.testperson",
    "Evergreen Terrace",
    "123456789",
    "5558675309",
    "867-5309",
    "03141961",
    "1961-03-14",
    VIGNETTE,
    CLINICAL,
    CLINICAL.slice(0, 60),
  ];
  const all = [...base, ...extra];
  const encoded = all.flatMap((s) => [encodeURIComponent(s), encodeURIComponent(s).replace(/%20/g, "+"), Buffer.from(s).toString("base64")]);
  return [...new Set([...all, ...encoded])].map((s) => s.toLowerCase());
}
const NEEDLES = needles();

function leaks(haystack: string): string[] {
  const h = haystack.toLowerCase();
  return NEEDLES.filter((n) => h.includes(n));
}

/** Identifier values only (the scrubbed clinical sentence may legitimately be shown on screen). */
function identifierLeaks(haystack: string): string[] {
  const h = haystack.toLowerCase();
  const ids = [...Object.values(PLANTED), "Jonathan", "Testperson", "jq.testperson", "Evergreen", "5558675309", "123456789"];
  return ids.map((s) => s.toLowerCase()).filter((n) => h.includes(n));
}

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: string;
  fromServiceWorker: boolean;
}

function capture(page: Page) {
  const pending: Promise<void>[] = [];
  const captured: Captured[] = [];
  const onRequest = (req: Request) => {
    const entry = (headers: Record<string, string>): void => {
      captured.push({
        url: req.url(),
        method: req.method(),
        headers,
        postData: req.postDataBuffer()?.toString("latin1") ?? "",
        fromServiceWorker: !!req.serviceWorker(),
      });
    };
    // allHeaders() never settles for some requests (blob: downloads), so fall back to the provisional
    // headers after a short wait. Both sets are what the browser put on the wire.
    const fallback = new Promise<Record<string, string>>((resolve) => setTimeout(() => resolve(req.headers()), 2_000));
    pending.push(
      Promise.race([req.allHeaders(), fallback]).then(entry, () => {
        entry(req.headers());
      }),
    );
  };
  page.context().on("request", onRequest);
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  return {
    captured,
    sockets,
    async settle() {
      await Promise.all(pending);
    },
  };
}

/** Read every browser storage API from inside the page, including CacheStorage response bodies. */
async function dumpStorage(page: Page) {
  return page.evaluate(async () => {
    const ls = window.localStorage;
    const ss = window.sessionStorage;
    const local: Record<string, string> = {};
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i) ?? "";
      local[k] = ls.getItem(k) ?? "";
    }
    const session: Record<string, string> = {};
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i) ?? "";
      session[k] = ss.getItem(k) ?? "";
    }
    const idb = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    const cacheEntries: { cache: string; url: string; method: string; status: number; body: string; sha256: string }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        const buf = res ? await res.clone().arrayBuffer() : new ArrayBuffer(0);
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
        cacheEntries.push({
          cache: name,
          url: req.url,
          method: req.method,
          status: res?.status ?? 0,
          body: new TextDecoder().decode(buf),
          sha256: [...digest].map((b) => b.toString(16).padStart(2, "0")).join(""),
        });
      }
    }
    let historyState = "";
    try {
      historyState = JSON.stringify(history.state) ?? "";
    } catch {
      historyState = "[unserializable]";
    }
    return {
      local,
      session,
      cookie: document.cookie,
      idb: idb.map((d) => d.name ?? ""),
      cacheEntries,
      historyState,
      windowName: window.name,
      href: location.href,
    };
  });
}

test.describe("PHI never leaves the page", () => {
  test("planted identifiers are scrubbed, never sent, never printed, never stored", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "http://127.0.0.1:3100").origin;
    const net = capture(page);
    await page.addInitScript(() => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });

    // 1. Type the vignette like a clinician would (keystroke by keystroke).
    await gotoReady(page, "/symptoms");
    const box = page.getByLabel(/^Symptoms and behaviors/);
    await box.click();
    await box.pressSequentially(VIGNETTE);
    await box.blur();

    // 2. The field now holds placeholders only, and the alert names types, never values.
    await expect(box).toHaveValue(/\[NAME\]/);
    const scrubbed = await box.inputValue();
    for (const ph of ["[NAME]", "[DATE]", "[SSN]", "[PHONE]", "[EMAIL]", "[MRN]", "[ADDRESS]"]) expect(scrubbed).toContain(ph);
    expect(identifierLeaks(scrubbed)).toEqual([]);
    const alert = page.getByRole("alert").filter({ hasText: "Possible identifiers removed" });
    await expect(alert).toBeVisible();
    for (const label of ["Name", "Social Security number", "Phone number", "Email address", "Medical record number"]) {
      await expect(alert).toContainText(label);
    }
    expect(identifierLeaks(await visibleTextAndValues(page))).toEqual([]);
    expect(identifierLeaks(await page.content())).toEqual([]);
    // Matching still worked on the clean text.
    await expect(page.getByRole("heading", { name: /^Detected from your text/ }).locator("..")).not.toContainText(
      "Nothing detected yet",
    );

    // 3. Possible diagnoses (client-side navigation keeps the memory-only session).
    await choose(page, "Duration", "1 to 6 months");
    await choose(page, "Clinically significant distress or functional impairment", "Yes");
    await page.getByRole("link", { name: /^See possible diagnoses \(\d+\)/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/diagnoses$/);
    const panic = page.getByRole("article", { name: "Panic disorder" });
    await expect(panic).toBeVisible();
    await page.locator("details").evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
    expect(identifierLeaks(await visibleTextAndValues(page))).toEqual([]);
    expect(identifierLeaks(await page.content())).toEqual([]);

    // 4. A measure, fully answered, then its blank PDF.
    await panic.getByRole("link", { name: "Run GAD-7" }).click();
    await expect(page).toHaveURL(/\/measures\/gad-7$/);
    for (let i = 1; i <= 7; i++) await answerItem(page, i, 7, i % 2 ? "Several days" : "Nearly every day");
    await expect(page.getByText(/^Severity band: /)).toBeVisible();
    expect(identifierLeaks(await visibleTextAndValues(page))).toEqual([]);

    const measurePdf = await downloadVia(page, page.getByRole("button", { name: "Download blank PDF" }));
    expect(measurePdf.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const measureText = pdfText(measurePdf.bytes);
    expect(measureText.drawn).toContain("GAD-7"); // extraction works
    expect(leaks(measureText.all)).toEqual([]);
    expect(measureText.all).not.toContain("[NAME]");
    expect(identifierLeaks(measurePdf.name)).toEqual([]);

    // 5. A handout PDF.
    await navLink(page, "Handouts").click();
    await expect(page).toHaveURL(/\/handouts$/);
    const handoutPdf = await downloadVia(page, page.getByRole("button", { name: "Download PDF" }).first());
    expect(handoutPdf.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const handoutText = pdfText(handoutPdf.bytes);
    expect(handoutText.drawn.length).toBeGreaterThan(200);
    expect(leaks(handoutText.all)).toEqual([]);
    expect(handoutText.all).not.toContain("[NAME]");

    // 6. Back to the Symptom Finder: still only the scrubbed text, in memory.
    await navLink(page, "Symptoms").click();
    await expect(page.getByLabel(/^Symptoms and behaviors/)).toHaveValue(scrubbed);
    expect(identifierLeaks(await visibleTextAndValues(page))).toEqual([]);

    // 7. Browser storage: nothing typed, scrubbed or not, is persisted anywhere.
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
    });
    const storage = await dumpStorage(page);
    expect(storage.local).toEqual({});
    expect(storage.cookie).toBe("");
    expect(storage.idb).toEqual([]);
    expect(leaks(JSON.stringify(storage.session))).toEqual([]);
    expect(leaks(storage.historyState)).toEqual([]);
    expect(leaks(storage.windowName + storage.href)).toEqual([]);
    expect(storage.cacheEntries.length).toBeGreaterThan(0); // the service worker did cache the app shell
    for (const entry of storage.cacheEntries) {
      const u = new URL(entry.url);
      expect(u.origin).toBe(origin);
      expect(entry.method).toBe("GET");
      expect(leaks(entry.url), `cached ${entry.url}`).toEqual([]);
      const builtFile = staticFileFor(u.pathname);
      if (builtFile) {
        // Build assets and icons must be byte-identical to the files on disk, so nothing typed can be in them.
        expect(entry.sha256, `cached ${entry.url} differs from ${builtFile}`).toBe(sha256File(builtFile));
      } else {
        // Pages and the manifest: server-rendered static content, searched directly.
        expect(leaks(entry.body), `cached ${entry.url}`).toEqual([]);
        expect(entry.body).not.toContain("[NAME]");
      }
    }
    const state = await page.context().storageState({ indexedDB: true });
    expect(state.cookies).toEqual([]);
    expect(leaks(JSON.stringify(state))).toEqual([]);

    // 8. Network: same origin only, and nothing typed in any URL, header or body.
    await net.settle();
    expect(net.captured.length).toBeGreaterThan(5);
    expect(net.sockets).toEqual([]);
    for (const r of net.captured) {
      const u = new URL(r.url);
      const reqOrigin = u.protocol === "blob:" ? new URL(u.pathname).origin : u.origin;
      if (u.protocol !== "data:") expect(reqOrigin, `request to ${r.url}`).toBe(origin);
      const wire = [r.url, decodeURIComponentSafe(r.url), JSON.stringify(r.headers), r.postData].join("\n");
      expect(leaks(wire), `${r.method} ${r.url}`).toEqual([]);
      expect(wire).not.toContain("[NAME]");
      expect(wire).not.toContain(scrubbed.slice(0, 40));
    }
    // No request carried a body at all: Phase 1 never posts anything.
    expect(net.captured.filter((r) => r.postData.length > 0).map((r) => `${r.method} ${r.url}`)).toEqual([]);

    const csp = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
    expect(csp).toEqual([]);
  });
});

/** The file on disk a static URL is served from, or null for pages and other routes. */
function staticFileFor(pathname: string): string | null {
  if (pathname.startsWith("/_next/static/")) return path.join(ROOT, ".next/static", decodeURIComponent(pathname.slice("/_next/static/".length)));
  if (pathname.startsWith("/icons/")) return path.join(ROOT, "public", decodeURIComponent(pathname.slice(1)));
  return null;
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}
