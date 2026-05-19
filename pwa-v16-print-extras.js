// Namibia PWA v16 — Print extras.
//
// Extends the print/PDF page so it mirrors the on-screen state:
//   - Sun-line (sunrise / sunset / drive-ETA / daylight margin) at the top of
//     each day so the user has the sunset-budget at a glance on paper
//   - Per-step Street View thumbnail + per-step Static Map thumbnail under each
//     turn in the print directions list
//
// Wraps renderPrintPages (defined by app.js and rewritten by v11) — does NOT
// replace it; appends to existing print-day articles after they're built.
(function () {
  const ST = window.NamibiaSunTimes;

  function sunLineHtml(d, route) {
    if (!ST || !route?.sunTimes) return '';
    const sunrise = ST.formatTimeOfDay(route.sunTimes.sunriseMs);
    const sunset = ST.formatTimeOfDay(route.sunTimes.sunsetMs);
    const startMs = Date.parse(d.date + 'T08:00:00+02:00');
    const eta = ST.etaFromCurrentStep(route, { legIdx: 0, stepIdx: 0, distToStepM: 0 }, startMs);
    const margin = ST.sunsetMargin(eta, route.sunTimes.sunsetMs);
    const driveMin = Math.max(0, Math.round((eta - startMs) / 60000));
    const icon = margin.severity === 'safe' ? 'OK' : (margin.severity === 'tight' ? 'TIGHT' : 'AT RISK');
    return `
      <div class="print-sun-line sun-${margin.severity}">
        <strong>Sunrise</strong> ${sunrise} ·
        <strong>Sunset</strong> ${sunset} ·
        <strong>Drive ETA (08:00 start)</strong> ${ST.formatRelative(driveMin)} ·
        <strong>Daylight margin</strong> ${margin.marginMin >= 0 ? '+' : ''}${margin.marginMin} min · ${icon}
      </div>`;
  }

  function safeEsc(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function injectStepThumbs(article, route) {
    if (!route?.legs) return;
    const legBlocks = article.querySelectorAll('.print-directions-leg');
    route.legs.forEach((leg, li) => {
      const legBlock = legBlocks[li];
      if (!legBlock) return;
      const lis = legBlock.querySelectorAll('ol li');
      leg.steps.forEach((step, si) => {
        const liEl = lis[si];
        if (!liEl || liEl.querySelector('.print-step-thumbs')) return;
        const map = step.stepMapUrl ? `<img class="print-step-map" src="${safeEsc(step.stepMapUrl)}" alt="Step ${si+1} map">` : '';
        const sv = step.streetViewUrl ? `<img class="print-step-sv" src="${safeEsc(step.streetViewUrl)}" alt="Step ${si+1} street view">` : '';
        if (!map && !sv) return;
        const wrap = document.createElement('div');
        wrap.className = 'print-step-thumbs';
        wrap.innerHTML = map + sv;
        liEl.appendChild(wrap);
      });
    });
  }

  function injectExtrasForArticle(article, d) {
    if (article.dataset.v16Done === '1') return;
    const route = state.renderedRoutes?.[d.date];
    // Sun line right after the <h2> (date / day-type).
    if (route?.sunTimes && !article.querySelector('.print-sun-line')) {
      const h2 = article.querySelector('h2');
      if (h2) h2.insertAdjacentHTML('afterend', sunLineHtml(d, route));
    }
    // Per-step thumbnails inside the directions section.
    injectStepThumbs(article, route);
    article.dataset.v16Done = '1';
  }

  function injectAll() {
    const articles = document.querySelectorAll('#printPages .print-day');
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    articles.forEach((a, i) => {
      const d = days[i];
      if (d) injectExtrasForArticle(a, d);
    });
  }

  // Wrap renderPrintPages so every time it rebuilds the print tree, we add the
  // extras. v11's renderPrintPages is a global assignment; capture and wrap.
  if (typeof renderPrintPages === 'function') {
    const base = renderPrintPages;
    renderPrintPages = function patchedRenderPrintPagesV16() {
      const r = base();
      injectAll();
      return r;
    };
  }

  // Also wrap printMode so the user clicking "PDF / print" gets the extras.
  if (typeof printMode === 'function') {
    const baseMode = printMode;
    printMode = function patchedPrintModeV16() {
      if (typeof renderPrintPages === 'function') renderPrintPages();
      injectAll();
      return baseMode();
    };
    // The toolbar button was bound by app.js to the original printMode reference;
    // rebind so the click uses the patched version.
    const btn = document.getElementById('printPdf');
    if (btn) btn.onclick = printMode;
  }

  // Re-inject on initial load too — in case renderPrintPages already ran.
  injectAll();

  window.NamibiaV16 = { injectAll, sunLineHtml };
})();
