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
import { strFromU8, unzipSync } from "fflate";
import {
  ROOT,
  answerItem,
  buildPlan,
  choose,
  downloadVia,
  enterSymptomText,
  goNav,
  gotoReady,
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
    await goNav(page, "Handouts");
    await expect(page).toHaveURL(/\/handouts$/);
    const handoutPdf = await downloadVia(page, page.getByRole("button", { name: "Download PDF" }).first());
    expect(handoutPdf.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const handoutText = pdfText(handoutPdf.bytes);
    expect(handoutText.drawn.length).toBeGreaterThan(200);
    expect(leaks(handoutText.all)).toEqual([]);
    expect(handoutText.all).not.toContain("[NAME]");

    // 6. Back to the Symptom Finder: still only the scrubbed text, in memory.
    await goNav(page, "Symptoms");
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

/* ------------------------------------------------------------------ plan builder + referral search */

/** Values a request to one of our /api routes may carry (docs/RESOURCES.md): ids, codes, ZIP, canonical city. */
const API_ROUTES = new Set([
  "icd10cm",
  "icd11",
  "medlineplus",
  "health-topics",
  "providers",
  "health-centers",
  "treatment-facilities",
  "rxnorm",
  "drug-label",
  "pubmed",
  "trials",
  "gho",
]);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ZIP = /^\d{5}$/;
const STATE = /^[A-Z]{2}$/;
const ICD = /^[A-Z0-9]{2,4}(?:\.[0-9A-Z]{1,4})?$/;
/**
 * The only cities this test types on purpose: canonical gazetteer names. Austin is also a first name, so the scrubber
 * flags it; it is let through only because the whole field is exactly a city in the chosen state.
 */
const CANONICAL_CITIES = new Set(["Springfield", "Austin"]);

type Rule = (v: unknown) => boolean;
const isInt: Rule = (v) => Number.isInteger(v);
const isId: Rule = (v) => typeof v === "string" && ID.test(v);
const isLang: Rule = (v) => v === "en" || v === "es";
const isLocation: Rule = (v) => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(",");
  if (keys === "zip") return typeof o.zip === "string" && ZIP.test(o.zip);
  if (keys === "city,state") return typeof o.city === "string" && CANONICAL_CITIES.has(o.city) && typeof o.state === "string" && STATE.test(o.state);
  return false;
};
const BODY_RULES: Record<string, Record<string, Rule>> = {
  providers: { providerType: isId, location: isLocation, limit: isInt, skip: isInt },
  "health-centers": { location: isLocation, radiusMiles: isInt, limit: isInt },
  "treatment-facilities": { location: isLocation, facilityType: isId, radiusMiles: isInt, page: isInt, pageSize: isInt },
  icd10cm: { code: (v) => typeof v === "string" && ICD.test(v), term: (v) => typeof v === "string" && v.length < 120, max: isInt },
  icd11: { code: (v) => typeof v === "string" && ICD.test(v), lang: isLang },
  medlineplus: { code: (v) => typeof v === "string" && ICD.test(v), lang: isLang },
  "health-topics": { topic: isId, lang: isLang, max: isInt },
  rxnorm: { drug: isId },
  "drug-label": { drug: isId },
  pubmed: { queryId: isId, max: isInt },
  trials: { condition: isId, state: (v) => typeof v === "string" && STATE.test(v), max: isInt },
  gho: { indicator: isId, country: (v) => typeof v === "string" && /^[A-Z]{3,6}$/.test(v) },
};

/** Problems with one captured /api request: route, method, query string, headers and every body field. */
function apiRequestProblems(r: Captured): string[] {
  const u = new URL(r.url);
  const route = u.pathname.replace(/^\/api\//, "");
  const p: string[] = [];
  if (!API_ROUTES.has(route)) p.push(`unexpected API route ${u.pathname}`);
  if (r.method !== "POST") p.push(`${u.pathname}: method ${r.method}`);
  if (u.search) p.push(`${u.pathname}: query string ${u.search}`);
  const headers = Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (headers.cookie) p.push(`${u.pathname}: sends a cookie`);
  if (headers.referer) p.push(`${u.pathname}: sends a Referer`);
  if (!/^application\/json\b/.test(headers["content-type"] ?? "")) p.push(`${u.pathname}: content-type ${headers["content-type"]}`);
  let body: unknown;
  try {
    body = JSON.parse(r.postData);
  } catch {
    return [...p, `${u.pathname}: body is not JSON`];
  }
  const rules = BODY_RULES[route] ?? {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return [...p, `${u.pathname}: body is not an object`];
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const rule = rules[k];
    if (!rule) p.push(`${u.pathname}: unexpected field "${k}"`);
    else if (!rule(v)) p.push(`${u.pathname}: field "${k}" has a value outside the allowlist: ${JSON.stringify(v)}`);
  }
  return p;
}

/** Text of every XML part of a DOCX. */
function docxAll(bytes: Buffer): string {
  const files = unzipSync(new Uint8Array(bytes));
  return Object.entries(files)
    .filter(([name]) => name.endsWith(".xml") || name.endsWith(".rels"))
    .map(([, data]) => strFromU8(data))
    .join("\n");
}

test.describe("PHI never leaves the page: plan builder and referral search", () => {
  test("identifiers typed into a custom objective and the city field are scrubbed, never sent, exported or stored", async ({ page }) => {
    const net = capture(page);
    await page.addInitScript(() => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });

    // 1. Plan builder: a custom objective typed key by key, full of planted identifiers.
    const objective =
      `${PLANTED.name} (DOB ${PLANTED.dob}, SSN ${PLANTED.ssn}, MRN ${PLANTED.mrn}) will walk to ${PLANTED.address} ` +
      `three times a week and text ${PLANTED.phone} or email ${PLANTED.email} afterwards.`;
    await gotoReady(page, "/plan");
    await buildPlan(page, "Generalized anxiety disorder", { customObjective: objective });
    const step = page.getByRole("region", { name: /^Step \d+ of \d+/ });
    await expect(step).toContainText("three times a week");
    expect(identifierLeaks(await visibleTextAndValues(page))).toEqual([]);
    expect(identifierLeaks(await page.content())).toEqual([]);

    // 2. Both exports: no planted value in any form.
    const pdf = await downloadVia(page, step.getByRole("button", { name: "Download PDF" }));
    expect(pdf.bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    const pdfAll = pdfText(pdf.bytes);
    expect(pdfAll.drawn).toContain("three times a week");
    expect(leaks(pdfAll.all)).toEqual([]);
    const docx = await downloadVia(page, step.getByRole("button", { name: "Download Word (.docx)" }));
    expect(docx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    const docxText = docxAll(docx.bytes);
    expect(docxText).toContain("three times a week");
    expect(leaks(docxText)).toEqual([]);
    expect(identifierLeaks(pdf.name + docx.name)).toEqual([]);

    // 3. Referral search (client-side navigation keeps the session): identifiers in the city field are never sent.
    await goNav(page, "Referrals");
    await expect(page).toHaveURL(/\/referrals$/);
    const form = page.getByRole("form", { name: "Find care near a location" });
    await choose(form, "Search location", "By city and state");
    await form.getByLabel("State or territory").selectOption("IL");
    const city = form.getByRole("textbox", { name: "City", exact: true });
    const apiCalls = () => net.captured.filter((r) => new URL(r.url).pathname.startsWith("/api/")).length;
    await net.settle();
    const before = apiCalls();
    for (const planted of [PLANTED.name, PLANTED.address, PLANTED.phone, PLANTED.email, `${PLANTED.ssn}`]) {
      await city.fill("");
      await city.pressSequentially(planted.slice(0, 40));
      // Enter submits straight from the field, before the blur-time scrub has replaced the text.
      await city.press("Enter");
      await expect(city).toHaveAttribute("aria-invalid", "true");
      expect(identifierLeaks(await city.inputValue()), `city field after ${planted}`).toEqual([]);
    }
    await page.waitForTimeout(300);
    await net.settle();
    expect(apiCalls(), "a city that held an identifier was sent").toBe(before);

    // A real city goes out as its canonical name only, with the state code.
    await city.fill("");
    await city.pressSequentially("Springfield");
    await form.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Showing \d+ results?\.$/ })).toBeVisible();
    // A city that is also a first name, typed alone, is checked against the gazetteer and sent as the city only.
    await form.getByLabel("State or territory").selectOption("TX");
    await city.fill("");
    await city.pressSequentially("Austin");
    const austin = page.waitForRequest((r) => new URL(r.url()).pathname.startsWith("/api/") && (r.postData() ?? "").includes("Austin"));
    await form.getByRole("button", { name: "Search" }).click();
    await austin;
    await expect(city).not.toHaveAttribute("aria-invalid", "true");
    // And a ZIP search for comparison.
    await choose(form, "Search location", "By ZIP code");
    await form.getByRole("textbox", { name: "ZIP code" }).fill("62701");
    await form.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Showing \d+ results?\.$/ })).toBeVisible();
    expect(identifierLeaks(await visibleTextAndValues(page))).toEqual([]);

    // 4. Network: every /api request carries only allowlisted fields and values; nothing planted anywhere.
    await net.settle();
    const api = net.captured.filter((r) => new URL(r.url).pathname.startsWith("/api/"));
    expect(api.length).toBeGreaterThanOrEqual(2);
    expect(api.flatMap(apiRequestProblems)).toEqual([]);
    const bodies = api.map((r) => JSON.parse(r.postData) as { location?: unknown });
    expect(bodies.map((b) => b.location)).toEqual(
      expect.arrayContaining([{ city: "Springfield", state: "IL" }, { city: "Austin", state: "TX" }, { zip: "62701" }]),
    );
    for (const r of net.captured) {
      const wire = [r.url, decodeURIComponentSafe(r.url), JSON.stringify(r.headers), r.postData].join("\n");
      expect(leaks(wire), `${r.method} ${r.url}`).toEqual([]);
      expect(wire, `${r.method} ${r.url}`).not.toContain("three times a week");
      const u = new URL(r.url);
      // The only query parameter any request may carry is Next.js's own RSC cache-buster (never typed text).
      if (u.protocol === "http:" || u.protocol === "https:")
        for (const [k, v] of u.searchParams) expect(`${k}=${v}`, r.url).toMatch(/^_rsc=[A-Za-z0-9_-]{1,64}$/);
    }
    expect(net.sockets).toEqual([]);

    // 5. Storage: nothing typed, scrubbed or not, is persisted.
    const storage = await dumpStorage(page);
    expect(storage.local).toEqual({});
    expect(leaks(JSON.stringify(storage.session))).toEqual([]);
    expect(JSON.stringify(storage.session)).not.toContain("three times a week");
    expect(storage.cookie).toBe("");
    expect(storage.idb).toEqual([]);
    expect(leaks(storage.historyState + storage.windowName + storage.href)).toEqual([]);
    expect(storage.historyState).not.toContain("three times a week");
    for (const entry of storage.cacheEntries) {
      expect(leaks(entry.url), `cached ${entry.url}`).toEqual([]);
      const builtFile = staticFileFor(new URL(entry.url).pathname);
      if (builtFile) expect(entry.sha256, `cached ${entry.url} differs from ${builtFile}`).toBe(sha256File(builtFile));
      else {
        expect(leaks(entry.body), `cached ${entry.url}`).toEqual([]);
        expect(entry.body).not.toContain("three times a week");
      }
    }
    const state = await page.context().storageState({ indexedDB: true });
    expect(state.cookies).toEqual([]);
    expect(leaks(JSON.stringify(state))).toEqual([]);

    const csp = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
    expect(csp).toEqual([]);
  });
});

