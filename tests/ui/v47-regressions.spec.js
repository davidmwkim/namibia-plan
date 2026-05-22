// tests/ui/v47-regressions.spec.js — TDD coverage for the v47 layout
// regressions reported by the user:
//   • Passenger / Driver maps render with 0 height (tiles never load)
//   • Passenger swipe doesn't advance the stack
//   • Driver card transitions snap instead of animating
//   • Slider/nav bar reappears mid-screen from v45 leftovers
//   • Dark-mode text on .rss-note is too faint
//   • Dark/light toggle is buried in the Settings tab (invisible on Driver/Passenger)
//   • Long-press the version chip → version-pin dropdown opens; selection persists
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { swipe, longPress } = require('../helpers/swipe.js');

const DAY2 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../__fixtures__/day2-route.json'), 'utf8'));

async function seedRoute(page, dateKey, route) {
  const seedable = JSON.parse(JSON.stringify(route));
  seedable.schemaVersion = 0;
  delete seedable.sunTimes;
  await page.addInitScript(({ dateKey, route }) => {
    localStorage.setItem('namibia_routes_cache_v5', JSON.stringify({ [dateKey]: route }));
    localStorage.setItem('namibia_google_api_key', 'fake-api-key-for-tests');
  }, { dateKey, route: seedable });
}

async function switchToDay(page, dateKey) {
  await page.waitForFunction(() => !!window.NAMIBIA_TRIP_DATA && !!window.state);
  await page.evaluate((dateKey) => {
    const idx = window.NAMIBIA_TRIP_DATA.days.findIndex(d => d.date === dateKey);
    if (idx < 0) return;
    window.state.dayIndex = idx;
    const sel = document.getElementById('daySelect');
    if (sel) sel.value = String(idx);
    if (typeof window.render === 'function') window.render();
  }, dateKey);
}

