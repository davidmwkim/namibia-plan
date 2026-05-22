// pwa-v32-osm-map.js — OpenStreetMap base map for the Driving Dashboard.
//
// Uses LEAFLET (not MapLibre GL): Leaflet renders raster tiles via DOM/canvas
// with NO WebGL requirement, so it works on every device — including ones
// without WebGL2 (MapLibre GL 4.x requires WebGL2, which many Android GPUs +
// remote/headless Chrome contexts don't expose).
//
// Benefits over the Google dashboard map:
//   - No daily quota (OSM tiles are free; SW caches them)
//   - Keeps working after Google Maps Platform hits OverQuotaMapError
//   - Heather-segment-colored route polylines drawn directly
//
// v13 calls window.NamibiaOsmMap.takeOver() / .update() and bails out of its
// Google flow when this module reports ready (see ensureDriveMap +
// updateDriveMap in pwa-v13).
(function () {
  let lMap = null;
  let routeLayers = [];
  let ready = false;
  let boundHost = null;
  let lastDrawnDayKey = null;
  let lastRouteBounds = null;
  let routeDotMarker = null;
  let legPinLayers = [];

  function hasLeaflet() { return typeof window.L !== 'undefined'; }

  function initMap() {
    if (!hasLeaflet()) return null;
    const host = document.getElementById('driveMapHost');
    if (!host) return null;
    // Reuse the map if it's bound to the CURRENT, still-attached host.
    if (lMap && boundHost === host && document.contains(host)) return lMap;
    // Otherwise v13 rebuilt the dashboard and replaced the host div — tear
    // down the orphan and rebuild on the new element.
    if (lMap) {
      if (window.NamibiaOSM) window.NamibiaOSM.unregisterMap(lMap);
      try { lMap.remove(); } catch (_) {}
      lMap = null; routeLayers = []; ready = false; lastDrawnDayKey = null;
    }
    boundHost = host;
    try {
      // Build via the shared OSM core when available so the map joins the
      // shared GPS layer (blue dot + accuracy ring) used by every map.
      const OSM = window.NamibiaOSM;
      lMap = OSM
        ? OSM.createMap(host, { center: [-22.5, 17.0], zoom: 6 })
        : (function () {
            host.innerHTML = '';
            const m = window.L.map(host, { scrollWheelZoom: true }).setView([-22.5, 17.0], 6);
            window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19, attribution: '&copy; OpenStreetMap contributors', crossOrigin: true
            }).addTo(m);
            return m;
          })();
      ready = true;
      if (OSM) OSM.registerMap(lMap);
      if (OSM && OSM.addHomeControl) OSM.addHomeControl(lMap, () => {
        if (lastRouteBounds && lastRouteBounds.isValid()) { try { lMap.fitBounds(lastRouteBounds, { padding: [30, 30] }); } catch (_) {} }
        else if (state.gps) { try { lMap.setView([Number(state.gps.lat), Number(state.gps.lng)], 14); } catch (_) {} }
      });
      drawRouteForCurrentDay();
      if (OSM) OSM.updateAllGps();
    } catch (e) {
      if (typeof log === 'function') log('OSM (Leaflet) init failed: ' + (e?.message || e));
      lMap = null; ready = false;
    }
    return lMap;
  }

  function clearRouteLayers() {
    routeLayers.forEach(l => { try { lMap.removeLayer(l); } catch (_) {} });
    routeLayers = [];
  }

  function drawRouteForCurrentDay() {
    if (!lMap || !ready) return;
    const d = window.day && window.day();
    if (!d) return;
    const route = state.renderedRoutes?.[d.date];
    if (!route?.overviewPath || route.overviewPath.length < 2) {
      clearRouteLayers();
      lastDrawnDayKey = null;
      return;
    }
    const key = d.date + ':' + route.overviewPath.length;
    if (key === lastDrawnDayKey) return;
    lastDrawnDayKey = key;
    clearRouteLayers();

    // Draw via the shared core so the dashboard map gets the SAME Heather
    // colouring + surface (dash/dot) overlay as every other map.
    const OSM = window.NamibiaOSM;
    let b = null;
    if (OSM && OSM.drawColoredRoute) {
      b = OSM.drawColoredRoute(lMap, route.overviewPath, d, routeLayers);
    } else {
      const latlngs = route.overviewPath.map(p => [Number(p.lat), Number(p.lng)]);
      try { routeLayers.push(window.L.polyline(latlngs, { color: '#dc2626', weight: 5, opacity: 0.95 }).addTo(lMap)); } catch (_) {}
      try { b = window.L.latLngBounds(latlngs); } catch (_) {}
    }
    // Fit bounds to the whole route on first draw for this day.
    try {
      if (b && b.isValid()) { lastRouteBounds = b; lMap.fitBounds(b, { padding: [30, 30] }); }
    } catch (_) {}
  }

  // The dashboard map recenters on the live GPS position (full-screen driving
  // view), unlike the overview/per-step maps which stay framed on the route.
  function recenterOnGps() {
    if (!lMap || !ready || !state.gps) return;
    // Instant — an animated pan never settles at the demo's tick rate (blank
    // tiles + drift). Frequent small instant recenters read as smooth.
    try { lMap.panTo([Number(state.gps.lat), Number(state.gps.lng)], { animate: false }); } catch (_) {}
  }

  // ---- Public hooks called from v13 ----
  function takeOver() {
    if (!hasLeaflet()) return null;   // fall back to Google if Leaflet missing
    return initMap();
  }
  function update() {
    if (!hasLeaflet()) return false;
    initMap();
    if (!ready) return false;
    drawRouteForCurrentDay();
    if (window.NamibiaOSM) window.NamibiaOSM.updateAllGps();
    recenterOnGps();
    return true;
  }
  function teardown() {
    if (!lMap) return;
    if (window.NamibiaOSM) window.NamibiaOSM.unregisterMap(lMap);
    try { lMap.remove(); } catch (_) {}
    lMap = null; routeLayers = []; ready = false; lastDrawnDayKey = null;
    routeDotMarker = null;
  }

  // Position dot for the swipe deck (v45): marks the card you've swiped to /
  // your GPS-active card on the route. Created lazily, moved on each call.
  function setRouteDot(lat, lng, pan) {
    if (!lMap || !ready || !window.L) return;
    const la = Number(lat), ln = Number(lng);
    if (!isFinite(la) || !isFinite(ln)) return;
    const ll = [la, ln];
    if (!routeDotMarker || !lMap.hasLayer(routeDotMarker)) {
      try {
        routeDotMarker = window.L.circleMarker(ll, {
          radius: 9, color: '#ffffff', weight: 3,
          fillColor: '#5a1738', fillOpacity: 1,
          className: 'route-dot-pin', pane: 'markerPane'
        }).addTo(lMap);
      } catch (_) { return; }
    } else {
      try { routeDotMarker.setLatLng(ll); } catch (_) {}
    }
    try { routeDotMarker.bringToFront(); } catch (_) {}
    if (pan) { try { lMap.panTo(ll, { animate: true }); } catch (_) {} }
  }

  // Leg pins for the v47 stack deck: a green dot at the active step's start and
  // a red dot at its end, so the live map answers "where on the road is THIS
  // card pointing me?". Fits the map to both points so the leg is fully in view.
  function clearLegPins() {
    legPinLayers.forEach(l => { try { lMap && lMap.removeLayer(l); } catch (_) {} });
    legPinLayers = [];
  }
  function setLegPins(start, end) {
    if (!lMap || !ready || !window.L) return;
    clearLegPins();
    if (!start && !end) return;
    if (start && isFinite(+start.lat) && isFinite(+start.lng)) {
      try {
        legPinLayers.push(window.L.circleMarker([+start.lat, +start.lng], {
          radius: 8, color: '#ffffff', weight: 2,
          fillColor: '#178a3a', fillOpacity: 1,
          className: 'leg-pin leg-pin-start', pane: 'markerPane'
        }).addTo(lMap));
      } catch (_) {}
    }
    if (end && isFinite(+end.lat) && isFinite(+end.lng)) {
      try {
        legPinLayers.push(window.L.circleMarker([+end.lat, +end.lng], {
          radius: 8, color: '#ffffff', weight: 2,
          fillColor: '#b3261e', fillOpacity: 1,
          className: 'leg-pin leg-pin-end', pane: 'markerPane'
        }).addTo(lMap));
      } catch (_) {}
    }
    legPinLayers.forEach(l => { try { l.bringToFront(); } catch (_) {} });
    if (start && end) {
      try {
        const b = window.L.latLngBounds([[+start.lat, +start.lng], [+end.lat, +end.lng]]).pad(0.4);
        lMap.fitBounds(b, { animate: true, maxZoom: 15 });
      } catch (_) {}
    } else if (start) {
      try { lMap.panTo([+start.lat, +start.lng], { animate: true }); } catch (_) {}
    } else if (end) {
      try { lMap.panTo([+end.lat, +end.lng], { animate: true }); } catch (_) {}
    }
  }

  window.NamibiaOsmMap = {
    takeOver, update, teardown, setRouteDot, setLegPins, clearLegPins,
    // v47 needs a Leaflet handle to call invalidateSize after its flex layout
    // settles — without that, tiles never load on the freshly-mounted map.
    getMap: function () { return lMap; },
    _internals: () => ({ ready, hasMap: !!lMap, lastDrawnDayKey })
  };
})();
