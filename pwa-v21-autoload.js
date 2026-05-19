// Namibia PWA v21 — auto-load the Google JS SDK on boot if a saved API key
// exists in localStorage, so the user doesn't have to click "Save key + render
// all" on every reload. The button still works manually — clicking it forces
// a full re-fetch of all routes (handy when route data changes upstream).
//
// Key difference from clicking the button: we do NOT call renderAllDays here.
// Cached routes loaded from localStorage are already populating state, so the
// map + dashboard work immediately. The user only re-renders on demand.
(function () {
  function hasApiKey() {
    return !!(state && state.apiKey && state.apiKey.length > 10);
  }
  function alreadyLoaded() {
    return !!(window.google && window.google.maps && window.google.maps.Map);
  }
  function loadSdkOnly() {
    if (alreadyLoaded() || !hasApiKey()) return;
    if (typeof setStatus === 'function') setStatus('googleStatus', 'Google: loading…');
    // Provide the callback Google calls when it finishes loading.
    window.__namibiaInitMap = () => {
      state.googleLoaded = true;
      if (typeof setStatus === 'function') setStatus('googleStatus', 'Google: loaded');
      if (typeof initGoogleMap === 'function') initGoogleMap();
      if (typeof render === 'function') render();
    };
    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(state.apiKey) + '&callback=__namibiaInitMap';
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

  window.NamibiaAutoLoad = { loadSdkOnly };
})();
