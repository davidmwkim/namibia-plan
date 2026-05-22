// Namibia PWA v15 — Demo Mode.
//
// Replays the cached overviewPath for the current day at high speed, driving
// the simulated GPS position and simulated clock in lockstep. Includes a
// ±N-hour schedule-noise random walk so the sunset chip / risk card transitions
// visibly during the demo.
//
// UI: a "▶ Demo" button + duration / noise inputs injected into the Driving
// Dashboard sticky header. v13's dashboard reflows on every GPS update, so we
// use a MutationObserver to re-inject the controls each time.
//
// Public API:
//   window.NamibiaDemo.startDemo({durationMs, noiseHours, tickMs, startLocal})
//   window.NamibiaDemo.stopDemo()
//   window.NamibiaDemo.interpPolyline(path, t)        // pure
//   window.NamibiaDemo.totalRouteMinutes(route)       // pure
//   window.NamibiaDemo.generateNoiseSeries(n, maxH)   // pure
//   window.NamibiaDemo.sampleNoise(series, t)         // pure
(function () {
  const ST = window.NamibiaSunTimes;
  const DC = window.NamibiaDrivingCore;

  let demoTimer = null;
  let demoRng = Math.random;
  let demoProgressT = 0; // last reported progress so injectDemoControls can re-paint
  const defaults = {
    durationMs: 60000,
    noiseHours: 2,
    tickMs: 100,       // 10 fps → smooth GPS pin / card transitions
    startLocal: '08:00:00'
  };

  // ---- Pure helpers ----
  function totalRouteMinutes(route) {
    if (!ST) return 0;
    let m = 0;
    (route?.legs || []).forEach(leg => (leg.steps || []).forEach(s => {
      m += ST.parseDurationToMinutes(s.duration);
    }));
    return m;
  }

  // Build the demo drive path from STEP coordinates (start of each step + the
  // final destination), so the simulated GPS passes through every turn. Falls
  // back to the decimated overviewPath only if steps are unavailable.
  function buildDrivePath(route) {
    const pts = [];
    const legs = (route && route.legs) || [];
    legs.forEach(leg => (leg.steps || []).forEach(s => {
      if (typeof s.lat === 'number' && typeof s.lng === 'number') pts.push({ lat: s.lat, lng: s.lng });
    }));
    const lastLeg = legs[legs.length - 1];
    const lastStep = lastLeg && lastLeg.steps && lastLeg.steps[lastLeg.steps.length - 1];
    if (lastStep && typeof lastStep.endLat === 'number') pts.push({ lat: lastStep.endLat, lng: lastStep.endLng });
    return pts.length >= 2 ? pts : ((route && route.overviewPath) || []);
  }

  // Each card's position as a fraction (0..1) ALONG the route polyline, made
  // strictly increasing by array order. The demo drives the GPS along that same
  // polyline (interpPolyline below), so card fraction == GPS fraction == demo t:
  // the active card always matches where the chevron is, and the GPS follows the
  // real road instead of cutting straight lines between turns.
  function cardProgressFractions(path, cards) {
    const n = (cards || []).length;
    if (!Array.isArray(path) || path.length < 2 || !n) {
      return (cards || []).map((_, i) => i / Math.max(1, n - 1));
    }
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + DC.distMeters(path[i - 1], path[i]));
    const total = cum[cum.length - 1] || 1;
    const fr = cards.map(c => {
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return 0;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < path.length; i++) { const d = DC.distMeters(c, path[i]); if (d < bd) { bd = d; bi = i; } }
      return cum[bi] / total;
    });
    for (let i = 1; i < fr.length; i++) { if (!(fr[i] > fr[i - 1])) fr[i] = Math.min(1, fr[i - 1] + 1e-4); }
    return fr;
  }

  // Active card at demo progress t = the last card whose fraction has been
  // reached. Strictly-increasing fractions ⇒ every card is reached in turn.
  function activeCardAtT(cardFr, t) {
    let act = 0;
    for (let i = 0; i < cardFr.length; i++) { if (cardFr[i] <= t + 1e-6) act = i; else break; }
    return act;
  }

  function interpPolyline(path, t) {
    if (!Array.isArray(path) || path.length === 0) return null;
    if (path.length === 1) return { lat: path[0].lat, lng: path[0].lng };
    const tt = Math.max(0, Math.min(1, t));
    const dists = [0];
    for (let i = 1; i < path.length; i++) {
      dists.push(dists[i - 1] + DC.distMeters(path[i - 1], path[i]));
    }
    const total = dists[dists.length - 1];
    if (total === 0) return { lat: path[0].lat, lng: path[0].lng };
    const target = tt * total;
    for (let i = 1; i < path.length; i++) {
      if (dists[i] >= target) {
        const segDist = dists[i] - dists[i - 1];
        const segT = segDist > 0 ? (target - dists[i - 1]) / segDist : 0;
        return {
          lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * segT,
          lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * segT
        };
      }
    }
    return { lat: path[path.length - 1].lat, lng: path[path.length - 1].lng };
  }

  // Random-walk series of length `samples`, clamped to ±maxHours*60 minutes.
  // Step size is ±15 min per sample so the noise feels schedule-like rather
  // than instant teleportation.
  function generateNoiseSeries(samples, maxHours, rng) {
    const r = rng || demoRng;
    const cap = (maxHours || 0) * 60;
    const arr = [0];
    for (let i = 1; i < samples; i++) {
      const step = (r() - 0.5) * 30;
      const next = Math.max(-cap, Math.min(cap, arr[i - 1] + step));
      arr.push(next);
    }
    return arr;
  }

  function sampleNoise(series, t) {
    if (!Array.isArray(series) || series.length === 0) return 0;
    if (series.length === 1) return series[0];
    const tt = Math.max(0, Math.min(1, t));
    const i = tt * (series.length - 1);
    const lo = Math.floor(i);
    const hi = Math.min(series.length - 1, lo + 1);
    const frac = i - lo;
    return series[lo] * (1 - frac) + series[hi] * frac;
  }

  // Pick a demo duration proportional to route length so the playback moves at a
  // tile-friendly ~700 m/s at street zoom (otherwise raster tiles can't keep up
  // and the map goes blank). Clamped so short days aren't blink-fast and long
  // days aren't endless.
  const DEMO_TARGET_MPS = 700;
  function autoDurationMs(route) {
    const path = (route && route.overviewPath) || [];
    let m = 0;
    for (let i = 1; i < path.length; i++) m += DC.distMeters(path[i - 1], path[i]);
    return Math.max(60000, Math.min(360000, Math.round(m / DEMO_TARGET_MPS * 1000)));
  }

  // ---- Driver ----
  function startDemo(overrides) {
    stopDemo();
    overrides = overrides || {};
    const opts = Object.assign({}, defaults, overrides);
    if (typeof state === 'undefined' || !state) return null;
    const d = day();
    const route = state.renderedRoutes && state.renderedRoutes[d.date];
    if (!route || !route.overviewPath || route.overviewPath.length < 2) {
      try { window.alert('No cached route for ' + d.date + '. Click "Save key + render all" first to fetch Google Directions.'); } catch (_) {}
      return null;
    }
    const baseStartMs = Date.parse(d.date + 'T' + opts.startLocal + '+02:00');
    const realDriveMinutes = totalRouteMinutes(route) || 60;
    // Drive the GPS along the real road geometry (overviewPath) so it follows
    // the route accurately instead of cutting straight lines between turns. The
    // active card is keyed off the SAME polyline fraction (cardProgressFractions
    // below), so the highlighted card always matches where the chevron is, and
    // every card is still reached in order.
    const path = route.overviewPath;
    const cards = route.cards || [];
    const cardFr = cardProgressFractions(path, cards);
    const noise = generateNoiseSeries(24, opts.noiseHours);
    // Adaptive, route-length-proportional pace unless a duration was passed in.
    if (overrides.durationMs == null) opts.durationMs = autoDurationMs(route);

    // Ensure the Driving Dashboard is visible so the user sees the cards scroll.
    if (state.activeTab !== 'street') {
      state.activeTab = 'street';
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'street'));
      if (typeof renderTab === 'function') renderTab();
    }

    // Throttle TTS during demo so we don't fire dozens of overlapping speaks.
    if (window.NamibiaTTS && typeof window.NamibiaTTS.setThrottle === 'function') {
      window.NamibiaTTS.setThrottle(3500);
    }
    // Mark demo as active so v13 can pick auto-scroll (snappier) over
    // smooth-scroll (which queues animations and causes choppy playback) and
    // can force-fire a TTS announcement every time the active card changes.
    if (typeof state !== 'undefined' && state.driving) {
      state.driving.demoMode = true;
      state.driving.lastDemoActiveIdx = -1;
      // Reset announce state so every warning (cards, sunset, rain) re-fires
      // from the start of the playback.
      state.driving._lastAnnouncedIdx = -1;
      state.driving._rainWarned = false;
      state.driving.lastSunsetSeverity = 'safe';
    }

    const startTs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    demoTimer = setInterval(() => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t = Math.min(1, (now - startTs) / opts.durationMs);
      const pos = interpPolyline(path, t);
      const noiseMin = sampleNoise(noise, t);
      const simMs = baseStartMs + (realDriveMinutes * t + noiseMin) * 60000;
      // Active card from the same route fraction the GPS is at → highlight stays
      // aligned with the chevron, and every card is reached in order.
      if (state.driving) state.driving.demoActiveIdx = activeCardAtT(cardFr, t);
      try {
        // Prefer the silent variants so the demo doesn't trigger a full
        // renderTab cascade (~20 patches) on every 100ms tick. The silent
        // variants update state and the dashboard partials only.
        const clockFn = window.__namibiaSpoofClockSilent || window.__namibiaSpoofClock;
        const gpsFn = window.__namibiaSpoofGpsSilent || window.__namibiaSpoofGps;
        if (typeof clockFn === 'function') clockFn(simMs);
        if (typeof gpsFn === 'function' && pos) gpsFn(pos);
      } catch (_) {}
      updateDemoButton(t);
      if (t >= 1) stopDemo();
    }, opts.tickMs);

    return { startTs, opts };
  }

  function stopDemo() {
    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
    }
    if (window.NamibiaTTS && typeof window.NamibiaTTS.setThrottle === 'function') {
      window.NamibiaTTS.setThrottle(0);
    }
    if (typeof state !== 'undefined' && state.driving) {
      state.driving.demoMode = false;
      state.driving.demoActiveIdx = null;
    }
    updateDemoButton(0, true);
  }

  function updateDemoButton(t, stopped) {
    demoProgressT = stopped ? 0 : t;
    const btn = document.getElementById('demoStart');
    if (!btn) return;
    if (stopped || t >= 1) {
      btn.textContent = '▶ Demo';
      btn.disabled = false;
    } else {
      btn.textContent = '▶ ' + Math.round(t * 100) + '%';
      btn.disabled = true;
    }
  }
  function isDemoRunning() { return demoTimer != null; }

  // ---- UI injection (idempotent) ----
  function injectDemoControls() {
    if (state?.activeTab !== 'street') return;
    const sticky = document.querySelector('.drive-controls');
    if (!sticky || sticky.querySelector('#demoStart')) return;

    const wrap = document.createElement('span');
    wrap.className = 'demo-controls';

    const start = document.createElement('button');
    start.id = 'demoStart';
    start.className = 'primary';
    start.textContent = '▶ Demo';
    start.title = 'Replay this day at high speed with simulated GPS + clock';
    start.onclick = () => {
      // Synchronous unlock + immediate audible speak INSIDE the user-gesture
      // handler. Without this, the first speak from setInterval is silently
      // blocked by Chrome Android / iOS Safari.
      try {
        if (window.NamibiaTTS) {
          window.NamibiaTTS.unlockOnGesture();
          // Fire one real announcement immediately so the user hears
          // confirmation that audio works.
          window.NamibiaTTS.speak('demo_starting');
        }
      } catch (_) {}
      const durSec = Number(document.getElementById('demoDuration')?.value || defaults.durationMs / 1000);
      const noiseHr = Number(document.getElementById('demoNoise')?.value || defaults.noiseHours);
      startDemo({ durationMs: Math.max(5, durSec) * 1000, noiseHours: Math.max(0, noiseHr) });
    };

    const stop = document.createElement('button');
    stop.id = 'demoStop';
    stop.className = 'ghost';
    stop.textContent = '⏹';
    stop.title = 'Stop demo';
    stop.onclick = stopDemo;

    const durLabel = document.createElement('label');
    durLabel.className = 'demo-input demo-dur';
    durLabel.appendChild(document.createTextNode('speed '));
    const durInput = document.createElement('input');
    durInput.id = 'demoDuration';
    durInput.type = 'range';        // drag to adjust how long the whole-day replay takes
    durInput.min = '10';
    durInput.max = '300';
    durInput.step = '5';
    durInput.value = String(defaults.durationMs / 1000);
    const durVal = document.createElement('span');
    durVal.className = 'demo-durval';
    durVal.textContent = durInput.value + 's';
    durInput.addEventListener('input', () => { durVal.textContent = durInput.value + 's'; });
    durLabel.appendChild(durInput);
    durLabel.appendChild(durVal);

    const noiseLabel = document.createElement('label');
    noiseLabel.className = 'demo-input';
    noiseLabel.appendChild(document.createTextNode('noise ±'));
    const noiseInput = document.createElement('input');
    noiseInput.id = 'demoNoise';
    noiseInput.type = 'number';
    noiseInput.min = '0';
    noiseInput.max = '6';
    noiseInput.step = '0.5';
    noiseInput.value = String(defaults.noiseHours);
    noiseLabel.appendChild(noiseInput);
    noiseLabel.appendChild(document.createTextNode(' h'));

    // Tuck the dev/demo controls behind a collapsed disclosure so they don't
    // clutter the live driving view — open it only when you want to replay.
    const details = document.createElement('details');
    details.className = 'demo-details';
    const summary = document.createElement('summary');
    summary.className = 'demo-summary';
    summary.textContent = '🧪 Demo';
    details.appendChild(summary);
    details.appendChild(start);
    details.appendChild(stop);
    details.appendChild(durLabel);
    details.appendChild(noiseLabel);
    wrap.appendChild(details);
    sticky.appendChild(wrap);

    // If the demo is currently running, re-paint the button progress so we
    // don't visually "reset" every time the dashboard re-renders.
    if (isDemoRunning()) {
      updateDemoButton(demoProgressT, false);
    }
  }

  // The dashboard re-renders its tree on every GPS tick; observe tabContent to
  // re-inject the demo controls whenever the dashboard rebuilds.
  function startObserver() {
    if (typeof MutationObserver === 'undefined') return;
    const root = document.getElementById('tabContent');
    if (!root) return;
    const obs = new MutationObserver(() => injectDemoControls());
    obs.observe(root, { childList: true, subtree: true });
    injectDemoControls();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  window.NamibiaDemo = {
    startDemo,
    stopDemo,
    isRunning: isDemoRunning,
    interpPolyline,
    buildDrivePath,
    cardProgressFractions,
    activeCardAtT,
    autoDurationMs,
    totalRouteMinutes,
    generateNoiseSeries,
    sampleNoise,
    setDefaults: opts => Object.assign(defaults, opts || {}),
    setRng: rng => { demoRng = rng; }
  };
})();
