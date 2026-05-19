// Namibia PWA v28 — Quota error detection + reset-time banner.
//
// When Google Maps hits its daily quota, it logs "OverQuotaMapError" to the
// console and switches the embedded map into an "Oops, something went wrong"
// state. We listen for that error (via console patching + a global gm_authFailure
// hook) and surface a clear banner telling the user when their quota is
// expected to reset.
//
// Google Maps Platform quotas reset at 00:00 Pacific Time daily. We convert
// to the device's local time and display it inline.
(function () {
  let bannerShown = false;

  function nextResetLocalString() {
    // Pacific Time is UTC-8 (PST) or UTC-7 (PDT). The Maps quota reset is at
    // 00:00 *Pacific*, which is the simplest to compute as 08:00 UTC during
    // DST and 08:00 UTC outside DST (approximate — PST is 8h, PDT is 7h).
    const now = new Date();
    // Use Intl to compute "what is the current Pacific time?"
    const ptParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false, hour: '2-digit', minute: '2-digit',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const lookup = Object.fromEntries(ptParts.map(p => [p.type, p.value]));
    // Build next midnight Pacific as an ISO local string, then parse as if PT.
    const tomorrowPT = new Date(`${lookup.year}-${lookup.month}-${lookup.day}T00:00:00`);
    tomorrowPT.setDate(tomorrowPT.getDate() + 1);
    // Determine PT offset for that day (approximate — assume current offset).
    // Hack: format the same instant in PT and in UTC, compute the delta.
    const sample = new Date();
    const ptHour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false
    }).format(sample));
    const utcHour = sample.getUTCHours();
    let ptOffsetH = ptHour - utcHour;
    if (ptOffsetH > 12) ptOffsetH -= 24;
    if (ptOffsetH < -12) ptOffsetH += 24;
    // tomorrowPT is currently floating; treat it as PT and convert to a real epoch.
    const resetEpochMs = tomorrowPT.getTime() - ptOffsetH * 3600000;
    const resetLocal = new Date(resetEpochMs);
    return resetLocal.toLocaleString(undefined, {
      weekday: 'short', hour: 'numeric', minute: '2-digit',
      day: 'numeric', month: 'short'
    });
  }

  function showQuotaBanner(reason) {
    if (bannerShown) return;
    bannerShown = true;
    let nextReset;
    try { nextReset = nextResetLocalString(); } catch (_) { nextReset = 'tomorrow at midnight Pacific'; }
    const html = `<div id="quotaBanner" class="quota-banner">
      <strong>⚠️ Google Maps daily quota exceeded.</strong>
      The map and live route fetches won't work until the quota resets.
      Expected reset: <strong>${nextReset}</strong> (your local time, ~00:00 US Pacific).
      Cached data still works — Directions, Driving Dashboard, weather, and the demo continue using local cache.
      <button class="ghost" id="quotaBannerDismiss">Dismiss</button>
    </div>`;
    document.body.insertAdjacentHTML('afterbegin', html);
    document.getElementById('quotaBannerDismiss')?.addEventListener('click', () => {
      document.getElementById('quotaBanner')?.remove();
      bannerShown = false;
    });
    if (typeof log === 'function') log('Google Maps quota exceeded: ' + (reason || 'OverQuotaMapError'));
  }

  // 1) Google's documented hook for auth/quota failure.
  window.gm_authFailure = function () { showQuotaBanner('gm_authFailure'); };

  // 2) Patch console.error to detect quota messages even when Google doesn't
  //    call gm_authFailure (e.g. when only Place / Static-Map calls 403).
  const origError = console.error.bind(console);
  console.error = function (...args) {
    try {
      const txt = args.map(a => typeof a === 'string' ? a : '').join(' ');
      if (/OverQuotaMapError|REQUEST_DENIED|OVER_QUERY_LIMIT|over_query_limit/i.test(txt)) {
        showQuotaBanner(txt.slice(0, 80));
      }
    } catch (_) {}
    return origError(...args);
  };

  window.NamibiaV28 = { showQuotaBanner, nextResetLocalString };
})();
