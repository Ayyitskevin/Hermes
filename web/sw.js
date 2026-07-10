/* Hermes service worker — static shell only (C6 PWA polish).
   Never caches /api/* so numbers stay live and provenance stays honest. */
const CACHE = "hermes-shell-v1";
const SHELL = [
  "/",
  "/static/css/hermes.css",
  "/static/js/app.js",
  "/static/js/shell.js",
  "/static/js/router.js",
  "/static/js/store.js",
  "/static/js/util.js",
  "/static/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    return; // network only — never cache market numbers
  }
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).catch(() => caches.match("/")))
  );
});
