/*
 * Deliberately minimal service worker. Its single job: when the local server is
 * not running, answer navigations with offline.html — which can start the server
 * back up — instead of the browser's "connection refused" page. That is what makes
 * the installed app icon a viable entry point.
 *
 * It caches nothing else on purpose. Caching the app shell or API responses would
 * mean a rebuilt app keeps serving yesterday's bundle, which is the classic way a
 * local-first PWA turns into a support ticket.
 *
 * Bump CACHE whenever offline.html changes, so the new copy replaces the old one.
 */
const CACHE = "rtds-dca-fallback-v1";
const FALLBACK = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.add(new Request(FALLBACK, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Everything that is not a page load — the bundle, the API, the SSE stream —
  // goes straight to the network, untouched and uncached.
  if (event.request.mode !== "navigate") {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cached = await caches.open(CACHE).then((cache) => cache.match(FALLBACK));
        return cached ?? Response.error();
      }
    })(),
  );
});
