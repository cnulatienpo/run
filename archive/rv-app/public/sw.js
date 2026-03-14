const CACHE = 'rv-cache-v2';
const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './build/main.js',
  './manifest.webmanifest'
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_ASSETS))
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.url.includes('/api/')) return fetch(event.request);
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
