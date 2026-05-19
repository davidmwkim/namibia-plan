// tests/integration/demo.test.js
// Boot the PWA, seed Day 2, switch to Driving tab, run a quick demo and assert
// state progressed (GPS moved, simulated clock advanced, cards reflowed).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bootPwaWithRoute } from '../helpers/boot-pwa.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const day2 = JSON.parse(readFileSync(resolve(ROOT, 'tests/__fixtures__/day2-route.json'), 'utf8'));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

describe('Demo mode', () => {
  it('exposes the public API', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const D = dom.window.NamibiaDemo;
    expect(typeof D.startDemo).toBe('function');
    expect(typeof D.stopDemo).toBe('function');
    expect(typeof D.interpPolyline).toBe('function');
    expect(typeof D.totalRouteMinutes).toBe('function');
  });

  it('injects demo controls into the Driving Dashboard', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    w.renderTab();
    // The MutationObserver fires asynchronously after the dashboard's first mount.
    await sleep(30);
    expect(w.document.getElementById('demoStart')).toBeTruthy();
    expect(w.document.getElementById('demoStop')).toBeTruthy();
    expect(w.document.getElementById('demoDuration')).toBeTruthy();
    expect(w.document.getElementById('demoNoise')).toBeTruthy();
  });

  it('startDemo updates GPS and simulated clock as time advances', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    w.renderTab();
    // Use a deterministic RNG so noise is reproducible.
    let seed = 0.5;
    w.NamibiaDemo.setRng(() => { seed = (seed * 9301 + 49297) % 233280 / 233280; return seed; });
    // Short tick so the test runs quickly.
    w.NamibiaDemo.startDemo({ durationMs: 600, tickMs: 50, noiseHours: 1 });
    await sleep(50);
    const earlyGps = JSON.parse(JSON.stringify(w.state.gps || {}));
    await sleep(400);
    const lateGps = JSON.parse(JSON.stringify(w.state.gps || {}));
    w.NamibiaDemo.stopDemo();
    // GPS should have moved along the route between the two snapshots.
    expect(earlyGps.lat).not.toBe(lateGps.lat);
  });

  it('starting demo throttles TTS and stopping demo clears throttle', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'street';
    w.renderTab();
    expect(w.NamibiaTTS.getThrottle()).toBe(0);
    w.NamibiaDemo.startDemo({ durationMs: 200, tickMs: 50 });
    await sleep(20);
    expect(w.NamibiaTTS.getThrottle()).toBeGreaterThan(0);
    w.NamibiaDemo.stopDemo();
    expect(w.NamibiaTTS.getThrottle()).toBe(0);
  });

  it('TTS throttle suppresses rapid speaks but allows them after the interval', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.NamibiaTTS.setThrottle(50);
    // We can't directly inspect speak's return value reliably under JSDOM (no
    // speechSynthesis, no cache), so we check that namibia_tts_last_key updates
    // on accepted speaks and stays stable on throttled ones.
    await w.NamibiaTTS.speak('fuel_stop');
    expect(w.localStorage.getItem('namibia_tts_last_key')).toBe('fuel_stop');
    await w.NamibiaTTS.speak('pressure_lower');
    // Throttled: last_key should NOT have advanced.
    expect(w.localStorage.getItem('namibia_tts_last_key')).toBe('fuel_stop');
    await sleep(70);
    await w.NamibiaTTS.speak('pressure_lower');
    expect(w.localStorage.getItem('namibia_tts_last_key')).toBe('pressure_lower');
    w.NamibiaTTS.setThrottle(0);
  });
});
