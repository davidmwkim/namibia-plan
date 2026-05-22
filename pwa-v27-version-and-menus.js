// Namibia PWA v27 — Version banner + best-effort menu PDF discovery.
//
//   * Reads `window.NAMIBIA_APP_VERSION` (set below) and renders it as a chip
//     button
//     in the hero status bar, so the user can verify which build they have
//     loaded — useful when chasing "is my SW serving stale code?" issues.
//   * On the Refresh button (v23), in addition to re-fetching routes + places,
//     attempts to discover and cache a menu URL for each business with a
//     `website` field. Probes a handful of common patterns
//     (`/menu`, `/menu.pdf`, `/our-menu`, `/menus`) in no-cors mode so the
//     opaque responses land in the SW cache; if any one of them happens to be
//     a real menu, it becomes offline-available. The card's "Menu" link still
//     points to the explicit `stop.menuUrl` if curated, else to the website.
//
// What this is NOT:
//   * A guarantee that menus are downloaded. Many restaurants don't publish
//     PDF menus, host them on social media, or block hot-linking.
//   * A scraper of Google Maps. We don't touch their UI.
// Version is single-sourced from sw.js (APP_VERSION). The active SW exposes
// it via a message reply; if the SW hasn't replied yet we display "loading…"
// and update once we hear back. This is the only place that reads the cache
// version, so we never have two version constants to keep in sync again.
window.NAMIBIA_APP_VERSION = null;

