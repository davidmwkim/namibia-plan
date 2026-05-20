// tests/unit/heather-engine.test.js
import { describe, it, expect } from 'vitest';
import DC from '../../lib/driving-core.js';

const step = (instruction, lat, lng, duration, distance) => ({ instruction, lat, lng, duration, distance });

describe('rateStep (research-cautious rules)', () => {
  it('gravel → no (David takes gravel); firm dirt/sand → yes (Heather)', () => {
    expect(DC.rateStep(step('Turn onto C24 toward Solitaire', -23.6, 16.3)).status).toBe('no');   // gravel C-road → David
    expect(DC.rateStep(step('Continue on D1918', -21.9, 15.4)).status).toBe('yes');               // dirt D-road → Heather
    expect(DC.rateStep(step('Drive the deep sand to Deadvlei', -24.73, 15.34)).status).toBe('yes'); // sand → Heather
  });
  it('open paved B-road → maybe (yellow)', () => {
    expect(DC.rateStep(step('Continue on B1 toward Rehoboth', -23.0, 17.05)).status).toBe('maybe');
    expect(DC.rateStep(step('Merge onto B2', -22.6, 15.0)).status).toBe('maybe');
  });
  it('paved inside Windhoek red zone → no', () => {
    expect(DC.rateStep(step('Turn right onto Independence Ave', -22.57, 17.083)).status).toBe('no');
  });
  it('paved on the Sesriem park road green zone → yes', () => {
    expect(DC.rateStep(step('Continue on the park road', -24.601, 15.577)).status).toBe('yes');
  });
  it('codeless step inherits the previous surface/code', () => {
    const prev = DC.rateStep(step('Continue on C14', -23.9, 15.9));
    const next = DC.rateStep(step('Turn left', -23.8, 15.7), { surface: prev.surface, code: prev.code });
    expect(next.status).toBe('no'); // still gravel
  });
});

describe('heatherLegs', () => {
  // paved (B1) ×2, gravel (C24) ×3, paved (B1) ×2 — should yield maybe / no / maybe.
  const mk = (instr, lat, dur) => step(instr, lat, 17.0, dur, '10 km');
  const route = {
    overviewPath: Array.from({ length: 21 }, (_, i) => ({ lat: -22.6 - i * 0.05, lng: 17.0 })),
    legs: [{ steps: [
      mk('Continue on B1', -22.65, '20 mins'),
      mk('Continue on B1', -22.75, '20 mins'),
      mk('Turn onto C24', -22.95, '30 mins'),
      mk('Continue on C24', -23.20, '30 mins'),
      mk('Continue on C24', -23.45, '30 mins'),
      mk('Merge onto B1', -23.70, '20 mins'),
      mk('Continue on B1', -23.90, '20 mins')
    ] }]
  };
  it('groups contiguous same-status steps and sums Google time', () => {
    const legs = DC.heatherLegs(route);
    expect(legs.map(l => l.status)).toEqual(['maybe', 'no', 'maybe']);
    expect(legs[0].durMin).toBe(40);
    expect(legs[1].durMin).toBe(90);
    expect(legs[2].durMin).toBe(40);
    expect(legs[1].surface).toBe('gravel');
  });
  it('t0Frac/t1Frac are monotonic and cover [0,1]', () => {
    const legs = DC.heatherLegs(route);
    expect(legs[0].t0Frac).toBeCloseTo(0, 5);
    expect(legs[legs.length - 1].t1Frac).toBeCloseTo(1, 5);
    for (let i = 1; i < legs.length; i++) expect(legs[i].t0Frac).toBeGreaterThanOrEqual(legs[i - 1].t1Frac - 1e-9);
  });
  it('merges sub-2-min slivers into a neighbour', () => {
    const r2 = { overviewPath: route.overviewPath, legs: [{ steps: [
      mk('Continue on B1', -22.65, '40 mins'),
      mk('Turn onto C24', -22.75, '1 min'),     // sliver
      mk('Continue on B1', -22.85, '40 mins')
    ] }] };
    const legs = DC.heatherLegs(r2);
    expect(legs.length).toBe(1); // sliver absorbed
  });
});

describe('heatherSummary', () => {
  it('percentages are by time and sum to ~100', () => {
    const route = {
      overviewPath: Array.from({ length: 11 }, (_, i) => ({ lat: -22.6 - i * 0.05, lng: 17.0 })),
      legs: [{ steps: [
        step('Continue on B1', -22.65, 17.0, '60 mins', '100 km'),
        step('Turn onto C24', -23.0, 17.0, '60 mins', '50 km')
      ] }]
    };
    const s = DC.heatherSummary(route);
    expect(s.pctMaybeByTime + s.pctNoByTime + s.pctYesByTime).toBeGreaterThanOrEqual(99);
    expect(s.pctMaybeByTime).toBe(50);
    expect(s.pctNoByTime).toBe(50);
    expect(Math.round(s.totalMin)).toBe(120);
  });
});

describe('distAlongRouteToCard (monotonic, route-distance)', () => {
  const path = Array.from({ length: 51 }, (_, i) => ({ lat: -22.6 - i * 0.01, lng: 17.0 })); // ~due south
  const route = { overviewPath: path };
  const card = { lat: path[50].lat, lng: path[50].lng };
  it('decreases monotonically as GPS advances along the route', () => {
    let prev = Infinity;
    for (let i = 0; i <= 50; i += 5) {
      const d = DC.distAlongRouteToCard(route, path[i], card);
      expect(d).toBeLessThanOrEqual(prev + 1e-6);
      expect(d).toBeGreaterThanOrEqual(0);
      prev = d;
    }
  });
});

describe('legAtProgress', () => {
  it('returns the leg whose path range contains the GPS', () => {
    const route = {
      overviewPath: Array.from({ length: 21 }, (_, i) => ({ lat: -22.6 - i * 0.05, lng: 17.0 })),
      legs: [{ steps: [
        step('Continue on B1', -22.65, 17.0, '20 mins', '10 km'),
        step('Turn onto C24', -23.2, 17.0, '40 mins', '40 km')
      ] }]
    };
    const leg = DC.legAtProgress(route, { lat: -23.2, lng: 17.0 });
    expect(leg).toBeTruthy();
    expect(leg.status).toBe('no'); // on the gravel leg
  });
});
