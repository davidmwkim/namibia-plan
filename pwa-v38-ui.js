// pwa-v38-ui.js — UI restructure (loaded LAST, wraps renderTab outermost).
//
//   * Settings tab (data-tab="settings") holds the API key, prepare-offline,
//     refresh, force-update, install, and all exports — moved out of the hero
//     and toolbar so the main view is just the day tabs.
//   * Overview tab gains: the now-card (Next + Waze/Google), the authored trip
//     description, a per-day drive + Heather relief plan, and a trip-wide list
//     of every tyre-pressure/fuel stop along the way.
//   * Itinerary tab (formerly "Stops") shows event end-times and synthesized
//     "Downtime" entries for long idle gaps at a lodge/hotel.
//
// Wires its own Settings buttons to the functions other patches expose
// (NamibiaV23.refreshAll, NamibiaV29.forceUpdate, namibiaPrepareOfflineWithFeedback)
// rather than relying on the now-removed toolbar buttons.
(function () {
  const DATA = window.NAMIBIA_TRIP_DATA;
  function esc2(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  const E = (typeof esc === 'function') ? esc : esc2;
  const $id = (id) => document.getElementById(id);

  // ---- Status chips (moved out of the hero into Settings to declutter the
  // main view). We keep a store of the latest status text so the Settings panel
  // can show current values whenever it's opened, and wrap the global setStatus
  // so live updates still land on the chips when Settings is the active tab.
  const STATUS = { googleStatus: 'Google: not loaded', offlineStatus: 'Offline cache: checking', gpsStatus: 'GPS: off' };
  // Compute the offline status live from the actual SW state — the one-shot
  // setStatus on registration can race with this module's load and leave the
  // chip stuck on "checking".
  function offlineStatusLive() {
    if (!('serviceWorker' in navigator)) return 'Service worker unsupported';
    if (navigator.serviceWorker.controller) return navigator.onLine ? 'Online · shell cached' : 'Offline · shell cached';
    return STATUS.offlineStatus;
  }
  if (typeof setStatus === 'function') {
    const _setStatus = setStatus;
    setStatus = function patchedSetStatusV38(id, text) { STATUS[id] = text; return _setStatus(id, text); };
  }
  let swVersion = '';
  function fetchSwVersion(cb) {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller && typeof MessageChannel !== 'undefined') {
        const ch = new MessageChannel();
        ch.port1.onmessage = e => { swVersion = String(e.data || ''); cb(swVersion); };
        navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      } else cb(swVersion);
    } catch (_) { cb(swVersion); }
  }

  // ---------- time helpers ----------
  function toMin(t){ return (typeof parseTimeMinutes === 'function') ? parseTimeMinutes(t) : null; }
  function fmtClock(min){ if (min == null) return ''; let h = Math.floor(min/60), m = ((min%60)+60)%60; const ap = h>=12?'PM':'AM'; let hh = h%12; if (hh===0) hh=12; return `${hh}:${String(m).padStart(2,'0')} ${ap}`; }
  function fmtDur(min){ const h=Math.floor(min/60), m=min%60; return (h?`${h}h `:'') + (m?`${m}m`:(h?'':'0m')); }
  function fmtRange(s){ return (s.endTime && toMin(s.endTime)!=null) ? `${E(s.time)} – ${E(s.endTime)}` : E(s.time); }

  // ============================================================ Task 11: now-card
  function nowCardHtml(d){
    const isToday = (typeof todayISO === 'function') && d.date === todayISO();
    let next;
    if (isToday) next = d.stops.find(s => { const m = toMin(s.time); return m != null && m >= nowMinutes(); }) || d.stops[d.stops.length-1];
    else next = d.stops[0];
    let gpsLine = 'GPS not enabled.';
    if (state.gps){
      const nearest = d.stops.map(s => ({ s, m: distMeters(state.gps, s) })).sort((a,b)=>a.m-b.m)[0];
      gpsLine = nearest ? `Nearest stop: ${nearest.s.emoji} ${E(nearest.s.name)} (${Math.round(nearest.m)} m)` : 'GPS enabled.';
    }
    const route = (typeof routeStops === 'function') ? routeStops(d) : [];
    const waze = (next && typeof wazeUrl === 'function') ? wazeUrl(next) : '';
    const gmap = (typeof googleMapsUrl === 'function') ? googleMapsUrl(d) : '';
    return `<div class="now-card-inline">
      <div class="now-date">Day ${d.day} · ${E(d.date)}</div>
      <div class="now-title">${E(d.title)}</div>
      <div class="kv">
        <div><strong>Next</strong><span>${next ? `${next.emoji} ${E(next.time)} — ${E(next.name)}` : '—'}</span></div>
        <div><strong>Route</strong><span>${d.selfDrive ? `${route.length} mandatory route stops` : 'No fixed self-drive route'}</span></div>
        <div><strong>GPS</strong><span>${E(gpsLine)}</span></div>
      </div>
      <div class="now-actions hero-actions" style="justify-content:flex-start;margin-top:12px">
        ${waze ? `<a href="${waze}" target="_blank" rel="noopener"><button class="primary">Open next in Waze</button></a>` : ''}
        ${gmap ? `<a href="${gmap}" target="_blank" rel="noopener"><button>Google route</button></a>` : ''}
      </div>
    </div>`;
  }

  // ============================================================ surface metadata (shared with Task 12)
  const SURFACE_META = {
    paved:   { label: 'Paved',   cls: 'sf-paved'  },
    gravel:  { label: 'Gravel',  cls: 'sf-gravel' },
    sand:    { label: 'Sand',    cls: 'sf-sand'   },
    dirt:    { label: 'Dirt',    cls: 'sf-sand'   },
    unpaved: { label: 'Unpaved', cls: 'sf-sand'   },
    urban:   { label: 'Urban',   cls: 'sf-urban'  },
    mixed:   { label: 'Mixed',   cls: 'sf-mixed'  }
  };
  function surfaceBadge(surface){ const m = SURFACE_META[surface] || SURFACE_META.mixed; return `<span class="surface-badge ${m.cls}">${m.label}</span>`; }

  // ============================================================ Task 13 + Heather redesign: drive plan + sequential time bar
  const STATUS_BAR = {
    yes:   { emoji: '🟢', who: 'Heather' },
    maybe: { emoji: '🟡', who: 'Caution' },
    no:    { emoji: '🔴', who: 'David' }
  };
  function surfLabel(s){ return ({ paved:'paved', gravel:'gravel', dirt:'dirt', sand:'sand', urban:'town', mixed:'mixed' })[s] || s || 'paved'; }
  // Approximate driving speed (km/h) by surface — shown as a Namibia-style
  // round speed-limit sign. Tar 120, gravel 80, dirt 60, town 60, sand 40.
  function legSpeed(surface){ return ({ paved:120, gravel:80, dirt:60, sand:40, urban:60, mixed:80 })[surface] || 80; }
  // Curated, research-grounded specifics layered onto a leg by its road code.
  const CODE_BLURB = {
    C24: 'C24 + Spreetshoogte Pass — ~17% grade, ~1,000 m drop over 4 km of switchbacks, trucks banned.',
    C14: 'C14 desert crossing — Kuiseb & Gaub passes (steep, drop-offs, no guardrails), heavy corrugations, very remote.',
    C19: 'C19 — badly corrugated gravel, remote.',
    D1918: 'D1918 — gravel to Spitzkoppe, last ~10 km corrugated.',
    B1: 'B1 — fast trucks + livestock; Okahandja–Otjiwarongo is one of Namibia’s deadliest stretches. Watch for overtakers.',
    B2: 'B2 tar — but towns (Usakos / Karibib / Okahandja), port trucks near Walvis Bay, and the Usakos–Karibib roadworks.',
    B6: 'B6 airport freeway — open tar that merges into Windhoek’s ring roads.'
  };
  function legBlurb(l){
    for (const c of (l.codes || [])) if (CODE_BLURB[c]) return CODE_BLURB[c];
    if (l.surface === 'gravel') return l.status === 'no'
      ? 'Twisty or busy gravel — David’s (pass, hairpins or junctions); corrugations, dust.'
      : 'Open, straight gravel, low traffic — Heather’s comfortable (air down, easy pace).';
    if (l.status === 'no') return 'Heavy traffic / busy town — merging, passing and junctions; David.';
    if (l.status === 'yes' && (l.surface === 'dirt' || l.surface === 'sand')) return 'Firm dirt/sand, low traffic — a good Heather stretch (air down and keep momentum on sand).';
    if (l.status === 'yes') return 'Open paved, low traffic — a good Heather stretch.';
    return 'Paved but with traffic — merges, passing, town-throughs or fast trucks; Heather on the open parts, David for the busy bits.';
  }
  function legName(l){
    const codes = (l.codes || []).filter(c => c && c !== 'urban' && c !== 'hwy' && c !== 'sand');
    if (codes.length) return codes.slice(0, 3).join(' / ');
    if (l.surface === 'urban') return 'town streets';
    return 'local roads';
  }

  // ---- Sequential time bar (legs in route order, width ∝ Google drive time) ----
  function nearestPathIdx(path, p){ let bi = 0, bd = Infinity; for (let i = 0; i < path.length; i++){ const dd = (window.NamibiaDrivingCore.distMeters(p, path[i])); if (dd < bd){ bd = dd; bi = i; } } return bi; }
  function stopTimeFrac(route, legs, p){
    const path = route.overviewPath || [];
    if (!path.length || !legs.length) return 0;
    const idx = nearestPathIdx(path, p);
    for (const l of legs){
      const lo = Math.min(l.fromIdx, l.toIdx), hi = Math.max(l.fromIdx, l.toIdx);
      if (idx >= lo && idx <= hi){ const f = hi > lo ? (idx - lo) / (hi - lo) : 0; return l.t0Frac + f * (l.t1Frac - l.t0Frac); }
    }
    return idx < legs[0].fromIdx ? 0 : 1;
  }
  function heatherBarHtml(route, opts){
    opts = opts || {};
    const DC = window.NamibiaDrivingCore;
    if (!DC || !DC.heatherSummary) return '';
    const sum = DC.heatherSummary(route);
    const legs = sum.legs;
    if (!legs.length) return '';
    const segs = legs.map(l => {
      const left = (l.t0Frac * 100).toFixed(2), w = ((l.t1Frac - l.t0Frac) * 100).toFixed(2);
      return `<span class="hbar-seg hbar-${l.status}" style="left:${left}%;width:${w}%" title="${STATUS_BAR[l.status].emoji} ${E(legName(l))} · ${surfLabel(l.surface)} · ${fmtDur(l.durMin)}"></span>`;
    }).join('');
    const d = day();
    const pdir = window.NamibiaV25 && window.NamibiaV25.mandatoryPressureDir;
    const marks = (d.stops || []).filter(s => typeof s.lat === 'number').map(s => {
      const f = stopTimeFrac(route, legs, s);
      const pd = pdir ? pdir(s) : null; // 'up' (raise) | 'down' (lower) | null
      const mark = pd
        ? `<i class="hbar-press hbar-press-${pd}" aria-label="${pd === 'down' ? 'lower' : 'raise'} tyre pressure">${pd === 'down' ? '▼' : '▲'}</i>`
        : `<i class="hbar-stop-dot"></i>`;
      const tip = pd ? ` — tyre pressure ${pd === 'down' ? 'LOWER ▼' : 'RAISE ▲'}` : '';
      return `<span class="hbar-stop${pd ? ' hbar-stop-press' : ''}" style="left:${(f * 100).toFixed(2)}%" title="${E(s.time || '')} ${E(s.name)}${tip}">${mark}<i class="hbar-stop-time">${E((s.time || '').replace(/\s*(est\.|approx\.)$/i, ''))}</i></span>`;
    }).join('');
    let here = '';
    if (opts.showHere && state.gps){ here = `<span class="hbar-here" style="left:${(stopTimeFrac(route, legs, state.gps) * 100).toFixed(2)}%" title="You are here">▲</span>`; }
    // Parallel SURFACE track (separate vocabulary from Heather colour): paved =
    // black + yellow centre dashes, gravel = grey beads, sand = hashed sand,
    // dirt = brown, urban = its own pattern. Same widths, directly below.
    const surfSegs = legs.map(l => {
      const left = (l.t0Frac * 100).toFixed(2), w = ((l.t1Frac - l.t0Frac) * 100).toFixed(2);
      return `<span class="hbar-surf surf-${l.surface}" style="left:${left}%;width:${w}%" title="${surfLabel(l.surface)}"></span>`;
    }).join('');
    // Namibia-style speed-limit signs at each speed CHANGE along the route.
    let speedMarks = '', prevSpd = null, lastLeft = -99;
    const minSpeedGap = opts.compact ? 8 : 6;
    legs.forEach(l => {
      const spd = legSpeed(l.surface);
      if (spd === prevSpd) return;
      prevSpd = spd;
      let pos = Math.max(l.t0Frac * 100, lastLeft + minSpeedGap); // nudge apart so signs don't overlap
      pos = Math.min(98, pos);
      lastLeft = pos;
      speedMarks += `<span class="spd-mark" style="left:${pos.toFixed(2)}%" title="≈ ${spd} km/h">${spd}</span>`;
    });
    return `<div class="hbar${opts.compact ? ' hbar-compact' : ''}">
      <div class="hbar-row hbar-speedrow"><span class="hbar-rowlab"></span><div class="hbar-speedtrack">${speedMarks}</div></div>
      <div class="hbar-row"><span class="hbar-rowlab">drive</span><div class="hbar-track">${segs}</div></div>
      <div class="hbar-row hbar-stoprow"><span class="hbar-rowlab"></span><div class="hbar-stoptrack">${marks}${here}</div></div>
      <div class="hbar-row"><span class="hbar-rowlab">surface</span><div class="hbar-surftrack">${surfSegs}</div></div>
      ${opts.compact ? '' : `<div class="hbar-surflegend"><span class="surf-line surf-paved"></span>paved <span class="surf-line surf-gravel"></span>gravel <span class="surf-line surf-sand"></span>sand <span class="surf-line surf-dirt"></span>dirt <span class="surf-line surf-urban"></span>town · same patterns appear on every route map</div>`}
    </div>`;
  }

  // Pre-render fallback: the authored SEG table (works before routes are fetched).
  function authoredSegPlanHtml(d){
    const segs = d.driveSegments || [];
    if (!segs.length) return `<div class="seg-plan"><h3>Today's drive &amp; Heather relief plan</h3><p class="seg-none">Render routes (Settings → Save key) to see today's green/yellow/red split with times.</p></div>`;
    const rows = segs.map(s => {
      const drv = s.driver === 'heather' ? '🟢 Heather' : (s.driver === 'shared' ? '🟡 Caution' : '🔴 David');
      return `<tr class="seg-row seg-${s.driver}"><td class="seg-leg">${E(s.from)} → ${E(s.to)}</td><td class="seg-surface">${surfaceBadge(s.surface)}</td><td class="seg-km">${s.km ? `${s.km} km` : ''}</td><td class="seg-driver">${drv}</td></tr>${s.note ? `<tr class="seg-note-row"><td colspan="4">${E(s.note)}</td></tr>` : ''}`;
    }).join('');
    return `<div class="seg-plan"><h3>Today's drive &amp; Heather relief plan</h3><p class="seg-summary">${E(d.driveExperience && d.driveExperience.summary || '')}</p><p class="seg-legend">Planned split (render routes for live times + the sequence bar).</p><table class="seg-table"><tbody>${rows}</tbody></table></div>`;
  }

  function heatherPlanHtml(d){
    if (!d.selfDrive){
      return `<div class="seg-plan"><h3>Today's drive</h3><p class="seg-none">No self-drive route today — guided or local day. Heather and David both ride along.</p></div>`;
    }
    const route = state.renderedRoutes && state.renderedRoutes[d.date];
    const DC = window.NamibiaDrivingCore;
    if (!route || !route.legs || !route.legs.length || !DC || !DC.heatherSummary) return authoredSegPlanHtml(d);
    const sum = DC.heatherSummary(route);
    if (!sum.legs.length) return authoredSegPlanHtml(d);
    const g = sum.pctYesByTime, y = sum.pctMaybeByTime, r = sum.pctNoByTime;
    const relief = g + Math.round(y / 2); // Heather solo (green) + half the caution (yellow)
    const inBand = relief >= 20 && relief <= 40;
    const bandNote = inBand
      ? `<span class="band-ok">✓ ≈ within the 20–40% relief target</span>`
      : (relief < 20
          ? `<span class="band-low">below target — twisty gravel &amp; heavy traffic dominate; David drives most</span>`
          : `<span class="band-high">above target — extra rest for David</span>`);
    const rows = sum.legs.map(l => {
      const st = STATUS_BAR[l.status];
      return `<tr class="seg-row seg-${l.status}">
        <td class="seg-leg">${E(legName(l))}</td>
        <td class="seg-surface"><span class="surf-line surf-${l.surface}" title="${surfLabel(l.surface)}"></span> <span class="surf-lbl">${surfLabel(l.surface)}</span> <span class="spd-sign" title="≈ road speed">${legSpeed(l.surface)}</span></td>
        <td class="seg-km">${fmtDur(l.durMin)}</td>
        <td class="seg-driver">${st.emoji} ${st.who}</td>
      </tr><tr class="seg-note-row"><td colspan="4">${E(legBlurb(l))}</td></tr>`;
    }).join('');
    return `<div class="seg-plan">
      <h3>Today's drive &amp; Heather relief plan</h3>
      <p class="seg-summary">${E(d.driveExperience && d.driveExperience.summary || '')}</p>
      ${heatherBarHtml(route, {})}
      <div class="seg-share">🟢 ${g}% easy · 🟡 ${y}% caution · 🔴 ${r}% David — Heather could take ≈ <strong>${relief}%</strong> of drive time · ${bandNote}</div>
      <table class="seg-table"><tbody>${rows}</tbody></table>
      <p class="seg-legend">Bar = share of Google drive time, in route order; ticks are stops. 🟢 open straight gravel, dirt/sand &amp; quiet paved · 🟡 caution (merges, passing, towns, fast trucks) · 🔴 twisty/busy gravel or busy city.</p>
    </div>`;
  }

  // ============================================================ Task 7: trip description + trip-wide list
  function tripDescHtml(){
    const t = DATA && DATA.meta && DATA.meta.overviewDescription;
    return t ? `<div class="trip-desc"><h3>About this trip</h3><p>${E(t)}</p></div>` : '';
  }
  function nearRoute(stop, route){
    const path = route && route.overviewPath;
    if (!path || !path.length) return true;            // pre-render: can't filter, include
    if (stop.lat == null || typeof distMeters !== 'function') return true;
    let min = Infinity;
    for (let i = 0; i < path.length; i += 2){
      const dm = distMeters(stop, path[i]);
      if (dm < min) min = dm;
      if (min < 3000) return true;
    }
    return min < 3000;
  }
  function tripFuelPressureHtml(){
    if (!DATA || !DATA.days) return '';
    const rows = [];
    for (const d of DATA.days){
      const route = state.renderedRoutes && state.renderedRoutes[d.date];
      for (const s of d.stops){
        if (!s.pressure && !s.fuel) continue;
        if (!nearRoute(s, route)) continue;
        const icon = s.pressure ? '🛞' : '⛽';
        const action = s.pressure
          ? (s.pressureAction === 'down' ? 'lower' : s.pressureAction === 'up' ? 'raise' : 'check')
          : 'fuel';
        rows.push(`<tr class="tfp-row tfp-${s.pressure ? 'pressure' : 'fuel'}"><td>D${d.day}</td><td>${E(s.time)}</td><td>${icon} ${E(s.name)}</td><td class="tfp-act">${E(action)}</td></tr>`);
      }
    }
    if (!rows.length) return '';
    return `<div class="trip-fp"><h3>Every tyre-pressure &amp; fuel stop along the way</h3>
      <table class="tfp-table"><thead><tr><th>Day</th><th>Time</th><th>Stop</th><th>Action</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function injectOverviewExtras(d){
    const tc = $id('tabContent'); if (!tc) return;
    tc.insertAdjacentHTML('afterbegin', nowCardHtml(d) + tripDescHtml());
    tc.insertAdjacentHTML('beforeend', heatherPlanHtml(d) + tripFuelPressureHtml());
  }

  // ============================================================ Task 4/5: Itinerary with end-times + downtime
  const baseStopCard = (typeof stopCard === 'function') ? stopCard : null;
  // Override the global so the Itinerary (and anything else using stopCard) shows
  // event end-times and renders synthesized downtime entries.
  stopCard = function patchedStopCardV38(s){
    if (s && s.kind === 'downtime'){
      return `<div class="stop downtime"><div class="stop-icon">🛋️</div><div>
        <div class="stop-head"><h3>${E(s.name)}</h3><div class="stop-time">${fmtRange(s)}</div></div>
        <p class="downtime-note">${E(s.note || 'Free time — rest, eat, recharge.')}</p>
      </div></div>`;
    }
    let html = baseStopCard ? baseStopCard(s) : '';
    if (s && s.endTime && html){
      html = html.replace(/(<div class="stop-time">)([^<]*)(<\/div>)/, `$1${fmtRange(s)}$3`);
    }
    return html;
  };

  function synthDowntime(stops){
    const out = [];
    for (let i = 0; i < stops.length; i++){
      out.push(stops[i]);
      const a = stops[i], b = stops[i+1];
      if (!b) continue;
      const aEnd = (a.endTime != null ? toMin(a.endTime) : null);
      const aRef = (aEnd != null ? aEnd : toMin(a.time));
      const bStart = toMin(b.time);
      if (aRef == null || bStart == null) continue;
      const gap = bStart - aRef;
      if (gap < 90) continue;
      const sameName = a.name && b.name && a.name === b.name;
      const near = (typeof distMeters === 'function' && a.lat != null && b.lat != null) ? distMeters(a, b) < 300 : false;
      if (!sameName && !near) continue;
      const place = b.name || a.name;
      out.push({
        kind: 'downtime',
        name: `Downtime — rest at ${place}`,
        time: fmtClock(aRef), endTime: fmtClock(bStart),
        lat: b.lat, lng: b.lng,
        note: `About ${fmtDur(gap)} of free time at ${place} — rest, eat, recharge before the next move.`
      });
    }
    return out;
  }
  function renderItinerary(d){
    const tc = $id('tabContent'); if (!tc) return;
    const entries = synthDowntime(d.stops);
    tc.innerHTML = `<div class="stop-list">${entries.map(stopCard).join('')}</div>`;
    try { if (window.NamibiaV23 && window.NamibiaV23.renderWeatherIntoStops) window.NamibiaV23.renderWeatherIntoStops(); } catch (_) {}
  }

  // ============================================================ Task 6: Settings tab
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

  function settingsHtml(){
    const key = (state && state.apiKey) || '';
    const fuel = DATA && DATA.meta && DATA.meta.fuelAssumptions;
    return `<div class="settings-panel">
      <section class="settings-group">
        <h3>Status</h3>
        <div class="settings-status">
          <span class="chip" id="googleStatus">${E(STATUS.googleStatus)}</span>
          <span class="chip" id="offlineStatus">${E(offlineStatusLive())}</span>
          <span class="chip" id="gpsStatus">${E(STATUS.gpsStatus)}</span>
          ${fuel ? `<span class="chip">Fuel model: ${E(fuel.tankLitres)}L tank · ${E(fuel.planningConsumptionLPer100Km)}L/100km</span>` : ''}
          <span class="chip" id="setVersionChip">⚙ ${swVersion ? 'v' + E(swVersion) : '…'}</span>
        </div>
      </section>
      <section class="settings-group">
        <h3>Google Maps key</h3>
        <p class="settings-help">Stored only in this browser. Needed to render routes, maps, Street View, and prepare offline.</p>
        <div class="settings-row">
          <input id="setApiKey" type="password" placeholder="Google Maps API key" value="${E(key)}" autocomplete="off">
          <button class="primary" id="setSaveKey">Save key + render all</button>
        </div>
      </section>
      <section class="settings-group">
        <h3>Offline &amp; updates</h3>
        <div id="settingsControls" class="settings-row wrap">
          <button class="primary" id="setPrepare">⤓ Prepare everything for offline</button>
          <button class="ghost" id="refreshLive">🔄 Refresh</button>
          <button class="ghost" id="forceUpdateBtn">⟳ Force update</button>
          <button class="ghost" id="setInstall">⤵ Install app</button>
        </div>
      </section>
      <section class="settings-group">
        <h3>Exports</h3>
        <div class="settings-row wrap">
          <button id="setExportDay">Export day KML</button>
          <button id="setExportAll">Export all KML ZIP</button>
          <button class="warn" id="setPrint">PDF / print mode</button>
        </div>
      </section>
      <section class="settings-group settings-meta">
        <h3>About</h3>
        <p>${E(DATA && DATA.meta && DATA.meta.title || '')} · ${E(DATA && DATA.meta && DATA.meta.subtitle || '')}${swVersion ? ` · app v${E(swVersion)}` : ''}</p>
      </section>
    </div>`;
  }
  function bindSettings(){
    const sv = $id('setSaveKey'), ki = $id('setApiKey');
    if (sv) sv.onclick = () => {
      if (ki){ state.apiKey = ki.value.trim(); try { localStorage.setItem('namibia_google_api_key', state.apiKey); } catch (_) {} }
      if (typeof loadGoogleAndRenderAll === 'function') loadGoogleAndRenderAll();
    };
    if (ki) ki.onkeydown = e => { if (e.key === 'Enter' && sv) sv.click(); };
    const pr = $id('setPrepare'); if (pr) pr.onclick = () => (window.namibiaPrepareOfflineWithFeedback || window.prepareOffline || function(){})();
    const rf = $id('refreshLive'); if (rf) rf.onclick = () => { if (window.NamibiaV23 && window.NamibiaV23.refreshAll) window.NamibiaV23.refreshAll(); };
    const fu = $id('forceUpdateBtn'); if (fu) fu.onclick = () => { if (window.NamibiaV29 && window.NamibiaV29.forceUpdate) window.NamibiaV29.forceUpdate(fu); };
    const inst = $id('setInstall'); if (inst) inst.onclick = async () => {
      if (deferredInstall){ deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (_) {} deferredInstall = null; }
      else alert('To install: use your browser menu → "Install app" / "Add to Home Screen".');
    };
    const ed = $id('setExportDay'); if (ed) ed.onclick = () => { if (typeof exportSelectedKml === 'function') exportSelectedKml(); };
    const ea = $id('setExportAll'); if (ea) ea.onclick = () => { if (typeof exportAllKmlZip === 'function') exportAllKmlZip(); };
    const pp = $id('setPrint'); if (pp) pp.onclick = () => { if (typeof printMode === 'function') printMode(); };
  }
  function renderSettings(){
    const tc = $id('tabContent'); if (!tc) return;
    tc.innerHTML = settingsHtml();
    bindSettings();
    // Fetch the live SW version and fill the chip + About line in.
    fetchSwVersion((v) => {
      if (state.activeTab !== 'settings') return;
      const chip = $id('setVersionChip');
      if (chip) chip.textContent = '⚙ ' + (v ? 'v' + v : '—');
    });
  }

  // ============================================================ wrap renderTab (outermost)
  if (typeof renderTab === 'function'){
    const baseRT = renderTab;
    renderTab = function patchedRenderTabV38(){
      const r = baseRT.apply(this, arguments);
      try {
        const d = (typeof day === 'function') ? day() : null;
        if (!d) return r;
        if (state.activeTab === 'overview') injectOverviewExtras(d);
        else if (state.activeTab === 'stops') renderItinerary(d);
        else if (state.activeTab === 'settings') renderSettings();
      } catch (e) { if (typeof console !== 'undefined') console.warn('v38 renderTab', e); }
      return r;
    };
  }

  window.NamibiaV38 = {
    nowCardHtml, heatherPlanHtml, tripFuelPressureHtml, synthDowntime,
    surfaceBadge, renderSettings, SURFACE_META, fmtClock, fmtDur,
    heatherBarHtml, legName, legBlurb, surfLabel, STATUS_BAR
  };
})();
