/**
 * Service Worker para GeoLive Monitor (PWA - Progressive Web App)
 * Garantiza funcionamiento offline y carga instantánea de la interfaz de monitoreo
 */

const CACHE_NAME = 'geolive-admin-pwa-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/map-monitor.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // No interceptar peticiones de Firebase Firestore o Google Maps API
  if (
    requestUrl.origin.includes('firestore.googleapis.com') ||
    requestUrl.origin.includes('firebaseio.com') ||
    requestUrl.origin.includes('google.com') ||
    requestUrl.origin.includes('googleapis.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

