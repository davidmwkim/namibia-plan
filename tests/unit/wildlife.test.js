// tests/unit/wildlife.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

let V42;
beforeAll(async () => {
  const dom = await bootPwa();
  V42 = dom.window.NamibiaV42;
});

describe('NamibiaV42 wildlife no-exit zone', () => {
  it('flags the Etosha leg (Days 9–12, May 31 – Jun 3)', () => {
    expect(V42.inZone('2026-05-31')).toBe(true); // Day 9 entry (King Nehale)
    expect(V42.inZone('2026-06-01')).toBe(true); // Day 10 game drives
    expect(V42.inZone('2026-06-03')).toBe(true); // Day 12 exit
  });
  it('does NOT flag the desert/coast/granite days (safe to walk)', () => {
    expect(V42.inZone('2026-05-25')).toBe(false); // Sossusvlei
    expect(V42.inZone('2026-05-28')).toBe(false); // Swakopmund
    expect(V42.inZone('2026-05-30')).toBe(false); // Spitzkoppe
    expect(V42.inZone('2026-06-04')).toBe(false); // back in Windhoek
  });
  it('exposes the stay-in-vehicle rules + fenced safe camps', () => {
    expect(V42.WL.rules.length).toBeGreaterThan(0);
    expect(V42.WL.safeCamps).toContain('Okaukuejo');
    expect(V42.cardHtml({ date: '2026-06-01' })).toMatch(/stay in your vehicle/i);
    expect(V42.cardHtml({ date: '2026-05-25' })).toBe(''); // no card off-zone
  });
});
