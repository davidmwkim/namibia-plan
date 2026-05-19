// Namibia PWA v9 patch: draw cached/Google Directions route geometry on the live Google map.
(function () {
  let routePolyline = null;

  function clearRoutePolyline() {
    if (routePolyline) {
      routePolyline.setMap(null);
      routePolyline = null;
    }
  }

  function drawSelectedRouteOnMap() {
    if (!state.map || !window.google || !google.maps) return;
    clearRoutePolyline();

    const d = day();
    const cached = state.renderedRoutes?.[d.date];
    const path = cached?.overviewPath;

    if (!path || path.length < 2) return;

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
  }

  const baseRenderMapMarkers = renderMapMarkers;
  renderMapMarkers = function patchedRenderMapMarkers() {
    baseRenderMapMarkers();
    drawSelectedRouteOnMap();
  };

  const baseRenderDayRoute = renderDayRoute;
  renderDayRoute = async function patchedRenderDayRoute(d) {
    const result = await baseRenderDayRoute(d);
    if (d && d.date === day().date) drawSelectedRouteOnMap();
    return result;
  };

  const baseRenderAllDays = renderAllDays;
  renderAllDays = async function patchedRenderAllDays() {
    const result = await baseRenderAllDays();
    drawSelectedRouteOnMap();
    return result;
  };

  const baseExportSelectedKml = exportSelectedKml;
  exportSelectedKml = function patchedExportSelectedKml() {
    drawSelectedRouteOnMap();
    return baseExportSelectedKml();
  };

  window.namibiaDrawSelectedRouteOnMap = drawSelectedRouteOnMap;
})();
