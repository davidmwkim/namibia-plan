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
    if (turn && step && typeof step.endLat === 'number' && typeof step.endLng === 'number') {
      const start = { lat: Number(step.lat), lng: Number(step.lng) };
      const end = { lat: Number(step.endLat), lng: Number(step.endLng) };
      if (isPass) setPassengerPins(start, end);
      else if (window.NamibiaOsmMap && window.NamibiaOsmMap.setLegPins) window.NamibiaOsmMap.setLegPins(start, end);
    } else {
      if (isPass) setPassengerPins(null, null);
      else if (window.NamibiaOsmMap && window.NamibiaOsmMap.clearLegPins) window.NamibiaOsmMap.clearLegPins();
      if (ll && window.NamibiaOsmMap && window.NamibiaOsmMap.setRouteDot && !isPass) {
        window.NamibiaOsmMap.setRouteDot(ll.lat, ll.lng, true);
      }
    }
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
    // Counter on the nav row (re-uses v45's markup if present).
    const wrap = deck.parentElement;
    const counter = wrap && wrap.querySelector('.deck-counter');
    if (counter) counter.textContent = `${i + 1} / ${total}`;
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
  function wireGesture(deck, isPass) {
    if (deck.dataset.stackWired === '1') return;
    deck.dataset.stackWired = '1';
    let startX = 0, startY = 0, startT = 0, pid = null;
    let active = null, axis = null, dragging = false;

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cards = deck.querySelectorAll(isPass ? '.pass-card' : '.drive-card');
      active = cards[idx[isPass ? 'pass' : 'drive']];
      if (!active) return;
      startX = e.clientX; startY = e.clientY;
      startT = e.timeStamp || Date.now();
      pid = e.pointerId; axis = null; dragging = false;
    }
    function onMove(e) {
      if (pid === null || e.pointerId !== pid || !active) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Lock the gesture axis on first significant movement so a vertical
      // pan to scroll inside a tall card doesn't get hijacked as a swipe.
      if (axis === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        axis = (Math.abs(dx) > Math.abs(dy)) ? 'x' : 'y';
        if (axis === 'x') { dragging = true; active.classList.add('drag'); }
      }
      if (axis !== 'x') return;
      // Track 1:1 with a small tilt.
      const rot = Math.max(-12, Math.min(12, dx / 18));
      active.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
    }
    function commit(e) {
      if (pid === null || e.pointerId !== pid) return;
      const wasDragging = dragging;
      const dx = e.clientX - startX;
      const dt = Math.max(1, (e.timeStamp || Date.now()) - startT);
      pid = null;
      if (!wasDragging || !active) { active = null; axis = null; dragging = false; return; }
      const w = deck.clientWidth || 1;
      const flick = Math.abs(dx) / dt; // px/ms
      let dir = 0;
      if (Math.abs(dx) > w * 0.25 || flick > 0.3) dir = (dx < 0) ? 1 : -1;
      // Animate off-screen for the swipe direction, then restack.
      if (dir !== 0) {
        active.classList.remove('drag');
        const sign = dir > 0 ? -1 : 1;
        active.style.transform = `translateX(${sign * w * 1.2}px) rotate(${sign * 18}deg)`;
        const card = active;
        setTimeout(() => {
          step(deck, isPass, dir);
          // applyStack will reset transforms when it retags everyone.
        }, 180);
      } else {
        // Snap back.
        active.classList.remove('drag');
        active.style.transform = '';
      }
      active = null; axis = null; dragging = false;
    }
    function cancel(e) {
      if (pid === null || e.pointerId !== pid) return;
      pid = null;
      if (active) { active.classList.remove('drag'); active.style.transform = ''; }
      active = null; axis = null; dragging = false;
    }

    deck.addEventListener('pointerdown', onDown, { passive: true });
    deck.addEventListener('pointermove', onMove, { passive: true });
    deck.addEventListener('pointerup', commit, { passive: true });
    deck.addEventListener('pointercancel', cancel, { passive: true });

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

  function setupDriver() {
    let deck = document.querySelector('.drive-cards');
    if (!deck) return;
    if (deck.dataset.stack !== '1') deck = takeOverDeck(deck);
    // Sync activeIdx with v13's GPS-driven active card index when available.
    const aci = state.driving && state.driving.activeCardIndex;
    if (typeof aci === 'number' && aci >= 0) idx.drive = aci;
    wireGesture(deck, false);
    applyStack(deck, false);
  }
  function setupPassenger() {
    let deck = document.querySelector('.pass-deck');
    if (!deck) return;
    if (deck.dataset.stack !== '1') deck = takeOverDeck(deck);
    wireGesture(deck, true);
    applyStack(deck, true);
  }

  function run() {
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
