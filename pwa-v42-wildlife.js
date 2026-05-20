// pwa-v42-wildlife.js — "stay in your vehicle" big-game safety highlighting.
//
// Surfaces, throughout the UI, the days we're inside Etosha National Park
// (Days 9–12, entered via the King Nehale gate), where you must NOT get out of
// the vehicle — open lion/leopard/elephant/rhino country. The desert, coast and
// Spitzkoppe are safe to walk, so we deliberately only flag the Etosha leg.
// Mirrors the malaria module (pwa-v40): dismissible top banner, day-select mark,
// an Overview card, and an Itinerary strip.
(function () {
  const DATA = window.NAMIBIA_TRIP_DATA;
  const WL = DATA && DATA.meta && DATA.meta.wildlife;
  const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function inZone(iso) {
    if (!WL || !iso) return false;
    return (WL.zoneDates || []).indexOf(iso) >= 0 || (iso >= WL.entryDate && iso <= WL.exitDate);
  }

  function cardHtml(d) {
    if (!WL || !d || !inZone(d.date)) return '';
    const rules = (WL.rules || []).map(r => `<li>${E(r)}</li>`).join('');
    return `<div class="wildlife-card">`
      + `<h3>🦁 Big-game country — stay in your vehicle</h3>`
      + `<p class="wl-status"><strong>${E(WL.area)}.</strong> ${E(WL.note)}</p>`
      + (rules ? `<ul class="wl-rules">${rules}</ul>` : '')
      + (WL.riskTimes ? `<p class="wl-risk">⏰ ${E(WL.riskTimes)}</p>` : '')
      + `<p class="wl-safe">✅ Safe to get out only inside the fenced rest camps — ${E((WL.safeCamps || []).join(', '))} — and the fenced picnic stops.</p>`
      + `</div>`;
  }
  function stripHtml(d) {
    if (!WL || !d || !inZone(d.date)) return '';
    return `<div class="wildlife-day-strip">🦁 Big-game country — stay in your vehicle; exit only at fenced camps.</div>`;
  }

  // ---- dismissible top banner (today) ----
  function injectBanner() {
    if (!WL) return;
    const today = (typeof todayISO === 'function') ? todayISO() : '';
    const existing = document.getElementById('wildlifeBanner');
    if (!inZone(today) || localStorage.getItem('namibia_wildlife_dismissed:' + today) === '1') { if (existing) existing.remove(); return; }
    if (existing) return;
    const html = `<div id="wildlifeBanner" class="wildlife-banner">`
      + `<span class="wb-pill">🦁</span>`
      + `<span class="wb-text">Inside Etosha today — <strong>stay in your vehicle</strong>. Get out only inside the fenced rest camps.</span>`
      + `<button class="wb-close" id="wildlifeBannerClose" aria-label="Dismiss for today">✕</button></div>`;
    document.body.insertAdjacentHTML('afterbegin', html);
    const btn = document.getElementById('wildlifeBannerClose');
    if (btn) btn.onclick = () => { try { localStorage.setItem('namibia_wildlife_dismissed:' + today, '1'); } catch (_) {} const b = document.getElementById('wildlifeBanner'); if (b) b.remove(); };
  }

  // ---- day-select 🦁 mark (run after pwa-v17/v40 decorate) ----
  function decorateDaySelect() {
    const sel = document.getElementById('daySelect');
    if (!sel || !WL) return;
    Array.from(sel.options).forEach((opt, i) => {
      const d = (DATA.days || [])[i]; if (!d) return;
      if (inZone(d.date) && !opt.text.includes('🦁')) opt.text = opt.text + ' 🦁';
    });
  }

  // ---- per-selected-day indicators (Overview card + Itinerary strip) ----
  function injectDayIndicators() {
    const tc = document.getElementById('tabContent');
    if (!tc || !WL || typeof state === 'undefined' || !state) return;
    const d = (typeof day === 'function') ? day() : null;
    if (!d) return;
    if (state.activeTab === 'overview' && !tc.querySelector('.wildlife-card')) {
      const html = cardHtml(d);
      if (!html) return;
      const anchor = tc.querySelector('.malaria-card') || tc.querySelector('.now-card-inline');
      if (anchor) anchor.insertAdjacentHTML('afterend', html);
      else tc.insertAdjacentHTML('afterbegin', html);
    } else if (state.activeTab === 'stops' && !tc.querySelector('.wildlife-day-strip')) {
      const s = stripHtml(d);
      if (s) tc.insertAdjacentHTML('afterbegin', s);
    }
  }

  // ---- hooks (mirror v40) ----
  if (typeof renderTab === 'function') {
    const baseRT = renderTab;
    renderTab = function patchedRenderTabV42() {
      const r = baseRT.apply(this, arguments);
      try { decorateDaySelect(); injectDayIndicators(); } catch (_) {}
      return r;
    };
  }
  if (typeof render === 'function') {
    const baseR = render;
    render = function patchedRenderV42() {
      const r = baseR.apply(this, arguments);
      try { injectBanner(); decorateDaySelect(); } catch (_) {}
      return r;
    };
  }
  setTimeout(() => { try { injectBanner(); decorateDaySelect(); injectDayIndicators(); } catch (_) {} }, 400);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { try { injectBanner(); } catch (_) {} } });

  window.NamibiaV42 = { inZone, cardHtml, WL };
})();
