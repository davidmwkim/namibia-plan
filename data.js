window.NAMIBIA_TRIP_DATA = {
  "meta": {
    "title": "Namibia Self-Drive Companion",
    "subtitle": "May 23 – June 4, 2026",
    "overviewDescription": "A 13-day self-drive loop from Windhoek: south into the Namib Desert for Sossusvlei, Deadvlei, Sesriem and a Dune Star sleep-out; west to the Atlantic at Swakopmund and Walvis Bay; inland to the granite inselberg of Spitzkoppe; north to Etosha's quiet King Nehale corner; then back to Windhoek. Roughly 2,700 km — a mix of fast paved B-roads and long, corrugated gravel C- and D-roads with remote no-fuel stretches that demand strict fuel and tyre-pressure discipline: drop pressure for gravel and sand, raise it again before tar, and never roll past Rehoboth, Solitaire, Sesriem, Usakos or Omuthiya without topping up (NWR fuel inside Etosha is unreliable in 2025–26 — carry a jerry can). Daylight is short in late May, so every day is timed to reach the night's lodge before sunset. Heather drives as relief on the easy paved sections — a target of about 20–40% of each self-drive day — while David keeps the mountain passes, deep sand and technical gravel.",
    "fuelAssumptions": {
      "vehicle": "Namibia2Go-style 4x4, assumed Toyota Hilux/Fortuner-type diesel",
      "tankLitres": 80,
      "planningConsumptionLPer100Km": 12,
      "reserveLitres": 15,
      "note": "Fuel estimates are intentionally conservative planning estimates. Confirm exact tank size/consumption and tyre pressures at Namibia2Go handover."
    },
    "pressureAssumptions": {
      "highway": "Use Namibia2Go vehicle-specific highway/tar pressure.",
      "gravel": "Use Namibia2Go vehicle-specific gravel/corrugated-road pressure.",
      "sand": "Use Namibia2Go vehicle-specific sand/deep-sand pressure only if self-driving the 4x4 sand section; reinflate before faster road driving.",
      "note": "The app identifies pressure-change/check points; it does not override rental-company PSI/bar values."
    }
  },
  "days": [
    {
      "day": 1,
      "date": "2026-05-23",
      "title": "Arrival / Windhoek",
      "theme": "arrival",
      "routeNotes": "Food stops are choices; they are shown as optional pins and are not forced into the route. Grocery stop is scheduled and included.",
      "selfDrive": true,
      "stops": [
        {
          "time": "1:20 PM",
          "name": "Hosea Kutako International Airport (WDH)",
          "emoji": "✈️",
          "type": "airport / rental car",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -22.4848,
          "lng": 17.4627,
          "notes": "Arrive, immigration, SIM/cash, rental car pickup. Ask Namibia2Go for exact tyre pressures for tar, gravel, and sand; verify spare tyre.",
          "pressure": "BASELINE: confirm tyre pressure values and spare tyre with rental staff.",
          "fuel": "Initial rental fuel level unknown; record it at handover.",
          "details": {
            "summary": "Namibia's main international gateway (WDH), 45 km east of Windhoek. Duty-free, currency exchange, free WiFi, car-rental desks. Allow 3 hours before international departures.",
            "website": "https://en.wikipedia.org/wiki/Hosea_Kutako_International_Airport",
            "hours": [
              "24/7 — terminal open around the clock"
            ]
          },
          "kind": "business"
        },
        {
          "time": "4:15 PM",
          "name": "Stellenbosch Wine Bar",
          "emoji": "🍽️",
          "type": "food option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.5645,
          "lng": 17.0913,
          "notes": "Late lunch / early dinner option; choose this OR Joe's Beerhouse OR none.",
          "details": {
            "summary": "Windhoek's most wine-forward bistro on Sam Nujoma Drive, sourcing prime cuts from the owners' own nature reserve and grilling over open flame. World's 50 Best Discovery listed.",
            "phone": "+264 61 309 141",
            "website": "https://www.thestellenboschwinebar.com",
            "hours": [
              "Monday: Closed",
              "Tue-Sat: 12:00-22:00",
              "Sunday: Closed"
            ],
            "closingDays": "Closed Sun + Mon (verify before booking)",
            "noteworthyDish": "Open-flame grilled Namibian beef"
          },
          "kind": "business"
        },
        {
          "time": "4:15 PM",
          "name": "Joe's Beerhouse",
          "emoji": "🍽️",
          "type": "food option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.5516,
          "lng": 17.0912,
          "notes": "Late lunch / early dinner option; choose this OR Stellenbosch OR none.",
          "details": {
            "summary": "Windhoek's iconic game-meat restaurant under thatched roofs, fairy lights and eclectic Namibiana decor. Expect kudu, gemsbok and oryx alongside craft beer and a festive open-air vibe.",
            "phone": "+264 61 232 457",
            "website": "https://joesbeerhouse.com",
            "hours": [
              "Mon–Sun: 11:00–23:00"
            ],
            "menuUrl": "https://joesbeerhouse.com/lekker-menu/",
            "avgPriceUSD": 20,
            "noteworthyDish": "Kudu fillet, mixed game platter"
          },
          "kind": "business"
        },
        {
          "time": "5:15 PM",
          "name": "SUPERSPAR Grove / The Grove Mall",
          "emoji": "🛒",
          "type": "grocery / supplies",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -22.6175,
          "lng": 17.095,
          "notes": "Scheduled supply stop: water, electrolytes, snacks, sunscreen, wipes, cooler/ice.",
          "details": {
            "summary": "Full-service SUPERSPAR on the upper level of Grove Mall (Kleine Kuppe), Windhoek's most modern shopping centre. Best stop for road-trip supplies before heading into the desert.",
            "phone": "+264 61 427 300",
            "website": "https://www.weckevoigtsspar.com/store-location/grove-super-spar",
            "hours": [
              "Mon-Fri: 07:00-20:00",
              "Saturday: 07:00-19:00",
              "Sunday: 08:00-19:00"
            ]
          },
          "kind": "business"
        },
        {
          "time": "6:30 PM",
          "name": "The Weinberg Windhoek",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -22.5732,
          "lng": 17.1027,
          "notes": "Check in.",
          "details": {
            "summary": "Gondwana Collection's Windhoek city hotel — old-world architecture wrapping a heritage estate on Jan Jonker Road, with garden grounds. Calm capital base.",
            "phone": "+264 61 209 0900",
            "website": "https://gondwana-collection.com/accommodation/the-weinberg"
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 2,
      "date": "2026-05-24",
      "title": "Windhoek → Solitaire → The Desert Grace",
      "theme": "desert",
      "routeNotes": "Solitaire is the essential named fuel/service point. Windhoek pressure/fuel is a mandatory action but any staffed station on the way out is acceptable.",
      "selfDrive": true,
      "stops": [
        {
          "time": "8:00 AM",
          "name": "The Weinberg Windhoek",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -22.5732,
          "lng": 17.1027,
          "notes": "Check out and load car.",
          "details": {
            "summary": "Gondwana Collection's Windhoek city hotel — old-world architecture wrapping a heritage estate on Jan Jonker Road, with garden grounds. Calm capital base.",
            "phone": "+264 61 209 0900",
            "website": "https://gondwana-collection.com/accommodation/the-weinberg"
          },
          "kind": "business"
        },
        {
          "time": "8:15 AM",
          "name": "Engen Klein Windhoek Service Station",
          "emoji": "🛞",
          "type": "mandatory tyre pressure + fuel prompt",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -22.5609,
          "lng": 17.0658,
          "notes": "Use any staffed station before leaving Windhoek; coordinate is a prompt, not a required exact station.",
          "pressure": "MANDATORY LOWER for gravel ahead. From 32 psi / 2.2 bar (tar) to 26 psi / 1.8 bar (gravel) before the C24 Spreetshoogte descent and onward to Sossusvlei.",
          "fuel": "Fill to 100%. Estimated tank at departure after fill: 80 L / 100%.",
          "pressureAction": "down",
          "kind": "service",
          "placeQuery": "Engen Klein Windhoek service station"
        },
        {
          "time": "9:30 AM",
          "name": "Shell Rehoboth Service Station",
          "emoji": "⛽",
          "type": "fuel / last reliable before gravel",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -23.317,
          "lng": 17.087,
          "notes": "Last reliable fuel and shop before the C24 Spreetshoogte gravel. After Rehoboth there is roughly 200 km of gravel with NO fuel until Solitaire — top up here even if the gauge still looks fine.",
          "fuel": "Fill to 100% before leaving the B1. No fuel between Rehoboth and Solitaire (~200 km of C24/D-road gravel).",
          "kind": "service",
          "placeQuery": "Shell Rehoboth"
        },
        {
          "time": "11:30 AM",
          "name": "Solitaire Fuel Station / McGregor's Bakery",
          "emoji": "⛽",
          "type": "fuel / food / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -23.883,
          "lng": 16.0,
          "notes": "Fuel, bathroom, coffee, apple pie.",
          "pressure": "CHECK gravel pressure (~26 psi / 1.8 bar). Solitaire Service Station is the ONLY tyre/fuel stop between Sossusvlei and Swakopmund — top up fuel for the long C14 run.",
          "fuel": "Estimated arrival if filled in Windhoek: ~46–50 L / 58–63%. Last prudent fill before Sesriem area: fill to 100%.",
          "details": {
            "summary": "Legendary desert pit-stop at the Solitaire crossroads — Moose McGregor's famous German-recipe apple pie has been feeding Namib travellers for decades. Also the only fuel for many miles.",
            "website": "https://www.solitairenamibia.com",
            "hours": [
              "Mon-Sun: 06:00-16:00 (bakery)"
            ],
            "noteworthyDish": "Apple pie, fresh meat pies"
          },
          "pressureAction": "check",
          "kind": "business",
          "placeQuery": "Solitaire General Dealer"
        },
        {
          "time": "3:30 PM",
          "name": "The Desert Grace",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -24.17389,
          "lng": 15.90139,
          "notes": "Check in. Exact itinerary GPS.",
          "details": {
            "summary": "Gondwana Collection's upscale 24-bungalow lodge 30 km south of Solitaire. Private plunge pools, solar power, guided Sossusvlei excursions.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/desert-grace"
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 3,
      "date": "2026-05-25",
      "title": "Sossusvlei / Deadvlei / Sesriem Canyon",
      "theme": "dunes",
      "routeNotes": "Mandatory sand-pressure actions are included because you are assuming a 4x4 and may self-drive the final sandy section. Use shuttle instead if uncomfortable.",
      "selfDrive": true,
      "stops": [
        {
          "time": "5:45 AM",
          "name": "The Desert Grace",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -24.17389,
          "lng": 15.90139,
          "notes": "Depart with packed breakfast/lunch, water, hats, sunscreen, cash/cards.",
          "details": {
            "summary": "Gondwana Collection's upscale 24-bungalow lodge 30 km south of Solitaire. Private plunge pools, solar power, guided Sossusvlei excursions.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/desert-grace"
          },
          "kind": "business"
        },
        {
          "time": "6:30 AM",
          "name": "Sossus Oasis Engen Service Station (Sesriem)",
          "emoji": "⛽",
          "type": "fuel / tyre check option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -24.4908,
          "lng": 15.8032,
          "notes": "Optional fuel/pressure service near gate; use if anything feels off.",
          "pressure": "CHECK gravel pressure (~26 psi / 1.8 bar). Sossus Oasis Engen is the last full tyre workshop before the sand. The 60 km park road to the 2x4 carpark is paved — DO NOT drop to sand pressures yet.",
          "pressureAction": "check",
          "kind": "business",
          "placeQuery": "Sossus Oasis Engen service station Sesriem"
        },
        {
          "time": "6:50 AM",
          "name": "Sesriem / Sossusvlei Gate",
          "emoji": "🚪",
          "type": "park gate",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.4815,
          "lng": 15.8016,
          "notes": "Sesriem OUTER gate opens 06:45 in May (not 06:00). Inner gate opens ~1 hour before sunrise (~05:45) but only accessible to in-park lodges. Confirm with NWR/lodge.",
          "kind": "attraction"
        },
        {
          "time": "7:45 AM",
          "name": "Sossusvlei 2WD / shuttle parking sand entry",
          "emoji": "🛞",
          "type": "mandatory tyre pressure change",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.7215,
          "lng": 15.353,
          "notes": "Decision point before final deep-sand section to Sossusvlei/Deadvlei parking.",
          "pressure": "MANDATORY LOWER to sand pressure: from ~26 psi / 1.8 bar (gravel) to ~17–22 psi / 1.2–1.5 bar for the 5 km deep-sand track to Deadvlei. Use the vehicle compressor at the 2x4 carpark. Max speed 30–50 km/h on sand.",
          "pressureAction": "down",
          "kind": "attraction",
          "placeQuery": "Sossusvlei 2x4 car park"
        },
        {
          "time": "8:00 AM",
          "name": "Deadvlei / Sossusvlei 4x4 parking area",
          "emoji": "🏜️",
          "type": "activity / scenic stop",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.7371,
          "lng": 15.3341,
          "notes": "Self-guided Sossusvlei and Deadvlei exploration.",
          "kind": "attraction",
          "placeQuery": "Deadvlei parking area"
        },
        {
          "time": "11:00 AM",
          "name": "Dune 45",
          "emoji": "🏜️",
          "type": "scenic option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -24.7275,
          "lng": 15.4717,
          "notes": "Optional photo/hike stop on return; not forced into route.",
          "kind": "attraction"
        },
        {
          "time": "11:30 AM",
          "name": "Sossusvlei 2WD / shuttle parking sand exit",
          "emoji": "🛞",
          "type": "mandatory tyre pressure change",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.7215,
          "lng": 15.353,
          "notes": "Reinflate before leaving the sand section and resuming faster gravel/park-road driving.",
          "pressure": "MANDATORY RAISE back to ~26 psi / 1.8 bar before the 60 km paved Sesriem road. Driving on tar at sand pressures (1.2 bar) builds dangerous heat in sidewalls.",
          "pressureAction": "up",
          "kind": "attraction",
          "placeQuery": "Sossusvlei 2x4 car park"
        },
        {
          "time": "12:15 PM",
          "name": "Sesriem Canyon",
          "emoji": "🏜️",
          "type": "activity / scenic stop",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.519,
          "lng": 15.8055,
          "notes": "Sesriem Canyon excursion.",
          "kind": "attraction"
        },
        {
          "time": "2:00 PM",
          "name": "The Desert Grace",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -24.17389,
          "lng": 15.90139,
          "notes": "Return/rest.",
          "details": {
            "summary": "Gondwana Collection's upscale 24-bungalow lodge 30 km south of Solitaire. Private plunge pools, solar power, guided Sossusvlei excursions.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/desert-grace"
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 4,
      "date": "2026-05-26",
      "title": "Balloon flight → Namib Dune Star Camp",
      "theme": "dunes",
      "routeNotes": "Fuel at Sesriem is optional unless your gauge is unexpectedly low; no pressure change expected unless Day 3 sand reinflation was not completed.",
      "selfDrive": true,
      "stops": [
        {
          "time": "5:00 AM",
          "name": "The Desert Grace",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -24.17389,
          "lng": 15.90139,
          "notes": "Depart for Namib Sky; exact timing confirmed day before.",
          "details": {
            "summary": "Gondwana Collection's upscale 24-bungalow lodge 30 km south of Solitaire. Private plunge pools, solar power, guided Sossusvlei excursions.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/desert-grace"
          },
          "kind": "business"
        },
        {
          "time": "6:00 AM",
          "endTime": "9:00 AM",
          "name": "Namib Sky Balloon Safaris",
          "emoji": "🎈",
          "type": "activity",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.5732,
          "lng": 15.8118,
          "notes": "Meeting point is Farm Geluk, 20 km south of Sesriem on the C27 (GPS -24.6734, 15.8072). Meet ~1 hour before sunrise — in late May this is ~06:15. Exact time confirmed by operator the day before. Approximate cost N$9,920 / ~US$550 per person.",
          "details": {
            "summary": "Premium hot-air balloon operator over the Namib, launching at sunrise from 20 km south of Sesriem for a ~1-hour flight over dunes, followed by a champagne breakfast.",
            "phone": "+264 63 683 188",
            "website": "https://balloon-safaris.com",
            "hours": [
              "Daily: pre-sunrise flights (meet ~1 hr before sunrise)"
            ],
            "closingDays": "Closed Dec 25, Jan 1, and Jan 15–Feb 15",
            "avgPriceUSD": 545
          },
          "kind": "business"
        },
        {
          "time": "10:00 AM",
          "name": "Sossus Oasis Engen Service Station (Sesriem)",
          "emoji": "⛽",
          "type": "fuel / tyre check option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -24.4908,
          "lng": 15.8032,
          "notes": "Optional check/reset if Day 3 pressure was not resolved.",
          "pressure": "CHECK gravel pressure (~26 psi / 1.8 bar). Sossus Oasis Engen is the last full tyre workshop before the sand. The 60 km park road to the 2x4 carpark is paved — DO NOT drop to sand pressures yet.",
          "pressureAction": "check",
          "kind": "business",
          "placeQuery": "Sossus Oasis Engen service station Sesriem"
        },
        {
          "time": "10:00 AM",
          "endTime": "10:30 AM",
          "name": "The Desert Grace luggage pickup",
          "emoji": "🏨",
          "type": "lodge / luggage",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.17389,
          "lng": 15.90139,
          "notes": "Collect luggage.",
          "details": {
            "summary": "Gondwana Collection's upscale 24-bungalow lodge 30 km south of Solitaire. Private plunge pools, solar power, guided Sossusvlei excursions.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/desert-grace"
          },
          "kind": "event"
        },
        {
          "time": "11:00 AM",
          "endTime": "12:00 PM",
          "name": "Namib Desert Lodge / Dune Star logistics",
          "emoji": "🏨",
          "type": "camp logistics",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.1202,
          "lng": 15.8821,
          "notes": "Check-in/logistics for Dune Star.",
          "details": {
            "summary": "66-room Gondwana Collection lodge at the foot of ancient fossilized dunes near Sossusvlei — homely atmosphere with direct dune access.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/namib-desert-lodge"
          },
          "kind": "event"
        },
        {
          "time": "4:00 PM",
          "name": "Namib Dune Star Camp",
          "emoji": "🏨",
          "type": "camp",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -24.098611,
          "lng": 15.868611,
          "notes": "Sleep-out experience. Exact GPS.",
          "details": {
            "summary": "Nine open-air cabins perched on ancient dune crests with retractable roofs for star-gazing. Luxury camping by Gondwana Collection near Sossusvlei.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/namib-dune-star-camp"
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 5,
      "date": "2026-05-27",
      "title": "Namib Dune Star → Solitaire → Swakopmund",
      "theme": "coast",
      "routeNotes": "Solitaire is mandatory fuel/check. Swakopmund meal stops are options only.",
      "selfDrive": true,
      "stops": [
        {
          "time": "8:30 AM",
          "name": "Namib Dune Star Camp",
          "emoji": "🏨",
          "type": "camp",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -24.098611,
          "lng": 15.868611,
          "notes": "Check out.",
          "details": {
            "summary": "Nine open-air cabins perched on ancient dune crests with retractable roofs for star-gazing. Luxury camping by Gondwana Collection near Sossusvlei.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/namib-dune-star-camp"
          },
          "kind": "business"
        },
        {
          "time": "10:00 AM est.",
          "name": "Solitaire Fuel Station / McGregor's Bakery",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -23.883,
          "lng": 16.0,
          "notes": "Critical refuel before the long C14 coast crossing.",
          "pressure": "CHECK gravel pressure (~26 psi / 1.8 bar). Solitaire Service Station is the ONLY tyre/fuel stop between Sossusvlei and Swakopmund — top up fuel for the long C14 run.",
          "fuel": "Estimated arrival since May 24 fill, including Sossusvlei/balloon/local driving: ~18–26 L / 23–33%. Fill to 100%. Solitaire is the ONLY fuel for the ~232 km C14 run to Walvis Bay — fill to the brim, never skip it.",
          "details": {
            "summary": "Legendary desert pit-stop at the Solitaire crossroads — Moose McGregor's famous German-recipe apple pie has been feeding Namib travellers for decades. Also the only fuel for many miles.",
            "website": "https://www.solitairenamibia.com",
            "hours": [
              "Mon-Sun: 06:00-16:00 (bakery)"
            ],
            "noteworthyDish": "Apple pie, fresh meat pies"
          },
          "pressureAction": "check",
          "kind": "business",
          "placeQuery": "Solitaire General Dealer"
        },
        {
          "time": "1:00 PM est.",
          "name": "Engen Walvis Bay Convenience Centre (24h)",
          "emoji": "🛞",
          "type": "mandatory tyre pressure change / optional fuel",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -22.9575,
          "lng": 14.5053,
          "notes": "Use a convenient staffed station in Walvis Bay/Swakopmund; coordinate is a prompt.",
          "pressure": "MANDATORY RAISE to 32 psi / 2.2 bar (tar) after the C14 gravel run. B2 to Swakopmund is paved high-traffic highway; low-pressure tar driving risks blowout. Multiple Engen/Shell stations have air.",
          "fuel": "Optional top-up. Estimated after Solitaire → coast: ~48–52 L / 60–65%; enough to continue, but top up if gauge differs.",
          "pressureAction": "up",
          "kind": "service",
          "placeQuery": "Engen Walvis Bay"
        },
        {
          "time": "1:30 PM",
          "name": "Jetty 1905",
          "emoji": "🍽️",
          "type": "food option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.6835,
          "lng": 14.5211,
          "notes": "Lunch/dinner option; call ahead for lunch service.",
          "details": {
            "summary": "Swakopmund's atmospheric seafood and sushi spot perched on the historic 1905 jetty with views straight out over the Atlantic. Reservations recommended.",
            "phone": "+264 81 380 3595",
            "website": "https://lhg.na/jetty-1905/",
            "hours": [
              "Monday: Closed",
              "Tue-Thu: 17:00-22:00",
              "Fri-Sun: 12:00-22:00"
            ],
            "closingDays": "Closed Mondays",
            "menuUrl": "https://lhg.na/jetty-1905-menu/",
            "noteworthyDish": "Kingklip, fresh Namibian sushi"
          },
          "kind": "business"
        },
        {
          "time": "1:30 PM",
          "name": "The Tug Restaurant",
          "emoji": "🍽️",
          "type": "food option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.6811,
          "lng": 14.5218,
          "notes": "Dinner option; weekday lunch may not be available.",
          "details": {
            "summary": "Built into a beached tugboat hull on the Swakopmund waterfront — a beloved institution for fresh Namibian seafood in a nautically charming setting.",
            "phone": "+264 64 402 356",
            "website": "https://www.the-tug.com",
            "hours": [
              "Mon–Sat: 17:00–22:00 (dinner only)",
              "Sunday: 12:00–22:00 (lunch + dinner)"
            ],
            "menuUrl": "https://www.the-tug.com/menu/MENU.pdf",
            "avgPriceUSD": 25,
            "noteworthyDish": "Namibian lobster, kingklip — note: Mon–Sat dinner only",
            "closingDays": "Lunch served Sunday only — for Saturday lunch use Jetty 1905"
          },
          "kind": "business"
        },
        {
          "time": "3:00 PM",
          "name": "Fritz Manor",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -22.6823,
          "lng": 14.5245,
          "notes": "Check in.",
          "details": {
            "summary": "Charming colonial-era B&B at 19 Lüderitz Street in central Swakopmund, under The Fritz Collection brand. Suited to groups; homely atmosphere with local character.",
            "phone": "+264 81 739 4910",
            "website": "https://www.thefritzcollection.com/fritz-manor",
            "hours": [
              "Check-in: 14:00 | Check-out: 10:00"
            ]
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 6,
      "date": "2026-05-28",
      "title": "Swakopmund / Mola Mola Sandwich Harbour",
      "theme": "coast",
      "routeNotes": "Mola Mola handles off-road/dune driving for the tour; do not change your rental tyre pressure for the tour vehicle.",
      "selfDrive": true,
      "stops": [
        {
          "time": "8:00 AM",
          "name": "Fritz Manor",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -22.6823,
          "lng": 14.5245,
          "notes": "Drive to Walvis Bay.",
          "details": {
            "summary": "Charming colonial-era B&B at 19 Lüderitz Street in central Swakopmund, under The Fritz Collection brand. Suited to groups; homely atmosphere with local character.",
            "phone": "+264 81 739 4910",
            "website": "https://www.thefritzcollection.com/fritz-manor",
            "hours": [
              "Check-in: 14:00 | Check-out: 10:00"
            ]
          },
          "kind": "business"
        },
        {
          "time": "8:45 AM",
          "endTime": "3:30 PM",
          "name": "Mola Mola Walvis Bay Waterfront Office",
          "emoji": "🎟️",
          "type": "activity",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -22.9554,
          "lng": 14.4925,
          "notes": "Sandwich Harbour 4x4 tour; lunch included.",
          "details": {
            "summary": "Walvis Bay's go-to catamaran operator for seal and dolphin cruises out to Pelican Point. Expect bottlenose dolphins, Cape fur seals, pelicans and oysters served on board.",
            "phone": "+264 81 127 2522",
            "website": "https://www.mola-namibia.com",
            "hours": [
              "Daily: departures at 09:00 (check-in 08:30)"
            ],
            "avgPriceUSD": 75,
            "noteworthyDish": "Fresh oysters and sparkling wine on board"
          },
          "kind": "business"
        },
        {
          "time": "4:00 PM",
          "name": "Puma West Coast Service Centre (Walvis Bay, 24h)",
          "emoji": "⛽",
          "type": "fuel / tyre check option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.9575,
          "lng": 14.5053,
          "notes": "Optional top-up/check; not forced into route.",
          "fuel": "If no Walvis/Swakopmund top-up on May 27, estimated tank after today’s coastal round trip: ~39–44 L / 49–55%.",
          "kind": "service",
          "placeQuery": "Puma West Coast Service Centre Walvis Bay"
        },
        {
          "time": "4:00 PM",
          "name": "Fritz Manor",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -22.6823,
          "lng": 14.5245,
          "notes": "Return.",
          "details": {
            "summary": "Charming colonial-era B&B at 19 Lüderitz Street in central Swakopmund, under The Fritz Collection brand. Suited to groups; homely atmosphere with local character.",
            "phone": "+264 81 739 4910",
            "website": "https://www.thefritzcollection.com/fritz-manor",
            "hours": [
              "Check-in: 14:00 | Check-out: 10:00"
            ]
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 7,
      "date": "2026-05-29",
      "title": "Seal kayaking → Usakos → Spitzkoppen Lodge",
      "theme": "granite",
      "routeNotes": "Usakos is mandatory because it is the practical fuel and tyre-pressure transition before Spitzkoppe access roads.",
      "selfDrive": true,
      "stops": [
        {
          "time": "7:00 AM",
          "name": "Fritz Manor",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -22.6823,
          "lng": 14.5245,
          "notes": "Drive to kayaking meeting point.",
          "details": {
            "summary": "Charming colonial-era B&B at 19 Lüderitz Street in central Swakopmund, under The Fritz Collection brand. Suited to groups; homely atmosphere with local character.",
            "phone": "+264 81 739 4910",
            "website": "https://www.thefritzcollection.com/fritz-manor",
            "hours": [
              "Check-in: 14:00 | Check-out: 10:00"
            ]
          },
          "kind": "business"
        },
        {
          "time": "8:00 AM",
          "endTime": "12:00 PM",
          "name": "Seal kayaking meeting point — Angling Club / Dolphins Coffee Shop",
          "emoji": "🛶",
          "type": "activity",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -22.9579,
          "lng": 14.4928,
          "notes": "Kayaking with seals.",
          "kind": "attraction",
          "placeQuery": "Walvis Bay Waterfront Angling Club"
        },
        {
          "time": "12:30 PM",
          "name": "Walvis Bay Waterfront lunch / fuel option",
          "emoji": "🍽️",
          "type": "food / fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.9575,
          "lng": 14.5053,
          "notes": "Lunch or packed lunch. Optional fuel before inland drive.",
          "kind": "business"
        },
        {
          "time": "3:00 PM est.",
          "name": "Shell Oasis Service Centre, Usakos",
          "emoji": "🛞",
          "type": "mandatory fuel / tyre pressure",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -21.9961,
          "lng": 15.5891,
          "notes": "Mandatory service point before Spitzkoppe access roads. No dedicated tyre-fitment centre in Usakos — make sure you have a sound full-size spare (ideally two) before the D1918 gravel; nearest real tyre shops are Swakopmund (TrenTyre / Supa Quick) or Karibib.",
          "pressure": "LOWER to 26 psi / 1.8 bar for the D1918 gravel to Spitzkoppe. Closest fuel + air to Spitzkoppe (no services at the lodge). Re-inflate on return.",
          "fuel": "Estimated arrival if last full fill was Solitaire May 27: ~13–20 L / 16–25%. Fill to 100%.",
          "pressureAction": "down",
          "kind": "service",
          "placeQuery": "Shell Oasis Service Centre Usakos"
        },
        {
          "time": "4:30 PM",
          "name": "Spitzkoppen Lodge",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -21.8398,
          "lng": 15.1616,
          "notes": "Check in. Ask lodge about local track conditions.",
          "details": {
            "summary": "Tented and bungalow lodge at the base of Spitzkoppe's dramatic granite inselberg — premier climbing and stargazing. Rock art walks and sundowner drives on offer.",
            "phone": "+264 81 143 5048",
            "website": "https://www.spitzkoppenlodge.com"
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 8,
      "date": "2026-05-30",
      "title": "Spitzkoppe local scenic day",
      "theme": "granite",
      "routeNotes": "No fixed driving route. Local tracks depend on lodge guidance. Keep gravel/local-track pressure unless staff advises otherwise.",
      "selfDrive": false,
      "stops": [
        {
          "time": "8:00 AM",
          "name": "Spitzkoppen Lodge",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -21.8398,
          "lng": 15.1616,
          "notes": "Ask lodge about local-track pressure and permitted roads.",
          "pressure": "CHECK gravel pressure before lodge-access tracks. Some tracks are rocky/sandy — drop further (1.6 bar) only if directed by the lodge.",
          "details": {
            "summary": "Tented and bungalow lodge at the base of Spitzkoppe's dramatic granite inselberg — premier climbing and stargazing. Rock art walks and sundowner drives on offer.",
            "phone": "+264 81 143 5048",
            "website": "https://www.spitzkoppenlodge.com"
          },
          "pressureAction": "check",
          "kind": "business"
        },
        {
          "time": "8:00 AM",
          "name": "Spitzkoppe scenic / reserve access",
          "emoji": "🏜️",
          "type": "activity reference",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -21.826,
          "lng": 15.184,
          "notes": "Local scenic exploration.",
          "kind": "attraction",
          "placeQuery": "Spitzkoppe nature reserve"
        },
        {
          "time": "10:30 AM",
          "name": "Spitzkoppe Natural Arch / photo area",
          "emoji": "🏜️",
          "type": "activity reference",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -21.8286,
          "lng": 15.1904,
          "notes": "Optional photo/reference point.",
          "kind": "attraction",
          "placeQuery": "Spitzkoppe Rock Arch"
        },
        {
          "time": "7:00 PM",
          "endTime": "9:00 PM",
          "name": "Spitzkoppen Lodge dinner",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -21.8398,
          "lng": 15.1616,
          "notes": "Dinner at lodge.",
          "details": {
            "summary": "Tented and bungalow lodge at the base of Spitzkoppe's dramatic granite inselberg — premier climbing and stargazing. Rock art walks and sundowner drives on offer.",
            "phone": "+264 81 143 5048",
            "website": "https://www.spitzkoppenlodge.com"
          },
          "kind": "event"
        }
      ]
    },
    {
      "day": 9,
      "date": "2026-05-31",
      "title": "Spitzkoppen Lodge → Etosha King Nehale",
      "theme": "etosha",
      "routeNotes": "Long day. Pressure reset after leaving Spitzkoppe gravel. Fuel strategy: wait until Otjiwarongo/Omuthiya rather than topping at every town, but do not push below reserve.",
      "selfDrive": true,
      "stops": [
        {
          "time": "8:00 AM",
          "name": "Spitzkoppen Lodge",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -21.8398,
          "lng": 15.1616,
          "notes": "Check out/load car.",
          "details": {
            "summary": "Tented and bungalow lodge at the base of Spitzkoppe's dramatic granite inselberg — premier climbing and stargazing. Rock art walks and sundowner drives on offer.",
            "phone": "+264 81 143 5048",
            "website": "https://www.spitzkoppenlodge.com"
          },
          "kind": "business"
        },
        {
          "time": "10:00 AM est.",
          "name": "Agra Omaruru Shell (24h)",
          "emoji": "🛞",
          "type": "mandatory tyre pressure / optional fuel",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -21.4172,
          "lng": 15.9548,
          "notes": "Use a staffed station in/near Omaruru if practical; coordinate is planning prompt.",
          "pressure": "RAISE to 32 psi / 2.2 bar (tar). B1 north through Otjiwarongo and Tsumeb is paved highway. Last staffed reset before the long north run.",
          "fuel": "Optional. Estimated arrival from Usakos fill after Spitzkoppe/local driving: ~47–55 L / 59–69%.",
          "pressureAction": "up",
          "kind": "service",
          "placeQuery": "Agra Omaruru Shell"
        },
        {
          "time": "12:00 PM",
          "name": "Midway Convenience Shell, Otjiwarongo",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -20.4628,
          "lng": 16.6493,
          "notes": "Major refuel/check point on northern route.",
          "pressure": "CONFIRM tar pressure 32 psi / 2.2 bar. Shell Otjiwarongo is the best-equipped staffed stop on the B1 — top up fuel + verify spare wheel pressure before continuing.",
          "fuel": "Estimated arrival if no Omaruru fuel: ~31–40 L / 39–50%. Fill to 100%.",
          "pressureAction": "up",
          "kind": "service",
          "placeQuery": "Midway Convenience Shell Otjiwarongo"
        },
        {
          "time": "12:00 PM",
          "name": "Casa Forno, Otjiwarongo",
          "emoji": "🍽️",
          "type": "food option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -20.4608,
          "lng": 16.6534,
          "notes": "Lunch option only if timing/routing works; pack backup lunch.",
          "details": {
            "summary": "Otjiwarongo's favourite roadside stop between Windhoek and Etosha — a country hotel with a wood-fired pizza oven and freshly baked breads in a shady garden setting. Serves breakfast, lunch and dinner.",
            "phone": "+264 67 304 504",
            "website": "https://casaforno.com",
            "hours": [
              "Mon-Sun: 07:00-late"
            ],
            "noteworthyDish": "Wood-fired pizza, house breads"
          },
          "kind": "business"
        },
        {
          "time": "1:15 PM est.",
          "name": "Otavi Shell Service Station",
          "emoji": "⛽",
          "type": "fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -19.655,
          "lng": 17.338,
          "notes": "Optional B1 top-up between Otjiwarongo and the Etosha corridor.",
          "fuel": "Optional splash-and-go if you skipped Otjiwarongo or want extra buffer before the NWR fuel-shortage zone.",
          "kind": "service",
          "placeQuery": "Otavi Shell service station"
        },
        {
          "time": "4:30 PM est.",
          "name": "Omuthiya Shell Service Station",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -18.3561,
          "lng": 16.5752,
          "notes": "Final practical fuel before Etosha King Nehale approach. NWR camp fuel inside Etosha (Okaukuejo / Halali / Namutoni) has been unreliable or unavailable through 2025–26 — do NOT count on it. Fill fully here and carry a 5–10 L jerry can.",
          "pressure": "CHECK: ask about lodge access-road condition.",
          "fuel": "Estimated arrival from Otjiwarongo fill: ~35–42 L / 44–53%. Fill to 100% before lodge/return leg.",
          "kind": "service",
          "placeQuery": "Omuthiya Shell Service Station"
        },
        {
          "time": "5:00 PM",
          "name": "Etosha King Nehale",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -18.493767,
          "lng": 16.727172,
          "notes": "Etosha gates open 07:18–07:23 and close 18:25–18:27 during late May / early June 2026 (per official NWR 2025 schedule, which changes weekly with sunrise/sunset). All gates use the same schedule. King Nehale Gate is 1 km from the lodge.",
          "details": {
            "summary": "Gondwana Collection lodge 1 km from Etosha's King Nehale Gate on the Andoni plains. 40 chalets with game drives into the park's less-visited north.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/etosha-king-nehale"
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 10,
      "date": "2026-06-01",
      "title": "Etosha guided game drives",
      "theme": "etosha",
      "routeNotes": "Guided-drive day. No self-drive route.",
      "selfDrive": false,
      "stops": [
        {
          "time": "5:15 AM",
          "name": "Etosha King Nehale",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -18.493767,
          "lng": 16.727172,
          "notes": "Etosha gates open 07:18–07:23 and close 18:25–18:27 during late May / early June 2026 (per official NWR 2025 schedule, which changes weekly with sunrise/sunset). All gates use the same schedule. King Nehale Gate is 1 km from the lodge.",
          "details": {
            "summary": "Gondwana Collection lodge 1 km from Etosha's King Nehale Gate on the Andoni plains. 40 chalets with game drives into the park's less-visited north.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/etosha-king-nehale"
          },
          "kind": "business"
        },
        {
          "time": "6:00 AM",
          "endTime": "9:30 AM",
          "name": "Morning Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Route guide/wildlife-dependent.",
          "kind": "event"
        },
        {
          "time": "2:00 PM",
          "endTime": "5:30 PM",
          "name": "Afternoon Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Confirm exact return time.",
          "kind": "event"
        },
        {
          "time": "After return",
          "name": "Etosha King Nehale dinner",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -18.493767,
          "lng": 16.727172,
          "notes": "Etosha gates open 07:18–07:23 and close 18:25–18:27 during late May / early June 2026 (per official NWR 2025 schedule, which changes weekly with sunrise/sunset). All gates use the same schedule. King Nehale Gate is 1 km from the lodge.",
          "details": {
            "summary": "Gondwana Collection lodge 1 km from Etosha's King Nehale Gate on the Andoni plains. 40 chalets with game drives into the park's less-visited north.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/etosha-king-nehale"
          },
          "kind": "event"
        }
      ]
    },
    {
      "day": 11,
      "date": "2026-06-02",
      "title": "Etosha guided game drives",
      "theme": "etosha",
      "routeNotes": "Guided-drive day. No self-drive route.",
      "selfDrive": false,
      "stops": [
        {
          "time": "5:15 AM",
          "name": "Etosha King Nehale",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -18.493767,
          "lng": 16.727172,
          "notes": "Etosha gates open 07:18–07:23 and close 18:25–18:27 during late May / early June 2026 (per official NWR 2025 schedule, which changes weekly with sunrise/sunset). All gates use the same schedule. King Nehale Gate is 1 km from the lodge.",
          "details": {
            "summary": "Gondwana Collection lodge 1 km from Etosha's King Nehale Gate on the Andoni plains. 40 chalets with game drives into the park's less-visited north.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/etosha-king-nehale"
          },
          "kind": "business"
        },
        {
          "time": "6:00 AM approx.",
          "endTime": "9:30 AM",
          "name": "Morning Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Confirm exact departure.",
          "kind": "event"
        },
        {
          "time": "2:00 PM approx.",
          "endTime": "5:30 PM",
          "name": "Afternoon Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Confirm exact departure.",
          "kind": "event"
        },
        {
          "time": "After return",
          "name": "Etosha King Nehale dinner",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -18.493767,
          "lng": 16.727172,
          "notes": "Etosha gates open 07:18–07:23 and close 18:25–18:27 during late May / early June 2026 (per official NWR 2025 schedule, which changes weekly with sunrise/sunset). All gates use the same schedule. King Nehale Gate is 1 km from the lodge.",
          "details": {
            "summary": "Gondwana Collection lodge 1 km from Etosha's King Nehale Gate on the Andoni plains. 40 chalets with game drives into the park's less-visited north.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/etosha-king-nehale"
          },
          "kind": "event"
        }
      ]
    },
    {
      "day": 12,
      "date": "2026-06-03",
      "title": "Etosha King Nehale → Windhoek",
      "theme": "return",
      "routeNotes": "Fuel stop at Otjiwarongo is mandatory based on last-moment strategy. Intermediate Tsumeb/Omuthiya remain visible options if gauge differs.",
      "selfDrive": true,
      "stops": [
        {
          "time": "8:00 AM",
          "name": "Etosha King Nehale",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -18.493767,
          "lng": 16.727172,
          "notes": "Etosha gates open 07:18–07:23 and close 18:25–18:27 during late May / early June 2026 (per official NWR 2025 schedule, which changes weekly with sunrise/sunset). All gates use the same schedule. King Nehale Gate is 1 km from the lodge.",
          "details": {
            "summary": "Gondwana Collection lodge 1 km from Etosha's King Nehale Gate on the Andoni plains. 40 chalets with game drives into the park's less-visited north.",
            "phone": "+264 61 427 200",
            "website": "https://gondwana-collection.com/accommodation/etosha-king-nehale"
          },
          "kind": "business"
        },
        {
          "time": "8:45 AM est.",
          "name": "Omuthiya Shell Service Station (top-up)",
          "emoji": "⛽",
          "type": "fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.3561,
          "lng": 16.5752,
          "notes": "Optional top-up if gauge is not near full after May 31 fill. Remember NWR camp fuel inside Etosha is unreliable (2025–26) — if you didn't fill at Omuthiya northbound, do it now.",
          "kind": "service",
          "placeQuery": "Omuthiya Shell Service Station"
        },
        {
          "time": "10:30 AM est.",
          "name": "Tsumeb Agra Shell",
          "emoji": "⛽",
          "type": "fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -19.2319,
          "lng": 17.7181,
          "notes": "Optional fuel/check.",
          "kind": "service",
          "placeQuery": "Tsumeb Agra Shell"
        },
        {
          "time": "11:30 AM est.",
          "name": "Otavi Shell Service Station",
          "emoji": "⛽",
          "type": "fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -19.655,
          "lng": 17.338,
          "notes": "Optional B1 top-up between Tsumeb and Otjiwarongo.",
          "fuel": "Optional. Only needed if the gauge is low after the Etosha corridor.",
          "kind": "service",
          "placeQuery": "Otavi Shell service station"
        },
        {
          "time": "12:30 PM",
          "name": "Midway Convenience Shell, Otjiwarongo",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -20.4628,
          "lng": 16.6493,
          "notes": "Major refuel/check point before final southbound section.",
          "pressure": "CONFIRM tar pressure 32 psi / 2.2 bar. Shell Otjiwarongo is the best-equipped staffed stop on the B1 — top up fuel + verify spare wheel pressure before continuing.",
          "fuel": "Estimated arrival if filled Omuthiya May 31 and did only lodge transfer/guided days: ~24–33 L / 30–41%. Fill to 100%.",
          "pressureAction": "up",
          "kind": "service",
          "placeQuery": "Midway Convenience Shell Otjiwarongo"
        },
        {
          "time": "12:30 PM",
          "name": "Casa Forno / Otjiwarongo lunch option",
          "emoji": "🍽️",
          "type": "food option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -20.4608,
          "lng": 16.6534,
          "notes": "Lunch option; otherwise packed lunch.",
          "details": {
            "summary": "Otjiwarongo's favourite roadside stop between Windhoek and Etosha — a country hotel with a wood-fired pizza oven and freshly baked breads in a shady garden setting. Serves breakfast, lunch and dinner.",
            "phone": "+264 67 304 504",
            "website": "https://casaforno.com",
            "hours": [
              "Mon-Sun: 07:00-late"
            ],
            "noteworthyDish": "Wood-fired pizza, house breads"
          },
          "kind": "business"
        },
        {
          "time": "3:30 PM est.",
          "name": "Engen 1 Stop & Wimpy, Okahandja (24h)",
          "emoji": "⛽",
          "type": "fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -21.995,
          "lng": 16.92,
          "notes": "Optional last B1 stop before Windhoek; 24-hour Engen with a Wimpy for a late lunch or leg-stretch.",
          "fuel": "Optional. Top up here to return the rental near-full without the Day 13 airport-road scramble.",
          "kind": "service",
          "placeQuery": "Engen 1 Stop Okahandja"
        },
        {
          "time": "5:00 PM",
          "name": "The Weinberg Windhoek",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -22.5732,
          "lng": 17.1027,
          "notes": "Check in.",
          "details": {
            "summary": "Gondwana Collection's Windhoek city hotel — old-world architecture wrapping a heritage estate on Jan Jonker Road, with garden grounds. Calm capital base.",
            "phone": "+264 61 209 0900",
            "website": "https://gondwana-collection.com/accommodation/the-weinberg"
          },
          "kind": "business"
        }
      ]
    },
    {
      "day": 13,
      "date": "2026-06-04",
      "title": "Windhoek → WDH departure",
      "theme": "departure",
      "routeNotes": "Craft centre is optional. Final fuel is mandatory action but not tied to a random exact station.",
      "selfDrive": true,
      "stops": [
        {
          "time": "8:45 AM",
          "name": "The Weinberg Windhoek",
          "emoji": "🏨",
          "type": "hotel",
          "tripStopType": "start",
          "routeRole": "mandatory",
          "lat": -22.5732,
          "lng": 17.1027,
          "notes": "Pack and check out.",
          "details": {
            "summary": "Gondwana Collection's Windhoek city hotel — old-world architecture wrapping a heritage estate on Jan Jonker Road, with garden grounds. Calm capital base.",
            "phone": "+264 61 209 0900",
            "website": "https://gondwana-collection.com/accommodation/the-weinberg"
          },
          "kind": "business"
        },
        {
          "time": "9:00 AM",
          "name": "Namibia Craft Centre",
          "emoji": "🧭",
          "type": "optional shopping",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.5714,
          "lng": 17.0831,
          "notes": "Optional if missed May 23.",
          "details": {
            "summary": "Largest curated craft marketplace in Windhoek, housed in the Old Breweries Complex on Tal Street. 40+ stalls of woodcarvings, jewellery, textiles, San crafts. Great for last-minute souvenirs.",
            "website": "https://www.namibiacraftcentre.com",
            "hours": [
              "Mon-Fri: 09:00-17:30",
              "Saturday: 09:00-16:00",
              "Sunday: 09:00-13:30"
            ]
          },
          "kind": "business"
        },
        {
          "time": "10:45 AM",
          "name": "Engen Hosea Kutako Airport Service Station",
          "emoji": "⛽",
          "type": "mandatory fuel prompt",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -22.5641,
          "lng": 17.1185,
          "notes": "Use a convenient station before rental return.",
          "fuel": "Estimated before final fuel from Otjiwarongo fill: ~50–57 L / 63–71%. Fill to 100% for rental return.",
          "kind": "service",
          "placeQuery": "Engen Hosea Kutako Airport service station"
        },
        {
          "time": "11:30 AM",
          "name": "Hosea Kutako International Airport (WDH)",
          "emoji": "✈️",
          "type": "airport / rental return",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -22.4848,
          "lng": 17.4627,
          "notes": "Return rental car; check in for 2:30 PM flight.",
          "details": {
            "summary": "Namibia's main international gateway (WDH), 45 km east of Windhoek. Duty-free, currency exchange, free WiFi, car-rental desks. Allow 3 hours before international departures.",
            "website": "https://en.wikipedia.org/wiki/Hosea_Kutako_International_Airport",
            "hours": [
              "24/7 — terminal open around the clock"
            ]
          },
          "kind": "business"
        }
      ]
    }
  ]
};
