// pwa-v48-version-pin.js — long-press the #appVersionChip to open a small
// dropdown listing every cached prior version (read from Cache Storage). Pick
// one → write to localStorage['namibia_version_pin'] and reload; the service
// worker honours that pin on subsequent fetches so the app boots that bundle.
// "Latest (auto-update)" clears the pin and resumes normal cache freshness.
(function () {
  const KEY = 'namibia_version_pin';
  const LONG_PRESS_MS = 500;
  const CACHE_PREFIX = 'namibia-trip-';

  function pinned() {
    const v = localStorage.getItem(KEY);
    return (v && v !== 'latest') ? v : null;
  }

  async function listCachedVersions() {
    try {
      if (!('caches' in window)) return [];
      const keys = await caches.keys();
      return keys.filter(k => k.indexOf(CACHE_PREFIX) === 0)
        .map(k => k.slice(CACHE_PREFIX.length))
        .filter(Boolean)
        .sort((a, b) => verCmp(b, a)); // descending
    } catch (_) { return []; }
  }
  function verCmp(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  function chip() { return document.getElementById('appVersionChip'); }

  function setPinned(version) {
    if (!version || version === 'latest') {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, version);
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'NAMIBIA_VERSION_PIN', version: version || null
        });
      } catch (_) {}
    }
    // Reload so the pinned version's cached bundle takes over. Some browsers
    // require a hard reload to bypass the BFCache.
    setTimeout(() => { try { location.reload(); } catch (_) {} }, 60);
  }

  function badgeChip() {
    const c = chip();
    if (!c) return;
    const v = pinned();
    c.classList.toggle('vpin-pinned', !!v);
    if (v) c.title = `Pinned to v${v}. Long-press to switch versions or return to Latest.`;
    else c.title = 'App version. Long-press to switch to a previously-installed version.';
  }

  let openMenu = null;
  function closeMenu() {
    if (openMenu) { try { openMenu.remove(); } catch (_) {} openMenu = null; }
    document.removeEventListener('pointerdown', onDocPointer, true);
    document.removeEventListener('keydown', onDocKey, true);
  }
  function onDocPointer(e) {
    if (openMenu && !openMenu.contains(e.target) && e.target !== chip()) closeMenu();
  }
  function onDocKey(e) {
    if (e.key === 'Escape') closeMenu();
  }

  async function openMenuAt(target) {
    closeMenu();
    const current = window.NAMIBIA_APP_VERSION || '';
    const versions = await listCachedVersions();
    // Always offer Latest + current first, then any additional cached.
    const items = [{ version: 'latest', label: 'Latest (auto-update)' }];
    if (current && !items.find(i => i.version === current)) {
      items.push({ version: current, label: 'v' + current, tag: 'current' });
    }
    versions.forEach(v => {
      if (!items.find(i => i.version === v)) {
        items.push({ version: v, label: 'v' + v, tag: 'cached' });
      }
    });

    const menu = document.createElement('div');
    menu.className = 'version-pin-dropdown';
    const head = document.createElement('div');
    head.className = 'vpin-head';
    head.textContent = 'Switch app version';
    menu.appendChild(head);
    const active = pinned();
    items.forEach(it => {
      const btn = document.createElement('button');
      btn.className = 'vpin-item';
      btn.type = 'button';
      btn.dataset.version = it.version;
      const isCurrent = (it.version === 'latest' && !active)
        || (it.version === active);
      if (isCurrent) btn.classList.add('vpin-current');
      btn.innerHTML = `<span class="vpin-label">${it.label}</span>`
        + (it.tag ? `<span class="vpin-tag">${it.tag}</span>` : '');
      btn.onclick = () => {
        closeMenu();
        setPinned(it.version);
      };
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    // Position below the chip; flip up if it would overflow.
    const r = target.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let top = r.bottom + 4 + window.scrollY;
    if (r.bottom + mh + 8 > window.innerHeight) {
      top = Math.max(8, r.top - mh - 4 + window.scrollY);
      menu.classList.add('vpin-up');
    }
    const right = Math.min(window.innerWidth - 8, r.right + window.scrollX);
    menu.style.top = top + 'px';
    menu.style.left = Math.max(8, right - mw) + 'px';

    openMenu = menu;
    setTimeout(() => {
      document.addEventListener('pointerdown', onDocPointer, true);
      document.addEventListener('keydown', onDocKey, true);
    }, 0);
  }

  function wire(target) {
    if (!target || target.dataset.vpinWired === '1') return;
    target.dataset.vpinWired = '1';
    let timer = null, startX = 0, startY = 0, fired = false;
    target.addEventListener('pointerdown', (e) => {
      fired = false;
      startX = e.clientX; startY = e.clientY;
      clearTimeout(timer);
      timer = setTimeout(() => { fired = true; openMenuAt(target); }, LONG_PRESS_MS);
    }, { passive: true });
    target.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) {
        clearTimeout(timer);
      }
    }, { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => {
      target.addEventListener(t, () => { clearTimeout(timer); }, { passive: true });
    });
    // Suppress the click that follows a long-press so it doesn't trigger the
    // chip's "force refresh" handler from v27.
    target.addEventListener('click', (e) => {
      if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; }
    }, true);
    // Desktop fallback: right-click opens the same menu.
    target.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenuAt(target);
    });
  }

  function tryWire() {
    const c = chip();
    if (c) { wire(c); badgeChip(); }
  }

  tryWire();
  if (window.NamibiaUI && window.NamibiaUI.afterRender) {
    window.NamibiaUI.afterRender(tryWire);
  }
  // v27 retries injectVersionChip with timers; cover those too.
  setTimeout(tryWire, 200);
  setTimeout(tryWire, 900);

  // Re-post the pin to the controller on every load so a SW restart picks it
  // up. The SW only holds the pin in memory by design — survives across
  // sessions via localStorage replay here.
  function pushPin() {
    const v = pinned();
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'NAMIBIA_VERSION_PIN', version: v || null
        });
      } catch (_) {}
    }
  }
  pushPin();
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('controllerchange', pushPin);
  }

  window.NamibiaVersionPin = {
    set: setPinned,
    get: () => localStorage.getItem(KEY),
    list: listCachedVersions
  };
})();
