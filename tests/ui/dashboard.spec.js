// tests/ui/dashboard.spec.js
// Visual regression: pinned screenshots of the Driving Dashboard at fixed GPS
// positions and clock times. First run creates the baseline.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

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
    if (sel) { sel.value = String(idx); }
    if (typeof window.render === 'function') window.render();
  }, dateKey);
}

async function stubGoogle(context) {
  await context.route('**/maps.googleapis.com/**', route => {
    if (route.request().url().includes('staticmap') || route.request().url().includes('streetview')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={maps:{Map:function(){this.fitBounds=()=>{};this.setCenter=()=>{}},DirectionsService:function(){this.route=async()=>({routes:[]})},DirectionsRenderer:function(){this.setMap=()=>{};this.set=()=>{}},Marker:function(){this.setMap=()=>{};this.addListener=()=>{};this.getPosition=()=>({lat:()=>0,lng:()=>0})},Polyline:function(){this.setMap=()=>{}},InfoWindow:function(){this.open=()=>{}},LatLng:function(){},LatLngBounds:function(){this.extend=()=>{};this.isEmpty=()=>true},TravelMode:{DRIVING:"DRIVING"}}};if(window.__namibiaInitMap)window.__namibiaInitMap();' });
  });
  await context.route('**/texttospeech.googleapis.com/**', route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ audioContent: 'AAAAAA==' }) });
  });
}

test.describe('Driving Dashboard visual regression', () => {
  test.beforeEach(async ({ context }) => {
    await stubGoogle(context);
  });

  test('start of route', async ({ page }, info) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofClock(Date.parse('2026-05-24T08:00:00+02:00'));
      window.__namibiaSpoofGps({ lat: -22.5588, lng: 17.0832 });
    });
    await page.waitForSelector('.drive-sticky');
    await page.waitForTimeout(200);
    await expect(page.locator('.drive-sticky')).toHaveScreenshot(`drive-start-${info.project.name}.png`, { maxDiffPixels: 300 });
  });

  test('mid-leg', async ({ page }, info) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofClock(Date.parse('2026-05-24T10:30:00+02:00'));
      window.__namibiaSpoofGps({ lat: -23.3197, lng: 17.0834 });
    });
    await page.waitForSelector('.drive-sticky');
    await page.waitForTimeout(200);
    await expect(page.locator('.drive-sticky')).toHaveScreenshot(`drive-midleg-${info.project.name}.png`, { maxDiffPixels: 300 });
  });

  test('approaching arrival', async ({ page }, info) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofClock(Date.parse('2026-05-24T13:00:00+02:00'));
      window.__namibiaSpoofGps({ lat: -23.8919, lng: 16.0028 });
    });
    await page.waitForSelector('.drive-sticky');
    await page.waitForTimeout(200);
    await expect(page.locator('.drive-sticky')).toHaveScreenshot(`drive-arrival-${info.project.name}.png`, { maxDiffPixels: 300 });
  });

  test('sunset risk: red chip + injected card', async ({ page }, info) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofClock(Date.parse('2026-05-24T16:50:00+02:00'));
      window.__namibiaSpoofGps({ lat: -23.32, lng: 17.0834 });
    });
    await page.waitForSelector('.drive-card.card-sunset_risk');
    await page.waitForTimeout(200);
    await expect(page.locator('.drive-sticky')).toHaveScreenshot(`drive-sunset-risk-${info.project.name}.png`, { maxDiffPixels: 400 });
  });

  test('pre-dawn: sunrise chip', async ({ page }, info) => {
    await seedRoute(page, '2026-05-24', DAY2);
    await page.goto('/');
    await switchToDay(page, '2026-05-24');
    await page.click('.tab[data-tab="street"]');
    await page.evaluate(() => {
      window.__namibiaSpoofClock(Date.parse('2026-05-24T04:30:00+02:00'));
      window.__namibiaSpoofGps({ lat: -22.5588, lng: 17.0832 });
    });
    await page.waitForSelector('.sun-chip.sun-predawn');
    await page.waitForTimeout(200);
    await expect(page.locator('.drive-sticky')).toHaveScreenshot(`drive-predawn-${info.project.name}.png`, { maxDiffPixels: 300 });
  });
});
