#!/usr/bin/env node
// scripts/classify-stops.js
//
// Walks every stop in data.js and assigns:
//   stop.kind ∈ {'business', 'service', 'event', 'attraction'}
//   stop.placeQuery — optional explicit Places search hint for service stops
//                     pointing at a real named station
//
// Run once; idempotent (re-running updates in place).

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data.js');
const raw = fs.readFileSync(dataPath, 'utf8');
const head = raw.match(/^[\s\S]*?(?=\{)/)[0];
const tail = raw.match(/;?\s*$/)[0];
const body = raw.slice(head.length, raw.length - tail.length);
const data = JSON.parse(body);

// Explicit overrides keyed by name substring (case-insensitive) → kind +
// optional placeQuery. More specific entries first.
const RULES = [
  // ---- Events: activity blocks that are NOT physical businesses. ----
  // (Most of these reference a separate "real" lodge or operator stop.)
  { match: 'Morning Guided Game Drive', kind: 'event' },
  { match: 'Afternoon Guided Game Drive', kind: 'event' },
  { match: 'Etosha King Nehale dinner', kind: 'event' },
  { match: 'Spitzkoppen Lodge dinner', kind: 'event' },
  { match: 'The Desert Grace luggage pickup', kind: 'event' },
  { match: 'Namib Desert Lodge / Dune Star logistics', kind: 'event' },

  // ---- Service points: generic fuel/tyre waypoints → point at named stations ----
  // (Researched from Tracks4Africa, Bushlore, station directory pages.)
  { match: 'Windhoek staffed fuel + tyre-pressure station', kind: 'service',
    placeQuery: 'Engen Klein Windhoek service station' },
  { match: 'Final Windhoek / airport-road fuel stop', kind: 'service',
    placeQuery: 'Engen Hosea Kutako Airport service station' },
  { match: 'Otjiwarongo fuel / tyre-pressure stop', kind: 'service',
    placeQuery: 'Shell Otjiwarongo service station' },
  { match: 'Omaruru staffed tyre-pressure reset point', kind: 'service',
    placeQuery: 'Engen Omaruru' },
  { match: 'Omuthiya / Oshivelo corridor final fuel option', kind: 'service',
    placeQuery: 'Engen Omuthiya' },
  { match: 'Omuthiya / Oshivelo corridor fuel option', kind: 'service',
    placeQuery: 'Engen Omuthiya' },
  { match: 'Tsumeb fuel option', kind: 'service',
    placeQuery: 'Engen Tsumeb' },
  { match: 'Usakos staffed fuel + tyre-pressure stop', kind: 'service',
    placeQuery: 'Engen Usakos' },
  { match: 'Walvis Bay staffed fuel / tyre-pressure area', kind: 'service',
    placeQuery: 'Engen Walvis Bay' },
  { match: 'Walvis Bay fuel / tyre check option', kind: 'service',
    placeQuery: 'Engen Walvis Bay' },
  { match: 'Walvis Bay Waterfront lunch / fuel option', kind: 'business' },
  { match: 'Sesriem / Sossus Oasis services', kind: 'business',
    placeQuery: 'Sossus Oasis Engen service station Sesriem' },
  { match: 'Solitaire Fuel Station / McGregor', kind: 'business',
    placeQuery: 'Solitaire General Dealer' },

  // ---- Attractions: geographic features. May have a Google Maps page but
  // not a "business" cover photo. Treat as business so the rich card still
  // renders with whatever Places returns. ----
  { match: 'Sesriem / Sossusvlei Gate', kind: 'attraction' },
  { match: 'Sossusvlei 2WD / shuttle parking sand entry', kind: 'attraction',
    placeQuery: 'Sossusvlei 2x4 car park' },
  { match: 'Sossusvlei 2WD / shuttle parking sand exit', kind: 'attraction',
    placeQuery: 'Sossusvlei 2x4 car park' },
  { match: 'Deadvlei / Sossusvlei 4x4 parking area', kind: 'attraction',
    placeQuery: 'Deadvlei parking area' },
  { match: 'Dune 45', kind: 'attraction' },
  { match: 'Sesriem Canyon', kind: 'attraction' },
  { match: 'Spitzkoppe Natural Arch / photo area', kind: 'attraction',
    placeQuery: 'Spitzkoppe Rock Arch' },
  { match: 'Spitzkoppe scenic / reserve access', kind: 'attraction',
    placeQuery: 'Spitzkoppe nature reserve' },
  { match: 'Hosea Kutako International Airport', kind: 'business' },
  { match: 'Namibia Craft Centre', kind: 'business' },
  { match: 'Seal kayaking meeting point', kind: 'attraction',
    placeQuery: 'Walvis Bay Waterfront Angling Club' },
];

// Anything not matched above defaults to 'business'.
let kinds = { business: 0, service: 0, event: 0, attraction: 0 };
for (const d of data.days) {
  for (const s of d.stops) {
    let matched = false;
    for (const r of RULES) {
      if (s.name.toLowerCase().includes(r.match.toLowerCase())) {
        s.kind = r.kind;
        if (r.placeQuery) s.placeQuery = r.placeQuery;
        matched = true;
        kinds[r.kind]++;
        break;
      }
    }
    if (!matched) {
      s.kind = 'business';
      kinds.business++;
    }
  }
}
console.log('Classification counts:', kinds);

fs.writeFileSync(dataPath, head + JSON.stringify(data, null, 2) + tail);
console.log(`Wrote ${dataPath}.`);
