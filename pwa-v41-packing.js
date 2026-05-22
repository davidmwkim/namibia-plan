// Namibia PWA v41 — Per-day "what to pack", driven by the day's ACTIVITIES and
// the hyperlocal weather of its stops (clothing & layering recommendations).
//
//   * Overview tab: a "Packing for this day" card under the now-/malaria-cards.
//     - conditions line: the day's low→high from the live per-stop forecast
//       (falls back to seasonal climatology beyond the 16-day forecast horizon)
//     - a layering recommendation derived from those temps + wind + rain
//     - activity-specific gear (binoculars for game drives, warm layers for the
//       balloon launch, dry kit for kayaking, …) — web-researched
//     - a collapsible whole-trip checklist (persisted in localStorage)
//
// Weather is read from the v23 cache; for guided (non-self-drive) days v23 does
// NOT fetch, so this module fetches the day's stops itself (the cold pre-dawn
// Etosha game drives are exactly the case that matters most).
(function () {
  const NW = window.NamibiaWeather;
  const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fF = c => Math.round(c * 9 / 5 + 32);
  const v23 = () => window.NamibiaV23;

  // ---- Activity knowledge base (web-researched gear, [item, why]) -----------
  const ACTIVITIES = [
    {
      key: 'balloon', icon: '🎈', label: 'Hot-air balloon (sunrise)',
      match: s => s.emoji === '🎈' || /balloon/i.test(s.name || ''),
      gear: [
        ['Warm layers + windproof shell', 'pre-dawn launch is the coldest moment; the basket catches wind aloft'],
        ['Beanie + thin liner gloves', 'fingers chill gripping the basket rim before sunrise'],
        ['Snug hat, no loose brim', 'a floppy sun hat blows straight out of the basket'],
        ['Closed-toe shoes (no heels)', 'you walk over uneven desert ground to the launch site'],
        ['Compact binoculars', 'spot oryx, ostrich and dune detail far below from the basket'],
        ['Camera on a strap + dust bag', 'wide landscapes from altitude; fine silica dust on the ground'],
      ]
    },
    {
      key: 'game_drive', icon: '🦁', label: 'Game drive / safari',
      match: s => s.emoji === '🦁' || /game drive/i.test(s.name || ''),
      gear: [
        ['Binoculars 8×42 or 10×42 — one each', 'animals are distant on Etosha’s open pans; sharing means missing it'],
        ['Neutral colours (khaki / olive / tan)', 'bright colours and white spook wildlife and show every speck of dust'],
        ['Thermal base + fleece + windproof', '6 AM open-vehicle drives feel ~10°C with the wind chill'],
        ['Buff / neck gaiter', 'warmth at dawn, dust filter once the vehicle moves'],
        ['Telephoto (≥400mm) + wide-brim hat', 'distant animals; harsh glare off the white pan in the afternoon'],
        ['DEET repellent, cover skin at dusk', 'malaria precaution in the north — even in the dry season'],
      ]
    },
    {
      key: 'dunes', icon: '🏜️', label: 'Dune climbing (Sossusvlei / Deadvlei)',
      match: s => /sossusvlei|deadvlei|dune\s*45|big daddy|sesriem canyon|4x4 parking/i.test(s.name || ''),
      gear: [
        ['2 L+ water per person', 'no water inside the park; the Deadvlei walk bakes by 10 AM'],
        ['Climb barefoot, carry trainers', 'sand grips better barefoot at dawn but is scorching by mid-morning'],
        ['Wide-brim hat with a chin strap', 'zero shade and wind on the dune ridge'],
        ['SPF50+ and polarised sunglasses', 'relentless UV and glare off the orange sand'],
        ['Light long sleeves / UV layer', 'breathable sun cover beats cotton in the heat'],
      ]
    },
    {
      key: 'sandwich', icon: '🏖️', label: 'Sandwich Harbour 4×4',
      match: s => /sandwich harbour|sandwich bay/i.test(s.name || ''),
      gear: [
        ['Windproof jacket + a warm layer', 'the Atlantic dune coast is cold, foggy and windy in the morning'],
        ['Flat closed-toe shoes', 'you may wade briefly at the waterline'],
        ['Motion-sickness tablet', 'sustained steep angles on loose dune faces'],
        ['Camera in a sealed bag', 'salt spray and sand are brutal on electronics'],
      ]
    },
    {
      key: 'kayaking', icon: '🛶', label: 'Sea kayaking with seals',
      match: s => s.emoji === '🛶' || /kayak/i.test(s.name || ''),
      gear: [
        ['Quick-dry layers — no cotton', 'worn under the operator’s waterproofs; wet cotton chills you fast'],
        ['Full change of dry clothes', 'the June coast is miserable wet after the paddle'],
        ['Warm hat that fits under a hood', 'on-water mornings are 10–14°C in the fog'],
        ['Sunglasses on a retainer + SPF lip balm', 'fog still burns; splash takes loose glasses'],
      ]
    },
    {
      key: 'spitzkoppe', icon: '🪨', label: 'Spitzkoppe granite + stargazing',
      // not on the morning you drive away (the Lodge as the day's start stop)
      match: s => /spitzkoppe|spitzkoppen/i.test(s.name || '') && s.tripStopType !== 'start',
      gear: [
        ['Down / insulated jacket, beanie, gloves', 'granite nights drop to 2–5°C; stargazing is long and still'],
        ['Grippy hiking shoes', 'polished, steep granite — sandals slide'],
        ['Headlamp with red-light mode', 'camp navigation; red light keeps your night vision for the stars'],
        ['2–3 L water, sun hat, SPF50+', 'limited shade and the rock reflects UV'],
      ]
    },
  ];

  // ---- Regional seasonal climatology fallback (late May–early June, °C) ------
  // Used when there is no live forecast (beyond the 16-day horizon / offline).
  const CLIMO = {
    arrival: { lowC: 9, highC: 24, label: 'Windhoek highland' },
    desert: { lowC: 8, highC: 25, label: 'Namib interior' },
    dunes: { lowC: 5, highC: 25, label: 'Sossusvlei / Sesriem — near-freezing pre-dawn' },
    coast: { lowC: 11, highC: 19, label: 'Atlantic coast — foggy, windy, cool' },
    granite: { lowC: 4, highC: 24, label: 'Spitzkoppe — cold nights' },
    etosha: { lowC: 11, highC: 27, label: 'Etosha north — cold game-drive mornings' },
    return: { lowC: 9, highC: 26, label: '' },
    departure: { lowC: 9, highC: 24, label: 'Windhoek' },
    _default: { lowC: 8, highC: 25, label: '' }
  };

  // ---- Whole-trip essentials checklist (web-researched) ---------------------
  const ESSENTIALS = [
    ['Sun & dust', [
      'SPF50+ sunscreen (reapply every 90 min)',
      'Lip balm with SPF — lips crack within a day here',
      'Rich face/hand moisturiser — humidity drops below 10%',
      'UV sunglasses on a retainer/croakie',
      'Wide-brim hat with a chin strap',
      'Buff / neck gaiter (bring two)',
    ]],
    ['Layering', [
      'Merino/synthetic base layers (not cotton)',
      'Fleece mid-layer',
      'Insulated/down jacket for desert + Spitzkoppe nights',
      'Windproof/packable shell',
      'Beanie + light gloves for mornings',
    ]],
    ['Health', [
      'Malaria tablets (north) + DEET repellent',
      'Antihistamines for desert dust',
      'Personal first-aid kit',
      'Motion-sickness tablets (dune 4×4 / kayak)',
    ]],
    ['Tech & car', [
      'Headlamp with red-light mode',
      'Power bank (20,000 mAh+)',
      'Universal adapter (Type D/M, 220V)',
      'Offline maps downloaded (cell signal is rare)',
      'Bin liners inside each bag — gravel dust gets everywhere',
      'Insulated 1.5–2 L water bottle',
    ]],
  ];

  // ---- Activity detection ---------------------------------------------------
  function activitiesForDay(d) {
    const out = [];
    for (const a of ACTIVITIES) {
      const stop = (d.stops || []).find(s => a.match(s));
      if (stop) out.push(Object.assign({ stop }, a));
    }
    return out;
  }

  // ---- Weather -------------------------------------------------------------
  function hourFromTime(t) {
    const m = String(t || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    let h = +m[1]; const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h;
  }
  function cachedFc(date, s) {
    const W = v23();
    if (!W || !W._loadCached || typeof s.lat !== 'number') return null;
    return W._loadCached(date, s.lat, s.lng);
  }
  // Temp (and emoji) at a stop's own location + scheduled hour.
  function tempAtStop(d, stop) {
    const fc = cachedFc(d.date, stop);
    if (!fc || !fc.hourly) return null;
    const temps = fc.hourly.temperature_2m || [];
    const times = fc.hourly.time || [];
    const h = hourFromTime(stop.time);
    let idx = -1;
    if (h != null) idx = times.findIndex(ts => new Date(ts).getHours() === h);
    if (idx < 0) idx = (h != null && h < temps.length) ? h : 0;
    const c = temps[idx];
    if (!isFinite(c)) return null;
    const code = (fc.hourly.weather_code || [])[idx];
    return { tempC: c, emoji: NW ? NW.emojiForCode(code) : '' };
  }
  // Aggregate the day's low/high/wind/rain across every stop's hyperlocal forecast.
  function dayConditions(d) {
    let lo = Infinity, hi = -Infinity, wind = 0, rain = false, any = false;
    for (const s of (d.stops || [])) {
      const fc = cachedFc(d.date, s);
      if (!fc || !fc.hourly) continue;
      any = true;
      (fc.hourly.temperature_2m || []).forEach(t => { if (isFinite(t)) { lo = Math.min(lo, t); hi = Math.max(hi, t); } });
      (fc.hourly.wind_speed_10m || []).forEach(w => { if (isFinite(w)) wind = Math.max(wind, w); });
      (fc.hourly.precipitation || []).forEach(p => { if (p >= 0.5) rain = true; });
    }
    if (any && isFinite(lo)) return { lowC: lo, highC: hi, maxWind: wind, rain, source: 'forecast' };
    const cl = CLIMO[d.theme] || CLIMO._default;
    return { lowC: cl.lowC, highC: cl.highC, maxWind: 0, rain: false, source: 'seasonal', regionNote: cl.label };
  }

  // Fetch the day's stops' weather once (covers guided days v23 skips).
  const fetched = new Set();
  function ensureWeather(d) {
    const W = v23();
    if (!W || !W.fetchDayWeather || fetched.has(d.date)) return;
    const need = (d.stops || []).filter(s => typeof s.lat === 'number' && !cachedFc(d.date, s)).slice(0, 6);
    fetched.add(d.date);
    if (!need.length) return;
    Promise.allSettled(need.map(s =>
      W.fetchDayWeather(d.date, s.lat, s.lng).then(fc => { try { W._saveCached(d.date, s.lat, s.lng, fc); } catch (_) {} })
    )).then(rs => { if (rs.some(r => r.status === 'fulfilled')) { try { inject(); } catch (_) {} } });
  }

  // ---- Layering recommendation from the conditions -------------------------
  function layeringText(c) {
    const lo = Math.round(c.lowC), hi = Math.round(c.highC);
    let start;
    if (c.lowC <= 6) start = `Freezing pre-dawn (~${lo}°C): thermal base layer, an insulated/down jacket, beanie and light gloves`;
    else if (c.lowC <= 12) start = `Cold start (~${lo}°C): a fleece mid-layer under a windproof shell, plus a warm hat`;
    else if (c.lowC <= 16) start = `Cool start (~${lo}°C): a light fleece or long-sleeve`;
    else start = `Mild morning (~${lo}°C)`;
    let mid;
    if (c.highC >= 24) mid = `warm by midday (~${hi}°C) — strip to a breathable shirt and a sun hat`;
    else if (c.highC < 18) mid = `stays cool all day (~${hi}°C) — keep the warm layer on`;
    else mid = `mild afternoon (~${hi}°C)`;
    let s = `${start}; ${mid}.`;
    if ((c.highC - c.lowC) >= 15) s += ' Big day–night swing — pack removable layers.';
    if (c.maxWind >= 28) s += ' Windy — bring a windproof shell.';
    if (c.rain) s += ' Rain possible — a packable waterproof.';
    return s;
  }

  // ---- Trip-wide checklist (persisted) -------------------------------------
  const LS_KEY = 'namibia_packing_checked';
  function loadChecked() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function saveChecked(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (_) {} }
  function tripChecklistHtml() {
    const checked = loadChecked();
    const groups = ESSENTIALS.map(([title, items]) => {
      const lis = items.map(it => {
        const k = esc(it);
        const on = checked[it] ? ' checked' : '';
        return `<li><label><input type="checkbox" class="pack-check" data-k="${k}"${on}> <span>${esc(it)}</span></label></li>`;
      }).join('');
      return `<div class="pack-grp"><h5>${esc(title)}</h5><ul>${lis}</ul></div>`;
    }).join('');
    return `<details class="pack-trip"><summary>Whole-trip checklist</summary>${groups}</details>`;
  }

  // ---- Card HTML -----------------------------------------------------------
  function packingCardHtml(d) {
    const c = dayConditions(d);
    const acts = activitiesForDay(d);
    const srcLabel = c.source === 'forecast' ? 'live forecast' : 'seasonal average';
    let cond = `🌡️ ~${Math.round(c.lowC)}–${Math.round(c.highC)}°C (${fF(c.lowC)}–${fF(c.highC)}°F)`;
    if (c.maxWind >= 20) cond += ` · 💨 to ${Math.round(c.maxWind)} km/h`;
    if (c.rain) cond += ` · 🌧️ rain possible`;
    let html = `<section class="packing-card">`
      + `<h3>🎒 Packing for this day</h3>`
      + `<p class="pack-cond">${cond} <span class="pack-src">${srcLabel}</span></p>`
      + `<p class="pack-layer"><strong>Wear:</strong> ${esc(layeringText(c))}</p>`;
    if (acts.length) {
      html += `<div class="pack-acts">`;
      for (const a of acts) {
        const at = tempAtStop(d, a.stop);
        const hint = at ? ` <span class="pack-at">${at.emoji} ~${Math.round(at.tempC)}°C at ${esc(a.stop.time || '')}</span>` : '';
        const items = a.gear.map(([it, why]) => `<li><strong>${esc(it)}</strong> — ${esc(why)}</li>`).join('');
        html += `<div class="pack-act"><div class="pack-act-h">${a.icon} ${esc(a.label)}${hint}</div><ul>${items}</ul></div>`;
      }
      html += `</div>`;
    } else {
      html += `<p class="pack-none">Travel day — keep water, snacks, sunglasses and a warm layer within reach in the car.</p>`;
    }
    html += tripChecklistHtml() + `</section>`;
    return html;
  }

  // ---- Injection (Overview, after the now-/malaria-card) -------------------
  function inject() {
    if (typeof state === 'undefined' || !state || state.activeTab !== 'overview') return;
    const tc = document.getElementById('tabContent');
    if (!tc) return;
    const d = (typeof day === 'function') ? day() : null;
    if (!d) return;
    ensureWeather(d);
    const existing = tc.querySelector('.packing-card');
    if (existing) existing.remove();
    const anchor = tc.querySelector('.malaria-card') || tc.querySelector('.now-card-inline');
    if (anchor) anchor.insertAdjacentHTML('afterend', packingCardHtml(d));
    else tc.insertAdjacentHTML('afterbegin', packingCardHtml(d));
  }

  // Persist checkbox toggles without a full re-render.
  document.addEventListener('change', e => {
    const cb = e.target && e.target.closest && e.target.closest('.pack-check');
    if (!cb) return;
    const set = loadChecked();
    const k = cb.getAttribute('data-k');
    if (cb.checked) set[k] = 1; else delete set[k];
    saveChecked(set);
  });

  window.NamibiaUI.afterRenderTab(function () { try { inject(); } catch (_) {} });
  window.NamibiaUI.afterRender(function () { try { inject(); } catch (_) {} });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { inject(); } catch (_) {} } });
  setTimeout(() => { try { inject(); } catch (_) {} }, 400);

  window.NamibiaV41 = {
    activitiesForDay, dayConditions, layeringText, tempAtStop, packingCardHtml,
    ACTIVITIES, CLIMO
  };
})();
