// tests/integration/print-extras.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bootPwaWithRoute } from '../helpers/boot-pwa.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const day2 = JSON.parse(readFileSync(resolve(ROOT, 'tests/__fixtures__/day2-route.json'), 'utf8'));

describe('Print extras (v16)', () => {
  it('injects sun-line and per-step thumbnails into the matching print-day', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.renderPrintPages();
    const days = w.NAMIBIA_TRIP_DATA.days;
    const dayIdx = days.findIndex(d => d.date === '2026-05-24');
    const article = w.document.querySelectorAll('#printPages .print-day')[dayIdx];
    expect(article).toBeTruthy();
    expect(article.querySelector('.print-sun-line')).toBeTruthy();
    // The fixture's stepMapUrl and streetViewUrl are data: URIs so the imgs render.
    expect(article.querySelectorAll('.print-step-thumbs img').length).toBeGreaterThan(0);
    expect(article.querySelector('.print-step-thumbs img.print-step-map')).toBeTruthy();
    expect(article.querySelector('.print-step-thumbs img.print-step-sv')).toBeTruthy();
  });

  it('does not duplicate thumbs on repeated renderPrintPages calls', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.renderPrintPages();
    w.renderPrintPages();
    w.renderPrintPages();
    const days = w.NAMIBIA_TRIP_DATA.days;
    const dayIdx = days.findIndex(d => d.date === '2026-05-24');
    const article = w.document.querySelectorAll('#printPages .print-day')[dayIdx];
    const steps = article.querySelectorAll('.print-directions ol li').length;
    const thumbs = article.querySelectorAll('.print-step-thumbs').length;
    expect(thumbs).toBe(steps);
  });

  it('shows OK / TIGHT / AT RISK label based on margin severity', async () => {
    const dom = await bootPwaWithRoute('2026-05-24', day2);
    const w = dom.window;
    w.renderPrintPages();
    const days = w.NAMIBIA_TRIP_DATA.days;
    const dayIdx = days.findIndex(d => d.date === '2026-05-24');
    const article = w.document.querySelectorAll('#printPages .print-day')[dayIdx];
    const sunLine = article.querySelector('.print-sun-line');
    expect(['OK', 'TIGHT', 'AT RISK'].some(label => sunLine.textContent.includes(label))).toBe(true);
  });
});
