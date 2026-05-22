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
  const TAB_ORDER = ['overview', 'stops', 'directions', 'street', 'settings'];

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

  // ---- Simultaneous carousel slide: the OUTGOING content (a frozen clone) and
  // the INCOMING content move together, so the view is never blank mid-swipe.
  // dir>0 = next (incoming from the right), dir<0 = prev. Works for both tab and
  // day changes — `applyChange` mutates the page, then both panels animate.
  let sliding = false;
  function slideTransition(node, dir, applyChange) {
    if (!node) { applyChange(); return; }
    const parent = node.parentElement;
    if (sliding || !parent || typeof node.cloneNode !== 'function') {
      applyChange();
      node.style.transition = ''; node.style.transform = ''; node.style.opacity = '';
      return;
    }
    sliding = true;
    let clone;
    try {
      clone = node.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    } catch (_) { clone = null; }
    if (!clone) { applyChange(); node.style.transition=''; node.style.transform=''; node.style.opacity=''; sliding = false; return; }
    try { if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (_) {}
    Object.assign(clone.style, {
      position: 'absolute', top: node.offsetTop + 'px', left: node.offsetLeft + 'px',
      width: node.offsetWidth + 'px', height: node.offsetHeight + 'px',
      margin: '0', pointerEvents: 'none', transition: 'none', zIndex: '4',
      transform: node.style.transform || 'translateX(0)', opacity: '1'
    });
    clone.dataset.v30Clone = '1';
    parent.appendChild(clone);

    applyChange();                              // node now holds the NEW content

    node.style.transition = 'none';
    node.style.transform = `translateX(${dir > 0 ? 100 : -100}%)`;
    node.style.opacity = '1';
    void node.offsetWidth;                      // reflow

    const dur = 240;
    requestAnimationFrame(() => {
      clone.style.transition = `transform ${dur}ms ease`;
      node.style.transition = `transform ${dur}ms ease`;
      clone.style.transform = `translateX(${dir > 0 ? -100 : 100}%)`;
      node.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      try { clone.remove(); } catch (_) {}
      node.style.transition = ''; node.style.transform = ''; node.style.opacity = '';
      sliding = false;
      try { ensureTabIndicator(); updateTabIndicator(); } catch (_) {}
    }, dur + 60);
  }

  // The tab content follows the finger during a drag, then commits to a
  // simultaneous slide on release (or springs back under threshold).
  // Don't hijack a horizontal drag that belongs to an inner control: the
  // Heather summary bar + its scrubber slider, range inputs, and Leaflet maps
  // all use horizontal drags of their own. Starting a tab-swipe on them dragged
  // the whole page sideways.
  function isNoSwipeTarget(target) {
    return !!(target && target.closest && target.closest(
      'input[type="range"], .drive-scrub-row, .hbar, .drive-heather, .leaflet-container, .drive-cards'));
  }

  function attachAnimatedSwipe(el) {
    let startX = 0, startY = 0, t0 = 0, active = false, dragging = false;
    const reset = () => { el.style.transition = 'transform .18s ease, opacity .18s ease'; el.style.transform = ''; el.style.opacity = ''; };
    const onStart = (x, y) => { if (sliding) return; startX = x; startY = y; t0 = Date.now(); active = true; dragging = false; el.style.transition = 'none'; };
    const onMove = (x, y) => {
      if (!active) return;
      const dx = x - startX, dy = y - startY;
      if (!dragging) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { active = false; reset(); return; }
        dragging = true;
      }
      el.style.transform = `translateX(${(dx * 0.7).toFixed(1)}px)`;
    };
    const onEnd = (x, y) => {
      if (!active) return;
      active = false;
      const dx = x - startX, dy = y - startY, dt = Date.now() - t0;
      if (!dragging) { reset(); return; }
      const horiz = Math.abs(dx) > Math.abs(dy) * 0.7;
      if (dt < 800 && horiz && Math.abs(dx) >= 60) commitTab(el, dx < 0 ? 1 : -1);
      else reset();
    };
    const commitTab = (node, dir) => {
      const cur = (typeof state !== 'undefined' && state.activeTab) || 'overview';
      const idx = TAB_ORDER.indexOf(cur);
      const nextIdx = idx + dir;
      if (idx < 0 || nextIdx < 0 || nextIdx >= TAB_ORDER.length) { reset(); return; }
      slideTransition(node, dir, () => changeTab(dir));
    };
    el.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; if (isNoSwipeTarget(e.target)) return; const t = e.touches[0]; const w = window.innerWidth; if (t.clientX < 20 || t.clientX > w - 20) return; onStart(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchend', e => { const t = e.changedTouches[0]; if (t) onEnd(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('mousedown', e => { if (isNoSwipeTarget(e.target)) return; onStart(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => { if (active) onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', e => { if (active) onEnd(e.clientX, e.clientY); });
  }

  // Animated day change (used by the header swipe + the ‹ Day › buttons).
  function daySwipe(dir) {
    const sel = document.getElementById('daySelect');
    if (!sel) return;
    const n = sel.selectedIndex + dir;
    if (n < 0 || n >= sel.options.length) return;
    const tc = document.getElementById('tabContent');
    if (tc) slideTransition(tc, dir, () => changeDay(dir));
    else changeDay(dir);
  }

  // ---- Sliding indicator under the tab bar ----
  function ensureTabIndicator() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;
    try { if (getComputedStyle(tabs).position === 'static') tabs.style.position = 'relative'; } catch (_) {}
    if (!tabs.querySelector('.tab-underline')) {
      const u = document.createElement('div');
      u.className = 'tab-underline';
      tabs.appendChild(u);
    }
  }
  function updateTabIndicator() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;
    const u = tabs.querySelector('.tab-underline');
    if (!u) return;
    const active = tabs.querySelector('.tab.active');
    if (!active) { u.style.opacity = '0'; return; }
    const tr = tabs.getBoundingClientRect(), ar = active.getBoundingClientRect();
    if (!ar.width) { u.style.opacity = '0'; return; }
    u.style.opacity = '1';
    u.style.left = (ar.left - tr.left + (tabs.scrollLeft || 0)) + 'px';
    u.style.width = ar.width + 'px';
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
      attachAnimatedSwipe(tc);
    }
    const hero = document.querySelector('.hero');
    if (hero && !hero.dataset.v30Swipe) {
      hero.dataset.v30Swipe = '1';
      attachSwipe(hero, () => daySwipe(1), () => daySwipe(-1));
    }
    // Explicit, discoverable day navigation: ‹ Day / Day › chevrons in the toolbar.
    const tl = document.querySelector('.toolbar .toolbar-left');
    if (tl && !tl.dataset.v30Days) {
      tl.dataset.v30Days = '1';
      const prev = document.createElement('button');
      prev.id = 'dayPrev'; prev.className = 'day-nav'; prev.textContent = '‹ Day'; prev.title = 'Previous day';
      prev.onclick = () => daySwipe(-1);
      const next = document.createElement('button');
      next.id = 'dayNext'; next.className = 'day-nav'; next.textContent = 'Day ›'; next.title = 'Next day';
      next.onclick = () => daySwipe(1);
      tl.insertBefore(prev, tl.firstChild);
      tl.appendChild(next);
    }
    ensureTabIndicator();
    updateTabIndicator();
  }

  // Keep the sliding indicator in sync on every tab change (tab clicks call
  // renderTab directly, not render, so wrap renderTab too).
  window.NamibiaUI.afterRenderTab(function () {
    try { ensureTabIndicator(); updateTabIndicator(); } catch (_) {}
  });
  window.addEventListener('resize', () => { try { updateTabIndicator(); } catch (_) {} });

  window.NamibiaUI.afterRender(function () { try { inject(); } catch (_) {} });
  inject();
  setTimeout(inject, 500);
  setTimeout(inject, 2000);

  // First-launch hint: shown once, dismissed automatically after 5 s or on
  // the user's first tab-swipe / day-swipe / tap.
  function showHintOnce() {
    if (localStorage.getItem('namibia_v30_hint_shown')) return;
    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.textContent = '👆 Swipe ← → to switch tabs · use ‹ Day › or swipe the header to change day';
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
