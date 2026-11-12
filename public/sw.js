/**
 * Service Worker • Cesena Linea 6 Live PWA
 * Versione v2: esclude tile cartografiche esterne per evitare blocchi o vecchie cache
 */

const CACHE_NAME = 'cesena-linea6-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
  '/robots.txt',
  '/sitemap.xml',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install: pre-cache dell'app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW v2] Pre-caching asset statici...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: pulizia immediata di TUTTE le vecchie versioni di cache (inclusa v1 con vecchie tile carto)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW v2] Rimozione e svuotamento vecchia cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: applicazione strategie differenziate
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Escludi completamente le richieste a tile server di mappe dalla cache del Service Worker
  // (openstreetmap, carto, arcgisonline/esri, ecc.) così non rimangono mai bloccate
  const isMapTile =
    url.hostname.includes('openstreetmap') ||
    url.hostname.includes('cartocdn') ||
    url.hostname.includes('carto.com') ||
    url.hostname.includes('arcgisonline') ||
    url.hostname.includes('esri');

  if (isMapTile) {
    // Lascia che il browser effettui la richiesta HTTP diretta senza intercettazione
    return;
  }

  // 1. Chiamate dinamiche Realtime (posizioni bus e arrivi fermata): Network-First
  if (url.pathname.startsWith('/api/linea6/live') || url.pathname.startsWith('/api/linea6/arrivals/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          console.log('[SW v2] Network offline: fallback su cache per', url.pathname);
          return caches.match(request);
        })
    );
    return;
  }

  // 2. Chiamate dati statici e asset UI: Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      });
    })
  );
});
