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

// Install — statik dosyaları önbelleğe al
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — eski cache'leri temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — strateji: API network-first, statik cache-first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API çağrıları — her zaman ağdan çek (balık verileri güncel olmalı)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Başarılı yanıtı cache'e de yaz (offline fallback)
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // Ağ başarısızsa cache'den dene
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Harici API'ler (Open-Meteo, EMODnet, tile sunucuları) — cache'leme
  if (url.origin !== self.location.origin) {
    // Harita tile'ları — cache-first (değişmezler)
    if (url.hostname.includes('tile') || url.hostname.includes('openstreetmap')) {
      event.respondWith(
        caches.match(event.request).then((cached) => {
          return cached || fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          });
        })
      );
      return;
    }
    // Diğer harici çağrılar — network-only
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Statik dosyalar — cache-first, yoksa network'ten çek
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Cache'de var ama arka planda güncelle (stale-while-revalidate)
        fetch(event.request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
