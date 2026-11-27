/*
 * Offline service worker. Caches ONLY static, same-origin app files: hashed build assets, icons, the static pages
 * below (precached at install) and the curated-id pages a user has opened (cached on visit). Pages are prerendered
 * and contain no clinical text; all session data lives in page memory. Only a navigation WITHOUT a query string is
 * stored (keyed by its path): a server-rendered page embeds the URL it was asked for, query included, so a page
 * fetched with a query is passed through and never cached. RSC payloads are not cached: offline, Next.js falls back to a full navigation, which
 * is served from the cached page. Never touches non-GET requests, other origins, /api/**, /models/** or /ort/**
 * (the on-device model checks its own files).
 */
const VERSION = "crc-v4";

/** Every route without a dynamic segment (src/app). A route that does not exist yet is skipped at install. */
const PAGES = [
  "/",
  "/symptoms",
  "/diagnoses",
  "/diagnoses/compare",
  "/measures",
  "/plan",
  "/interventions",
  "/handouts",
  "/referrals",
  "/medications",
  "/medications/effects",
  "/ethics",
  "/tools",
  "/about",
  "/client",
  "/client/help",
  "/client/skills",
  "/client/calm",
  "/formulations",
  "/formulations/builder",
  "/orientations",
  "/practice",
  "/populations",
  "/about/changelog",
  "/about/report",
];
const PAGE_SET = new Set(PAGES);

/** Dynamic [id] routes: network first, cached on visit. Ids are curated content slugs, never typed text. */
const DYNAMIC_PAGES = [
  /^\/measures\/[a-z0-9-]+$/,
  /^\/interventions\/[a-z0-9-]+$/,
  /^\/handouts\/[a-z0-9-]+$/,
  /^\/medications\/[a-z0-9-]+$/,
  /^\/client\/topics\/[a-z0-9-]+$/,
  /^\/client\/skills\/[a-z0-9-]+$/,
  /^\/r\/[a-z0-9-]+$/,
  /^\/r\/[a-z0-9-]+\/es$/,
  /^\/formulations\/[a-z0-9-]+$/,
  /^\/orientations\/[a-z0-9-]+$/,
];

const NEVER = [/^\/api\//, /^\/models\//, /^\/ort\//];
const SHELL = [...PAGES, "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];

const isPage = (path) => PAGE_SET.has(path) || DYNAMIC_PAGES.some((re) => re.test(path));
const isClientPage = (path) => path === "/client" || path.startsWith("/client/") || path.startsWith("/r/");

function store(key, res) {
  if (!res.ok || res.type !== "basic") return;
  const copy = res.clone();
  caches.open(VERSION).then((c) => c.put(key, copy));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((re) => re.test(url.pathname))) return;

  // Immutable build assets and icons: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            store(req, res);
            return res;
          }),
      ),
    );
    return;
  }

  // Page loads: network first, cached by path, and only when the URL has no query string (see the file note).
  // Offline, an uncached page falls back to the home page of its mode, so a client page never lands on the
  // clinician home.
  if (req.mode === "navigate") {
    const key = url.pathname;
    const fallback = isClientPage(key) ? "/client" : "/";
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isPage(key) && !url.search) store(key, res);
          return res;
        })
        .catch(() =>
          caches
            .match(isPage(key) ? key : fallback)
            .then((hit) => hit || caches.match(fallback))
            .then((hit) => hit || caches.match("/"))
            .then((hit) => hit || Response.error()),
        ),
    );
  }
});
