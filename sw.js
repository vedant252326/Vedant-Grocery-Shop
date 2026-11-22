'use strict';

const CACHE_NAME = 'vedant-grocery-pwa-v9';
const APP_ROOT = new URL('./', self.registration.scope);
const OFFLINE_PAGE = new URL('index.html', APP_ROOT).href;

const APP_FILES = [
  APP_ROOT.href,
  OFFLINE_PAGE,
  new URL('manifest.webmanifest', APP_ROOT).href
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_FILES.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (error) {
        console.warn('Could not cache:', url);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('vedant-grocery-pwa-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(rest\/v1|auth|functions|storage\/v1)\//.test(url.pathname)) return;

  // Page: always fresh from network, cache only when offline
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        return (
          await cache.match(OFFLINE_PAGE) ||
          await cache.match(APP_ROOT.href) ||
          Response.error()
        );
      }
    })());
    return;
  }

  const dest = request.destination;

  // Scripts, styles, images, fonts: show cached copy instantly, refresh it in background
  if (dest === 'script' || dest === 'style' || dest === 'image' || dest === 'font') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      const refresh = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });

      if (cached) {
        event.waitUntil(refresh.catch(() => {}));
        return cached;
      }

      try {
        return await refresh;
      } catch (error) {
        return Response.error();
      }
    })());
  }
});
