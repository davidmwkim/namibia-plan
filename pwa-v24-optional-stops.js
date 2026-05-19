// Namibia PWA v24 — Optional-stop side-trips + always-on map labels.
//
//   * Draws a light-purple Polyline from the *preceding mandatory* stop to each
//     optional stop on the day, fetched as a one-shot Google Directions side-
//     trip. Lets you eyeball at a glance which optionals are closest.
//   * Annotates every marker (mandatory + optional) with a small text label
//     overlay showing the stop's name, so each pin is glanceable without
//     having to click it.
(function () {
  const OPTIONAL_COLOR = '#a855f7';   // light purple: preceding mandatory → optional
  const RETURN_COLOR   = '#2563eb';   // blue:          optional → next mandatory
  const LABEL_BG = 'rgba(255,255,255,0.92)';
  const LABEL_BORDER = '#c4b5fd';

  const sideTripPolylines = [];        // google.maps.Polyline
  const labelOverlays = [];            // OverlayView for text labels
  let lastDayKey = null;

  function clearAll() {
    sideTripPolylines.forEach(p => { try { p.setMap(null); } catch (_) {} });
    sideTripPolylines.length = 0;
    labelOverlays.forEach(o => { try { o.setMap(null); } catch (_) {} });
    labelOverlays.length = 0;
  }

  // Lazy create the label-overlay class once google.maps is available.
  let LabelOverlay = null;
  function makeLabelOverlayClass() {
    if (LabelOverlay || !window.google?.maps?.OverlayView) return LabelOverlay;
    function Cls(latLng, text, opts) {
      this.position = latLng;
      this.text = text;
      this.opts = opts || {};
      this.div = null;
    }
    Cls.prototype = new google.maps.OverlayView();
    Cls.prototype.onAdd = function () {
      const div = document.createElement('div');
      div.className = 'map-label ' + (this.opts.cls || '');
      div.textContent = this.text;
      div.style.position = 'absolute';
      div.style.padding = '1px 6px';
      div.style.fontSize = '11px';
      div.style.fontWeight = '600';
      div.style.color = '#1f2937';
      div.style.background = this.opts.bg || LABEL_BG;
      div.style.border = '1px solid ' + (this.opts.border || LABEL_BORDER);
      div.style.borderRadius = '4px';
      div.style.whiteSpace = 'nowrap';
      div.style.transform = 'translate(-50%, -150%)';
      div.style.pointerEvents = 'none';
      div.style.zIndex = '5';
      div.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)';
      this.div = div;
      this.getPanes().overlayLayer.appendChild(div);
    };
    Cls.prototype.draw = function () {
      if (!this.div) return;
      // getProjection() can be null when the map has been put into error mode
      // (e.g. OverQuotaMapError) — be defensive so the page doesn't crash.
      const proj = this.getProjection();
      if (!proj || !window.google?.maps?.LatLng) return;
      try {
        const px = proj.fromLatLngToDivPixel(new google.maps.LatLng(this.position.lat, this.position.lng));
        if (!px) return;
        this.div.style.left = px.x + 'px';
        this.div.style.top = px.y + 'px';
      } catch (_) { /* projection died mid-draw */ }
    };
    Cls.prototype.onRemove = function () { if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div); this.div = null; };
    LabelOverlay = Cls;
    return Cls;
  }

  function addLabel(map, lat, lng, text, opts) {
    const Cls = makeLabelOverlayClass();
    if (!Cls) return null;
    const ov = new Cls({ lat: Number(lat), lng: Number(lng) }, text, opts);
    ov.setMap(map);
    labelOverlays.push(ov);
    return ov;
  }

  function drawSideTrip(map, from, to, optStop, color) {
    if (!window.google?.maps?.DirectionsService) return;
    const Orig = window.google.maps.Polyline.__orig || window.google.maps.Polyline;
    const stroke = color || OPTIONAL_COLOR;
    const svc = new google.maps.DirectionsService();
    svc.route({
      origin: { lat: Number(from.lat), lng: Number(from.lng) },
      destination: { lat: Number(to.lat), lng: Number(to.lng) },
      travelMode: google.maps.TravelMode.DRIVING,
      region: 'NA'
    }).then(result => {
      const path = (result?.routes?.[0]?.overview_path || []).map(p => ({ lat: p.lat(), lng: p.lng() }));
      if (path.length < 2) return;
      const pl = new Orig({
        path, map,
        strokeColor: stroke,
        strokeOpacity: 0.85,
        strokeWeight: 4,
        zIndex: 8,
        icons: [{
          icon: { path: google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 2.5, strokeColor: stroke, strokeWeight: 2 },
          offset: '0%', repeat: '70px'
        }]
      });
      sideTripPolylines.push(pl);
    }).catch(e => {
      if (typeof log === 'function') log(`Side-trip failed for ${optStop?.name || '?'}: ${e?.message || e}`);
    });
  }

  function applyForDay() {
    if (!window.google?.maps || !state?.map) return;
    const d = window.day && window.day();
    if (!d) return;
    const key = d.date + ':' + (d.stops || []).length;
    if (lastDayKey === key) return;
    clearAll();
    lastDayKey = key;

    const stops = d.stops || [];
    const mandatory = stops.filter(s => s.routeRole === 'mandatory');
    const optionals = stops.filter(s => s.routeRole === 'optional');

    // Add labels for every stop.
    for (const s of stops) {
      const isOpt = s.routeRole === 'optional';
      const isAct = s.routeRole === 'mandatoryAction';
      addLabel(state.map, s.lat, s.lng, (s.emoji ? s.emoji + ' ' : '') + s.name, {
        bg: isOpt ? '#f5f3ff' : (isAct ? '#fef3c7' : LABEL_BG),
        border: isOpt ? '#c4b5fd' : (isAct ? '#fcd34d' : '#d1d5db'),
        cls: isOpt ? 'map-label-optional' : (isAct ? 'map-label-action' : 'map-label-mandatory')
      });
    }

    // For each optional stop, draw:
    //   - light-purple line from the preceding mandatory stop → optional
    //   - blue line from the optional → the next mandatory stop
    optionals.forEach(opt => {
      const optIdx = stops.indexOf(opt);
      let prevMandatory = null;
      for (let i = optIdx - 1; i >= 0; i--) {
        if (stops[i].routeRole === 'mandatory') { prevMandatory = stops[i]; break; }
      }
      if (!prevMandatory) prevMandatory = mandatory[0];
      let nextMandatory = null;
      for (let i = optIdx + 1; i < stops.length; i++) {
        if (stops[i].routeRole === 'mandatory') { nextMandatory = stops[i]; break; }
      }
      if (!nextMandatory) nextMandatory = mandatory[mandatory.length - 1];
      if (prevMandatory && prevMandatory !== opt) drawSideTrip(state.map, prevMandatory, opt, opt, OPTIONAL_COLOR);
      if (nextMandatory && nextMandatory !== opt) drawSideTrip(state.map, opt, nextMandatory, opt, RETURN_COLOR);
    });
  }

  // Re-apply when the day changes or the map appears.
  function tryApply() {
    try { applyForDay(); } catch (_) {}
  }
  if (typeof render === 'function') {
    const base = render;
    render = function patchedRenderV24() {
      const r = base();
      // Defer slightly so the map markers + state.map are ready.
      setTimeout(tryApply, 0);
      return r;
    };
  }
  // Also trigger when Google finishes loading later.
  document.addEventListener('visibilitychange', tryApply);
  setTimeout(tryApply, 1500);
  setTimeout(tryApply, 4000);

  // Reset cached key when state.map gets re-instantiated.
  window.NamibiaV24 = {
    drawSideTrip, addLabel, applyForDay, clearAll,
    _reset: () => { lastDayKey = null; }
  };
})();
