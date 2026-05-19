// tests/e2e/dashboard.spec.js
// End-to-end tests that drive a real Chromium via Playwright. The PWA is served
// by Playwright's webServer (see playwright.config.js).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DAY2 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../__fixtures__/day2-route.json'), 'utf8'));

async function seedRoute(page, dateKey, route) {
  // Force schemaVersion = 0 so v12's decorateAllCached re-runs computeSunTimes
  // against the destination's lat/lng for the *correct* date — the fixture's
  // pre-baked sunTimes epoch values would otherwise be locked to whatever year
  // the fixture was authored against.
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
    const data = window.NAMIBIA_TRIP_DATA;
    const idx = data.days.findIndex(d => d.date === dateKey);
    if (idx < 0) return;
    window.state.dayIndex = idx;
    const sel = document.getElementById('daySelect');
    if (sel) { sel.value = String(idx); }
    if (typeof window.render === 'function') window.render();
  }, dateKey);
}

async function stubGoogle(context) {
  // Block live Google Maps JS SDK + TTS.
  await context.route('**/maps.googleapis.com/**', route => {
    if (route.request().url().includes('staticmap') || route.request().url().includes('streetview')) {
      // 1x1 transparent PNG
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google = window.google || {maps: {Map: function(){this.fitBounds=()=>{}; this.setCenter=()=>{}}, DirectionsService: function(){this.route=async()=>({routes:[{overview_path:[], legs:[]}]})}, DirectionsRenderer: function(){this.setMap=()=>{}; this.set=()=>{}}, Marker: function(){this.setMap=()=>{}; this.addListener=()=>{}; this.getPosition=()=>({lat:()=>0,lng:()=>0})}, Polyline: function(){this.setMap=()=>{}}, InfoWindow: function(){this.open=()=>{}}, LatLng: function(){}, LatLngBounds: function(){this.extend=()=>{}; this.isEmpty=()=>true}, TravelMode: {DRIVING:"DRIVING"}}}; if(window.__namibiaInitMap) window.__namibiaInitMap();' });
  });
  await context.route('**/texttospeech.googleapis.com/**', route => {
    // 1 byte of base64 silence
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ audioContent: 'AAAAAA==' })
    });
  });
}

test.describe('Driving Dashboard e2e', () => {
  test.beforeEach(async ({ context }) => {
    await stubGoogle(context);
  });

  test('all 5 tabs render with no console errors', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('.tab[data-tab="overview"]');
    await switchToDay(page, '2026-05-24');
    for (const t of ['overview', 'stops', 'directions', 'street', 'exports']) {
      await page.click(`.tab[data-tab="${t}"]`);
      await page.waitForFunction(t => document.querySelector('#tabContent')?.innerHTML?.length > 0, t);
    }
    const fatal = errors.filter(e => !/Failed to load resource/.test(e));
    expect(fatal).toEqual([]);
  });

  test('GPS spoof advances active card', async ({ page, context }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('.tab[data-tab="street"]');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofGps({ lat: -22.5588, lng: 17.0832 });
    });
    await page.waitForSelector('.drive-card[data-active="true"]');
    const firstActiveText = await page.textContent('.drive-card[data-active="true"]');

    await page.evaluate(() => {
      window.__namibiaSpoofGps({ lat: -23.3197, lng: 17.0834 });
    });
    await page.waitForTimeout(200);
    const secondActiveText = await page.textContent('.drive-card[data-active="true"]');
    expect(firstActiveText).not.toBe(secondActiveText);
  });

  test('sunset risk card and chip appear when ETA exceeds sunset', async ({ page, context }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('.tab[data-tab="street"]');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofClock(Date.parse('2026-05-24T16:50:00+02:00'));
      window.__namibiaSpoofGps({ lat: -23.32, lng: 17.0834 });
    });
    await expect(page.locator('.drive-card.card-sunset_risk')).toBeVisible();
    await expect(page.locator('.sun-chip.sun-risk, .sun-chip.sun-tight')).toBeVisible();
  });

  test('pre-dawn shows sunrise chip and no risk card', async ({ page, context }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('.tab[data-tab="street"]');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofClock(Date.parse('2026-05-24T04:30:00+02:00'));
      window.__namibiaSpoofGps({ lat: -22.5588, lng: 17.0832 });
    });
    await expect(page.locator('.sun-chip.sun-predawn')).toBeVisible();
    await expect(page.locator('.drive-card.card-sunset_risk')).toHaveCount(0);
  });

  test('mute button toggles TTS state', async ({ page, context }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('.tab[data-tab="street"]');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => window.__namibiaSpoofGps({ lat: -22.5588, lng: 17.0832 }));
    await page.waitForSelector('#ttsMute');
    const before = await page.evaluate(() => window.NamibiaTTS.isMuted());
    expect(before).toBe(false);
    await page.click('#ttsMute');
    const after = await page.evaluate(() => window.NamibiaTTS.isMuted());
    expect(after).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem('namibia_tts_muted'));
    expect(stored).toBe('1');
  });

  test('replay button records last ttsKey on speak and re-fires it', async ({ page, context }) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await page.waitForSelector('.tab[data-tab="street"]');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.waitForSelector('#ttsReplay');
    // Manually seed lastKey via the public API. Speak returns a promise; await it
    // explicitly so the page's microtask queue settles before we read storage.
    await page.evaluate(async () => { await window.NamibiaTTS.speak('fuel_stop'); });
    const lastKey = await page.evaluate(() => localStorage.getItem('namibia_tts_last_key'));
    expect(lastKey).toBe('fuel_stop');
    await page.click('#ttsReplay');
    const still = await page.evaluate(() => localStorage.getItem('namibia_tts_last_key'));
    expect(still).toBe('fuel_stop');
  });
});
