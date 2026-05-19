#!/usr/bin/env node
// scripts/apply-business-research.js
//
// Merges hand-researched business metadata (summaries, hours, phones,
// websites, menu URLs) into each matching stop in data.js. Matches by
// substring on the stop's `name`. Run once after editing the BUSINESS_DATA
// table below; idempotent (re-running updates in place).
//
// Usage:  node scripts/apply-business-research.js

const fs = require('fs');
const path = require('path');

// ---- Hand-researched data, sourced via web-search-researcher agent ----
// Keys are slugified business identifiers. `matchNames` lists substrings to
// match against `stop.name` (case-insensitive). The other fields are merged
// onto the stop's `details` block.
const BUSINESS_DATA = [
  {
    matchNames: ["Joe's Beerhouse", 'Joes Beerhouse'],
    details: {
      summary: "Windhoek's iconic game-meat restaurant under thatched roofs, fairy lights and eclectic Namibiana decor. Expect kudu, gemsbok and oryx alongside craft beer and a festive open-air vibe.",
      phone: '+264 61 232 457',
      website: 'https://joesbeerhouse.com',
      hours: ['Mon-Sun: 12:00-21:00'],
      menuUrl: 'https://joesbeerhouse.com/lekker-menu/',
      avgPriceUSD: 20,
      noteworthyDish: 'Kudu fillet, mixed game platter'
    }
  },
  {
    matchNames: ['Stellenbosch Wine Bar'],
    details: {
      summary: "Windhoek's most wine-forward bistro on Sam Nujoma Drive, sourcing prime cuts from the owners' own nature reserve and grilling over open flame. World's 50 Best Discovery listed.",
      phone: '+264 61 309 141',
      website: 'https://www.thestellenboschwinebar.com',
      hours: ['Monday: Closed', 'Tue-Sat: 12:00-22:00', 'Sunday: Closed'],
      closingDays: 'Closed Sun + Mon (verify before booking)',
      noteworthyDish: 'Open-flame grilled Namibian beef'
    }
  },
  {
    matchNames: ['Jetty 1905'],
    details: {
      summary: "Swakopmund's atmospheric seafood and sushi spot perched on the historic 1905 jetty with views straight out over the Atlantic. Reservations recommended.",
      phone: '+264 81 380 3595',
      website: 'https://lhg.na/jetty-1905/',
      hours: ['Monday: Closed', 'Tue-Thu: 17:00-22:00', 'Fri-Sun: 12:00-22:00'],
      closingDays: 'Closed Mondays',
      menuUrl: 'https://lhg.na/jetty-1905-menu/',
      noteworthyDish: 'Kingklip, fresh Namibian sushi'
    }
  },
  {
    matchNames: ['The Tug Restaurant', 'Tug Restaurant'],
    details: {
      summary: "Built into a beached tugboat hull on the Swakopmund waterfront — a beloved institution for fresh Namibian seafood in a nautically charming setting.",
      phone: '+264 64 402 356',
      website: 'https://www.the-tug.com',
      hours: ['Mon-Sat: 17:00-22:00', 'Sunday: 12:00-22:00'],
      menuUrl: 'https://www.the-tug.com/menu/MENU.pdf',
      avgPriceUSD: 25,
      noteworthyDish: 'Namibian lobster, kingklip'
    }
  },
  {
    matchNames: ['Casa Forno'],
    details: {
      summary: "Otjiwarongo's favorite stop between Windhoek and Etosha — country-style Italian with a wood-fired pizza oven, freshly baked bread and a shady garden.",
      phone: '+264 81 159 0000',
      website: 'https://casaforno.com',
      hours: ['Mon-Sun: 07:00-late'],
      noteworthyDish: 'Wood-fired pizza, house breads'
    }
  },
  {
    matchNames: ['Solitaire'],
    details: {
      summary: "Legendary desert pit-stop at the Solitaire crossroads — Moose McGregor's famous German-recipe apple pie has been feeding Namib travellers for decades. Also the only fuel for many miles.",
      website: 'https://www.solitairenamibia.com',
      hours: ['Mon-Sun: 06:00-16:00 (bakery)'],
      noteworthyDish: 'Apple pie, fresh meat pies'
    }
  },
  {
    matchNames: ['Namib Sky', 'Balloon Safaris'],
    details: {
      summary: "Premium hot-air balloon operator over the Namib, launching at sunrise from 20 km south of Sesriem for a ~1-hour flight over dunes, followed by a champagne breakfast.",
      phone: '+264 63 683 188',
      website: 'https://balloon-safaris.com',
      hours: ['Daily: pre-sunrise flights (meet ~1 hr before sunrise)'],
      closingDays: 'Closed Dec 25, Jan 1, and Jan 15–Feb 15',
      avgPriceUSD: 545
    }
  },
  {
    matchNames: ['Mola Mola'],
    details: {
      summary: "Walvis Bay's go-to catamaran operator for seal and dolphin cruises out to Pelican Point. Expect bottlenose dolphins, Cape fur seals, pelicans and oysters served on board.",
      phone: '+264 81 127 2522',
      website: 'https://www.mola-namibia.com',
      hours: ['Daily: departures at 09:00 (check-in 08:30)'],
      avgPriceUSD: 75,
      noteworthyDish: 'Fresh oysters and sparkling wine on board'
    }
  },
  {
    matchNames: ['The Desert Grace'],
    details: {
      summary: "Gondwana Collection's upscale 24-bungalow lodge 30 km south of Solitaire. Private plunge pools, solar power, guided Sossusvlei excursions.",
      phone: '+264 61 427 200',
      website: 'https://gondwana-collection.com/accommodation/desert-grace'
    }
  },
  {
    matchNames: ['Namib Desert Lodge'],
    details: {
      summary: "66-room Gondwana Collection lodge at the foot of ancient fossilized dunes near Sossusvlei — homely atmosphere with direct dune access.",
      phone: '+264 61 427 200',
      website: 'https://gondwana-collection.com/accommodation/namib-desert-lodge'
    }
  },
  {
    matchNames: ['Namib Dune Star Camp', 'Dune Star'],
    details: {
      summary: "Nine open-air cabins perched on ancient dune crests with retractable roofs for star-gazing. Luxury camping by Gondwana Collection near Sossusvlei.",
      phone: '+264 61 427 200',
      website: 'https://gondwana-collection.com/accommodation/namib-dune-star-camp'
    }
  },
  {
    matchNames: ['Spitzkoppen Lodge'],
    details: {
      summary: "Tented and bungalow lodge at the base of Spitzkoppe's dramatic granite inselberg — premier climbing and stargazing. Rock art walks and sundowner drives on offer.",
      phone: '+264 81 143 5048',
      website: 'https://www.spitzkoppenlodge.com'
    }
  },
  {
    matchNames: ['Fritz Manor'],
    details: {
      summary: "Charming colonial-era B&B at 19 Lüderitz Street in central Swakopmund, under The Fritz Collection brand. Suited to groups; homely atmosphere with local character.",
      phone: '+264 81 739 4910',
      website: 'https://www.thefritzcollection.com/fritz-manor',
      hours: ['Check-in: 14:00 | Check-out: 10:00']
    }
  },
  {
    matchNames: ['The Weinberg', 'Weinberg Windhoek'],
    details: {
      summary: "Gondwana Collection's Windhoek city hotel — old-world architecture wrapping a heritage estate on Jan Jonker Road, with garden grounds. Calm capital base.",
      phone: '+264 61 209 0900',
      website: 'https://gondwana-collection.com/accommodation/the-weinberg'
    }
  },
  {
    matchNames: ['Etosha King Nehale'],
    details: {
      summary: "Gondwana Collection lodge 1 km from Etosha's King Nehale Gate on the Andoni plains. 40 chalets with game drives into the park's less-visited north.",
      phone: '+264 61 427 200',
      website: 'https://gondwana-collection.com/accommodation/etosha-king-nehale'
    }
  },
  {
    matchNames: ['Hosea Kutako'],
    details: {
      summary: "Namibia's main international gateway (WDH), 45 km east of Windhoek. Duty-free, currency exchange, free WiFi, car-rental desks. Allow 3 hours before international departures.",
      website: 'https://en.wikipedia.org/wiki/Hosea_Kutako_International_Airport',
      hours: ['24/7 — terminal open around the clock']
    }
  },
  {
    matchNames: ['Namibia Craft Centre'],
    details: {
      summary: "Largest curated craft marketplace in Windhoek, housed in the Old Breweries Complex on Tal Street. 40+ stalls of woodcarvings, jewellery, textiles, San crafts. Great for last-minute souvenirs.",
      website: 'https://www.namibiacraftcentre.com',
      hours: ['Mon-Fri: 09:00-17:30', 'Saturday: 09:00-16:00', 'Sunday: 09:00-13:30']
    }
  },
  {
    matchNames: ['SUPERSPAR Grove', 'Grove Mall'],
    details: {
      summary: "Full-service SUPERSPAR on the upper level of Grove Mall (Kleine Kuppe), Windhoek's most modern shopping centre. Best stop for road-trip supplies before heading into the desert.",
      phone: '+264 61 427 300',
      website: 'https://www.weckevoigtsspar.com/store-location/grove-super-spar',
      hours: ['Mon-Fri: 07:00-20:00', 'Saturday: 07:00-19:00', 'Sunday: 08:00-19:00']
    }
  }
];

// ---- Apply ----
const dataPath = path.join(__dirname, '..', 'data.js');
const raw = fs.readFileSync(dataPath, 'utf8');
const head = raw.match(/^[\s\S]*?(?=\{)/)[0];   // "window.NAMIBIA_TRIP_DATA = "
const tail = raw.match(/;?\s*$/)[0];             // trailing semicolons/whitespace
const body = raw.slice(head.length, raw.length - tail.length);
const data = JSON.parse(body);

let updates = 0;
for (const d of data.days) {
  for (const s of d.stops) {
    const name = (s.name || '').toLowerCase();
    for (const biz of BUSINESS_DATA) {
      if (biz.matchNames.some(n => name.includes(n.toLowerCase()))) {
        s.details = Object.assign({}, s.details || {}, biz.details);
        updates++;
        break;
      }
    }
  }
}
console.log(`Merged business metadata into ${updates} stops.`);

const out = head + JSON.stringify(data, null, 2) + tail;
fs.writeFileSync(dataPath, out);
console.log(`Wrote ${dataPath}.`);
