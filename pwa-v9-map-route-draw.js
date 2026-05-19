// Namibia PWA v9 patch: render selected day routes on the embedded Google Map.
// Uses cached Google Directions overviewPath when available to avoid repeated billable Directions calls.
(function () {
  let activeRouteToken = 0;
  let routePolyline = null;
  let lastRenderedKey = null;
  const inFlightByDate = new Map();

  function clearRouteOverlay() {
    if (routePolyline) {
      routePolyline.setMap(null);
      routePolyline = null;
    }
    if (state.directionsRenderer) state.directionsRenderer.set('directions', null);
    lastRenderedKey = null;
  }

  function selectedDayRouteRequest(d) {
    if (!d || !d.selfDrive) return null;
    const stops = routeStops(d);
    if (stops.length < 2) return null;
    return {
      origin: { lat: Number(stops[0].lat), lng: Number(stops[0].lng) },
      destination: { lat: Number(stops[stops.length - 1].lat), lng: Number(stops[stops.length - 1].lng) },
      waypoints: stops.slice(1, -1).map(s => ({
        location: { lat: Number(s.lat), lng: Number(s.lng) },
        stopover: true
      })),
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
      provideRouteAlternatives: false,
      region: 'NA'
    };
  }

  function getCachedPath(d) {
    const path = state.renderedRoutes?.[d.date]?.overviewPath;
    return Array.isArray(path) && path.length >= 2 ? path : null;
  }

  function drawCachedPath(d, path) {
    const key = `${d.date}:${path.length}:${path[0].lat},${path[0].lng}:${path[path.length - 1].lat},${path[path.length - 1].lng}`;
    if (routePolyline && lastRenderedKey === key) return;

    clearRouteOverlay();
    const googlePath = path.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    routePolyline = new google.maps.Polyline({
      path: googlePath,
      map: state.map,
      geodesic: false,
      strokeColor: '#5a1738',
      strokeOpacity: 0.95,
      strokeWeight: 5,
      zIndex: 10
    });

    const bounds = new google.maps.LatLngBounds();
    googlePath.forEach(p => bounds.extend(p));
    d.stops.forEach(s => bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) }));
    if (state.gps) bounds.extend(state.gps);
    state.map.fitBounds(bounds, 50);
    lastRenderedKey = key;
  }

  async function fetchAndCacheSelectedRoute(d, request) {
    if (inFlightByDate.has(d.date)) return inFlightByDate.get(d.date);

    const token = ++activeRouteToken;
    const promise = state.directionsService.route(request)
      .then(result => {
        if (token !== activeRouteToken || day().date !== d.date) return null;
        const route = result.routes?.[0];
        const overviewPath = (route?.overview_path || []).map(p => ({ lat: p.lat(), lng: p.lng() }));
        if (overviewPath.length >= 2) {
          state.renderedRoutes[d.date] = { ...(state.renderedRoutes[d.date] || {}), overviewPath };
          localStorage.setItem('namibia_routes_cache_v5', JSON.stringify(state.renderedRoutes));
          drawCachedPath(d, overviewPath);
        }
        return result;
      })
      .catch(err => {
        if (token === activeRouteToken) console.warn('Failed to fetch selected Google route for map', err);
        return null;
      })
      .finally(() => inFlightByDate.delete(d.date));

    inFlightByDate.set(d.date, promise);
    return promise;
  }

  function renderSelectedRouteOnGoogleMap() {
    if (!state.map || !window.google || !google.maps || !state.directionsService) return;

    const d = day();
    const request = selectedDayRouteRequest(d);
    if (!request) {
      activeRouteToken += 1;
      clearRouteOverlay();
      return;
    }

    const cachedPath = getCachedPath(d);
    if (cachedPath) {
      activeRouteToken += 1;
      drawCachedPath(d, cachedPath);
      return;
    }

    fetchAndCacheSelectedRoute(d, request);
  }

  const baseRenderMapMarkers = renderMapMarkers;
  renderMapMarkers = function patchedRenderMapMarkers() {
    baseRenderMapMarkers();
    renderSelectedRouteOnGoogleMap();
  };

  const baseRenderDayRoute = renderDayRoute;
  renderDayRoute = async function patchedRenderDayRoute(d) {
    const result = await baseRenderDayRoute(d);
    if (d && d.date === day().date) renderSelectedRouteOnGoogleMap();
    return result;
  };

  const baseRenderAllDays = renderAllDays;
  renderAllDays = async function patchedRenderAllDays() {
    const result = await baseRenderAllDays();
    renderSelectedRouteOnGoogleMap();
    return result;
  };

  window.namibiaRenderSelectedRouteOnGoogleMap = renderSelectedRouteOnGoogleMap;
})();
