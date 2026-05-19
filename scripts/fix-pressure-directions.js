#!/usr/bin/env node
// scripts/fix-pressure-directions.js
//
// Adds explicit `pressureAction` ('up' | 'down' | 'check') to each stop in
// data.js whose `pressure` text would otherwise be mis-classified by the
// keyword heuristic. Run once. Idempotent.

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data.js');
const raw = fs.readFileSync(dataPath, 'utf8');
const head = raw.match(/^[\s\S]*?(?=\{)/)[0];
const tail = raw.match(/;?\s*$/)[0];
const body = raw.slice(head.length, raw.length - tail.length);
const data = JSON.parse(body);

// Each rule: a substring of stop.name on a specific date → the correct
// pressureAction + (optionally) a rewritten `pressure` note that explicitly
// names the direction. Researched against typical 4x4-hire pressure cadence
// guidance for Namibia (see scripts/apply-business-research.js source notes).
const RULES = [
  // Day 3 — after sand at Sossusvlei, re-inflate for the paved Sesriem road back.
  { date: '2026-05-25', name: 'sand exit', action: 'up',
    pressure: 'MANDATORY RAISE back to tar/highway pressure after Sossusvlei sand. Re-inflate to ~32 psi / 2.2 bar for the paved Sesriem road and beyond.' },
  // Day 5 — arrival in Walvis Bay after C14 gravel, re-inflate for B2 tar.
  { date: '2026-05-27', name: 'Walvis Bay staffed', action: 'up',
    pressure: 'MANDATORY RAISE back to tar pressure after C14 gravel. Set ~32 psi / 2.2 bar before B2 tar to Swakopmund.' },
  // Day 9 — Omaruru on the way north from Spitzkoppe to Etosha via paved B1.
  { date: '2026-05-31', name: 'Omaruru', action: 'up',
    pressure: 'RAISE to tar pressure (~32 psi / 2.2 bar). Spitzkoppe gravel access road ends here; B1 north to Otjiwarongo / Tsumeb is paved.' },
  // Day 4 — pressure-check before the day's logistics; not a directional change.
  { date: '2026-05-26', name: 'Sesriem / Sossus Oasis', action: 'check',
    pressure: 'CHECK pressure before short logistics drive. Stay on gravel pressure (~26 psi / 1.8 bar) — desert routes only today.' }
];

let updates = 0;
for (const d of data.days) {
  if (!RULES.some(r => r.date === d.date)) continue;
  for (const s of d.stops) {
    for (const r of RULES) {
      if (r.date !== d.date) continue;
      if (!s.name.toLowerCase().includes(r.name.toLowerCase())) continue;
      s.pressureAction = r.action;
      if (r.pressure) s.pressure = r.pressure;
      updates++;
      break;
    }
  }
}
console.log(`Patched ${updates} stops with explicit pressureAction.`);

fs.writeFileSync(dataPath, head + JSON.stringify(data, null, 2) + tail);
console.log(`Wrote ${dataPath}.`);
