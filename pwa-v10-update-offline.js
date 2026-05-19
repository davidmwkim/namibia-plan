// Namibia PWA v10 patch: update prompt + offline preparation feedback.
(function () {
  const RUNTIME_CACHE = 'namibia-trip-runtime-v10';
  let refreshing = false;
  let waitingWorker = null;

  function toast(id, cls, title, body) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.className = cls;
    el.innerHTML = `<div class="toast-row"><div class="toast-copy"><h3>${title}</h3><p>${body}</p></div><div class="toast-actions"></div></div>`;
    document.body.appendChild(el);
    return el;
  }

  function updatePrompt(worker) {
    waitingWorker = worker || waitingWorker;
    const el = toast('updateToast', 'update-toast', 'New version available', 'Tap update to refresh the PWA with the latest route/offline code.');
    const actions = el.querySelector('.toast-actions');
    actions.innerHTML = '';
    const later = document.createElement('button');
    later.className = 'ghost';
    later.textContent = 'Later';
    later.onclick = () => el.classList.remove('visible');
    const update = document.createElement('button');
    update.className = 'primary';
    update.textContent = 'Update';
    update.onclick = () => {
      update.disabled = true;
      update.textContent = 'Updating…';
      if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
      setTimeout(() => window.location.reload(), 4500);
    };
    actions.append(later, update);
    el.classList.add('visible');
  }

  function offlineToast({ title = 'Preparing offline mode', body = '', progress = null, detail = '' } = {}) {
    const el = toast('offlineToast', 'offline-toast', title, body);
    el.querySelector('h3').textContent = title;
    el.querySelector('p').textContent = body;
    let bar = el.querySelector('.toast-progress');
    if (progress == null) {
      if (bar) bar.remove();
    } else {
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'toast-progress';
        bar.innerHTML = '<div></div>';
        el.appendChild(bar);
      }
      bar.firstElementChild.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }
    let detailEl = el.querySelector('.offline-detail');
    if (detail) {
      if (!detailEl) {
        detailEl = document.createElement('div');
        detailEl.className = 'offline-detail';
        el.appendChild(detailEl);
      }
      detailEl.textContent = detail;
    } else if (detailEl) {
      detailEl.remove();
    }
    const actions = el.querySelector('.toast-actions');
    actions.innerHTML = '';
    const dismiss = document.createElement('button');
    dismiss.className = 'ghost';
    dismiss.textContent = 'Dismiss';
    dismiss.onclick = () => el.classList.remove('visible');
    actions.appendChild(dismiss);
    el.classList.add('visible');
  }

  async function setupUpdatePrompt() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    if (registration.waiting && navigator.serviceWorker.controller) updatePrompt(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) updatePrompt(worker);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
    setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
  }

  async function waitForRoutes(timeoutMs = 90000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const routeDays = DATA.days.filter(d => d.selfDrive && routeStops(d).length >= 2);
      const rendered = routeDays.filter(d => state.renderedRoutes?.[d.date]?.overviewPath?.length >= 2).length;
      if (rendered >= routeDays.length) return { rendered, total: routeDays.length };
      offlineToast({ title: 'Rendering Google routes', body: `Rendered ${rendered}/${routeDays.length} route days. Keep this page open.`, progress: routeDays.length ? (rendered / routeDays.length) * 45 : 45 });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const routeDays = DATA.days.filter(d => d.selfDrive && routeStops(d).length >= 2);
    const rendered = routeDays.filter(d => state.renderedRoutes?.[d.date]?.overviewPath?.length >= 2).length;
    return { rendered, total: routeDays.length };
  }

  async function cacheAppShell() {
    if (!('caches' in window)) return 0;
    const assets = ['./','./index.html','./styles.css','./pwa-v8-segment-patch.css','./pwa-v10-update-offline.css','./app.js','./pwa-v8-segment-patch.js','./pwa-v9-map-route-draw.js','./pwa-v10-update-offline.js','./data.js','./manifest.webmanifest','./icons/icon.svg'];
    const cache = await caches.open(RUNTIME_CACHE);
    let done = 0;
    for (const asset of assets) {
      try {
        const res = await fetch(asset, { cache: 'reload' });
        if (res.ok) await cache.put(asset, res.clone());
      } catch (_) {}
      done += 1;
      offlineToast({ title: 'Caching app shell', body: `Cached ${done}/${assets.length} app files.`, progress: 45 + (done / assets.length) * 20 });
    }
    return done;
  }

  async function cacheStreetViewImages() {
    const urls = [...new Set(Object.values(state.renderedRoutes || {}).flatMap(r => r.street || []).map(s => s.url).filter(Boolean))];
    if (!urls.length || !('caches' in window)) return { done: 0, total: urls.length };
    const cache = await caches.open(RUNTIME_CACHE);
    let done = 0;
    for (const url of urls) {
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, res.clone());
      } catch (_) {}
      done += 1;
      offlineToast({ title: 'Caching Street View snapshots', body: `Cached ${done}/${urls.length} Street View images.`, progress: 65 + (done / urls.length) * 30 });
    }
    return { done, total: urls.length };
  }

  async function prepareOfflineWithFeedback() {
    offlineToast({ title: 'Preparing offline mode', body: 'Starting route, app shell, and Street View caching.', progress: 1 });
    try {
      state.apiKey = document.getElementById('apiKey')?.value?.trim() || state.apiKey;
      if (state.apiKey) localStorage.setItem('namibia_google_api_key', state.apiKey);
      if (!state.googleLoaded) {
        offlineToast({ title: 'Loading Google Maps', body: 'Loading Google Maps before route prerendering.', progress: 5 });
        loadGoogleAndRenderAll();
        await waitForRoutes();
      } else {
        offlineToast({ title: 'Rendering Google routes', body: 'Rendering all route days before offline caching.', progress: 10 });
        await renderAllDays();
      }
      const routeDays = DATA.days.filter(d => d.selfDrive && routeStops(d).length >= 2);
      const rendered = routeDays.filter(d => state.renderedRoutes?.[d.date]?.overviewPath?.length >= 2).length;
      localStorage.setItem('namibia_routes_cache_v5', JSON.stringify(state.renderedRoutes));
      const shellCount = await cacheAppShell();
      const street = await cacheStreetViewImages();
      offlineToast({ title: 'Offline preparation complete', body: 'App shell and available route data are cached. Test in airplane mode before travel.', progress: 100, detail: `Routes rendered: ${rendered}/${routeDays.length}\nApp files cached: ${shellCount}\nStreet View snapshots attempted: ${street.done}/${street.total}\nNote: browser storage eviction is still possible, especially on iOS.` });
    } catch (err) {
      offlineToast({ title: 'Offline preparation failed', body: err?.message || String(err), detail: 'Check Google API permissions, network connectivity, and browser console logs.' });
    }
  }

  function rebindOfflineButton() {
    const button = document.getElementById('prepareOffline');
    if (button) button.onclick = prepareOfflineWithFeedback;
  }

  setupUpdatePrompt().catch(err => console.warn('Update prompt setup failed', err));
  rebindOfflineButton();
  window.addEventListener('load', rebindOfflineButton);
  document.addEventListener('visibilitychange', rebindOfflineButton);
  window.namibiaPrepareOfflineWithFeedback = prepareOfflineWithFeedback;
})();
