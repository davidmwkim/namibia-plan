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
    prevDistByCard: {}
  };

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

  function dashboardHtml(d, route) {
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
      sunChip = `<span class="sun-chip sun-${margin.severity}">🌅 Sunset <strong>${sunsetLocal}</strong> · ETA <strong>${etaLocal}</strong> · margin <strong>${margin.marginMin >= 0 ? '+' : ''}${margin.marginMin} min</strong></span>`;
    } else {
      sunChip = `<span class="sun-chip">🌅 Sunset <strong>${sunsetLocal}</strong></span>`;
    }

    const cards = route?.cards || [];
    const active = state.driving.activeCardIndex;
    const displayCards = injectSunsetRiskCard(cards, route, active);

    const cardsHtml = displayCards.map((c, i) => {
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

    return `
      <div class="drive-dashboard">
        <div class="drive-sticky">
          <div class="drive-controls">
            <span class="chip gps-chip">${state.gps ? `GPS ${state.gps.lat.toFixed(3)},${state.gps.lng.toFixed(3)}` : 'GPS: not active'}</span>
            <button id="ttsMute" class="ghost" aria-pressed="${muted}">${muted ? '🔇 Unmute' : '🔊 Mute'}</button>
            <button id="ttsReplay" class="ghost">↺ Replay</button>
          </div>
          ${sunChip}
        </div>
        <div class="drive-map" id="driveMapHost"></div>
        <div class="drive-cards">${cardsHtml || '<p>No directions cached for this day.</p>'}</div>
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

  function renderDashboardLive(route, scrollChanged) {
    const host = document.querySelector('.drive-dashboard');
    if (!host) return;
    // Inexpensive: replace the cards block only.
    const d = day();
    const html = dashboardHtml(d, route);
    host.outerHTML = html;
    bindDashboardEvents();
    if (scrollChanged && state.driving.activeCardIndex >= 0) {
      const target = document.querySelector(`[data-card-index="${state.driving.activeCardIndex}"]`);
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  }

  // ---- Hook renderTab — replace street-view grid with dashboard ----
  if (typeof renderTab === 'function') {
    const baseRenderTab = renderTab;
    renderTab = function patchedRenderTabV13() {
      baseRenderTab();
      if (state.activeTab !== 'street') return;
      relabelStreetTab();
      const d = day();
      const route = state.renderedRoutes?.[d.date];
      // Always re-evaluate sunset risk when re-rendering, so chip stays fresh
      // even if GPS hasn't fired (e.g., spoofed clock with stationary GPS).
      if (route) evaluateSunsetRisk(route);
      const tc = document.getElementById('tabContent');
      if (!tc) return;
      tc.innerHTML = dashboardHtml(d, route);
      bindDashboardEvents();
      // Trigger auto-scroll for active card if any.
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
