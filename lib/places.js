// lib/places.js
// Pure helpers for parsing Google Places responses and shaping per-business
// "card" metadata. No fetch/IO here — the v26 patch handles network.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NamibiaPlaces = api;
})(typeof self !== 'undefined' ? self : this, function () {

  function formatHours(opening_hours) {
    if (!opening_hours) return null;
    if (Array.isArray(opening_hours.weekday_text)) return opening_hours.weekday_text;
    return null;
  }

  function ratingChipLabel(rating, total) {
    if (typeof rating !== 'number') return null;
    const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
    return `${stars} ${rating.toFixed(1)} (${total || 0})`;
  }

  // Pick the best landscape-oriented photo for a cover image. Cards display
  // 16:9-ish, so we prefer wider photos over tall ones; among landscape
  // candidates we pick the highest-resolution one.
  function pickCoverPhoto(photos) {
    if (!Array.isArray(photos) || !photos.length) return null;
    const score = p => {
      const w = p.width || 0;
      const h = p.height || 0;
      if (!w || !h) return 0;
      const ratio = w / h;
      // Penalise portrait photos heavily; reward landscape in the 1.4–2.2 range.
      const ratioScore = ratio < 1 ? -100 : Math.max(0, 100 - Math.abs(ratio - 1.6) * 30);
      return ratioScore + Math.log(w * h) * 5;
    };
    let best = null, bestS = -Infinity;
    for (const p of photos) {
      const s = score(p);
      if (s > bestS) { bestS = s; best = p; }
    }
    return best || photos[0];
  }

  // Shape Google Place Details response into our internal stop-card layout.
  function shapePlaceForStop(stop, details) {
    if (!details) return null;
    const cover = pickCoverPhoto(details.photos);
    // Capture up to 4 photo references for future use (gallery, fallback if
    // the first one fails to load, etc.).
    const altRefs = (details.photos || [])
      .slice(0, 4)
      .map(p => p.photo_reference)
      .filter(Boolean);
    return {
      placeId: details.place_id,
      formatted_address: details.formatted_address || details.vicinity || null,
      formatted_phone_number: details.formatted_phone_number || details.international_phone_number || null,
      website: details.website || null,
      url: details.url || null,
      rating: typeof details.rating === 'number' ? details.rating : null,
      user_ratings_total: details.user_ratings_total || 0,
      opening_hours: formatHours(details.opening_hours),
      open_now: details.opening_hours?.open_now ?? null,
      photoRef: cover?.photo_reference || null,
      altPhotoRefs: altRefs,
      fetchedAt: Date.now()
    };
  }

  // Build a templated one-liner summary when the data doesn't carry one.
  function templateSummary(stop, shaped) {
    if (!stop) return '';
    const what = stop.type ? stop.type : 'stop';
    const city = (shaped?.formatted_address || '').split(',').slice(-2, -1)[0]?.trim();
    const where = city ? ` in ${city}` : '';
    const rating = shaped?.rating
      ? ` — averaging ${shaped.rating.toFixed(1)}★ across ${shaped.user_ratings_total} Google reviews`
      : '';
    return `${stop.name} is a ${what}${where}${rating}.`;
  }

  function effectiveSummary(stop, shaped) {
    return stop?.summary || templateSummary(stop, shaped);
  }

  // Build a placePhotoUrl from a photo_reference + size + API key.
  function placePhotoUrl(photoRef, apiKey, maxWidth) {
    if (!photoRef || !apiKey) return null;
    const p = new URLSearchParams({
      maxwidth: String(maxWidth || 400),
      photo_reference: photoRef,
      key: apiKey
    });
    return 'https://maps.googleapis.com/maps/api/place/photo?' + p.toString();
  }

  // Build a stable cache key for a stop (name + 2-decimal lat/lng) so the same
  // physical place shared across days reuses one Places fetch.
  function cacheKey(stop) {
    if (!stop) return null;
    return `namibia_place_v1:${(stop.name || '').slice(0, 80)}:${Number(stop.lat).toFixed(2)}:${Number(stop.lng).toFixed(2)}`;
  }

  return {
    formatHours,
    ratingChipLabel,
    shapePlaceForStop,
    templateSummary,
    effectiveSummary,
    placePhotoUrl,
    cacheKey
  };
});
