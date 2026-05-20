// pwa-v32-osm-map.js — OpenStreetMap base map for the Driving Dashboard.
//
// Replaces the dashboard's Google Maps view with a MapLibre GL JS map
// rendering OSM raster tiles. Benefits:
//   - No daily quota (OSM tiles are free; SW caches them on first fetch)
//   - Works after Google Maps Platform hits OverQuotaMapError
//   - Customizable styling (we draw Heather-segment-colored route layers
//     directly in GeoJSON instead of via the Google Polyline monkey-patch
//     chain)
//
// v13 calls window.NamibiaOsmMap.takeOver() / .update() and bails out of
// its Google flow when this module is present (see ensureDriveMap +
// updateDriveMap in pwa-v13).
(function () {
  let mlMap = null;
  let mlMarker = null;
  let mlAccCircle = null;
  let mlInitDone = false;
  let pendingDayKey = null;
  let lastDrawnDayKey = null;

  function hasMapLibre() {
    return typeof window.maplibregl !== 'undefined';
  }

  function initMap() {
    if (mlMap || !hasMapLibre()) return mlMap;
    const host = document.getElementById('driveMapHost');
    if (!host) return null;
    // Wipe anything Google had drawn there.
    host.innerHTML = '';
    host.style.position = 'relative';

    mlMap = new window.maplibregl.Map({
      container: 'driveMapHost',
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }
        },
        layers: [
          { id: 'osm-base', type: 'raster', source: 'osm' }
        ]
      },
      center: [17.0, -22.5],     // roughly central Namibia
      zoom: 5,
      attributionControl: { compact: true },
      cooperativeGestures: false
    });
    mlMap.on('load', () => {
      mlInitDone = true;
      // If a day was selected before init finished, draw its route now.
      if (pendingDayKey) {
        drawRouteForCurrentDay();
        pendingDayKey = null;
      }
    });
    mlMap.on('error', e => {
      if (typeof log === 'function') log('OSM map: ' + (e?.error?.message || 'error'));
    });
    return mlMap;
  }

  function clearRouteLayers() {
    if (!mlMap || !mlInitDone) return;
    ['route-yes', 'route-maybe', 'route-no'].forEach(id => {
      try {
        if (mlMap.getLayer(id)) mlMap.removeLayer(id);
        if (mlMap.getLayer(id + '-arrows')) mlMap.removeLayer(id + '-arrows');
        if (mlMap.getSource(id)) mlMap.removeSource(id);
      } catch (_) {}
    });
  }

  function drawRouteForCurrentDay() {
    if (!mlMap || !mlInitDone) return;
    const d = window.day && window.day();
    if (!d) return;
    const route = state.renderedRoutes?.[d.date];
    if (!route?.overviewPath || route.overviewPath.length < 2) {
      clearRouteLayers();
      lastDrawnDayKey = null;
      return;
    }
    const key = d.date + ':' + route.overviewPath.length;
    if (key === lastDrawnDayKey) return; // already drawn for this day
    lastDrawnDayKey = key;
    clearRouteLayers();

    const partFn = window.NamibiaV19?.partitionPath;
    const parts = partFn ? partFn(route.overviewPath, d) : [{ fromIdx: 0, toIdx: route.overviewPath.length - 1, status: 'no' }];
    const path = route.overviewPath;

    const featuresByStatus = { yes: [], maybe: [], no: [] };
    for (const part of parts) {
      const coords = path.slice(part.fromIdx, part.toIdx + 1).map(p => [Number(p.lng), Number(p.lat)]);
      if (coords.length < 2) continue;
      const arr = featuresByStatus[part.status] || featuresByStatus.no;
      arr.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
    }
    const colors = { yes: '#16a34a', maybe: '#f59e0b', no: '#dc2626' };
    // Draw in order so visually-dominant green sits on top of red, but most
    // routes will have only one status anyway.
    ['no', 'maybe', 'yes'].forEach(status => {
      const feats = featuresByStatus[status];
      if (!feats.length) return;
      const id = `route-${status}`;
      try {
        mlMap.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
        mlMap.addLayer({
          id, type: 'line', source: id,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': colors[status], 'line-width': 5, 'line-opacity': 0.95 }
        });
      } catch (_) {}
    });

    // Fit bounds to the entire route on first draw for this day.
    try {
      const b = new window.maplibregl.LngLatBounds();
      path.forEach(p => b.extend([Number(p.lng), Number(p.lat)]));
      if (!b.isEmpty()) mlMap.fitBounds(b, { padding: 40, duration: 0 });
    } catch (_) {}
  }

  function updateGpsMarker() {
    if (!mlMap || !mlInitDone || !state.gps) return;
    const pos = [Number(state.gps.lng), Number(state.gps.lat)];
    if (!mlMarker) {
      const el = document.createElement('div');
      el.className = 'ml-gps-dot';
      mlMarker = new window.maplibregl.Marker({ element: el }).setLngLat(pos).addTo(mlMap);
    } else {
      mlMarker.setLngLat(pos);
    }
    try { mlMap.panTo(pos, { duration: 250 }); } catch (_) {}
  }

  // ---- Public hooks called from v13 ----
  function takeOver() {
    if (!hasMapLibre()) return null;
    return initMap();
  }
  function update() {
    if (!hasMapLibre()) return;
    if (!mlMap) initMap();
    if (!mlInitDone) {
      pendingDayKey = '__pending__';
      return;
    }
    drawRouteForCurrentDay();
    updateGpsMarker();
  }
  function teardown() {
    if (!mlMap) return;
    try { mlMap.remove(); } catch (_) {}
    mlMap = null; mlMarker = null; mlInitDone = false; lastDrawnDayKey = null;
  }

  window.NamibiaOsmMap = { takeOver, update, teardown, _internals: () => ({ mlMap, mlInitDone, lastDrawnDayKey }) };
})();
