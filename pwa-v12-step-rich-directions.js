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

  function stepStaticMapUrl(slice, a, b) {
    if (!state.apiKey) return '';
    const params = new URLSearchParams({
      size: '320x200', scale: '2', maptype: 'roadmap', key: state.apiKey
    });
    params.append('path', `color:0x5a1738ff|weight:5|enc:${encodePolyline(sampledPath(slice))}`);
    params.append('markers', `color:0x5a1738|label:A|${a.lat},${a.lng}`);
    params.append('markers', `color:0x999999|label:B|${b.lat},${b.lng}`);
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  }

  function stepStreetViewUrl(lat, lng, heading) {
    if (!state.apiKey) return '';
    const p = new URLSearchParams({
      size: '320x180',
      location: `${lat},${lng}`,
      heading: String(Math.round(heading || 0)),
      pitch: '0', fov: '90', source: 'outdoor', key: state.apiKey
    });
    return 'https://maps.googleapis.com/maps/api/streetview?' + p.toString();
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
  function buildCards(d, legs) {
    const cards = [];
    const date = d.date;
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
    // Insert fuel/pressure cards near the closest mandatory stop with that note.
    const stops = (d.stops || []).filter(s => s.routeRole === 'mandatory' || s.routeRole === 'mandatoryAction');
    stops.forEach(s => {
      if (s.pressure) {
        const isLower = /lower|deflate|drop|sand|gravel/i.test(s.pressure);
        cards.push({
          kind: 'pressure',
          stopName: s.name,
          lat: s.lat, lng: s.lng,
          title: `${isLower ? 'Lower' : 'Raise'} tyre pressure — ${s.name}`,
          body: s.pressure,
          ttsKey: isLower ? 'pressure_lower' : 'pressure_raise',
          ttsText: isLower
            ? `Tyre pressure action coming up. Lower pressure before the next section.`
            : `Tyre pressure action coming up. Raise pressure for the upcoming road.`,
          triggerRadiusM: 1500
        });
      }
      if (s.fuel) {
        cards.push({
          kind: 'fuel',
          stopName: s.name,
          lat: s.lat, lng: s.lng,
          title: `Fuel stop — ${s.name}`,
          body: s.fuel,
          ttsKey: 'fuel_stop',
          ttsText: `Fuel stop coming up. Top up at ${s.name}.`,
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
    });
    // Merge.
    const merged = [];
    stepCards.forEach((sc, i) => {
      merged.push(sc);
      eventCards.filter(ev => ev._insertAfter === i).forEach(ev => merged.push(ev));
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
        step.heading = DC.bearingForStreetView(step, next);
        const slice = pathSlice(overviewPath, { lat: step.lat, lng: step.lng }, { lat: step.endLat, lng: step.endLng });
        step.stepMapUrl = stepStaticMapUrl(slice, { lat: step.lat, lng: step.lng }, { lat: step.endLat, lng: step.endLng });
        step.streetViewUrl = stepStreetViewUrl(step.lat, step.lng, step.heading);
        step.ttsText = ttsTextFor(step);
        step.ttsKey = `step-${d.date}-${leg.__legIdx ?? ''}-${i}`;
      });
    });
    // tag legs with their index for ttsKey uniqueness
    route.legs.forEach((leg, li) => { leg.__legIdx = li; });
    route.cards = buildCards(d, route.legs);
    route.sunTimes = computeSunTimes(d);
    route.schemaVersion = 6;
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
      if (r && r.legs && r.schemaVersion !== 6) decorateRoute(d, r);
    }
  }
  decorateAllCached();

  // ---- Modal with shared interactive map ----
  let modalEl = null, modalMap = null;
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
    if (window.google?.maps && !modalMap) {
      modalMap = new google.maps.Map(document.getElementById('stepModalMap'), {
        center: { lat: step.lat, lng: step.lng }, zoom: 12,
        streetViewControl: false, fullscreenControl: true
      });
    }
    if (modalMap) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: step.lat, lng: step.lng });
      bounds.extend({ lat: step.endLat || step.lat, lng: step.endLng || step.lng });
      modalMap.fitBounds(bounds, 60);
      // Best-effort: draw polyline for the slice if overviewPath cached.
      const route = state.renderedRoutes[day().date];
      if (route?.overviewPath) {
        const slice = pathSlice(route.overviewPath, { lat: step.lat, lng: step.lng }, { lat: step.endLat || step.lat, lng: step.endLng || step.lng });
        if (window.__stepModalPolyline) window.__stepModalPolyline.setMap(null);
        window.__stepModalPolyline = new google.maps.Polyline({
          path: slice, map: modalMap, strokeColor: '#5a1738', strokeWeight: 5, strokeOpacity: 0.95
        });
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
      if (route.legs && route.schemaVersion !== 6) decorateRoute(d, route);

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

  function extendDirectionsTab(d, route) {
    if (!route.legs) return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const ols = tc.querySelectorAll('.directions ol');
    route.legs.forEach((leg, li) => {
      const ol = ols[li];
      if (!ol) return;
      const lis = ol.querySelectorAll('li');
      leg.steps.forEach((step, si) => {
        const liEl = lis[si];
        if (!liEl) return;
        if (liEl.querySelector('.step-media')) return;
        liEl.classList.add('step');
        const expand = `<button class="step-expand" data-leg="${li}" data-step="${si}" aria-label="Expand step on map">🗺️</button>`;
        const media = `<div class="step-media">
          ${step.stepMapUrl ? `<img class="step-map" loading="lazy" src="${esc(step.stepMapUrl)}" alt="Map of step ${si + 1}">` : ''}
          ${step.streetViewUrl ? `<img class="step-streetview" loading="lazy" src="${esc(step.streetViewUrl)}" alt="Street view at step ${si + 1}">` : ''}
        </div>`;
        liEl.insertAdjacentHTML('beforeend', ' ' + expand + media);
      });
    });
    tc.querySelectorAll('.step-expand').forEach(b => {
      b.onclick = () => openStepModal(Number(b.dataset.leg), Number(b.dataset.step));
    });
  }

  // Expose helpers for tests and v13/v14.
  window.NamibiaV12 = {
    decorateRoute, buildCards, computeSunTimes,
    encodePolyline, sampledPath, pathSlice,
    stepStaticMapUrl, stepStreetViewUrl, ttsTextFor, openStepModal
  };

  if (typeof render === 'function') render();
})();
