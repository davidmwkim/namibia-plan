// Namibia PWA v11 patch: larger live map + print/PDF Google static maps and turn-by-turn directions.
(function () {
  function encodePolyline(points) {
    let lastLat = 0;
    let lastLng = 0;
    let result = '';
    const encodeValue = value => {
      value = value < 0 ? ~(value << 1) : (value << 1);
      let chunk = '';
      while (value >= 0x20) {
        chunk += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
      }
      return chunk + String.fromCharCode(value + 63);
    };
    for (const point of points) {
      const lat = Math.round(Number(point.lat) * 1e5);
      const lng = Math.round(Number(point.lng) * 1e5);
      result += encodeValue(lat - lastLat);
      result += encodeValue(lng - lastLng);
      lastLat = lat;
      lastLng = lng;
    }
    return result;
  }

  function sampledPath(points, maxPoints = 90) {
    if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
    const step = Math.ceil(points.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
    const last = points[points.length - 1];
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    return sampled;
  }

  function markerLabel(index) {
    const labels = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return labels[Math.min(index, labels.length - 1)];
  }

  function staticMapUrl(d, size = '640x640') {
    const apiKey = state.apiKey || localStorage.getItem('namibia_google_api_key') || '';
    if (!apiKey) return '';
    const mandatory = routeStops(d);
    const cachedPath = state.renderedRoutes?.[d.date]?.overviewPath;
    const routePath = Array.isArray(cachedPath) && cachedPath.length >= 2
      ? cachedPath
      : mandatory.map(s => ({ lat: s.lat, lng: s.lng }));
    if (!routePath || routePath.length < 2) return '';

    const params = new URLSearchParams({ size, scale: '2', maptype: 'roadmap', key: apiKey });
    params.append('path', `color:0x5a1738ff|weight:6|enc:${encodePolyline(sampledPath(routePath))}`);
    mandatory.forEach((s, i) => params.append('markers', `color:0x5a1738|label:${markerLabel(i)}|${Number(s.lat)},${Number(s.lng)}`));
    d.stops.filter(s => s.routeRole === 'optional').forEach(s => params.append('markers', `size:small|color:0x777777|${Number(s.lat)},${Number(s.lng)}`));
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  }

  function heatherPrintBlockForDay(d) {
    const segs = d.heatherDriveSegments || [];
    if (!segs.length) return '';
    return `<div class="print-heather segment-level"><h3>Heather driving segments</h3>${segs.map(seg => {
      const icon = seg.status === 'can_drive' ? '✅' : '⚠️';
      return `<p><strong>${icon} ${esc(seg.label || 'Heather maybe')}</strong><br>${esc(seg.from || '')} → ${esc(seg.to || '')}<br>${esc(seg.reason || '')}</p>`;
    }).join('')}<p><strong>Rule:</strong> No Heather segment badge means David should own that leg/section.</p></div>`;
  }

  function fallbackRouteList(d) {
    const stops = routeStops(d);
    if (!stops.length) return '<p>No self-drive route for this day.</p>';
    return `<ol>${stops.map((s, i) => `<li><strong>${markerLabel(i)}</strong> ${esc(s.emoji || '')} ${esc(s.name)} <small>${esc(s.time || '')}</small></li>`).join('')}</ol>`;
  }

  function printDirectionsHtml(d) {
    const route = state.renderedRoutes?.[d.date];
    if (!route?.legs?.length) {
      return `<p><strong>Turn-by-turn directions:</strong> Render routes online first with “Save key + render all”. Until then, use this mandatory stop order:</p>${fallbackRouteList(d)}`;
    }
    return route.legs.map((leg, legIndex) => `
      <div class="print-directions-leg">
        <h4>Leg ${legIndex + 1}: ${esc(leg.start || '')} → ${esc(leg.end || '')}</h4>
        <p><strong>${esc(leg.distance || '')}</strong> · <strong>${esc(leg.duration || '')}</strong></p>
        <ol>${(leg.steps || []).map(step => `<li>${esc(step.instruction || '')} <small>${esc(step.distance || '')} · ${esc(step.duration || '')}</small></li>`).join('')}</ol>
      </div>`).join('');
  }

  function printMapHtml(d) {
    const url = staticMapUrl(d);
    if (!url) return '<div class="print-google-map unavailable"><p>Google map unavailable. Enter the API key and tap “Save key + render all” before printing.</p></div>';
    return `<div class="print-google-map"><img src="${url}" alt="Google route map for Day ${d.day}: ${esc(d.title)}"></div>`;
  }

  function addMapHint() {
    const el = document.querySelector('.mini-map');
    if (!el || el.querySelector('.map-size-note')) return;
    const note = document.createElement('div');
    note.className = 'map-size-note';
    note.textContent = 'Google route draws here after “Save key + render all”.';
    el.appendChild(note);
  }

  const baseRender = render;
  render = function renderWithLargeMapHint() {
    baseRender();
    addMapHint();
  };

  renderPrintPages = function renderPrintPagesWithGoogleMaps() {
    $('printPages').innerHTML = DATA.days.map(d => `
      <article class="print-day">
        <h1>Day ${d.day}: ${esc(d.title)}</h1>
        <h2>${esc(d.date)} · ${d.selfDrive ? 'Self-drive / route day' : 'Guided or local day'}</h2>
        ${printMapHtml(d)}
        <div class="print-experience">
          <h3>What to expect on this leg</h3>
          <p><strong>${esc(d.driveExperience?.summary || '')}</strong></p>
          <ul>${(d.driveExperience?.expect || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <p><strong>Watch for:</strong> ${(d.driveExperience?.hazards || []).map(esc).join(' · ')}</p>
        </div>
        ${heatherPrintBlockForDay(d)}
        <section class="print-directions">
          <h3>Turn-by-turn directions</h3>
          ${printDirectionsHtml(d)}
        </section>
        <p>${esc(d.routeNotes)}</p>
        <div class="print-grid">
          ${d.stops.map(s => `<div class="print-card"><h3>${esc((s.emoji || '') + ' ' + (s.time || '') + ' — ' + s.name)}</h3><p><b>TYPE:</b> ${esc(s.type)} · <b>Route:</b> ${esc(s.routeRole)}</p><p>${esc(s.notes)}</p>${s.pressure ? `<p><b>Tyre:</b> ${esc(s.pressure)}</p>` : ''}${s.fuel ? `<p><b>Fuel:</b> ${esc(s.fuel)}</p>` : ''}<p><a href="${wazeUrl(s)}">Waze</a> · <a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}">Google Maps</a></p></div>`).join('')}
        </div>
      </article>`).join('');
  };

  printMode = function printModeWithGoogleMaps() {
    renderPrintPages();
    window.print();
  };

  window.namibiaStaticMapUrlForDay = staticMapUrl;
})();
