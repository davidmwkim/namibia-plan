// lib/sun-times.js
// Pure functions: NOAA solar position for sunrise/sunset, ETA from remaining route
// steps, and sunset-margin severity. No DOM, no network. Works offline.
// Exposed both as ESM exports (for Vitest) and as window.NamibiaSunTimes (for the
// PWA patches loaded via <script>).

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NamibiaSunTimes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const NAMIBIA_TZ_OFFSET_MIN = 120; // UTC+2, no DST.

  function toRad(d) { return d * Math.PI / 180; }
  function toDeg(r) { return r * 180 / Math.PI; }

  // Sunrise equation (https://en.wikipedia.org/wiki/Sunrise_equation).
  // Returns { sunriseMs, sunsetMs, solarNoonMs } in epoch milliseconds (UTC).
  // The input Date is interpreted by its UTC calendar day; tz is irrelevant here.
  function sunriseSunsetUtc(date, lat, lng) {
    const dateUtcMidnight = Date.UTC(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()
    );
    const JD = dateUtcMidnight / 86400000 + 2440587.5;
    // The Wikipedia sunrise equation uses west-positive longitude. We accept the
    // usual east-positive lng, so flip its sign for the algorithm.
    const lngW = -lng;
    // Julian cycle since J2000.0, adjusted for the local longitude so we pick the
    // Julian day whose "solar noon" lands on the requested calendar day.
    const n = Math.round(JD - 2451545.0 - 0.0009 - lngW / 360.0);
    // Approximate solar noon (Julian date) at this longitude/day.
    const Jstar = 2451545.0 + 0.0009 + lngW / 360.0 + n;
    // Solar mean anomaly (degrees) at Jstar.
    const M = (357.5291 + 0.98560028 * (Jstar - 2451545.0)) % 360.0;
    const Mrad = toRad(M);
    // Equation of the center (degrees).
    const C = 1.9148 * Math.sin(Mrad) + 0.0200 * Math.sin(2 * Mrad) + 0.0003 * Math.sin(3 * Mrad);
    // Ecliptic longitude (degrees).
    const lambda = (M + C + 180.0 + 102.9372) % 360.0;
    const lambdaRad = toRad(lambda);
    // Solar transit (true noon, Julian date).
    const Jtransit = Jstar + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lambdaRad);
    // Declination of the sun.
    const sinDelta = Math.sin(lambdaRad) * Math.sin(toRad(23.44));
    const cosDelta = Math.cos(Math.asin(sinDelta));
    const latRad = toRad(lat);
    // Hour angle at sunrise/sunset (cos of). −0.83° accounts for atmospheric
    // refraction + solar disc diameter.
    const cosOmega = (Math.sin(toRad(-0.83)) - Math.sin(latRad) * sinDelta) /
                     (Math.cos(latRad) * cosDelta);
    const result = {
      solarNoonMs: jdToMs(Jtransit),
      sunriseMs: NaN,
      sunsetMs: NaN
    };
    if (cosOmega >= -1 && cosOmega <= 1) {
      const omega = toDeg(Math.acos(cosOmega));
      result.sunriseMs = jdToMs(Jtransit - omega / 360.0);
      result.sunsetMs = jdToMs(Jtransit + omega / 360.0);
    }
    return result;
  }

  function jdToMs(jd) {
    return (jd - 2440587.5) * 86400000;
  }

  // Parse "15 mins" / "1 hour" / "1 hour 12 mins" / "2 hours 4 mins" → minutes.
  function parseDurationToMinutes(text) {
    if (typeof text !== 'string') return 0;
    const t = text.toLowerCase();
    let m = 0;
    const hMatch = t.match(/(\d+)\s*hour/);
    if (hMatch) m += Number(hMatch[1]) * 60;
    const minMatch = t.match(/(\d+)\s*min/);
    if (minMatch) m += Number(minMatch[1]);
    return m;
  }

  // Parse "187 km" / "1.2 km" / "850 m" → metres.
  function parseDistanceToMeters(text) {
    if (typeof text !== 'string') return 0;
    const t = text.toLowerCase().replace(/,/g, '');
    const km = t.match(/([\d.]+)\s*km/);
    if (km) return Number(km[1]) * 1000;
    const m = t.match(/([\d.]+)\s*m/);
    if (m) return Number(m[1]);
    return 0;
  }

  // Sum remaining step durations (in minutes) starting from currentStep.
  // currentStep: { legIdx, stepIdx, distToStepM } — distToStepM is metres ALREADY
  // travelled into the current step (driving-core's `distToStepM`). We prorate the
  // current step's duration by the *remaining* fraction.
  function etaFromCurrentStep(route, currentStep, nowMs) {
    if (!route || !route.legs || !route.legs.length) return nowMs;
    const { legIdx = 0, stepIdx = 0, distToStepM = 0 } = currentStep || {};
    let minutes = 0;
    for (let li = legIdx; li < route.legs.length; li++) {
      const leg = route.legs[li];
      const startSi = li === legIdx ? stepIdx : 0;
      for (let si = startSi; si < leg.steps.length; si++) {
        const step = leg.steps[si];
        const fullStepMin = parseDurationToMinutes(step.duration);
        if (li === legIdx && si === stepIdx) {
          const fullStepM = parseDistanceToMeters(step.distance);
          const consumed = fullStepM > 0 ? Math.min(1, Math.max(0, distToStepM / fullStepM)) : 0;
          minutes += fullStepMin * (1 - consumed);
        } else {
          minutes += fullStepMin;
        }
      }
    }
    return nowMs + minutes * 60000;
  }

  // Returns { marginMin, severity }. severity:
  //   'safe' if margin >= 60 min
  //   'tight' if 0 <= margin < 60
  //   'risk' if margin < 0 (arriving after sunset minus buffer)
  function sunsetMargin(etaMs, sunsetMs, bufferMin) {
    if (typeof bufferMin !== 'number') bufferMin = 30;
    const cutoff = sunsetMs - bufferMin * 60000;
    const marginMin = Math.round((cutoff - etaMs) / 60000);
    let severity;
    if (marginMin >= 60) severity = 'safe';
    else if (marginMin >= 0) severity = 'tight';
    else severity = 'risk';
    return { marginMin, severity };
  }

  // "H:MM AM/PM" in the given offset (defaults to Namibia UTC+2).
  // Pass {fmt:'24'} to get the legacy "HH:MM" 24-hour format.
  function formatTimeOfDay(epochMs, tzOffsetMin, opts) {
    if (typeof tzOffsetMin !== 'number') tzOffsetMin = NAMIBIA_TZ_OFFSET_MIN;
    if (!isFinite(epochMs)) return '--:--';
    const local = new Date(epochMs + tzOffsetMin * 60000);
    const h24 = local.getUTCHours();
    const m = String(local.getUTCMinutes()).padStart(2, '0');
    if (opts && opts.fmt === '24') {
      return `${String(h24).padStart(2, '0')}:${m}`;
    }
    const period = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${m} ${period}`;
  }

  // Human "in 1h 27m" style (positive minutes only). Used for "Sunset in …".
  function formatRelative(minutes) {
    const sign = minutes < 0 ? '-' : '';
    const abs = Math.abs(Math.round(minutes));
    if (abs >= 60) {
      const h = Math.floor(abs / 60);
      const m = abs % 60;
      return `${sign}${h}h ${m}m`;
    }
    return `${sign}${abs}m`;
  }

  return {
    NAMIBIA_TZ_OFFSET_MIN,
    sunriseSunsetUtc,
    parseDurationToMinutes,
    parseDistanceToMeters,
    etaFromCurrentStep,
    sunsetMargin,
    formatTimeOfDay,
    formatRelative
  };
});
