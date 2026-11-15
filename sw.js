const CACHE_NAME = "vedant-grocery-shell-v1";
const APP_BASE_URL = new URL(self.registration.scope);
const APP_SHELL_URL = new URL("./", APP_BASE_URL).href;
const MANIFEST_URL = new URL("manifest.webmanifest", APP_BASE_URL).href;
const BRAND_ASSET_URLS = [
  new URL("icons/app-icon-192.png", APP_BASE_URL).href,
  new URL("icons/app-icon-512.png", APP_BASE_URL).href,
  new URL("logo.png", APP_BASE_URL).href
];
const CACHED_ASSETS = new Set([MANIFEST_URL, ...BRAND_ASSET_URLS]);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([APP_SHELL_URL, ...CACHED_ASSETS]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith("vedant-grocery-shell-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname.startsWith(APP_BASE_URL.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_SHELL_URL, response.clone());
        }
        return response;
      } catch (error) {
        const cachedShell = await caches.match(APP_SHELL_URL);
        if (!cachedShell) throw error;
        return cachedShell;
      }
    })());
    return;
  }

  if (CACHED_ASSETS.has(url.href)) {
    event.respondWith((async () => {
      const cachedAsset = await caches.match(request);
      return cachedAsset || fetch(request);
    })());
  }
});
