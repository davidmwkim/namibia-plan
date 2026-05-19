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
6. Enable Maps JavaScript API, Directions API (Legacy), and Street View Static API.

ON PHONE
1. Open the GitHub Pages URL while online.
2. Enter Google API key.
3. Tap "Save key + render all".
4. Tap "Prepare everything for offline".
5. Add to Home Screen.
6. Test in airplane mode before travel.

LIMITATIONS
- A PWA cannot guarantee indefinite caching of every Google Street View image; test before departure.
- Google Directions and Street View calls require internet and API permissions before caching.
- Fuel estimates are planning estimates only; vehicle, load, roads, wind, tyre pressure, and driving style materially affect consumption.
