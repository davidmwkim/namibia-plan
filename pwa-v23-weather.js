// Namibia PWA v23 — Hourly weather + refresh button.
//
//   * Fetches per-day hourly forecast from Open-Meteo (no API key needed),
//     cached in localStorage with a 12-hour TTL.
//   * Attaches the nearest-hour forecast to each step based on its ETA
//     (computed from the day's 08:00 start + cumulative step durations).
//   * Renders a "Forecast at ETA" line inside each step in the Directions tab.
//   * Adds a 🔄 Refresh button to the top toolbar that:
//       - clears localStorage's route cache
//       - re-fetches all Google Directions (renderAllDays)
//       - re-fetches all weather forecasts
//
// Weather fetches go through the SW so they're cacheable offline; the SW's
// cross-origin allow-list is extended to api.open-meteo.com.
(function () {
  const W = window.NamibiaWeather;
  const ST = window.NamibiaSunTimes;
  const TTL_MS = 12 * 60 * 60 * 1000;
  const NAMIBIA_TZ_OFFSET_MIN = 120;

  // ---- cache ----
  function loadCached(date, lat, lng) {
    try {
      const raw = localStorage.getItem(W.cacheKey(date, lat, lng));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.fetchedAt || (Date.now() - obj.fetchedAt) > TTL_MS) return null;
      return obj.forecast;
    } catch (_) { return null; }
  }
  function saveCached(date, lat, lng, forecast) {
    try {
      localStorage.setItem(W.cacheKey(date, lat, lng), JSON.stringify({ fetchedAt: Date.now(), forecast }));
    } catch (_) {}
  }
  function invalidateAllWeather() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('namibia_weather_v1:')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }

  async function fetchDayWeather(date, lat, lng) {
    // Open-Meteo's forecast endpoint only serves a window of [today,
    // today+~16 days]. Dates outside that return 400. Skip them with a
    // recognisable error message so loadAllWeather can classify the skip
    // as expected rather than logging a noisy "fetch failed".
    const dayMs = Date.parse(date + 'T00:00:00Z');
    if (!isFinite(dayMs)) throw new Error('SKIP: invalid date');
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const daysAhead = Math.floor((dayMs - todayUtc.getTime()) / 86400000);
    if (daysAhead < 0) throw new Error('SKIP: date in the past');
    if (daysAhead > 16) throw new Error('SKIP: beyond forecast horizon');
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      hourly: 'temperature_2m,precipitation,wind_speed_10m,weather_code',
      start_date: date,
      end_date: date,
      timezone: 'auto'
    });
    const url = 'https://api.open-meteo.com/v1/forecast?' + params.toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather HTTP ' + res.status);
    return res.json();
  }

  function centroidOf(day) {
    const stops = (day.stops || []).filter(s => s.routeRole === 'mandatory');
    if (stops.length === 0) return (day.stops || [])[0] || null;
    if (stops.length === 1) return stops[0];
    const mid = stops[Math.floor(stops.length / 2)];
    return mid;
  }

  async function loadAllWeather(opts) {
    opts = opts || {};
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    let done = 0, errors = 0, hit = 0;
    for (const d of days) {
      if (!d.selfDrive) continue;
      const c = centroidOf(d);
      if (!c) continue;
      if (!opts.force) {
        const cached = loadCached(d.date, c.lat, c.lng);
        if (cached) { hit++; done++; continue; }
      }
      try {
        const fc = await fetchDayWeather(d.date, c.lat, c.lng);
        saveCached(d.date, c.lat, c.lng, fc);
        done++;
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.startsWith('SKIP:')) {
          // Expected — date is past or beyond forecast horizon. Don't log.
        } else {
          errors++;
          if (typeof log === 'function') log(`Weather fetch failed for ${d.date}: ${msg}`);
        }
      }
    }
    if (typeof log === 'function') log(`Weather: ${done - hit} fetched, ${hit} cached, ${errors} errors.`);
    return { done, hit, errors };
  }

  function getCachedForDay(d) {
    const c = centroidOf(d);
    if (!c) return null;
    return loadCached(d.date, c.lat, c.lng);
  }

  // ---- Per-step ETA + attachment ----
  // Resolve the "wall-clock anchor" for the start of this day's driving:
  //   - If GPS is active AND the GPS is on this route, anchor at NOW minus the
  //     cumulative minutes to the active step (so steps ahead are in the
  //     future relative to right now). Steps already passed get the
  //     historical hour they were driven through, but that's fine.
  //   - Otherwise (planning mode), use the day's 08:00 local start.
  function dayStartMs(d, route) {
    const planMs = Date.parse(d.date + 'T08:00:00+02:00');
    if (typeof state === 'undefined' || !state?.gps || !state.driving) return planMs;
    if (state.driving.offRoute) return planMs;
    if (typeof state.driving.legIdx !== 'number' || typeof state.driving.stepIdx !== 'number') return planMs;
    // Cumulative minutes from the start of the day through the active step's start.
    let cumMin = 0;
    for (let li = 0; li < route.legs.length; li++) {
      const leg = route.legs[li];
      for (let si = 0; si < leg.steps.length; si++) {
        if (li === state.driving.legIdx && si === state.driving.stepIdx) {
          // Pro-rate the current step by how far into it the GPS has travelled.
          const fullM = ST.parseDistanceToMeters(leg.steps[si].distance) || 1;
          const stepMin = ST.parseDurationToMinutes(leg.steps[si].duration);
          const intoStepMin = stepMin * Math.max(0, Math.min(1, (state.driving.distToStepM || 0) / fullM));
          // Anchor: now - (cumMin + intoStepMin)
          return Date.now() - (cumMin + intoStepMin) * 60000;
        }
        cumMin += ST.parseDurationToMinutes(leg.steps[si].duration);
      }
    }
    return planMs;
  }

  function etaIsoLocalForStep(d, leg, stepIdx, route) {
    if (!ST) return null;
    const startMs = dayStartMs(d, route);
    let cumMin = 0;
    for (const l of route.legs) {
      for (let i = 0; i < l.steps.length; i++) {
        if (l === leg && i === stepIdx) {
          // Express ETA in the location's local tz (we requested
          // timezone:auto from Open-Meteo so its `hourly.time` entries are
          // tz-naive local strings, e.g. "2026-05-24T08:00").
          const localPlus = new Date(startMs + cumMin * 60000 + NAMIBIA_TZ_OFFSET_MIN * 60000);
          const iso = localPlus.toISOString().slice(0, 13) + ':00';
          return iso;
        }
        cumMin += ST.parseDurationToMinutes(l.steps[i].duration);
      }
    }
    return null;
  }

  function attachWeatherToSteps() {
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    for (const d of days) {
      const route = state.renderedRoutes?.[d.date];
      if (!route?.legs) continue;
      const fc = getCachedForDay(d);
      if (!fc) continue;
      for (const leg of route.legs) {
        for (let si = 0; si < leg.steps.length; si++) {
          const iso = etaIsoLocalForStep(d, leg, si, route);
          const w = iso ? W.weatherAtLocalIso(fc, iso) : null;
          leg.steps[si].weatherAtEta = w || null;
        }
      }
    }
  }

  // ---- Per-STOP arrival weather (Stops tab) ----
  // The route legs run between consecutive mandatory stops (verified:
  // legs.length === mandatoryStops.length - 1). Arrival ETA at mandatory stop N
  // = day-start anchor + Σ legs[0..N-1].duration. Each mandatory stop has its
  // own lat/lng, so we use its OWN forecast (the desert trip spans big spatial
  // temperature gradients — coast vs inland — so a single day-centroid would be
  // misleading). Falls back to the day centroid forecast if the per-stop one
  // isn't cached yet.
  function attachWeatherToStops() {
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    for (const d of days) {
      const route = state.renderedRoutes?.[d.date];
      if (!route?.legs || !ST) continue;
      const startMs = dayStartMs(d, route);
      const dayFc = getCachedForDay(d);
      let mi = 0;                  // mandatory-waypoint index (== outgoing-leg index)
      let cumMin = 0;              // cumulative driving minutes to the NEXT waypoint
      let lastWaypointCumMin = 0;  // arrival minutes at the most recent waypoint
      for (const s of (d.stops || [])) {
        // Only `mandatory` stops are Google route waypoints (one leg between
        // each pair). `optional` / `mandatoryAction` stops sit ALONG the
        // current leg, so we time them at the most recent waypoint's arrival
        // (honest approximation — we don't know their position along the leg).
        let etaMin;
        if (s.routeRole === 'mandatory') {
          etaMin = cumMin;
          lastWaypointCumMin = cumMin;
          cumMin += ST.parseDurationToMinutes(route.legs[mi]?.duration);
          mi++;
        } else {
          etaMin = lastWaypointCumMin;
        }
        const localPlus = new Date(startMs + etaMin * 60000 + NAMIBIA_TZ_OFFSET_MIN * 60000);
        const iso = localPlus.toISOString().slice(0, 13) + ':00';
        const hasCoords = typeof s.lat === 'number' && typeof s.lng === 'number';
        const fc = (hasCoords && loadCached(d.date, s.lat, s.lng)) || dayFc;
        let w = fc ? W.weatherAtLocalIso(fc, iso) : null;
        if (!w && fc) w = W.weatherNearestToLocalHour(fc, Date.parse(iso + ':00Z'));
        s._weatherAtEta = w || null;
        s._etaIso = iso;
      }
    }
  }

  // Fetch a forecast for each mandatory stop's own coordinates (sequential per
  // day, parallel across stops within a day to keep it quick). Cached 12h.
  async function loadStopWeather(opts) {
    opts = opts || {};
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    let fetched = 0, hit = 0, errors = 0;
    for (const d of days) {
      if (!d.selfDrive) continue;
      const mand = (d.stops || []).filter(s => s.routeRole === 'mandatory'
        && typeof s.lat === 'number' && typeof s.lng === 'number');
      await Promise.all(mand.map(async s => {
        if (!opts.force && loadCached(d.date, s.lat, s.lng)) { hit++; return; }
        try {
          const fc = await fetchDayWeather(d.date, s.lat, s.lng);
          saveCached(d.date, s.lat, s.lng, fc);
          fetched++;
        } catch (e) {
          if (!String(e?.message || e).startsWith('SKIP:')) errors++;
        }
      }));
    }
    return { fetched, hit, errors };
  }

  // ---- Unit helpers (metric + imperial side-by-side) ----
  function cToF(c) { return c * 9 / 5 + 32; }
  function kmhToMph(k) { return k / 1.60934; }
  function mmToIn(mm) { return mm / 25.4; }
  function fmtTemp(c) {
    if (typeof c !== 'number') return '—';
    return `${Math.round(c)}°C / ${Math.round(cToF(c))}°F`;
  }
  function fmtWind(k) {
    if (typeof k !== 'number') return '—';
    return `${Math.round(k)} km/h / ${Math.round(kmhToMph(k))} mph`;
  }
  function fmtPrecip(mm) {
    if (typeof mm !== 'number' || mm <= 0) return '';
    const inches = mmToIn(mm);
    return ` · 💧${mm.toFixed(1)} mm / ${inches.toFixed(2)} in`;
  }

  // ---- DOM injection: weather block per step in Directions tab ----
  function weatherBlockHtml(w) {
    if (!w) return '';
    const rainCls = w.rainy ? 'step-weather-rain' : '';
    const hour = w.isoLocal ? w.isoLocal.slice(11, 16) : '';
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="step-detail step-weather ${rainCls}"><strong>Forecast at ETA${hour ? ' (' + hour + ')' : ''}:</strong> ${esc(w.emoji)} ${esc(w.label)} · ${fmtTemp(w.tempC)} · 💨${fmtWind(w.windKmh)}${fmtPrecip(w.precipMm)}</div>`;
  }

  function renderWeatherIntoDirections() {
    if (state.activeTab !== 'directions') return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const d = day();
    const route = state.renderedRoutes?.[d.date];
    if (!route?.legs) return;
    const ols = tc.querySelectorAll('.directions ol');
    route.legs.forEach((leg, li) => {
      const ol = ols[li];
      if (!ol) return;
      const lis = ol.querySelectorAll('li');
      leg.steps.forEach((step, si) => {
        const liEl = lis[si];
        if (!liEl) return;
        const html = weatherBlockHtml(step.weatherAtEta);
        const existing = liEl.querySelector('.step-weather');
        // Update-in-place rather than skip: as GPS advances along the route,
        // the dayStartMs anchor shifts and each step's ETA hour changes, so
        // the weather row should re-paint.
        if (!html) {
          if (existing) existing.remove();
          return;
        }
        if (existing) {
          existing.outerHTML = html;
          return;
        }
        const anchor = liEl.querySelector('.step-media') || liEl.querySelector('.step-conditions') || null;
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const node = tmp.firstElementChild;
        if (anchor) liEl.insertBefore(node, anchor);
        else liEl.appendChild(node);
      });
    });
  }

  function stopWeatherBlockHtml(w, etaIso) {
    if (!w) return '';
    const hour = etaIso ? etaIso.slice(11, 16) : (w.isoLocal ? w.isoLocal.slice(11, 16) : '');
    const rainCls = w.rainy ? 'step-weather-rain' : '';
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="step-detail step-weather stop-weather ${rainCls}"><strong>Weather on arrival${hour ? ' (~' + hour + ')' : ''}:</strong> ${esc(w.emoji)} ${esc(w.label)} · ${fmtTemp(w.tempC)} · 💨${fmtWind(w.windKmh)}${fmtPrecip(w.precipMm)}</div>`;
  }

  function renderWeatherIntoStops() {
    if (state.activeTab !== 'stops') return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const d = day();
    const route = state.renderedRoutes?.[d.date];
    if (!route?.legs) return;
    const stopEls = tc.querySelectorAll('.stop-list > .stop');
    const stops = d.stops || [];
    stopEls.forEach((el, i) => {
      const s = stops[i];
      if (!s) return;
      const html = stopWeatherBlockHtml(s._weatherAtEta, s._etaIso);
      const existing = el.querySelector('.stop-weather');
      if (!html) { if (existing) existing.remove(); return; }
      if (existing) { existing.outerHTML = html; return; }
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const node = tmp.firstElementChild;
      // Insert into the text column (2nd child of .stop), before the biz-card.
      const textCol = el.children[1] || el;
      textCol.appendChild(node);
    });
  }

  // ---- Refresh button ----
  async function refreshAll() {
    const btn = document.getElementById('refreshLive');
    if (btn) { btn.disabled = true; btn.textContent = '🔄 Refreshing…'; }
    try {
      // Clear route cache so renderAllDays re-fetches fresh from Google.
      localStorage.removeItem('namibia_routes_cache_v5');
      if (typeof state !== 'undefined' && state) state.renderedRoutes = {};
      invalidateAllWeather();
      // Clear SW cached static-map/streetview responses too.
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch (_) {}
      }
      // Re-run the heavy renderAllDays pass.
      if (typeof loadGoogleAndRenderAll === 'function') {
        await loadGoogleAndRenderAll();
        // renderAllDays is async via state.googleLoaded path; give it a moment
        // to populate before we fetch weather, which depends on the route stops.
        await new Promise(r => setTimeout(r, 1000));
      }
      await loadAllWeather({ force: true });
      await loadStopWeather({ force: true });
      attachWeatherToSteps();
      attachWeatherToStops();
      if (typeof render === 'function') render();
      if (typeof log === 'function') log('Refresh complete: routes + weather + caches reloaded.');
    } catch (e) {
      if (typeof log === 'function') log('Refresh failed: ' + (e?.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
    }
  }

  function injectRefreshButton() {
    const toolbar = document.querySelector('.toolbar .toolbar-right') || document.querySelector('.toolbar');
    if (!toolbar || document.getElementById('refreshLive')) return;
    const btn = document.createElement('button');
    btn.id = 'refreshLive';
    btn.className = 'ghost';
    btn.title = 'Force re-fetch of routes, weather, and map images';
    btn.textContent = '🔄 Refresh';
    btn.onclick = refreshAll;
    toolbar.appendChild(btn);
  }

  // ---- Hooks ----
  if (typeof renderTab === 'function') {
    const base = renderTab;
    renderTab = function patchedRenderTabV23() {
      const r = base();
      // Make sure weather is attached to each step + stop before we render.
      attachWeatherToSteps();
      attachWeatherToStops();
      renderWeatherIntoDirections();
      renderWeatherIntoStops();
      injectRefreshButton();
      return r;
    };
  }
  injectRefreshButton();

  // Kick off initial weather load (cached + missing entries) shortly after boot.
  setTimeout(() => {
    loadAllWeather({ force: false }).then(() => {
      attachWeatherToSteps();
      if (state.activeTab === 'directions') renderWeatherIntoDirections();
    }).catch(() => {});
    // Per-stop forecasts run as a separate background pass (more fetches, lower
    // priority than the per-day centroid the Passenger tab needs first).
    loadStopWeather({ force: false }).then(() => {
      attachWeatherToStops();
      if (state.activeTab === 'stops') renderWeatherIntoStops();
    }).catch(() => {});
  }, 1500);

  // Stale-while-revalidate: if the user comes back to the tab and the cached
  // forecast is more than 1 hour old, kick off a background refresh. Keeps
  // the displayed weather "live" without burning quotas mid-drive.
  function maybeRevalidateWeather() {
    if (document.visibilityState !== 'visible') return;
    let oldestMs = Date.now();
    let any = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('namibia_weather_v1:')) continue;
      try {
        const obj = JSON.parse(localStorage.getItem(k) || '{}');
        if (obj.fetchedAt && obj.fetchedAt < oldestMs) { oldestMs = obj.fetchedAt; any = true; }
      } catch (_) {}
    }
    if (!any) return;
    const ageMs = Date.now() - oldestMs;
    if (ageMs < 60 * 60 * 1000) return; // < 1h: still fresh
    Promise.all([
      loadAllWeather({ force: true }),
      loadStopWeather({ force: true })
    ]).then(() => {
      attachWeatherToSteps();
      attachWeatherToStops();
      if (state.activeTab === 'directions') renderWeatherIntoDirections();
      if (state.activeTab === 'stops') renderWeatherIntoStops();
      if (typeof log === 'function') log('Weather auto-refreshed (cache > 1h old).');
    }).catch(() => {});
  }
  document.addEventListener('visibilitychange', maybeRevalidateWeather);
  // Also poll every 30 min while the page is open.
  setInterval(maybeRevalidateWeather, 30 * 60 * 1000);

  window.NamibiaV23 = {
    loadAllWeather, refreshAll, attachWeatherToSteps, etaIsoLocalForStep,
    attachWeatherToStops, loadStopWeather, renderWeatherIntoStops,
    centroidOf, getCachedForDay, invalidateAllWeather,
    fetchDayWeather, // exposed for tests
    _loadCached: loadCached,
    _saveCached: saveCached
  };
})();
