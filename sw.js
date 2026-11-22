'use strict';

// FIX: version bumped (v6 -> v7). Every time you change index.html or supabase.js,
// bump this number again so old cached files are deleted on all phones.
const CACHE_NAME = 'vedant-grocery-pwa-v7';
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

    await Promise.all(
      APP_FILES.map(async url => {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (error) {
          console.warn('Could not cache:', url);
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('vedant-grocery-pwa-') &&
          key !== CACHE_NAME
        )
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

  if (/\/(rest\/v1|auth|functions|storage\/v1)\//.test(url.pathname)) {
    return;
  }

  // Pages: network first, offline fallback (unchanged)
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

  // FIX: scripts (supabase.js etc.) and styles are NETWORK FIRST.
  // Before, they were cache-first forever, so a new index.html could run
  // together with an OLD cached supabase.js and break the app.
  if (['script', 'style'].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const response = await fetch(request, { cache: 'no-cache' });

        if (response.ok) {
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        const cached = await cache.match(request);
        return cached || Response.error();
      }
    })());

    return;
  }

  // Images and fonts: cache first (they rarely change)
  if (['image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (cached) return cached;

      try {
        const response = await fetch(request);

        if (response.ok) {
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        return Response.error();
      }
    })());
  }
});
