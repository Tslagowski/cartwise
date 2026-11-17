const PREFIX = 'cartwise-wardrobe-preview-';
const CACHE = PREFIX + '1';
const SHELL = [
  './', './index.html', './style.css', './app.js', './model.js', './storage.js', './photo.js',
  './manifest.webmanifest', '../../icons/apple-touch-icon.png', '../../icons/icon-192.png', '../../icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate' && url.href.startsWith(self.registration.scope)) {
      return (await cache.match('./')) || fetch(request);
    }
    return fetch(request);
  }));
});
