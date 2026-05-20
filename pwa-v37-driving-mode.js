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
  let chevMarker = null;     // the chevron lives ON the map (at the GPS) so it
                             // can never drift from the dot/route during panning
  let programmaticMove = false; // true while WE pan/zoom, so our own moves don't
                                // get mistaken for the user grabbing the map

  // ---- Heading-up navigation camera ----
  const NAV_ZOOM = 16;       // street-level for both real driving AND the demo
                             // (the demo is slowed to a tile-friendly pace)
  const NAV_TILT = 52;       // degrees of 3-D pitch (rotateX), Google-nav style
  const NAV_PERSPECTIVE = 1000; // px; smaller = stronger perspective
  let navHeading = 0;        // smoothed heading the map is rotated to (deg, 0 = N)
  let navLastGps = null;     // previous fix, for movement bearing
  let navFollow = true;      // true = follow + heading-up + tilt; false = free look
  let onResize = null;

  // The CSS transform for the live nav camera (3-D tilt + heading-up rotation).
  function followTransform() {
    return `perspective(${NAV_PERSPECTIVE}px) rotateX(${NAV_TILT}deg) rotate(${(-navHeading).toFixed(1)}deg)`;
  }
  // Device compass (magnetometer) — the real "which way is the phone pointing".
  let compassHeading = null;
  let compassActive = false;
  let onOrient = null;

  // Read a clockwise-from-north compass heading from a deviceorientation event.
  // iOS exposes webkitCompassHeading directly; Android delivers it via the
  // `deviceorientationabsolute` event (absolute === true). We MUST ignore the
  // plain `deviceorientation` event (absolute === false) — its alpha is relative
  // to an arbitrary start orientation, not north, so using it points the chevron
  // the wrong way. Verified on a Pixel 6 Pro: absolute alpha 331 → 29°, which
  // matched the AbsoluteOrientationSensor reading.
  function compassFromEvent(e) {
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      return (e.webkitCompassHeading + 360) % 360;
    }
    if (e.absolute === true && typeof e.alpha === 'number') {
      const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      return (360 - e.alpha + so + 360) % 360;
    }
    return null;
  }

  function startCompass() {
    compassHeading = null; compassActive = false;
    onOrient = (e) => {
      const h = compassFromEvent(e);
      if (h != null && isFinite(h)) { compassHeading = h; compassActive = true; }
    };
    const attach = () => {
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
    };
    // iOS 13+ requires explicit permission, requested from a user gesture
    // (enterFocus is called from the button tap, so we're inside one).
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(s => { if (s === 'granted') attach(); }).catch(() => {});
    } else {
      attach();
    }
  }
  function stopCompass() {
    if (onOrient) {
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
      onOrient = null;
    }
    compassActive = false; compassHeading = null;
  }

  // Shortest-arc angular interpolation (handles the 360°→0° wrap).
  function lerpAngle(a, b, t) {
    const diff = ((b - a + 540) % 360) - 180;
    return (a + diff * t + 360) % 360;
  }

  // The GPS sits this far down the map (0.5 = centre). Lower = more road ahead
  // visible above the puck, like Google nav.
  const NAV_FOCUS_Y = 0.66;

  // Size the oversized inner so it always covers the clip box under rotation +
  // tilt (a square ~1.5× the diagonal), and position it so its CENTRE — where
  // the GPS is panned to and the rotation/tilt origin sits — lands at
  // NAV_FOCUS_Y down the box (lookahead).
  function sizeNavInner(host, inner) {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const D = Math.ceil(Math.sqrt(r.width * r.width + r.height * r.height) * 1.5) + 4;
    inner.style.width = D + 'px';
    inner.style.height = D + 'px';
    inner.style.left = Math.round((r.width - D) / 2) + 'px';
    inner.style.top = Math.round(r.height * NAV_FOCUS_Y - D / 2) + 'px';
  }

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
          <button class="df-btn df-demo" id="dfDemo" title="Replay this day at speed with voice guidance">▶ Demo</button>
          <button class="df-btn" id="dfMute" title="Mute / unmute voice">🔊</button>
          <button class="df-btn df-exit" id="dfExit" title="Exit driving mode">✕ Exit</button>
        </span>
      </div>
      <div class="df-map" id="dfMap">
        <button class="df-recenter" id="dfRecenter" title="Re-center on me">◎ Re-center</button>
      </div>
      <div class="df-card" id="dfCard"></div>
      <div class="df-sv" id="dfSv"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#dfExit').onclick = exitFocus;
    overlay.querySelector('#dfDemo').onclick = toggleDemo;
    overlay.querySelector('#dfRecenter').onclick = recenter;
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
    host.classList.add('df-map-nav');
    // Oversized inner that holds the real map and gets CSS-rotated heading-up;
    // #dfMap clips it. A fixed chevron puck sits on top (never rotates).
    const inner = document.createElement('div');
    inner.className = 'df-map-inner';
    host.appendChild(inner);
    sizeNavInner(host, inner);
    // Interactive live map — the user can pan/zoom to look around (a "Re-center"
    // button returns to the follow camera). zoomControl off (we keep the view
    // clean); pinch + drag + double-tap zoom stay on.
    focusMap = OSM().createMap(inner, {
      center: [-22.5, 17.0], zoom: NAV_ZOOM,
      zoomControl: false, attributionControl: true
    });
    if (focusMap) {
      OSM().registerMap(focusMap);
      // A user-initiated drag/zoom drops out of follow mode (free look).
      focusMap.on('dragstart', onUserMove);
      focusMap.on('zoomstart', onUserMove);
    }
    // Draw the day's colored route once so there's context around the puck.
    const { route } = activeCard();
    if (focusMap && route?.overviewPath?.length > 1) {
      OSM().drawColoredRoute(focusMap, route.overviewPath, day(), []);
    }
    if (window.NamibiaTTS) overlay.querySelector('#dfMute').textContent = window.NamibiaTTS.isMuted() ? '🔇' : '🔊';
    lastCardKey = null;
    navHeading = 0; navLastGps = null; navFollow = true;
    startCompass();
    refreshFocus(true);
    refreshTimer = setInterval(() => refreshFocus(false), 150);
    document.addEventListener('keydown', onKey);
    onResize = () => { const h = overlay && overlay.querySelector('#dfMap'); const inr = h && h.querySelector('.df-map-inner'); if (h && inr) { sizeNavInner(h, inr); try { focusMap.invalidateSize(); } catch (_) {} } };
    window.addEventListener('resize', onResize);
  }

  function exitFocus() {
    if (!overlay) return;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    document.removeEventListener('keydown', onKey);
    stopCompass();
    if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
    if (focusMap && OSM()) OSM().unregisterMap(focusMap);
    try { if (focusMap) focusMap.remove(); } catch (_) {}
    focusMap = null;
    chevMarker = null;
    overlay.remove();
    overlay = null;
    document.documentElement.classList.remove('df-open');
  }

  function onKey(e) { if (e.key === 'Escape') exitFocus(); }

  // User grabbed the map → free-look mode: flatten to a plain north-up map (so
  // panning/zooming is intuitive, not rotated/tilted) and reveal "Re-center".
  function onUserMove() {
    if (programmaticMove || !navFollow) return;
    navFollow = false;
    const inner = overlay && overlay.querySelector('.df-map-inner');
    if (inner) inner.style.transform = 'none';
    const btn = overlay && overlay.querySelector('#dfRecenter');
    if (btn) btn.classList.add('df-recenter-on');
  }

  // Re-center → resume the heading-up, tilted follow camera.
  function recenter() {
    navFollow = true;
    const btn = overlay && overlay.querySelector('#dfRecenter');
    if (btn) btn.classList.remove('df-recenter-on');
    refreshFocus(true); // re-applies the right zoom (demo vs real) + follow camera
  }

  // Start/stop the high-speed demo from inside Driving mode. Unlocks audio on
  // the user gesture (required for the first voice line on mobile) and fires a
  // confirmation line, then the demo drives GPS/clock → turn, pressure, sunset
  // and rain warnings all voice through v13's onGpsUpdate.
  function toggleDemo() {
    const Demo = window.NamibiaDemo;
    if (!Demo) return;
    if (Demo.isRunning && Demo.isRunning()) { Demo.stopDemo(); return; }
    try {
      if (window.NamibiaTTS) {
        window.NamibiaTTS.unlockOnGesture && window.NamibiaTTS.unlockOnGesture();
        window.NamibiaTTS.speak('demo_starting');
      }
    } catch (_) {}
    // No explicit duration → the demo picks a route-length-proportional pace
    // that's slow enough for street-level tiles to keep up.
    Demo.startDemo({});
  }

  function refreshFocus(force) {
    if (!overlay) return;
    // Reflect demo running state on the button.
    const demoBtn = overlay.querySelector('#dfDemo');
    if (demoBtn) {
      const running = window.NamibiaDemo && window.NamibiaDemo.isRunning && window.NamibiaDemo.isRunning();
      const label = running ? '⏹ Stop' : '▶ Demo';
      if (demoBtn.textContent !== label) demoBtn.textContent = label;
      demoBtn.classList.toggle('df-demo-on', !!running);
    }
    const { route, card, idx } = activeCard();
    // Keep the shared GPS dot current + drive the heading-up navigation camera:
    // follow the driver and rotate the map so travel direction is always "up".
    if (OSM()) OSM().updateAllGps();
    if (focusMap && state.gps) {
      // Heading: phone compass (real driving) else the smoothed movement bearing
      // (demo / no compass). Heavier smoothing + a small move threshold keep the
      // map from spinning erratically.
      if (navFollow) {
        if (compassActive && compassHeading != null && !state.driving.demoMode) {
          navHeading = lerpAngle(navHeading, compassHeading, 0.4);
        } else if (navLastGps) {
          const moved = DC.distMeters(navLastGps, state.gps);
          if (moved > 6) navHeading = lerpAngle(navHeading, DC.bearing(navLastGps, state.gps), 0.22);
        }
        navLastGps = { lat: state.gps.lat, lng: state.gps.lng };
      }
      // The chevron is a marker ON the map at the GPS, so it can never drift
      // from the dot/route. Its triangle is rotated to the heading; the tilted
      // map then makes it lie on the road pointing forward (Google-nav style).
      if (!chevMarker) {
        const icon = window.L.divIcon({
          className: 'df-chev-icon',
          html: '<div class="df-chev-rot"><div class="df-chev-tri"></div></div>',
          iconSize: [30, 30], iconAnchor: [15, 15]
        });
        chevMarker = window.L.marker([state.gps.lat, state.gps.lng], { icon, interactive: false, zIndexOffset: 2000 }).addTo(focusMap);
      } else {
        chevMarker.setLatLng([state.gps.lat, state.gps.lng]);
      }
      const el = chevMarker.getElement && chevMarker.getElement();
      const rotEl = el && el.querySelector('.df-chev-rot');
      if (rotEl) rotEl.style.transform = `rotate(${navHeading.toFixed(1)}deg)`;

      // Drive the follow camera only when following — in free-look the user owns
      // the view (flat north-up, wherever they panned, with "Re-center" up).
      if (navFollow) {
        // Always street-level (the demo is paced slow enough for tiles to keep
        // up). Guard our own pan/zoom so they don't trip onUserMove.
        programmaticMove = true;
        try { if (focusMap.getZoom() !== NAV_ZOOM) focusMap.setZoom(NAV_ZOOM, { animate: false }); } catch (_) {}
        try { focusMap.panTo([state.gps.lat, state.gps.lng], { animate: false }); } catch (_) {}
        programmaticMove = false;
        const inner = overlay.querySelector('.df-map-inner');
        if (inner) inner.style.transform = followTransform();
      }
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
