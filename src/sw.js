const CACHE_NAME = 'ritten-app-v0-1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Fetch: Bepaal of we de cache of het netwerk gebruiken
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // BELANGRIJK: API calls en SSE streams NOOIT cachen.
  // Ga direct naar het netwerk voor alles wat met /api/ begint.
  if (url.pathname.startsWith('/api/')) {
    return; // Standaard netwerk gedrag, geen service worker inmenging
  }

  // Voor de rest (HTML, CSS, Images): Kijk eerst in cache, anders netwerk
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// 3. Activate: Oude caches opruimen bij updates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
});