/* ------------------------------------------------------------------ session note helper */

test.describe("PHI never leaves the page: session note helper", () => {
  test("a name and phone typed into the note are scrubbed before export, and never sent or stored", async ({ page }) => {
    const net = capture(page);
    await gotoReady(page, "/symptoms");
    await enterSymptomText(page, CLINICAL);
    await choose(page, "Duration", "1 to 6 months");
    await goNav(page, "Tools");
    await page.getByRole("link", { name: /^Session note helper/ }).click();
    await expect(page).toHaveURL(/\/tools\/note$/);

    // Prefilled from the memory-only session, then typed into and exported straight away: the export runs the
    // scrubber on every field first, so the last keystrokes are never exported raw.
    const subjective = page.getByLabel("Subjective", { exact: true });
    await expect(subjective).not.toHaveValue("");
    const prefill = await subjective.inputValue();
    await subjective.fill(`${prefill} Spoke with ${PLANTED.name} on ${PLANTED.phone} about the week.`);
    const pdf = await downloadVia(page, page.getByRole("button", { name: "Download PDF", exact: true }));
    await expect(subjective).toHaveValue(/\[NAME\]/);
    expect(identifierLeaks(await subjective.inputValue())).toEqual([]);

    expect(pdf.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pdfAll = pdfText(pdf.bytes);
    expect(pdfAll.drawn).toContain("about the week");
    expect(pdfAll.drawn).toContain("[PHONE]");
    expect(pdfAll.drawn).toContain("Client:");
    expect(pdfAll.drawn).toContain("Resource only. Not a substitute for clinical judgment.");
    expect(leaks(pdfAll.all)).toEqual([]);
    const docx = await downloadVia(page, page.getByRole("button", { name: "Download Word" }));
    expect(docx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    const docxText = docxAll(docx.bytes);
    expect(docxText).toContain("about the week");
    expect(leaks(docxText)).toEqual([]);
    expect(identifierLeaks(pdf.name + docx.name)).toEqual([]);
    expect(identifierLeaks(await visibleTextAndValues(page))).toEqual([]);

    // Network: nothing typed anywhere, and the note helper posts nothing.
    await net.settle();
    for (const r of net.captured) {
      const wire = [r.url, decodeURIComponentSafe(r.url), JSON.stringify(r.headers), r.postData].join("\n");
      expect(leaks(wire), `${r.method} ${r.url}`).toEqual([]);
      expect(wire, `${r.method} ${r.url}`).not.toContain("about the week");
    }
    expect(net.captured.filter((r) => r.postData.length > 0).map((r) => `${r.method} ${r.url}`)).toEqual([]);

    // Storage: nothing typed is persisted.
    const storage = await dumpStorage(page);
    expect(storage.local).toEqual({});
    expect(storage.cookie).toBe("");
    expect(leaks(JSON.stringify(storage.session) + storage.historyState + storage.windowName + storage.href)).toEqual([]);
    for (const entry of storage.cacheEntries) {
      if (staticFileFor(new URL(entry.url).pathname)) continue;
      expect(leaks(entry.body), `cached ${entry.url}`).toEqual([]);
      expect(entry.body).not.toContain("about the week");
    }
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
