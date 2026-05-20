// tests/helpers/boot-pwa.js
// Boot the full Namibia PWA inside a JSDOM document — exactly mirroring how
// index.html loads it in a real browser — so that the patches' top-level
// `let state` survives between scripts (they share script scope).

import { JSDOM, ResourceLoader } from 'jsdom';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

// jsdom by default refuses file:// resources unless we set resources:'usable'.
// But for speed, we inline scripts directly instead of fetching them.
const ORDER = [
  'data.js',
  'lib/sun-times.js',
  'lib/driving-core.js',
  'lib/weather.js',
  'lib/places.js',
  'app.js',
  'pwa-v8-segment-patch.js',
  'pwa-v9-map-route-draw.js',
  'pwa-v10-update-offline.js',
  'pwa-v11-print-google-maps.js',
  'pwa-v12-step-rich-directions.js',
  'pwa-v13-driving-dashboard.js',
  'pwa-v14-tts-offline.js',
  'pwa-v15-demo-mode.js',
  'pwa-v16-print-extras.js',
  'pwa-v17-heather-route-coloring.js',
  'pwa-v18-arrows-and-pins.js',
  'pwa-v19-multi-color-route.js',
  'pwa-v20-layout.js',
  'pwa-v21-autoload.js',
  'pwa-v22-road-conditions.js',
  'pwa-v23-weather.js',
  'pwa-v24-optional-stops.js',
  'pwa-v25-pressure-prominence.js',
  'pwa-v26-business-enrichment.js',
  'pwa-v27-version-and-menus.js',
  'pwa-v28-quota-detect.js',
  'pwa-v29-force-update.js',
  'pwa-v30-gestures.js',
  'pwa-v31-polish.js',
  'pwa-v34-osm-core.js',
  'pwa-v32-osm-map.js',
  'pwa-v35-osm-overview.js',
  'pwa-v33-notifications.js'
];

function inlineScripts(files) {
  return files.map(f => {
    const p = join(ROOT, f);
    if (!existsSync(p)) throw new Error(`missing script: ${p}`);
    const code = readFileSync(p, 'utf8');
    // Wrap in script tag; rely on browser-script semantics where top-level `let`
    // is still scoped to the script. But because all our scripts use the same
    // shared `state` variable declared in app.js, jsdom emulates browser script
    // scope: declarations made by one <script> are NOT visible to the next
    // unless they're attached to window. The PWA actually does write to window
    // in many places, but `state` is a `let` — that means the patches need to
    // see `state`. To make this work, we patch the first occurrence of
    // `let state` in app.js to `var state; window.state = state =` so it
    // becomes a window property (and a function-hoisted var). The patches then
    // access `state` via the global lookup chain (a free identifier resolves
    // through window in script context).
    let patched = code;
    if (f === 'app.js') {
      patched = patched
        .replace(/^let state = /m, 'var state = window.state = ')
        .replace(/^const DATA = /m, 'var DATA = window.DATA = ');
    }
    return `<script>${patched}</script>`;
  }).join('\n');
}

export async function bootPwa(opts = {}) {
  opts = opts || {};
  const dom = new JSDOM(`
    <!doctype html>
    <html><head><meta charset="utf-8"></head>
    <body>
      <div id="app"></div>
      ${inlineScripts(ORDER)}
    </body></html>
  `, {
    runScripts: 'dangerously',
    url: opts.url || 'http://localhost/',
    pretendToBeVisual: true
  });
  // Block real geolocation by default — tests use __namibiaSpoofGps instead.
  const w = dom.window;
  w.navigator.geolocation = { watchPosition: () => 1, clearWatch: () => {} };
  // Provide a Google Maps stub so initGoogleMap / DirectionsService don't blow up
  // when invoked. We don't pre-load it by default — patches that need it can
  // load it explicitly with installGoogleMapsStub(w).
  if (opts.installGoogleStub !== false) {
    const { installGoogleMapsStub } = await import('./google-maps-stub.js');
    installGoogleMapsStub(w, opts.fixtureLegsByDate || {});
  }
  // Stub fetch (TTS pre-gen, image fetches) to never hit the network.
  w.fetch = async () => new w.Response(JSON.stringify({}), { status: 200 });
  return dom;
}

// Seed cached routes into localStorage BEFORE booting so the v12 enrichment
// runs against them on patch load.
export function seedRoute(dateKey, routeBlob) {
  const stash = { [dateKey]: routeBlob };
  return JSON.stringify(stash);
}

// Convenience: same as bootPwa but pre-seeds localStorage in the inner window
// after construction. NOTE: localStorage in jsdom is per-window; we set it
// post-hoc and then trigger renderTab manually.
export async function bootPwaWithRoute(dateKey, routeBlob, opts = {}) {
  const dom = await bootPwa(opts);
  const w = dom.window;
  w.localStorage.setItem('namibia_routes_cache_v5', JSON.stringify({ [dateKey]: routeBlob }));
  // Stitch the seeded blob into state.renderedRoutes that v12 already initialised.
  if (w.state && w.state.renderedRoutes) {
    w.state.renderedRoutes = { [dateKey]: routeBlob };
  }
  // Force the day index to the seeded date.
  const idx = w.DATA && w.DATA.days.findIndex(d => d.date === dateKey);
  if (idx != null && idx >= 0 && w.state) {
    w.state.dayIndex = idx;
  }
  // Recompute sunTimes for the seeded route so tests don't rely on whatever
  // pre-baked epoch values the fixture happens to carry.
  const d = w.DATA && w.DATA.days[idx];
  if (d && w.NamibiaV12 && w.NamibiaV12.computeSunTimes) {
    routeBlob.sunTimes = w.NamibiaV12.computeSunTimes(d);
  }
  return dom;
}
