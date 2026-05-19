// lib/weather.js
// Pure helpers for parsing Open-Meteo hourly forecasts and mapping WMO weather
// codes to human-readable labels + emoji. No network calls here; the v23 patch
// handles fetch/cache. Exposed both via CJS `require` (for Vitest) and
// `window.NamibiaWeather` (for the browser patches).

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NamibiaWeather = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // WMO weather-code mapping (https://open-meteo.com/en/docs#weather_variable_documentation).
  function emojiForCode(code) {
    if (code === 0) return '☀️';
    if (code === 1) return '🌤️';
    if (code === 2) return '⛅';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 57) return '🌦️';
    if (code >= 61 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '🌨️';
    if (code === 80 || code === 81) return '🌧️';
    if (code === 82) return '⛈️';
    if (code === 85 || code === 86) return '🌨️';
    if (code === 95) return '⛈️';
    if (code === 96 || code === 99) return '⛈️';
    return '🌡️';
  }

  function labelForCode(code) {
    if (code === 0) return 'Clear';
    if (code === 1) return 'Mostly clear';
    if (code === 2) return 'Partly cloudy';
    if (code === 3) return 'Overcast';
    if (code === 45) return 'Fog';
    if (code === 48) return 'Freezing fog';
    if (code >= 51 && code <= 55) return 'Drizzle';
    if (code === 56 || code === 57) return 'Freezing drizzle';
    if (code === 61) return 'Light rain';
    if (code === 63) return 'Rain';
    if (code === 65) return 'Heavy rain';
    if (code === 66 || code === 67) return 'Freezing rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code === 80) return 'Light showers';
    if (code === 81) return 'Showers';
    if (code === 82) return 'Heavy showers';
    if (code === 85 || code === 86) return 'Snow showers';
    if (code === 95) return 'Thunderstorm';
    if (code === 96 || code === 99) return 'Thunderstorm with hail';
    return 'Mixed';
  }

  // True if the WMO code is rain-affecting (drives rain-impact warnings).
  function isRainy(code) {
    return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95 || code === 96 || code === 99;
  }

  // Pick the hourly forecast entry closest to an epoch ms timestamp.
  // Open-Meteo's `hourly.time` entries are ISO local strings ("2026-05-24T08:00")
  // because we request timezone:'auto' — they're in the location's local tz.
  // We expect the caller to pass an epoch ms already adjusted to that tz.
  function weatherAtLocalIso(forecast, isoHourString) {
    if (!forecast?.hourly?.time) return null;
    const times = forecast.hourly.time;
    const idx = times.indexOf(isoHourString);
    if (idx < 0) return null;
    return entryAt(forecast, idx);
  }
  function weatherNearestToLocalHour(forecast, localHourMs) {
    if (!forecast?.hourly?.time) return null;
    const times = forecast.hourly.time;
    let bestI = -1, bestDelta = Infinity;
    for (let i = 0; i < times.length; i++) {
      const t = Date.parse(times[i] + ':00Z'); // treat ISO as if UTC for comparison; both sides are tz-naive
      const delta = Math.abs(t - localHourMs);
      if (delta < bestDelta) { bestDelta = delta; bestI = i; }
    }
    if (bestI < 0) return null;
    return entryAt(forecast, bestI);
  }
  function entryAt(forecast, i) {
    return {
      isoLocal: forecast.hourly.time[i],
      tempC: forecast.hourly.temperature_2m?.[i],
      precipMm: forecast.hourly.precipitation?.[i],
      windKmh: forecast.hourly.wind_speed_10m?.[i],
      code: forecast.hourly.weather_code?.[i],
      emoji: emojiForCode(forecast.hourly.weather_code?.[i]),
      label: labelForCode(forecast.hourly.weather_code?.[i]),
      rainy: isRainy(forecast.hourly.weather_code?.[i])
    };
  }

  // Build a localStorage cache key keyed by (date, rounded lat, rounded lng).
  function cacheKey(date, lat, lng) {
    return `namibia_weather_v1:${date}:${Number(lat).toFixed(1)}:${Number(lng).toFixed(1)}`;
  }

  return {
    emojiForCode, labelForCode, isRainy,
    weatherAtLocalIso, weatherNearestToLocalHour,
    cacheKey
  };
});
