// Namibia PWA v29 — Force-update button.
//
// PWAs cache aggressively, and Chrome Android has no built-in "hard reload".
// This button does the right thing every time:
//
//   1. Trigger a service-worker `update()` check.
//   2. If a new SW is already waiting → skipWaiting() + reload (the polite
//      path that preserves localStorage).
//   3. Otherwise → unregister all SWs + delete all caches + reload with a
//      cache-busting query param (the "nuclear" path).
//
// Sits next to the 🔄 Refresh button in the toolbar so it's discoverable.
(function () {
  async function pollForWaiting(reg, ms = 1500) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (reg.waiting) return reg.waiting;
      await new Promise(r => setTimeout(r, 100));
    }
    return reg.waiting || null;
  }

  async function forceUpdate(btn) {
    const setBtn = (txt, disabled) => {
      if (!btn) return;
      btn.textContent = txt;
      btn.disabled = !!disabled;
    };
    setBtn('🔃 Updating…', true);
    try {
      const polite = await tryPoliteUpdate();
      if (polite) return; // page will reload
      await nukeAndReload();
    } catch (e) {
      if (typeof log === 'function') log('Force-update failed: ' + (e?.message || e));
      setBtn('🔃 Force update', false);
    }
  }

  async function tryPoliteUpdate() {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    try { await reg.update(); } catch (_) {}
    const waiting = await pollForWaiting(reg, 2000);
    if (!waiting) return false;
    // Set a one-shot listener so we reload as soon as the new SW takes over.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Safety: if controllerchange doesn't fire within 4s, reload anyway.
    setTimeout(() => window.location.reload(), 4000);
    return true;
  }

  async function nukeAndReload() {
    // Unregister every SW.
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      } catch (_) {}
    }
    // Delete every cache (app shell, static maps, street view, tts, weather).
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      } catch (_) {}
    }
    // Reload with a cache-busting query so the HTML itself is re-fetched
    // (bypasses Chrome's HTTP cache for the navigation request).
    const url = new URL(window.location.href);
    url.searchParams.set('_forceUpdate', String(Date.now()));
    window.location.replace(url.toString());
  }

  function injectButton() {
    // v38 moved config controls into the Settings tab; only inject into the
    // Settings host, never the main toolbar.
    const toolbar = document.getElementById('settingsControls');
    if (!toolbar || document.getElementById('forceUpdateBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'forceUpdateBtn';
    btn.className = 'ghost';
    btn.title = 'Force-reload the PWA — fetches the latest service-worker code and clears all caches. Use this when you suspect Chrome is serving a stale build.';
    btn.textContent = '🔃 Force update';
    btn.onclick = () => forceUpdate(btn);
    // Insert before the existing Refresh button if present, so the two
    // refresh-y buttons sit together.
    const ref = document.getElementById('refreshLive');
    if (ref) ref.parentElement.insertBefore(btn, ref);
    else toolbar.appendChild(btn);
  }

  if (typeof render === 'function') {
    const base = render;
    render = function patchedRenderV29() {
      const r = base();
      try { injectButton(); } catch (_) {}
      return r;
    };
  }
  // Also inject on initial load + a brief delay (toolbar paints quickly).
  injectButton();
  setTimeout(injectButton, 1000);

  window.NamibiaV29 = { forceUpdate, nukeAndReload, tryPoliteUpdate };
})();
