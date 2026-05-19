// Namibia PWA v26 — Business enrichment via Google Places API.
//
//   * For each stop with a name + lat/lng, fetches Place Details (address,
//     phone, hours, rating, review count, website, top photo) via the Maps
//     JavaScript Places library, cached in localStorage with a 30-day TTL.
//   * Renders an enriched card in the Stops tab: cover photo, rating chip,
//     hours, phone, address, website button, AI-templated summary.
//   * Refresh button (from v23) also re-fetches Places metadata and warms the
//     SW cache for all referenced photo URLs + menu URLs.
//
// What v26 explicitly does NOT do:
//   * Scrape Google Maps review images / menu photos (against Google ToS).
//   * Auto-download arbitrary restaurant menu PDFs (copyright concerns).
//     Authors can set `stop.menuUrl` in data.js to point at a public menu PDF
//     that the restaurant publishes themselves; the SW will cache it on the
//     first open and on the next "Refresh" click.
(function () {
  const PL = window.NamibiaPlaces;
  const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function loadCache(stop) {
    if (!PL) return null;
    try {
      const raw = localStorage.getItem(PL.cacheKey(stop));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.fetchedAt || (Date.now() - obj.fetchedAt) > TTL_MS) return null;
      return obj;
    } catch (_) { return null; }
  }
  function saveCache(stop, shaped) {
    if (!PL) return;
    try { localStorage.setItem(PL.cacheKey(stop), JSON.stringify(shaped)); } catch (_) {}
  }
  function invalidateAllPlaces() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('namibia_place_v1:')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }

  // ---- Places fetch via google.maps.places.PlacesService ----
  let placesService = null;
  function ensurePlacesService() {
    if (placesService) return placesService;
    if (!window.google?.maps?.places?.PlacesService) return null;
    // PlacesService requires a node/map element; use a hidden div.
    let attach = document.getElementById('namibiaPlacesHost');
    if (!attach) {
      attach = document.createElement('div');
      attach.id = 'namibiaPlacesHost';
      attach.style.display = 'none';
      document.body.appendChild(attach);
    }
    placesService = new google.maps.places.PlacesService(attach);
    return placesService;
  }

  function findPlaceFromQuery(stop) {
    return new Promise((resolve) => {
      const svc = ensurePlacesService();
      if (!svc) return resolve(null);
      const query = `${stop.name}, Namibia`;
      svc.findPlaceFromQuery({
        query,
        fields: ['place_id', 'geometry', 'name'],
        locationBias: { lat: Number(stop.lat), lng: Number(stop.lng) }
      }, (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          return resolve(null);
        }
        // Prefer the result whose coordinates are closest to the stop.
        let best = results[0], bestD = Infinity;
        const dist = window.NamibiaDrivingCore?.distMeters || ((a, b) => 0);
        for (const r of results) {
          const loc = r.geometry?.location;
          const d = loc ? dist({ lat: loc.lat(), lng: loc.lng() }, { lat: Number(stop.lat), lng: Number(stop.lng) }) : Infinity;
          if (d < bestD) { bestD = d; best = r; }
        }
        resolve(best);
      });
    });
  }

  function getDetails(placeId) {
    return new Promise((resolve) => {
      const svc = ensurePlacesService();
      if (!svc) return resolve(null);
      svc.getDetails({
        placeId,
        fields: ['place_id', 'formatted_address', 'formatted_phone_number',
          'international_phone_number', 'opening_hours', 'rating',
          'user_ratings_total', 'website', 'url', 'photos', 'vicinity']
      }, (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK) return resolve(null);
        resolve(place);
      });
    });
  }

  async function enrichOne(stop) {
    if (!stop?.name || typeof stop.lat !== 'number') return null;
    const cached = loadCache(stop);
    if (cached) return cached;
    const found = await findPlaceFromQuery(stop);
    if (!found?.place_id) return null;
    const details = await getDetails(found.place_id);
    const shaped = PL.shapePlaceForStop(stop, details);
    if (shaped) saveCache(stop, shaped);
    return shaped;
  }

  // Iterate all stops across all days. Throttle to ~1 request/sec to stay
  // friendly with Places quotas; cached entries skip immediately.
  async function enrichAll(opts) {
    opts = opts || {};
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    const queue = [];
    for (const d of days) for (const s of (d.stops || [])) queue.push(s);
    let done = 0, hit = 0, missed = 0, errors = 0;
    for (const stop of queue) {
      try {
        const cached = !opts.force ? loadCache(stop) : null;
        if (cached) { hit++; done++; continue; }
        const shaped = await enrichOne(stop);
        if (shaped) done++;
        else missed++;
        // Polite spacing between live fetches.
        if (!cached) await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        errors++;
      }
    }
    if (typeof log === 'function') log(`Places enrichment: ${done - hit} fetched, ${hit} cached, ${missed} missed, ${errors} errors.`);
    return { done, hit, missed, errors };
  }

  // Warm SW cache for all known photo URLs + curated menuUrls. Returns when
  // every fetch settles (success or fail). Called from the Refresh flow.
  async function warmAssetCache() {
    if (!('caches' in window)) return;
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    const urls = new Set();
    for (const d of days) for (const s of (d.stops || [])) {
      const c = loadCache(s);
      if (c?.photoRef && state.apiKey) {
        urls.add(PL.placePhotoUrl(c.photoRef, state.apiKey, 600));
      }
      if (s.menuUrl) urls.add(s.menuUrl);
    }
    const arr = Array.from(urls);
    await Promise.allSettled(arr.map(u => fetch(u, { mode: 'no-cors' })));
    if (typeof log === 'function') log(`Cached ${arr.length} business asset URLs (photos + menus).`);
  }

  // ---- Stops tab — enrich each existing .stop card with the metadata ----
  function enrichStopsTab() {
    if (state?.activeTab !== 'stops') return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const d = day();
    const stops = d.stops || [];
    const cards = tc.querySelectorAll('.stop');
    cards.forEach((cardEl, i) => {
      const stop = stops[i];
      if (!stop) return;
      if (cardEl.dataset.v26Done === '1') return;
      const shaped = loadCache(stop);
      if (!shaped) return;
      cardEl.dataset.v26Done = '1';

      // Hand-authored stop.details (from data.js) take precedence over
      // Places API results so we always render the curated copy even when
      // the API has stale or thin data for remote Namibian businesses.
      const det = stop.details || {};
      const summary = det.summary || PL.effectiveSummary(stop, shaped);
      const phone = det.phone || shaped.formatted_phone_number;
      const website = det.website || shaped.website;
      const address = shaped.formatted_address;
      const hours = (det.hours && det.hours.length) ? det.hours : shaped.opening_hours;
      const menuUrl = det.menuUrl || stop.menuUrl;
      const openMaybeNote = det.closingDays || '';
      const noteworthy = det.noteworthyDish ? `<div class="biz-noteworthy">⭐ <em>${esc(det.noteworthyDish)}</em></div>` : '';
      const priceHtml = det.avgPriceUSD ? `<span class="biz-price" title="Approx per-person USD">~$${det.avgPriceUSD}</span>` : '';

      const ratingHtml = shaped.rating
        ? `<span class="biz-rating">${PL.ratingChipLabel(shaped.rating, shaped.user_ratings_total)}</span>`
        : '';
      const phoneHtml = phone ? `<a class="biz-phone" href="tel:${encodeURIComponent(phone)}">📞 ${esc(phone)}</a>` : '';
      const addrHtml = address ? `<div class="biz-addr">📍 ${esc(address)}</div>` : '';
      const closingHtml = openMaybeNote ? `<div class="biz-closing">⚠️ ${esc(openMaybeNote)}</div>` : '';
      const hoursHtml = (hours && hours.length)
        ? `<details class="biz-hours"><summary>🕒 Hours${shaped.open_now != null ? ' · ' + (shaped.open_now ? 'open now' : 'closed now') : ''}</summary><ul>${hours.map(h => `<li>${esc(h)}</li>`).join('')}</ul></details>`
        : '';
      const websiteHtml = website
        ? `<a class="biz-link" href="${esc(website)}" target="_blank" rel="noopener">🌐 Website</a>`
        : '';
      // TWO Maps links per user request:
      //   1) the actual Google Maps business listing (uses Place ID + place URL
      //      from Places API) — opens the curated business page.
      //   2) a coordinate-only search URL — works offline-first via cached map
      //      tiles if you've lost cell service.
      const bizPageHtml = shaped.url
        ? `<a class="biz-link" href="${esc(shaped.url)}" target="_blank" rel="noopener">🗺️ Business page</a>`
        : '';
      const coordLinkHtml = (typeof stop.lat === 'number' && typeof stop.lng === 'number')
        ? `<a class="biz-link" href="https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}" target="_blank" rel="noopener" title="Open by GPS coordinate — works with offline Google Maps">📍 Open by coordinate</a>`
        : '';
      const menuHtml = menuUrl
        ? `<a class="biz-link biz-menu" href="${esc(menuUrl)}" target="_blank" rel="noopener">📄 Menu</a>`
        : (website ? `<a class="biz-link biz-menu-fallback" href="${esc(website)}" target="_blank" rel="noopener">📄 Find menu on website</a>` : '');
      // Cover image priority:
      //   1. Google Places photo (best: actual business cover)
      //   2. Street View image at the stop's coords (so remote lodges with no
      //      Places photo still show *something* of the location)
      let photoUrl = null;
      let photoSource = '';
      if (shaped.photoRef && state.apiKey) {
        photoUrl = PL.placePhotoUrl(shaped.photoRef, state.apiKey, 600);
        photoSource = 'places';
      } else if (state.apiKey && typeof stop.lat === 'number' && typeof stop.lng === 'number') {
        const sv = new URLSearchParams({
          size: '600x300', location: `${stop.lat},${stop.lng}`,
          fov: '90', pitch: '0', source: 'outdoor', radius: '120',
          key: state.apiKey
        });
        photoUrl = 'https://maps.googleapis.com/maps/api/streetview?' + sv.toString();
        photoSource = 'streetview';
      }
      const photoHtml = photoUrl
        ? `<img class="biz-photo biz-photo-${photoSource}" src="${esc(photoUrl)}" alt="${esc(stop.name)} cover" loading="lazy" onerror="this.style.display='none'">`
        : '';

      const wrap = document.createElement('div');
      wrap.className = 'biz-card';
      wrap.innerHTML = `
        ${photoHtml}
        <div class="biz-meta">
          <div class="biz-summary">${esc(summary)}</div>
          ${noteworthy}
          <div class="biz-line">${ratingHtml}${priceHtml ? ' ' + priceHtml : ''}</div>
          ${addrHtml}
          ${phoneHtml ? `<div>${phoneHtml}</div>` : ''}
          ${hoursHtml}
          ${closingHtml}
          <div class="biz-links">${websiteHtml}${bizPageHtml}${coordLinkHtml}${menuHtml}</div>
        </div>`;
      cardEl.appendChild(wrap);
    });
  }

  // ---- Wire Refresh button (from v23) to also enrich + warm asset cache ----
  function wireRefreshHook() {
    const btn = document.getElementById('refreshLive');
    if (!btn || btn.dataset.v26Wired === '1') return;
    btn.dataset.v26Wired = '1';
    const original = btn.onclick;
    btn.onclick = async function () {
      if (typeof original === 'function') await original.call(this);
      try {
        await enrichAll({ force: true });
        await warmAssetCache();
        if (typeof renderTab === 'function') renderTab();
      } catch (_) {}
    };
  }

  // ---- Hook renderTab so the Stops tab keeps gaining metadata as it loads ----
  if (typeof renderTab === 'function') {
    const base = renderTab;
    renderTab = function patchedRenderTabV26() {
      const r = base();
      try { enrichStopsTab(); } catch (_) {}
      try { wireRefreshHook(); } catch (_) {}
      return r;
    };
  }

  // Kick off a background enrichment + asset cache shortly after boot.
  setTimeout(() => {
    if (!state?.apiKey) return;
    enrichAll({ force: false }).then(() => {
      try { enrichStopsTab(); } catch (_) {}
      // Photos referenced by enrich results — warm the SW cache so they're
      // available offline (without forcing a full refresh).
      warmAssetCache().catch(() => {});
    }).catch(() => {});
  }, 3000);

  window.NamibiaV26 = {
    enrichAll, enrichOne, warmAssetCache, invalidateAllPlaces,
    loadCache, saveCache,
    findPlaceFromQuery, getDetails
  };
})();
