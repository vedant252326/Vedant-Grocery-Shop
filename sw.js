
'use strict';

/* Vedant Grocery Shop - PWA Service Worker */

const CACHE_NAME = 'vedant-grocery-pwa-v5';
const APP_ROOT = new URL('./', self.registration.scope);

const OFFLINE_PAGE = new URL('index.html', APP_ROOT).href;

const APP_FILES = [
  APP_ROOT.href,
  OFFLINE_PAGE,
  new URL('manifest.webmanifest', APP_ROOT).href,
  new URL('app-icon-192.png', APP_ROOT).href,
  new URL('app-icon-512.png', APP_ROOT).href
];

/* INSTALL */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await cache.addAll(APP_FILES);

      await self.skipWaiting();
    })()
  );
});

/* ACTIVATE */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
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
    })()
  );
});

/* FETCH */
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Do not cache backend or authentication requests
  if (
    /\/(rest\/v1|auth|functions|storage\/v1)\//.test(url.pathname)
  ) {
    return;
  }

  // Do not cache non-HTTP requests
  if (!['http:', 'https:'].includes(url.protocol)) return;

  // Navigation: Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);

          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);

            await cache.put(OFFLINE_PAGE, response.clone());
          }

          return response;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);

          return (
            await cache.match(OFFLINE_PAGE) ||
            await cache.match(APP_ROOT.href) ||
            Response.error()
          );
        }
      })()
    );

    return;
  }

  // Static files: Cache First, then Network
  if (
    ['style', 'script', 'image', 'font'].includes(
      request.destination
    )
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);

        if (cached) return cached;

        try {
          const response = await fetch(request);

          if (response && response.ok) {
            await cache.put(request, response.clone());
          }

          return response;
        } catch (error) {
          return Response.error();
        }
      })()
    );
  }
});
