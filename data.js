window.NAMIBIA_TRIP_DATA = {
  "meta": {
    "title": "Namibia Self-Drive Companion",
    "subtitle": "May 23 – June 4, 2026",
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
          "fuel": "Initial rental fuel level unknown; record it at handover."
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
          "notes": "Late lunch / early dinner option; choose this OR Joe's Beerhouse OR none."
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
          "notes": "Late lunch / early dinner option; choose this OR Stellenbosch OR none."
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
          "notes": "Scheduled supply stop: water, electrolytes, snacks, sunscreen, wipes, cooler/ice."
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
          "notes": "Check in."
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
          "notes": "Check out and load car."
        },
        {
          "time": "8:15 AM",
          "name": "Windhoek staffed fuel + tyre-pressure station",
          "emoji": "🛞",
          "type": "mandatory tyre pressure + fuel prompt",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -22.5609,
          "lng": 17.0658,
          "notes": "Use any staffed station before leaving Windhoek; coordinate is a prompt, not a required exact station.",
          "pressure": "MANDATORY CHANGE: set gravel/corrugated-road pressure before the C26/C14/C19 desert route.",
          "fuel": "Fill to 100%. Estimated tank at departure after fill: 80 L / 100%."
        },
        {
          "time": "11:30 AM",
          "name": "Solitaire Fuel Station / McGregor's Bakery",
          "emoji": "⛽",
          "type": "fuel / food / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -23.8927,
          "lng": 15.9941,
          "notes": "Fuel, bathroom, coffee, apple pie.",
          "pressure": "MANDATORY CHECK: verify gravel pressure and inspect tyres after rough/corrugated roads.",
          "fuel": "Estimated arrival if filled in Windhoek: ~46–50 L / 58–63%. Last prudent fill before Sesriem area: fill to 100%."
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
          "notes": "Check in. Exact itinerary GPS."
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
          "notes": "Depart with packed breakfast/lunch, water, hats, sunscreen, cash/cards."
        },
        {
          "time": "6:30 AM",
          "name": "Sesriem / Sossus Oasis services",
          "emoji": "⛽",
          "type": "fuel / tyre check option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -24.4877,
          "lng": 15.7972,
          "notes": "Optional fuel/pressure service near gate; use if anything feels off.",
          "pressure": "CHECK if stopping: confirm gravel pressure before park road."
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
          "notes": "Arrive before 7:00 AM opening noted; confirm locally."
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
          "pressure": "MANDATORY DECREASE if self-driving sand: switch from gravel to Namibia2Go sand pressure. If no compressor/gauge/experience, use shuttle and do not deflate."
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
          "notes": "Self-guided Sossusvlei and Deadvlei exploration."
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
          "notes": "Optional photo/hike stop on return; not forced into route."
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
          "pressure": "MANDATORY INCREASE: reinflate from sand to Namibia2Go gravel/road pressure before sustained road speeds."
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
          "notes": "Sesriem Canyon excursion."
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
          "notes": "Return/rest."
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
          "notes": "Depart for Namib Sky; exact timing confirmed day before."
        },
        {
          "time": "6:00 AM",
          "name": "Namib Sky Balloon Safaris",
          "emoji": "🎈",
          "type": "activity",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.5732,
          "lng": 15.8118,
          "notes": "Sunrise balloon flight, breakfast, return transfer."
        },
        {
          "time": "10:00 AM",
          "name": "Sesriem / Sossus Oasis services",
          "emoji": "⛽",
          "type": "fuel / tyre check option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -24.4877,
          "lng": 15.7972,
          "notes": "Optional check/reset if Day 3 pressure was not resolved.",
          "pressure": "CHECK/RESET only if needed."
        },
        {
          "time": "10:00 AM",
          "name": "The Desert Grace luggage pickup",
          "emoji": "🏨",
          "type": "lodge / luggage",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.17389,
          "lng": 15.90139,
          "notes": "Collect luggage."
        },
        {
          "time": "11:00 AM",
          "name": "Namib Desert Lodge / Dune Star logistics",
          "emoji": "🏨",
          "type": "camp logistics",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -24.1202,
          "lng": 15.8821,
          "notes": "Check-in/logistics for Dune Star."
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
          "notes": "Sleep-out experience. Exact GPS."
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
          "notes": "Check out."
        },
        {
          "time": "10:00 AM est.",
          "name": "Solitaire Fuel Station / McGregor's Bakery",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -23.8927,
          "lng": 15.9941,
          "notes": "Critical refuel before the long C14 coast crossing.",
          "pressure": "MANDATORY CHECK: maintain gravel/corrugated-road pressure for C14.",
          "fuel": "Estimated arrival since May 24 fill, including Sossusvlei/balloon/local driving: ~18–26 L / 23–33%. Fill to 100%."
        },
        {
          "time": "1:00 PM est.",
          "name": "Walvis Bay staffed fuel / tyre-pressure area",
          "emoji": "🛞",
          "type": "mandatory tyre pressure change / optional fuel",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -22.9575,
          "lng": 14.5053,
          "notes": "Use a convenient staffed station in Walvis Bay/Swakopmund; coordinate is a prompt.",
          "pressure": "MANDATORY INCREASE: reset from gravel/corrugated pressure to highway/tar pressure before B2/coastal highway driving.",
          "fuel": "Optional top-up. Estimated after Solitaire → coast: ~48–52 L / 60–65%; enough to continue, but top up if gauge differs."
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
          "notes": "Lunch/dinner option; call ahead for lunch service."
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
          "notes": "Dinner option; weekday lunch may not be available."
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
          "notes": "Check in."
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
          "notes": "Drive to Walvis Bay."
        },
        {
          "time": "8:45 AM",
          "name": "Mola Mola Walvis Bay Waterfront Office",
          "emoji": "🎟️",
          "type": "activity",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -22.9554,
          "lng": 14.4925,
          "notes": "Sandwich Harbour 4x4 tour; lunch included."
        },
        {
          "time": "4:00 PM",
          "name": "Walvis Bay fuel / tyre check option",
          "emoji": "⛽",
          "type": "fuel / tyre check option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -22.9575,
          "lng": 14.5053,
          "notes": "Optional top-up/check; not forced into route.",
          "fuel": "If no Walvis/Swakopmund top-up on May 27, estimated tank after today’s coastal round trip: ~39–44 L / 49–55%."
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
          "notes": "Return."
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
          "notes": "Drive to kayaking meeting point."
        },
        {
          "time": "8:00 AM",
          "name": "Seal kayaking meeting point — Angling Club / Dolphins Coffee Shop",
          "emoji": "🛶",
          "type": "activity",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -22.9579,
          "lng": 14.4928,
          "notes": "Kayaking with seals."
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
          "notes": "Lunch or packed lunch. Optional fuel before inland drive."
        },
        {
          "time": "3:00 PM est.",
          "name": "Usakos staffed fuel + tyre-pressure stop",
          "emoji": "🛞",
          "type": "mandatory fuel / tyre pressure",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -21.9961,
          "lng": 15.5891,
          "notes": "Mandatory service point before Spitzkoppe access roads.",
          "pressure": "MANDATORY DECREASE/RESET: switch from highway/tar to Namibia2Go gravel/local-track pressure before Spitzkoppe access roads.",
          "fuel": "Estimated arrival if last full fill was Solitaire May 27: ~13–20 L / 16–25%. Fill to 100%."
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
          "notes": "Check in. Ask lodge about local track conditions."
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
          "pressure": "CHECK with lodge staff; likely keep gravel/local-track pressure."
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
          "notes": "Local scenic exploration."
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
          "notes": "Optional photo/reference point."
        },
        {
          "time": "7:00 PM",
          "name": "Spitzkoppen Lodge dinner",
          "emoji": "🏨",
          "type": "lodge",
          "tripStopType": "end",
          "routeRole": "mandatory",
          "lat": -21.8398,
          "lng": 15.1616,
          "notes": "Dinner at lodge."
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
          "notes": "Check out/load car."
        },
        {
          "time": "10:00 AM est.",
          "name": "Omaruru staffed tyre-pressure reset point",
          "emoji": "🛞",
          "type": "mandatory tyre pressure / optional fuel",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -21.4172,
          "lng": 15.9548,
          "notes": "Use a staffed station in/near Omaruru if practical; coordinate is planning prompt.",
          "pressure": "MANDATORY INCREASE/RESET: switch from gravel/local-track to highway/tar pressure if remaining route is tar/highway.",
          "fuel": "Optional. Estimated arrival from Usakos fill after Spitzkoppe/local driving: ~47–55 L / 59–69%."
        },
        {
          "time": "12:00 PM",
          "name": "Otjiwarongo fuel / tyre-pressure stop",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -20.4628,
          "lng": 16.6493,
          "notes": "Major refuel/check point on northern route.",
          "pressure": "MANDATORY CHECK: verify highway/tar pressure and inspect tyres.",
          "fuel": "Estimated arrival if no Omaruru fuel: ~31–40 L / 39–50%. Fill to 100%."
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
          "notes": "Lunch option only if timing/routing works; pack backup lunch."
        },
        {
          "time": "4:30 PM est.",
          "name": "Omuthiya / Oshivelo corridor final fuel option",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -18.3596,
          "lng": 16.5815,
          "notes": "Final practical fuel before Etosha King Nehale approach.",
          "pressure": "CHECK: ask about lodge access-road condition.",
          "fuel": "Estimated arrival from Otjiwarongo fill: ~35–42 L / 44–53%. Fill to 100% before lodge/return leg."
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
          "notes": "Check in. Exact GPS converted from itinerary."
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
          "notes": "Wake up; coffee/light snack."
        },
        {
          "time": "6:00 AM",
          "name": "Morning Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Route guide/wildlife-dependent."
        },
        {
          "time": "2:00 PM",
          "name": "Afternoon Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Confirm exact return time."
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
          "notes": "Dinner after return."
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
          "notes": "Wake up; coffee/light snack."
        },
        {
          "time": "6:00 AM approx.",
          "name": "Morning Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Confirm exact departure."
        },
        {
          "time": "2:00 PM approx.",
          "name": "Afternoon Guided Game Drive",
          "emoji": "🦁",
          "type": "guided activity",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.5054,
          "lng": 16.7483,
          "notes": "Confirm exact departure."
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
          "notes": "Dinner after return."
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
          "notes": "Check out/load car."
        },
        {
          "time": "8:45 AM est.",
          "name": "Omuthiya / Oshivelo corridor fuel option",
          "emoji": "⛽",
          "type": "fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -18.3596,
          "lng": 16.5815,
          "notes": "Optional top-up if gauge is not near full after May 31 fill."
        },
        {
          "time": "10:30 AM est.",
          "name": "Tsumeb fuel option",
          "emoji": "⛽",
          "type": "fuel option",
          "tripStopType": "intermediate",
          "routeRole": "optional",
          "lat": -19.2319,
          "lng": 17.7181,
          "notes": "Optional fuel/check."
        },
        {
          "time": "12:30 PM",
          "name": "Otjiwarongo fuel / tyre-pressure stop",
          "emoji": "⛽",
          "type": "fuel / tyre check",
          "tripStopType": "intermediate",
          "routeRole": "mandatory",
          "lat": -20.4628,
          "lng": 16.6493,
          "notes": "Major refuel/check point before final southbound section.",
          "pressure": "MANDATORY CHECK: verify highway pressure.",
          "fuel": "Estimated arrival if filled Omuthiya May 31 and did only lodge transfer/guided days: ~24–33 L / 30–41%. Fill to 100%."
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
          "notes": "Lunch option; otherwise packed lunch."
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
          "notes": "Check in."
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
          "notes": "Pack and check out."
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
          "notes": "Optional if missed May 23."
        },
        {
          "time": "10:45 AM",
          "name": "Final Windhoek / airport-road fuel stop",
          "emoji": "⛽",
          "type": "mandatory fuel prompt",
          "tripStopType": "intermediate",
          "routeRole": "mandatoryAction",
          "lat": -22.5641,
          "lng": 17.1185,
          "notes": "Use a convenient station before rental return.",
          "fuel": "Estimated before final fuel from Otjiwarongo fill: ~50–57 L / 63–71%. Fill to 100% for rental return."
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
          "notes": "Return rental car; check in for 2:30 PM flight."
        }
      ]
    }
  ]
};
