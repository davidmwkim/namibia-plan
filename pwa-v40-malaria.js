// pwa-v40-malaria.js — malaria-zone awareness + tablet-course indicators.
//
// Surfaces, throughout the UI, which days are in the CDC malaria zone (northern
// Etosha, Days 9–12) and which days a prophylaxis tablet is due (2 days before
// the zone → 7 days after leaving = 2026-05-29 … 2026-06-10), and where in the
// course you are. Schedules the daily reminder via pwa-v33 (see scheduleMalaria
// there). The dismissible top banner is the reliability backup for when the OS
// notification can't fire.
(function () {
  const DATA = window.NAMIBIA_TRIP_DATA;
  const MAL = DATA && DATA.meta && DATA.meta.malaria;
  function E(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- date helpers (ISO YYYY-MM-DD; string compare is valid for ordering) ----
  function dDiff(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function fmtDate(iso) { try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) { return iso; } }

  // ---- core: status for a date ----
  function malariaForDate(iso) {
    if (!MAL || !iso) return { zone: false, med: false, phase: null, dayOfCourse: 0, totalCourse: 0 };
    const totalCourse = dDiff(MAL.medStartDate, MAL.medEndDate) + 1;
    const med = iso >= MAL.medStartDate && iso <= MAL.medEndDate;
    const zone = (MAL.zoneDates || []).indexOf(iso) >= 0 || (iso >= MAL.entryDate && iso <= MAL.exitDate);
    let phase = null, dayOfCourse = 0;
    if (med) {
      dayOfCourse = dDiff(MAL.medStartDate, iso) + 1;
      phase = zone ? 'in' : (iso < MAL.entryDate ? 'pre' : 'post');
    }
    return { zone, med, phase, dayOfCourse, totalCourse };
  }
  function phaseText(iso, info) {
    if (!info || !info.med) return '';
    const of = ` (day ${info.dayOfCourse} of ${info.totalCourse})`;
    if (info.phase === 'pre') { const n = dDiff(iso, MAL.entryDate); return `pre-zone — ${n} day${n === 1 ? '' : 's'} before Etosha${of}`; }
    if (info.phase === 'in') return `in the Etosha malaria zone${of}`;
    const n = dDiff(MAL.exitDate, iso); return `${n} day${n === 1 ? '' : 's'} after the zone${of}`;
  }

  // ---- first self-drive departure (for the 30-min-before reminder) ----
  function firstDriveMinutes(d) {
    if (!d || !d.selfDrive || typeof parseTimeMinutes !== 'function') return null;
    const stops = d.stops || [];
    const first = stops.find(s => s.tripStopType === 'start') || stops.find(s => s.routeRole === 'mandatory') || stops[0];
    return first ? parseTimeMinutes(first.time) : null;
  }
  // Device-local Date for the reminder: self-drive day → firstDrive−30; else
  // (guided day or post-trip date) → postTripReminderHour:00 local.
  function reminderDateFor(iso) {
    const parts = iso.split('-').map(Number);
    const d = (DATA.days || []).find(x => x.date === iso);
    let mins = (d && d.selfDrive) ? firstDriveMinutes(d) : null;
    if (mins != null) { mins = Math.max(0, mins - 30); return new Date(parts[0], parts[1] - 1, parts[2], Math.floor(mins / 60), mins % 60, 0); }
    return new Date(parts[0], parts[1] - 1, parts[2], (MAL && MAL.postTripReminderHour) || 9, 0, 0);
  }

  // ---- dismissible top banner (today) ----
  function injectBanner() {
    if (!MAL) return;
    const today = (typeof todayISO === 'function') ? todayISO() : '';
    const info = malariaForDate(today);
    const existing = document.getElementById('malariaBanner');
    if (!info.med || localStorage.getItem('namibia_malaria_dismissed:' + today) === '1') { if (existing) existing.remove(); return; }
    if (existing) return;
    const icon = info.zone ? '🦟' : '💊';
    const html = `<div id="malariaBanner" class="malaria-banner mal-${info.phase}">`
      + `<span class="mb-pill">${icon}💊</span>`
      + `<span class="mb-text">Malaria tablet today — ${E(phaseText(today, info))}. Take with food, ~30 min before driving.</span>`
      + `<button class="mb-close" id="malariaBannerClose" aria-label="Dismiss for today">✕</button></div>`;
    document.body.insertAdjacentHTML('afterbegin', html);
    const btn = document.getElementById('malariaBannerClose');
    if (btn) btn.onclick = () => { try { localStorage.setItem('namibia_malaria_dismissed:' + today, '1'); } catch (_) {} const b = document.getElementById('malariaBanner'); if (b) b.remove(); };
  }

  // ---- day-select 🦟 / 💊 marks (run after pwa-v17 decorateDaySelect) ----
  function decorateDaySelect() {
    const sel = document.getElementById('daySelect');
    if (!sel || !MAL) return;
    Array.from(sel.options).forEach((opt, i) => {
      const d = (DATA.days || [])[i]; if (!d) return;
      const info = malariaForDate(d.date);
      const mark = info.zone ? ' 🦟' : (info.med ? ' 💊' : '');
      // includes() (not endsWith) so a second module appending its own emoji
      // after ours doesn't make us re-append on the next render.
      if (mark && !opt.text.includes(mark.trim())) opt.text = opt.text + mark;
    });
  }

  // ---- per-selected-day indicators (Overview card + Itinerary banner) ----
  function malariaCardHtml(d) {
    if (!MAL || !d) return '';
    const info = malariaForDate(d.date);
    const status = info.zone
      ? '🦟 <strong>In the malaria zone today</strong> — northern Etosha.'
      : info.med
        ? `💊 <strong>Malaria tablet day</strong> — ${E(phaseText(d.date, info))}.`
        : '✅ No malaria risk on this day.';
    const course = `Tablet course: <strong>${fmtDate(MAL.medStartDate)} → ${fmtDate(MAL.medEndDate)}</strong>`
      + ` · zone ${fmtDate(MAL.entryDate)}–${fmtDate(MAL.exitDate)} (Days 9–12, Etosha north).`;
    return `<div class="malaria-card ${info.zone ? 'mal-zone' : info.med ? 'mal-med' : 'mal-none'}">`
      + `<h3>🦟 Malaria</h3><p class="mal-status">${status}</p><p class="mal-course">${course}</p>`
      + `<p class="mal-note">${E(MAL.note)}</p></div>`;
  }
  function bannerLineHtml(d) {
    if (!MAL || !d) return '';
    const info = malariaForDate(d.date);
    if (!info.med && !info.zone) return '';
    const icon = info.zone ? '🦟' : '💊';
    return `<div class="malaria-day-strip mal-${info.phase || 'none'}">${icon} ${info.zone ? 'Malaria zone' : 'Malaria tablet'} — ${E(phaseText(d.date, info))}</div>`;
  }
  function injectDayIndicators() {
    const tc = document.getElementById('tabContent');
    if (!tc || !MAL) return;
    const d = (typeof day === 'function') ? day() : null;
    if (!d) return;
    if (state.activeTab === 'overview' && !tc.querySelector('.malaria-card')) {
      const nc = tc.querySelector('.now-card-inline');
      if (nc) nc.insertAdjacentHTML('afterend', malariaCardHtml(d));
      else tc.insertAdjacentHTML('afterbegin', malariaCardHtml(d));
    } else if (state.activeTab === 'stops' && !tc.querySelector('.malaria-day-strip')) {
      const line = bannerLineHtml(d);
      if (line) tc.insertAdjacentHTML('afterbegin', line);
    }
  }

  // ---- hooks ----
  if (typeof renderTab === 'function') {
    const baseRT = renderTab;
    renderTab = function patchedRenderTabV40() {
      const r = baseRT.apply(this, arguments);
      try { decorateDaySelect(); injectDayIndicators(); } catch (_) {}
      return r;
    };
  }
  if (typeof render === 'function') {
    const baseR = render;
    render = function patchedRenderV40() {
      const r = baseR.apply(this, arguments);
      try { injectBanner(); decorateDaySelect(); } catch (_) {}
      return r;
    };
  }
  setTimeout(() => { try { injectBanner(); decorateDaySelect(); injectDayIndicators(); } catch (_) {} }, 400);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { try { injectBanner(); } catch (_) {} } });

  window.NamibiaV40 = { malariaForDate, phaseText, firstDriveMinutes, reminderDateFor, fmtDate, MAL };
})();
