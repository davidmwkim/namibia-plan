// Namibia PWA v9 patch: render selected day routes on the embedded Google Map using DirectionsRenderer.
(function () {
  let activeRouteToken = 0;

  function selectedDayRouteRequest() {
    const d = day();
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

  async function renderSelectedRouteOnGoogleMap() {
    if (!state.map || !window.google || !google.maps || !state.directionsService || !state.directionsRenderer) return;

    const request = selectedDayRouteRequest();
    if (!request) {
      state.directionsRenderer.set('directions', null);
      return;
    }

    const token = ++activeRouteToken;
    try {
      const result = await state.directionsService.route(request);
      if (token !== activeRouteToken) return;
      state.directionsRenderer.setOptions({
        suppressMarkers: true,
        preserveViewport: false,
        polylineOptions: {
          strokeColor: '#5a1738',
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: 10
        }
      });
      state.directionsRenderer.setDirections(result);
    } catch (err) {
      if (token !== activeRouteToken) return;
      console.warn('Failed to render selected Google route on map', err);
      state.directionsRenderer.set('directions', null);
    }
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
