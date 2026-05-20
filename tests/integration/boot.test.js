// tests/integration/boot.test.js
// Boot the full PWA in JSDOM and verify global surfaces wire up correctly.
import { describe, it, expect } from 'vitest';
import { bootPwa, bootPwaWithRoute } from '../helpers/boot-pwa.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const day2 = JSON.parse(readFileSync(resolve(ROOT, 'tests/__fixtures__/day2-route.json'), 'utf8'));

describe('PWA boot in JSDOM', () => {
  it('all 5 tabs and core globals exist after boot', async () => {
    const dom = await bootPwa();
    const w = dom.window;
    expect(w.NamibiaSunTimes).toBeTruthy();
    expect(w.NamibiaDrivingCore).toBeTruthy();
    expect(w.NamibiaV12).toBeTruthy();
    expect(w.NamibiaDriving).toBeTruthy();
    expect(w.NamibiaTTS).toBeTruthy();
    expect(w.state).toBeTruthy();
    expect(w.DATA).toBeTruthy();
    // Tabs present
    const tabs = dom.window.document.querySelectorAll('.tab');
    expect(tabs.length).toBe(5);
  });
});

describe('Directions tab with v12 enrichment', () => {
  it('renders a per-step OSM map frame + street-view img under each step', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    // Switch tab
    w.state.activeTab = 'directions';
    // The cached route already has streetViewUrl (data URL in the fixture); the
    // per-step map is now a live OSM (Leaflet) frame placeholder div (v36).
    w.renderTab();
    const lis = w.document.querySelectorAll('.directions ol li');
    expect(lis.length).toBeGreaterThan(0);
    const firstLi = lis[0];
    const mapFrame = firstLi.querySelector('.step-map-osm');
    const sv = firstLi.querySelector('img.step-streetview');
    expect(mapFrame).toBeTruthy();
    // The frame carries the data v36 needs to lazily build the Leaflet map.
    expect(mapFrame.getAttribute('data-leg')).toBe('0');
    expect(mapFrame.getAttribute('data-step')).toBe('0');
    expect(mapFrame.getAttribute('data-status')).toBeTruthy();
    expect(sv).toBeTruthy();
    expect(sv.getAttribute('src')).toBeTruthy();
    // Expand button present
    expect(firstLi.querySelector('.step-expand')).toBeTruthy();
  });
});

describe('Driving Dashboard with spoofed GPS', () => {
  it('renders driving cards and marks active card based on GPS', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    // GPS near step 1's start
    w.__namibiaSpoofGps({ lat: -22.5602, lng: 17.0731 });
    w.renderTab();
    const cards = w.document.querySelectorAll('.drive-card');
    expect(cards.length).toBeGreaterThan(0);
    const active = w.document.querySelector('.drive-card[data-active="true"]');
    expect(active).toBeTruthy();
    expect(active.textContent.toLowerCase()).toContain('b1');
  });

  it('renames the Street View tab to "Driver" and Directions to "Passenger"', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    w.renderTab();
    expect(w.document.querySelector('.tab[data-tab="street"]').textContent).toBe('Driver');
    expect(w.document.querySelector('.tab[data-tab="directions"]').textContent).toBe('Passenger');
  });
});

describe('Sunset risk transitions', () => {
  it('injects a sunset_risk card when severity goes from safe to risk', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    // Freeze clock at 16:50 local — should put ETA past sunset (17:34 in fixture) by ~15 min.
    w.__namibiaSpoofClock(Date.parse('2026-05-24T16:50:00+02:00'));
    w.__namibiaSpoofGps({ lat: -23.32, lng: 17.0834 }); // mid-leg, before Solitaire
    w.renderTab();
    const riskCard = w.document.querySelector('.drive-card.card-sunset_risk');
    expect(riskCard).toBeTruthy();
    const chip = w.document.querySelector('.sun-chip.sun-risk, .sun-chip.sun-tight');
    expect(chip).toBeTruthy();
  });

  it('does not inject a sunset_risk card in safe conditions', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    // 08:00 local on May 24 — ~10 hours to sunset, safe.
    w.__namibiaSpoofClock(Date.parse('2026-05-24T08:00:00+02:00'));
    w.__namibiaSpoofGps({ lat: -22.5602, lng: 17.0731 });
    w.renderTab();
    const riskCard = w.document.querySelector('.drive-card.card-sunset_risk');
    expect(riskCard).toBeFalsy();
  });

  it('shows sunrise chip pre-dawn', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    w.__namibiaSpoofClock(Date.parse('2026-05-24T04:30:00+02:00'));
    w.__namibiaSpoofGps({ lat: -22.5588, lng: 17.0832 });
    w.renderTab();
    const chip = w.document.querySelector('.sun-chip.sun-predawn');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('Sunrise');
  });
});

describe('Mute/replay buttons', () => {
  it('toggles mute via the dashboard button and persists to localStorage', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    w.__namibiaSpoofGps({ lat: -22.5602, lng: 17.0731 });
    w.renderTab();
    const btn = w.document.getElementById('ttsMute');
    expect(btn).toBeTruthy();
    expect(w.NamibiaTTS.isMuted()).toBe(false);
    btn.click();
    expect(w.NamibiaTTS.isMuted()).toBe(true);
    expect(w.localStorage.getItem('namibia_tts_muted')).toBe('1');
    btn.click();
    expect(w.NamibiaTTS.isMuted()).toBe(false);
  });
});
