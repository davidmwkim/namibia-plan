// tests/smoke/boot.test.js
// Boot in <5 sec with no API key and no cached routes — all 5 tabs render
// without throwing, no console.error.
import { describe, it, expect } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

describe('smoke', () => {
  it('boots cleanly with empty state', async () => {
    const errors = [];
    const dom = await bootPwa();
    const w = dom.window;
    const origError = w.console.error;
    w.console.error = (...a) => errors.push(a.map(String).join(' '));
    try {
      const tabs = ['overview', 'stops', 'directions', 'street', 'exports'];
      for (const t of tabs) {
        w.state.activeTab = t;
        w.renderTab();
        const tc = w.document.getElementById('tabContent');
        expect(tc).toBeTruthy();
        expect(tc.innerHTML).not.toBe('');
      }
    } finally {
      w.console.error = origError;
    }
    expect(errors).toEqual([]);
  });

  it('boots in under 5 seconds', async () => {
    const start = Date.now();
    await bootPwa();
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
