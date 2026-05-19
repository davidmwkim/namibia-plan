Namibia Self-Drive Companion v5

WHAT THIS IS
- Single-page PWA: index.html only.
- No separate pdf.html. PDF/print mode is inside index.html.
- Designed for GitHub Pages HTTPS hosting.
- Stores Google API key locally in browser localStorage.
- Can prerender Google Directions for all days once online, cache route steps in localStorage, and export KML/ZIP.
- Street View images are shown in-page after Google Directions are rendered.
- Includes mandatory tyre-pressure action points and conservative fuel-level estimates.

DEPLOY TO GITHUB PAGES
1. Create a public repo, e.g. namibia-trip-pwa.
2. Copy all files in this folder to repo root.
3. Include .nojekyll.
4. Settings -> Pages -> Deploy from branch -> main/root.
5. In Google Cloud API key restrictions, allow:
   https://YOUR_USERNAME.github.io/*
6. Enable Maps JavaScript API, Directions API (Legacy), Street View Static API, and Maps Static API.

ON PHONE
1. Open the GitHub Pages URL while online.
2. Enter Google API key.
3. Tap "Save key + render all".
4. Tap "Prepare everything for offline".
5. Add to Home Screen.
6. Test in airplane mode before travel.

WHAT THE OFFLINE BUTTON DOES
- Loads Google Maps if needed.
- Prerenders Google Directions for routable days.
- Saves route geometry and directions into localStorage.
- Caches the app shell into Cache Storage.
- Attempts to cache Street View images into Cache Storage.
- Shows progress and a final summary of routes/assets/images cached.

LIMITATIONS
- A PWA cannot guarantee indefinite caching of every Google Street View image; test before departure.
- Google Directions, Street View, and Static Maps calls require internet and API permissions before caching/printing.
- Fuel estimates are planning estimates only; vehicle, load, roads, wind, tyre pressure, and driving style materially affect consumption.

V10 UPDATE
- Adds a non-blocking "New version available" prompt when a new service worker is waiting.
- The Update button sends SKIP_WAITING to the waiting service worker and reloads after controllerchange.
- Removes automatic install-time skipWaiting so users are not force-reloaded mid-use.
- Adds visible feedback for "Prepare everything for offline": route prerendering, app-shell caching, Street View snapshot caching, and final summary.

V11 UPDATE
- Makes the embedded live map larger in the PWA.
- Adds PDF/print maps using Google Static Maps with the route path and numbered mandatory-stop pins.
- Adds turn-by-turn directions into the PDF/print pages when cached Google Directions are available.
- Falls back to mandatory-stop order in the PDF if route directions have not been rendered yet.
- Service worker cache is bumped to namibia-trip-v11 and includes the update/offline and print-map patch assets.
