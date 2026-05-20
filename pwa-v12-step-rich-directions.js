// Namibia PWA v12 patch:
//   - Adds per-step Static Maps + Street View imagery under each turn in Directions
//   - Builds a `cards` array on the route blob (used by v13's Driving Dashboard)
//   - Adds per-step heading / ttsKey / ttsText metadata used by v14's TTS engine
//   - Computes `sunTimes` for each routed day (used by Driving Dashboard + Overview)
//   - Extends the Overview tab with a sunrise/sunset/daylight-margin line
//   - Click 🗺️ on a step opens a shared interactive Google Map focused on that leg
(function () {
  const DC = (typeof self !== 'undefined' && self.NamibiaDrivingCore) || window.NamibiaDrivingCore;
  const ST = (typeof self !== 'undefined' && self.NamibiaSunTimes) || window.NamibiaSunTimes;

  // ---- Polyline encoding (mirror of pwa-v11 helper; kept local to avoid coupling) ----
  function encodePolyline(points) {
    let lastLat = 0, lastLng = 0, result = '';
    const enc = (v) => {
      v = v < 0 ? ~(v << 1) : (v << 1);
      let s = '';
      while (v >= 0x20) {
        s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      return s + String.fromCharCode(v + 63);
    };
    for (const p of points) {
      const lat = Math.round(Number(p.lat) * 1e5);
      const lng = Math.round(Number(p.lng) * 1e5);
      result += enc(lat - lastLat) + enc(lng - lastLng);
      lastLat = lat; lastLng = lng;
    }
    return result;
  }

  function sampledPath(points, maxPoints = 60) {
    if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
    const step = Math.ceil(points.length / maxPoints);
    const out = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    const last = points[points.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }

  // Slice the overviewPath between the segment that starts at (aLat,aLng) and the
  // segment that ends at (bLat,bLng). Falls back to the two endpoints if the
  // polyline is unavailable.
  function pathSlice(overviewPath, a, b) {
    if (!Array.isArray(overviewPath) || overviewPath.length < 2) {
      return [a, b];
    }
    // Nearest indices by haversine.
    let aIdx = 0, bIdx = overviewPath.length - 1;
    let aD = Infinity, bD = Infinity;
    for (let i = 0; i < overviewPath.length; i++) {
      const d1 = DC.distMeters(overviewPath[i], a);
      const d2 = DC.distMeters(overviewPath[i], b);
      if (d1 < aD) { aD = d1; aIdx = i; }
      if (d2 < bD) { bD = d2; bIdx = i; }
    }
    if (aIdx > bIdx) { const tmp = aIdx; aIdx = bIdx; bIdx = tmp; }
    if (bIdx - aIdx < 1) return [a, b];
    return overviewPath.slice(aIdx, bIdx + 1);
  }

  // Per-step Static Maps URL with:
  //   * polyline colored by the Heather segment that contains the step's
  //     midpoint (v19's partitionPath; falls back to red "David drives")
  //   * green-S marker at the step start, red-F marker at the step finish
  //
  // The caller MUST pass the day object whose route this step belongs to —
  // we look up that day's overviewPath + Heather partitions. Using day() here
  // would silently return the currently-selected day, mis-coloring all days
  // against Day 1's partitions during the renderAllDays prep loop.
  function stepStaticMapUrl(slice, a, b, contextDay) {
    if (!state.apiKey) return '';
    let color = '0xdc2626'; // default red ("David drives")
    try {
      const d = contextDay || day();
      const overview = state.renderedRoutes?.[d?.date]?.overviewPath;
      if (overview && window.NamibiaV19) {
        const mid = slice[Math.floor(slice.length / 2)] || a;
        const parts = window.NamibiaV19.partitionPath(overview, d);
        const midIdx = window.NamibiaV19.nearestPathIdx(overview, mid).idx;
        const containing = parts.find(p => midIdx >= p.fromIdx && midIdx <= p.toIdx);
        const STATIC_HEX = { yes: '0x16a34a', maybe: '0xf59e0b', no: '0xdc2626' };
        if (containing) color = STATIC_HEX[containing.status] || color;
      }
    } catch (_) {}
    const params = new URLSearchParams({
      size: '320x200', scale: '2', maptype: 'roadmap', key: state.apiKey
    });
    params.append('path', `color:${color}ff|weight:5|enc:${encodePolyline(sampledPath(slice))}`);
    params.append('markers', `color:0x16a34a|label:S|${a.lat},${a.lng}`);
    params.append('markers', `color:0xdc2626|label:F|${b.lat},${b.lng}`);
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  }

  function stepStreetViewUrl(lat, lng, heading) {
    if (!state.apiKey) return '';
    // Tight radius — the step's lat/lng is now a point taken from the step's
    // own encoded polyline (Google's road-snapped geometry), so a small
    // radius locks the panorama to the same road. 300m was pulling panos from
    // parallel/cross streets at intersections.
    const p = new URLSearchParams({
      size: '320x180',
      location: `${lat},${lng}`,
      heading: String(Math.round(heading || 0)),
      pitch: '0', fov: '90', source: 'outdoor', radius: '60', key: state.apiKey
    });
    return 'https://maps.googleapis.com/maps/api/streetview?' + p.toString();
  }

  // Decode a Google encoded polyline (https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
  function decodePolyline(s) {
    if (!s) return [];
    const out = [];
    let lat = 0, lng = 0, i = 0;
    while (i < s.length) {
      let result = 0, shift = 0, b;
      do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const dLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dLat;
      result = 0; shift = 0;
      do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const dLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dLng;
      out.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return out;
  }
  function distAlong(pts, a, b) {
    // Helper: pick a point roughly `meters` into a decoded polyline.
    if (!pts.length) return null;
    if (pts.length === 1) return pts[0];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = DC.distMeters(pts[i - 1], pts[i]);
      if (acc + d >= b) {
        const t = (b - acc) / d;
        return {
          lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t,
          lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t
        };
      }
      acc += d;
    }
    return pts[pts.length - 1];
  }

  // Pretty distance for TTS ("In 1.2 kilometres,"). Short strings → 200ch limit.
  function distLabel(distanceText) {
    if (!distanceText) return '';
    const s = String(distanceText).toLowerCase();
    if (s.includes('km')) {
      return s.replace(/km/i, 'kilometres').replace(/\s+/g, ' ').trim();
    }
    if (s.includes('m')) {
      return s.replace(/m\b/i, 'metres').replace(/\s+/g, ' ').trim();
    }
    return s;
  }
  function ttsTextFor(step) {
    const instruction = String(step.instruction || '').replace(/\s+/g, ' ').trim();
    const where = distLabel(step.distance);
    if (where) return `In ${where}, ${instruction}`.slice(0, 200);
    return instruction.slice(0, 200);
  }

  // Build cards array for a given day, ordered along the route.
  function buildCards(d, legs, overviewPath) {
    const cards = [];
    const date = d.date;
    // Min distance from a point to the route polyline (sampled every other
    // vertex). Used to drop off-route optional stops the route doesn't pass.
    const distToPath = (ev) => {
      if (!Array.isArray(overviewPath) || !overviewPath.length) return 0;
      let min = Infinity;
      for (let i = 0; i < overviewPath.length; i += 2) {
        const dm = DC.distMeters(ev, overviewPath[i]);
        if (dm < min) min = dm;
        if (min < 3000) return min;
      }
      return min;
    };
    legs.forEach((leg, li) => {
      leg.steps.forEach((step, si) => {
        cards.push({
          kind: si === leg.steps.length - 1 && li === legs.length - 1 ? 'arrival' : 'turn',
          legIdx: li, stepIdx: si,
          lat: step.lat, lng: step.lng,
          title: step.instruction,
          body: `${step.distance} · ${step.duration}`,
          mapUrl: step.stepMapUrl,
          streetViewUrl: step.streetViewUrl,
          ttsKey: step.ttsKey,
          ttsText: step.ttsText,
          triggerRadiusM: 100
        });
      });
    });
    // Fuel/pressure cards for EVERY stop we pass that carries an action (not just
    // mandatory ones). Optional fly-bys use softer "passing" wording + keys so
    // the TTS calls them out without the urgency of a mandatory action. Off-route
    // optional stops are dropped below by the >3 km nearest-step filter.
    const stops = (d.stops || []).filter(s => s.pressure || s.fuel);
    stops.forEach(s => {
      const optional = !(s.routeRole === 'mandatory' || s.routeRole === 'mandatoryAction');
      if (s.pressure) {
        const isLower = /lower|deflate|drop|sand|gravel/i.test(s.pressure);
        cards.push({
          kind: 'pressure',
          stopName: s.name, optional,
          lat: s.lat, lng: s.lng,
          title: `${optional ? 'Tyre check' : (isLower ? 'Lower' : 'Raise') + ' tyre pressure'} — ${s.name}`,
          body: s.pressure,
          ttsKey: optional ? 'pressure_check_passing' : (isLower ? 'pressure_lower' : 'pressure_raise'),
          ttsText: optional
            ? `Tyre service available at ${s.name} if you need it.`
            : (isLower
              ? `Tyre pressure action coming up. Lower pressure before the next section.`
              : `Tyre pressure action coming up. Raise pressure for the upcoming road.`),
          triggerRadiusM: 1500
        });
      }
      if (s.fuel) {
        cards.push({
          kind: 'fuel',
          stopName: s.name, optional,
          lat: s.lat, lng: s.lng,
          title: `${optional ? 'Fuel option' : 'Fuel stop'} — ${s.name}`,
          body: s.fuel,
          ttsKey: optional ? 'fuel_stop_passing' : 'fuel_stop',
          ttsText: optional
            ? `Passing a fuel station at ${s.name}. Top up if your gauge is low.`
            : `Fuel stop coming up. Top up at ${s.name}.`,
          triggerRadiusM: 1500
        });
      }
    });
    // Sort cards roughly along the route by leg/step idx, with fuel/pressure
    // inserted near their nearest step. Default: insert by approximate proximity
    // to the route's flattened step list.
    const stepCards = cards.filter(c => c.kind === 'turn' || c.kind === 'arrival');
    const eventCards = cards.filter(c => c.kind !== 'turn' && c.kind !== 'arrival');
    eventCards.forEach(ev => {
      let bestIdx = 0, bestD = Infinity;
      stepCards.forEach((sc, i) => {
        const d2 = DC.distMeters(ev, sc);
        if (d2 < bestD) { bestD = d2; bestIdx = i; }
      });
      ev._insertAfter = bestIdx;
      // Drop criterion: distance to the ROUTE POLYLINE (not the nearest turn —
      // a stop mid-long-step can be >3 km from any turn yet right on the road).
      ev._routeD = distToPath(ev);
    });
    // Merge. Drop event cards > 3 km from the route — an off-route town stop the
    // route doesn't actually pass. (When overviewPath is absent, distToPath
    // returns 0, so nothing is dropped pre-render.)
    const merged = [];
    stepCards.forEach((sc, i) => {
      merged.push(sc);
      eventCards.filter(ev => ev._insertAfter === i && ev._routeD <= 3000).forEach(ev => { delete ev._routeD; merged.push(ev); });
    });
    // Carry an index for stable identity.
    merged.forEach((c, i) => { c.cardId = `${date}:${i}`; delete c._insertAfter; });
    return merged;
  }

  // Compute sun-times for the day from the destination's lat/lng if available.
  function computeSunTimes(d) {
    if (!ST) return null;
    const stops = (d.stops || []).filter(s => s.routeRole === 'mandatory');
    const dest = stops[stops.length - 1] || stops[0] || (d.stops && d.stops[0]);
    if (!dest) return null;
    const date = new Date(d.date + 'T00:00:00Z');
    const t = ST.sunriseSunsetUtc(date, Number(dest.lat), Number(dest.lng));
    return { ...t, sourceLat: Number(dest.lat), sourceLng: Number(dest.lng) };
  }

  // Decorate one route blob with the v12 extensions. Mutates in place.
  function decorateRoute(d, route) {
    if (!route || !route.legs) return route;
    const overviewPath = route.overviewPath || [];
    route.legs.forEach(leg => {
      const steps = leg.steps || [];
      steps.forEach((step, i) => {
        const next = steps[i + 1] || { lat: step.endLat ?? step.lat, lng: step.endLng ?? step.lng };
        step.endLat = step.endLat ?? next.lat;
        step.endLng = step.endLng ?? next.lng;

        // Decode the step's own polyline (Google's road-snapped geometry for
        // just this step). The first point IS the start_location, already on
        // the road. We use a point ~20m into the polyline as the Street View
        // anchor so the panorama is unambiguously on this step's road (rather
        // than a corner that could be a parallel-street pano), and we use the
        // bearing from that point to a point ~80m further along the polyline
        // as the heading-of-travel.
        const decoded = step.polyline ? decodePolyline(step.polyline) : [];
        let svAnchor = { lat: step.lat, lng: step.lng };
        let headingTarget = { lat: next.lat, lng: next.lng };
        if (decoded.length >= 2) {
          const totalM = (function () {
            let m = 0;
            for (let k = 1; k < decoded.length; k++) m += DC.distMeters(decoded[k - 1], decoded[k]);
            return m;
          })();
          // Snap the anchor 20m down the road (or 25% of the step, whichever is smaller).
          const anchorAlongM = Math.min(20, totalM * 0.25);
          svAnchor = distAlong(decoded, 0, anchorAlongM) || svAnchor;
          // Pick a target ~80m further (or another 25% of the step).
          const targetAlongM = Math.min(anchorAlongM + 80, totalM);
          headingTarget = distAlong(decoded, 0, targetAlongM) || headingTarget;
        }
        step.heading = DC.bearingForStreetView(svAnchor, headingTarget);
        step.svLat = svAnchor.lat;
        step.svLng = svAnchor.lng;

        const slice = decoded.length >= 2
          ? decoded
          : pathSlice(overviewPath, { lat: step.lat, lng: step.lng }, { lat: step.endLat, lng: step.endLng });
        const newStepMapUrl = stepStaticMapUrl(slice, { lat: step.lat, lng: step.lng }, { lat: step.endLat, lng: step.endLng }, d);
        const newStreetViewUrl = stepStreetViewUrl(svAnchor.lat, svAnchor.lng, step.heading);
        if (newStepMapUrl || !step.stepMapUrl) step.stepMapUrl = newStepMapUrl;
        if (newStreetViewUrl || !step.streetViewUrl) step.streetViewUrl = newStreetViewUrl;

        // For LONG stretches (e.g. 85 km on B1), one Street View at the
        // step's start gets stale fast. Pre-generate a few intermediate
        // Street View points along the step's own polyline so the active
        // card can cycle through them based on the GPS position. Each URL
        // is also SW-cached on first fetch, so they work offline too.
        step.intermediates = [];
        if (decoded.length >= 2) {
          let totalM = 0;
          for (let k = 1; k < decoded.length; k++) totalM += DC.distMeters(decoded[k - 1], decoded[k]);
          // 1 intermediate per ~30 km, max 5, only if the step itself > 25 km.
          if (totalM > 25000) {
            const n = Math.min(5, Math.floor(totalM / 30000));
            for (let k = 1; k <= n; k++) {
              const targetM = (totalM * k) / (n + 1);
              const pt = distAlong(decoded, 0, targetM);
              if (!pt) continue;
              const aheadPt = distAlong(decoded, 0, Math.min(totalM, targetM + 80));
              const heading = (pt && aheadPt) ? DC.bearingForStreetView(pt, aheadPt) : step.heading;
              const url = stepStreetViewUrl(pt.lat, pt.lng, heading);
              if (!url) continue;     // skip entries with no URL (no API key at decoration time)
              step.intermediates.push({ lat: pt.lat, lng: pt.lng, distFromStartM: targetM, heading, url });
            }
          }
        }
        step.ttsText = ttsTextFor(step);
        step.ttsKey = `step-${d.date}-${leg.__legIdx ?? ''}-${i}`;
      });
    });
    // tag legs with their index for ttsKey uniqueness
    route.legs.forEach((leg, li) => { leg.__legIdx = li; });
    route.cards = buildCards(d, route.legs, overviewPath);
    // Task 2: pre-sample Street View every ~5 km along the route for the Driver
    // view. The same frame is reused across a 5 km band (so the URL is stable
    // and SW-cacheable) instead of a fresh per-GPS-tick fetch. Self-drive days
    // only. We store lat/lng/heading; consumers rebuild the deterministic URL
    // with the live key so it works offline once cached.
    route.svFrames = [];
    if (d.selfDrive && overviewPath.length >= 2) {
      const STEP_M = 5000;
      let acc = 0, nextAt = 0;
      for (let i = 0; i < overviewPath.length; i++) {
        if (i > 0) acc += DC.distMeters(overviewPath[i - 1], overviewPath[i]);
        if (acc >= nextAt) {
          const here = overviewPath[i];
          // Forward bearing from a point ~150 m further along the path, so the
          // Street View faces the DIRECTION OF TRAVEL (not a jittery 1-vertex hop).
          let j = i, adv = 0;
          while (j + 1 < overviewPath.length && adv < 150) { adv += DC.distMeters(overviewPath[j], overviewPath[j + 1]); j++; }
          const ahead = overviewPath[j] || here;
          const heading = DC.bearingForStreetView(here, ahead);
          route.svFrames.push({ distM: Math.round(acc), lat: here.lat, lng: here.lng, heading, url: stepStreetViewUrl(here.lat, here.lng, heading) });
          nextAt = acc + STEP_M;
        }
      }
    }
    // Surface those 5 km frames as their own scrollable "scenery" cards, slotted
    // into the card list by distance along the route — so the Driver view shows a
    // road snapshot (facing the direction of travel) every 5 km, not just at the
    // sparse turn steps (a 200 km straight gravel road otherwise = ~1 image).
    // Image-only (noMap) so we don't spin up a Leaflet mini-map per frame.
    if (route.svFrames.length && route.cards.length) {
      const frameCard = (f) => ({
        kind: 'scenery',
        lat: f.lat, lng: f.lng, distM: f.distM,
        title: `Roadside · ${Math.round(f.distM / 1000)} km in`,
        body: 'View ahead, in your direction of travel',
        streetViewUrl: f.url,
        noMap: true
      });
      const merged = [];
      let fi = 0;
      route.cards.forEach((c, idx) => {
        const isLast = idx === route.cards.length - 1;
        const cd = (!isLast && typeof c.lat === 'number' && overviewPath.length >= 2)
          ? DC.routeProgressM(overviewPath, c) : Infinity; // last card (arrival) absorbs the rest
        while (fi < route.svFrames.length && route.svFrames[fi].distM <= cd) { merged.push(frameCard(route.svFrames[fi])); fi++; }
        merged.push(c);
      });
      merged.forEach((c, i) => { c.cardId = `${d.date}:c${i}`; });
      route.cards = merged;
    }
    route.sunTimes = computeSunTimes(d);
    route.schemaVersion = 9; // bumped for the 5 km scenery cards — re-decorate cached routes
    return route;
  }

  // ---- Wrap renderDayRoute so cached routes get v12 fields ----
  if (typeof renderDayRoute === 'function') {
    const baseRenderDayRoute = renderDayRoute;
    renderDayRoute = async function patchedRenderDayRouteV12(d) {
      const result = await baseRenderDayRoute(d);
      if (state.renderedRoutes[d.date]) {
        decorateRoute(d, state.renderedRoutes[d.date]);
        try { localStorage.setItem('namibia_routes_cache_v5', JSON.stringify(state.renderedRoutes)); } catch (_) {}
      }
      return result;
    };
  }

  // Decorate any pre-existing cached routes on load so v13 can rely on the
  // extended schema. Cheap (no Google calls), idempotent.
  function decorateAllCached() {
    for (const d of (window.NAMIBIA_TRIP_DATA?.days || [])) {
      const r = state.renderedRoutes[d.date];
      if (r && r.legs && r.schemaVersion !== 9) decorateRoute(d, r);
    }
  }
  decorateAllCached();

  // ---- Modal with shared interactive map ----
  let modalEl = null, modalMap = null, modalLayers = [];
  function openStepModal(legIdx, stepIdx) {
    const route = state.renderedRoutes[day().date];
    const leg = route?.legs?.[legIdx];
    const step = leg?.steps?.[stepIdx];
    if (!step) return;
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'stepModal';
      modalEl.className = 'step-modal';
      modalEl.innerHTML = `
        <div class="step-modal-card">
          <div class="step-modal-head">
            <h3 id="stepModalTitle">Step</h3>
            <button class="ghost" id="stepModalClose">Close</button>
          </div>
          <div class="step-modal-body">
            <div id="stepModalMap" class="step-modal-map"></div>
            <div id="stepModalMeta" class="step-modal-meta"></div>
          </div>
        </div>`;
      document.body.appendChild(modalEl);
      modalEl.addEventListener('click', e => {
        if (e.target.id === 'stepModal' || e.target.id === 'stepModalClose') {
          modalEl.classList.remove('open');
        }
      });
    }
    document.getElementById('stepModalTitle').textContent = step.instruction || `Step ${stepIdx + 1}`;
    document.getElementById('stepModalMeta').innerHTML =
      `<p><strong>${esc(step.distance || '')}</strong> · <strong>${esc(step.duration || '')}</strong></p>
       <p>${esc(step.lat.toFixed(5))}, ${esc(step.lng.toFixed(5))} → ${esc((step.endLat || step.lat).toFixed(5))}, ${esc((step.endLng || step.lng).toFixed(5))}</p>`;
    modalEl.classList.add('open');
    // Interactive expanded view — a live OSM (Leaflet) map joined to the shared
    // GPS layer, instead of a dynamic Google map.
    const OSM = window.NamibiaOSM;
    if (OSM && OSM.hasLeaflet()) {
      const host = document.getElementById('stepModalMap');
      if (!modalMap) {
        modalMap = OSM.createMap(host, { center: [step.lat, step.lng], zoom: 12 });
        if (modalMap) { OSM.registerMap(modalMap); modalLayers = []; }
      }
      if (modalMap) {
        modalLayers.forEach(l => { try { modalMap.removeLayer(l); } catch (_) {} });
        modalLayers = [];
        const a = { lat: step.lat, lng: step.lng };
        const b = { lat: step.endLat || step.lat, lng: step.endLng || step.lng };
        let slice = [];
        try { slice = pathSlice(route.overviewPath || [], a, b) || []; } catch (_) {}
        if (slice.length < 2) slice = [a, b];
        const status = (stepHeatherPart(day(), route, legIdx, stepIdx) || {}).status || 'no';
        const color = (OSM.COLORS && OSM.COLORS[status]) || '#dc2626';
        try {
          const latlngs = slice.map(p => [Number(p.lat), Number(p.lng)]);
          modalLayers.push(window.L.polyline(latlngs, { color, weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(modalMap));
          modalLayers.push(window.L.circleMarker([a.lat, a.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).addTo(modalMap));
          modalLayers.push(window.L.circleMarker([b.lat, b.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }).addTo(modalMap));
          const bounds = window.L.latLngBounds(latlngs);
          // The modal was display:none — Leaflet must recompute size now it's shown.
          setTimeout(() => {
            try {
              modalMap.invalidateSize();
              if (bounds.isValid()) modalMap.fitBounds(bounds, { padding: [30, 30] });
              OSM.updateAllGps();
            } catch (_) {}
          }, 80);
        } catch (_) {}
      }
    }
  }

  // ---- Render extensions ----
  if (typeof renderTab === 'function') {
    const baseRenderTab = renderTab;
    renderTab = function patchedRenderTabV12() {
      baseRenderTab();
      const d = day();
      const route = state.renderedRoutes[d.date];
      if (!route) return;
      // Decorate on-demand if needed (e.g. cache exists from v5 without enrichment).
      if (route.legs && route.schemaVersion !== 9) decorateRoute(d, route);

      if (state.activeTab === 'overview') extendOverviewTab(d, route);
      else if (state.activeTab === 'directions') extendDirectionsTab(d, route);
    };
  }

  function extendOverviewTab(d, route) {
    if (!route.sunTimes || !ST) return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    if (tc.querySelector('.sun-line')) return;
    const sunrise = ST.formatTimeOfDay(route.sunTimes.sunriseMs);
    const sunset = ST.formatTimeOfDay(route.sunTimes.sunsetMs);
    const etaFromStart = ST.etaFromCurrentStep(route, { legIdx: 0, stepIdx: 0, distToStepM: 0 }, Date.parse(d.date + 'T08:00:00+02:00'));
    const margin = ST.sunsetMargin(etaFromStart, route.sunTimes.sunsetMs);
    const driveMin = Math.round((etaFromStart - Date.parse(d.date + 'T08:00:00+02:00')) / 60000);
    const icon = margin.severity === 'safe' ? '✅' : margin.severity === 'tight' ? '⚠️' : '🛑';
    const html = `<div class="sun-line sun-${margin.severity}">
      🌄 Sunrise <strong>${sunrise}</strong> ·
      🌅 Sunset <strong>${sunset}</strong> ·
      Drive ETA from 08:00 start: <strong>${ST.formatRelative(driveMin)}</strong>
      <br><span class="sun-margin">Daylight margin: <strong>${margin.marginMin >= 0 ? '+' : ''}${margin.marginMin} min</strong> ${icon}</span>
    </div>`;
    const title = tc.querySelector('.panel-title');
    if (title) title.insertAdjacentHTML('afterend', html);
    else tc.insertAdjacentHTML('afterbegin', html);
  }

  // Pick an emoji for the direction indicator on each step. Uses the step's
  // own heading-of-travel and intent (turn vs. continue) where possible.
  function directionEmojiFor(step, prevHeading) {
    const instr = String(step.instruction || '').toLowerCase();
    if (instr.includes('u-turn') || instr.includes('uturn')) return '↩️';
    if (instr.includes('arrive') || instr.includes('destination')) return '🏁';
    if (instr.includes('roundabout') || instr.includes('rotary')) return '🔄';
    if (instr.includes('exit')) return '↗️';
    if (instr.includes('merge')) return '🔀';
    if (instr.match(/\bsharp left\b/)) return '↖️';
    if (instr.match(/\bsharp right\b/)) return '↗️';
    if (instr.match(/\bslight left\b/) || instr.match(/\bbear left\b/)) return '↖️';
    if (instr.match(/\bslight right\b/) || instr.match(/\bbear right\b/)) return '↗️';
    if (instr.match(/\bturn left\b|\bkeep left\b/)) return '⬅️';
    if (instr.match(/\bturn right\b|\bkeep right\b/)) return '➡️';
    // For "continue", "head", or no explicit direction word: use the heading.
    if (typeof step.heading === 'number') {
      const h = ((step.heading % 360) + 360) % 360;
      if (h < 22.5 || h >= 337.5) return '⬆️';
      if (h < 67.5)  return '↗️';
      if (h < 112.5) return '➡️';
      if (h < 157.5) return '↘️';
      if (h < 202.5) return '⬇️';
      if (h < 247.5) return '↙️';
      if (h < 292.5) return '⬅️';
      return '↖️';
    }
    return '•';
  }

  // Heather partition info for a single step (status + label + reason).
  function stepHeatherPart(d, route, legIdx, stepIdx) {
    if (window.NamibiaV19?.partitionForStep) {
      return window.NamibiaV19.partitionForStep(route, d, legIdx, stepIdx);
    }
    return null;
  }

  const HEATHER_EMOJI = { yes: '🟢', maybe: '🟡', no: '🔴' };

  function extendDirectionsTab(d, route) {
    if (!route.legs) return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const ols = tc.querySelectorAll('.directions ol');
    route.legs.forEach((leg, li) => {
      const ol = ols[li];
      if (!ol) return;
      const lis = ol.querySelectorAll('li');
      // Track the last Heather partition we showed a "reason" for; only show
      // the reason text on the FIRST step within each contiguous segment.
      let prevPartKey = null;
      leg.steps.forEach((step, si) => {
        const liEl = lis[si];
        if (!liEl) return;
        // Idempotent: skip only if the chip + media + dir are all present.
        if (liEl.querySelector('.step-heather-chip')
            && liEl.querySelector('.step-media')
            && liEl.querySelector('.step-dir')) return;
        // If a partial render exists (e.g. media but no chip), wipe it so we
        // rebuild cleanly with the current v12+v19 outputs.
        liEl.querySelectorAll('.step-media, .step-expand, .step-heather-chip, .step-heather-reason, .step-dir').forEach(n => n.remove());
        // Strip any class from a prior render.
        liEl.classList.remove('step-heather-yes', 'step-heather-maybe', 'step-heather-no');
        liEl.classList.add('step');

        const part = stepHeatherPart(d, route, li, si);
        const hs = part?.status || 'no';
        liEl.classList.add('step-heather-' + hs);

        // Heather chip only — the segment reason lives in the chip's tooltip
        // and in the v22 conditions accordion. We no longer render a separate
        // colored reason block (was too visually noisy).
        const emoji = HEATHER_EMOJI[hs] || '⚪';
        const label = part?.label || (hs === 'yes' ? 'Heather OK' : hs === 'maybe' ? 'Heather maybe' : 'David drives');
        const reason = part?.reason || '';
        const partKey = part ? `${part.fromIdx}-${part.toIdx}-${part.status}` : 'none';
        prevPartKey = partKey;
        const chip = `<span class="step-heather-chip step-heather-chip-${hs}" title="${esc(reason)}">${emoji} ${esc(label)}</span>`;
        const reasonBlock = '';

        const dirEmoji = directionEmojiFor(step);
        const dirSpan = `<span class="step-dir" title="Direction of travel">${dirEmoji}</span> `;
        const expand = `<button class="step-expand" data-leg="${li}" data-step="${si}" aria-label="Expand step on map">🗺️</button>`;
        // The per-step map is now a live OpenStreetMap frame (v36) instead of a
        // Google static image — lazily initialised when scrolled into view.
        const media = `<div class="step-media">
          ${typeof step.lat === 'number' ? `<div class="step-map-osm" data-leg="${li}" data-step="${si}" data-status="${hs}"></div>` : ''}
          ${step.streetViewUrl ? `<img class="step-streetview" loading="lazy" src="${esc(step.streetViewUrl)}" alt="Street view at step ${si + 1}">` : ''}
        </div>`;

        // Insert: dir-emoji at start, then chip after the existing instruction text,
        // then optional reason block, then expand + media at the end.
        liEl.insertAdjacentHTML('afterbegin', dirSpan);
        liEl.insertAdjacentHTML('beforeend', ' ' + chip + reasonBlock + ' ' + expand + media);
      });
    });
    tc.querySelectorAll('.step-expand').forEach(b => {
      b.onclick = () => openStepModal(Number(b.dataset.leg), Number(b.dataset.step));
    });
  }

  // Expose helpers for tests and v13/v14.
  // Nearest 5 km Street-View frame to the current GPS, by route progress (not
  // Euclidean — avoids picking the wrong frame at hairpins). Returns a freshly
  // built URL (deterministic params → SW-cache hit) or '' when unavailable.
  function svFrameUrlForGps(route, gps) {
    const frames = route && route.svFrames;
    if (!frames || !frames.length || !gps) return '';
    const path = route.overviewPath || [];
    let progress = 0;
    try { progress = DC.routeProgressM ? DC.routeProgressM(path, gps) : 0; } catch (_) { progress = 0; }
    let best = frames[0], bestD = Infinity;
    for (const f of frames) {
      const dd = Math.abs(f.distM - progress);
      if (dd < bestD) { bestD = dd; best = f; }
    }
    return stepStreetViewUrl(best.lat, best.lng, best.heading) || best.url || '';
  }

  window.NamibiaV12 = {
    decorateRoute, buildCards, computeSunTimes,
    encodePolyline, sampledPath, pathSlice, svFrameUrlForGps,
    stepStaticMapUrl, stepStreetViewUrl, ttsTextFor, openStepModal
  };

  if (typeof render === 'function') render();
})();
