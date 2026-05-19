// tests/helpers/google-maps-stub.js
// Minimal google.maps shim that satisfies app.js + pwa-vN patches under JSDOM.

function makeLatLng(lat, lng) {
  return { lat: () => lat, lng: () => lng };
}

function makeStubRoute(legs) {
  return {
    routes: [{
      overview_path: legs.flatMap(l => l.steps.map(s => makeLatLng(s.lat, s.lng))),
      legs: legs.map(leg => ({
        start_address: leg.start,
        end_address: leg.end,
        distance: { text: leg.distance, value: leg.distanceM ?? 100000 },
        duration: { text: leg.duration, value: leg.durationS ?? 3600 },
        steps: leg.steps.map(s => ({
          instructions: s.instruction,
          distance: { text: s.distance, value: s.distanceM ?? 1000 },
          duration: { text: s.duration, value: s.durationS ?? 60 },
          start_location: makeLatLng(s.lat, s.lng),
          end_location: makeLatLng(s.endLat ?? s.lat, s.endLng ?? s.lng)
        }))
      }))
    }]
  };
}

function installGoogleMapsStub(globalObj, fixtureLegsByDate) {
  fixtureLegsByDate = fixtureLegsByDate || {};
  const google = {
    maps: {
      TravelMode: { DRIVING: 'DRIVING' },
      DirectionsService: function () {
        this.route = async (req) => {
          // Use the first matching fixture, else a single-step fallback.
          const dateKey = Object.keys(fixtureLegsByDate)[0];
          if (dateKey) return makeStubRoute(fixtureLegsByDate[dateKey]);
          return makeStubRoute([{
            start: 'A', end: 'B', distance: '1 km', duration: '1 min',
            steps: [{
              instruction: 'Head north', distance: '1 km', duration: '1 min',
              lat: req.origin.lat, lng: req.origin.lng,
              endLat: req.destination.lat, endLng: req.destination.lng
            }]
          }]);
        };
      },
      DirectionsRenderer: function () {
        this.setMap = () => {};
        this.set = () => {};
      },
      Map: function () {
        this.fitBounds = () => {};
        this.setCenter = () => {};
        this.setZoom = () => {};
      },
      Marker: function (opts) {
        this.opts = opts;
        this.setMap = () => {};
        this.addListener = () => {};
        this.getPosition = () => ({ lat: () => opts.position.lat, lng: () => opts.position.lng });
      },
      Polyline: function () { this.setMap = () => {}; },
      InfoWindow: function () { this.open = () => {}; },
      LatLng: function (lat, lng) { return { lat: () => lat, lng: () => lng }; },
      LatLngBounds: function () {
        const pts = [];
        this.extend = (p) => {
          if (typeof p.lat === 'function') pts.push({ lat: p.lat(), lng: p.lng() });
          else pts.push({ lat: p.lat, lng: p.lng });
        };
        this.isEmpty = () => pts.length === 0;
        this.getCenter = () => ({ lat: () => 0, lng: () => 0 });
      }
    }
  };
  globalObj.google = google;
  return google;
}

module.exports = { installGoogleMapsStub, makeStubRoute, makeLatLng };
