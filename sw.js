'use strict';

/* Vedant Grocery Shop - service worker
   Jab bhi index.html ya supabase.js badlo, sirf neeche VERSION badal do (v15 -> v16 ...). */
const VERSION = 'v15';
const PREFIX = 'vedant-grocery-pwa-';
const CACHE = PREFIX + VERSION;

const ROOT = new URL('./', self.registration.scope);
const INDEX = new URL('index.html', ROOT).href;
const PRECACHE = [
  INDEX,
  new URL('supabase.js', ROOT).href,
  new URL('manifest.webmanifest', ROOT).href,
  new URL('logo.png', ROOT).href
];

const API_RE = /\/(rest\/v1|auth|functions|storage\/v1|realtime)\//;
const SCRIPT_WAIT_MS = 3500;   /* script/CSS: network ko itna time, phir cache */
const MAX_ENTRIES = 200;       /* cache kabhi bahut bada na ho */

const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Vedant Grocery Shop</title>' +
  '<body style="font-family:sans-serif;text-align:center;padding:48px 20px;background:#fff8e1;color:#222">' +
  '<h2>इंटरनेट नहीं मिला</h2><p>इंटरनेट चालू करके पेज दोबारा खोलें।</p>' +
  '<button onclick="location.reload()" style="padding:12px 26px;border:0;border-radius:10px;background:#0c831f;color:#fff;font-size:16px">दोबारा कोशिश करें</button></body>';

/* ---------- helpers ---------- */
function isGoodStatic(res) {
  return !!res && res.status === 200 && res.type === 'basic';
}

function isGoodPage(res) {
  if (!res || res.status !== 200 || res.redirected) return false;
  return (res.headers.get('content-type') || '').toLowerCase().indexOf('text/html') !== -1;
}

async function safePut(cache, request, response) {
  try { await cache.put(request, response); } catch (e) { /* quota etc. - ignore */ }
}

async function trim(cache) {
  try {
    const keys = await cache.keys();
    const extra = keys.length - MAX_ENTRIES;
    if (extra <= 0) return;
    let removed = 0;
    for (const req of keys) {
      if (removed >= extra) break;
      if (PRECACHE.indexOf(req.url) !== -1) continue;
      await cache.delete(req);
      removed++;
    }
  } catch (e) { /* ignore */ }
}

async function matchAny(cache, request) {
  return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
}

/* ---------- install / activate ---------- */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.status === 200 && !res.redirected) await safePut(cache, url, res);
      } catch (e) { /* file na mile ya net na ho - koi baat nahi */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.indexOf(PREFIX) === 0 && k !== CACHE).map(k => caches.delete(k))
    );
    try { if (self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch (e) {}
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- page: cache se turant, peeche se naya ---------- */
async function handlePage(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(INDEX);

  const refresh = (async () => {
    try {
      let res = null;
      try { res = await event.preloadResponse; } catch (e) { res = null; }
      if (!isGoodPage(res)) res = await fetch(INDEX, { cache: 'no-cache' });
      if (isGoodPage(res)) {
        await safePut(cache, INDEX, res.clone());
        return res;
      }
    } catch (e) { /* offline */ }
    return null;
  })();

  event.waitUntil(refresh);

  if (cached) return cached;

  const fresh = await refresh;
  if (fresh) return fresh;

  try {
    const res = await fetch(event.request);
    if (res && !res.redirected) return res;
  } catch (e) { /* offline */ }

  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/* ---------- script / CSS: pehle network (3.5s), phir cache ---------- */
async function handleNetworkFirst(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const cached = await matchAny(cache, request);

  const net = fetch(request).then(async res => {
    if (isGoodStatic(res)) {
      await safePut(cache, request, res.clone());
      trim(cache);
    }
    return res;
  });
  net.catch(() => {});

  if (!cached) {
    try { return await net; } catch (e) { return Response.error(); }
  }

  event.waitUntil(net.catch(() => {}));
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), SCRIPT_WAIT_MS));
  try {
    const res = await Promise.race([net.catch(() => null), timeout]);
    if (res && res.ok) return res;
  } catch (e) { /* use cache */ }
  return cached;
}

/* ---------- image / font / manifest: cache se turant, peeche se naya ---------- */
async function handleStaleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const cached = await matchAny(cache, request);

  const net = fetch(request).then(async res => {
    if (isGoodStatic(res)) {
      await safePut(cache, request, res.clone());
      trim(cache);
    }
    return res;
  });
  net.catch(() => {});

  if (cached) {
    event.waitUntil(net.catch(() => {}));
    return cached;
  }
  try { return await net; } catch (e) { return Response.error(); }
}

/* ---------- fetch ---------- */
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (API_RE.test(url.pathname)) return;
  if (url.pathname === new URL('sw.js', ROOT).pathname) return;
  if (url.searchParams.has('nocache')) return;

  if (request.mode === 'navigate') {
    const p = url.pathname;
    if (p === ROOT.pathname || p === ROOT.pathname + 'index.html') {
      event.respondWith(handlePage(event));
    }
    return;
  }

  const dest = request.destination;
  if (dest === 'script' || dest === 'style') {
    event.respondWith(handleNetworkFirst(event));
  } else if (dest === 'image' || dest === 'font' || dest === 'manifest') {
    event.respondWith(handleStaleWhileRevalidate(event));
  }
});
