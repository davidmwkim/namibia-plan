// Namibia PWA v22 — road conditions, rain impact, and Heather-why per step.
//
// Adds three new blocks under each step in the Directions tab:
//   1. Road conditions (independent of Heather): surface type inferred from the
//      Namibian road code in the instruction (B / C / D / M).
//   2. Rain impact + what to do.
//   3. Why this Heather rating was assigned, given the road and segment reason.
(function () {
  // ---- Namibian road-code → surface classification ----
  // B-roads: bituminous (paved) trunk highways
  // C-roads: secondary, mostly gravel with patches of bitumen
  // D-roads: district, unpaved (gravel/sand/rock)
  // M-roads: municipal paved
  const ROAD_DETAIL = {
    paved:   'Bituminous (paved) road. Smooth surface, standard rules apply. Typical legal limit 100–120 km/h on open paved roads.',
    gravel:  'Gravel surface — usually well-graded but corrugated in stretches. Typical safe speed 60–80 km/h; loose surface lengthens braking distance ~2×.',
    unpaved: 'Unpaved district road. Variable surface: gravel, sand, washouts, embedded rocks. Speeds 30–60 km/h; expect dust, livestock, and animal crossings.',
    sand:    'Soft sand / dune section. Requires deflated tyres (~1.4 bar), low-range engagement, and continuous momentum. Stop on a downslope where possible.',
    urban:   'Urban / town street. Pedestrians, intersections, traffic lights. Standard 60 km/h or signed limit.',
    mixed:   'Mixed local roads — surface and conditions vary segment to segment.'
  };

  const RAIN_IMPACT = {
    paved:   'Rain: minor impact. Watch for aquaplaning at speed and oil-slicks after a dry spell. Visibility drops sharply in heavy downpours — slow down and turn on lights.',
    gravel:  'Rain: gravel becomes slick and potholes fill with water (hiding depth). Drop speed to 40–60 km/h. Avoid hard braking — let off-road reduce speed instead.',
    unpaved: 'Rain: can become impassable. Washouts, deep mud, river crossings (riverbeds = "low-water crossings" flood quickly). If rain is forecast on this leg, consider rerouting via paved alternative or delaying departure.',
    sand:    'Rain: briefly firms up compacted sand, then turns soft sand into bog. Recovery becomes much harder. Avoid this section if rain is active.',
    urban:   'Rain: drainage is generally OK in Windhoek / Swakopmund. Watch for standing water at intersections and slick paint on crossings.',
    mixed:   'Rain: check the worst surface type on this leg before deciding. Local advice from the lodge or Solitaire stop is the best signal.'
  };

  function classifyRoad(instruction, day) {
    const t = String(instruction || '');
    const upper = t.toUpperCase();
    const lower = t.toLowerCase();
    // Direct surface keywords win first
    if (/\bsand\b|\bdune\b|deflate/.test(lower)) {
      return { type: 'sand', code: 'sand', detail: ROAD_DETAIL.sand };
    }
    // Namibian road-code prefixes
    const bMatch = upper.match(/\bB\s?(\d{1,2})\b/);
    if (bMatch) return { type: 'paved', code: 'B' + bMatch[1], detail: ROAD_DETAIL.paved };
    const cMatch = upper.match(/\bC\s?(\d{1,3})\b/);
    if (cMatch) return { type: 'gravel', code: 'C' + cMatch[1], detail: ROAD_DETAIL.gravel };
    const dMatch = upper.match(/\bD\s?(\d{1,4})\b/);
    if (dMatch) return { type: 'unpaved', code: 'D' + dMatch[1], detail: ROAD_DETAIL.unpaved };
    const mMatch = upper.match(/\bM\s?\d{1,2}\b/);
    if (mMatch) return { type: 'paved', code: mMatch[0].replace(/\s/g, ''), detail: ROAD_DETAIL.paved };
    // Token-based fallbacks
    if (/highway|trunk|bypass|motorway/.test(lower)) return { type: 'paved', code: 'highway', detail: ROAD_DETAIL.paved };
    if (/street|avenue|road\b|drive|lane|boulevard|alley/.test(lower) && /windhoek|swakopmund|walvis|otjiwarongo|tsumeb/i.test(lower + ' ' + (day?.title || ''))) {
      return { type: 'urban', code: 'urban', detail: ROAD_DETAIL.urban };
    }
    // Default: assume mixed local
    return { type: 'mixed', code: 'mixed', detail: ROAD_DETAIL.mixed };
  }

  // Compose the "why this Heather rating" sentence.
  function heatherWhy(status, road, segReason) {
    const reasonTail = segReason ? ` (Source note: ${segReason})` : '';
    if (status === 'yes') {
      if (road.type === 'paved' || road.type === 'urban') return `Heather OK — ${road.code} is a paved / low-complexity section, well within her comfort zone.${reasonTail}`;
      return `Heather OK — this segment is rated drivable for her based on the trip-plan notes.${reasonTail}`;
    }
    if (status === 'maybe') {
      if (road.type === 'paved' || road.type === 'urban') return `Heather maybe — surface is paved, but conditional on traffic/signage clarity and that she feels rested. David should take over if anything feels off.${reasonTail}`;
      if (road.type === 'gravel') return `Heather maybe — gravel surface; she can manage short calm stretches but should hand back before corrugations or sharp turns.${reasonTail}`;
      return `Heather maybe — conditional on conditions matching the plan; David should monitor and be ready to swap.${reasonTail}`;
    }
    // status === 'no'
    if (road.type === 'sand') return `David drives — soft sand requires deflation, 4x4 technique, and recovery experience that Heather hasn't built up yet.${reasonTail}`;
    if (road.type === 'unpaved') return `David drives — district/unpaved roads can include washouts, sand patches, and embedded rock that demand off-road judgement.${reasonTail}`;
    if (road.type === 'gravel') return `David drives — gravel corrugations and the risk of oversteer on loose surface make this a David leg.${reasonTail}`;
    return `David drives — route complexity, fatigue management, or unfamiliar intersections make this a David leg.${reasonTail}`;
  }

  function blockHtml(label, body, cls) {
    const safe = String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="step-detail ${cls}"><strong>${label}:</strong> ${safe}</div>`;
  }

  function enhanceStepLi(liEl, step, leg, legIdx, stepIdx, route, day) {
    if (!liEl || liEl.querySelector('.step-detail')) return;
    const road = classifyRoad(step.instruction, day);
    const part = window.NamibiaV19 ? window.NamibiaV19.partitionForStep(route, day, legIdx, stepIdx) : null;
    const status = part?.status || 'no';
    const segReason = part?.reason || '';

    // Find a good insertion anchor: between the existing chip + reason block
    // and the step-media images, OR before .step-media if present.
    const anchor = liEl.querySelector('.step-media') || null;
    const blocks = document.createDocumentFragment();
    const w = document.createElement('div');
    w.className = 'step-details';
    w.innerHTML =
      blockHtml(`Road (${road.code})`, road.detail, 'step-road step-road-' + road.type) +
      blockHtml('Rain impact', RAIN_IMPACT[road.type] || RAIN_IMPACT.mixed, 'step-rain step-rain-' + road.type) +
      blockHtml('Why this Heather rating', heatherWhy(status, road, segReason), 'step-why step-why-' + status);
    blocks.appendChild(w);
    if (anchor) liEl.insertBefore(blocks, anchor);
    else liEl.appendChild(blocks);
  }

  function applyToDirectionsTab() {
    if (state.activeTab !== 'directions') return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const d = day();
    const route = state.renderedRoutes?.[d.date];
    if (!route?.legs) return;
    const ols = tc.querySelectorAll('.directions ol');
    route.legs.forEach((leg, li) => {
      const ol = ols[li];
      if (!ol) return;
      const lis = ol.querySelectorAll('li');
      leg.steps.forEach((step, si) => {
        enhanceStepLi(lis[si], step, leg, li, si, route, d);
      });
    });
  }

  // Run after each renderTab so the blocks are present whenever the
  // Directions tab is visible.
  if (typeof renderTab === 'function') {
    const base = renderTab;
    renderTab = function patchedRenderTabV22() {
      const r = base();
      applyToDirectionsTab();
      return r;
    };
  }
  applyToDirectionsTab();

  window.NamibiaV22 = { classifyRoad, heatherWhy, RAIN_IMPACT, ROAD_DETAIL, applyToDirectionsTab };
})();
