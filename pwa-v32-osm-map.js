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
  let gpsMarker = null;
  let routeLayers = [];
  let ready = false;
  let boundHost = null;
  let lastDrawnDayKey = null;

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
      try { lMap.remove(); } catch (_) {}
      lMap = null; gpsMarker = null; routeLayers = []; ready = false; lastDrawnDayKey = null;
    }
    boundHost = host;
    host.innerHTML = '';
    try {
      lMap = window.L.map(host, {
        zoomControl: true,
        attributionControl: true,
        // Touch-friendly; let the page scroll unless interacting with map.
        scrollWheelZoom: true
      }).setView([-22.5, 17.0], 6);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
        crossOrigin: true
      }).addTo(lMap);
      ready = true;
      // Leaflet needs invalidateSize() if the container's size settled after
      // creation (e.g. tab just became visible).
      setTimeout(() => { try { lMap.invalidateSize(); } catch (_) {} }, 60);
      drawRouteForCurrentDay();
      updateGpsMarker();
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

    const partFn = window.NamibiaV19?.partitionPath;
    const parts = partFn ? partFn(route.overviewPath, d)
      : [{ fromIdx: 0, toIdx: route.overviewPath.length - 1, status: 'no' }];
    const path = route.overviewPath;
    const colors = { yes: '#16a34a', maybe: '#f59e0b', no: '#dc2626' };

    for (const part of parts) {
      const latlngs = [];
      for (let i = part.fromIdx; i <= part.toIdx; i++) {
        latlngs.push([Number(path[i].lat), Number(path[i].lng)]);
      }
      if (latlngs.length < 2) continue;
      try {
        const pl = window.L.polyline(latlngs, {
          color: colors[part.status] || colors.no,
          weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round'
        }).addTo(lMap);
        routeLayers.push(pl);
      } catch (_) {}
    }

    // Fit bounds to the whole route on first draw for this day.
    try {
      const b = window.L.latLngBounds(path.map(p => [Number(p.lat), Number(p.lng)]));
      if (b.isValid()) lMap.fitBounds(b, { padding: [30, 30] });
    } catch (_) {}
  }

  function updateGpsMarker() {
    if (!lMap || !ready || !state.gps) return;
    const ll = [Number(state.gps.lat), Number(state.gps.lng)];
    if (!gpsMarker) {
      const icon = window.L.divIcon({
        className: 'ml-gps-icon',
        html: '<div class="ml-gps-dot"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      gpsMarker = window.L.marker(ll, { icon, zIndexOffset: 1000 }).addTo(lMap);
    } else {
      gpsMarker.setLatLng(ll);
    }
    try { lMap.panTo(ll, { animate: true, duration: 0.25 }); } catch (_) {}
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
    updateGpsMarker();
    return true;
  }
  function teardown() {
    if (!lMap) return;
    try { lMap.remove(); } catch (_) {}
    lMap = null; gpsMarker = null; routeLayers = []; ready = false; lastDrawnDayKey = null;
  }

  window.NamibiaOsmMap = {
    takeOver, update, teardown,
    _internals: () => ({ ready, hasMap: !!lMap, lastDrawnDayKey })
  };
})();
