// Service worker for the online (GitHub Pages) version: makes the installed
// app start without a network connection. The page itself is fetched
// network-first, so a new deployment is picked up whenever online.
const CACHE = 'tvc-converter-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const putInCache = (request, response) => {
  if (response && (response.ok || response.type === 'opaque')) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // The app page: network first, cached copy when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((r) => putInCache('./index.html', r))
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Google Fonts (online build) and same-origin files: cache first,
  // refreshed in the background.
  const cacheable = url.origin === self.location.origin
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request).then((r) => putInCache(request, r)).catch(() => cached);
      return cached || fresh;
    })
  );
});
