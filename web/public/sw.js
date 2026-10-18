// OpenBay service worker: keeps the app and everything you've looked at usable
// with no connection, for shops with bad Wi-Fi.
//   app shell and hashed assets  cache first (filenames change when they change)
//   /api GETs                    network first, fall back to the last copy seen
//   /media photos, fonts         cache first
// Answers served from the cache carry an "X-OpenBay-Offline: 1" header.
const VERSION = 'v1';
const SHELL = `openbay-shell-${VERSION}`;
const DATA = 'openbay-data';
const MEDIA = 'openbay-media';
const MAX_DATA = 1500;
const NETWORK_TIMEOUT = 6000;

// The page and the hashed bundles it names; the first visit loads them before the
// worker is in control, so they're fetched here rather than waiting to be seen.
async function cacheShell(html) {
  const cache = await caches.open(SHELL);
  const res = html || (await fetch('/', { cache: 'no-cache' }));
  const text = await res.clone().text();
  const assets = [...new Set([...text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
  await cache.put('/', res);
  await cache.addAll([...assets, '/manifest.webmanifest', '/icon-192.png']);
}

self.addEventListener('install', (e) => {
  e.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('openbay-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const offlineCopy = async (res) => {
  const headers = new Headers(res.headers);
  headers.set('X-OpenBay-Offline', '1');
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
};

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DATA))) await cache.delete(k);
}

async function networkFirst(req) {
  const cache = await caches.open(DATA);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, no) => setTimeout(() => no(new Error('timeout')), NETWORK_TIMEOUT)),
    ]);
    if (res.ok) { await cache.put(req, res.clone()); trim(cache); }
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return offlineCopy(hit);
    return new Response(JSON.stringify({ error: 'Offline, and not saved on this device yet' }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'X-OpenBay-Offline': '1' },
    });
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok) cacheShell(res.clone()).catch(() => {});
    return res;
  } catch {
    return (await caches.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return e.respondWith(networkFirst(req));
    if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(req, SHELL));
    if (url.pathname.startsWith('/media/')) return e.respondWith(cacheFirst(req, MEDIA));
    if (req.mode === 'navigate') return e.respondWith(page(req));
    if (url.pathname !== '/sw.js') e.respondWith(fetch(req).catch(async () => (await caches.match(req)) || Response.error()));
    return;
  }
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req, MEDIA));
});
