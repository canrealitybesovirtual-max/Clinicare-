/*
 * Offline service worker. Caches ONLY static, same-origin app files: hashed build assets, icons and the
 * fixed list of static pages below (pages are prerendered and contain no clinical text; all session
 * data lives in page memory). Page entries are keyed by path alone, so a query string is never stored.
 * RSC payloads are not cached: offline, Next.js falls back to a full navigation, which is served from
 * the cached page. Never touches non-GET requests or other origins.
 */
const VERSION = "crc-v2";
const PAGES = [
  "/",
  "/symptoms",
  "/diagnoses",
  "/measures",
  "/measures/gad-7",
  "/measures/phq-9",
  "/handouts",
  "/client",
  "/about",
];
const PAGE_SET = new Set(PAGES);
const SHELL = [...PAGES, "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];

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

  // Immutable build assets and icons: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Page loads: network first. Only the known static pages are cached, keyed by path (no query string).
  if (req.mode === "navigate") {
    const key = url.pathname;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic" && PAGE_SET.has(key)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(PAGE_SET.has(key) ? key : "/")
            .then((hit) => hit || caches.match("/"))
            .then((hit) => hit || Response.error()),
        ),
    );
  }
});
