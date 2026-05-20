// Namibia PWA v19 — Multi-color route segments + compass orientation.
//
// 1) Splits each day's overviewPath polyline into sub-polylines colored by the
//    Heather segment ("can_drive"=green / "partial"=amber / nothing=red) that
//    covers each portion. Segments map to portions of the route by matching
//    `from` / `to` text against d.stops.
//
// 2) Updates v12's stepStaticMapUrl so each step's static-map slice uses the
//    color of the Heather segment containing it (so the Directions tab shows
//    per-step Heather coloring).
//
// 3) Adds a 🧭 compass-lock toggle on the Driving Dashboard. When on:
//      * iOS: requests DeviceOrientationEvent permission
//      * Listens for deviceorientation events
//      * CSS-rotates #driveMapHost so the heading-of-travel points up
//    This is best-effort: works in mobile browsers where deviceorientation is
//    granted; on desktop it's a no-op.
(function () {
  const COLORS = {
    yes:   '#15803d',
    maybe: '#eab308',
    no:    '#dc2626'
  };
  const STATIC_HEX = { yes: '0x15803d', maybe: '0xeab308', no: '0xdc2626' };
  const STATUS_WHO = { yes: 'Heather', maybe: 'Caution', no: 'David' };

  // Distance threshold (m): if a Heather segment's from/to is within this many
  // metres of a stop, we consider it a match.
  const MATCH_RADIUS_M = 5000;

  function distMeters(a, b) {
    if (window.NamibiaDrivingCore?.distMeters) return window.NamibiaDrivingCore.distMeters(a, b);
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat), lat2 = rad(b.lat);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // Given a Heather segment description, try to anchor it to two stops in d.stops.
  // Strategy: full-name then partial substring match on `from` / `to` against stop name.
  function anchorSegment(seg, stops) {
    const lower = s => String(s || '').toLowerCase();
    const fromText = lower(seg.from);
    const toText = lower(seg.to);
    // Match in BOTH directions: segment text might be shorter than stop name
    // ("Windhoek" vs "Windhoek Hilton Hotel") or longer ("Hosea Kutako
    // International Airport" vs "Hosea Kutako Airport"). We accept either-side
    // substring inclusion.
    const matches = (segText, name) => {
      if (!segText || !name) return false;
      return segText.includes(name) || name.includes(segText);
    };
    let fromStop = stops.find(s => matches(fromText, lower(s.name)));
    let toStop = stops.find(s => matches(toText, lower(s.name)));
    return { fromStop, toStop };
  }

  // Find index of the path point nearest to a {lat, lng}.
  function nearestPathIdx(path, p) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = distMeters(path[i], p);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { idx: best, distM: bestD };
  }

  // Returns an ordered array of { fromIdx, toIdx, status }.
  // status ∈ { 'yes', 'maybe', 'no' }. Portions not covered by any anchored
  // Heather segment default to 'no' (David drives).
  function partitionPath(path, day) {
    if (!path || path.length < 2) return [];
    // Prefer the computed, rule-based Heather legs so the map colouring matches
    // the Overview/driving sequence bar exactly. Falls back to the authored
    // heatherDriveSegments below when the engine/route isn't available.
    try {
      const DC = window.NamibiaDrivingCore;
      const route = (typeof state !== 'undefined' && state.renderedRoutes && day) ? state.renderedRoutes[day.date] : null;
      if (DC && DC.heatherLegs && route && route.legs && route.legs.length && route.overviewPath === path) {
        const legs = DC.heatherLegs(route);
        if (legs.length) {
          // Make the partitions CONTIGUOUS so the polyline has no gaps: each leg
          // spans from its own start vertex to where the NEXT leg starts (and the
          // first/last legs extend to the route ends). Without this, the stretch
          // between one leg's last-step start and the next leg's first-step start
          // — and the route start/end — go undrawn, splitting the line.
          const sorted = legs
            .map(l => ({ fromIdx: Math.min(l.fromIdx, l.toIdx), status: l.status }))
            .sort((a, b) => a.fromIdx - b.fromIdx);
          const out = [];
          for (let i = 0; i < sorted.length; i++) {
            const fromIdx = i === 0 ? 0 : sorted[i].fromIdx;
            const toIdx = i === sorted.length - 1 ? (path.length - 1) : sorted[i + 1].fromIdx;
            if (toIdx <= fromIdx && i !== sorted.length - 1) continue; // drop zero-length non-final
            out.push({ fromIdx, toIdx, status: sorted[i].status, label: STATUS_WHO[sorted[i].status] || 'David', reason: '' });
          }
          if (out.length) return out;
        }
      }
    } catch (_) {}
    const stops = (day.stops || []).filter(s => s.routeRole === 'mandatory');
    const segments = (day.heatherDriveSegments || []).map(seg => {
      const { fromStop, toStop } = anchorSegment(seg, stops);
      let fromIdx = fromStop ? nearestPathIdx(path, fromStop).idx : -1;
      let toIdx = toStop ? nearestPathIdx(path, toStop).idx : -1;
      // If only `from` matched, extend the segment until the next stop after it.
      if (fromIdx >= 0 && toIdx < 0) {
        const fromStopOrder = stops.indexOf(fromStop);
        const nextStop = stops[fromStopOrder + 1];
        if (nextStop) toIdx = nearestPathIdx(path, nextStop).idx;
        else toIdx = path.length - 1;
      } else if (toIdx >= 0 && fromIdx < 0) {
        fromIdx = 0;
      }
      if (fromIdx < 0 || toIdx < 0) return null;
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      const status = seg.status === 'can_drive' ? 'yes' : 'maybe';
      return {
        fromIdx: lo, toIdx: hi, status,
        label: seg.label || (status === 'yes' ? 'Heather OK' : 'Heather maybe'),
        reason: seg.reason || ''
      };
    }).filter(Boolean);

    const DAVID_NOTE = 'David drives this portion — conditions or complexity make Heather unsuitable here.';

    // Sort segments by start. Fill gaps with 'no'.
    segments.sort((a, b) => a.fromIdx - b.fromIdx);
    const out = [];
    let cursor = 0;
    for (const seg of segments) {
      if (seg.fromIdx > cursor) {
        out.push({ fromIdx: cursor, toIdx: seg.fromIdx, status: 'no', label: 'David drives', reason: DAVID_NOTE });
      }
      out.push(seg);
      cursor = Math.max(cursor, seg.toIdx);
    }
    if (cursor < path.length - 1) {
      out.push({ fromIdx: cursor, toIdx: path.length - 1, status: 'no', label: 'David drives', reason: DAVID_NOTE });
    }
    if (out.length === 0) {
      out.push({ fromIdx: 0, toIdx: path.length - 1, status: 'no', label: 'David drives', reason: DAVID_NOTE });
    }
    return out;
  }

  // Which Heather status applies to a given step. Computed DIRECTLY from the
  // rule engine with the same prevCtx carry as heatherLegs, so a step's status
  // is exact — not a path-index lookup, which mis-assigns steps that land on a
  // partition boundary vertex.
  function partitionForStep(route, day, legIdx, stepIdx) {
    const step = route?.legs?.[legIdx]?.steps?.[stepIdx];
    if (!step) return null;
    const DC = window.NamibiaDrivingCore;
    if (DC && DC.rateStep && route.legs) {
      let prev = {};
      for (let li = 0; li < route.legs.length; li++) {
        const steps = route.legs[li].steps || [];
        for (let si = 0; si < steps.length; si++) {
          const r = DC.rateStep(steps[si], prev);
          prev = { surface: r.surface, code: r.code };
          if (li === legIdx && si === stepIdx) return { status: r.status, label: STATUS_WHO[r.status] || 'David', reason: '' };
        }
      }
    }
    // Fallback: path-index lookup against the authored partitions.
    const path = route?.overviewPath;
    if (!path) return null;
    const parts = partitionPath(path, day);
    const idx = nearestPathIdx(path, { lat: step.lat, lng: step.lng }).idx;
    return parts.find(p => idx >= p.fromIdx && idx <= p.toIdx) || null;
  }

  // ---- Suppress v9's burgundy polyline, draw our segmented set instead ----
  let segmentedPolylines = [];
  let suppressedColor = '#5a1738';
  let lastDrawnKey = null;

  function clearSegmented() {
    segmentedPolylines.forEach(p => { try { p.setMap(null); } catch (_) {} });
    segmentedPolylines = [];
  }

  function drawSegmented(map, path, day) {
    const parts = partitionPath(path, day);
    if (!parts.length || !window.google?.maps?.Polyline) return false;
    const key = day.date + ':' + parts.map(p => `${p.fromIdx}-${p.toIdx}:${p.status}`).join(',');
    if (lastDrawnKey === key) return true;
    clearSegmented();
    const Orig = window.google.maps.Polyline.__orig || window.google.maps.Polyline;
    const arrowSym = { path: google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 3, strokeColor: '#1f2937', strokeOpacity: 0.95, strokeWeight: 2 };
    parts.forEach(part => {
      const slice = path.slice(part.fromIdx, part.toIdx + 1).map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
      if (slice.length < 2) return;
      const pl = new Orig({
        path: slice, map,
        geodesic: false,
        strokeColor: COLORS[part.status],
        strokeOpacity: 0.95,
        strokeWeight: 6,
        zIndex: 10,
        icons: [{ icon: arrowSym, offset: '0%', repeat: '90px' }]
      });
      segmentedPolylines.push(pl);
    });
    lastDrawnKey = key;
    return true;
  }

  // Monkey-patch Polyline to:
  //  - suppress v9's burgundy whole-route polyline (we draw our own segments)
  //  - leave per-step modal polylines alone
  function patchPolyline() {
    if (!window.google?.maps?.Polyline) return;
    if (google.maps.Polyline.__v19Patched) return;
    const Orig = google.maps.Polyline.__orig || google.maps.Polyline;
    function Patched(opts) {
      try {
        const isWholeRoute = opts && opts.path && opts.path.length > 2
          && (opts.strokeColor === '#5a1738'
              || /^#5a1738/i.test(opts.strokeColor || '')
              || (window.NamibiaV17 && opts.strokeColor === window.NamibiaV17.metaFor(window.day && window.day())?.color));
        if (isWholeRoute) {
          // Defer to segmented drawing; return a stub polyline that's already off-map.
          const stub = new Orig({ path: opts.path, geodesic: false, strokeOpacity: 0 });
          stub.setMap(null);
          // Now actually draw the segments using the same map (extracted from opts).
          if (opts.map) {
            const d = window.day && window.day();
            if (d) drawSegmented(opts.map, opts.path, d);
          }
          return stub;
        }
      } catch (_) {}
      return new Orig(opts);
    }
    Patched.prototype = Orig.prototype;
    Patched.__v19Patched = true;
    Patched.__orig = Orig;
    google.maps.Polyline = Patched;
  }

  function installWhenReady() {
    if (window.google && google.maps) {
      patchPolyline();
      // v9 may have already drawn the sidebar polyline BEFORE our patch
      // installed (race: v19's interval polls at 200ms, but v9 draws
      // synchronously inside the SDK callback). Force it to redraw so our
      // segmented coloring takes effect.
      if (typeof window.namibiaForceRedrawSidebarRoute === 'function') {
        setTimeout(() => {
          try { window.namibiaForceRedrawSidebarRoute(); } catch (_) {}
        }, 50);
      }
      return true;
    }
    return false;
  }
  if (!installWhenReady()) {
    // Tighter polling — 16ms / one animation frame — so we catch the SDK
    // load nearly synchronously, minimising the window where v9 might draw
    // through the un-patched constructor.
    const t = setInterval(() => { if (installWhenReady()) clearInterval(t); }, 16);
    setTimeout(() => clearInterval(t), 60000);
  }

  // ---- Update step static map URL to color the polyline by the Heather
  // segment that contains the step ----
  if (window.NamibiaV12 && typeof window.NamibiaV12.stepStaticMapUrl === 'function') {
    window.NamibiaV12.stepStaticMapUrl = function v19StepMapUrl(slice, a, b) {
      if (!state.apiKey) return '';
      // Find Heather status at the midpoint of this step.
      const mid = slice[Math.floor(slice.length / 2)] || a;
      const d = window.day && window.day();
      let color = '0xdc2626'; // default red
      if (d) {
        const overview = state.renderedRoutes?.[d.date]?.overviewPath || [];
        const parts = partitionPath(overview, d);
        const midIdx = nearestPathIdx(overview, mid).idx;
        const containing = parts.find(p => midIdx >= p.fromIdx && midIdx <= p.toIdx);
        if (containing) color = STATIC_HEX[containing.status] || color;
      }
      const params = new URLSearchParams({
        size: '320x200', scale: '2', maptype: 'roadmap', key: state.apiKey
      });
      params.append('path', `color:${color}ff|weight:5|enc:${window.NamibiaV12.encodePolyline(window.NamibiaV12.sampledPath(slice))}`);
      // S = start (green), F = finish (red). Static-Maps "color:" with named
      // values yields the canonical Google red/green pushpin shape with a
      // single letter label centered on the pin.
      params.append('markers', `color:0x16a34a|label:S|${a.lat},${a.lng}`);
      params.append('markers', `color:0xdc2626|label:F|${b.lat},${b.lng}`);
      return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    };
  }

  // ---- Compass orientation (best-effort) ----
  let compassActive = false;
  let lastHeadingDeg = 0;
  function applyHeading(deg) {
    const host = document.getElementById('driveMapHost');
    if (!host) return;
    // Rotate the host so the heading-of-travel points up. We rotate the map
    // div via CSS transform; the GPS marker also rotates with it which is
    // fine (it's a dot).
    lastHeadingDeg = deg;
    host.style.transform = `rotate(${-deg}deg)`;
    host.style.transition = 'transform 200ms linear';
  }

  function handleOrientation(e) {
    const alpha = e.webkitCompassHeading != null ? e.webkitCompassHeading : (typeof e.alpha === 'number' ? (360 - e.alpha) : null);
    if (alpha == null) return;
    applyHeading(alpha);
  }

  async function enableCompass() {
    if (compassActive) return;
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const p = await DeviceOrientationEvent.requestPermission();
        if (p !== 'granted') { alert('Compass permission denied.'); return; }
      }
      window.addEventListener('deviceorientation', handleOrientation, true);
      compassActive = true;
      updateCompassBtn();
    } catch (e) {
      alert('Compass unavailable: ' + (e && e.message || e));
    }
  }
  function disableCompass() {
    window.removeEventListener('deviceorientation', handleOrientation, true);
    compassActive = false;
    const host = document.getElementById('driveMapHost');
    if (host) host.style.transform = 'rotate(0deg)';
    updateCompassBtn();
  }
  function updateCompassBtn() {
    const btn = document.getElementById('compassToggle');
    if (!btn) return;
    btn.textContent = compassActive ? '🧭 Compass: on' : '🧭 Compass';
    btn.setAttribute('aria-pressed', String(compassActive));
  }

  function injectCompassButton() {
    if (state?.activeTab !== 'street') return;
    const controls = document.querySelector('.drive-controls');
    if (!controls || controls.querySelector('#compassToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'compassToggle';
    btn.className = 'ghost';
    btn.textContent = '🧭 Compass';
    btn.title = 'Rotate the dashboard map to your direction of travel (mobile only)';
    btn.onclick = () => compassActive ? disableCompass() : enableCompass();
    const replay = controls.querySelector('#ttsReplay');
    if (replay) replay.insertAdjacentElement('afterend', btn);
    else controls.appendChild(btn);
  }
  // Observe tabContent so the button re-injects whenever the dashboard rebuilds.
  if (typeof MutationObserver !== 'undefined') {
    const root = document.getElementById('tabContent');
    if (root) {
      const obs = new MutationObserver(() => injectCompassButton());
      obs.observe(root, { childList: true, subtree: true });
    }
    injectCompassButton();
  }

  window.NamibiaV19 = {
    partitionPath, partitionForStep, anchorSegment, nearestPathIdx, drawSegmented, clearSegmented,
    enableCompass, disableCompass, getCompass: () => ({ active: compassActive, heading: lastHeadingDeg })
  };
})();
