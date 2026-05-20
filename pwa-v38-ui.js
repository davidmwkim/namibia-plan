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
    unpaved: { label: 'Unpaved', cls: 'sf-sand'   },
    urban:   { label: 'Urban',   cls: 'sf-urban'  },
    mixed:   { label: 'Mixed',   cls: 'sf-mixed'  }
  };
  function surfaceBadge(surface){ const m = SURFACE_META[surface] || SURFACE_META.mixed; return `<span class="surface-badge ${m.cls}">${m.label}</span>`; }

  // ============================================================ Task 13: drive + Heather plan
  function heatherPlanHtml(d){
    if (!d.selfDrive){
      return `<div class="seg-plan"><h3>Today's drive</h3><p class="seg-none">No self-drive route today — guided or local day. Heather and David both ride along.</p></div>`;
    }
    const segs = d.driveSegments || [];
    if (!segs.length) return '';
    const total = segs.reduce((a,s)=>a+(s.km||0), 0) || 1;
    const heatherKm = segs.reduce((a,s)=> a + (s.driver==='heather' ? (s.km||0) : (s.driver==='shared' ? (s.km||0)/2 : 0)), 0);
    const pct = Math.round(heatherKm/total*100);
    const inBand = pct >= 20 && pct <= 40;
    const bandNote = inBand
      ? `<span class="band-ok">✓ within the 20–40% relief target</span>`
      : (pct < 20
          ? `<span class="band-low">below target — mostly technical terrain for David today</span>`
          : `<span class="band-high">above target — an easy day, so extra rest for David</span>`);
    const rows = segs.map(s => {
      const drv = s.driver==='heather' ? '🟢 Heather' : (s.driver==='shared' ? '🟡 Shared' : '🔵 David');
      return `<tr class="seg-row seg-${s.driver}">
        <td class="seg-leg">${E(s.from)} → ${E(s.to)}</td>
        <td class="seg-surface">${surfaceBadge(s.surface)}</td>
        <td class="seg-km">${s.km ? `${s.km} km` : ''}</td>
        <td class="seg-driver">${drv}</td>
      </tr>${s.note ? `<tr class="seg-note-row"><td colspan="4">${E(s.note)}</td></tr>` : ''}`;
    }).join('');
    return `<div class="seg-plan">
      <h3>Today's drive &amp; Heather relief plan</h3>
      <p class="seg-summary">${E(d.driveExperience && d.driveExperience.summary || '')}</p>
      <div class="seg-share">Heather drives ≈ <strong>${pct}%</strong> (${Math.round(heatherKm)} of ${total} km) · ${bandNote}</div>
      <table class="seg-table"><tbody>${rows}</tbody></table>
      <p class="seg-legend">Surface: ${surfaceBadge('paved')} ${surfaceBadge('gravel')} ${surfaceBadge('sand')} — on the route maps, line <em>colour</em> shows who drives, line <em>dash</em> shows the surface.</p>
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
          <span class="chip" id="offlineStatus">${E(STATUS.offlineStatus)}</span>
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
    surfaceBadge, renderSettings, SURFACE_META, fmtClock, fmtDur
  };
})();
