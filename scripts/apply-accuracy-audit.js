#!/usr/bin/env node
// scripts/apply-accuracy-audit.js
//
// Applies corrections from the web-research accuracy audit. Each rule
// targets a stop by substring match against `name` and updates specific
// fields. Idempotent.

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data.js');
const raw = fs.readFileSync(dataPath, 'utf8');
const head = raw.match(/^[\s\S]*?(?=\{)/)[0];
const tail = raw.match(/;?\s*$/)[0];
const body = raw.slice(head.length, raw.length - tail.length);
const data = JSON.parse(body);

// Date-scoped name-substring corrections (so e.g. "Sesriem / Sossus Oasis
// services" on Day 3 vs Day 4 can be patched independently if needed).
const RULES = [
  // Joe's Beerhouse — actual hours are 11:00–23:00 daily.
  { match: 'Joe\'s Beerhouse', set: { details: { hours: ['Mon–Sun: 11:00–23:00'] } } },

  // The Tug — dinner only Mon-Sat, lunch + dinner Sunday.
  { match: 'Tug Restaurant', set: {
    details: {
      hours: ['Mon–Sat: 17:00–22:00 (dinner only)', 'Sunday: 12:00–22:00 (lunch + dinner)'],
      noteworthyDish: 'Namibian lobster, kingklip — note: Mon–Sat dinner only',
      closingDays: 'Lunch served Sunday only — for Saturday lunch use Jetty 1905'
    }
  }},

  // Casa Forno — country hotel with wood-fired kitchen, not strictly Italian.
  { match: 'Casa Forno', set: {
    details: {
      summary: "Otjiwarongo's favourite roadside stop between Windhoek and Etosha — a country hotel with a wood-fired pizza oven and freshly baked breads in a shady garden setting. Serves breakfast, lunch and dinner.",
      phone: '+264 67 304 504'
    }
  }},

  // Sesriem Gate — May outer-gate opens 06:45 (not 06:00).
  { match: 'Sesriem / Sossusvlei Gate', set: {
    notes: 'Sesriem OUTER gate opens 06:45 in May (not 06:00). Inner gate opens ~1 hour before sunrise (~05:45) but only accessible to in-park lodges. Confirm with NWR/lodge.'
  }},

  // Namib Sky — meeting time + GPS for Farm Geluk.
  { match: 'Namib Sky', set: {
    notes: 'Meeting point is Farm Geluk, 20 km south of Sesriem on the C27 (GPS -24.6734, 15.8072). Meet ~1 hour before sunrise — in late May this is ~06:15. Exact time confirmed by operator the day before. Approximate cost N$9,920 / ~US$550 per person.'
  }},

  // Etosha gates — variable timing late May / early June.
  { match: 'Etosha King Nehale', set: {
    notes: 'Etosha gates open 07:18–07:23 and close 18:25–18:27 during late May / early June 2026 (per official NWR 2025 schedule, which changes weekly with sunrise/sunset). All gates use the same schedule. King Nehale Gate is 1 km from the lodge.'
  }},

  // ===== Pressure transitions (sourced from Bushlore + Tracks4Africa +
  // Tripadvisor Namibia forum + rental-company guides) =====
  // Reference: Hilux 2.2 bar tar / 1.8 gravel / 1.5 sand / down to 1.2 bar
  // for the Sossusvlei sand track.

  // Windhoek pressure station — set initial gravel pressure before C24.
  { match: 'Windhoek staffed fuel + tyre-pressure', set: {
    pressureAction: 'down',
    pressure: 'MANDATORY LOWER for gravel ahead. From 32 psi / 2.2 bar (tar) to 26 psi / 1.8 bar (gravel) before the C24 Spreetshoogte descent and onward to Sossusvlei.'
  }},

  // Solitaire — maintain gravel + workshop confirmation.
  { match: 'Solitaire Fuel Station', set: {
    pressureAction: 'check',
    pressure: 'CHECK gravel pressure (~26 psi / 1.8 bar). Solitaire Service Station is the ONLY tyre/fuel stop between Sossusvlei and Swakopmund — top up fuel for the long C14 run.'
  }},

  // Sesriem services — gravel pressure for park road.
  { match: 'Sesriem / Sossus Oasis services', set: {
    pressureAction: 'check',
    pressure: 'CHECK gravel pressure (~26 psi / 1.8 bar). Sossus Oasis Engen is the last full tyre workshop before the sand. The 60 km park road to the 2x4 carpark is paved — DO NOT drop to sand pressures yet.'
  }},

  // Sand entry — lower for the 5km deep-sand track.
  { match: 'sand entry', set: {
    pressureAction: 'down',
    pressure: 'MANDATORY LOWER to sand pressure: from ~26 psi / 1.8 bar (gravel) to ~17–22 psi / 1.2–1.5 bar for the 5 km deep-sand track to Deadvlei. Use the vehicle compressor at the 2x4 carpark. Max speed 30–50 km/h on sand.'
  }},

  // Sand exit — raise back for tar/gravel.
  { match: 'sand exit', set: {
    pressureAction: 'up',
    pressure: 'MANDATORY RAISE back to ~26 psi / 1.8 bar before the 60 km paved Sesriem road. Driving on tar at sand pressures (1.2 bar) builds dangerous heat in sidewalls.'
  }},

  // Walvis Bay arrival — raise for B2 tar.
  { match: 'Walvis Bay staffed fuel', set: {
    pressureAction: 'up',
    pressure: 'MANDATORY RAISE to 32 psi / 2.2 bar (tar) after the C14 gravel run. B2 to Swakopmund is paved high-traffic highway; low-pressure tar driving risks blowout. Multiple Engen/Shell stations have air.'
  }},

  // Usakos — drop for D1918 to Spitzkoppe.
  { match: 'Usakos staffed', set: {
    pressureAction: 'down',
    pressure: 'LOWER to 26 psi / 1.8 bar for the D1918 gravel to Spitzkoppe. Closest fuel + air to Spitzkoppe (no services at the lodge). Re-inflate on return.'
  }},

  // Spitzkoppen Lodge — only apply pressure note to stops that already have
  // pressure (the guard above filters out the "dinner" sibling stop).
  { match: 'Spitzkoppen Lodge', set: {
    pressureAction: 'check',
    pressure: 'CHECK gravel pressure before lodge-access tracks. Some tracks are rocky/sandy — drop further (1.6 bar) only if directed by the lodge.'
  }},

  // Omaruru — raise back to tar for B1 north.
  { match: 'Omaruru staffed', set: {
    pressureAction: 'up',
    pressure: 'RAISE to 32 psi / 2.2 bar (tar). B1 north through Otjiwarongo and Tsumeb is paved highway. Last staffed reset before the long north run.'
  }},

  // Otjiwarongo (Day 9 + Day 12) — confirm tar.
  { match: 'Otjiwarongo fuel', set: {
    pressureAction: 'up',
    pressure: 'CONFIRM tar pressure 32 psi / 2.2 bar. Shell Otjiwarongo is the best-equipped staffed stop on the B1 — top up fuel + verify spare wheel pressure before continuing.'
  }}
];

function deepMerge(target, source) {
  for (const k of Object.keys(source)) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      target[k] = deepMerge(target[k] || {}, source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}

let updates = 0;
for (const d of data.days) {
  for (const s of d.stops) {
    for (const r of RULES) {
      if (!s.name.toLowerCase().includes(r.match.toLowerCase())) continue;
      // Guard: pressure-related rules should only apply to stops that already
      // carry a pressure field (so we don't pollute every "X Lodge dinner"
      // sibling stop with a pressure block).
      if ((r.set.pressureAction || r.set.pressure) && !s.pressure) continue;
      deepMerge(s, r.set);
      updates++;
      break;
    }
  }
}
console.log(`Applied accuracy-audit corrections to ${updates} stops.`);

fs.writeFileSync(dataPath, head + JSON.stringify(data, null, 2) + tail);
console.log(`Wrote ${dataPath}.`);
