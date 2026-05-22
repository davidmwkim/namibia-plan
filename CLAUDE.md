# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Offline-first single-page PWA companion for a self-drive Namibia road trip (May 23 – June 4, 2026). Hosted on GitHub Pages as static files — no build step, no bundler, no framework. All code is vanilla JS loaded via `<script>` tags from `index.html`, and the service worker (`sw.js`) caches the app shell + Google Directions/Street View/Static Maps responses for offline use.

## Commands

```bash
# Unit / integration / golden / contract / api / smoke (vitest, jsdom env)
npm test                        # all vitest suites
npm run test:unit               # tests/unit
npm run test:integration        # tests/integration
npm run test:golden             # tests/golden (uses __snapshots__)
npx vitest run path/to.test.js  # single file
npx vitest -t "name fragment"   # single test by name

# E2E (Playwright — auto-spins http-server on $NAMIBIA_E2E_PORT, default 8765)
npm run e2e                     # tests/e2e + tests/ui (desktop + mobile projects)
npm run e2e:ui                  # interactive
npx playwright test tests/ui/dashboard.spec.js --project=mobile

# Local dev server (matches what GitHub Pages serves)
npm run serve                   # http-server on :8080, no caching
```

There is no lint or typecheck step. There is no build — files are served as-is.

## Architecture

### The "pwa-vN-*" patch layering

`app.js` is the original app. Every feature added after v8 lives in its own `pwa-v{N}-{name}.js` (+ optional matching `.css`) file, loaded in numeric order from `index.html`. Each patch monkey-patches the running app — it hooks `DOMContentLoaded`, wraps existing functions (e.g. `const orig = window.renderDay; window.renderDay = (...)=>{ orig(...); newStuff(); }`), or attaches behavior to elements that earlier patches rendered. **Load order in `index.html` is load-bearing.** When adding a feature, prefer a new `pwa-vN-*.js` file over editing `app.js` or earlier patches, and add it to both `index.html` and the `ASSETS` array in `sw.js`.

Current head is v46 (dark mode). See `sw.js` line ~11 — `APP_VERSION` is the cache key. **Any change to a file listed in `ASSETS` requires bumping `APP_VERSION`**, otherwise users on the old cache won't see the change. The v10 patch surfaces a "New version available" toast when a new SW is waiting.

### Pure libs (`/lib`)

`lib/driving-core.js`, `lib/sun-times.js`, `lib/places.js`, `lib/weather.js` are the testable, side-effect-free modules. They attach to `window.*` for the browser and use `module.exports` for vitest (jsdom). Unit tests live next to them in `tests/unit/`. When adding logic that needs testing, put it in `/lib`, not in a `pwa-vN-*.js` patch.

### Data

`data.js` defines `window.NAMIBIA_TRIP_DATA` — the trip's days, stops, lodges, malaria/wildlife metadata. It's the single source of truth for itinerary content. `scripts/` contains one-shot Node scripts that have been used to mutate `data.js` (accuracy audit, business enrichment, stop classification) and `generate-tts.py` for the offline TTS audio cache.

### State & persistence

Runtime state is a single `state` object in `app.js`. Persistent state lives in `localStorage` under `namibia_*` keys (API key, cached Directions responses, theme, etc.). The SW additionally maintains a Cache Storage entry named `namibia-trip-<APP_VERSION>`.

### Google Maps integration

The user supplies a Google Maps JS API key at runtime (stored in `localStorage`). "Prepare everything for offline" prerenders Directions for every routable day, caches geometry + step text into localStorage, and snapshots Street View + Static Maps tiles into Cache Storage. There is also a Leaflet/OSM-based map (v32–v36) used when Google isn't available or for the passenger/driving deck (v37, v45).

### Tests

- **vitest** runs under jsdom. `tests/helpers/boot-pwa.js` and `google-maps-stub.js` are the shared harness for booting the page and stubbing the Google Maps SDK.
- **playwright** (`playwright.config.js`) runs with `serviceWorkers: 'block'` and `timezoneId: 'Africa/Windhoek'` — keep that timezone assumption in mind when writing time-sensitive UI tests. Desktop + Pixel 5 projects; mobile only runs `tests/ui/**`.

## Conventions

- Don't introduce a bundler, transpiler, or framework — the deploy target is GitHub Pages serving raw files.
- Bump `APP_VERSION` in `sw.js` and add new asset paths to the `ASSETS` array whenever you touch a cached file. The recent commit history (`v1.53.0`, `v1.52.5`, …) tracks this.
- Patches should be additive and defensive — they run after `app.js` and must not assume DOM structure that earlier patches haven't created yet (use `DOMContentLoaded` or hook into existing render functions).
