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
  window.__namibiaUnspoofClock = () => { spoofedNow = null; renderTab(); };
  function nowMs() { return spoofedNow != null ? spoofedNow : Date.now(); }

  // ---- GPS spoofing seam ----
  function pushGps(p) {
    state.gps = { lat: Number(p.lat), lng: Number(p.lng) };
    setStatus('gpsStatus', `GPS: spoofed (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`);
    onGpsUpdate();
    if (typeof render === 'function') render();
  }
  window.__namibiaSpoofGps = pushGps;
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

    // Active card (used for auto-scroll).
    const r = DC.relevantCards(state.gps, route);
    const prevActive = state.driving.activeCardIndex;
    state.driving.activeCardIndex = r.activeIndex;

    // Demo mode: force-fire a TTS announcement whenever the active card
    // changes. Threshold-based firing below may skip cards when GPS jumps a
    // large distance per tick (demo's 1km+/tick speed), so this guarantees
    // the user hears every card during the playback.
    if (state.driving.demoMode && prevActive !== r.activeIndex && r.activeIndex >= 0) {
      const activeCard = route.cards?.[r.activeIndex];
      if (activeCard?.ttsKey) {
        const tts = TTS();
        if (tts) tts.speak(activeCard.ttsKey);
      }
    }

    // Threshold-based TTS for each upcoming card within range.
    if (route.cards) {
      route.cards.forEach((card, idx) => {
        const d2 = DC.distMeters(state.gps, card);
        const prev = state.driving.prevDistByCard[card.cardId];
        const last = state.driving.lastThresholdByCard[card.cardId] || null;
        const fired = DC.ttsTriggerThresholds(prev, d2, last);
        if (fired && idx >= r.activeIndex) {
          state.driving.lastThresholdByCard[card.cardId] = fired;
          const tts = TTS();
          if (tts && card.ttsKey) tts.speak(card.ttsKey);
        }
        state.driving.prevDistByCard[card.cardId] = d2;
      });
    }

    // Sunset risk.
    evaluateSunsetRisk(route);

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
        if (tts) tts.speak(margin.severity === 'risk' ? 'sunset_risk_warning' : 'sunset_risk_tight');
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
        state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
  function relabelStreetTab() {
    const tabBtn = document.querySelector('.tab[data-tab="street"]');
    if (tabBtn && tabBtn.textContent !== 'Driving') tabBtn.textContent = 'Driving';
  }

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
      ${lastSpoken ? `<div class="tts-indicator">🔊 ${esc(lastSpoken.slice(0, 100))}</div>` : ''}`;
  }

  function cardsHtml(d, route) {
    const cards = route?.cards || [];
    const active = state.driving.activeCardIndex;
    const displayCards = injectSunsetRiskCard(cards, route, active);
    const html = displayCards.map((c, i) => {
      const isActive = i === active;
      const isPast = active >= 0 && i < active;
      const distLine = state.gps && typeof c.lat === 'number'
        ? `<span class="card-dist">${formatM(DC.distMeters(state.gps, c))}</span>`
        : '';
      return `<article class="drive-card card-${c.kind} ${isActive ? 'card-active' : ''} ${isPast ? 'card-past' : ''}"
                       data-card-index="${i}" data-active="${isActive}" data-kind="${c.kind}">
        <header class="drive-card-head">
          <span class="card-kind">${kindEmoji(c.kind)} ${c.kind}</span>
          ${distLine}
        </header>
        <h3>${esc(c.title || '')}</h3>
        <p>${esc(c.body || '')}</p>
        ${c.mapUrl || c.streetViewUrl ? `<div class="card-media">
          ${c.mapUrl ? `<img loading="lazy" src="${esc(c.mapUrl)}" alt="Map">` : ''}
          ${c.streetViewUrl ? `<img loading="lazy" src="${esc(c.streetViewUrl)}" alt="Street view">` : ''}
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
      turn: '🧭', fuel: '⛽', pressure: '🛞', arrival: '🏁', sunset_risk: '🌅'
    })[kind] || '•';
  }
  function formatM(m) {
    if (!isFinite(m)) return '';
    if (m >= 1000) return (m / 1000).toFixed(1) + ' km';
    return Math.round(m) + ' m';
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

    // Cheap updates: always.
    updateDriveMap();
    updateGpsChipText();
    updateSunChip(d, route);
    updateTtsIndicator();

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
    el.textContent = state.gps ? `GPS ${state.gps.lat.toFixed(3)},${state.gps.lng.toFixed(3)}` : 'GPS: not active';
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
      // Sun chip not yet present; trigger one heavy rebuild to insert it.
      state.driving._lastHeavyRebuild = 0;
      return;
    }
    chip.className = cls;
    chip.innerHTML = inner;
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
    if (el) el.textContent = '🔊 ' + last.slice(0, 100);
  }

  // ---- Embedded dashboard map (persists across partial renders) ----
  let driveMap = null;
  let driveMapMarker = null;
  let driveMapPolyline = null;
  let driveMapHostEl = null;

  function ensureDriveMap() {
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
      if (state.activeTab !== 'street') {
        // Drop map refs when leaving the tab so they get rebuilt on return.
        driveMap = null; driveMapMarker = null; driveMapPolyline = null; driveMapHostEl = null;
        return;
      }
      relabelStreetTab();
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
