// MERALOJİ F.I.S.H. Service Worker v3.0
const CACHE_NAME = 'meraloji-v3.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API — network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // External — passthrough
  if (url.origin !== self.location.origin) {
    if (url.hostname.includes('tile') || url.hostname.includes('openstreetmap')) {
      event.respondWith(
        caches.match(event.request).then(cached =>
          cached || fetch(event.request).then(res => {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
            return res;
          })
        )
      );
      return;
    }
    event.respondWith(fetch(event.request));
    return;
  }

  // Static — stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        fetch(event.request).then(res =>
          caches.open(CACHE_NAME).then(c => c.put(event.request, res))
        ).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(res => {
        caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        return res;
      });
    })
  );
});
