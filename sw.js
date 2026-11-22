'use strict';

const CACHE_NAME = 'vedant-grocery-pwa-v10';
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
        if (response.ok && !response.redirected) await cache.put(url, response);
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

  /* Page: open instantly from the phone's cache, refresh it quietly in the background */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(OFFLINE_PAGE);

      const update = fetch(OFFLINE_PAGE, { cache: 'no-cache' }).then(response => {
        if (response.ok && !response.redirected) cache.put(OFFLINE_PAGE, response.clone());
        return response;
      });

      if (cached) {
        event.waitUntil(update.catch(() => {}));
        return cached;
      }

      try {
        return await update;
      } catch (error) {
        return (await cache.match(APP_ROOT.href)) || Response.error();
      }
    })());
    return;
  }

  /* Scripts, CSS, images, fonts: show cached copy first, refresh in the background */
  const dest = request.destination;
  if (['script', 'style', 'image', 'font'].includes(dest)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      const update = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });

      if (cached) {
        event.waitUntil(update.catch(() => {}));
        return cached;
      }

      try {
        return await update;
      } catch (error) {
        return Response.error();
      }
    })());
  }
});
