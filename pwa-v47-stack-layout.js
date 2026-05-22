// pwa-v47-stack-layout.js — Driver/Passenger refit: 50/50 split (map on top,
// SINGLE turn card on bottom with the next one peeking from behind) and
// pointer-driven swipe-to-advance. Replaces v45's horizontal-scroller gesture
// model on the live tabs. v45 detects v47's `data-stack="1"` flag on the deck
// and bails out, so this file is the sole gesture authority while focused.
//
// Map pins: for each active "turn" card, drops a green dot at the step's
// start_location and a red dot at the step's end_location (cached at
// app.js:321-324) so the live map answers "where on the road is THIS card?".
// Non-turn cards (pressure / fuel / scenery / arrival / sunset_risk) fall
// back to a single pin at the card's lat/lng via setRouteDot.
(function () {
  const FOCUS_TABS = { street: true, directions: true };

  // Per-tab active card index. Driver mirrors state.driving.activeCardIndex
  // (GPS-driven); Passenger has no GPS-active card so we manage our own.
  const idx = { drive: 0, pass: 0 };

  function inFocus() { return !!FOCUS_TABS[state.activeTab]; }
  function curDay() { return (typeof day === 'function') ? day() : null; }
  function curRoute() {
    const d = curDay();
    return d && state.renderedRoutes && state.renderedRoutes[d.date] || null;
  }

  // ---- Route-summary strip (replaces the hero on focus tabs) ----------------
  function summaryFor(d) {
    if (!d) return { title: '', note: '' };
    // Day title + the per-day routeNotes line authored in data.js. v8 also
    // stashes a per-day DRIVE.summary inside its IIFE that we can't reach
    // directly, but routeNotes covers the same intent and is always present.
    return {
      title: `Day ${d.day} · ${d.title || ''}`,
      note: d.routeNotes || ''
    };
  }
  function ensureSummaryStrip() {
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    if (!inFocus()) {
      const old = tc.querySelector('.route-summary-strip');
      if (old) old.remove();
      return;
    }
    const d = curDay();
    if (!d) return;
    const { title, note } = summaryFor(d);
    let strip = tc.querySelector('.route-summary-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'route-summary-strip';
      tc.insertBefore(strip, tc.firstChild);
    } else if (strip !== tc.firstChild) {
      tc.insertBefore(strip, tc.firstChild);
    }
    strip.innerHTML = `<span class="rss-title">${esc(title)}</span>`
      + (note ? `<span class="rss-note">${esc(note)}</span>` : '');
  }

  // Route-conditions preview strip: a thin colored bar (re-uses v38's
  // heatherBarHtml output) sitting flush above the live map on Driver and
  // Passenger. Two absolute markers indicate where on the route the active
  // turn-leg starts (green) and ends (red), so the user can glance at the
  // strip and see "this leg covers THIS portion of the day".
  function ensureCondStrip(host) {
    if (!host) return null;
    let strip = host.querySelector(':scope > .route-cond-strip');
    if (strip) return strip;
    strip = document.createElement('div');
    strip.className = 'route-cond-strip';
    // hbar HTML from v38; if missing, just render an empty track.
    const route = curRoute();
    const V38 = window.NamibiaV38;
    let bar = '';
    try {
      bar = (V38 && V38.heatherBarHtml) ? V38.heatherBarHtml(route, { compact: true, showHere: false }) : '';
    } catch (_) { bar = ''; }
    if (!bar) bar = '<div class="hbar hbar-compact"><div class="hbar-row"><div class="hbar-track"></div></div></div>';
    strip.innerHTML = bar
      + '<span class="rcs-marker rcs-start" style="left:0%"></span>'
      + '<span class="rcs-marker rcs-end" style="left:0%"></span>';
    // Insert before the map host inside the dashboard/shell.
    const map = host.querySelector(':scope > .drive-map, :scope > .pass-map');
    if (map) host.insertBefore(strip, map);
    else host.appendChild(strip);
    return strip;
  }
  function updateCondStripMarkers(host, startLL, endLL) {
    const strip = host && host.querySelector(':scope > .route-cond-strip');
    if (!strip) return;
    const route = curRoute();
    const path = route && route.overviewPath;
    if (!path || path.length < 2) return;
    const DC = window.NamibiaDrivingCore;
    if (!DC || !DC.routeProgressM) return;
    let total = 0;
    try { total = DC.routeProgressM(path, path[path.length - 1]) || 0; } catch (_) {}
    if (total <= 0) return;
    function frac(ll) {
      if (!ll || typeof ll.lat !== 'number') return null;
      try {
        const m = DC.routeProgressM(path, ll);
        if (!isFinite(m)) return null;
        return Math.max(0, Math.min(1, m / total));
      } catch (_) { return null; }
    }
    const fs = frac(startLL);
    const fe = frac(endLL);
    const s = strip.querySelector('.rcs-start');
    const e = strip.querySelector('.rcs-end');
    if (s) {
      if (fs === null) s.style.display = 'none';
      else { s.style.display = ''; s.style.left = (fs * 100).toFixed(2) + '%'; }
    }
    if (e) {
      if (fe === null) e.style.display = 'none';
      else { e.style.display = ''; e.style.left = (fe * 100).toFixed(2) + '%'; }
    }
  }

  // ---- Card → step lookup ----------------------------------------------------
  function stepFromCard(card, isPass) {
    const r = curRoute();
    if (!r || !r.legs) return null;
    let legI, stepI;
    if (isPass) {
      legI = Number(card.dataset.leg);
      stepI = Number(card.dataset.step);
    } else {
      // Driver cards: v13's cardsHtml carries legIdx/stepIdx as data attrs on
      // the inner .card-map-osm div, not the article itself. Walk in for it.
      const inner = card.querySelector('.card-map-osm');
      legI = Number((inner && inner.dataset.leg) || '');
      stepI = Number((inner && inner.dataset.step) || '');
    }
    if (!isFinite(legI) || !isFinite(stepI)) return null;
    const leg = r.legs[legI];
    return leg && leg.steps && leg.steps[stepI] || null;
  }
  function cardLatLng(card) {
    // Driver card uses the inner .card-map-osm data-lat/data-lng. Passenger
    // step has the lat/lng on the underlying step (stepFromCard handles it).
    const inner = card.querySelector('.card-map-osm');
    if (inner && inner.dataset.lat) {
      const la = Number(inner.dataset.lat), ln = Number(inner.dataset.lng);
      if (isFinite(la) && isFinite(ln)) return { lat: la, lng: ln };
    }
    return null;
  }
  function isTurnCard(card) {
    // Drivers tag the kind in data-kind; Passenger cards are all turn-by-turn.
    if (card.classList.contains('pass-card')) return true;
    const k = card.dataset.kind || '';
    return k === 'turn';
  }

  // ---- Map pin drivers -------------------------------------------------------
  function passPin(map, key, latlng, color) {
    if (!map || !window.L) return null;
    if (!latlng) return null;
    try {
      return window.L.circleMarker(latlng, {
        radius: 8, color: '#ffffff', weight: 2,
        fillColor: color, fillOpacity: 1,
        className: 'leg-pin', pane: 'markerPane'
      }).addTo(map);
    } catch (_) { return null; }
  }
  const passPins = { layers: [] };
  function passClearPins(map) {
    passPins.layers.forEach(l => { try { map && map.removeLayer(l); } catch (_) {} });
    passPins.layers = [];
  }
  function setPassengerPins(start, end) {
    const map = window.NamibiaDriveDeck && window.NamibiaDriveDeck.getPassMap && window.NamibiaDriveDeck.getPassMap();
    if (!map) return;
    passClearPins(map);
    if (start) {
      const m = passPin(map, 's', [start.lat, start.lng], '#178a3a');
      if (m) passPins.layers.push(m);
    }
    if (end) {
      const m = passPin(map, 'e', [end.lat, end.lng], '#b3261e');
      if (m) passPins.layers.push(m);
    }
    if (start && end) {
      try {
        const b = window.L.latLngBounds([[start.lat, start.lng], [end.lat, end.lng]]).pad(0.4);
        map.fitBounds(b, { animate: true, maxZoom: 15 });
      } catch (_) {}
    } else if (start) {
      try { map.panTo([start.lat, start.lng], { animate: true }); } catch (_) {}
    }
  }
  function updateMapForActive(deck, isPass) {
    const i = idx[isPass ? 'pass' : 'drive'];
    const cards = deck.querySelectorAll(isPass ? '.pass-card' : '.drive-card');
    const card = cards[i];
    if (!card) return;
    const step = stepFromCard(card, isPass);
    const ll = cardLatLng(card);
    const turn = isTurnCard(card);
    let startLL = null, endLL = null;
    if (turn && step && typeof step.endLat === 'number' && typeof step.endLng === 'number') {
      startLL = { lat: Number(step.lat), lng: Number(step.lng) };
      endLL = { lat: Number(step.endLat), lng: Number(step.endLng) };
      if (isPass) setPassengerPins(startLL, endLL);
      else if (window.NamibiaOsmMap && window.NamibiaOsmMap.setLegPins) window.NamibiaOsmMap.setLegPins(startLL, endLL);
    } else {
      if (isPass) setPassengerPins(null, null);
      else if (window.NamibiaOsmMap && window.NamibiaOsmMap.clearLegPins) window.NamibiaOsmMap.clearLegPins();
      if (ll && window.NamibiaOsmMap && window.NamibiaOsmMap.setRouteDot && !isPass) {
        window.NamibiaOsmMap.setRouteDot(ll.lat, ll.lng, true);
      }
      startLL = ll;
    }
    // Mirror those positions on the route-conditions strip above the map.
    const host = isPass ? document.querySelector('.pass-shell') : document.querySelector('.drive-dashboard');
    updateCondStripMarkers(host, startLL, endLL);
  }

  // ---- Stack tagging ---------------------------------------------------------
  function applyStack(deck, isPass) {
    const cards = deck.querySelectorAll(isPass ? '.pass-card' : '.drive-card');
    const total = cards.length;
    if (!total) return;
    let i = Math.max(0, Math.min(total - 1, idx[isPass ? 'pass' : 'drive']));
    idx[isPass ? 'pass' : 'drive'] = i;
    cards.forEach((c, k) => {
      c.style.transform = '';
      c.classList.remove('drag');
      let pos = 'hidden';
      if (k === i) pos = 'active';
      else if (k === i + 1) pos = 'next';
      else if (k === i + 2) pos = 'next2';
      else if (k === i - 1) pos = 'prev';
      c.dataset.stackPos = pos;
    });
    // Corner counter pill (inside the deck, top-right). The v45 .deck-nav
    // row is hidden in stack mode — swipe drives navigation — so the count
    // moves into this tiny badge to reclaim the bottom strip of real estate.
    let badge = deck.querySelector(':scope > .deck-corner-counter');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'deck-corner-counter';
      deck.appendChild(badge);
    }
    badge.textContent = `${i + 1} / ${total}`;
    // Also update the (now-hidden) v45 counter so a fallback rendering
    // (e.g. drive-focus class removed) doesn't show a stale value.
    const wrap = deck.parentElement;
    const oldCounter = wrap && wrap.querySelector('.deck-counter');
    if (oldCounter) oldCounter.textContent = `${i + 1} / ${total}`;
    updateMapForActive(deck, isPass);
  }

  function step(deck, isPass, dir) {
    const cards = deck.querySelectorAll(isPass ? '.pass-card' : '.drive-card');
    const total = cards.length;
    if (!total) return;
    const ni = Math.max(0, Math.min(total - 1, idx[isPass ? 'pass' : 'drive'] + dir));
    if (ni === idx[isPass ? 'pass' : 'drive']) return;
    idx[isPass ? 'pass' : 'drive'] = ni;
    applyStack(deck, isPass);
  }

  // ---- Gesture wiring --------------------------------------------------------
  // Strategy: listen for pointerdown/touchstart on the deck, then attach
  // pointermove/up to the DOCUMENT for the duration of the gesture. Putting
  // move/up on document instead of deck (or relying on setPointerCapture)
  // means we keep receiving events even if the finger drifts off the card,
  // and works on devices where pointer capture is flaky. We also wire the
  // legacy TouchEvent family as a fallback, since some Android Chromium
  // configurations suppress PointerEvents under certain touch-action values.
  function wireGesture(deck, isPass) {
    if (deck.dataset.stackWired === '1') return;
    deck.dataset.stackWired = '1';

    function pickActive() {
      const cards = deck.querySelectorAll(isPass ? '.pass-card' : '.drive-card');
      return cards[idx[isPass ? 'pass' : 'drive']] || null;
    }

    let startX = 0, startY = 0, startT = 0, pid = null, srcKind = null;
    let active = null, axis = null, dragging = false;

    function begin(x, y, t, kind, id) {
      active = pickActive();
      if (!active) return false;
      startX = x; startY = y; startT = t || Date.now();
      srcKind = kind; pid = id == null ? null : id;
      axis = null; dragging = false;
      return true;
    }
    function move(x, y, e) {
      if (!active) return;
      const dx = x - startX;
      const dy = y - startY;
      if (axis === null) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        // Strong horizontal bias: as long as |dx| > |dy| we treat it as a
        // swipe. Only obvious vertical drag (|dy| > |dx| + 4) hands the
        // gesture to the card's internal scroll.
        axis = (Math.abs(dx) > Math.abs(dy)) ? 'x'
             : (Math.abs(dy) > Math.abs(dx) + 4) ? 'y'
             : 'x';
        if (axis === 'x') { dragging = true; active.classList.add('drag'); }
        else if (axis === 'y') {
          // User wants to scroll inside the card. Detach our document-level
          // listeners NOW so the browser's native scroll picks up the
          // remainder of the touchstream cleanly.
          active = null; axis = null; dragging = false; pid = null; srcKind = null;
          detach();
          return;
        }
      }
      if (axis !== 'x') return;
      if (e && e.cancelable) { try { e.preventDefault(); } catch (_) {} }
      const rot = Math.max(-12, Math.min(12, dx / 18));
      active.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
    }
    function end(x, t) {
      if (!active) return;
      const dx = x - startX;
      const dt = Math.max(1, (t || Date.now()) - startT);
      const w = deck.clientWidth || 1;
      const flick = Math.abs(dx) / dt;
      // 10% width OR a 0.2 px/ms flick. With this combined trigger, even a
      // short ~40 px drag advances, and so does a quick flick across any
      // distance. The user keeps reporting "no advance" — looser thresholds
      // and document-level listeners are the two combined fixes.
      let dir = 0;
      if (axis === 'x' && (Math.abs(dx) > w * 0.10 || flick > 0.2)) {
        dir = (dx < 0) ? 1 : -1;
      }
      if (dir !== 0) {
        active.classList.remove('drag');
        const sign = dir > 0 ? -1 : 1;
        const tx = `translateX(${sign * w * 1.2}px) rotate(${sign * 18}deg)`;
        const card = active;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          card.style.transform = tx;
        }));
        setTimeout(() => { step(deck, isPass, dir); }, 220);
      } else if (dragging) {
        active.classList.remove('drag');
        active.style.transform = '';
      }
      active = null; axis = null; dragging = false; pid = null; srcKind = null;
      detach();
    }
    function abort() {
      // Browser claimed the gesture (e.g. for system back). If we'd already
      // committed to horizontal AND the finger had travelled at all, treat
      // it as an end with whatever position we last saw — better to commit
      // a clear swipe than to snap a near-finished one back.
      if (active && dragging) {
        // We don't have a clientX here — synthesize from the last transform.
        const m = String(active.style.transform || '').match(/translateX\(([-\d.]+)px\)/);
        const dxLast = m ? Number(m[1]) : 0;
        end(startX + dxLast, Date.now());
        return;
      }
      if (active) { active.classList.remove('drag'); active.style.transform = ''; }
      active = null; axis = null; dragging = false; pid = null; srcKind = null;
      detach();
    }

    // Doc-level handlers (attached only while a gesture is in progress).
    function onDocPointerMove(e) {
      if (srcKind !== 'pointer') return;
      if (pid !== null && e.pointerId !== pid) return;
      move(e.clientX, e.clientY, e);
    }
    function onDocPointerUp(e) {
      if (srcKind !== 'pointer') return;
      if (pid !== null && e.pointerId !== pid) return;
      end(e.clientX, e.timeStamp || Date.now());
    }
    function onDocPointerCancel(e) {
      if (srcKind !== 'pointer') return;
      if (pid !== null && e.pointerId !== pid) return;
      abort();
    }
    function onDocTouchMove(e) {
      if (srcKind !== 'touch') return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      move(t.clientX, t.clientY, e);
    }
    function onDocTouchEnd(e) {
      if (srcKind !== 'touch') return;
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      const x = t ? t.clientX : startX;
      end(x, e.timeStamp || Date.now());
    }
    function onDocTouchCancel() {
      if (srcKind !== 'touch') return;
      abort();
    }

    function attach() {
      if (srcKind === 'pointer') {
        document.addEventListener('pointermove', onDocPointerMove, { passive: false });
        document.addEventListener('pointerup', onDocPointerUp, { passive: true });
        document.addEventListener('pointercancel', onDocPointerCancel, { passive: true });
      } else if (srcKind === 'touch') {
        document.addEventListener('touchmove', onDocTouchMove, { passive: false });
        document.addEventListener('touchend', onDocTouchEnd, { passive: true });
        document.addEventListener('touchcancel', onDocTouchCancel, { passive: true });
      }
    }
    function detach() {
      document.removeEventListener('pointermove', onDocPointerMove);
      document.removeEventListener('pointerup', onDocPointerUp);
      document.removeEventListener('pointercancel', onDocPointerCancel);
      document.removeEventListener('touchmove', onDocTouchMove);
      document.removeEventListener('touchend', onDocTouchEnd);
      document.removeEventListener('touchcancel', onDocTouchCancel);
    }

    // Deck-level entry points.
    deck.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Skip Pointer if a Touch sequence is already in progress (Android may
      // fire both).
      if (srcKind === 'touch') return;
      if (begin(e.clientX, e.clientY, e.timeStamp, 'pointer', e.pointerId)) attach();
    }, { passive: true });
    deck.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (begin(t.clientX, t.clientY, e.timeStamp, 'touch', null)) attach();
    }, { passive: true });

    // Keyboard / nav-arrow fallback.
    if (!deck.hasAttribute('tabindex')) deck.tabIndex = 0;
    deck.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(deck, isPass, 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(deck, isPass, -1); }
    });
    // Hook the v45 nav arrows (if mounted) to v47's step.
    const wrap = deck.parentElement;
    const nav = wrap && wrap.querySelector('.deck-nav');
    if (nav) {
      const prev = nav.querySelector('.deck-prev');
      const next = nav.querySelector('.deck-next');
      if (prev) prev.onclick = () => step(deck, isPass, -1);
      if (next) next.onclick = () => step(deck, isPass, 1);
    }
  }

  // Replace the deck node with a clone of itself to strip any listeners v45
  // attached before v47 could plant its `data-stack` flag. Children come with.
  function takeOverDeck(deck) {
    const clone = deck.cloneNode(true);
    clone.dataset.stack = '1';
    clone.dataset.stackWired = '';
    deck.replaceWith(clone);
    return clone;
  }

  // After v47's flex layout settles, Leaflet maps need a kick to recompute
  // their _size and pull tiles. Without this both Driver and Passenger maps
  // mount empty because createMap was called when the host was 0×0.
  function pokeMap(getter) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const m = getter();
        if (m && typeof m.invalidateSize === 'function') m.invalidateSize(false);
      } catch (_) {}
    }));
  }
  function observeMap(host, getter) {
    if (!host || host.__v47Obs) return;
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => pokeMap(getter));
    obs.observe(host);
    host.__v47Obs = obs;
  }

  function setupDriver() {
    let deck = document.querySelector('.drive-cards');
    if (!deck) return;
    if (deck.dataset.stack !== '1') deck = takeOverDeck(deck);
    // Sync activeIdx with v13's GPS-driven active card index when available.
    const aci = state.driving && state.driving.activeCardIndex;
    if (typeof aci === 'number' && aci >= 0) idx.drive = aci;
    wireGesture(deck, false);
    ensureCondStrip(document.querySelector('.drive-dashboard'));
    applyStack(deck, false);
    const mapHost = document.getElementById('driveMapHost');
    const getter = () => window.NamibiaOsmMap && window.NamibiaOsmMap.getMap && window.NamibiaOsmMap.getMap();
    pokeMap(getter);
    observeMap(mapHost, getter);
  }
  function setupPassenger() {
    let deck = document.querySelector('.pass-deck');
    if (!deck) return;
    if (deck.dataset.stack !== '1') deck = takeOverDeck(deck);
    wireGesture(deck, true);
    ensureCondStrip(document.querySelector('.pass-shell'));
    applyStack(deck, true);
    const mapHost = document.getElementById('passMapHost');
    const getter = () => window.NamibiaDriveDeck && window.NamibiaDriveDeck.getPassMap && window.NamibiaDriveDeck.getPassMap();
    pokeMap(getter);
    observeMap(mapHost, getter);
  }

  function run() {
    // Mirror the active tab on body for tab-specific CSS (e.g. hide the
    // aside mini-map on Settings, where it's just noise next to the
    // API-key form).
    try {
      const tab = state && state.activeTab;
      document.body.classList.toggle('tab-settings', tab === 'settings');
    } catch (_) {}
    ensureSummaryStrip();
    if (!inFocus()) return;
    if (state.activeTab === 'street') {
      try { setupDriver(); } catch (e) { if (typeof console !== 'undefined') console.warn('v47 driver', e); }
    } else if (state.activeTab === 'directions') {
      try { setupPassenger(); } catch (e) { if (typeof console !== 'undefined') console.warn('v47 passenger', e); }
    }
  }

  if (window.NamibiaUI) {
    window.NamibiaUI.afterRenderTab(run);
  } else {
    document.addEventListener('DOMContentLoaded', run);
  }

  window.NamibiaStackDeck = { applyStack, step };
})();
