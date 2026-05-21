// Namibia PWA v13 patch — Driving Dashboard.
// Replaces the Street View tab content with a GPS-driven scrolling card stream,
// a sticky header (mute / replay / sun chip), and a live map. Cards include
// upcoming turns, fuel/pressure warnings, sunset-risk warnings, and arrival.
//
// Spoofing seam for tests:
//   window.__namibiaSpoofGps({lat, lng})
//   window.__namibiaSpoofTrack([{lat, lng, t?}, ...])
//   window.__namibiaSpoofClock(ms)   // freezes Date.now()
//
// URL param ?spoof=lat,lng triggers __namibiaSpoofGps on load.
(function () {
  const DC = window.NamibiaDrivingCore;
  const ST = window.NamibiaSunTimes;
  const TTS = () => window.NamibiaTTS; // lazy — v14 loads after v13

  // Expose `state` on window so tests (Playwright, anything outside the classic
  // script scope) can read it. The patches themselves access `state` via the
  // global lexical env; this is purely a test-seam.
  try { window.state = state; window.__namibiaState = state; } catch (_) {}

  state.driving = state.driving || {
    legIdx: 0, stepIdx: 0,
    distToNextTurnM: Infinity,
    activeCardIndex: -1,
    lastSunsetSeverity: 'safe',
    lastThresholdByCard: {},
    prevDistByCard: {},
    lastSpokenText: ''
  };

  // Surface a "last spoken" indicator in the dashboard so the user can see
  // what TTS just fired even if audio is muted on their device.
  window.addEventListener('namibia-tts-spoke', e => {
    if (!state.driving) return;
    state.driving.lastSpokenText = e.detail?.text || e.detail?.ttsKey || '';
    if (state.activeTab === 'street') {
      const ind = document.querySelector('.tts-indicator');
      if (ind) ind.textContent = '🔊 ' + state.driving.lastSpokenText.slice(0, 100);
      else if (typeof renderTab === 'function') renderTab();
    }
  });

  // ---- Clock seam ----
  let spoofedNow = null;
  window.__namibiaSpoofClock = (ms) => { spoofedNow = ms; renderTab(); };
  window.__namibiaSpoofClockSilent = (ms) => { spoofedNow = ms; };  // no renderTab cascade
  window.__namibiaUnspoofClock = () => { spoofedNow = null; renderTab(); };
  function nowMs() { return spoofedNow != null ? spoofedNow : Date.now(); }

  // ---- GPS spoofing seam ----
  function pushGps(p) {
    state.gps = { lat: Number(p.lat), lng: Number(p.lng), accuracy: Number(p.accuracy) || 30 };
    setStatus('gpsStatus', `GPS: spoofed (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`);
    onGpsUpdate();
    if (typeof render === 'function') render();
  }
  // Silent variant: update state + dashboard partial-render only. Used by
  // demo mode so we don't burn 20 full renderTab cascades per second.
  function pushGpsSilent(p) {
    state.gps = { lat: Number(p.lat), lng: Number(p.lng), accuracy: Number(p.accuracy) || 30 };
    onGpsUpdate();
  }
  window.__namibiaSpoofGps = pushGps;
  window.__namibiaSpoofGpsSilent = pushGpsSilent;
  let trackTimer = null;
  window.__namibiaSpoofTrack = function (points, opts) {
    if (trackTimer) clearInterval(trackTimer);
    opts = opts || {};
    const ms = opts.intervalMs || 600;
    let i = 0;
    pushGps(points[0]);
    if (points.length === 1) return;
    trackTimer = setInterval(() => {
      i++;
      if (i >= points.length) { clearInterval(trackTimer); trackTimer = null; return; }
      pushGps(points[i]);
    }, ms);
  };

  // ---- GPS handler — fires for each watchPosition tick & each spoofed push ----
  function onGpsUpdate() {
    const d = day();
    const route = state.renderedRoutes?.[d.date];
    if (!route?.legs || !state.gps) return;
    const cur = DC.findCurrentStep(state.gps, route);
    if (cur.offRoute) {
      state.driving.offRoute = true;
    } else {
      state.driving.offRoute = false;
      state.driving.legIdx = cur.legIdx;
      state.driving.stepIdx = cur.stepIdx;
      state.driving.distToStepM = cur.distToStepM;
      state.driving.distToNextTurnM = cur.distToNextTurnM;
    }

    // Active card (auto-scroll target). Progress-based + monotonic so it steps
    // through EVERY card in route order — the old 2-D nearest-card jumped around
    // and skipped short turns + the pressure/fuel cards entirely.
    const prevActive = state.driving.activeCardIndex;
    // In demo mode the demo dictates a monotonic active index (visits every
    // card in order); real driving reverse-maps GPS → nearest card ahead.
    const activeIdx = (state.driving.demoMode && typeof state.driving.demoActiveIdx === 'number')
      ? state.driving.demoActiveIdx
      : DC.activeCardIndex(state.gps, route);
    state.driving.activeCardIndex = activeIdx;

    if (state.driving.demoMode) {
      // The demo's GPS jumps >1 km per tick, which skips the distance
      // thresholds below — so announce as we ADVANCE past cards. Among the
      // cards newly reached this tick, prefer an event card (pressure / fuel /
      // sunset) and force it past the throttle so the safety warning is never
      // silently dropped; otherwise voice the latest turn.
      const lastAnn = (typeof state.driving._lastAnnouncedIdx === 'number') ? state.driving._lastAnnouncedIdx : -1;
      if (activeIdx > lastAnn && route.cards) {
        let pick = null, pickIsEvent = false;
        for (let i = lastAnn + 1; i <= activeIdx; i++) {
          const c = route.cards[i];
          if (!c || !c.ttsKey) continue;
          const isEvent = c.kind === 'pressure' || c.kind === 'fuel' || c.kind === 'sunset_risk';
          if (isEvent) { pick = c; pickIsEvent = true; break; }
          pick = c;
        }
        const tts = TTS();
        if (tts && pick) tts.speak(pick.ttsKey, pick.ttsText, pickIsEvent ? { force: true } : undefined);
        state.driving._lastAnnouncedIdx = activeIdx;
      }
    } else if (route.cards) {
      // Real driving: distance-threshold advance warnings (2 km / 500 m / 100 m
      // / arrive) for every card still ahead of the active one.
      route.cards.forEach((card, idx) => {
        const d2 = DC.distMeters(state.gps, card);
        const prev = state.driving.prevDistByCard[card.cardId];
        const last = state.driving.lastThresholdByCard[card.cardId] || null;
        const fired = DC.ttsTriggerThresholds(prev, d2, last);
        if (fired && idx >= activeIdx) {
          state.driving.lastThresholdByCard[card.cardId] = fired;
          const tts = TTS();
          if (tts && card.ttsKey) tts.speak(card.ttsKey, card.ttsText);
        }
        state.driving.prevDistByCard[card.cardId] = d2;
      });
    }

    // Sunset risk.
    evaluateSunsetRisk(route);

    // Rain warning: announce once when entering a stretch the forecast says is
    // rainy (weather attached per-step by v23), reset when it clears so the
    // next rainy run warns again.
    const curStep = route.legs?.[state.driving.legIdx]?.steps?.[state.driving.stepIdx];
    const rainyAhead = !state.driving.offRoute && !!(curStep && curStep.weatherAtEta && curStep.weatherAtEta.rainy);
    if (rainyAhead && !state.driving._rainWarned) {
      state.driving._rainWarned = true;
      const tts = TTS();
      if (tts) tts.speak('rain_warning', null, { force: true });
    } else if (!rainyAhead && state.driving._rainWarned) {
      state.driving._rainWarned = false;
    }

    // Re-render the dashboard if it's active, and auto-scroll on card change.
    if (state.activeTab === 'street') {
      renderDashboardLive(route, prevActive !== state.driving.activeCardIndex);
    }
  }

  function evaluateSunsetRisk(route) {
    if (!ST || !route?.sunTimes) return;
    const etaMs = ST.etaFromCurrentStep(route, {
      legIdx: state.driving.legIdx, stepIdx: state.driving.stepIdx,
      distToStepM: state.driving.distToStepM
    }, nowMs());
    const margin = ST.sunsetMargin(etaMs, route.sunTimes.sunsetMs);
    state.driving.sunsetMargin = margin;
    state.driving.eta = etaMs;
    if (margin.severity !== state.driving.lastSunsetSeverity) {
      const transition = state.driving.lastSunsetSeverity + '->' + margin.severity;
      state.driving.lastSunsetSeverity = margin.severity;
      if (margin.severity === 'tight' || margin.severity === 'risk') {
        const tts = TTS();
        // Force past the demo throttle — a "behind schedule for sunset" warning
        // is safety-critical and must always be heard.
        if (tts) tts.speak(margin.severity === 'risk' ? 'sunset_risk_warning' : 'sunset_risk_tight', null, { force: true });
      }
      state.driving.lastSunsetTransition = transition;
    }
  }

  // ---- watchPosition wrap so spoof + real both flow through onGpsUpdate ----
  if (typeof useGps === 'function') {
    const baseUseGps = useGps;
    useGps = function patchedUseGps() {
      if (!navigator.geolocation) { setStatus('gpsStatus', 'GPS unsupported'); return; }
      setStatus('gpsStatus', 'GPS: requesting…');
      navigator.geolocation.watchPosition(pos => {
        state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setStatus('gpsStatus', `GPS: ${Math.round(pos.coords.accuracy)}m`);
        onGpsUpdate();
        if (typeof render === 'function') render();
      }, err => {
        setStatus('gpsStatus', 'GPS failed');
        if (typeof log === 'function') log('GPS error: ' + err.message);
      }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
    };
  }

  // ---- Dashboard renderer ----
  // Rename the two tabs that mean different things during a road trip:
  //   "Directions" → "Passenger"  (rich detail, time to read)
  //   "Street View" → "Driver"     (live GPS-driven dashboard, eyes-on-road)
  function relabelStreetTab() {
    const driveBtn = document.querySelector('.tab[data-tab="street"]');
    if (driveBtn && driveBtn.textContent !== 'Driver') driveBtn.textContent = 'Driver';
    const passBtn = document.querySelector('.tab[data-tab="directions"]');
    if (passBtn && passBtn.textContent !== 'Passenger') passBtn.textContent = 'Passenger';
  }

  // Current-leg Heather chip + compact sequential bar with "you are here".
  function heatherStripHtml(route) {
    const V38 = window.NamibiaV38, DC = window.NamibiaDrivingCore;
    if (!V38 || !V38.heatherBarHtml || !route || !route.legs || !route.legs.length) return '';
    let chip = '';
    try {
      const leg = DC.legAtProgress(route, state.gps);
      if (leg) {
        const col = { yes: '#15803d', maybe: '#eab308', no: '#dc2626' }[leg.status] || '#6b7280';
        const st = (V38.STATUS_BAR && V38.STATUS_BAR[leg.status]) || { emoji: '', who: '' };
        chip = `<span class="heather-leg-chip heather-${leg.status}"><span class="heather-leg-dot" style="background:${col}"></span>${st.emoji} ${st.who} · ${V38.surfLabel(leg.surface)}</span>`;
      }
    } catch (_) {}
    let bar = '';
    try { bar = V38.heatherBarHtml(route, { compact: true, showHere: true }); } catch (_) {}
    if (!chip && !bar) return '';
    // Scrubber: drag to jump the card list (and its Street View) to any point
    // along the route — the card nearest that position.
    const scrub = `<div class="drive-scrub-row">`
      + `<input type="range" class="drive-scrub" min="0" max="1000" value="0" aria-label="Scrub along the route to a card">`
      + `<span class="drive-scrub-lbl"></span></div>`;
    return `<div class="drive-heather">${chip}${bar}${scrub}</div>`;
  }

  // Map a 0..1 route fraction to the nearest card and scroll only the card
  // list. Using element.scrollIntoView() here can move the whole page on
  // mobile, which pulls the scrubber out from under the user's finger.
  let _scrubProg = null, _scrubKey = null;
  function cardRouteFractions(route) {
    const d = (typeof day === 'function') ? day() : null;
    const key = (d ? d.date : '') + ':' + ((route.cards || []).length);
    if (_scrubKey === key && _scrubProg) return _scrubProg;
    const path = route.overviewPath || [];
    const total = path.length ? (DC.routeProgressM(path, path[path.length - 1]) || 1) : 1;
    _scrubProg = (route.cards || []).map(c =>
      (typeof c.lat === 'number' && path.length) ? (DC.routeProgressM(path, { lat: c.lat, lng: c.lng }) / total) : null);
    _scrubKey = key;
    return _scrubProg;
  }
  function scrollCardListTo(el) {
    const host = el && el.closest && el.closest('.drive-cards');
    if (!host) return;
    const top = el.offsetTop - host.offsetTop - Math.max(12, (host.clientHeight - el.clientHeight) / 2);
    host.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  }
  function scrubTo(frac) {
    const d = (typeof day === 'function') ? day() : null;
    const route = d && state.renderedRoutes && state.renderedRoutes[d.date];
    if (!route || !route.cards) return;
    const fr = cardRouteFractions(route);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < fr.length; i++) { if (fr[i] == null) continue; const dd = Math.abs(fr[i] - frac); if (dd < bestD) { bestD = dd; best = i; } }
    if (best < 0) return;
    const c = route.cards[best];
    const el = document.querySelector(`.drive-card[data-card-index="${best}"]`);
    document.querySelectorAll('.drive-card.card-scrubbed').forEach(card => {
      if (card !== el) card.classList.remove('card-scrubbed');
    });
    if (el) {
      scrollCardListTo(el);
      el.classList.add('card-scrubbed');
      setTimeout(() => el.classList.remove('card-scrubbed'), 1200);
    }
    const lbl = document.querySelector('.drive-scrub-lbl');
    if (lbl && c) lbl.textContent = `${kindEmoji(c.kind)} ${c.title ? String(c.title).slice(0, 38) : c.kind}`;
  }
  document.addEventListener('input', e => {
    const s = e.target && e.target.classList && e.target.classList.contains('drive-scrub') ? e.target : null;
    if (s) scrubTo(Number(s.value) / 1000);
  });

  function stickyInnerHtml(d, route) {
    const muted = TTS() ? TTS().isMuted() : true;
    const margin = state.driving.sunsetMargin;
    const sunriseLocal = route?.sunTimes ? ST.formatTimeOfDay(route.sunTimes.sunriseMs) : '--:--';
    const sunsetLocal = route?.sunTimes ? ST.formatTimeOfDay(route.sunTimes.sunsetMs) : '--:--';
    const now = nowMs();
    const isPreDawn = route?.sunTimes && now < route.sunTimes.sunriseMs;
    let sunChip;
    if (isPreDawn) {
      const minToSunrise = Math.round((route.sunTimes.sunriseMs - now) / 60000);
      sunChip = `<span class="sun-chip sun-predawn">🌄 Sunrise <strong>${sunriseLocal}</strong> in ${ST.formatRelative(minToSunrise)}</span>`;
    } else if (margin) {
      const etaLocal = state.driving.eta ? ST.formatTimeOfDay(state.driving.eta) : '--:--';
      const clockLocal = ST.formatTimeOfDay(nowMs());
      sunChip = `<span class="sun-chip sun-${margin.severity}">🕒 <strong>${clockLocal}</strong> · 🌅 Sunset <strong>${sunsetLocal}</strong> · ETA <strong>${etaLocal}</strong> · margin <strong>${margin.marginMin >= 0 ? '+' : ''}${margin.marginMin} min</strong></span>`;
    } else {
      sunChip = `<span class="sun-chip">🌅 Sunset <strong>${sunsetLocal}</strong></span>`;
    }
    const lastSpoken = (typeof state.driving.lastSpokenText === 'string') ? state.driving.lastSpokenText : '';
    return `
      <div class="drive-controls">
        <span class="chip gps-chip">${state.gps ? `GPS ${state.gps.lat.toFixed(3)},${state.gps.lng.toFixed(3)}` : 'GPS: not active'}</span>
        <button id="ttsMute" class="ghost" aria-pressed="${muted}">${muted ? '🔇 Unmute' : '🔊 Mute'}</button>
        <button id="ttsReplay" class="ghost">↺ Replay</button>
        <button id="centerCurrent" class="ghost" title="Scroll back to the current step">📍 Center</button>
      </div>
      ${sunChip}
      ${heatherStripHtml(route)}
      ${lastSpoken ? `<div class="tts-indicator">🔊 ${esc(lastSpoken.slice(0, 100))}</div>` : ''}`;
  }

  // For long active steps (think 85 km on B1), the cached Street View at
  // the step's START is no longer relevant — drivers are 30 km into it.
  // Compute a fresh Street View URL anchored at the current GPS position.
  function dynamicStreetViewUrl() {
    if (!state.gps || !state.apiKey) return null;
    // Prefer the pre-sampled 5 km grid frame nearest our route progress, so the
    // image is stable across a whole 5 km band (cacheable) instead of a fresh
    // fetch every GPS tick.
    try {
      const d = (typeof day === 'function') ? day() : null;
      const route = d && state.renderedRoutes && state.renderedRoutes[d.date];
      const f = window.NamibiaV12 && window.NamibiaV12.svFrameUrlForGps && window.NamibiaV12.svFrameUrlForGps(route, state.gps);
      if (f) return f;
    } catch (_) {}
    const heading = state.driving?.heading ?? 0;
    const p = new URLSearchParams({
      size: '320x180',
      location: `${state.gps.lat},${state.gps.lng}`,
      heading: String(Math.round(heading || 0)),
      pitch: '0', fov: '90', source: 'outdoor', radius: '300',
      key: state.apiKey
    });
    return 'https://maps.googleapis.com/maps/api/streetview?' + p.toString();
  }

  // ---- Live OSM mini-map per card (replaces the old Google static screenshot).
  // The cards list innerHTML is rebuilt periodically (≤5 s + on active-card
  // change), which would destroy a naive Leaflet map and flicker. So we OWN the
  // Leaflet container node, cache it by a stable card key, and re-parent it into
  // the freshly-built placeholder on each rebuild — the map (and its loaded
  // tiles) survive untouched. Each card map joins the shared GPS layer so the
  // blue dot + accuracy ring follow along on every card too.
  const cardMapByKey = new Map(); // key -> { inner, map }

  function cardKey(c, i) {
    const la = typeof c.lat === 'number' ? c.lat.toFixed(4) : 'x';
    const lo = typeof c.lng === 'number' ? c.lng.toFixed(4) : 'x';
    return `${c.kind || 'card'}|${la},${lo}|${c.legIdx ?? ''}-${c.stepIdx ?? ''}`;
  }

  function buildCardMap(ph, d, route) {
    const OSM = window.NamibiaOSM;
    if (!OSM || !OSM.hasLeaflet()) return null;
    const lat = parseFloat(ph.dataset.lat), lng = parseFloat(ph.dataset.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    const inner = document.createElement('div');
    inner.className = 'card-map-inner';
    ph.innerHTML = '';
    ph.appendChild(inner);
    const map = OSM.createMap(inner, {
      center: [lat, lng], zoom: 14,
      zoomControl: false, attributionControl: false,
      scrollWheelZoom: false, dragging: false, tap: false,
      zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false
    });
    if (!map) return null;
    try { map.doubleClickZoom.disable(); map.boxZoom.disable(); map.keyboard.disable(); } catch (_) {}

    const legIdx = ph.dataset.leg !== '' ? Number(ph.dataset.leg) : null;
    const stepIdx = ph.dataset.step !== '' ? Number(ph.dataset.step) : null;
    let bounds = null;
    try {
      const leg = (legIdx != null) ? route?.legs?.[legIdx] : null;
      const step = (leg && stepIdx != null) ? leg.steps[stepIdx] : null;
      if (step && window.NamibiaV12?.pathSlice) {
        // Turn card → draw the step's road slice, Heather-colored.
        const a = { lat: step.lat, lng: step.lng };
        const nx = leg.steps[stepIdx + 1];
        const b = nx ? { lat: nx.lat, lng: nx.lng }
          : { lat: (typeof step.endLat === 'number' ? step.endLat : a.lat), lng: (typeof step.endLng === 'number' ? step.endLng : a.lng) };
        let slice = window.NamibiaV12.pathSlice(route.overviewPath || [], a, b) || [];
        if (slice.length < 2) slice = [a, b];
        const status = window.NamibiaV19?.partitionForStep?.(route, d, legIdx, stepIdx)?.status || 'no';
        const color = (OSM.COLORS && OSM.COLORS[status]) || '#dc2626';
        const ll = slice.map(p => [Number(p.lat), Number(p.lng)]);
        window.L.polyline(ll, { color, weight: 9, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        // Surface (dash/dot) overlay so the card map matches every other map.
        const surf = step.surface || (window.NamibiaV22 && window.NamibiaV22.classifyRoad ? window.NamibiaV22.classifyRoad(step.instruction, d).type : null);
        if (OSM.addSurfaceOverlay) OSM.addSurfaceOverlay(map, ll, surf);
        window.L.circleMarker([a.lat, a.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1, interactive: false }).addTo(map);
        window.L.circleMarker([b.lat, b.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1, interactive: false }).addTo(map);
        bounds = window.L.latLngBounds(ll);
      } else {
        // Point card (fuel / pressure / arrival / sunset risk) → a single pin.
        const kindColor = { fuel: '#0ea5e9', pressure: '#7c3aed', arrival: '#16a34a', sunset_risk: '#dc2626' };
        // Mandatory pressure change → a direction badge (▼ lower / ▲ raise).
        let pd = null;
        if (ph.dataset.kind === 'pressure' && window.NamibiaV25 && window.NamibiaV25.mandatoryPressureDir) {
          const near = (d.stops || []).filter(s => typeof s.lat === 'number')
            .map(s => ({ s, dd: Math.hypot(s.lat - lat, s.lng - lng) }))
            .sort((a, b) => a.dd - b.dd)[0];
          if (near && near.dd < 0.03) pd = window.NamibiaV25.mandatoryPressureDir(near.s);
        }
        if (pd) {
          const col = pd === 'down' ? '#ea580c' : '#2563eb';
          const html = `<div style="width:24px;height:24px;border-radius:50%;background:${col};color:#fff;`
            + `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;`
            + `justify-content:center;font-size:13px;font-weight:800;line-height:1">${pd === 'down' ? '▼' : '▲'}</div>`;
          window.L.marker([lat, lng], { icon: window.L.divIcon({ className: 'card-press-icon', html, iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false }).addTo(map);
        } else {
          const col = kindColor[ph.dataset.kind] || '#5a1738';
          window.L.circleMarker([lat, lng], { radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1, interactive: false }).addTo(map);
        }
        bounds = window.L.latLngBounds([[lat, lng]]);
      }
    } catch (_) {}

    setTimeout(() => {
      try {
        map.invalidateSize();
        if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [14, 14], maxZoom: 15 });
        else map.setView([lat, lng], 14);
        OSM.updateAllGps();
      } catch (_) {}
    }, 60);
    OSM.registerMap(map);
    return { inner, map };
  }

  function initCardMaps() {
    const OSM = window.NamibiaOSM;
    if (!OSM || !OSM.hasLeaflet() || state.activeTab !== 'street') return;
    const d = day();
    const route = state.renderedRoutes?.[d.date];
    const placeholders = document.querySelectorAll('.drive-cards .card-map-osm');
    const seen = new Set();
    placeholders.forEach(ph => {
      const key = ph.dataset.cardKey;
      seen.add(key);
      const entry = cardMapByKey.get(key);
      if (entry && entry.inner) {
        // Re-attach the surviving Leaflet container into the fresh placeholder.
        if (entry.inner.parentNode !== ph) { ph.innerHTML = ''; ph.appendChild(entry.inner); }
        setTimeout(() => { try { entry.map.invalidateSize(); } catch (_) {} }, 0);
      } else {
        const built = buildCardMap(ph, d, route);
        if (built) cardMapByKey.set(key, built);
      }
    });
    // Drop maps for cards no longer present (e.g. after a day change).
    for (const [key, e] of Array.from(cardMapByKey)) {
      if (!seen.has(key)) {
        OSM.unregisterMap(e.map);
        try { e.map.remove(); } catch (_) {}
        try { e.inner.remove(); } catch (_) {}
        cardMapByKey.delete(key);
      }
    }
  }

  function cardsHtml(d, route) {
    const cards = route?.cards || [];
    const active = state.driving.activeCardIndex;
    const displayCards = injectSunsetRiskCard(cards, route, active);
    // Resolve the active step (for intermediate Street View lookup).
    const activeStep = (state.driving && route?.legs)
      ? route.legs[state.driving.legIdx]?.steps?.[state.driving.stepIdx]
      : null;
    const intermediate = closestIntermediateSv(activeStep);
    const liveSv = dynamicStreetViewUrl();
    const html = displayCards.map((c, i) => {
      const isActive = i === active;
      const isPast = active >= 0 && i < active;
      const distLine = state.gps && typeof c.lat === 'number'
        ? `<span class="card-dist">${formatM(cardDistMeters(c, i, active))}</span>`
        : '';
      // Street View selection priority on the ACTIVE card:
      //   1. Pre-cached intermediate closest to current GPS (works offline)
      //   2. Live GPS-anchored Street View (online, fresh)
      //   3. The cached step-start snapshot (fallback)
      // Past + future cards always show their step-start snapshot.
      const svUrl = isActive
        ? (intermediate?.url || liveSv || c.streetViewUrl)
        : c.streetViewUrl;
      const youAreHere = isActive && state.gps
        ? `<span class="card-here">📍 You are here</span>`
        : '';
      return `<article class="drive-card card-${c.kind} ${isActive ? 'card-active' : ''} ${isPast ? 'card-past' : ''}"
                       data-card-index="${i}" data-active="${isActive}" data-kind="${c.kind}">
        <header class="drive-card-head">
          <span class="card-kind">${kindEmoji(c.kind)} ${c.kind}</span>
          ${distLine}
        </header>
        ${youAreHere}
        <h3>${esc(c.title || '')}</h3>
        <p>${esc(c.body || '')}</p>
        ${(typeof c.lat === 'number') || svUrl ? `<div class="card-media">
          ${typeof c.lat === 'number' && !c.noMap ? `<div class="card-map-osm" data-card-key="${esc(cardKey(c, i))}" data-lat="${c.lat}" data-lng="${c.lng}" data-leg="${c.legIdx ?? ''}" data-step="${c.stepIdx ?? ''}" data-kind="${esc(c.kind || '')}"></div>` : ''}
          ${svUrl ? `<img loading="lazy" src="${esc(svUrl)}" alt="Street view at GPS">` : ''}
        </div>` : ''}
      </article>`;
    }).join('');
    return html || '<p>No directions cached for this day.</p>';
  }

  function dashboardHtml(d, route) {
    return `
      <div class="drive-dashboard">
        <div class="drive-sticky">${stickyInnerHtml(d, route)}</div>
        <div class="drive-map" id="driveMapHost"></div>
        <div class="drive-cards">${cardsHtml(d, route)}</div>
      </div>`;
  }

  function injectSunsetRiskCard(cards, route, activeIdx) {
    if (!cards) return [];
    const out = cards.slice();
    const margin = state.driving.sunsetMargin;
    if (!margin || margin.severity === 'safe') return out;
    const card = {
      kind: 'sunset_risk',
      title: margin.severity === 'risk'
        ? 'At risk of driving past sunset'
        : 'Sunset approaching — keep pace',
      body: margin.severity === 'risk'
        ? `ETA exceeds sunset by ${Math.abs(margin.marginMin)} min (incl. 30-min buffer). Driving after dark is not permitted by your rental agreement — stop at the nearest safe town.`
        : `Daylight margin: ${margin.marginMin} min. Maintain pace; avoid long stops.`,
      ttsKey: margin.severity === 'risk' ? 'sunset_risk_warning' : 'sunset_risk_tight',
      cardId: `${route ? route.legs?.[0]?.start || 'route' : 'route'}:sunset_risk`
    };
    const at = Math.max(0, activeIdx + 1);
    out.splice(at, 0, card);
    return out;
  }

  function kindEmoji(kind) {
    return ({
      turn: '🧭', fuel: '⛽', pressure: '🛞', arrival: '🏁', sunset_risk: '🌅', scenery: '🏞️'
    })[kind] || '•';
  }
  // Dual-unit distance formatter. Metric first because the trip is in
  // Namibia (signs are in km), imperial in parentheses for US-readability.
  function formatM(m) {
    if (!isFinite(m)) return '';
    if (m >= 1000) {
      const km = m / 1000;
      const mi = m / 1609.344;
      return `${km.toFixed(1)} km / ${mi.toFixed(1)} mi`;
    }
    const ft = Math.round(m * 3.28084);
    return `${Math.round(m)} m / ${ft} ft`;
  }

  // Distance to display on a card. For the ACTIVE turn card, this should be
  // distance to the *next* turn (where the current stretch ends) — that
  // value decreases monotonically as you drive, vs. the previous
  // implementation which used GPS→step-start distance that goes up after
  // you pass the step. For all other cards, the card's own coordinate is
  // the meaningful target (next turn, fuel stop, lodge arrival, etc.).
  function cardDistMeters(c, i, activeIdx) {
    if (!state.gps || typeof c.lat !== 'number') return Infinity;
    if (i === activeIdx && (c.kind === 'turn' || c.kind === 'arrival')
        && typeof state.driving?.distToNextTurnM === 'number'
        && isFinite(state.driving.distToNextTurnM)) {
      return state.driving.distToNextTurnM;
    }
    // Route-distance (monotonic along the road), not straight-line.
    try {
      const route = state.renderedRoutes && state.renderedRoutes[day().date];
      if (route && DC.distAlongRouteToCard) {
        const along = DC.distAlongRouteToCard(route, state.gps, c);
        if (isFinite(along)) return along;
      }
    } catch (_) {}
    return DC.distMeters(state.gps, c);
  }

  // Pick the Street View whose anchor is closest to the current GPS — only
  // among the pre-cached `step.intermediates`. If none, returns null.
  function closestIntermediateSv(step) {
    if (!state.gps || !step?.intermediates?.length) return null;
    let best = null, bestD = Infinity;
    for (const it of step.intermediates) {
      const d = DC.distMeters(it, state.gps);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  // Heavy DOM rebuilds (sticky/cards innerHTML replacement) flicker visibly
  // when fired at the demo's 10fps tick rate. Split the live update into:
  //   - cheap, every-tick: map pin + sun chip + GPS chip text
  //   - throttled (≤ once per HEAVY_REBUILD_MS): cards/sticky innerHTML
  //   - immediate: rebuild when the active card index changes
  const HEAVY_REBUILD_MS = 5000;

  function renderDashboardLive(route, scrollChanged) {
    const host = document.querySelector('.drive-dashboard');
    if (!host) return;
    const d = day();

    // Cheap updates: always (each diff-checks to avoid no-op DOM writes).
    updateDriveMap();
    updateGpsChipText();
    updateSunChip(d, route);
    updateTtsIndicator();
    updateCardDistances(route);

    // Heavy rebuild: only when needed.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const lastBuilt = state.driving._lastHeavyRebuild || 0;
    const activeChanged = state.driving._lastBuiltActiveIdx !== state.driving.activeCardIndex;
    const shouldRebuild = activeChanged || (now - lastBuilt) >= HEAVY_REBUILD_MS;
    if (shouldRebuild) {
      const cards = host.querySelector('.drive-cards');
      if (cards) cards.innerHTML = cardsHtml(d, route);
      state.driving._lastHeavyRebuild = now;
      state.driving._lastBuiltActiveIdx = state.driving.activeCardIndex;
      bindDashboardEvents();
      initCardMaps();
    }

    // Auto-scroll only when explicitly requested or demo is running.
    if ((state.driving.demoMode || state.driving.requestCenterScroll) && scrollChanged && state.driving.activeCardIndex >= 0) {
      state.driving.requestCenterScroll = false;
      const target = host.querySelector(`[data-card-index="${state.driving.activeCardIndex}"]`);
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ behavior: state.driving.demoMode ? 'auto' : 'smooth', block: 'center' });
      }
    }
  }

  function updateGpsChipText() {
    const el = document.querySelector('.drive-controls .gps-chip');
    if (!el) return;
    const txt = state.gps ? `GPS ${state.gps.lat.toFixed(3)},${state.gps.lng.toFixed(3)}` : 'GPS: not active';
    // Diff-check: only mutate DOM when content actually changed. Prevents
    // browser repaint flicker on every demo tick (10 Hz).
    if (el.textContent !== txt) el.textContent = txt;
  }
  function updateSunChip(d, route) {
    const wrap = document.querySelector('.drive-sticky');
    if (!wrap || !route) return;
    const margin = state.driving.sunsetMargin;
    const sunriseLocal = route?.sunTimes ? ST.formatTimeOfDay(route.sunTimes.sunriseMs) : '--:--';
    const sunsetLocal = route?.sunTimes ? ST.formatTimeOfDay(route.sunTimes.sunsetMs) : '--:--';
    const now = nowMs();
    const isPreDawn = route?.sunTimes && now < route.sunTimes.sunriseMs;
    let inner;
    let cls = 'sun-chip';
    if (isPreDawn) {
      const minToSunrise = Math.round((route.sunTimes.sunriseMs - now) / 60000);
      cls += ' sun-predawn';
      inner = `🌄 Sunrise <strong>${sunriseLocal}</strong> in ${ST.formatRelative(minToSunrise)}`;
    } else if (margin) {
      cls += ' sun-' + margin.severity;
      const etaLocal = state.driving.eta ? ST.formatTimeOfDay(state.driving.eta) : '--:--';
      const clockLocal = ST.formatTimeOfDay(nowMs());
      inner = `🕒 <strong>${clockLocal}</strong> · 🌅 Sunset <strong>${sunsetLocal}</strong> · ETA <strong>${etaLocal}</strong> · margin <strong>${margin.marginMin >= 0 ? '+' : ''}${margin.marginMin} min</strong>`;
    } else {
      inner = `🌅 Sunset <strong>${sunsetLocal}</strong>`;
    }
    let chip = wrap.querySelector('.sun-chip');
    if (!chip) {
      state.driving._lastHeavyRebuild = 0;
      return;
    }
    // Diff-check to avoid 10 Hz repaint of the same string.
    if (chip.className !== cls) chip.className = cls;
    if (chip.innerHTML !== inner) chip.innerHTML = inner;
  }
  // Update the km/mi distance text on each rendered card without rebuilding
  // the cards list. Smooth motion, no flicker. Uses cardDistMeters so the
  // active turn-card counts down to the NEXT TURN (not the step's start,
  // which has already been passed).
  function updateCardDistances(route) {
    if (!state.gps) return;
    const host = document.querySelector('.drive-cards');
    if (!host) return;
    const cardEls = host.querySelectorAll('.drive-card');
    const cards = (route && route.cards) || [];
    const active = state.driving?.activeCardIndex ?? -1;
    cardEls.forEach(el => {
      const idx = Number(el.dataset.cardIndex);
      const c = cards[idx];
      if (!c || typeof c.lat !== 'number') return;
      const txt = formatM(cardDistMeters(c, idx, active));
      const slot = el.querySelector('.card-dist');
      if (slot && slot.textContent !== txt) slot.textContent = txt;
    });
  }

  function updateTtsIndicator() {
    const last = state.driving.lastSpokenText || '';
    let el = document.querySelector('.drive-sticky .tts-indicator');
    if (last && !el) {
      const sticky = document.querySelector('.drive-sticky');
      if (sticky) {
        el = document.createElement('div');
        el.className = 'tts-indicator';
        sticky.appendChild(el);
      }
    }
    if (el) {
      const txt = '🔊 ' + last.slice(0, 100);
      if (el.textContent !== txt) el.textContent = txt;
    }
  }

  // ---- Embedded dashboard map (persists across partial renders) ----
  let driveMap = null;
  let driveMapMarker = null;
  let driveMapPolyline = null;
  let driveMapHostEl = null;

  function ensureDriveMap() {
    // OSM takeover (v32): if an OpenStreetMap-based map adapter takes over
    // (returns a live map), let it own the dashboard host. If it returns a
    // falsy value (e.g. Leaflet failed to load), fall through to Google.
    if (window.NamibiaOsmMap?.takeOver) {
      let osm = null;
      try { osm = window.NamibiaOsmMap.takeOver(); } catch (_) {}
      if (osm) return null;
    }
    const host = document.getElementById('driveMapHost');
    if (!host) return null;
    if (driveMap && driveMapHostEl === host) return driveMap;
    driveMapHostEl = host;
    if (!window.google || !google.maps || !google.maps.Map) return null;
    try {
      driveMap = new google.maps.Map(host, {
        center: { lat: -22.5, lng: 17.0 },
        zoom: 7,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        gestureHandling: 'cooperative'
      });
      driveMapMarker = null;
      driveMapPolyline = null;
    } catch (_) {
      driveMap = null;
    }
    return driveMap;
  }

  function updateDriveMap() {
    // OSM mode takes priority when it successfully handles the update;
    // otherwise fall through to the Google path.
    if (window.NamibiaOsmMap?.update) {
      let handled = false;
      try { handled = window.NamibiaOsmMap.update(); } catch (_) {}
      if (handled) return;
    }
    const map = ensureDriveMap();
    if (!map || !window.google) return;
    const d = day();
    const route = state.renderedRoutes?.[d.date];
    // Draw or refresh the route polyline.
    if (route?.overviewPath?.length >= 2) {
      const path = route.overviewPath.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
      if (!driveMapPolyline) {
        try {
          driveMapPolyline = new google.maps.Polyline({
            path, map, strokeColor: '#5a1738', strokeWeight: 5, strokeOpacity: 0.95
          });
        } catch (_) {}
      } else {
        try { driveMapPolyline.setPath(path); driveMapPolyline.setMap(map); } catch (_) {}
      }
    }
    // Update the GPS marker.
    if (state.gps) {
      const pos = { lat: state.gps.lat, lng: state.gps.lng };
      if (!driveMapMarker) {
        try {
          driveMapMarker = new google.maps.Marker({
            position: pos, map, label: 'YOU',
            title: 'Simulated/live GPS position',
            zIndex: 1000
          });
        } catch (_) {}
      } else {
        try { driveMapMarker.setPosition(pos); driveMapMarker.setMap(map); } catch (_) {}
      }
      try { map.panTo(pos); } catch (_) {}
    }
  }

  function bindDashboardEvents() {
    const muteBtn = document.getElementById('ttsMute');
    if (muteBtn) muteBtn.onclick = () => {
      const tts = TTS();
      if (!tts) return;
      tts.toggle();
      muteBtn.setAttribute('aria-pressed', String(tts.isMuted()));
      muteBtn.textContent = tts.isMuted() ? '🔇 Unmute' : '🔊 Mute';
    };
    const replayBtn = document.getElementById('ttsReplay');
    if (replayBtn) replayBtn.onclick = () => {
      const tts = TTS();
      if (tts) tts.replayLast();
    };
    const centerBtn = document.getElementById('centerCurrent');
    if (centerBtn) centerBtn.onclick = () => {
      if (state.driving.activeCardIndex < 0) return;
      const target = document.querySelector(`[data-card-index="${state.driving.activeCardIndex}"]`);
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  }

  // ---- Hook renderTab — replace street-view grid with dashboard ----
  if (typeof renderTab === 'function') {
    const baseRenderTab = renderTab;
    renderTab = function patchedRenderTabV13() {
      baseRenderTab();
      // Tab labels must be correct on every render, not only when the user is
      // already viewing the Driver tab.
      relabelStreetTab();
      if (state.activeTab !== 'street') {
        // Drop map refs when leaving the tab so they get rebuilt on return.
        driveMap = null; driveMapMarker = null; driveMapPolyline = null; driveMapHostEl = null;
        return;
      }
      const d = day();
      const route = state.renderedRoutes?.[d.date];
      if (route) evaluateSunsetRisk(route);
      const tc = document.getElementById('tabContent');
      if (!tc) return;

      // If the dashboard is already mounted for this day, fall back to a
      // partial update so we don't reset scroll position or rebuild the map.
      const existingHost = tc.querySelector('.drive-dashboard');
      if (existingHost && existingHost.dataset.dateKey === d.date) {
        if (route) renderDashboardLive(route, false);
        return;
      }

      tc.innerHTML = dashboardHtml(d, route);
      const newHost = tc.querySelector('.drive-dashboard');
      if (newHost) newHost.dataset.dateKey = d.date;
      // Reset embedded map refs since the host DIV is freshly minted.
      driveMap = null; driveMapMarker = null; driveMapPolyline = null; driveMapHostEl = null;
      updateDriveMap();
      bindDashboardEvents();
      initCardMaps();
      // Initial mount: one-shot scroll to the active card, then never again
      // unless the user clicks "📍 Center".
      if (state.driving.activeCardIndex >= 0) {
        const target = document.querySelector(`[data-card-index="${state.driving.activeCardIndex}"]`);
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
      }
    };
  }

  // ---- URL spoof param for manual browser testing ----
  function applyUrlSpoof() {
    const u = new URL(location.href);
    const s = u.searchParams.get('spoof');
    if (!s) return;
    const [latStr, lngStr] = s.split(',');
    const lat = Number(latStr), lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      pushGps({ lat, lng });
    }
  }
  applyUrlSpoof();

  if (typeof renderTab === 'function') renderTab();

  // Expose for tests.
  window.NamibiaDriving = {
    onGpsUpdate, evaluateSunsetRisk, dashboardHtml, injectSunsetRiskCard,
    state: () => state.driving
  };
})();
