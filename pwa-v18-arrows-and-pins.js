// Namibia PWA v18 — direction arrows on polylines + categorized map pins.
//
//   * Polylines (sidebar map, dashboard map, modal map) get FORWARD_OPEN_ARROW
//     icons repeated along the line so you can see direction-of-travel.
//   * Static Maps URLs (per-step thumbnails, print map) place a green "S"
//     marker at the leg start and a red "E" marker at the leg end.
//   * Sidebar interactive markers are recolored / shape-coded by category:
//       fuel       — orange diamond + ⛽
//       pressure   — red (mandatory) / amber (optional) inverted triangle + 🛞
//       food       — purple square + 🍽
//       start      — green circle + S
//       end        — red circle + E
//       other      — default red Google pin (unchanged)
//
// Implementation strategy: monkey-patch google.maps.Polyline + Marker
// constructors right after the JS SDK loads so EVERY polyline/marker created
// anywhere in the app (v9, v13, modal map, etc.) picks up the new styling.
(function () {
  const ARROW_SYMBOL_OPTS = () => ({
    path: window.google?.maps?.SymbolPath?.FORWARD_OPEN_ARROW ?? 1,
    scale: 3,
    strokeColor: '#1f2937',
    strokeOpacity: 0.95,
    strokeWeight: 2
  });

  function categorize(stop) {
    if (!stop) return 'other';
    if (stop.tripStopType === 'start') return 'start';
    if (stop.tripStopType === 'end') return 'end';
    if (stop.fuel) return 'fuel';
    if (stop.pressure) return stop.routeRole === 'optional' ? 'pressure_optional' : 'pressure';
    const typ = String(stop.type || '').toLowerCase();
    if (/(lunch|breakfast|dinner|restaurant|cafe|food|grocery|market)/.test(typ)) return 'food';
    return 'other';
  }

  // SVG circle marker icon factory.
  function dotIcon(color, scale, strokeColor) {
    if (!window.google?.maps?.SymbolPath) return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: scale || 9,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: strokeColor || '#fff',
      strokeWeight: 2
    };
  }

  // SVG diamond/inverted-triangle data URL — small set of distinctive shapes.
  function svgDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function diamondSvg(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <path d="M11 2 L20 11 L11 20 L2 11 Z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="11" y="14.5" font-size="10" text-anchor="middle" fill="#fff" font-weight="700">⛽</text>
    </svg>`;
  }
  function triangleDownSvg(color, optional) {
    const label = optional ? '?' : '!';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <path d="M2 4 L20 4 L11 20 Z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="11" y="13" font-size="10" text-anchor="middle" fill="#fff" font-weight="700">${label}</text>
    </svg>`;
  }
  function squareSvg(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <rect x="3" y="3" width="16" height="16" rx="3" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="11" y="14.5" font-size="10" text-anchor="middle" fill="#fff" font-weight="700">🍽</text>
    </svg>`;
  }
  function circleSvg(color, letter) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="9" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="11" y="14.5" font-size="11" text-anchor="middle" fill="#fff" font-weight="700">${letter}</text>
    </svg>`;
  }

  function iconForCategory(cat) {
    if (!window.google?.maps) return null;
    const size = new google.maps.Size(22, 22);
    const anchor = new google.maps.Point(11, 11);
    switch (cat) {
      case 'start':              return { url: svgDataUrl(circleSvg('#16a34a', 'S')), scaledSize: size, anchor };
      case 'end':                return { url: svgDataUrl(circleSvg('#dc2626', 'F')), scaledSize: size, anchor };
      case 'fuel':               return { url: svgDataUrl(diamondSvg('#f59e0b')), scaledSize: size, anchor };
      case 'pressure':           return { url: svgDataUrl(triangleDownSvg('#dc2626', false)), scaledSize: size, anchor };
      case 'pressure_optional':  return { url: svgDataUrl(triangleDownSvg('#f59e0b', true)), scaledSize: size, anchor };
      case 'food':               return { url: svgDataUrl(squareSvg('#7c3aed')), scaledSize: size, anchor };
      default:                   return null; // let Google use the default pin
    }
  }

  // Standard Google-Maps-style blue-dot GPS indicator.
  function gpsIcon() {
    if (!window.google?.maps?.SymbolPath) return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#4285F4',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3
    };
  }

  // Per-map accuracy circles, keyed by the map instance.
  const accuracyCircles = new WeakMap();
  function ensureAccuracyCircle(map, center, radiusM) {
    if (!map || !window.google?.maps?.Circle) return;
    let circle = accuracyCircles.get(map);
    if (!circle) {
      circle = new google.maps.Circle({
        map,
        strokeColor: '#4285F4',
        strokeOpacity: 0.4,
        strokeWeight: 1,
        fillColor: '#4285F4',
        fillOpacity: 0.15,
        radius: radiusM,
        center
      });
      accuracyCircles.set(map, circle);
    } else {
      circle.setMap(map);
      circle.setCenter(center);
      circle.setRadius(radiusM);
    }
  }

  function isGpsMarker(opts) {
    if (!opts) return false;
    if (opts.label === 'YOU') return true;
    if (typeof opts.title === 'string' && /gps/i.test(opts.title)) return true;
    return false;
  }

  function isStartStop(stop, day) {
    if (!day || !stop) return false;
    if (stop.tripStopType === 'start') return true;
    const stops = (day.stops || []).filter(s => s.routeRole === 'mandatory');
    return stops[0] === stop;
  }
  function isEndStop(stop, day) {
    if (!day || !stop) return false;
    if (stop.tripStopType === 'end') return true;
    const stops = (day.stops || []).filter(s => s.routeRole === 'mandatory');
    return stops[stops.length - 1] === stop;
  }

  // ---- Monkey-patch Marker so newly-constructed markers get categorized icons ----
  function patchMarker() {
    if (!window.google?.maps?.Marker) return;
    if (google.maps.Marker.__v18Patched) return;
    const Orig = google.maps.Marker;
    function Patched(opts) {
      try {
        if (opts) {
          if (isGpsMarker(opts)) {
            opts.icon = gpsIcon();
            opts.label = null;
            opts.zIndex = 1000;
            opts.title = 'Your location';
            // Also place an accuracy circle on the marker's map.
            queueMicrotask(() => {
              try {
                if (opts.map && opts.position) {
                  const radius = (typeof state !== 'undefined' && state.gpsAccuracy) || 80;
                  ensureAccuracyCircle(opts.map, opts.position, radius);
                }
              } catch (_) {}
            });
          } else if (opts.position && typeof opts.title === 'string') {
            const d = window.day && window.day();
            if (d) {
              const match = (d.stops || []).find(s => opts.title.includes(s.name));
              if (match) {
                let cat = categorize(match);
                if (cat === 'other') {
                  if (isStartStop(match, d)) cat = 'start';
                  else if (isEndStop(match, d)) cat = 'end';
                }
                const icon = iconForCategory(cat);
                if (icon) {
                  opts.icon = icon;
                  opts.label = null;
                }
              }
            }
          }
        }
      } catch (_) {}
      return new Orig(opts);
    }
    Patched.prototype = Orig.prototype;
    Patched.__v18Patched = true;
    Patched.__orig = Orig;
    google.maps.Marker = Patched;
  }

  // ---- Monkey-patch Polyline so it gets direction arrows ----
  function patchPolyline() {
    if (!window.google?.maps?.Polyline) return;
    // v17 may already have wrapped Polyline; we wrap again to add arrow icons.
    if (google.maps.Polyline.__v18Patched) return;
    const Orig = google.maps.Polyline;
    function Patched(opts) {
      try {
        if (opts && Array.isArray(opts.path) && opts.path.length >= 2) {
          // Append arrow icon entries if the caller didn't provide its own.
          const arrows = opts.icons || [];
          if (!arrows.some(a => a && a.icon && a.icon.path === google.maps.SymbolPath.FORWARD_OPEN_ARROW)) {
            arrows.push({
              icon: ARROW_SYMBOL_OPTS(),
              offset: '0%',
              repeat: '90px'
            });
          }
          opts.icons = arrows;
        }
      } catch (_) {}
      return new Orig(opts);
    }
    Patched.prototype = Orig.prototype;
    Patched.__v18Patched = true;
    Patched.__orig = Orig;
    google.maps.Polyline = Patched;
  }

  function installPatchesWhenReady() {
    if (window.google && google.maps) {
      patchMarker();
      patchPolyline();
      return true;
    }
    return false;
  }
  if (!installPatchesWhenReady()) {
    const t = setInterval(() => {
      if (installPatchesWhenReady()) clearInterval(t);
    }, 200);
    setTimeout(() => clearInterval(t), 60000);
  }

  // ---- Update v12's Static Maps URLs: green S / red E markers ----
  // The Static Maps API doesn't render direction arrows along the path, but
  // green-start / red-end markers convey direction at a glance.
  if (window.NamibiaV12 && typeof window.NamibiaV12.stepStaticMapUrl === 'function') {
    const oldFn = window.NamibiaV12.stepStaticMapUrl;
    window.NamibiaV12.stepStaticMapUrl = function v18StepMapUrl(slice, a, b) {
      // Rebuild the URL with colored start/end markers.
      if (!state.apiKey) return '';
      const params = new URLSearchParams({
        size: '320x200', scale: '2', maptype: 'roadmap', key: state.apiKey
      });
      params.append('path', `color:0x${heatherColorHex()}ff|weight:5|enc:${window.NamibiaV12.encodePolyline(window.NamibiaV12.sampledPath(slice))}`);
      params.append('markers', `color:green|label:S|${a.lat},${a.lng}`);
      params.append('markers', `color:red|label:E|${b.lat},${b.lng}`);
      return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    };
  }
  // Also recolor the day-level static map (v11's printMapHtml uses staticMapUrl
  // on its own; tinker by wrapping window.namibiaStaticMapUrlForDay).
  if (typeof window.namibiaStaticMapUrlForDay === 'function') {
    const oldDay = window.namibiaStaticMapUrlForDay;
    window.namibiaStaticMapUrlForDay = function v18StaticMapUrl(d, size) {
      const url = oldDay(d, size);
      if (!url) return url;
      // Append start/end markers if not already present.
      const stops = (d.stops || []).filter(s => s.routeRole === 'mandatory');
      if (stops.length < 2) return url;
      const u = new URL(url);
      u.searchParams.append('markers', `color:0x16a34a|label:S|${stops[0].lat},${stops[0].lng}`);
      u.searchParams.append('markers', `color:0xdc2626|label:F|${stops[stops.length-1].lat},${stops[stops.length-1].lng}`);
      return u.toString();
    };
  }

  // Heather color hex (mirrors v17) for the static map polyline.
  function heatherColorHex() {
    const v17 = window.NamibiaV17;
    if (!v17) return '5a1738';
    const meta = v17.metaFor(window.day && window.day());
    return (meta?.color || '#5a1738').replace('#', '');
  }

  window.NamibiaV18 = { iconForCategory, categorize, heatherColorHex };
})();
