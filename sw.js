const CACHE = 'namibia-trip-v19';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './pwa-v8-segment-patch.css',
  './pwa-v10-update-offline.css',
  './pwa-v11-print-google-maps.css',
  './pwa-v12-step-rich-directions.css',
  './pwa-v13-driving-dashboard.css',
  './pwa-v14-tts-offline.css',
  './pwa-v15-demo-mode.css',
  './pwa-v16-print-extras.css',
  './pwa-v17-heather-route-coloring.css',
  './app.js',
  './pwa-v8-segment-patch.js',
  './pwa-v9-map-route-draw.js',
  './pwa-v10-update-offline.js',
  './pwa-v11-print-google-maps.js',
  './pwa-v12-step-rich-directions.js',
  './pwa-v13-driving-dashboard.js',
  './pwa-v14-tts-offline.js',
  './pwa-v15-demo-mode.js',
  './pwa-v16-print-extras.js',
  './pwa-v17-heather-route-coloring.js',
  './pwa-v18-arrows-and-pins.js',
  './pwa-v19-multi-color-route.js',
  './pwa-v20-layout.js',
  './pwa-v21-autoload.js',
  './lib/sun-times.js',
  './lib/driving-core.js',
  './data.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

// Cross-origin URL prefixes whose responses we cache (cache-first). Static images
// only: TTS audio is stored in a separate cache by v14, and we don't intercept
// `tts://` URLs since they're not real network.
const CROSS_ORIGIN_CACHE_PREFIXES = [
  'https://maps.googleapis.com/maps/api/staticmap',
  'https://maps.googleapis.com/maps/api/streetview'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE && key !== 'namibia-trip-tts-v1').map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.origin !== location.origin) {
    const matchesPrefix = CROSS_ORIGIN_CACHE_PREFIXES.some(p => event.request.url.startsWith(p));
    if (!matchesPrefix) return;
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Opaque responses (mode: no-cors) are fine for <img>.
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
