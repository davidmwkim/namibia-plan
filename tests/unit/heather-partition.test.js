// tests/unit/heather-partition.test.js
// Exercises v19's partitionPath via the JSDOM boot helper.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

let V19;
beforeAll(async () => {
  const dom = await bootPwa();
  V19 = dom.window.NamibiaV19;
});

describe('v19 partitionPath', () => {
  const path = [
    { lat: -22.55, lng: 17.08 }, // Windhoek
    { lat: -22.80, lng: 17.10 },
    { lat: -23.10, lng: 17.05 },
    { lat: -23.40, lng: 16.80 },
    { lat: -23.70, lng: 16.40 },
    { lat: -23.89, lng: 16.00 }  // Solitaire
  ];

  it('returns a single "no" segment when day has no heatherDriveSegments', () => {
    const day = {
      stops: [{name: 'Windhoek', lat: -22.55, lng: 17.08, routeRole: 'mandatory'}, {name: 'Solitaire', lat: -23.89, lng: 16.00, routeRole: 'mandatory'}],
      heatherDriveSegments: []
    };
    const parts = V19.partitionPath(path, day);
    expect(parts.length).toBe(1);
    expect(parts[0].status).toBe('no');
    expect(parts[0].fromIdx).toBe(0);
    expect(parts[0].toIdx).toBe(path.length - 1);
  });

  it('anchors a Heather segment to matching stops and fills gaps with "no"', () => {
    const day = {
      stops: [
        {name: 'Windhoek', lat: -22.55, lng: 17.08, routeRole: 'mandatory'},
        {name: 'Solitaire', lat: -23.89, lng: 16.00, routeRole: 'mandatory'}
      ],
      heatherDriveSegments: [{
        status: 'can_drive', label: 'Heather OK', from: 'Windhoek', to: 'Solitaire',
        reason: 'paved test'
      }]
    };
    const parts = V19.partitionPath(path, day);
    expect(parts.some(p => p.status === 'yes')).toBe(true);
    // First part should be the matched "yes" segment.
    const yesPart = parts.find(p => p.status === 'yes');
    expect(yesPart.fromIdx).toBe(0);
    expect(yesPart.toIdx).toBe(path.length - 1);
  });

  it('classifies "partial" segments as "maybe"', () => {
    const day = {
      stops: [
        {name: 'Windhoek', lat: -22.55, lng: 17.08, routeRole: 'mandatory'},
        {name: 'Solitaire', lat: -23.89, lng: 16.00, routeRole: 'mandatory'}
      ],
      heatherDriveSegments: [{
        status: 'partial', label: 'maybe', from: 'Windhoek', to: 'Solitaire', reason: ''
      }]
    };
    const parts = V19.partitionPath(path, day);
    expect(parts.some(p => p.status === 'maybe')).toBe(true);
  });

  it('returns [] for empty / null path', () => {
    expect(V19.partitionPath([], { stops: [] })).toEqual([]);
    expect(V19.partitionPath(null, { stops: [] })).toEqual([]);
  });
});
