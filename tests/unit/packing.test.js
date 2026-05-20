// tests/unit/packing.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

let V41, DATA;
beforeAll(async () => {
  const dom = await bootPwa();
  V41 = dom.window.NamibiaV41;
  DATA = dom.window.NAMIBIA_TRIP_DATA;
});

const dayByTitle = re => DATA.days.find(d => re.test(d.title));

describe('NamibiaV41.activitiesForDay', () => {
  it('detects the hot-air balloon on the balloon day', () => {
    const d = dayByTitle(/balloon/i);
    const keys = V41.activitiesForDay(d).map(a => a.key);
    expect(keys).toContain('balloon');
  });
  it('detects game drives on the Etosha game-drive days', () => {
    const d = DATA.days.find(x => (x.stops || []).some(s => /game drive/i.test(s.name || '')));
    const keys = V41.activitiesForDay(d).map(a => a.key);
    expect(keys).toContain('game_drive');
  });
  it('detects dune climbing on the Sossusvlei/Deadvlei day', () => {
    const d = dayByTitle(/sossusvlei|deadvlei/i);
    const keys = V41.activitiesForDay(d).map(a => a.key);
    expect(keys).toContain('dunes');
  });
  it('every activity carries researched gear with reasons', () => {
    for (const a of V41.ACTIVITIES) {
      expect(a.gear.length).toBeGreaterThan(0);
      for (const [item, why] of a.gear) { expect(item.length).toBeGreaterThan(0); expect(why.length).toBeGreaterThan(0); }
    }
  });
});

describe('NamibiaV41.layeringText', () => {
  it('calls for serious warmth on a freezing pre-dawn', () => {
    const t = V41.layeringText({ lowC: 3, highC: 24, maxWind: 10, rain: false });
    expect(t).toMatch(/freezing/i);
    expect(t).toMatch(/down|insulated/i);
    expect(t).toMatch(/swing/i); // 21° swing flagged
  });
  it('keeps the warm layer on a cool coastal day', () => {
    const t = V41.layeringText({ lowC: 11, highC: 17, maxWind: 30, rain: false });
    expect(t).toMatch(/cool all day|keep the warm layer/i);
    expect(t).toMatch(/wind/i);
  });
  it('flags rain when precip is expected', () => {
    expect(V41.layeringText({ lowC: 10, highC: 20, maxWind: 5, rain: true })).toMatch(/rain/i);
  });
});

describe('NamibiaV41.dayConditions', () => {
  it('falls back to seasonal climatology when no forecast is cached', () => {
    const d = dayByTitle(/sossusvlei|deadvlei/i);
    const c = V41.dayConditions(d);
    expect(c.source).toBe('seasonal');
    expect(typeof c.lowC).toBe('number');
    expect(c.highC).toBeGreaterThan(c.lowC);
  });
});
