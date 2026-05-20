// lib/driving-core.js
// Pure functions: project GPS onto route, find current step, distance-to-next-turn,
// bearing for Street View heading, TTS threshold cross-detection.
// No DOM, no globals beyond the UMD export.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NamibiaDrivingCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const EARTH_R = 6371000;

  function toRad(d) { return d * Math.PI / 180; }
  function toDeg(r) { return r * 180 / Math.PI; }

  function distMeters(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, x))));
  }

  function bearing(a, b) {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLon = toRad(b.lng - a.lng);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function bearingForStreetView(step, nextStep) {
    if (!step || !nextStep) return 0;
    return bearing({ lat: step.lat, lng: step.lng }, { lat: nextStep.lat, lng: nextStep.lng });
  }

  // Project p onto segment a→b using flat equirectangular approximation
  // (fine over ~10 km at Namibia latitudes). Returns:
  //   { perpM: perpendicular distance in m,
  //     alongM: distance along segment from a in m (clamped to [0, segM]),
  //     segM: total segment length in m,
  //     t: alongM / segM (clamped 0..1) }
  function projectOntoSegment(p, a, b) {
    const segM = distMeters(a, b);
    if (segM === 0) {
      return { perpM: distMeters(p, a), alongM: 0, segM: 0, t: 0 };
    }
    // Convert to local x/y in metres around segment-start.
    const latScale = Math.cos(toRad((a.lat + b.lat) / 2));
    const ax = 0, ay = 0;
    const bx = (b.lng - a.lng) * latScale * 111320;
    const by = (b.lat - a.lat) * 110540;
    const px = (p.lng - a.lng) * latScale * 111320;
    const py = (p.lat - a.lat) * 110540;
    const segDot = bx * bx + by * by;
    let t = (px * bx + py * by) / segDot;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + bx * t;
    const projY = ay + by * t;
    const perpM = Math.hypot(px - projX, py - projY);
    const alongM = t * segM;
    return { perpM, alongM, segM, t };
  }

  // Flatten a route's steps into a list of { legIdx, stepIdx, lat, lng } points so we
  // can build segments between consecutive steps. The last step's "next" is the leg's
  // end if available (step.endLat/endLng) — falls back to repeating the same point.
  function flattenSteps(route) {
    const flat = [];
    if (!route || !route.legs) return flat;
    route.legs.forEach((leg, li) => {
      leg.steps.forEach((step, si) => {
        flat.push({
          legIdx: li,
          stepIdx: si,
          lat: Number(step.lat),
          lng: Number(step.lng),
          endLat: Number(step.endLat ?? step.lat),
          endLng: Number(step.endLng ?? step.lng),
          step
        });
      });
    });
    return flat;
  }

  // Find which segment of the route the GPS is closest to.
  // Returns { legIdx, stepIdx, distToStepM, distToNextTurnM, perpM, segment }
  // or { offRoute: true, nearest: {...} } if perpendicular distance exceeds maxOffRouteM.
  function findCurrentStep(gps, route, opts) {
    opts = opts || {};
    const maxOffRouteM = opts.maxOffRouteM || 1000;
    const flat = flattenSteps(route);
    if (!gps || flat.length < 2) return { offRoute: true, nearest: null };

    let best = null;
    for (let i = 0; i < flat.length - 1; i++) {
      const a = flat[i];
      const b = flat[i + 1];
      const proj = projectOntoSegment(gps, a, b);
      if (!best || proj.perpM < best.proj.perpM) {
        best = { idx: i, a, b, proj };
      }
    }
    if (!best) return { offRoute: true, nearest: null };

    // Boundary nudge: if we're at the very end of this segment (t≈1), advance to
    // the next segment so "current step" reflects the step we're about to drive,
    // not the one we just finished. Same perpM, more useful semantics.
    if (best.proj.t >= 0.9999 && best.idx < flat.length - 2) {
      const a2 = flat[best.idx + 1];
      const b2 = flat[best.idx + 2];
      best = { idx: best.idx + 1, a: a2, b: b2, proj: projectOntoSegment(gps, a2, b2) };
    }

    // "Current step" = the one we're traveling within (idx → idx+1).
    const a = best.a;
    const b = best.b;
    const remainingOnSegM = Math.max(0, best.proj.segM - best.proj.alongM);
    const result = {
      legIdx: a.legIdx,
      stepIdx: a.stepIdx,
      // Distance remaining until we *reach* the next step's start (i.e. the turn).
      distToNextTurnM: remainingOnSegM,
      // Distance to the start of the current segment (negative-ish, but we return
      // 0 when past it). Used by ETA proration as "metres into this step".
      distToStepM: Math.max(0, best.proj.alongM),
      perpM: best.proj.perpM,
      segment: { from: a, to: b }
    };
    if (best.proj.perpM > maxOffRouteM) {
      return { offRoute: true, nearest: result };
    }
    return result;
  }

  // distanceToNextTurn — convenience wrapper.
  function distanceToNextTurn(gps, route) {
    const cur = findCurrentStep(gps, route);
    if (cur.offRoute) return Infinity;
    return cur.distToNextTurnM;
  }

  // Reorder cards so the next 5 upcoming are highlighted. Past cards stay in order
  // before the current; future cards stay in order after. activeIndex is included
  // for the caller's auto-scroll logic.
  function relevantCards(gps, route) {
    const cards = (route && route.cards) || [];
    if (!cards.length) return { cards, activeIndex: -1 };
    if (!gps) return { cards, activeIndex: -1 };
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') continue;
      const d = distMeters(gps, { lat: c.lat, lng: c.lng });
      if (d < bestD) { bestD = d; best = i; }
    }
    return { cards, activeIndex: best };
  }

  // Cumulative distance (m) along `path` to the vertex nearest to point p.
  // Used to measure progress monotonically ALONG the route, so the active card
  // advances 0→N without the back-and-forth jumps that 2-D nearest-card has
  // when the route doubles back near itself.
  function routeProgressM(path, p) {
    if (!Array.isArray(path) || path.length === 0) return 0;
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = distMeters(p, path[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    let cum = 0;
    for (let i = 1; i <= bestI; i++) cum += distMeters(path[i - 1], path[i]);
    return cum;
  }

  // Distance (m) ALONG the route to a card, measured in step-distance space
  // (each step's straight-line length, accumulated). Turn/arrival cards map to
  // their own step; event cards (pressure/fuel) map to the nearest step. This
  // is robust to the overviewPath being decimated (which collapses short city
  // turns to the same vertex) because it uses the steps' own coordinates.
  function cardDistMeta(route) {
    const cards = (route && route.cards) || [];
    let meta = route && route.__cardDistMeta;
    if (meta && meta.n === cards.length) return meta;
    const steps = [];
    let cum = 0;
    (route.legs || []).forEach((leg, li) => (leg.steps || []).forEach((s, si) => {
      const a = { lat: s.lat, lng: s.lng };
      const b = { lat: (typeof s.endLat === 'number' ? s.endLat : s.lat), lng: (typeof s.endLng === 'number' ? s.endLng : s.lng) };
      const lenM = distMeters(a, b);
      steps.push({ li, si, lat: a.lat, lng: a.lng, endLat: b.lat, endLng: b.lng, cum, lenM });
      cum += lenM;
    }));
    const cardDist = cards.map(c => {
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return Infinity;
      if (typeof c.legIdx === 'number' && typeof c.stepIdx === 'number') {
        const st = steps.find(s => s.li === c.legIdx && s.si === c.stepIdx);
        if (st) return st.cum;
      }
      let bi = 0, bd = Infinity;
      for (let i = 0; i < steps.length; i++) { const d = distMeters(c, { lat: steps[i].lat, lng: steps[i].lng }); if (d < bd) { bd = d; bi = i; } }
      return steps.length ? steps[bi].cum : Infinity;
    });
    meta = { n: cards.length, steps, cardDist, totalM: cum };
    try { route.__cardDistMeta = meta; } catch (_) {}
    return meta;
  }

  // Monotonic "active card" = the next card at/ahead of the driver's distance
  // along the route (the one you're approaching). Measured in step-distance
  // space so it advances through EVERY card in order — fixing the demo skipping
  // early city turns and never surfacing the pressure/fuel cards. Falls back to
  // 2-D nearest when the route has no legs (unit-test fixtures).
  function activeCardIndex(gps, route) {
    const cards = (route && route.cards) || [];
    if (!cards.length || !gps) return -1;
    if (!route.legs || !route.legs.length) return relevantCards(gps, route).activeIndex;
    const meta = cardDistMeta(route);
    const steps = meta.steps;
    if (!steps.length) return relevantCards(gps, route).activeIndex;
    // Driver distance along route: project GPS onto the nearest step segment.
    let bi = 0, bestPerp = Infinity, bestAlong = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const proj = projectOntoSegment(gps, { lat: s.lat, lng: s.lng }, { lat: s.endLat, lng: s.endLng });
      if (proj.perpM < bestPerp) { bestPerp = proj.perpM; bi = i; bestAlong = Math.max(0, Math.min(s.lenM, proj.alongM)); }
    }
    const driverDist = steps[bi].cum + bestAlong;
    const cd = meta.cardDist;
    let best = -1, bestGap = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const gap = cd[i] - driverDist;
      if (gap >= -120 && gap < bestGap) { bestGap = gap; best = i; }
    }
    if (best < 0) {
      for (let i = cards.length - 1; i >= 0; i--) { if (isFinite(cd[i])) { best = i; break; } }
    }
    return best;
  }

  // Returns the threshold name that has just been crossed, or null. Caller tracks
  // which threshold was last fired so each fires once per card.
  // Thresholds: 'arrive' (≤30 m), 'now' (≤100 m), '500m' (≤500 m), '2km' (≤2 km).
  function ttsTriggerThresholds(prevDistM, curDistM, lastFired) {
    const TH = [
      { name: '2km',    dist: 2000 },
      { name: '500m',   dist: 500 },
      { name: '100m',   dist: 100 },
      { name: 'arrive', dist: 30 }
    ];
    const order = ['__none__', '2km', '500m', '100m', 'arrive'];
    const lastIdx = order.indexOf(lastFired || '__none__');
    for (let i = TH.length - 1; i >= 0; i--) {
      const t = TH[i];
      if (curDistM <= t.dist && order.indexOf(t.name) > lastIdx) {
        return t.name;
      }
    }
    return null;
  }

  function shouldAnnounceNow(prevDistM, curDistM, thresholdM) {
    if (typeof prevDistM !== 'number') return curDistM <= thresholdM;
    return prevDistM > thresholdM && curDistM <= thresholdM;
  }

  // ===================== Heather rating engine =====================
  // Status is rule-derived from surface + zones (research-cautious): loose
  // surfaces (gravel/dirt/sand) and the worst cities are RED; benign tar (the
  // Sesriem park road) is GREEN; every other paved/town road is YELLOW. The
  // curated prose lives in the patches' authored notes and is layered on top.

  // Zones that override the surface rule (centre lat/lng + radius metres).
  const RED_ZONES = [
    { lat: -22.570, lng: 17.083, rM: 9000, name: 'Windhoek' },          // capital CBD/suburbs
    { lat: -22.955, lng: 14.502, rM: 5000, name: 'Walvis Bay harbour' } // port truck traffic
  ];
  const GREEN_ZONES = [
    { lat: -24.601, lng: 15.577, rM: 32000, name: 'Sesriem park road' } // gate → 2x4 carpark tar
  ];

  function roadInfo(instruction) {
    const t = String(instruction || ''); const u = t.toUpperCase(); const l = t.toLowerCase();
    if (/\bsand\b|\bdune\b|deflate|deadvlei/.test(l)) return { surface: 'sand', code: 'sand' };
    let m;
    if ((m = u.match(/\bB\s?(\d{1,2})\b/))) return { surface: 'paved', code: 'B' + m[1] };
    if ((m = u.match(/\bC\s?(\d{1,3})\b/))) return { surface: 'gravel', code: 'C' + m[1] };
    if ((m = u.match(/\bD\s?(\d{1,4})\b/))) return { surface: 'dirt', code: 'D' + m[1] };
    if ((m = u.match(/\bM\s?\d{1,2}\b/))) return { surface: 'paved', code: m[0].replace(/\s/g, '') };
    if (/highway|trunk|bypass|motorway|freeway/.test(l)) return { surface: 'paved', code: 'hwy' };
    if (/street|avenue|\broad\b|drive|lane|boulevard|str\b/.test(l)) return { surface: 'urban', code: 'urban' };
    return { surface: null, code: null }; // unknown → inherit prevCtx
  }
  function inZone(p, zones) { for (const z of zones) { if (distMeters(p, z) < z.rM) return z; } return null; }

  // rateStep(step, prevCtx) → { status:'yes'|'maybe'|'no', surface, code }
  function rateStep(step, prevCtx) {
    prevCtx = prevCtx || {};
    const info = roadInfo(step && step.instruction);
    const surface = info.surface || prevCtx.surface || 'paved';
    const code = info.code || prevCtx.code || null;
    const p = { lat: Number(step && step.lat), lng: Number(step && step.lng) };
    let status;
    if (surface === 'gravel' || surface === 'dirt' || surface === 'sand') status = 'no'; // loose (incl. inherited)
    else if (isFinite(p.lat) && inZone(p, RED_ZONES)) status = 'no';        // busy city/harbour
    else if (isFinite(p.lat) && inZone(p, GREEN_ZONES)) status = 'yes';     // benign tar (Sesriem park road)
    else status = 'maybe';                                                  // research-cautious paved/town
    return { status, surface, code };
  }

  function parseDurationMin(text) {
    const t = String(text || ''); let m = 0;
    const h = t.match(/(\d+)\s*hour/i); if (h) m += parseInt(h[1], 10) * 60;
    const mi = t.match(/(\d+)\s*min/i); if (mi) m += parseInt(mi[1], 10);
    if (!h && !mi) { const n = t.match(/(\d+)/); if (n) m += parseInt(n[1], 10); }
    return m;
  }
  function parseDistM(text) {
    const t = String(text || '');
    let m = t.match(/([\d.]+)\s*km/i); if (m) return parseFloat(m[1]) * 1000;
    m = t.match(/([\d.]+)\s*m\b/i); if (m) return parseFloat(m[1]);
    return 0;
  }
  function nearestIdx(path, p) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < path.length; i++) { const d = distMeters(p, path[i]); if (d < bd) { bd = d; bi = i; } }
    return bi;
  }

  // Group the route's steps into contiguous same-status legs, summing Google
  // step time + distance. Merges <2-min slivers so the bar isn't fragmented.
  function heatherLegs(route) {
    if (!route || !route.legs) return [];
    const path = route.overviewPath || [];
    const flat = []; let prev = {};
    route.legs.forEach(leg => (leg.steps || []).forEach(s => {
      const r = rateStep(s, prev); prev = { surface: r.surface, code: r.code };
      flat.push({ status: r.status, surface: r.surface, code: r.code, durMin: parseDurationMin(s.duration), distM: parseDistM(s.distance), lat: Number(s.lat), lng: Number(s.lng), instruction: String(s.instruction || '') });
    }));
    if (!flat.length) return [];
    let legs = []; let cur = null;
    for (const f of flat) {
      if (!cur || cur.status !== f.status) { cur = { status: f.status, surfaces: {}, codes: [], durMin: 0, distM: 0, first: f, last: f, steps: [] }; legs.push(cur); }
      cur.durMin += f.durMin; cur.distM += f.distM; cur.last = f; cur.steps.push(f);
      cur.surfaces[f.surface] = (cur.surfaces[f.surface] || 0) + (f.durMin || 0.1);
      if (f.code && cur.codes.indexOf(f.code) < 0) cur.codes.push(f.code);
    }
    // Merge sub-2-min slivers into the larger adjacent leg.
    let changed = true;
    while (changed && legs.length > 1) {
      changed = false;
      for (let i = 0; i < legs.length; i++) {
        if (legs[i].durMin >= 2) continue;
        const prevL = legs[i - 1], nextL = legs[i + 1];
        const into = (!nextL || (prevL && prevL.durMin >= nextL.durMin)) ? prevL : nextL;
        if (!into) break;
        into.durMin += legs[i].durMin; into.distM += legs[i].distM;
        for (const k in legs[i].surfaces) into.surfaces[k] = (into.surfaces[k] || 0) + legs[i].surfaces[k];
        legs[i].codes.forEach(c => { if (into.codes.indexOf(c) < 0) into.codes.push(c); });
        if (into === prevL) { into.last = legs[i].last; into.steps = into.steps.concat(legs[i].steps); }
        else { into.first = legs[i].first; into.steps = legs[i].steps.concat(into.steps); }
        legs.splice(i, 1); changed = true; break;
      }
    }
    // Coalesce adjacent legs that now share a status (a sliver merge can leave
    // two same-status legs side by side).
    for (let i = legs.length - 1; i > 0; i--) {
      if (legs[i].status === legs[i - 1].status) {
        const a = legs[i - 1], b = legs[i];
        a.durMin += b.durMin; a.distM += b.distM; a.last = b.last;
        for (const k in b.surfaces) a.surfaces[k] = (a.surfaces[k] || 0) + b.surfaces[k];
        b.codes.forEach(c => { if (a.codes.indexOf(c) < 0) a.codes.push(c); });
        a.steps = a.steps.concat(b.steps);
        legs.splice(i, 1);
      }
    }
    const total = legs.reduce((a, l) => a + l.durMin, 0) || 1;
    let acc = 0;
    legs.forEach(l => {
      l.surface = Object.keys(l.surfaces).sort((a, b) => l.surfaces[b] - l.surfaces[a])[0] || 'paved';
      l.fromInstruction = l.first.instruction; l.toInstruction = l.last.instruction;
      l.fromLat = l.first.lat; l.fromLng = l.first.lng; l.toLat = l.last.lat; l.toLng = l.last.lng;
      l.fromIdx = path.length ? nearestIdx(path, l.first) : 0;
      l.toIdx = path.length ? nearestIdx(path, l.last) : 0;
      l.t0Frac = acc / total; acc += l.durMin; l.t1Frac = acc / total;
      delete l.surfaces; delete l.steps;
    });
    return legs;
  }

  function heatherSummary(route) {
    const legs = heatherLegs(route);
    const totalMin = legs.reduce((a, l) => a + l.durMin, 0);
    const totalKm = legs.reduce((a, l) => a + l.distM, 0) / 1000;
    const byTime = s => legs.filter(l => l.status === s).reduce((a, l) => a + l.durMin, 0);
    const t = totalMin || 1;
    return {
      legs, totalMin, totalKm,
      pctYesByTime: Math.round(byTime('yes') / t * 100),
      pctMaybeByTime: Math.round(byTime('maybe') / t * 100),
      pctNoByTime: Math.round(byTime('no') / t * 100)
    };
  }

  function legAtProgress(route, gps) {
    const legs = heatherLegs(route);
    const path = (route && route.overviewPath) || [];
    if (!legs.length || !gps) return null;
    if (!path.length) return legs[0];
    const idx = nearestIdx(path, gps);
    for (const l of legs) {
      if (idx >= Math.min(l.fromIdx, l.toIdx) && idx <= Math.max(l.fromIdx, l.toIdx)) return l;
    }
    return legs[legs.length - 1];
  }

  // Monotonic along-route distance (m) from GPS to a target point (the next
  // turn / active card) — replaces straight-line distance so the countdown
  // ticks down smoothly along curves. Clamped ≥ 0.
  function distAlongRouteToCard(route, gps, card) {
    const path = (route && route.overviewPath) || [];
    if (!path.length || !gps || !card || typeof card.lat !== 'number') return Infinity;
    const gp = routeProgressM(path, gps);
    const cp = routeProgressM(path, { lat: card.lat, lng: card.lng });
    return Math.max(0, cp - gp);
  }

  return {
    distMeters,
    bearing,
    bearingForStreetView,
    projectOntoSegment,
    flattenSteps,
    findCurrentStep,
    distanceToNextTurn,
    relevantCards,
    routeProgressM,
    activeCardIndex,
    ttsTriggerThresholds,
    shouldAnnounceNow,
    rateStep,
    roadInfo,
    heatherLegs,
    heatherSummary,
    legAtProgress,
    distAlongRouteToCard,
    parseDurationMin,
    parseDistM,
    RED_ZONES,
    GREEN_ZONES
  };
});
