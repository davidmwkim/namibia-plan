// pwa-v34-osm-core.js — shared Leaflet/OpenStreetMap core for ALL maps.
//
// One module owns the OSM vocabulary used across the app so every map looks
// and behaves the same:
//   * createMap(host, opts)         — a Leaflet map on the OSM raster tiles
//   * drawColoredRoute(map, path,d) — Heather-segment-colored route polyline
//   * addStopPins(map, day)         — descriptive markers (popup + category icon)
//   * registerMap(map)/unregisterMap(map) — join the shared GPS layer
//   * updateAllGps()                — repaint the blue dot + accuracy ring on
//                                     EVERY registered map from state.gps
//
// Leaflet draws raster tiles via DOM/canvas (no WebGL), so this works on every
// device — unlike MapLibre GL 4.x which needs WebGL2. The dashboard (v32), the
// Overview map (v35 takeover), and the per-step mini-maps all build on this.
(function () {
  const COLORS = { yes: '#15803d', maybe: '#eab308', no: '#dc2626' };
  // Surface is shown on a SEPARATE channel (dash pattern) from Heather status
  // (line colour) so the two never clash: solid = paved, dashed = gravel,
  // dotted = sand/unpaved.
  // Surface visuals come from the SHARED vocabulary in lib/driving-core
  // (NamibiaDrivingCore.SURFACE_VIS) so the route maps and the Overview/driving
  // summary bar stay in sync. Local fallback mirrors it if the engine is absent.
  const SURFACE_VIS_FALLBACK = {
    paved: { dash: null, mapColor: '#1f2937' }, gravel: { dash: '8 6', mapColor: '#6b7280' },
    dirt: { dash: '11 5 2 5', mapColor: '#92400e' }, unpaved: { dash: '11 5 2 5', mapColor: '#92400e' },
    sand: { dash: '2 8', mapColor: '#d4a017' }, urban: { dash: '2 5', mapColor: '#475569' },
    mixed: { dash: '8 6', mapColor: '#6b7280' }
  };
  function surfaceVis(surface) {
    const V = (window.NamibiaDrivingCore && window.NamibiaDrivingCore.SURFACE_VIS) || SURFACE_VIS_FALLBACK;
    return V[surface] || V.mixed || { dash: null, mapColor: null };
  }
  function dashForSurface(surface) { return surface ? (surfaceVis(surface).dash || null) : null; }
  // Draw the surface as a road-style line ON the route (the Heather-coloured
  // line beneath it acts as a casing/outline = who drives), mirroring the
  // summary bar: paved = dark tar + yellow centre line, gravel = grey beads,
  // sand = tan dots, dirt = brown dashes, town = slate. Looks like a real road,
  // not a parallel chain of blobs.
  function addSurfaceOverlay(map, latlngs, surface, store) {
    if (!window.L || !map || !Array.isArray(latlngs) || latlngs.length < 2) return null;
    const add = (opts) => {
      try {
        const pl = window.L.polyline(latlngs, Object.assign({ interactive: false, lineCap: 'round', lineJoin: 'round' }, opts)).addTo(map);
        if (Array.isArray(store)) store.push(pl);
        return pl;
      } catch (_) { return null; }
    };
    const paved = () => {
      add({ color: '#1f2937', weight: 3, opacity: 0.95 });
      add({ color: '#f5c518', weight: 1.2, opacity: 0.95, dashArray: '6 10' }); // centre line
    };
    switch (surface) {
      case 'paved':
        paved();
        break;
      case 'gravel':
        // Fine, irregular dotting (round caps) → scattered small grey flecks of
        // varying spacing, reading as loose gravel rather than a neat dotted line.
        add({ color: '#9ca3af', weight: 3, opacity: 0.98, dashArray: '1 4 1 7 2 5 1 9 1 6' });
        break;
      case 'dirt': case 'unpaved':
        add({ color: '#a16a3c', weight: 3, opacity: 0.98, dashArray: '7 5' });
        break;
      case 'sand':
        add({ color: '#e6c168', weight: 3, opacity: 0.98, dashArray: '1.5 6' }); // fine dots
        break;
      case 'urban':
        // town = black + white zebra-crossing blocks (square caps), distinct
        // from gravel's grey speckle.
        add({ color: '#111827', weight: 4, opacity: 0.95 });
        add({ color: '#ffffff', weight: 4, opacity: 1, dashArray: '4 4', lineCap: 'butt' });
        break;
      default:
        // Unknown surface is most likely a sealed road — render as paved rather
        // than a confusing grey dash.
        paved();
    }
    return null;
  }
  // Dominant road surface over a path index range, from the day's route steps.
  // Dominant surface in a path range, derived from the SAME driving-core
  // rateStep the summary bar uses — so the map and the bar always agree (the
  // old V22.classifyRoad path emitted 'mixed', which the map drew as a generic
  // grey dash, making tar highways look unpaved). rateStep yields only
  // paved/gravel/dirt/sand/urban (unknown inherits prevCtx, default paved).
  function surfaceForRange(day, fromIdx, toIdx) {
    try {
      const route = window.state && window.state.renderedRoutes && window.state.renderedRoutes[day.date];
      const V19 = window.NamibiaV19, DC = window.NamibiaDrivingCore;
      if (!route || !route.legs || !V19 || !V19.nearestPathIdx || !DC || !DC.rateStep) return null;
      const path = route.overviewPath || [];
      if (!path.length) return null;
      const tally = {};
      let prev = {}; // prevCtx must carry across ALL steps in order for inheritance
      for (const leg of route.legs) {
        for (const step of (leg.steps || [])) {
          const r = DC.rateStep(step, prev);
          prev = { surface: r.roadSurface || r.surface, code: r.code };
          if (typeof step.lat !== 'number') continue;
          const idx = V19.nearestPathIdx(path, { lat: step.lat, lng: step.lng }).idx;
          if (idx >= fromIdx && idx <= toIdx) tally[r.surface] = (tally[r.surface] || 0) + 1;
        }
      }
      let best = null, bestN = 0;
      for (const k in tally) if (tally[k] > bestN) { bestN = tally[k]; best = k; }
      return best;
    } catch (_) { return null; }
  }
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTR = '&copy; OpenStreetMap contributors';

  function hasLeaflet() { return typeof window.L !== 'undefined'; }

  // ---- Shared GPS layer -----------------------------------------------------
  // Registry of every live map. A single state.gps change repaints them all.
  // Entry: { map, gpsMarker, accuracyCircle }.
  const registry = new Set();

  function gpsDivIcon() {
    return window.L.divIcon({
      className: 'ml-gps-icon',
      html: '<div class="ml-gps-dot"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  function updateGpsFor(entry) {
    if (!entry || !entry.map || !hasLeaflet()) return;
    const map = entry.map;
    const g = window.state && window.state.gps;
    if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number') {
      if (entry.gpsMarker) { try { map.removeLayer(entry.gpsMarker); } catch (_) {} entry.gpsMarker = null; }
      if (entry.accuracyCircle) { try { map.removeLayer(entry.accuracyCircle); } catch (_) {} entry.accuracyCircle = null; }
      return;
    }
    const ll = [Number(g.lat), Number(g.lng)];
    // Default ~30 m so spoofed/demo positions (no accuracy) still show a ring.
    const acc = (typeof g.accuracy === 'number' && g.accuracy > 0) ? g.accuracy : 30;
    try {
      if (!entry.accuracyCircle) {
        entry.accuracyCircle = window.L.circle(ll, {
          radius: acc, color: '#4285F4', weight: 1, opacity: 0.4,
          fillColor: '#4285F4', fillOpacity: 0.15, interactive: false
        }).addTo(map);
      } else {
        entry.accuracyCircle.setLatLng(ll);
        entry.accuracyCircle.setRadius(acc);
      }
      if (!entry.gpsMarker) {
        entry.gpsMarker = window.L.marker(ll, { icon: gpsDivIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
      } else {
        entry.gpsMarker.setLatLng(ll);
      }
    } catch (_) {}
  }

  function registerMap(map) {
    if (!map || map.__namibiaGps) return map && map.__namibiaGps;
    const entry = { map, gpsMarker: null, accuracyCircle: null };
    map.__namibiaGps = entry;
    registry.add(entry);
    updateGpsFor(entry);
    return entry;
  }
  function unregisterMap(map) {
    if (!map || !map.__namibiaGps) return;
    const entry = map.__namibiaGps;
    try { if (entry.gpsMarker) map.removeLayer(entry.gpsMarker); } catch (_) {}
    try { if (entry.accuracyCircle) map.removeLayer(entry.accuracyCircle); } catch (_) {}
    registry.delete(entry);
    delete map.__namibiaGps;
  }
  function updateAllGps() {
    for (const entry of registry) updateGpsFor(entry);
  }

  // A small "recenter" button control that re-applies a home view (route
  // bounds / GPS) after the user has panned or zoomed an interactive map.
  function addHomeControl(map, applyHomeFn) {
    if (!window.L || !map || map.__namibiaHome) return;
    try {
      const Ctl = window.L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          const btn = window.L.DomUtil.create('button', 'ml-recenter-btn');
          btn.type = 'button';
          btn.title = 'Recenter map to the route';
          btn.setAttribute('aria-label', 'Recenter map');
          btn.innerHTML = '◎';
          window.L.DomEvent.disableClickPropagation(btn);
          window.L.DomEvent.on(btn, 'click', function (e) { window.L.DomEvent.stop(e); try { applyHomeFn(); } catch (_) {} });
          return btn;
        }
      });
      const c = new Ctl();
      c.addTo(map);
      map.__namibiaHome = c;
    } catch (_) {}
  }

  // ---- Map factory ----------------------------------------------------------
  function createMap(host, opts) {
    if (!hasLeaflet() || !host) return null;
    opts = opts || {};
    host.innerHTML = '';
    const map = window.L.map(host, {
      zoomControl: opts.zoomControl !== false,
      attributionControl: opts.attributionControl !== false,
      scrollWheelZoom: opts.scrollWheelZoom !== false,
      dragging: opts.dragging !== false,
      tap: opts.tap !== false,
      zoomAnimation: opts.zoomAnimation === true,
      fadeAnimation: opts.fadeAnimation === true,
      markerZoomAnimation: opts.markerZoomAnimation === true
    }).setView(opts.center || [-22.5, 17.0], opts.zoom || 6);
    window.L.tileLayer(TILE_URL, {
      maxZoom: opts.maxZoom || 19,
      attribution: TILE_ATTR,
      crossOrigin: true
    }).addTo(map);
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 60);
    return map;
  }

  // ---- Route drawing --------------------------------------------------------
  // Draws the day's route as Heather-segment-colored polylines. Returns the
  // LatLngBounds of the path (or null) so callers can fitBounds with pins.
  function drawColoredRoute(map, path, day, store) {
    if (!map || !hasLeaflet() || !Array.isArray(path) || path.length < 2) return null;
    const partFn = window.NamibiaV19?.partitionPath;
    const parts = partFn ? partFn(path, day)
      : [{ fromIdx: 0, toIdx: path.length - 1, status: 'no' }];
    for (const part of parts) {
      const latlngs = [];
      for (let i = part.fromIdx; i <= part.toIdx; i++) {
        latlngs.push([Number(path[i].lat), Number(path[i].lng)]);
      }
      if (latlngs.length < 2) continue;
      try {
        // SOLID Heather-colored CASING (colour = who drives) — drawn wider than
        // the surface line on top, so the colour reads as an outline/glow around
        // a road-styled surface line. Never dashed: the colour is always clear.
        const pl = window.L.polyline(latlngs, {
          color: COLORS[part.status] || COLORS.no,
          weight: 9, opacity: 0.95, lineJoin: 'round', lineCap: 'round'
        }).addTo(map);
        if (Array.isArray(store)) store.push(pl);
        // SURFACE drawn on top as a road-style line (tar+centre line / gravel
        // beads / sand dots / dirt dashes), the Heather casing showing through.
        addSurfaceOverlay(map, latlngs, part.surface || surfaceForRange(day, part.fromIdx, part.toIdx), store);
      } catch (_) {}
    }
    try {
      const b = window.L.latLngBounds(path.map(p => [Number(p.lat), Number(p.lng)]));
      return b.isValid() ? b : null;
    } catch (_) { return null; }
  }

  // ---- Descriptive pins -----------------------------------------------------
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Category → marker color + glyph, mirroring v18's Google icon vocabulary.
  function pinStyle(stop, day) {
    const role = stop.routeRole;
    const kind = stop.kind;
    if (stop.pressure || /tyre|tire|pressure/i.test(stop.name || '')) {
      // Mandatory pressure CHANGE → a direction arrow (▼ lower / ▲ raise);
      // optional checks keep the neutral 🛞.
      const pd = window.NamibiaV25 && window.NamibiaV25.mandatoryPressureDir ? window.NamibiaV25.mandatoryPressureDir(stop) : null;
      if (pd === 'down') return { color: '#ea580c', glyph: '▼' };
      if (pd === 'up')   return { color: '#2563eb', glyph: '▲' };
      return { color: '#7c3aed', glyph: '🛞' };
    }
    if (kind === 'service' || /fuel|petrol|gas/i.test(stop.name || '')) return { color: '#0ea5e9', glyph: '⛽' };
    if (role === 'optional') return { color: '#f59e0b', glyph: '◇' };
    if (role === 'mandatory') return { color: '#16a34a', glyph: '●' };
    return { color: '#6b7280', glyph: '•' };
  }
  function pinDivIcon(style) {
    return window.L.divIcon({
      className: 'ml-pin-icon',
      html: `<div class="ml-pin" style="--pin:${style.color}"><span>${style.glyph}</span></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
      popupAnchor: [0, -24]
    });
  }
  function addStopPins(map, day, store) {
    if (!map || !hasLeaflet() || !day) return;
    for (const s of (day.stops || [])) {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
      const style = pinStyle(s, day);
      const time = s.time ? `<span class="ml-pop-time">${esc(s.time)}</span>` : '';
      const role = s.routeRole === 'optional' ? 'Optional' : 'Mandatory';
      const pressure = s.pressure ? `<div class="ml-pop-row">🛞 ${esc(s.pressure)}</div>` : '';
      const fuel = s.fuel ? `<div class="ml-pop-row">⛽ ${esc(s.fuel)}</div>` : '';
      const popup = `<div class="ml-pop"><div class="ml-pop-head">${esc(s.emoji || style.glyph)} <strong>${esc(s.name)}</strong> ${time}</div>`
        + `<div class="ml-pop-sub">${esc(s.type || '')} · ${role}</div>`
        + (s.notes ? `<div class="ml-pop-row">${esc(s.notes)}</div>` : '')
        + pressure + fuel
        + `<div class="ml-pop-links"><a href="${esc(window.wazeUrl ? window.wazeUrl(s) : '#')}" target="_blank" rel="noopener">Waze</a> · `
        + `<a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}" target="_blank" rel="noopener">Maps</a></div></div>`;
      try {
        const m = window.L.marker([s.lat, s.lng], { icon: pinDivIcon(style) }).addTo(map);
        m.bindPopup(popup);
        if (Array.isArray(store)) store.push(m);
      } catch (_) {}
    }
  }

  // Repaint the GPS layer on every render pass (covers tab switches + normal
  // GPS updates). Cheap + idempotent (just moves existing markers).
  if (typeof render === 'function') {
    const baseRender = render;
    render = function patchedRenderV34() {
      const r = baseRender.apply(this, arguments);
      try { updateAllGps(); } catch (_) {}
      return r;
    };
  }

  window.NamibiaOSM = {
    hasLeaflet, createMap, drawColoredRoute, addStopPins,
    registerMap, unregisterMap, updateAllGps, updateGpsFor,
    gpsDivIcon, pinStyle, COLORS, dashForSurface, surfaceForRange, addSurfaceOverlay, addHomeControl, TILE_URL, TILE_ATTR,
    _registry: registry
  };
})();
