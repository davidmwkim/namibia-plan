// pwa-v45-drive-deck.js — turn the Driver (and later Passenger) card list into a
// horizontal SWIPE DECK and drive a position dot on the central map: as you swipe
// to a card, the map's dot jumps to that point on the route and pans there. The
// GPS-active card auto-advances the deck (v13 scrolls it horizontally), which
// fires the same scroll handler, so the dot tracks your live position too.
//
// Registers an afterRenderTab hook (runs after v13 has built the dashboard).
(function () {
  // Tabs that get the "live focus" treatment (hide aside mini-map, etc.).
  const FOCUS_TABS = { street: true, directions: true };
  const CARD_SEL = '.drive-card, .pass-card';

  function routeCards() {
    const d = (typeof day === 'function') ? day() : null;
    return (d && state.renderedRoutes && state.renderedRoutes[d.date] && state.renderedRoutes[d.date].cards) || [];
  }

  // Which card is centered in the deck's viewport right now.
  function centeredIndex(deck) {
    const cards = deck.querySelectorAll(CARD_SEL);
    if (!cards.length) return -1;
    const mid = deck.scrollLeft + deck.clientWidth / 2;
    let best = -1, bestD = Infinity;
    cards.forEach(c => {
      const center = c.offsetLeft + c.offsetWidth / 2;
      const dd = Math.abs(center - mid);
      if (dd < bestD) { bestD = dd; best = Number(c.dataset.cardIndex); }
    });
    return best;
  }

  function moveDot(idx) {
    const cards = routeCards();
    const c = cards[idx];
    if (!c) return;
    if (typeof c.lat === 'number' && typeof c.lng === 'number'
        && window.NamibiaOsmMap && window.NamibiaOsmMap.setRouteDot) {
      window.NamibiaOsmMap.setRouteDot(c.lat, c.lng, true);
    }
  }

  function updateNav(deck, idx) {
    const total = deck.querySelectorAll('.drive-card').length;
    if (!total) return;
    const wrap = deck.parentElement;
    const counter = wrap.querySelector('.deck-counter');
    if (counter) counter.textContent = `${idx + 1} / ${total}`;
    const fill = wrap.querySelector('.deck-progress > i');
    if (fill) fill.style.width = `${((idx + 1) / total) * 100}%`;
  }

  function scrollToCard(deck, idx, smooth) {
    const el = deck.querySelector(`[data-card-index="${idx}"]`);
    if (!el || typeof deck.scrollTo !== 'function') return;
    const left = el.offsetLeft - (deck.clientWidth - el.clientWidth) / 2;
    deck.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }

  function ensureNav(deck) {
    const wrap = deck.parentElement;
    if (wrap.querySelector('.deck-nav')) return;
    const prog = document.createElement('div');
    prog.className = 'deck-progress';
    prog.innerHTML = '<i></i>';
    const nav = document.createElement('div');
    nav.className = 'deck-nav';
    nav.innerHTML = '<button type="button" class="ghost deck-prev" aria-label="Previous card">‹</button>'
      + '<span class="deck-counter"></span>'
      + '<button type="button" class="ghost deck-next" aria-label="Next card">›</button>';
    deck.insertAdjacentElement('afterend', prog);
    prog.insertAdjacentElement('afterend', nav);
    nav.querySelector('.deck-prev').onclick = () => step(deck, -1);
    nav.querySelector('.deck-next').onclick = () => step(deck, 1);
  }

  function step(deck, dir) {
    const idx = centeredIndex(deck);
    if (idx < 0) return;
    const total = deck.querySelectorAll(CARD_SEL).length;
    const next = Math.max(0, Math.min(total - 1, idx + dir));
    scrollToCard(deck, next, true);
  }

  // ---- Gesture discretizer ----------------------------------------------------
  // Native scroll-snap snaps to the NEAREST card, so a fast flick can skip 2-3
  // cards under momentum. We want one swipe = exactly one card. On pointerdown
  // remember the starting card + position; on pointerup decide ±1 (or 0) from
  // there and commit via scrollToCard, overriding any momentum the browser
  // would otherwise apply. Threshold: >25% of deck width OR flick > 0.3 px/ms.
  function wireGesture(deck) {
    if (deck.dataset.deckGesture) return;
    deck.dataset.deckGesture = '1';
    let startX = 0, startT = 0, startIdx = -1, tracking = false, pid = null;
    deck.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      tracking = true; pid = e.pointerId;
      startX = e.clientX; startT = e.timeStamp || Date.now();
      startIdx = centeredIndex(deck);
    }, { passive: true });
    function commit(e) {
      if (!tracking || (pid !== null && e.pointerId !== pid)) return;
      tracking = false;
      if (startIdx < 0) return;
      const dx = e.clientX - startX;
      const dt = Math.max(1, (e.timeStamp || Date.now()) - startT);
      const v = dx / dt; // px/ms; positive = swiped right (→ previous card)
      const total = deck.querySelectorAll(CARD_SEL).length;
      const w = deck.clientWidth || 1;
      let target = startIdx;
      if (Math.abs(dx) > w * 0.25 || Math.abs(v) > 0.3) {
        target = startIdx + (dx < 0 ? 1 : -1);
      }
      target = Math.max(0, Math.min(total - 1, target));
      // Always re-commit — kills inertia that would land on the wrong card.
      scrollToCard(deck, target, true);
    }
    function cancel(e) {
      // pointercancel fires when the browser claims the gesture for vertical
      // panning (touch-action: pan-y allows that). Treating it as a completed
      // horizontal swipe — especially via the velocity fallback — would jump
      // the deck to another card mid-scroll. Just drop the tracking state.
      if (!tracking || (pid !== null && e.pointerId !== pid)) return;
      tracking = false;
      startIdx = -1;
      pid = null;
    }
    deck.addEventListener('pointerup', commit, { passive: true });
    deck.addEventListener('pointercancel', cancel, { passive: true });
  }

  // Keyboard support: ← / → advance one card when the deck has focus.
  function wireKeys(deck) {
    if (deck.dataset.deckKeys) return;
    deck.dataset.deckKeys = '1';
    if (!deck.hasAttribute('tabindex')) deck.tabIndex = 0;
    deck.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(deck, 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(deck, -1); }
    });
  }

  // Throttle by wall-clock (not rAF — rAF is starved in background/automation
  // tabs) with a trailing call so we always settle on the final centered card.
  let lastRun = 0, trailingTimer = null;
  function applyCentered(deck) {
    const idx = centeredIndex(deck);
    if (idx < 0) return;
    updateNav(deck, idx);
    moveDot(idx);
  }
  function onScroll(deck) {
    const now = Date.now();
    if (now - lastRun > 90) { lastRun = now; applyCentered(deck); }
    clearTimeout(trailingTimer);
    trailingTimer = setTimeout(() => { lastRun = Date.now(); applyCentered(deck); }, 130);
  }

  function setupDriver() {
    const deck = document.querySelector('.drive-cards');
    if (!deck) return;
    ensureNav(deck);
    if (!deck.dataset.deckWired) {
      deck.dataset.deckWired = '1';
      deck.addEventListener('scroll', () => onScroll(deck), { passive: true });
    }
    wireGesture(deck);
    wireKeys(deck);
    // Seed the dot + counter on the GPS-active card (or the first card).
    const active = (state.driving && state.driving.activeCardIndex >= 0) ? state.driving.activeCardIndex : 0;
    updateNav(deck, active);
    moveDot(active);
  }

  // ---------------------------------------------------------------------------
  // Passenger (directions) tab: same map-on-top + swipe-deck + position dot, but
  // built from the turn-by-turn steps. The directions content is rebuilt every
  // renderTab (base + v12), so we re-transform it each time; the Leaflet map is
  // recreated on the fresh host (mirrors how v32 handles the driver map).
  // ---------------------------------------------------------------------------
  let passMap = null, passDot = null, passLayers = [];
  // The built shell is cached + re-attached on same-day re-renders so a
  // GPS-driven render reuses the live map AND keeps the swipe position instead
  // of recreating everything every second. (Detach resets scrollLeft, so we
  // track + restore it.)
  let passShellEl = null, passDayKey = null, passScrollLeft = 0;

  function passStepCoord(card) {
    const leg = Number(card.dataset.leg), step = Number(card.dataset.step);
    const d = (typeof day === 'function') ? day() : null;
    const r = d && state.renderedRoutes && state.renderedRoutes[d.date];
    const s = r && r.legs && r.legs[leg] && r.legs[leg].steps && r.legs[leg].steps[step];
    return (s && typeof s.lat === 'number') ? { lat: s.lat, lng: s.lng } : null;
  }

  function passSetDot(card, pan) {
    const c = passStepCoord(card);
    if (!c || !passMap || !window.L) return;
    const ll = [c.lat, c.lng];
    if (!passDot || !passMap.hasLayer(passDot)) {
      try {
        passDot = window.L.circleMarker(ll, {
          radius: 9, color: '#fff', weight: 3, fillColor: '#5a1738',
          fillOpacity: 1, className: 'route-dot-pin', pane: 'markerPane'
        }).addTo(passMap);
      } catch (_) { return; }
    } else { try { passDot.setLatLng(ll); } catch (_) {} }
    try { passDot.bringToFront(); } catch (_) {}
    if (pan) { try { passMap.panTo(ll, { animate: true }); } catch (_) {} }
  }

  function ensurePassMap(host, d, route) {
    const OSM = window.NamibiaOSM;
    if (!OSM || !OSM.hasLeaflet || !OSM.hasLeaflet()) return;
    // Host is freshly minted each renderTab — rebuild the map on it.
    if (passMap) { try { OSM.unregisterMap && OSM.unregisterMap(passMap); passMap.remove(); } catch (_) {} passMap = null; passDot = null; passLayers = []; }
    try {
      passMap = OSM.createMap(host, { center: [-22.5, 17.0], zoom: 6 });
      if (OSM.registerMap) OSM.registerMap(passMap);
      let b = null;
      if (OSM.drawColoredRoute && route.overviewPath) {
        b = OSM.drawColoredRoute(passMap, route.overviewPath, d, passLayers);
      }
      if (b && b.isValid()) { try { passMap.fitBounds(b, { padding: [25, 25] }); } catch (_) {} }
    } catch (_) { passMap = null; }
  }

  function setupPassenger() {
    const tc = document.getElementById('tabContent');
    const dir = tc && tc.querySelector('.directions');
    if (!tc || !dir) return;
    const d = (typeof day === 'function') ? day() : null;
    const route = d && state.renderedRoutes && state.renderedRoutes[d.date];
    if (!route || !route.legs) return;
    const dayKey = d.date + ':' + ((route.overviewPath && route.overviewPath.length) || 0);

    // Base renderTab rebuilds the directions list on EVERY render (incl. every
    // GPS tick). To avoid recreating the Leaflet map + losing the swipe position
    // each second, cache the built shell and just RE-ATTACH it when the day is
    // unchanged — discarding the freshly-rebuilt (but identical) directions list.
    if (passShellEl && passDayKey === dayKey) {
      dir.replaceWith(passShellEl);
      try { if (passMap) passMap.invalidateSize(false); } catch (_) {}
      // Detaching reset the deck's scrollLeft — restore the user's swipe spot.
      const rdeck = passShellEl.querySelector('.pass-deck');
      if (rdeck) rdeck.scrollLeft = passScrollLeft;
      return;
    }

    // Fresh build (first visit or the day changed).
    const steps = [...dir.querySelectorAll('li.step')];
    if (!steps.length) return;

    const shell = document.createElement('div');
    shell.className = 'pass-shell';
    const mapHost = document.createElement('div');
    mapHost.className = 'pass-map';
    mapHost.id = 'passMapHost';
    const deck = document.createElement('div');
    deck.className = 'pass-deck';

    steps.forEach((li, i) => {
      const btn = li.querySelector('.step-expand');
      const leg = btn ? btn.dataset.leg : '0';
      const step = btn ? btn.dataset.step : String(i);
      const card = document.createElement('article');
      card.className = 'pass-card';
      card.dataset.cardIndex = String(i);
      card.dataset.leg = leg;
      card.dataset.step = step;
      // Move the existing (already v12-enriched) step content into the card.
      while (li.firstChild) card.appendChild(li.firstChild);
      deck.appendChild(card);
    });

    shell.appendChild(mapHost);
    shell.appendChild(deck);
    // Replace the directions list with the deck shell; keep the route alert +
    // heather summary above (they're siblings of .directions).
    dir.replaceWith(shell);

    ensurePassMap(mapHost, d, route);

    // Deck nav (counter + arrows + progress) — reuse the driver deck nav markup.
    ensureNav(deck);
    deck.addEventListener('scroll', () => onPassScroll(deck), { passive: true });
    wireGesture(deck);
    wireKeys(deck);

    passShellEl = shell; passDayKey = dayKey;
    passUpdate(deck, 0);
  }

  let passLastRun = 0, passTrailing = null;
  function passApply(deck) {
    const idx = centeredIndex(deck);
    if (idx < 0) return;
    passUpdate(deck, idx);
  }
  function onPassScroll(deck) {
    passScrollLeft = deck.scrollLeft;
    const now = Date.now();
    if (now - passLastRun > 90) { passLastRun = now; passApply(deck); }
    clearTimeout(passTrailing);
    passTrailing = setTimeout(() => { passLastRun = Date.now(); passApply(deck); }, 130);
  }
  function passUpdate(deck, idx) {
    const cards = deck.querySelectorAll('.pass-card');
    const total = cards.length;
    if (!total) return;
    const wrap = deck.parentElement;
    const counter = wrap.querySelector('.deck-counter');
    if (counter) counter.textContent = `${idx + 1} / ${total}`;
    const fill = wrap.querySelector('.deck-progress > i');
    if (fill) fill.style.width = `${((idx + 1) / total) * 100}%`;
    const card = deck.querySelector(`.pass-card[data-card-index="${idx}"]`);
    if (card) passSetDot(card, true);
  }

  window.NamibiaUI.afterRenderTab(function () {
    const focus = !!FOCUS_TABS[state.activeTab];
    document.body.classList.toggle('drive-focus', focus);
    if (!focus) return;
    if (state.activeTab === 'street') setupDriver();
    else if (state.activeTab === 'directions') { try { setupPassenger(); } catch (e) { if (typeof console !== 'undefined') console.warn('passenger deck', e); } }
  });

  window.NamibiaDriveDeck = { centeredIndex, scrollToCard };
})();
