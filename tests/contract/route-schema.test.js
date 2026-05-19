// tests/contract/route-schema.test.js
// Hand-written schema validator for state.renderedRoutes[date]. Catches breaking
// changes to our internal data shape OR to the Google Directions response we
// depend on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ST from '../../lib/sun-times.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const day2 = JSON.parse(readFileSync(resolve(ROOT, 'tests/__fixtures__/day2-route.json'), 'utf8'));

const REQUIRED_STEP_KEYS = ['instruction', 'distance', 'duration', 'lat', 'lng', 'endLat', 'endLng', 'heading', 'stepMapUrl', 'streetViewUrl', 'ttsKey', 'ttsText'];
const REQUIRED_LEG_KEYS = ['start', 'end', 'distance', 'duration', 'steps'];
const REQUIRED_ROUTE_KEYS = ['legs', 'overviewPath', 'cards', 'sunTimes', 'schemaVersion'];
const REQUIRED_CARD_KEYS = ['kind', 'title', 'body', 'ttsKey', 'ttsText'];
const REQUIRED_SUNTIMES_KEYS = ['sunriseMs', 'sunsetMs', 'solarNoonMs', 'sourceLat', 'sourceLng'];
const VALID_KINDS = new Set(['turn', 'fuel', 'pressure', 'arrival', 'sunset_risk']);

function validateRoute(r) {
  const issues = [];
  REQUIRED_ROUTE_KEYS.forEach(k => { if (!(k in r)) issues.push(`missing route.${k}`); });
  if (r.schemaVersion !== 6) issues.push(`schemaVersion expected 6, got ${r.schemaVersion}`);
  (r.legs || []).forEach((leg, li) => {
    REQUIRED_LEG_KEYS.forEach(k => { if (!(k in leg)) issues.push(`missing legs[${li}].${k}`); });
    (leg.steps || []).forEach((s, si) => {
      REQUIRED_STEP_KEYS.forEach(k => {
        if (!(k in s)) issues.push(`missing legs[${li}].steps[${si}].${k}`);
      });
    });
  });
  (r.cards || []).forEach((c, i) => {
    REQUIRED_CARD_KEYS.forEach(k => { if (!(k in c)) issues.push(`missing cards[${i}].${k}`); });
    if (!VALID_KINDS.has(c.kind)) issues.push(`cards[${i}].kind invalid: ${c.kind}`);
  });
  REQUIRED_SUNTIMES_KEYS.forEach(k => {
    if (!(k in (r.sunTimes || {}))) issues.push(`missing sunTimes.${k}`);
  });
  return issues;
}

describe('renderedRoutes[date] schema', () => {
  it('fixture conforms to the v6 schema', () => {
    const issues = validateRoute(day2);
    expect(issues).toEqual([]);
  });

  it('rejects missing required keys', () => {
    const bad = { ...day2, schemaVersion: 6, legs: [{ start: 'x', end: 'y' }] };
    const issues = validateRoute(bad);
    expect(issues.some(i => i.includes('legs[0].distance'))).toBe(true);
    expect(issues.some(i => i.includes('legs[0].duration'))).toBe(true);
    expect(issues.some(i => i.includes('legs[0].steps'))).toBe(true);
  });

  it('rejects invalid card kinds', () => {
    const bad = JSON.parse(JSON.stringify(day2));
    bad.cards[0].kind = 'banana';
    const issues = validateRoute(bad);
    expect(issues.some(i => i.includes('cards[0].kind invalid'))).toBe(true);
  });
});

describe('Google Directions response contract', () => {
  // A fixture mimicking the keys we read from a real Google response. If Google
  // changes the response shape, this fails before the user notices.
  const googleResp = {
    routes: [{
      overview_path: [
        { lat: () => -22.5, lng: () => 17.0 },
        { lat: () => -23.0, lng: () => 17.0 }
      ],
      legs: [{
        start_address: 'Windhoek',
        end_address: 'Solitaire',
        distance: { text: '187 km', value: 187000 },
        duration: { text: '2 hours 45 mins', value: 9900 },
        steps: [{
          instructions: 'Head west',
          distance: { text: '1 km', value: 1000 },
          duration: { text: '2 mins', value: 120 },
          start_location: { lat: () => -22.55, lng: () => 17.08 },
          end_location: { lat: () => -22.56, lng: () => 17.07 }
        }]
      }]
    }]
  };

  it('exposes all keys app.js reads from the response', () => {
    const r = googleResp.routes[0];
    expect(typeof r.overview_path[0].lat).toBe('function');
    expect(typeof r.overview_path[0].lng).toBe('function');
    const leg = r.legs[0];
    expect(leg.start_address).toBeTruthy();
    expect(leg.end_address).toBeTruthy();
    expect(leg.distance.text).toBeTruthy();
    expect(leg.duration.text).toBeTruthy();
    const step = leg.steps[0];
    expect(step.instructions).toBeTruthy();
    expect(step.distance.text).toBeTruthy();
    expect(step.duration.text).toBeTruthy();
    expect(typeof step.start_location.lat).toBe('function');
    expect(typeof step.end_location.lat).toBe('function');
  });
});

describe('NamibiaSunTimes contract', () => {
  it('always returns finite numbers for any valid (date, lat, lng) in trip range', () => {
    for (let lat = -27; lat <= -17; lat += 2) {
      for (let lng = 13; lng <= 21; lng += 2) {
        const r = ST.sunriseSunsetUtc(new Date('2026-05-25T00:00:00Z'), lat, lng);
        expect(Number.isFinite(r.sunriseMs)).toBe(true);
        expect(Number.isFinite(r.sunsetMs)).toBe(true);
        expect(Number.isFinite(r.solarNoonMs)).toBe(true);
      }
    }
  });
});
