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

  return {
    distMeters,
    bearing,
    bearingForStreetView,
    projectOntoSegment,
    flattenSteps,
    findCurrentStep,
    distanceToNextTurn,
    relevantCards,
    ttsTriggerThresholds,
    shouldAnnounceNow
  };
});
