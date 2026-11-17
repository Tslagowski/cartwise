// Bump VERSION on every deploy so phones pick up the new files.
const VERSION = 'cartwise-v0.9.3';
const EXPERIMENTAL_PATH = new URL('./experimental/', self.registration.scope).pathname;
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/db.js',
  './src/lib/units.js',
  './src/lib/stats.js',
  './src/lib/backup.js',
  './src/lib/notes.js',
  './src/lib/spark.js',
  './src/lib/categorize.js',
  './src/lib/migrate.js',
  './src/lib/restock.js',
  './src/lib/sizes.js',
  './src/lib/wantsort.js',
  './src/lib/linkfill.js',
  './src/scanner.js',
  './vendor/zxing.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('cartwise-v') && k !== VERSION)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, always revalidating with the server (GitHub Pages says max-age=600,
// which would otherwise let a stale copy mix with new files). Falls back to cache offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith(EXPERIMENTAL_PATH)) return;
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.open(VERSION).then(async (cache) =>
        (await cache.match(req, { ignoreSearch: true })) || cache.match('./index.html')))
  );
});