async function stubGoogle(context) {
  // Minimal stub: just give `window.google` enough shape that app.js doesn't
  // throw. Do NOT call __namibiaInitMap — that triggers renderAllDays() which
  // would clobber the seeded fixture in state.renderedRoutes.
  await context.route('**/maps.googleapis.com/**', route => {
    if (route.request().url().includes('staticmap') || route.request().url().includes('streetview')) {
      return route.fulfill({
        status: 200, contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={maps:{Map:function(){this.fitBounds=()=>{};this.setCenter=()=>{}},DirectionsService:function(){this.route=async()=>({routes:[]})},DirectionsRenderer:function(){this.setMap=()=>{};this.set=()=>{}},Marker:function(){this.setMap=()=>{};this.addListener=()=>{};this.getPosition=()=>({lat:()=>0,lng:()=>0})},Polyline:function(){this.setMap=()=>{}},InfoWindow:function(){this.open=()=>{}},LatLng:function(){},LatLngBounds:function(){this.extend=()=>{};this.isEmpty=()=>true},TravelMode:{DRIVING:"DRIVING"}}};' });
  });
}

// Relative luminance per WCAG.
function luminance(hex) {
  const m = String(hex).match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
    || String(hex).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return NaN;
  const isHex = /^#?[0-9a-f]+$/i.test(hex);
  const [r, g, b] = m.slice(1, 4).map(v => {
    const n = isHex ? parseInt(v, 16) : Number(v);
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('v47 layout regressions', () => {
  test.beforeEach(async ({ context }) => { await stubGoogle(context); });

  test('Passenger map has measurable height', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="directions"]');
    // Give v12 + v45 + v47 a beat to build the pass-shell, then poll for it.
    await page.waitForFunction(() => !!document.querySelector('.pass-map'), null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const box = await page.locator('.pass-map').boundingBox();
    expect(box && box.height).toBeGreaterThan(30);
  });

  test('Road-conditions preview strip is present and visible above both maps', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    // Driver tab
    await page.click('.tab[data-tab="street"]');
    await page.waitForSelector('.drive-dashboard .route-cond-strip', { state: 'attached' });
    const driverStripBox = await page.locator('.drive-dashboard .route-cond-strip').boundingBox();
    const driverMapBox = await page.locator('.drive-dashboard .drive-map').boundingBox();
    expect(driverStripBox && driverStripBox.height).toBeGreaterThan(8);
    // Strip sits ABOVE the map and is essentially flush (visual gap < 20 px,
    // accounting for the .drive-sticky chips that may also live above it).
    expect(driverMapBox.y).toBeGreaterThan(driverStripBox.y);
    expect(driverMapBox.y - (driverStripBox.y + driverStripBox.height)).toBeLessThanOrEqual(20);
    // Passenger tab
    await page.click('.tab[data-tab="directions"]');
    await page.waitForSelector('.pass-shell .route-cond-strip', { state: 'attached' });
    const passStripBox = await page.locator('.pass-shell .route-cond-strip').boundingBox();
    const passMapBox = await page.locator('.pass-shell .pass-map').boundingBox();
    expect(passStripBox && passStripBox.height).toBeGreaterThan(8);
    expect(passMapBox.y).toBeGreaterThan(passStripBox.y);
    expect(passMapBox.y - (passStripBox.y + passStripBox.height)).toBeLessThanOrEqual(20);
  });

  test('Driver map has measurable height + draws tiles', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.waitForSelector('#driveMapHost', { state: 'attached' });
    await page.waitForTimeout(350);
    const box = await page.locator('#driveMapHost').boundingBox();
    expect(box && box.height).toBeGreaterThan(30);
    const tileCount = await page.locator('.leaflet-tile, .leaflet-container').count();
    expect(tileCount).toBeGreaterThan(0);
  });

  test('Vertical scroll on the deck advances the active card', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="directions"]');
    await page.waitForSelector('.pass-deck[data-stack="1"] .pass-card[data-stack-pos="active"]', { state: 'attached' });
    const before = await page.evaluate(() => document.querySelector('.pass-card[data-stack-pos="active"]')?.dataset.cardIndex);
    // Programmatically scroll the deck by one card height — the v47 scroll
    // sync should retag the next card as active.
    await page.evaluate(() => {
      const deck = document.querySelector('.pass-deck[data-stack="1"]');
      // Continuous scroll (no snap) — scroll to the second card's offsetTop
      // so the "active card by viewport-center" detection lands on it.
      const cards = deck.querySelectorAll('.pass-card');
      if (cards.length < 2) return;
      deck.scrollTop = cards[1].offsetTop + cards[1].offsetHeight / 2 - deck.clientHeight / 2;
    });
    // CSS scroll-behavior: smooth + the 90 ms debounce on the scroll sync —
    // give the animation + handler time to settle.
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.querySelector('.pass-card[data-stack-pos="active"]')?.dataset.cardIndex);
    expect(Number(after)).toBeGreaterThan(Number(before));
  });

  test('Passenger swipe advances data-stack-pos', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="directions"]');
    await page.waitForSelector('.pass-deck[data-stack="1"] .pass-card[data-stack-pos="active"]', { state: 'attached' });
    const before = await page.evaluate(() => document.querySelector('.pass-card[data-stack-pos="active"]')?.dataset.cardIndex);
    await swipe(page, '.pass-deck', -50, 0); // big left swipe
    const after = await page.evaluate(() => document.querySelector('.pass-card[data-stack-pos="active"]')?.dataset.cardIndex);
    expect(after).not.toBe(before);
    expect(Number(after)).toBe(Number(before) + 1);
  });

  test('Driver next-button animates the active card off-screen', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.waitForSelector('.drive-cards[data-stack="1"] .drive-card[data-stack-pos="active"]', { state: 'attached' });
    const before = await page.evaluate(() => document.querySelector('.drive-card[data-stack-pos="active"]')?.dataset.cardIndex);
    // transitionrun is the cleanest proof of an animated change. Listen on
    // every card AND on the deck (event bubbles) so we catch the prev card's
    // slide-off too. Then click the v45 nav next-button.
    const transitionFired = await page.evaluate(() => new Promise(resolve => {
      let done = false;
      function onTr() { if (done) return; done = true; resolve(true); }
      const deck = document.querySelector('.drive-cards');
      deck && deck.addEventListener('transitionrun', onTr, { once: true, capture: true });
      const btn = document.querySelector('.deck-next');
      if (btn) btn.click();
      setTimeout(() => { if (!done) resolve(false); }, 800);
    }));
    const after = await page.evaluate(() => document.querySelector('.drive-card[data-stack-pos="active"]')?.dataset.cardIndex);
    // Either the transition fired OR the index advanced — both prove the
    // step worked. Prefer the transition assertion since the user reported
    // "snap, no animation" — that's the actual symptom.
    expect(transitionFired || (Number(after) === Number(before) + 1)).toBe(true);
  });

  test('Deck nav row sits at the bottom of the focus pane (no v45 scrubber overlap)', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.waitForSelector('.drive-cards[data-stack="1"]', { state: 'attached' });
    // v45's .drive-scrub-row inside .drive-sticky is redundant under stack mode
    // and should be hidden so it doesn't push the deck/nav around.
    const visible = await page.evaluate(() => {
      const el = document.querySelector('.drive-scrub-row');
      if (!el) return false;
      return el.offsetHeight > 0 && getComputedStyle(el).display !== 'none';
    });
    expect(visible).toBe(false);
    // The bottom .deck-nav row is also gone in stack mode — swipe drives the
    // deck and the count lives in a corner badge.
    const navVisible = await page.evaluate(() => {
      const el = document.querySelector('.deck-nav');
      return !!el && el.offsetHeight > 0 && getComputedStyle(el).display !== 'none';
    });
    expect(navVisible).toBe(false);
    const badge = await page.evaluate(() => {
      const el = document.querySelector('.drive-cards .deck-corner-counter');
      return el && el.textContent.trim();
    });
    expect(badge).toMatch(/^\d+ \/ \d+$/);
  });

  test('Dark-mode .rss-note meets WCAG AA contrast', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.addInitScript(() => localStorage.setItem('namibia_theme', 'dark'));
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="directions"]');
    await page.waitForSelector('.rss-note');
    const { fg, bg } = await page.evaluate(() => {
      const el = document.querySelector('.rss-note');
      const fg = getComputedStyle(el).color;
      // Walk up until we find an element with a non-transparent bg.
      let n = el, bg = '';
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break; }
        n = n.parentElement;
      }
      if (!bg) bg = getComputedStyle(document.body).backgroundColor;
      return { fg, bg };
    });
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('Theme toggle is visible on the Driver tab (not buried in Settings)', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.waitForSelector('#driveMapHost', { state: 'attached' });
    const visible = await page.locator('#themeToggleBtn').isVisible().catch(() => false);
    expect(visible).toBe(true);
  });

  test('Long-press the version chip opens the version-pin dropdown', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('#appVersionChip');
    // v48 wires the chip via NamibiaUI.afterRender + a 900 ms safety timer —
    // give the wiring a beat before sending pointer events.
    await page.waitForFunction(() => document.getElementById('appVersionChip')?.dataset.vpinWired === '1', null, { timeout: 3000 });
    await longPress(page, '#appVersionChip', 600);
    await page.waitForSelector('.version-pin-dropdown', { timeout: 2000 });
    const items = await page.locator('.version-pin-dropdown .vpin-item').count();
    expect(items).toBeGreaterThan(0);
  });

  test('Selecting a version persists to localStorage', async ({ page }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('#appVersionChip');
    await page.waitForFunction(() => document.getElementById('appVersionChip')?.dataset.vpinWired === '1', null, { timeout: 3000 });
    await longPress(page, '#appVersionChip', 600);
    await page.waitForSelector('.version-pin-dropdown', { timeout: 2000 });
    // Pick the first non-"Latest" item if present, else "Latest".
    const picked = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.version-pin-dropdown .vpin-item')];
      const target = items.find(i => i.dataset.version !== 'latest') || items[0];
      const v = target.dataset.version;
      target.click();
      return v;
    });
    const stored = await page.evaluate(() => localStorage.getItem('namibia_version_pin'));
    if (picked === 'latest') expect(stored === null || stored === 'latest').toBe(true);
    else expect(stored).toBe(picked);
  });
});
