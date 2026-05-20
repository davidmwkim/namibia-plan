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
      scrollWheelZoom: false, dragging: false, tap: false,
      zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false
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
    // Surface on a thin white overlay (dash/dot) ON TOP of the solid coloured
    // line, so the Heather colour is never obscured — matching every other map.
    let surf = null;
    try { surf = step.surface || (window.NamibiaV22 && window.NamibiaV22.classifyRoad ? window.NamibiaV22.classifyRoad(step.instruction, d).type : null); } catch (_) {}
    try {
      const latlngs = slice.map(p => [Number(p.lat), Number(p.lng)]);
      window.L.polyline(latlngs, { color, weight: 9, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
      if (OSM.addSurfaceOverlay) OSM.addSurfaceOverlay(map, latlngs, surf);
      window.L.circleMarker([a.lat, a.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1, interactive: false }).addTo(map);
      window.L.circleMarker([b.lat, b.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1, interactive: false }).addTo(map);
      const bounds = window.L.latLngBounds(latlngs);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 });
    } catch (_) {}

    OSM.registerMap(map);
    frames.push({ host, map });
  }

  // Init step maps within ~400px of the viewport (instant response to scroll).
  function observeAll() {
    if (state.activeTab !== 'directions') return;
    pruneOrphans();
    const vh = window.innerHeight || 800;
    document.querySelectorAll('.step-map-osm:not([data-osm-init])').forEach(h => {
      const r = h.getBoundingClientRect();
      if (r.top < vh + 400 && r.bottom > -400) initStepMap(h);
    });
  }
  let scheduled = false;
  function onScroll() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; try { observeAll(); } catch (_) {} });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // GUARANTEE: a steady interval inits the uninitialised step map nearest the
  // viewport, one at a time, while the Directions tab is open. The previous
  // IntersectionObserver/scroll-only approach left most maps as blank "blue
  // rectangles" when it didn't fire; this fills every map in regardless, while
  // staying gentle on the OSM tile server (~3 maps/sec).
  function initNearestUninit() {
    if (typeof state === 'undefined' || !state || state.activeTab !== 'directions') return;
    pruneOrphans();
    const hosts = Array.from(document.querySelectorAll('.step-map-osm:not([data-osm-init])'));
    if (!hosts.length) return;
    const mid = (window.innerHeight || 800) / 2;
    hosts.sort((a, b) => Math.abs(a.getBoundingClientRect().top - mid) - Math.abs(b.getBoundingClientRect().top - mid));
    initStepMap(hosts[0]);
  }
  setInterval(() => { try { initNearestUninit(); } catch (_) {} }, 300);
  setTimeout(observeAll, 800);

  window.NamibiaV36 = { observeAll, initStepMap, _frames: () => frames };
})();
