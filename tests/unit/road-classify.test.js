// tests/unit/road-classify.test.js
// v22's road classifier should map Namibian road codes to the correct surface
// type so the rain/condition copy is right.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

let V22;
beforeAll(async () => {
  const dom = await bootPwa();
  V22 = dom.window.NamibiaV22;
});

describe('v22 classifyRoad', () => {
  const cases = [
    ['Turn left onto B1 toward Rehoboth', 'paved', 'B1'],
    ['Continue onto C24 toward Solitaire', 'gravel', 'C24'],
    ['Take D707 toward Sesriem', 'unpaved', 'D707'],
    ['Merge onto M5 in Windhoek', 'paved', 'M5'],
    ['Drive on sand to Deadvlei parking', 'sand', 'sand'],
    ['Deflate tyres at this point', 'sand', 'sand'],
    ['Head west on Independence Ave', 'mixed', 'mixed']
  ];
  for (const [instr, type, code] of cases) {
    it(`classifies "${instr}" as ${type}/${code}`, () => {
      const r = V22.classifyRoad(instr);
      expect(r.type).toBe(type);
      expect(r.code).toBe(code);
    });
  }
});

describe('v22 heatherWhy', () => {
  it('yes + paved produces a comfort-zone explanation', () => {
    const r = V22.heatherWhy('yes', { type: 'paved', code: 'B1' }, 'paved test');
    expect(r).toMatch(/Heather OK/);
    expect(r).toMatch(/paved/i);
  });
  it('no + sand produces a 4x4-technique explanation', () => {
    const r = V22.heatherWhy('no', { type: 'sand', code: 'sand' }, '');
    expect(r).toMatch(/David drives/);
    expect(r).toMatch(/sand|4x4/i);
  });
  it('maybe + gravel produces a conditional explanation', () => {
    const r = V22.heatherWhy('maybe', { type: 'gravel', code: 'C14' }, 'some reason');
    expect(r).toMatch(/maybe/);
    expect(r).toMatch(/gravel|short calm/i);
    expect(r).toMatch(/Source note: some reason/);
  });
});

describe('v22 rain impact + road detail tables', () => {
  it('has rain impact for every road type', () => {
    for (const t of ['paved', 'gravel', 'unpaved', 'sand', 'urban', 'mixed']) {
      expect(typeof V22.RAIN_IMPACT[t]).toBe('string');
      expect(V22.RAIN_IMPACT[t].length).toBeGreaterThan(10);
    }
  });
  it('has road detail for every road type', () => {
    for (const t of ['paved', 'gravel', 'unpaved', 'sand', 'urban', 'mixed']) {
      expect(typeof V22.ROAD_DETAIL[t]).toBe('string');
      expect(V22.ROAD_DETAIL[t].length).toBeGreaterThan(10);
    }
  });
});
