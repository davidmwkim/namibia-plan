// tests/unit/driving-core.test.js
import { describe, it, expect } from 'vitest';
import DC from '../../lib/driving-core.js';

const sampleRoute = {
  legs: [{
    steps: [
      { lat: -22.5588, lng: 17.0832, endLat: -22.5602, endLng: 17.0731 },
      { lat: -22.5602, lng: 17.0731, endLat: -23.3197, endLng: 17.0834 },
      { lat: -23.3197, lng: 17.0834, endLat: -23.8919, endLng: 16.0028 },
      { lat: -23.8919, lng: 16.0028, endLat: -23.8919, endLng: 16.0028 }
    ]
  }]
};

describe('driving-core', () => {
  describe('distMeters', () => {
    it('returns 0 for identical points', () => {
      expect(DC.distMeters({lat: -22, lng: 17}, {lat: -22, lng: 17})).toBe(0);
    });
    it('returns ~111 km for 1 degree of latitude', () => {
      const d = DC.distMeters({lat: 0, lng: 0}, {lat: 1, lng: 0});
      expect(d).toBeGreaterThan(110000);
      expect(d).toBeLessThan(112000);
    });
  });

  describe('bearing', () => {
    it('returns ~0 for due north', () => {
      const b = DC.bearing({lat: 0, lng: 0}, {lat: 1, lng: 0});
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(1);
    });
    it('returns ~90 for due east', () => {
      const b = DC.bearing({lat: 0, lng: 0}, {lat: 0, lng: 1});
      expect(b).toBeGreaterThan(89);
      expect(b).toBeLessThan(91);
    });
    it('returns ~180 for due south', () => {
      const b = DC.bearing({lat: 1, lng: 0}, {lat: 0, lng: 0});
      expect(b).toBeGreaterThan(179);
      expect(b).toBeLessThan(181);
    });
    it('returns ~270 for due west', () => {
      const b = DC.bearing({lat: 0, lng: 1}, {lat: 0, lng: 0});
      expect(b).toBeGreaterThan(269);
      expect(b).toBeLessThan(271);
    });
  });

  describe('bearingForStreetView', () => {
    it('returns the bearing from step to nextStep', () => {
      const b = DC.bearingForStreetView({lat: 0, lng: 0}, {lat: 0, lng: 1});
      expect(b).toBeGreaterThan(89);
      expect(b).toBeLessThan(91);
    });
    it('returns 0 when either input is missing', () => {
      expect(DC.bearingForStreetView(null, {lat: 0, lng: 1})).toBe(0);
      expect(DC.bearingForStreetView({lat: 0, lng: 0}, null)).toBe(0);
    });
  });

  describe('projectOntoSegment', () => {
    it('projects exactly on segment start → t=0', () => {
      const p = {lat: -22.5588, lng: 17.0832};
      const a = {lat: -22.5588, lng: 17.0832};
      const b = {lat: -22.5602, lng: 17.0731};
      const r = DC.projectOntoSegment(p, a, b);
      expect(r.t).toBe(0);
      expect(r.perpM).toBeLessThan(1);
    });
    it('projects at midpoint → t≈0.5', () => {
      const a = {lat: 0, lng: 0};
      const b = {lat: 0, lng: 1};
      const mid = {lat: 0, lng: 0.5};
      const r = DC.projectOntoSegment(mid, a, b);
      expect(r.t).toBeCloseTo(0.5, 2);
      expect(r.perpM).toBeLessThan(50);
    });
    it('measures perpendicular distance for off-line points', () => {
      const a = {lat: 0, lng: 0};
      const b = {lat: 0, lng: 1};
      // 0.01° lat off → ~1100m perpendicular
      const p = {lat: 0.01, lng: 0.5};
      const r = DC.projectOntoSegment(p, a, b);
      expect(r.perpM).toBeGreaterThan(1000);
      expect(r.perpM).toBeLessThan(1200);
    });
  });

  describe('findCurrentStep', () => {
    it('returns the closest segment for GPS exactly on a step', () => {
      const result = DC.findCurrentStep({lat: -22.5602, lng: 17.0731}, sampleRoute);
      expect(result.offRoute).not.toBe(true);
      // GPS at step 1's start = start of segment 1→2
      expect(result.legIdx).toBe(0);
      expect(result.stepIdx).toBe(1);
    });
    it('returns offRoute=true when far from any segment', () => {
      const result = DC.findCurrentStep({lat: 0, lng: 0}, sampleRoute);
      expect(result.offRoute).toBe(true);
    });
    it('computes distance-to-next-turn for a midpoint', () => {
      // Midpoint of step-0 → step-1 segment
      const result = DC.findCurrentStep({lat: -22.5595, lng: 17.0782}, sampleRoute);
      expect(result.offRoute).not.toBe(true);
      expect(result.distToNextTurnM).toBeGreaterThan(0);
    });
  });

  describe('relevantCards', () => {
    it('finds the nearest card index', () => {
      const route = {
        cards: [
          {lat: -22.5588, lng: 17.0832, kind: 'turn'},
          {lat: -22.5602, lng: 17.0731, kind: 'turn'},
          {lat: -23.3197, lng: 17.0834, kind: 'fuel'}
        ]
      };
      const r = DC.relevantCards({lat: -23.32, lng: 17.08}, route);
      expect(r.activeIndex).toBe(2);
    });
    it('returns -1 when no GPS', () => {
      const r = DC.relevantCards(null, {cards: [{lat: 0, lng: 0}]});
      expect(r.activeIndex).toBe(-1);
    });
  });

  describe('ttsTriggerThresholds', () => {
    it('fires 2km then 500m then 100m then arrive', () => {
      // No threshold yet at 2100m
      expect(DC.ttsTriggerThresholds(undefined, 2100, null)).toBe(null);
      // Cross into 2km at 1900m
      expect(DC.ttsTriggerThresholds(2100, 1900, null)).toBe('2km');
      // 600m → 400m crosses 500m
      expect(DC.ttsTriggerThresholds(600, 400, '2km')).toBe('500m');
      // 200m → 90m crosses 100m
      expect(DC.ttsTriggerThresholds(200, 90, '500m')).toBe('100m');
      // 50m → 25m crosses arrive
      expect(DC.ttsTriggerThresholds(50, 25, '100m')).toBe('arrive');
    });
    it('does not re-fire the same threshold', () => {
      expect(DC.ttsTriggerThresholds(450, 400, '500m')).toBe(null);
    });
  });

  describe('shouldAnnounceNow', () => {
    it('detects a crossing', () => {
      expect(DC.shouldAnnounceNow(600, 400, 500)).toBe(true);
    });
    it('returns false when both sides are on the same side', () => {
      expect(DC.shouldAnnounceNow(400, 200, 500)).toBe(false);
    });
  });
});
