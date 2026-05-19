// tests/unit/sun-times.test.js
import { describe, it, expect } from 'vitest';
import ST from '../../lib/sun-times.js';

describe('sun-times', () => {
  describe('sunriseSunsetUtc', () => {
    it('returns ~12 hours of daylight at the equator on the September equinox', () => {
      const { sunriseMs, sunsetMs } = ST.sunriseSunsetUtc(new Date('2026-09-23T00:00:00Z'), 0, 0);
      const dayLengthMin = (sunsetMs - sunriseMs) / 60000;
      // Atmospheric refraction makes the apparent day slightly longer than 12 h.
      expect(dayLengthMin).toBeGreaterThan(12 * 60 - 10);
      expect(dayLengthMin).toBeLessThan(12 * 60 + 15);
    });

    it('places solar noon at the midpoint of sunrise and sunset', () => {
      const { sunriseMs, sunsetMs, solarNoonMs } = ST.sunriseSunsetUtc(
        new Date('2026-05-25T00:00:00Z'), -22.55, 17.08
      );
      const mid = (sunriseMs + sunsetMs) / 2;
      // Within 5 minutes (refraction is symmetric, EoT corrections are tiny).
      expect(Math.abs(mid - solarNoonMs)).toBeLessThan(5 * 60000);
    });

    it('produces shorter days in southern winter than southern summer', () => {
      const winter = ST.sunriseSunsetUtc(new Date('2026-06-21T00:00:00Z'), -22.55, 17.08);
      const summer = ST.sunriseSunsetUtc(new Date('2026-12-21T00:00:00Z'), -22.55, 17.08);
      const winterLen = winter.sunsetMs - winter.sunriseMs;
      const summerLen = summer.sunsetMs - summer.sunriseMs;
      expect(winterLen).toBeLessThan(summerLen);
      // Windhoek winter day length ~10h25m, summer ~13h35m. 2.5h difference is the
      // rough magnitude — assert at least 2.5h to lock in seasonal correctness.
      expect((summerLen - winterLen) / 3600000).toBeGreaterThan(2.5);
    });

    it('places sunset on the trip dates in the late-afternoon local-time window', () => {
      // For Windhoek (~17°E, UTC+2) in late May, local sunset should be between
      // 17:30 and 18:30 CAT. Cross-checks the algorithm against well-known
      // afternoon-sunset behavior in southern-hemisphere autumn.
      const { sunsetMs } = ST.sunriseSunsetUtc(new Date('2026-05-25T00:00:00Z'), -22.55, 17.08);
      // Use 24-hour format to make math easy.
      const local = ST.formatTimeOfDay(sunsetMs, undefined, { fmt: '24' });
      const minutes = Number(local.slice(0, 2)) * 60 + Number(local.slice(3));
      expect(minutes).toBeGreaterThan(17 * 60 + 30);
      expect(minutes).toBeLessThan(18 * 60 + 30);
    });

    it('returns finite numbers for all locations on the trip range', () => {
      const start = new Date('2026-05-23T00:00:00Z').getTime();
      const oneDay = 86400000;
      for (let i = 0; i < 13; i++) {
        const d = new Date(start + i * oneDay);
        const { sunriseMs, sunsetMs, solarNoonMs } = ST.sunriseSunsetUtc(d, -22.5, 17.0);
        expect(Number.isFinite(sunriseMs)).toBe(true);
        expect(Number.isFinite(sunsetMs)).toBe(true);
        expect(Number.isFinite(solarNoonMs)).toBe(true);
        expect(sunsetMs).toBeGreaterThan(sunriseMs);
      }
    });
  });

  describe('parseDurationToMinutes', () => {
    it('parses common Google duration strings', () => {
      expect(ST.parseDurationToMinutes('15 mins')).toBe(15);
      expect(ST.parseDurationToMinutes('1 hour')).toBe(60);
      expect(ST.parseDurationToMinutes('1 hour 12 mins')).toBe(72);
      expect(ST.parseDurationToMinutes('2 hours 4 mins')).toBe(124);
      expect(ST.parseDurationToMinutes('1 min')).toBe(1);
      expect(ST.parseDurationToMinutes('')).toBe(0);
      expect(ST.parseDurationToMinutes(null)).toBe(0);
    });
  });

  describe('parseDistanceToMeters', () => {
    it('parses metric distance strings', () => {
      expect(ST.parseDistanceToMeters('187 km')).toBe(187000);
      expect(ST.parseDistanceToMeters('1.2 km')).toBe(1200);
      expect(ST.parseDistanceToMeters('850 m')).toBe(850);
      expect(ST.parseDistanceToMeters('1,234 km')).toBe(1234000);
    });
  });

  describe('etaFromCurrentStep', () => {
    const route = {
      legs: [{
        steps: [
          { duration: '15 mins', distance: '20 km' },
          { duration: '1 hour 12 mins', distance: '85 km' },
          { duration: '8 mins', distance: '10 km' }
        ]
      }]
    };
    it('sums remaining durations starting from current step', () => {
      const now = 1000;
      const eta = ST.etaFromCurrentStep(route, { legIdx: 0, stepIdx: 0, distToStepM: 0 }, now);
      expect(eta - now).toBe(95 * 60000);
    });
    it('prorates current step by distToStepM / step distance', () => {
      const now = 1000;
      const eta = ST.etaFromCurrentStep(route, { legIdx: 0, stepIdx: 1, distToStepM: 42500 }, now);
      const minutes = (eta - now) / 60000;
      expect(minutes).toBeCloseTo(72 - 36 + 8, 1);
    });
    it('returns nowMs when no route or empty legs', () => {
      expect(ST.etaFromCurrentStep(null, {}, 5000)).toBe(5000);
      expect(ST.etaFromCurrentStep({ legs: [] }, {}, 5000)).toBe(5000);
    });
  });

  describe('sunsetMargin', () => {
    const sunset = 17 * 3600000;
    it('returns safe when margin >= 60', () => {
      const eta = sunset - 90 * 60000;
      expect(ST.sunsetMargin(eta, sunset).severity).toBe('safe');
    });
    it('returns tight when 0 <= margin < 60', () => {
      const eta = sunset - 45 * 60000;
      expect(ST.sunsetMargin(eta, sunset).severity).toBe('tight');
    });
    it('returns risk when margin < 0', () => {
      const eta = sunset - 10 * 60000;
      expect(ST.sunsetMargin(eta, sunset).severity).toBe('risk');
    });
    it('honors custom bufferMin', () => {
      const eta = sunset - 5 * 60000;
      expect(ST.sunsetMargin(eta, sunset, 0).severity).toBe('tight');
      expect(ST.sunsetMargin(eta, sunset, 60).severity).toBe('risk');
    });
  });

  describe('formatTimeOfDay', () => {
    it('defaults to 12-hour H:MM AM/PM with Namibia UTC+2 offset', () => {
      // 15:34 UTC + 2h = 17:34 local = 5:34 PM
      const ms = Date.UTC(2026, 4, 25, 15, 34);
      expect(ST.formatTimeOfDay(ms)).toBe('5:34 PM');
    });
    it('formats AM and noon/midnight correctly', () => {
      expect(ST.formatTimeOfDay(Date.UTC(2026, 4, 25, 5, 0))).toBe('7:00 AM');
      expect(ST.formatTimeOfDay(Date.UTC(2026, 4, 25, 10, 30))).toBe('12:30 PM');  // 10:30 UTC + 2h = 12:30 local
      expect(ST.formatTimeOfDay(Date.UTC(2026, 4, 25, 22, 15))).toBe('12:15 AM'); // 22:15 UTC + 2h = 00:15 next day local
    });
    it('supports legacy 24-hour format via opts.fmt = "24"', () => {
      const ms = Date.UTC(2026, 4, 25, 15, 34);
      expect(ST.formatTimeOfDay(ms, undefined, { fmt: '24' })).toBe('17:34');
    });
    it('returns -- for NaN', () => {
      expect(ST.formatTimeOfDay(NaN)).toBe('--:--');
    });
  });

  describe('formatRelative', () => {
    it('formats hours and minutes', () => {
      expect(ST.formatRelative(72)).toBe('1h 12m');
      expect(ST.formatRelative(45)).toBe('45m');
      expect(ST.formatRelative(0)).toBe('0m');
    });
  });
});
