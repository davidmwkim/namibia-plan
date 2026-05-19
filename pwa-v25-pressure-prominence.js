// Namibia PWA v25 — Make mandatory tyre-pressure checks unmissable.
//
//   * Overview tab: bright banner near the top of every day that has a
//     pressure action, with direction (LOWER for sand/gravel, RAISE for tar).
//   * Sidebar map: larger pulsing triangle markers for pressure stops with an
//     explicit ↓ (lower) or ↑ (raise) glyph in the icon.
//   * Driving Dashboard sticky chip warning "Tyre pressure check ahead" when
//     the closest upcoming card kind === 'pressure'.
(function () {
  // Direction priority:
  //   1. Explicit `stop.pressureAction` field ('up' | 'down' | 'check').
  //   2. Otherwise: keyword heuristic on the `stop.pressure` text. RAISE
  //      keywords beat LOWER keywords when both appear (e.g. "re-inflate
  //      after gravel" → up, even though it contains "gravel").
  function pressureDirection(text, stop) {
    if (stop && (stop.pressureAction === 'up' || stop.pressureAction === 'raise')) return 'up';
    if (stop && (stop.pressureAction === 'down' || stop.pressureAction === 'lower')) return 'down';
    if (stop && stop.pressureAction === 'check') return null;
    if (!text) return null;
    const t = String(text).toLowerCase();
    // Check RAISE keywords FIRST so "re-inflate after gravel" classifies as up.
    if (/(raise|inflate|increase|harden|tar pressure|highway pressure|paved pressure|reinflate|re-inflate|back to (tar|highway|gravel))/.test(t)) return 'up';
    if (/(lower|deflate|drop|reduce|sand pressure|gravel pressure|soft pressure|off-?road)/.test(t)) return 'down';
    return null;
  }

  function pressureBannerHtml(d) {
    const stops = (d.stops || []).filter(s => s.pressure);
    if (!stops.length) return '';
    return `<div class="press-banner">${stops.map(s => {
      const dir = pressureDirection(s.pressure, s);
      const arrow = dir === 'down' ? '⬇️ LOWER' : dir === 'up' ? '⬆️ RAISE' : '🛞 CHECK';
      const cls = dir === 'down' ? 'press-down' : dir === 'up' ? 'press-up' : 'press-neutral';
      const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div class="press-row ${cls}">
        <span class="press-arrow">${arrow}</span>
        <strong>${esc(s.emoji ? s.emoji + ' ' : '')}${esc(s.name)} ${esc(s.time || '')}</strong>
        <div class="press-detail">${esc(s.pressure)}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function injectOverviewBanner() {
    if (state?.activeTab !== 'overview') return;
    const tc = document.getElementById('tabContent');
    if (!tc || tc.querySelector('.press-banner')) return;
    const d = day();
    const html = pressureBannerHtml(d);
    if (!html) return;
    // Insert after the sun-line if present, else after the panel-title.
    const sunLine = tc.querySelector('.sun-line');
    const panelTitle = tc.querySelector('.panel-title');
    if (sunLine) sunLine.insertAdjacentHTML('afterend', html);
    else if (panelTitle) panelTitle.insertAdjacentHTML('afterend', html);
    else tc.insertAdjacentHTML('afterbegin', html);
  }

  // Boost v18's pressure markers with a clearer direction glyph and larger size.
  // We patch the Marker constructor inline once per session.
  function svgUp(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <path d="M14 2 L26 24 L2 24 Z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="14" y="20" font-size="12" font-weight="800" text-anchor="middle" fill="#fff">↑</text>
    </svg>`;
  }
  function svgDown(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <path d="M2 4 L26 4 L14 26 Z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="14" y="14" font-size="12" font-weight="800" text-anchor="middle" fill="#fff">↓</text>
    </svg>`;
  }
  function svgQ(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <path d="M2 4 L26 4 L14 26 Z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="14" y="14" font-size="12" font-weight="800" text-anchor="middle" fill="#fff">!</text>
    </svg>`;
  }
  function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

  function pressureIcon(stop) {
    if (!window.google?.maps) return null;
    const dir = pressureDirection(stop?.pressure, stop);
    const color = stop?.routeRole === 'optional' ? '#f59e0b' : '#dc2626';
    const svg = dir === 'up' ? svgUp(color) : (dir === 'down' ? svgDown(color) : svgQ(color));
    return {
      url: svgUrl(svg),
      scaledSize: new google.maps.Size(28, 28),
      anchor: new google.maps.Point(14, 14)
    };
  }

  function patchMarkerForPressure() {
    if (!window.google?.maps?.Marker || google.maps.Marker.__v25Patched) return;
    const Orig = google.maps.Marker.__orig || google.maps.Marker;
    function Patched(opts) {
      try {
        if (opts && opts.title && typeof opts.title === 'string') {
          const d = window.day && window.day();
          if (d) {
            const match = (d.stops || []).find(s => opts.title.includes(s.name));
            if (match && match.pressure) {
              const icon = pressureIcon(match);
              if (icon) { opts.icon = icon; opts.label = null; opts.zIndex = 900; }
            }
          }
        }
      } catch (_) {}
      return new Orig(opts);
    }
    Patched.prototype = Orig.prototype;
    Patched.__v25Patched = true;
    Patched.__orig = Orig;
    google.maps.Marker = Patched;
  }

  function installPatchesWhenReady() {
    if (window.google?.maps?.Marker) {
      patchMarkerForPressure();
      return true;
    }
    return false;
  }
  if (!installPatchesWhenReady()) {
    const t = setInterval(() => { if (installPatchesWhenReady()) clearInterval(t); }, 200);
    setTimeout(() => clearInterval(t), 60000);
  }

  // Drive Dashboard chip: render a sticky pressure-warning line when the
  // active card OR the next upcoming card is kind:'pressure'.
  function injectDriveDashboardPressureChip() {
    if (state?.activeTab !== 'street') return;
    const sticky = document.querySelector('.drive-sticky');
    if (!sticky) return;
    const d = day();
    const route = state.renderedRoutes?.[d?.date];
    if (!route?.cards) {
      sticky.querySelector('.press-chip')?.remove();
      return;
    }
    const active = state.driving?.activeCardIndex ?? -1;
    const nearby = route.cards.slice(Math.max(0, active), active + 3).find(c => c.kind === 'pressure');
    if (!nearby) {
      sticky.querySelector('.press-chip')?.remove();
      return;
    }
    const dir = pressureDirection(nearby.body);
    const arrow = dir === 'down' ? '⬇️ LOWER' : dir === 'up' ? '⬆️ RAISE' : '🛞 CHECK';
    const cls = dir === 'down' ? 'press-chip-down' : dir === 'up' ? 'press-chip-up' : '';
    let chip = sticky.querySelector('.press-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'press-chip ' + cls;
      sticky.appendChild(chip);
    } else {
      chip.className = 'press-chip ' + cls;
    }
    chip.innerHTML = `<strong>${arrow}</strong> tyre pressure — ${nearby.stopName || nearby.title}`;
  }

  if (typeof renderTab === 'function') {
    const base = renderTab;
    renderTab = function patchedRenderTabV25() {
      const r = base();
      try { injectOverviewBanner(); } catch (_) {}
      try { injectDriveDashboardPressureChip(); } catch (_) {}
      return r;
    };
  }
  injectOverviewBanner();

  window.NamibiaV25 = { pressureDirection, pressureIcon, pressureBannerHtml };
})();
