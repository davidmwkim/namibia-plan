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

  // Curated, research-grounded specifics by road code (Heather context).
  const CODE_WHY = {
    C24: 'Spreetshoogte Pass — ~17% grade, ~1,000 m drop over 4 km of switchbacks, no guardrails.',
    C14: 'Kuiseb & Gaub passes — steep, drop-offs, no guardrails, heavy corrugations, very remote.',
    C19: 'badly corrugated gravel, remote.',
    D1918: 'corrugated gravel to Spitzkoppe (last ~10 km rough).',
    B1: 'fast trucks + livestock; the Okahandja–Otjiwarongo stretch is one of Namibia’s deadliest.',
    B2: 'town-throughs (Usakos / Karibib / Okahandja), port trucks near Walvis, Usakos–Karibib roadworks.',
    B6: 'merges into Windhoek’s ring roads.'
  };
  // Compose the "why this Heather rating" sentence from the rule status + the
  // road's surface/code, grounded in the route research.
  function heatherWhy(status, road, segReason) {
    const code = (road && road.code && /^[A-Z]\d/.test(road.code)) ? road.code : '';
    const extra = CODE_WHY[code] ? ' ' + CODE_WHY[code] : '';
    if (status === 'no') {
      if (road.type === 'sand') return `🔴 David — deep sand needs deflation + 4x4 technique Heather hasn’t built up.${extra}`;
      if (road.type === 'gravel' || road.type === 'unpaved') return `🔴 David — Heather doesn’t drive loose gravel/dirt; expect corrugations, dust, ~60–80 km/h.${extra}`;
      return `🔴 David — busy town driving: frequent turns, junctions and traffic.${extra}`;
    }
    if (status === 'yes') return `🟢 Heather — open, low-traffic tar; one of her easy stretches.${extra}`;
    // status === 'maybe' (yellow)
    return `🟡 Heather, with caution — it’s paved, but ${code ? code + ' has ' : 'expect '}merges, junctions, town-throughs or livestock; David should be ready to take over.${extra}`;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function enhanceStepLi(liEl, step, leg, legIdx, stepIdx, route, day) {
    if (!liEl || liEl.querySelector('.step-road')) return;
    const road = classifyRoad(step.instruction, day);
    step.surface = road.type; // persist so the route/step maps can dash by surface
    const part = window.NamibiaV19 ? window.NamibiaV19.partitionForStep(route, day, legIdx, stepIdx) : null;
    const status = part?.status || 'no';
    const segReason = part?.reason || '';

    // Single collapsed disclosure with three terse rows. Default is closed so
    // most steps look clean — open it on the steps you actually care about.
    const detailsEl = document.createElement('details');
    detailsEl.className = 'step-conditions';
    detailsEl.innerHTML = `
      <summary class="step-conditions-summary">
        <span class="step-road-pill">${esc(road.code)}</span>
        <span class="step-conditions-toggle">conditions ▾</span>
      </summary>
      <div class="step-conditions-body">
        <div class="step-road"><strong>Road:</strong> ${esc(road.detail)}</div>
        <div class="step-rain"><strong>Rain:</strong> ${esc(RAIN_IMPACT[road.type] || RAIN_IMPACT.mixed)}</div>
        <div class="step-why"><strong>Heather rating:</strong> ${esc(heatherWhy(status, road, segReason))}</div>
      </div>`;
    const anchor = liEl.querySelector('.step-media') || null;
    if (anchor) liEl.insertBefore(detailsEl, anchor);
    else liEl.appendChild(detailsEl);
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
