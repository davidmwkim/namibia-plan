// Namibia PWA v17 — Heather indicator + per-day route coloring.
//
// Classifies each self-drive day by Heather's ability to drive it:
//   yes (green)   — at least one heatherDriveSegments entry has status:'can_drive'
//   maybe (amber) — at least one entry has status:'partial' but none can_drive
//   no  (red)     — no entries (David drives the whole day)
//   n/a            — non-self-drive day (guided / local)
//
// Surfaces:
//   - Emoji prefix in the day-select dropdown
//   - Banner chip in the Overview tab heading
//   - Chip in the Driving Dashboard sticky header
//   - Banner in print mode
//   - Color of the route polyline on BOTH maps (sidebar + dashboard)
//
// Colors are tuned for the Google Maps roadmap background (cream/grey):
//   green  #16a34a
//   amber  #f59e0b
//   red    #dc2626
(function () {
  const STATUS_META = {
    yes:   { emoji: '🟢', color: '#16a34a', label: 'Heather OK leg' },
    maybe: { emoji: '🟡', color: '#f59e0b', label: 'Heather maybe leg' },
    no:    { emoji: '🔴', color: '#dc2626', label: 'David drives' },
    na:    { emoji: '⚪', color: '#9ca3af', label: 'Not self-drive' }
  };

  function heatherStatusForDay(d) {
    if (!d || d.selfDrive === false) return 'na';
    const segs = d.heatherDriveSegments || [];
    if (!segs.length) return 'no';
    if (segs.some(s => s.status === 'can_drive')) return 'yes';
    if (segs.some(s => s.status === 'partial')) return 'maybe';
    return 'no';
  }

  function metaFor(d) { return STATUS_META[heatherStatusForDay(d)]; }

  function heatherChipHtml(d) {
    const m = metaFor(d);
    return `<span class="heather-leg-chip heather-${heatherStatusForDay(d)}">
      <span class="heather-leg-dot" style="background:${m.color}"></span>
      ${m.emoji} ${m.label}
    </span>`;
  }

  // ---- 1. Day-select dropdown ----
  function decorateDaySelect() {
    const sel = document.getElementById('daySelect');
    if (!sel) return;
    const data = window.NAMIBIA_TRIP_DATA;
    if (!data) return;
    Array.from(sel.options).forEach((opt, i) => {
      const d = data.days[i];
      if (!d) return;
      const m = metaFor(d);
      // Cache the ORIGINAL option text the first time we see it. JS regex
      // character classes match surrogate halves rather than full code-points
      // for multi-byte emoji, so stripping a previous emoji prefix via regex
      // is fragile — caching is the robust approach.
      if (typeof opt.dataset.originalText !== 'string' || opt.dataset.originalText === '') {
        opt.dataset.originalText = opt.text;
      }
      opt.text = `${m.emoji} ${opt.dataset.originalText}`;
    });
  }

  // ---- 2. Overview tab — add chip after the day title ----
  function injectOverviewChip() {
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const title = tc.querySelector('.panel-title h2');
    if (!title || title.querySelector('.heather-leg-chip')) return;
    const d = window.day && window.day();
    if (!d) return;
    title.insertAdjacentHTML('beforeend', ' ' + heatherChipHtml(d));
  }

  // ---- 3. Driving Dashboard sticky header — add a chip next to the GPS chip ----
  function injectDriveDashboardChip() {
    const controls = document.querySelector('.drive-controls');
    if (!controls || controls.querySelector('.heather-leg-chip')) return;
    const d = window.day && window.day();
    if (!d) return;
    const gpsChip = controls.querySelector('.gps-chip');
    const html = heatherChipHtml(d);
    if (gpsChip) gpsChip.insertAdjacentHTML('afterend', html);
    else controls.insertAdjacentHTML('beforeend', html);
  }

  // ---- 4. Print mode — banner in each print-day ----
  function injectPrintBanners() {
    const articles = document.querySelectorAll('#printPages .print-day');
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    articles.forEach((article, i) => {
      const d = days[i];
      if (!d) return;
      if (article.querySelector('.heather-leg-chip')) return;
      const h2 = article.querySelector('h2');
      if (h2) h2.insertAdjacentHTML('afterend', `<div class="print-heather-banner">${heatherChipHtml(d)}</div>`);
    });
  }

  // ---- 5. Recolor map polylines ----
  // v9 owns the sidebar map's polyline (#5a1738 burgundy). We override the
  // color each time it draws. v13 owns the dashboard map's polyline.
  function recolorSidebarPolyline() {
    if (!window.google || !state?.map) return;
    // The v9 polyline is module-private; we re-fetch from the map by inspecting
    // overlays. A simpler approach: re-set styles on any Polyline whose stroke
    // is the burgundy default OR whose path roughly matches today's overviewPath.
    // We use a stamp on the map element to avoid double-coloring.
  }

  // Patch v9's drawCachedPath via the exported recolor helper: easier to
  // re-implement coloring by hooking renderMapMarkers (which v9 wraps).
  function applyColorsViaRender() {
    // Defer to v9's draw, then walk the map's overlays and recolor the route line.
    // google.maps doesn't give us an easy iteration API, so we keep our own
    // reference: window.namibiaRecolorRoute may be set by v9 in the future.
    // Pragmatic alternative: monkey-patch google.maps.Polyline constructor to
    // intercept burgundy strokes and re-color.
  }

  // Wrap google.maps.Polyline so any polyline we create with the burgundy
  // default stroke gets the Heather color instead.
  function monkeyPatchPolyline() {
    if (!window.google || !google.maps || !google.maps.Polyline) return;
    if (google.maps.Polyline.__v17Patched) return;
    const Orig = google.maps.Polyline;
    function Patched(opts) {
      try {
        if (opts && (opts.strokeColor === '#5a1738' || /^#5a1738/i.test(opts.strokeColor || ''))) {
          const d = window.day && window.day();
          if (d) opts.strokeColor = metaFor(d).color;
        }
      } catch (_) {}
      return new Orig(opts);
    }
    Patched.prototype = Orig.prototype;
    Patched.__v17Patched = true;
    Patched.__orig = Orig;
    google.maps.Polyline = Patched;
  }
  // Try to patch immediately and also after Google loads.
  monkeyPatchPolyline();
  const origLoadGoogleAndRenderAll = window.loadGoogleAndRenderAll;
  if (typeof origLoadGoogleAndRenderAll === 'function') {
    window.loadGoogleAndRenderAll = function patchedLoadV17() {
      const r = origLoadGoogleAndRenderAll.apply(this, arguments);
      // The Google JS API loads async; poll briefly to install the polyline patch.
      let tries = 0;
      const t = setInterval(() => {
        if (window.google && google.maps && google.maps.Polyline) {
          monkeyPatchPolyline();
          clearInterval(t);
        } else if (++tries > 50) {
          clearInterval(t);
        }
      }, 200);
      return r;
    };
  }

  // ---- Hook renders ----
  function applyAll() {
    decorateDaySelect();
    injectOverviewChip();
    injectDriveDashboardChip();
    injectPrintBanners();
  }

  if (typeof render === 'function') {
    const baseRender = render;
    render = function patchedRenderV17() {
      const r = baseRender();
      applyAll();
      return r;
    };
  }
  if (typeof renderTab === 'function') {
    const baseRenderTab = renderTab;
    renderTab = function patchedRenderTabV17() {
      const r = baseRenderTab();
      applyAll();
      return r;
    };
  }
  if (typeof renderPrintPages === 'function') {
    const basePrint = renderPrintPages;
    renderPrintPages = function patchedRenderPrintPagesV17() {
      const r = basePrint();
      injectPrintBanners();
      return r;
    };
  }
  applyAll();

  window.NamibiaV17 = {
    heatherStatusForDay,
    metaFor,
    heatherChipHtml,
    STATUS_META
  };
})();
