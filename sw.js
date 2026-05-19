// Bump this version string ANY time a file in ASSETS changes. The activate
// handler purges every cache whose name doesn't match, forcing browsers to
// re-fetch the new files. Users currently on an older cache get the v10
// "New version available" toast prompting reload.
// Semantic-ish version: major.minor.patch.
//   major: app-architecture change
//   minor: new patch file added (v15, v16, ...)
//   patch: bug fix / CSS tweak / data change
// Bump this any time files in ASSETS change — the activate handler purges
// stale caches keyed by name so the next reload fetches fresh files.
const APP_VERSION = '1.17.0';
const CACHE = 'namibia-trip-' + APP_VERSION;
self.NAMIBIA_APP_VERSION = APP_VERSION;
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
  './pwa-v22-road-conditions.css',
  './pwa-v23-weather.css',
  './pwa-v24-optional-stops.css',
  './pwa-v25-pressure-prominence.css',
  './pwa-v26-business-enrichment.css',
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
  './pwa-v22-road-conditions.js',
  './pwa-v23-weather.js',
  './pwa-v24-optional-stops.js',
  './pwa-v25-pressure-prominence.js',
  './pwa-v26-business-enrichment.js',
  './pwa-v27-version-and-menus.js',
  './pwa-v28-quota-detect.js',
  './pwa-v29-force-update.js',
  './lib/sun-times.js',
  './lib/driving-core.js',
  './lib/weather.js',
  './lib/places.js',
  './data.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

// Cross-origin URL prefixes whose responses we cache (cache-first). Static images
// only: TTS audio is stored in a separate cache by v14, and we don't intercept
// `tts://` URLs since they're not real network.
const CROSS_ORIGIN_CACHE_PREFIXES = [
  'https://maps.googleapis.com/maps/api/staticmap',
  'https://maps.googleapis.com/maps/api/streetview',
  'https://maps.googleapis.com/maps/api/place/photo',
  'https://api.open-meteo.com/v1/forecast'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(APP_VERSION);
    return;
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
