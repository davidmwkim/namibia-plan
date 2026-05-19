// Namibia PWA v21 — auto-load the Google JS SDK on boot if a saved API key
// exists in localStorage, so the user doesn't have to click "Save key + render
// all" on every reload. The button still works manually — clicking it forces
// a full re-fetch of all routes (handy when route data changes upstream).
//
// Key difference from clicking the button: we do NOT call renderAllDays here.
// Cached routes loaded from localStorage are already populating state, so the
// map + dashboard work immediately. The user only re-renders on demand.
(function () {
  // Strip any stray surrounding quotes from a key (an earlier dev-primer wrote
  // the .env value with embedded quotes; that yields `?key="AIza…"` which the
  // Maps API rejects as InvalidKeyMapError).
  function stripQuotes(s) {
    if (!s) return s;
    let v = String(s).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  function normaliseStoredKey() {
    const raw = localStorage.getItem('namibia_google_api_key');
    if (!raw) return;
    const fixed = stripQuotes(raw);
    if (fixed !== raw) {
      localStorage.setItem('namibia_google_api_key', fixed);
      if (typeof state !== 'undefined' && state) state.apiKey = fixed;
      if (typeof log === 'function') log('Stripped stray quotes from saved API key.');
    }
  }
  normaliseStoredKey();
  function hasApiKey() {
    return !!(state && state.apiKey && state.apiKey.length > 10 && !state.apiKey.startsWith('"'));
  }
  function alreadyLoaded() {
    return !!(window.google && window.google.maps && window.google.maps.Map);
  }
  function loadSdkOnly() {
    normaliseStoredKey();
    if (alreadyLoaded() || !hasApiKey()) return;
    if (typeof setStatus === 'function') setStatus('googleStatus', 'Google: loading…');
    // Provide the callback Google calls when it finishes loading.
    window.__namibiaInitMap = () => {
      state.googleLoaded = true;
      if (typeof setStatus === 'function') setStatus('googleStatus', 'Google: loaded');
      if (typeof initGoogleMap === 'function') initGoogleMap();
      if (typeof render === 'function') render();
      // If ANY self-drive day is missing a cached overviewPath, auto-run
      // renderAllDays so the user doesn't have to click "Save key + render
      // all" every time the app first boots after install / cache reset.
      try { maybeAutoRenderRoutes(); } catch (_) {}
    };
    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(state.apiKey) + '&libraries=places&callback=__namibiaInitMap';
    script.async = true; script.defer = true;
    script.onerror = () => {
      if (typeof setStatus === 'function') setStatus('googleStatus', 'Google: failed');
      if (typeof log === 'function') log('Google script failed on auto-load. Click "Save key + render all" to retry.');
    };
    document.head.appendChild(script);
  }

  // Run after DOM is ready and patches have wired up.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSdkOnly);
  } else {
    // Defer one tick so prior patches finish initialising globals.
    setTimeout(loadSdkOnly, 0);
  }

  // If we have a key + SDK but the route cache is missing days, auto-fetch.
  // Otherwise the user has to click "Save key + render all" on every fresh
  // install. Cached routes (from a previous successful render) are reused
  // verbatim — we never re-fetch unnecessarily.
  function maybeAutoRenderRoutes() {
    if (typeof state === 'undefined' || !state) return;
    if (!state.directionsService) return;
    const data = window.NAMIBIA_TRIP_DATA;
    if (!data) return;
    const needed = data.days.filter(d => d.selfDrive && (d.stops || []).filter(s => s.routeRole === 'mandatory').length >= 2);
    const missing = needed.filter(d => !(state.renderedRoutes?.[d.date]?.overviewPath?.length >= 2));
    if (!missing.length) return;
    if (typeof log === 'function') log(`Auto-rendering ${missing.length} missing route(s) on first boot…`);
    if (typeof renderAllDays === 'function') {
      // renderAllDays returns a promise; we don't await so SDK init doesn't block.
      renderAllDays().catch(err => {
        if (typeof log === 'function') log('Auto-render failed: ' + (err?.message || err));
      });
    }
  }

  window.NamibiaAutoLoad = { loadSdkOnly, maybeAutoRenderRoutes };
})();
