// pwa-v35-osm-overview.js — replace the Overview sidebar Google map with OSM.
//
// The Overview tab's mini-map (#map) was a Google Map drawn by v9 (route),
// v17 (coloring), v18 (pins) and v24 (side-trips). This swaps it for a Leaflet
// map built from the SAME cached route data, so it:
//   * works fully offline (no Google tiles / quota),
//   * shows the Heather-colored route + descriptive stop pins (shared v34), and
//   * carries the shared GPS blue dot + accuracy ring like every other map.
//
// We keep DirectionsService (route FETCHING still uses Google) but never create
// a google.maps.Map on #map, so Leaflet owns that div alone. The old Google
// drawers stay loaded but harmless — they all guard on a now-null state.map.
(function () {
  const OSM = window.NamibiaOSM;

  let overviewMap = null;
  let overviewLayers = [];
  let lastOverviewKey = null;

  function clearLayers() {
    overviewLayers.forEach(l => { try { overviewMap.removeLayer(l); } catch (_) {} });
    overviewLayers = [];
  }

  function renderOverviewMap() {
    if (!OSM || !OSM.hasLeaflet()) return;
    const host = document.getElementById('map');
    if (!host) return;
    const d = (typeof day === 'function') ? day() : null;
    if (!d) return;

    // Create once; rebuild only if the host div was replaced.
    if (!overviewMap || !document.contains(host)) {
      if (overviewMap) {
        OSM.unregisterMap(overviewMap);
        try { overviewMap.remove(); } catch (_) {}
        overviewMap = null; overviewLayers = []; lastOverviewKey = null;
      }
      const fb = document.getElementById('mapFallback');
      if (fb) fb.style.display = 'none';
      overviewMap = OSM.createMap(host, { center: [-22.3, 16.4], zoom: 6 });
      if (!overviewMap) return;
      OSM.registerMap(overviewMap);
    }

    // Only redraw route + pins (and re-fit) when the DAY changes — otherwise a
    // GPS tick (which also calls render) would yank the view back on every
    // update and fight the user's panning.
    const route = state.renderedRoutes?.[d.date];
    const key = d.date + ':' + (route?.overviewPath?.length || 0);
    if (key !== lastOverviewKey) {
      lastOverviewKey = key;
      clearLayers();
      let bounds = null;
      if (route?.overviewPath?.length > 1) {
        bounds = OSM.drawColoredRoute(overviewMap, route.overviewPath, d, overviewLayers);
      }
      OSM.addStopPins(overviewMap, d, overviewLayers);
      try {
        if (bounds && bounds.isValid()) {
          overviewMap.fitBounds(bounds, { padding: [30, 30] });
        } else {
          const pts = (d.stops || []).filter(s => typeof s.lat === 'number')
            .map(s => [s.lat, s.lng]);
          if (pts.length) overviewMap.fitBounds(window.L.latLngBounds(pts), { padding: [30, 30] });
        }
      } catch (_) {}
    }
    OSM.updateAllGps();
  }

  // ---- Take over initGoogleMap: keep DirectionsService, skip the Google map.
  if (typeof initGoogleMap === 'function') {
    const baseInit = initGoogleMap;
    initGoogleMap = function patchedInitGoogleMapV35() {
      // Route fetching still needs the DirectionsService (no map required).
      if (!state.directionsService && window.google?.maps?.DirectionsService) {
        try { state.directionsService = new google.maps.DirectionsService(); } catch (_) {}
      }
      // Deliberately DO NOT create google.maps.Map on #map — Leaflet owns it.
      renderOverviewMap();
    };
  }

  // ---- Take over renderMapMarkers: render the Leaflet overview, not Google.
  if (typeof renderMapMarkers === 'function') {
    renderMapMarkers = function patchedRenderMapMarkersV35() {
      try { renderOverviewMap(); } catch (_) {}
    };
  }

  // Initial paint (cached route works without Google). Retry a couple times in
  // case Leaflet / cached routes settle slightly after boot.
  setTimeout(renderOverviewMap, 300);
  setTimeout(renderOverviewMap, 1500);

  window.NamibiaV35 = { renderOverviewMap, _map: () => overviewMap };
})();
