// tests/helpers/swipe.js — pointer-sequence helpers for Playwright. The v47
// Tinder-stack relies on real pointer events (pointerdown/move/up); page.click
// or page.mouse.down don't reliably reproduce the touch-style swipe Chromium
// expects, so these dispatch synthetic events with isPrimary + pointerType.

async function swipe(page, selector, dxPercent, dyPercent) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`swipe: no bounding box for ${selector}`);
  const startX = Math.round(box.x + box.width / 2);
  const startY = Math.round(box.y + box.height / 2);
  const endX = Math.round(startX + box.width * (dxPercent / 100));
  const endY = Math.round(startY + box.height * ((dyPercent || 0) / 100));
  await page.evaluate(({ sel, sx, sy, ex, ey }) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('swipe: selector miss ' + sel);
    function fire(type, x, y, t) {
      const ev = new PointerEvent(type, {
        pointerId: 1, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: y, bubbles: true, cancelable: true,
        button: 0, buttons: type === 'pointerup' ? 0 : 1
      });
      Object.defineProperty(ev, 'timeStamp', { value: t });
      el.dispatchEvent(ev);
    }
    const t0 = performance.now();
    fire('pointerdown', sx, sy, t0);
    // 6 interpolated moves over 120 ms so the velocity calc has data.
    for (let i = 1; i <= 6; i++) {
      const f = i / 6;
      fire('pointermove', Math.round(sx + (ex - sx) * f), Math.round(sy + (ey - sy) * f), t0 + i * 20);
    }
    fire('pointerup', ex, ey, t0 + 130);
  }, { sel: selector, sx: startX, sy: startY, ex: endX, ey: endY });
  await page.waitForTimeout(280); // let RAF + transition settle
}

async function longPress(page, selector, ms = 600) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`longPress: no bounding box for ${selector}`);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.evaluate(({ sel, x, y }) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('longPress: selector miss ' + sel);
    const ev = new PointerEvent('pointerdown', {
      pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
      button: 0, buttons: 1
    });
    el.dispatchEvent(ev);
  }, { sel: selector, x, y });
  await page.waitForTimeout(ms);
  await page.evaluate(({ sel, x, y }) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const ev = new PointerEvent('pointerup', {
      pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
      button: 0, buttons: 0
    });
    el.dispatchEvent(ev);
  }, { sel: selector, x, y });
  await page.waitForTimeout(80);
}

module.exports = { swipe, longPress };
