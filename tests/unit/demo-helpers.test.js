// tests/unit/demo-helpers.test.js
// Pure-function tests for the v15 demo helpers. The patch file uses an IIFE
// (no module exports), so we boot it once via JSDOM and pull off window.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

let Demo;
beforeAll(async () => {
  const dom = await bootPwa();
  Demo = dom.window.NamibiaDemo;
});

describe('NamibiaDemo.interpPolyline', () => {
  it('returns the first point at t=0', () => {
    const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
    expect(Demo.interpPolyline(path, 0)).toEqual({ lat: 0, lng: 0 });
  });
  it('returns the last point at t=1', () => {
    const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
    expect(Demo.interpPolyline(path, 1)).toEqual({ lat: 0, lng: 1 });
  });
  it('returns the midpoint at t=0.5 for a uniform segment', () => {
    const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
    const p = Demo.interpPolyline(path, 0.5);
    expect(p.lat).toBeCloseTo(0, 5);
    expect(p.lng).toBeCloseTo(0.5, 5);
  });
  it('weights segments by their physical length', () => {
    // Segment A is 1° wide; B is 0.01° wide. At t=0.5, we should be deep into A.
    const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 1.01 }];
    const p = Demo.interpPolyline(path, 0.5);
    expect(p.lng).toBeGreaterThan(0.4);
    expect(p.lng).toBeLessThan(0.6);
  });
  it('clamps t outside [0,1]', () => {
    const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
    expect(Demo.interpPolyline(path, -5)).toEqual({ lat: 0, lng: 0 });
    expect(Demo.interpPolyline(path, 99)).toEqual({ lat: 0, lng: 1 });
  });
  it('returns null for empty path', () => {
    expect(Demo.interpPolyline([], 0.5)).toBe(null);
  });
});

describe('NamibiaDemo.generateNoiseSeries', () => {
  it('produces N samples starting at 0', () => {
    const series = Demo.generateNoiseSeries(10, 2);
    expect(series.length).toBe(10);
    expect(series[0]).toBe(0);
  });
  it('clamps to ±maxHours*60 minutes', () => {
    // Deterministic RNG that always pushes the maximum step.
    let i = 0;
    const rng = () => (i++ % 2 === 0 ? 1 : 1); // always +15 min step
    const series = Demo.generateNoiseSeries(100, 1, rng);
    expect(Math.max(...series)).toBeLessThanOrEqual(60);
    expect(Math.min(...series)).toBeGreaterThanOrEqual(-60);
  });
});

describe('NamibiaDemo.sampleNoise', () => {
  it('returns the first value at t=0 and last at t=1', () => {
    const series = [0, 30, -10, 5];
    expect(Demo.sampleNoise(series, 0)).toBe(0);
    expect(Demo.sampleNoise(series, 1)).toBe(5);
  });
  it('interpolates linearly between samples', () => {
    const series = [0, 60];
    expect(Demo.sampleNoise(series, 0.25)).toBeCloseTo(15, 5);
  });
  it('returns 0 for empty series', () => {
    expect(Demo.sampleNoise([], 0.5)).toBe(0);
  });
});

describe('NamibiaDemo.cardCursor', () => {
  const cards = Array.from({ length: 6 }, (_, i) => ({ lat: i, lng: 0 }));
  it('is monotonic and visits EVERY card index across the demo', () => {
    const visited = new Set();
    let last = -1, monotonic = true;
    for (let i = 0; i <= 600; i++) {
      const c = Demo.cardCursor(cards, i / 600);
      visited.add(c.idx);
      if (c.idx < last) monotonic = false;
      last = c.idx;
    }
    expect(monotonic).toBe(true);
    expect(visited.size).toBe(cards.length); // no skipped turns
    expect(Math.max(...visited)).toBe(cards.length - 1);
  });
  it('starts at the first card and ends at the last', () => {
    expect(Demo.cardCursor(cards, 0).idx).toBe(0);
    expect(Demo.cardCursor(cards, 1).idx).toBe(cards.length - 1);
  });
  it('places the GPS pin between the active card and the next', () => {
    const c = Demo.cardCursor(cards, 0.5); // mid-demo
    expect(c.pos).not.toBe(null);
    expect(c.pos.lat).toBeGreaterThanOrEqual(0);
    expect(c.pos.lat).toBeLessThanOrEqual(cards.length - 1);
  });
  it('handles empty card list', () => {
    expect(Demo.cardCursor([], 0.5)).toEqual({ idx: -1, pos: null });
  });
});

describe('NamibiaDemo.buildDrivePath', () => {
  it('builds one vertex per step plus the final destination', () => {
    const route = {
      legs: [{ steps: [
        { lat: 1, lng: 1 }, { lat: 2, lng: 2, endLat: 3, endLng: 3 }
      ] }],
      overviewPath: [{ lat: 0, lng: 0 }, { lat: 9, lng: 9 }]
    };
    const path = Demo.buildDrivePath(route);
    expect(path.length).toBe(3); // 2 step starts + final end
    expect(path[0]).toEqual({ lat: 1, lng: 1 });
    expect(path[2]).toEqual({ lat: 3, lng: 3 });
  });
  it('falls back to overviewPath when there are no steps', () => {
    const route = { legs: [], overviewPath: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] };
    expect(Demo.buildDrivePath(route)).toEqual(route.overviewPath);
  });
});

describe('NamibiaDemo.totalRouteMinutes', () => {
  it('sums all step durations across all legs', () => {
    const route = {
      legs: [
        { steps: [{ duration: '15 mins' }, { duration: '1 hour 12 mins' }] },
        { steps: [{ duration: '8 mins' }] }
      ]
    };
    expect(Demo.totalRouteMinutes(route)).toBe(15 + 72 + 8);
  });
  it('returns 0 for empty/missing route', () => {
    expect(Demo.totalRouteMinutes({})).toBe(0);
    expect(Demo.totalRouteMinutes(null)).toBe(0);
  });
});
