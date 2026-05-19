// Namibia PWA v30 — Swipe gestures for tab + day navigation.
//
//   * Horizontal swipe on the tab content (#tabContent) → next/prev tab in
//     the canonical order [overview, stops, directions, street, exports].
//   * Horizontal swipe on the top hero/status area → next/prev day in the
//     #daySelect dropdown.
//
// Gestures use touch events with these guards:
//   - ignore swipes starting within 20 px of either screen edge (so the iOS
//     back-swipe gesture isn't intercepted)
//   - require ≥60 px horizontal travel
//   - require horizontal-bias (|dx| > |dy| × 1/0.7) so vertical scrolls
//     don't accidentally fire a swipe
//   - require dt < 600 ms (a slow drag is a scroll, not a swipe)
(function () {
  const TAB_ORDER = ['overview', 'stops', 'directions', 'street', 'exports'];

  function changeTab(direction) {
    const cur = (typeof state !== 'undefined' && state.activeTab) || 'overview';
    const idx = TAB_ORDER.indexOf(cur);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
    const btn = document.querySelector(`.tab[data-tab="${TAB_ORDER[nextIdx]}"]`);
    if (btn) {
      btn.click();
      flashElement(btn);
    }
  }

  function changeDay(direction) {
    const sel = document.getElementById('daySelect');
    if (!sel) return;
    const nextIdx = sel.selectedIndex + direction;
    if (nextIdx < 0 || nextIdx >= sel.options.length) return;
    sel.selectedIndex = nextIdx;
    sel.dispatchEvent(new Event('change'));
    flashElement(sel);
  }

  // Tiny visual feedback so the user knows the gesture registered.
  function flashElement(el) {
    if (!el) return;
    el.classList.add('swipe-flash');
    setTimeout(() => el.classList.remove('swipe-flash'), 380);
  }

  function attachSwipe(el, onLeft, onRight) {
    if (!el) return;
    let startX = 0, startY = 0, t0 = 0, active = false;
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const w = window.innerWidth;
      if (t.clientX < 20 || t.clientX > w - 20) return; // leave edge for iOS back-swipe
      startX = t.clientX;
      startY = t.clientY;
      t0 = Date.now();
      active = true;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - t0;
      if (dt > 600) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.7) return;
      if (dx < 0) onLeft && onLeft();
      else onRight && onRight();
    }, { passive: true });
    // Also support a pointer-based drag for desktop (mouse) testing.
    let pStartX = 0, pStartY = 0, pT0 = 0, pActive = false;
    el.addEventListener('mousedown', e => {
      pStartX = e.clientX; pStartY = e.clientY; pT0 = Date.now(); pActive = true;
    });
    el.addEventListener('mouseup', e => {
      if (!pActive) return;
      pActive = false;
      const dx = e.clientX - pStartX;
      const dy = e.clientY - pStartY;
      const dt = Date.now() - pT0;
      if (dt > 600) return;
      if (Math.abs(dx) < 80) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.5) return;
      if (dx < 0) onLeft && onLeft();
      else onRight && onRight();
    });
  }

  function inject() {
    const tc = document.getElementById('tabContent');
    if (tc && !tc.dataset.v30Swipe) {
      tc.dataset.v30Swipe = '1';
      attachSwipe(tc, () => changeTab(1), () => changeTab(-1));
    }
    const hero = document.querySelector('.hero');
    if (hero && !hero.dataset.v30Swipe) {
      hero.dataset.v30Swipe = '1';
      attachSwipe(hero, () => changeDay(1), () => changeDay(-1));
    }
  }

  if (typeof render === 'function') {
    const base = render;
    render = function patchedRenderV30() {
      const r = base();
      try { inject(); } catch (_) {}
      return r;
    };
  }
  inject();
  setTimeout(inject, 500);
  setTimeout(inject, 2000);

  // First-launch hint: shown once, dismissed automatically after 5 s or on
  // the user's first tab-swipe / day-swipe / tap.
  function showHintOnce() {
    if (localStorage.getItem('namibia_v30_hint_shown')) return;
    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.textContent = '👆 Swipe ← → on the page to switch tabs · swipe on the top header to change day';
    document.body.appendChild(hint);
    requestAnimationFrame(() => hint.classList.add('visible'));
    const dismiss = () => {
      localStorage.setItem('namibia_v30_hint_shown', '1');
      hint.classList.remove('visible');
      setTimeout(() => hint.remove(), 300);
      document.removeEventListener('click', dismiss, true);
      document.removeEventListener('touchstart', dismiss, true);
    };
    setTimeout(dismiss, 5000);
    document.addEventListener('click', dismiss, true);
    document.addEventListener('touchstart', dismiss, true);
  }
  setTimeout(showHintOnce, 1500);

  window.NamibiaV30 = { changeTab, changeDay, TAB_ORDER, showHintOnce };
})();
