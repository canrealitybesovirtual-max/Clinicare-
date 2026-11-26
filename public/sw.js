/*
 * Offline service worker. Caches ONLY static, same-origin app files (pages are static and contain no
 * clinical text; all session data lives in page memory). Never touches non-GET requests or other origins.
 */
const VERSION = "crc-v1";
const SHELL = [
  "/",
  "/symptoms",
  "/diagnoses",
  "/measures",
  "/measures/gad-7",
  "/measures/phq-9",
  "/handouts",
  "/client",
  "/about",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
];

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

  // Immutable build assets: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages and RSC payloads: network first, fall back to the cached static copy when offline.
  if (req.mode === "navigate" || req.headers.get("RSC") === "1") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : Response.error())),
        ),
    );
  }
});
