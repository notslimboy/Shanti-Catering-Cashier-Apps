const CACHE_NAME = "kasir-bento-v217";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=217",
  "./script.js?v=217",
  "./drivers/XP%20PRINTER%20DRIVER.rar",
  "./sample-items.csv",
  "./sample-bulk-orders.csv",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./logocatering.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
