// tests/golden/directions-snapshot.test.js
// DOM snapshots of the Directions tab for a frozen Day 2 fixture. Stable across
// runs because the fixture's stepMapUrl/streetViewUrl are inline data URIs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bootPwaWithRoute } from '../helpers/boot-pwa.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const day2 = JSON.parse(readFileSync(resolve(ROOT, 'tests/__fixtures__/day2-route.json'), 'utf8'));

function normalize(html) {
  // Strip noisy attributes that change per-run (timestamps, dynamic ids).
  return html
    .replace(/\s+/g, ' ')
    .replace(/cardId=\\?\"[^\"]+\\?\"/g, 'cardId="*"')
    .replace(/data-card-id=\\?\"[^\"]+\\?\"/g, 'data-card-id="*"')
    .trim();
}

describe('Directions tab golden', () => {
  it('matches snapshot for Day 2 fixture', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.state.activeTab = 'directions';
    w.renderTab();
    // v45 transforms .directions into a .pass-shell (central map + swipe deck).
    const html = w.document.querySelector('.pass-shell').outerHTML;
    expect(normalize(html)).toMatchSnapshot();
  });
});

describe('Driving Dashboard golden', () => {
  it('matches snapshot at start of route (GPS at step 0)', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.__namibiaSpoofClock(Date.parse('2026-05-24T08:00:00+02:00'));
    w.state.activeTab = 'street';
    w.__namibiaSpoofGps({ lat: -22.5588, lng: 17.0832 });
    w.renderTab();
    const html = w.document.querySelector('.drive-dashboard').outerHTML;
    expect(normalize(html)).toMatchSnapshot();
  });

  it('matches snapshot mid-leg (fuel/pressure region near Rehoboth)', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.__namibiaSpoofClock(Date.parse('2026-05-24T10:00:00+02:00'));
    w.state.activeTab = 'street';
    w.__namibiaSpoofGps({ lat: -23.3197, lng: 17.0834 });
    w.renderTab();
    const html = w.document.querySelector('.drive-dashboard').outerHTML;
    expect(normalize(html)).toMatchSnapshot();
  });

  it('matches snapshot at arrival', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.__namibiaSpoofClock(Date.parse('2026-05-24T13:00:00+02:00'));
    w.state.activeTab = 'street';
    w.__namibiaSpoofGps({ lat: -23.8919, lng: 16.0028 });
    w.renderTab();
    const html = w.document.querySelector('.drive-dashboard').outerHTML;
    expect(normalize(html)).toMatchSnapshot();
  });
});