(function () {
  // Path A: ask the active service worker via MessageChannel. Works once the
  // SW has a controller (typically only on the SECOND page load — the first
  // load after a fresh install has registration but no controller yet).
  async function fetchVersionFromSW() {
    try {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active || navigator.serviceWorker.controller;
      if (!sw) return null;
      const channel = new MessageChannel();
      const reply = new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), 1500);
        channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      });
      sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
      return await reply;
    } catch (_) { return null; }
  }

  // Path B: fetch sw.js directly and regex out APP_VERSION. Always works on
  // first load, even before the SW is installed. We hit the network here
  // intentionally — that's the only way to learn the *latest* version when
  // the local SW hasn't activated yet.
  async function fetchVersionFromSwJs() {
    try {
      const res = await fetch('./sw.js', { cache: 'no-store' });
      if (!res.ok) return null;
      const txt = await res.text();
      const m = txt.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
      return m ? m[1] : null;
    } catch (_) { return null; }
  }

  async function resolveVersion() {
    // Try the live SW first (instant when available); fall back to fetching sw.js.
    return (await fetchVersionFromSW()) || (await fetchVersionFromSwJs()) || 'unknown';
  }

  function setVersion(v) {
    window.NAMIBIA_APP_VERSION = v;
    const chip = document.getElementById('appVersionChip');
    if (chip) updateVersionButton(chip, v);
  }

  function versionButtonText(v) {
    return '⟳ ' + (v || 'loading…');
  }

  function updateVersionButton(chip, v) {
    chip.textContent = versionButtonText(v);
    chip.setAttribute('aria-label', `Force refresh app version ${v || 'loading'}`);
  }

  function forceRefreshFromVersionChip(btn) {
    const version = window.NAMIBIA_APP_VERSION || 'loading…';
    if (window.NamibiaV29 && typeof window.NamibiaV29.forceUpdate === 'function') {
      return window.NamibiaV29.forceUpdate(btn, {
        updatingText: '⟳ Updating…',
        idleText: versionButtonText(version),
      });
    }
    window.location.reload();
    return null;
  }

  function versionChipHost() {
    return document.querySelector('.hero .hero-actions')
      || document.querySelector('.statusbar')
      || document.querySelector('.toolbar-left')
      || document.querySelector('.hero-actions');
  }

  function injectVersionChip() {
    const bar = versionChipHost();
    if (!bar || document.getElementById('appVersionChip')) return;
    const chip = document.createElement('button');
    const darkHost = !bar.classList.contains('statusbar') && !bar.closest('.hero');
    chip.className = darkHost ? 'chip version-chip dark' : 'chip version-chip';
    chip.id = 'appVersionChip';
    chip.type = 'button';
    chip.title = 'Force-refresh the app and fetch the latest PWA build.';
    chip.onclick = () => forceRefreshFromVersionChip(chip);
    updateVersionButton(chip, window.NAMIBIA_APP_VERSION);
    bar.appendChild(chip);
  }

  resolveVersion().then(v => setVersion(v));
  // Also re-resolve once the SW takes control (e.g. after force-update reload).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      resolveVersion().then(v => setVersion(v));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectVersionChip);
  else injectVersionChip();
  // Hero may re-render via render() — re-inject if needed.
  if (typeof render === 'function') {
    const base = render;
    render = function patchedRenderV27() {
      const r = base();
      injectVersionChip();
      return r;
    };
  }

  // ---- Menu discovery ----
  const MENU_PATHS = [
    'menu', 'menu.pdf', 'menus', 'menus.pdf', 'our-menu', 'our-menu.pdf',
    'food-menu', 'food-menu.pdf', 'drinks-menu', 'drinks-menu.pdf',
    'wp-content/uploads/menu.pdf', 'documents/menu.pdf'
  ];

  function probeCandidatesFromWebsite(website) {
    if (!website) return [];
    let base;
    try {
      const u = new URL(website);
      base = u.protocol + '//' + u.host;
    } catch (_) { return []; }
    return MENU_PATHS.map(p => base + '/' + p);
  }

  async function probeAndCache(urls) {
    if (!('caches' in window)) return { attempted: 0, cached: 0 };
    let cached = 0;
    await Promise.allSettled(urls.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        // Opaque response — we can't introspect status, but if it didn't reject,
        // the SW will have cached it via our cross-origin allow-list (which
        // intentionally doesn't cover arbitrary domains — so this no-op caches
        // via the page's own fetch instead via cache.put).
        const c = await caches.open('namibia-trip-menus-v1');
        await c.put(url, res.clone()).catch(() => {});
        cached++;
      } catch (_) {}
    }));
    return { attempted: urls.length, cached };
  }

  async function runMenuDiscovery() {
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    const probedUrls = [];
    for (const d of days) for (const s of (d.stops || [])) {
      // Explicit curated menu URL wins.
      if (s.menuUrl) {
        probedUrls.push(s.menuUrl);
        continue;
      }
      // Pull website from cached Places enrichment.
      const cacheKey = window.NamibiaPlaces && window.NamibiaPlaces.cacheKey(s);
      if (!cacheKey) continue;
      const raw = localStorage.getItem(cacheKey);
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        if (obj?.website) probedUrls.push(...probeCandidatesFromWebsite(obj.website));
      } catch (_) {}
    }
    if (typeof log === 'function') log(`Menu discovery: probing ${probedUrls.length} candidate URLs (no-cors).`);
    const r = await probeAndCache(probedUrls);
    if (typeof log === 'function') log(`Menu discovery complete: ${r.cached}/${r.attempted} requests cached.`);
    return r;
  }

  // Hook into the existing Refresh button so menu discovery runs at the end.
  function wireRefreshHookV27() {
    const btn = document.getElementById('refreshLive');
    if (!btn || btn.dataset.v27Wired === '1') return;
    btn.dataset.v27Wired = '1';
    const original = btn.onclick;
    btn.onclick = async function () {
      if (typeof original === 'function') await original.call(this);
      try { await runMenuDiscovery(); } catch (_) {}
    };
  }
  window.NamibiaUI.afterRenderTab(function () {
    try { wireRefreshHookV27(); } catch (_) {}
  });
  // Also wire on first paint and on a brief delay (Places enrichment is async).
  setTimeout(wireRefreshHookV27, 1500);

  window.NamibiaV27 = {
    runMenuDiscovery, probeCandidatesFromWebsite,
    MENU_PATHS, injectVersionChip, forceRefreshFromVersionChip
  };
})();
