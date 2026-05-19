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
    // Open-Meteo's forecast endpoint only covers a rolling window (~16 days
    // out). Dates beyond that return 400. Skip silently so the request loop
    // doesn't blow up on the tail end of a multi-day trip.
    const dayMs = Date.parse(date + 'T00:00:00Z');
    const horizonMs = Date.now() + 16 * 86400000;
    if (!isFinite(dayMs) || dayMs > horizonMs) {
      throw new Error('beyond forecast horizon');
    }
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
        errors++;
        if (typeof log === 'function') log(`Weather fetch failed for ${d.date}: ${e.message || e}`);
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
  function etaIsoLocalForStep(d, leg, stepIdx, route) {
    if (!ST) return null;
    // Cumulative minutes from the day's 08:00 local start through this step's start.
    let cumMin = 0;
    for (const l of route.legs) {
      for (let i = 0; i < l.steps.length; i++) {
        if (l === leg && i === stepIdx) {
          const startMs = Date.parse(d.date + 'T08:00:00+02:00');
          const local = new Date(startMs + cumMin * 60000);
          // Express as "YYYY-MM-DDTHH:00" local. Open-Meteo's hourly entries
          // use the location's local tz (we requested timezone:auto).
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

  // ---- DOM injection: weather block per step in Directions tab ----
  function weatherBlockHtml(w) {
    if (!w) return '';
    const rainCls = w.rainy ? 'step-weather-rain' : '';
    const temp = (typeof w.tempC === 'number') ? `${Math.round(w.tempC)}°C` : '—';
    const wind = (typeof w.windKmh === 'number') ? `${Math.round(w.windKmh)} km/h` : '—';
    const precip = (typeof w.precipMm === 'number' && w.precipMm > 0) ? ` · 💧${w.precipMm}mm` : '';
    const hour = w.isoLocal ? w.isoLocal.slice(11, 16) : '';
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="step-detail step-weather ${rainCls}"><strong>Forecast at ETA${hour ? ' (' + hour + ')' : ''}:</strong> ${esc(w.emoji)} ${esc(w.label)} · ${temp} · 💨${wind}${precip}</div>`;
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
        if (liEl.querySelector('.step-weather')) return;
        const html = weatherBlockHtml(step.weatherAtEta);
        if (!html) return;
        // Insert weather just before the step-media (or at end).
        const anchor = liEl.querySelector('.step-media') || liEl.querySelector('.step-details') || null;
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const node = tmp.firstElementChild;
        if (anchor) liEl.insertBefore(node, anchor);
        else liEl.appendChild(node);
      });
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
      attachWeatherToSteps();
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
      // Make sure weather is attached to each step before we render.
      attachWeatherToSteps();
      renderWeatherIntoDirections();
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
  }, 1500);

  window.NamibiaV23 = {
    loadAllWeather, refreshAll, attachWeatherToSteps, etaIsoLocalForStep,
    centroidOf, getCachedForDay, invalidateAllWeather,
    fetchDayWeather, // exposed for tests
    _loadCached: loadCached,
    _saveCached: saveCached
  };
})();
