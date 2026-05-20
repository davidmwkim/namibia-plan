// pwa-v37-driving-mode.js — full-screen "Driving mode".
//
// A "🚗 Driving mode" button in the dashboard controls opens a distraction-free
// full-screen view with ONLY the three things that matter while driving:
//   1. a large live OSM map (shared GPS blue dot + accuracy ring follow along)
//   2. the current turn card (big instruction + distance + Heather)
//   3. the Street View for that turn
// An "✕ Exit" button (and Esc) returns to the normal dashboard. The view tracks
// the same state.driving.activeCardIndex the dashboard uses, so it stays in
// sync during a live drive or the demo.
(function () {
  const OSM = () => window.NamibiaOSM;
  const DC = window.NamibiaDrivingCore;

  let overlay = null;
  let focusMap = null;
  let refreshTimer = null;
  let lastCardKey = null;

  function fmtM(m) {
    if (typeof m !== 'number' || !isFinite(m)) return '';
    const km = m / 1000, mi = m / 1609.34;
    if (m < 950) return `${Math.round(m)} m`;
    return `${km.toFixed(1)} km / ${mi.toFixed(1)} mi`;
  }
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function activeCard() {
    const d = day();
    const route = state.renderedRoutes?.[d?.date];
    const cards = route?.cards || [];
    let idx = state.driving?.activeCardIndex;
    if (typeof idx !== 'number' || idx < 0) idx = 0;
    return { route, card: cards[idx] || cards[0] || null, idx };
  }

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'drivingFocus';
    overlay.className = 'driving-focus';
    overlay.innerHTML = `
      <div class="df-bar">
        <span class="df-sun" id="dfSun"></span>
        <span class="df-actions">
          <button class="df-btn" id="dfMute" title="Mute / unmute voice">🔊</button>
          <button class="df-btn df-exit" id="dfExit" title="Exit driving mode">✕ Exit</button>
        </span>
      </div>
      <div class="df-map" id="dfMap"></div>
      <div class="df-card" id="dfCard"></div>
      <div class="df-sv" id="dfSv"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#dfExit').onclick = exitFocus;
    overlay.querySelector('#dfMute').onclick = () => {
      try {
        if (window.NamibiaTTS) {
          window.NamibiaTTS.toggle();
          overlay.querySelector('#dfMute').textContent = window.NamibiaTTS.isMuted() ? '🔇' : '🔊';
        }
      } catch (_) {}
    };
  }

  function enterFocus() {
    if (overlay) return;
    if (!OSM() || !OSM().hasLeaflet()) { try { window.alert('Map library still loading — try again in a moment.'); } catch (_) {} return; }
    buildOverlay();
    document.documentElement.classList.add('df-open');
    const host = overlay.querySelector('#dfMap');
    focusMap = OSM().createMap(host, { center: [-22.5, 17.0], zoom: 13 });
    if (focusMap) OSM().registerMap(focusMap);
    // Draw the day's colored route once so there's context around the dot.
    const { route } = activeCard();
    if (focusMap && route?.overviewPath?.length > 1) {
      OSM().drawColoredRoute(focusMap, route.overviewPath, day(), []);
    }
    if (window.NamibiaTTS) overlay.querySelector('#dfMute').textContent = window.NamibiaTTS.isMuted() ? '🔇' : '🔊';
    lastCardKey = null;
    refreshFocus(true);
    refreshTimer = setInterval(() => refreshFocus(false), 400);
    document.addEventListener('keydown', onKey);
  }

  function exitFocus() {
    if (!overlay) return;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    document.removeEventListener('keydown', onKey);
    if (focusMap && OSM()) OSM().unregisterMap(focusMap);
    try { if (focusMap) focusMap.remove(); } catch (_) {}
    focusMap = null;
    overlay.remove();
    overlay = null;
    document.documentElement.classList.remove('df-open');
  }

  function onKey(e) { if (e.key === 'Escape') exitFocus(); }

  function refreshFocus(force) {
    if (!overlay) return;
    const { route, card, idx } = activeCard();
    // Keep the shared GPS dot current + recenter on the driver.
    if (OSM()) OSM().updateAllGps();
    if (focusMap && state.gps) {
      try { focusMap.panTo([state.gps.lat, state.gps.lng], { animate: true, duration: 0.3 }); } catch (_) {}
    }
    // Sun / ETA chip mirrors the dashboard's.
    const sunEl = overlay.querySelector('#dfSun');
    if (sunEl) {
      const m = state.driving?.sunsetMargin;
      const ST = window.NamibiaSunTimes;
      if (m && route?.sunTimes && ST) {
        const sunset = ST.formatTimeOfDay(route.sunTimes.sunsetMs);
        const eta = state.driving.eta ? ST.formatTimeOfDay(state.driving.eta) : '--:--';
        sunEl.className = 'df-sun sun-' + m.severity;
        sunEl.innerHTML = `🌅 ${sunset} · ETA ${eta} · ${m.marginMin >= 0 ? '+' : ''}${m.marginMin}m`;
      } else {
        sunEl.textContent = '🚗 Driving';
      }
    }
    if (!card) { overlay.querySelector('#dfCard').innerHTML = '<div class="df-empty">No route for today.</div>'; return; }

    // Only rebuild the card/street-view DOM when the active card changes (cheap
    // panning + dot updates run every tick).
    const key = card.cardId || (card.title + ':' + card.lat);
    const distM = (state.gps && typeof card.lat === 'number') ? DC.distMeters(state.gps, card) : null;
    // For the active turn while on-route, count down to the actual turn point;
    // otherwise use straight-line distance to the card. Guard with isFinite —
    // findCurrentStep yields NaN distToNextTurnM when off-route.
    const dtt = state.driving && state.driving.distToNextTurnM;
    const useTurn = card.kind === 'turn' && !state.driving?.offRoute
      && typeof dtt === 'number' && isFinite(dtt) && state.driving.activeCardIndex === idx;
    const distLabel = useTurn ? dtt : distM;
    if (key !== lastCardKey || force) {
      lastCardKey = key;
      const kindIcon = { turn: '🧭', arrival: '🏁', pressure: '🛞', fuel: '⛽', sunset_risk: '🌅' }[card.kind] || '🧭';
      overlay.querySelector('#dfCard').innerHTML = `
        <div class="df-card-kind">${kindIcon} ${esc(card.kind)}</div>
        <div class="df-card-title">${esc(card.title || '')}</div>
        <div class="df-card-sub"><span class="df-dist" id="dfDist">${esc(fmtM(distLabel))}</span> ${card.body ? '· ' + esc(card.body) : ''}</div>`;
      const sv = overlay.querySelector('#dfSv');
      if (card.streetViewUrl) {
        sv.innerHTML = `<img src="${esc(card.streetViewUrl)}" alt="Street view" loading="eager">`;
        sv.style.display = '';
      } else {
        sv.innerHTML = '';
        sv.style.display = 'none';
      }
    } else {
      // Same card — just refresh the live distance readout.
      const distEl = overlay.querySelector('#dfDist');
      if (distEl) { const t = fmtM(distLabel); if (distEl.textContent !== t) distEl.textContent = t; }
    }
  }

  // ---- Inject the entry button into the dashboard controls (idempotent). ----
  function injectButton() {
    if (state?.activeTab !== 'street') return;
    const controls = document.querySelector('.drive-controls');
    if (!controls || controls.querySelector('#enterDrivingMode')) return;
    const btn = document.createElement('button');
    btn.id = 'enterDrivingMode';
    btn.className = 'primary df-enter-btn';
    btn.textContent = '🚗 Driving mode';
    btn.title = 'Full-screen, distraction-free driving view';
    btn.onclick = enterFocus;
    controls.appendChild(btn);
  }

  function startObserver() {
    if (typeof MutationObserver === 'undefined') return;
    const root = document.getElementById('tabContent');
    if (!root) return;
    const obs = new MutationObserver(() => injectButton());
    obs.observe(root, { childList: true, subtree: true });
    injectButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver);
  else startObserver();

  window.NamibiaDrivingMode = { enterFocus, exitFocus, refreshFocus, isOpen: () => !!overlay };
})();
