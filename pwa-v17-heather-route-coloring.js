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
    yes:   { emoji: '🟢', color: '#15803d', label: 'Heather OK leg' },
    maybe: { emoji: '🟡', color: '#eab308', label: 'Heather maybe leg' },
    no:    { emoji: '🔴', color: '#dc2626', label: 'David drives' },
    na:    { emoji: '⚪', color: '#9ca3af', label: 'Not self-drive' }
  };

  // Compute distance-weighted distribution of yes/maybe/no along the day's
  // route polyline. Falls back to {0,0,0,0} when no cached route exists yet.
  function heatherDistribution(d) {
    if (!d || d.selfDrive === false) return { yes: 0, maybe: 0, no: 0, total: 0 };
    const route = (typeof state !== 'undefined' && state.renderedRoutes) ? state.renderedRoutes[d.date] : null;
    const path = route?.overviewPath;
    const parts = window.NamibiaV19?.partitionPath?.(path || [], d) || [];
    const DC = window.NamibiaDrivingCore;
    if (!path || path.length < 2 || !DC) return { yes: 0, maybe: 0, no: 0, total: 0 };
    let yesM = 0, maybeM = 0, noM = 0;
    for (const part of parts) {
      let segM = 0;
      const lo = Math.max(0, part.fromIdx);
      const hi = Math.min(path.length - 1, part.toIdx);
      for (let i = lo + 1; i <= hi; i++) {
        segM += DC.distMeters(path[i - 1], path[i]);
      }
      if (part.status === 'yes') yesM += segM;
      else if (part.status === 'maybe') maybeM += segM;
      else noM += segM;
    }
    return { yes: yesM, maybe: maybeM, no: noM, total: yesM + maybeM + noM };
  }

  // Dominant status using distance share. Threshold: 60% of distance for a
  // dominant rating. Falls back to legacy "any segment exists" logic when
  // no route is cached (so the dropdown still shows something useful before
  // the first render-all pass).
  function dominantStatus(d) {
    if (!d || d.selfDrive === false) return 'na';
    const dist = heatherDistribution(d);
    if (dist.total > 0) {
      const y = dist.yes / dist.total;
      const m = dist.maybe / dist.total;
      if (y >= 0.6) return 'yes';
      if (y + m >= 0.6 && y < 0.6) return 'maybe';
      return 'no';
    }
    // No cached route yet — fall back to segment presence.
    const segs = d.heatherDriveSegments || [];
    if (!segs.length) return 'no';
    if (segs.some(s => s.status === 'can_drive')) return 'yes';
    if (segs.some(s => s.status === 'partial')) return 'maybe';
    return 'no';
  }

  // Keep the legacy name as an alias so other patches that reference it
  // (e.g. v22's heatherWhy + chip lookups) keep working.
  function heatherStatusForDay(d) { return dominantStatus(d); }
  function metaFor(d) { return STATUS_META[dominantStatus(d)]; }

  // Gradient + percentage chip for the Overview tab. Renders a small inline
  // bar whose three coloured segments are sized by the day's distance share.
  function heatherChipHtmlWithGradient(d) {
    const dist = heatherDistribution(d);
    const status = dominantStatus(d);
    const meta = STATUS_META[status];
    if (dist.total === 0) return heatherChipHtml(d); // legacy fallback
    const yPct = Math.round((dist.yes / dist.total) * 100);
    const mPct = Math.round((dist.maybe / dist.total) * 100);
    const nPct = Math.max(0, 100 - yPct - mPct);
    return `<span class="heather-leg-chip heather-${status} heather-chip-gradient" title="Distance-weighted: ${yPct}% green, ${mPct}% amber, ${nPct}% red">
      <span class="heather-bar" aria-hidden="true">
        <span class="heather-bar-yes" style="width:${yPct}%"></span>
        <span class="heather-bar-maybe" style="width:${mPct}%"></span>
        <span class="heather-bar-no" style="width:${nPct}%"></span>
      </span>
      <span class="heather-bar-text">
        <strong>${meta.emoji}</strong>
        <span class="heather-bar-num heather-bar-num-yes">${yPct}% 🟢</span>
        <span class="heather-bar-num heather-bar-num-maybe">${mPct}% 🟡</span>
        <span class="heather-bar-num heather-bar-num-no">${nPct}% 🔴</span>
      </span>
    </span>`;
  }

  function heatherChipHtml(d) {
    const m = metaFor(d);
    return `<span class="heather-leg-chip heather-${dominantStatus(d)}">
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

  // ---- 2/3. Overview + Driving chips — SUPERSEDED by the v38 sequential time
  // bar (Overview) and the v13 Heather strip (driving). Kept as no-ops so the
  // render hooks below don't error. The day-select emoji + print banner stay. ----
  function injectOverviewChip() { /* superseded by v38 heatherBarHtml */ }
  function injectDriveDashboardChip() { /* superseded by v13 Heather strip */ }

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

  // render chain not yet migrated — keep the wrap so render-order stays exact.
  if (typeof render === 'function') {
    const baseRender = render;
    render = function patchedRenderV17() {
      const r = baseRender();
      applyAll();
      return r;
    };
  }
  window.NamibiaUI.afterRenderTab(applyAll);
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
