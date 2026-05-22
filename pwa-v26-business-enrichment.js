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
  function stopMapsUrl(stop) {
    if (typeof window.googleMapsStopUrl === 'function') return window.googleMapsStopUrl(stop);
    const q = String(stop?.placeQuery || stop?.name || '').replace(/\s+/g, ' ').trim();
    if (q) return 'https://www.google.com/maps/search/?' + new URLSearchParams({ api: '1', query: /\bnamibia\b/i.test(q) ? q : q + ' Namibia' }).toString();
    const fallback = String(stop?.type || 'Namibia stop').replace(/\s+/g, ' ').trim();
    return 'https://www.google.com/maps/search/?' + new URLSearchParams({ api: '1', query: /\bnamibia\b/i.test(fallback) ? fallback : fallback + ' Namibia' }).toString();
  }
  function invalidateAllPlaces() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('namibia_place_v2:') || k.startsWith('namibia_place_v1:'))) keys.push(k);
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

  // Strip generic "service" descriptors from the stop name so the keyword
  // search has the best chance of hitting the actual business pin.
  function searchKeyword(stop) {
    if (stop.placeQuery) return stop.placeQuery; // hand-curated override
    let n = String(stop.name || '');
    // Drop bracketed annotations.
    n = n.replace(/\([^)]*\)/g, '');
    // Drop "fuel option" / "tyre check" / "luggage pickup" suffixes that
    // describe role rather than identity.
    n = n.replace(/\b(fuel|tyre|tire|pressure|service|station|luggage|pickup|stop|option|exit|entry|gate)\b.*$/i, '');
    // Drop multi-name separators ("McGregor's Bakery / Solitaire Fuel" →
    // first name wins, which is more specific).
    n = n.split(/\s*[\/—–]\s*/)[0];
    return n.trim() || stop.name;
  }

  function findPlaceFromQuery(stop) {
    return new Promise((resolve) => {
      const svc = ensurePlacesService();
      if (!svc) return resolve(null);
      const keyword = searchKeyword(stop);
      const dist = window.NamibiaDrivingCore?.distMeters || ((a, b) => 0);
      // Progressive radius expansion: try a tight search first, then widen if
      // we don't find anything. Most lodge/restaurant pins are within 500 m
      // of the stop's lat/lng; some Windhoek restaurants where we stored a
      // city-centre coord need ~5 km.
      const radii = [500, 2000, 5000];
      const tryRadius = (i) => {
        if (i >= radii.length) return resolve(null);
        svc.nearbySearch({
          location: { lat: Number(stop.lat), lng: Number(stop.lng) },
          radius: radii[i],
          keyword
        }, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
            // Pick the candidate whose coordinates are closest to the stop.
            let best = results[0], bestD = Infinity;
            for (const r of results) {
              const loc = r.geometry?.location;
              const d = loc ? dist({ lat: loc.lat(), lng: loc.lng() }, { lat: Number(stop.lat), lng: Number(stop.lng) }) : Infinity;
              if (d < bestD) { bestD = d; best = r; }
            }
            resolve(best);
          } else {
            tryRadius(i + 1);
          }
        });
      };
      tryRadius(0);
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
    // Event-kind stops are activity blocks (game drives, dinners, luggage
    // pickups) that point at a different physical business. Skip them so
    // we don't draw fake "business" cards on placeholder rows.
    if (stop.kind === 'event') return null;
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
      if (c?.photoUrl) urls.add(c.photoUrl);
      for (const u of (c?.altPhotoUrls || [])) urls.add(u);
      if (!c?.photoUrl && c?.photoRef && state.apiKey) {
        urls.add(PL.placePhotoUrl(c.photoRef, state.apiKey, 600));
      }
      if (s.menuUrl) urls.add(s.menuUrl);
    }
    const arr = Array.from(urls);
    await Promise.allSettled(arr.map(u => fetch(u, { mode: 'no-cors' })));
    if (typeof log === 'function') log(`Cached ${arr.length} business asset URLs (photos + menus).`);
  }

  // Bearing of travel along the day's route nearest a stop — used to orient the
  // Street View fallback toward the driving direction. Null if off-route (>3 km).
  function routeHeadingAt(stop) {
    try {
      const DC = window.NamibiaDrivingCore;
      const d = (typeof day === 'function') ? day() : null;
      const route = d && state.renderedRoutes && state.renderedRoutes[d.date];
      const path = route && route.overviewPath;
      if (!DC || !path || path.length < 2 || typeof stop.lat !== 'number') return null;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < path.length; i++) { const dd = DC.distMeters(stop, path[i]); if (dd < bd) { bd = dd; bi = i; } }
      if (bd > 3000) return null;
      let j = bi, adv = 0;
      while (j + 1 < path.length && adv < 150) { adv += DC.distMeters(path[j], path[j + 1]); j++; }
      const ahead = path[j] || path[bi];
      return DC.bearingForStreetView(path[bi], ahead);
    } catch (_) { return null; }
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
      // Don't render a biz-card for non-business stops at all — they were
      // never meant to be enriched with a Places page.
      if (stop.kind === 'event') return;
      const shaped = loadCache(stop);
      if (!shaped) {
        // For service / attraction stops without a Places match, render a
        // minimal "any station near here" placeholder card so the user
        // knows it's intentionally unenriched rather than missing data.
        if (stop.kind === 'service' || stop.kind === 'attraction') {
          const wrap = document.createElement('div');
          wrap.className = 'biz-card biz-card-generic';
          const label = stop.kind === 'service'
            ? `<strong>Any nearby ${esc(stop.type || 'fuel/tyre station')}.</strong> Pull into the closest staffed station — see in-step notes for recommended brands.`
            : `<strong>${esc(stop.name)}.</strong> Public landmark / geographic point — see Google Maps for navigation details.`;
          wrap.innerHTML = `<div class="biz-meta">${label} <a class="biz-link" href="${esc(stopMapsUrl(stop))}" target="_blank" rel="noopener">🗺️ Open in Google Maps</a></div>`;
          cardEl.appendChild(wrap);
          cardEl.dataset.v26Done = '1';
        }
        return;
      }
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
      // Prefer the actual Google Maps business listing when Places returned
      // one; otherwise fall back to an exact name/placeQuery search.
      const bizPageHtml = shaped.url
        ? `<a class="biz-link" href="${esc(shaped.url)}" target="_blank" rel="noopener">🗺️ Business page</a>`
        : `<a class="biz-link" href="${esc(stopMapsUrl(stop))}" target="_blank" rel="noopener">🗺️ Google Maps</a>`;
      const menuHtml = menuUrl
        ? `<a class="biz-link biz-menu" href="${esc(menuUrl)}" target="_blank" rel="noopener">📄 Menu</a>`
        : (website ? `<a class="biz-link biz-menu-fallback" href="${esc(website)}" target="_blank" rel="noopener">📄 Find menu on website</a>` : '');
      // Cover image waterfall:
      //   1. Google Places photos resolved via the JS SDK getUrl() — these are
      //      pre-signed and need NO API key (primary, then alternates).
      //   2. Legacy photo_reference URLs (web-service shape) if present.
      //   3. Street View at the stop's coords (so remote lodges still show
      //      *something* of the location)
      //   4. Final hard-fail → hidden via style.display='none'
      const photoChain = [];
      if (shaped.photoUrl) photoChain.push(shaped.photoUrl);
      for (const u of (shaped.altPhotoUrls || [])) {
        if (u && u !== shaped.photoUrl) photoChain.push(u);
      }
      if (state.apiKey) {
        if (!photoChain.length && shaped.photoRef) {
          photoChain.push(PL.placePhotoUrl(shaped.photoRef, state.apiKey, 600));
        }
        if (typeof stop.lat === 'number' && typeof stop.lng === 'number') {
          const svParams = {
            size: '600x300', location: `${stop.lat},${stop.lng}`,
            fov: '90', pitch: '0', source: 'default', radius: '800', return_error_code: 'true',
            key: state.apiKey
          };
          // For stops we drive past, face the Street View along the direction of
          // travel (route bearing at the stop) rather than a random angle.
          const hdg = routeHeadingAt(stop);
          if (hdg != null) svParams.heading = String(Math.round(hdg));
          photoChain.push('https://maps.googleapis.com/maps/api/streetview?' + new URLSearchParams(svParams).toString());
        }
      }
      // Encode chain into the IMG's data-fallbacks so a tiny JS shim can
      // walk it on each onerror without us writing a long inline handler.
      const photoSource = (shaped.photoUrl || shaped.photoRef) ? 'places' : (state.apiKey ? 'streetview' : 'none');
      const photoHtml = photoChain.length
        ? `<img class="biz-photo biz-photo-${photoSource}" src="${esc(photoChain[0])}" alt="${esc(stop.name)} cover" loading="lazy" data-fallbacks="${esc(photoChain.slice(1).join('|'))}" onerror="(function(im){const fbs=(im.dataset.fallbacks||'').split('|').filter(Boolean); if(fbs.length){im.src=fbs.shift();im.dataset.fallbacks=fbs.join('|');}else{im.style.display='none';}})(this)">`
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
          <div class="biz-links">${websiteHtml}${bizPageHtml}${menuHtml}</div>
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
  window.NamibiaUI.afterRenderTab(function () {
    try { enrichStopsTab(); } catch (_) {}
    try { wireRefreshHook(); } catch (_) {}
  });

  // Kick off a background enrichment + asset cache shortly after boot.
  setTimeout(() => {
    if (!state?.apiKey) return;
    enrichAll({ force: false }).then(() => {
      try { enrichStopsTab(); } catch (_) {}
      warmAssetCache().catch(() => {});
      // Second pass: re-fetch any stop whose cached entry has no photoRef.
      // This catches places that the OLD findPlaceFromQuery missed but the
      // new nearbySearch should pick up.
      setTimeout(() => reenrichStopsWithoutPhotos(), 1000);
    }).catch(() => {});
  }, 3000);

  // Targeted retry: invalidate + re-fetch only the stops whose cached Places
  // entry is missing a photoRef. Throttled to 400ms between requests so we
  // don't blast the quota.
  async function reenrichStopsWithoutPhotos() {
    if (!PL) return { tried: 0, gainedPhotos: 0 };
    const days = window.NAMIBIA_TRIP_DATA?.days || [];
    let tried = 0, gainedPhotos = 0;
    for (const d of days) {
      for (const stop of (d.stops || [])) {
        const cached = loadCache(stop);
        if (!cached) continue;                          // never enriched — let primary path do it
        if (cached.photoUrl || cached.photoRef) continue; // already has a photo
        tried++;
        try {
          // Invalidate so enrichOne actually re-fetches.
          localStorage.removeItem(PL.cacheKey(stop));
          const shaped = await enrichOne(stop);
          if (shaped?.photoUrl || shaped?.photoRef) gainedPhotos++;
          await new Promise(r => setTimeout(r, 400));
        } catch (_) {}
      }
    }
    if (typeof log === 'function') log(`Re-enriched photoless stops: ${gainedPhotos}/${tried} gained a Places photo.`);
    if (state?.activeTab === 'stops' && typeof renderTab === 'function') renderTab();
    return { tried, gainedPhotos };
  }

  window.NamibiaV26 = {
    enrichAll, enrichOne, warmAssetCache, invalidateAllPlaces,
    reenrichStopsWithoutPhotos,
    loadCache, saveCache,
    findPlaceFromQuery, getDetails
  };
})();
