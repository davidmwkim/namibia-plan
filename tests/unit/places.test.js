// tests/unit/places.test.js
import { describe, it, expect } from 'vitest';
import P from '../../lib/places.js';

describe('places.shapePlaceForStop', () => {
  it('extracts the documented fields', () => {
    const stop = { name: 'Solitaire', lat: -23.89, lng: 16.00 };
    const details = {
      place_id: 'XYZ',
      formatted_address: 'Solitaire, Namibia',
      formatted_phone_number: '+264 63 290 671',
      rating: 4.3,
      user_ratings_total: 1234,
      website: 'https://solitaire.example',
      url: 'https://maps.google.com/?q=Solitaire',
      photos: [{ photo_reference: 'ABC123' }],
      opening_hours: { weekday_text: ['Monday: 7am-7pm', 'Tuesday: 7am-7pm'], open_now: true }
    };
    const shaped = P.shapePlaceForStop(stop, details);
    expect(shaped.formatted_address).toBe('Solitaire, Namibia');
    expect(shaped.formatted_phone_number).toBe('+264 63 290 671');
    expect(shaped.rating).toBe(4.3);
    expect(shaped.user_ratings_total).toBe(1234);
    expect(shaped.website).toBe('https://solitaire.example');
    expect(shaped.photoRef).toBe('ABC123');
    expect(shaped.open_now).toBe(true);
    expect(shaped.opening_hours.length).toBe(2);
  });
  it('returns null for null details', () => {
    expect(P.shapePlaceForStop({}, null)).toBe(null);
  });
});

describe('places.ratingChipLabel', () => {
  it('builds a star chip from rating + total', () => {
    expect(P.ratingChipLabel(4.3, 1234)).toMatch(/★★★★☆ 4\.3 \(1234\)/);
    expect(P.ratingChipLabel(5, 7)).toMatch(/★★★★★ 5\.0 \(7\)/);
    expect(P.ratingChipLabel(0, 0)).toMatch(/☆☆☆☆☆ 0\.0/);
  });
  it('returns null if rating missing', () => {
    expect(P.ratingChipLabel(null, 0)).toBe(null);
  });
});

describe('places.placePhotoUrl', () => {
  it('builds a Place Photo URL', () => {
    const u = P.placePhotoUrl('abc', 'KEY', 400);
    expect(u).toContain('photo_reference=abc');
    expect(u).toContain('maxwidth=400');
    expect(u).toContain('key=KEY');
  });
  it('returns null without ref or key', () => {
    expect(P.placePhotoUrl(null, 'KEY')).toBe(null);
    expect(P.placePhotoUrl('abc', null)).toBe(null);
  });
});

describe('places.templateSummary + effectiveSummary', () => {
  it('uses stop.summary when present', () => {
    const stop = { name: 'X', type: 'lodge', summary: 'Hand-crafted summary.' };
    expect(P.effectiveSummary(stop, null)).toBe('Hand-crafted summary.');
  });
  it('falls back to a templated string with rating', () => {
    const stop = { name: 'Solitaire Gas', type: 'fuel station' };
    const shaped = { rating: 4.3, user_ratings_total: 100, formatted_address: '1 Main St, Solitaire, Namibia' };
    const s = P.effectiveSummary(stop, shaped);
    expect(s).toMatch(/Solitaire Gas/);
    expect(s).toMatch(/fuel station/);
    expect(s).toMatch(/4\.3/);
  });
});

describe('places.cacheKey', () => {
  it('keys by name + 2dp lat/lng so the same physical place shares cache', () => {
    expect(P.cacheKey({ name: 'X', lat: -22.555, lng: 17.083 }))
      .toBe(P.cacheKey({ name: 'X', lat: -22.554, lng: 17.084 }));
    expect(P.cacheKey({ name: 'X', lat: -22.555, lng: 17.083 }))
      .not.toBe(P.cacheKey({ name: 'Y', lat: -22.555, lng: 17.083 }));
  });
});
