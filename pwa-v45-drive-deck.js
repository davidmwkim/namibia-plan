// pwa-v45-drive-deck.js — turn the Driver (and later Passenger) card list into a
// horizontal SWIPE DECK and drive a position dot on the central map: as you swipe
// to a card, the map's dot jumps to that point on the route and pans there. The
// GPS-active card auto-advances the deck (v13 scrolls it horizontally), which
// fires the same scroll handler, so the dot tracks your live position too.
//
// Registers an afterRenderTab hook (runs after v13 has built the dashboard).
(function () {
  // Tabs that get the "live focus" treatment (hide aside mini-map, etc.).
  const FOCUS_TABS = { street: true };

  function routeCards() {
    const d = (typeof day === 'function') ? day() : null;
    return (d && state.renderedRoutes && state.renderedRoutes[d.date] && state.renderedRoutes[d.date].cards) || [];
  }

  // Which card is centered in the deck's viewport right now.
  function centeredIndex(deck) {
    const cards = deck.querySelectorAll('.drive-card');
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
    const el = deck.querySelector(`.drive-card[data-card-index="${idx}"]`);
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
    scrollToCard(deck, idx + dir, true);
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

  window.NamibiaUI.afterRenderTab(function () {
    const focus = !!FOCUS_TABS[state.activeTab];
    document.body.classList.toggle('drive-focus', focus);
    if (!focus) return;
    const deck = document.querySelector('.drive-cards');
    if (!deck) return;
    ensureNav(deck);
    if (!deck.dataset.deckWired) {
      deck.dataset.deckWired = '1';
      deck.addEventListener('scroll', () => onScroll(deck), { passive: true });
    }
    // Seed the dot + counter on the GPS-active card (or the first card).
    const active = (state.driving && state.driving.activeCardIndex >= 0) ? state.driving.activeCardIndex : 0;
    updateNav(deck, active);
    moveDot(active);
  });

  window.NamibiaDriveDeck = { centeredIndex, scrollToCard };
})();
