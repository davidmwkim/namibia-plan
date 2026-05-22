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
const APP_VERSION = '1.56.1';
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
  './pwa-v30-gestures.js',
  './pwa-v30-gestures.css',
  './pwa-v31-polish.js',
  './pwa-v31-polish.css',
  './pwa-v34-osm-core.js',
  './pwa-v35-osm-overview.js',
  './pwa-v36-osm-step-maps.js',
  './pwa-v37-driving-mode.js',
  './pwa-v37-driving-mode.css',
  './pwa-v38-ui.js',
  './pwa-v38-ui.css',
  './pwa-v40-malaria.js',
  './pwa-v40-malaria.css',
  './pwa-v41-packing.js',
  './pwa-v41-packing.css',
  './pwa-v42-wildlife.js',
  './pwa-v42-wildlife.css',
  './pwa-v43-mobile.css',
  './pwa-v45-drive-deck.js',
  './pwa-v45-drive-deck.css',
  './pwa-v46-dark-mode.js',
  './pwa-v46-dark-mode.css',
  './pwa-v47-stack-layout.js',
  './pwa-v47-stack-layout.css',
  './pwa-v48-version-pin.js',
  './pwa-v48-version-pin.css',
  './pwa-v32-osm-map.js',
  './pwa-v32-osm-map.css',
  './pwa-v33-notifications.js',
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
  // Covers BOTH the web-service photo endpoint (/place/photo) and the JS SDK
  // getUrl() endpoint (/place/js/PhotoService.GetPhoto).
  'https://maps.googleapis.com/maps/api/place/',
  // Place photos resolved via getUrl() redirect to googleusercontent CDN.
  'https://lh3.googleusercontent.com/',
  'https://lh5.googleusercontent.com/',
  'https://api.open-meteo.com/v1/forecast',
  // OSM raster tiles (v32) — cache aggressively so the dashboard map keeps
  // working when offline + when Google Maps quota is exhausted.
  'https://tile.openstreetmap.org/',
  'https://a.tile.openstreetmap.org/',
  'https://b.tile.openstreetmap.org/',
  'https://c.tile.openstreetmap.org/',
  // Leaflet library + its CSS marker/control sprites (v32 renders raster tiles
  // via DOM/canvas — no WebGL required, unlike MapLibre GL 4.x).
  'https://unpkg.com/leaflet'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    // Fetch each asset with cache:'reload' so a version bump ALWAYS precaches
    // fresh files. cache.addAll() goes through the HTTP disk cache, which can
    // re-store stale JS/CSS and leave users on the old build after an update.
    // Per-asset catch so one missing file can't fail the whole install.
    await Promise.all(ASSETS.map(u =>
      fetch(new Request(u, { cache: 'reload' }))
        .then(r => (r && r.ok) ? cache.put(u, r) : null)
        .catch(() => null)
    ));
    // Precache ALL pre-generated Edge-TTS audio so spoken cues are bundled
    // offline from first install and are NEVER fetched over the network later.
    try {
      const res = await fetch('./tts-cache/manifest.json', { cache: 'no-cache' });
      if (res && res.ok) {
        const m = await res.json();
        const files = ['./tts-cache/manifest.json']
          .concat([...new Set(Object.values(m).map(v => './tts-cache/' + v.file))]);
        await Promise.allSettled(files.map(f => cache.add(f)));
      }
    } catch (_) {}
  }));
});

// v48 version-pin: clients can POST { type:'NAMIBIA_VERSION_PIN', version }
// to redirect their asset fetches to the cache for that version (or null /
// 'latest' to clear the pin). Persisted in-memory only — the client also
// stores it in localStorage and re-posts on every load, so a SW restart
// rehydrates from there.
let __namibiaPin = null;

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(APP_VERSION);
    return;
  }
  if (event.data && event.data.type === 'NAMIBIA_VERSION_PIN') {
    const v = event.data.version;
    __namibiaPin = (v && v !== 'latest' && v !== APP_VERSION) ? v : null;
    return;
  }
});

// Keep the last 3 prior namibia-trip-* caches around so the v48 version-pin
// dropdown has something to switch to. Anything beyond that is purged.
const PRIOR_CACHES_TO_KEEP = 3;
function verCmp(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const tripCaches = keys.filter(k => k.indexOf('namibia-trip-') === 0 && k !== 'namibia-trip-tts-v1' && k !== CACHE);
      // Sort by semver desc and keep the top N.
      const versions = tripCaches.map(k => k.slice('namibia-trip-'.length));
      versions.sort((a, b) => verCmp(b, a));
      const keep = new Set(versions.slice(0, PRIOR_CACHES_TO_KEEP).map(v => 'namibia-trip-' + v));
      keep.add(CACHE); keep.add('namibia-trip-tts-v1');
      return Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
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

  // Honour the v48 pin: when the client has selected a prior version, prefer
  // that cache for same-origin app assets. Fall back to the current cache (or
  // the network) if the pinned version doesn't have the file.
  event.respondWith((async () => {
    if (__namibiaPin) {
      const pinName = 'namibia-trip-' + __namibiaPin;
      try {
        const hit = await caches.match(event.request, { cacheName: pinName });
        if (hit) return hit;
      } catch (_) {}
    }
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
      return response;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
