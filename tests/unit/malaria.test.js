// tests/unit/malaria.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

let V40;
beforeAll(async () => {
  const dom = await bootPwa();
  V40 = dom.window.NamibiaV40;
});

describe('NamibiaV40.malariaForDate', () => {
  it('no risk / no tablet outside the course (Day 2)', () => {
    const r = V40.malariaForDate('2026-05-24');
    expect(r.med).toBe(false); expect(r.zone).toBe(false); expect(r.phase).toBe(null);
  });
  it('pre-zone tablet day 1 (May 29, Day 7)', () => {
    const r = V40.malariaForDate('2026-05-29');
    expect(r.med).toBe(true); expect(r.zone).toBe(false); expect(r.phase).toBe('pre');
    expect(r.dayOfCourse).toBe(1); expect(r.totalCourse).toBe(13);
  });
  it('in-zone on entry + exit (May 31 / Jun 3)', () => {
    expect(V40.malariaForDate('2026-05-31').zone).toBe(true);
    expect(V40.malariaForDate('2026-05-31').phase).toBe('in');
    expect(V40.malariaForDate('2026-06-03').zone).toBe(true);
  });
  it('post-zone tablet (Jun 8) and last course day (Jun 10)', () => {
    const post = V40.malariaForDate('2026-06-08');
    expect(post.med).toBe(true); expect(post.zone).toBe(false); expect(post.phase).toBe('post');
    expect(V40.malariaForDate('2026-06-10').dayOfCourse).toBe(13);
    expect(V40.malariaForDate('2026-06-11').med).toBe(false); // course ended
  });
});

describe('NamibiaV40.reminderDateFor', () => {
  it('self-drive day → 30 min before the first drive (Day 9, 8:00 AM → 7:30 local)', () => {
    const d = V40.reminderDateFor('2026-05-31');
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(30);
  });
  it('guided day → 9:00 AM local (Day 10, no self-drive)', () => {
    const d = V40.reminderDateFor('2026-06-01');
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });
  it('post-trip date (no app day) → 9:00 AM local', () => {
    const d = V40.reminderDateFor('2026-06-08');
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });
});
