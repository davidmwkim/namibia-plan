// pwa-v36-osm-step-maps.js — live OSM frames for each turn in the Directions tab.
//
// Replaces the per-step Google static map image with a small, non-interactive
// Leaflet/OSM frame showing that step's road geometry (Heather-colored), a
// start (green) + finish (red) marker, and the shared GPS blue dot + accuracy
// ring. Frames are lazily created via IntersectionObserver (a long day has ~20
// steps; we don't build maps the user never scrolls to), and zoom is capped so
// adjacent steps share tiles (and the SW cache).
(function () {
  const OSM = window.NamibiaOSM;

  // Live frames we've built: { host, map }. Pruned when their host leaves the
  // DOM (the Directions tab re-renders innerHTML on day change).
  const frames = [];

  function pruneOrphans() {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (!document.contains(f.host)) {
        if (OSM) OSM.unregisterMap(f.map);
        try { f.map.remove(); } catch (_) {}
        frames.splice(i, 1);
      }
    }
  }

  function initStepMap(host) {
    if (!host || host.dataset.osmInit) return;
    if (!OSM || !OSM.hasLeaflet()) return;
    const li = Number(host.dataset.leg);
    const si = Number(host.dataset.step);
    const status = host.dataset.status || 'no';
    const d = (typeof day === 'function') ? day() : null;
    const route = d && state.renderedRoutes?.[d.date];
    const leg = route?.legs?.[li];
    const step = leg?.steps?.[si];
    if (!step || typeof step.lat !== 'number') return;

    const a = { lat: step.lat, lng: step.lng };
    const next = leg.steps[si + 1];
    const b = next
      ? { lat: next.lat, lng: next.lng }
      : { lat: (typeof step.endLat === 'number' ? step.endLat : a.lat), lng: (typeof step.endLng === 'number' ? step.endLng : a.lng) };

    // The step's portion of the route polyline (falls back to a straight a→b).
    let slice = [];
    try { slice = window.NamibiaV12?.pathSlice(route.overviewPath || [], a, b) || []; } catch (_) {}
    if (slice.length < 2) slice = [a, b];

    host.dataset.osmInit = '1';
    const map = OSM.createMap(host, {
      center: [a.lat, a.lng], zoom: 14,
      zoomControl: false, attributionControl: false,
      scrollWheelZoom: false, dragging: false, tap: false
    });
    if (!map) { delete host.dataset.osmInit; return; }
    // Static frame — kill the remaining interaction handlers too.
    try {
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      if (map.tap) map.tap.disable();
    } catch (_) {}

    const color = (OSM.COLORS && OSM.COLORS[status]) || '#dc2626';
    // Surface (paved/gravel/sand) → dash pattern, on a different visual channel
    // from the Heather-status colour so they don't clash.
    let dash = null;
    try {
      const surf = step.surface || (window.NamibiaV22 && window.NamibiaV22.classifyRoad ? window.NamibiaV22.classifyRoad(step.instruction, d).type : null);
      dash = OSM.dashForSurface ? OSM.dashForSurface(surf) : null;
    } catch (_) {}
    try {
      const latlngs = slice.map(p => [Number(p.lat), Number(p.lng)]);
      const lineOpts = { color, weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' };
      if (dash) lineOpts.dashArray = dash;
      window.L.polyline(latlngs, lineOpts).addTo(map);
      window.L.circleMarker([a.lat, a.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1, interactive: false }).addTo(map);
      window.L.circleMarker([b.lat, b.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1, interactive: false }).addTo(map);
      const bounds = window.L.latLngBounds(latlngs);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 });
    } catch (_) {}

    OSM.registerMap(map);
    frames.push({ host, map });
  }

  let observer = null;
  function getObserver() {
    if (observer) return observer;
    if (typeof IntersectionObserver === 'undefined') return null;
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          initStepMap(e.target);
          observer.unobserve(e.target);
        }
      }
    }, { rootMargin: '200px' });
    return observer;
  }

  function observeAll() {
    if (state.activeTab !== 'directions') return;
    pruneOrphans();
    const obs = getObserver();
    const hosts = document.querySelectorAll('.step-map-osm:not([data-osm-init])');
    if (!obs) {
      // No IntersectionObserver — just init them all (rare; old engines).
      hosts.forEach(initStepMap);
      return;
    }
    hosts.forEach(h => obs.observe(h));
  }

  // Run after each render pass so freshly-built step rows get observed. v12
  // builds the .step-media lazily, so we re-scan on every render.
  if (typeof render === 'function') {
    const baseRender = render;
    render = function patchedRenderV36() {
      const r = baseRender.apply(this, arguments);
      try { setTimeout(observeAll, 0); } catch (_) {}
      return r;
    };
  }
  setTimeout(observeAll, 800);

  window.NamibiaV36 = { observeAll, initStepMap, _frames: () => frames };
})();
