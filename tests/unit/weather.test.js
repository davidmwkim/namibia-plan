// tests/unit/weather.test.js
import { describe, it, expect } from 'vitest';
import W from '../../lib/weather.js';

describe('weather.emojiForCode + labelForCode', () => {
  it('clear sky = ☀️ / Clear', () => {
    expect(W.emojiForCode(0)).toBe('☀️');
    expect(W.labelForCode(0)).toBe('Clear');
  });
  it('fog = 🌫️', () => {
    expect(W.emojiForCode(45)).toBe('🌫️');
    expect(W.labelForCode(48)).toBe('Freezing fog');
  });
  it('rain codes get the rain emoji', () => {
    expect(W.emojiForCode(63)).toBe('🌧️');
    expect(W.labelForCode(63)).toBe('Rain');
  });
  it('thunderstorm = ⛈️', () => {
    expect(W.emojiForCode(95)).toBe('⛈️');
    expect(W.labelForCode(96)).toBe('Thunderstorm with hail');
  });
});

describe('weather.isRainy', () => {
  it('flags drizzle/rain/showers/thunderstorm as rainy', () => {
    expect(W.isRainy(51)).toBe(true);
    expect(W.isRainy(63)).toBe(true);
    expect(W.isRainy(80)).toBe(true);
    expect(W.isRainy(95)).toBe(true);
  });
  it('does not flag clear / cloudy as rainy', () => {
    expect(W.isRainy(0)).toBe(false);
    expect(W.isRainy(2)).toBe(false);
    expect(W.isRainy(45)).toBe(false);
  });
});

describe('weather.weatherAtLocalIso', () => {
  const fixture = {
    hourly: {
      time: ['2026-05-24T08:00', '2026-05-24T09:00', '2026-05-24T10:00'],
      temperature_2m: [12, 16, 22],
      precipitation: [0, 0, 0.2],
      wind_speed_10m: [5, 7, 12],
      weather_code: [0, 1, 63]
    }
  };
  it('looks up the exact local hour', () => {
    const w = W.weatherAtLocalIso(fixture, '2026-05-24T09:00');
    expect(w.tempC).toBe(16);
    expect(w.code).toBe(1);
    expect(w.emoji).toBe('🌤️');
    expect(w.label).toBe('Mostly clear');
  });
  it('returns null for an unknown hour', () => {
    expect(W.weatherAtLocalIso(fixture, '2026-05-24T13:00')).toBe(null);
  });
  it('marks rainy entries', () => {
    const w = W.weatherAtLocalIso(fixture, '2026-05-24T10:00');
    expect(w.rainy).toBe(true);
  });
});

describe('weather.cacheKey', () => {
  it('rounds lat/lng to 1 decimal so nearby fetches share a cache', () => {
    // Same 0.1° bucket → identical key.
    expect(W.cacheKey('2026-05-24', -22.52, 17.08))
      .toBe(W.cacheKey('2026-05-24', -22.54, 17.10));
    // Different 0.1° bucket → different key.
    expect(W.cacheKey('2026-05-24', -22.52, 17.08))
      .not.toBe(W.cacheKey('2026-05-24', -22.95, 17.08));
  });
});
