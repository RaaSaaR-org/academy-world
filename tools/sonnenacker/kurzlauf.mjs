#!/usr/bin/env node
// The Schaufenster's Kurzlauf „Erntetag“ (plan §4.9, D41 as amended by D23): the Sonnenacker's automated
// day as a recording for WP11's stand „So lädt die Bodencrew den Startakku“ (30 s on the stand: the day at
// 8× in 10 s, then its Befundkarte). Run by the station's own model (src/zones/sonnenacker/model.ts, Node
// type stripping), with the Bodencrew's choices: every leaf stripped, the midday window, the colour card
// found, every call answered after 4 s. WP9 owns this generator; WP11 commits the output (plan §6.2).
//
//   node tools/sonnenacker/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/erntetag.json [--check]
//
// --check: generate in memory and compare with the file at --out (exit 1 on a difference or a broken
// target). Output (JSON, deterministic, ≈ 20 KB):
//   format 'EKZL' v1; title; chips (harvest 'sim-aufzeichnung', energy 'richtwert', akku 'fiktion', research
//   'quelle'); stand { seconds 30, speed 8, day: [startS, endS] of the day on the stand, befundAt };
//   day { seconds1x, clock [6, 20], choices }; samples (10 Hz over the day on the stand: t, clock h, kWh,
//   akku 0…1, k, done); picks [{ t (stand s), row 0/1, fruit, arm (label), ok, damaged, vis, cycleS }];
//   calls [{ t, kind, answeredAfterS, inTime }]; result { k, n, rate, lo, hi, damaged, cycleMedianS, calls,
//   callsInTime, kwh, kwhUsed }; research { success, cycleS, source }; befund { messgroesse, grenze, frage,
//   fuerDeinWerk } in DE and EN. Show the harvest numbers with the chip SIM · AUFZEICHNUNG, every kWh with
//   RICHTWERT, the bar with FIKTION.
import fs from 'node:fs';
import path from 'node:path';
import { loadFarm, parseArgs, ROOT } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const OUT = path.resolve(ROOT, String(args.out ?? 'src/zones/schauhalle/kurzlauf/erntetag.json'));
const { M, T } = await loadFarm();

const SPEED = 8;
const STAND_S = 30;
const DAY_AT = 2; // the day starts 2 s into the stand (the title first)
const choices = M.preparedChoices('midday', 4);
const sim = M.simulateDay(choices);
const day1x = T.DAY.seconds;
const dayStand = day1x / SPEED;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
// the Messbeet's two arms: the arms of bed PICK.bed (labels as on the farm: arm index + 1)
const armLabel = (row) => 2 * T.PICK.bed + row + 1;

const picks = sim.outcomes
  .filter((o) => !o.missed)
  .sort((a, b) => a.t - b.t)
  .map((o) => ({ t: r3(DAY_AT + o.t / SPEED), row: o.row, fruit: o.fruit, arm: armLabel(o.row), ok: o.ok, damaged: o.damaged, vis: o.vis, cycleS: r1(o.cycleS) }));
const calls = sim.calls.map((c) => ({ t: r3(DAY_AT + c.t / SPEED), kind: c.kind, answeredAfterS: c.answeredIn, inTime: c.answeredIn != null && c.answeredIn <= T.DAY.answerS }));

// samples at 10 Hz over the day on the stand
const samples = { hz: 10, t: [], clock: [], kwh: [], akku: [], k: [], done: [] };
for (let i = 0; i <= dayStand * 10; i++) {
  const ts = i / 10;
  const f = Math.min(1, (ts * SPEED) / day1x);
  const done = picks.filter((p) => p.t <= DAY_AT + ts);
  samples.t.push(r1(DAY_AT + ts));
  samples.clock.push(r3(T.DAY.from + f * (T.DAY.to - T.DAY.from)));
  samples.kwh.push(r1(T.ENERGY.kwhDay * M.kwhShare(f)));
  // the Bodencrew's run: the bar fills with the day's kWh (presentation, FIKTION) and locks at the end
  samples.akku.push(r3(i === dayStand * 10 ? 1 : M.kwhShare(f)));
  samples.k.push(done.filter((p) => p.ok).length);
  samples.done.push(done.length);
}
const res = sim.result;
const data = {
  format: 'EKZL',
  version: 1,
  generator: 'tools/sonnenacker/kurzlauf.mjs',
  model: 'src/zones/sonnenacker/model.ts (the model of Sonnenacker C „Erntetag“)',
  title: { de: 'So lädt die Bodencrew den Startakku', en: 'How the ground crew charges the start battery' },
  chips: { harvest: 'sim-aufzeichnung', energy: 'richtwert', akku: 'fiktion', research: 'quelle' },
  stand: { seconds: STAND_S, speed: SPEED, day: [DAY_AT, r1(DAY_AT + dayStand)], befundAt: r1(DAY_AT + dayStand + 1) },
  day: { seconds1x: day1x, clock: [T.DAY.from, T.DAY.to], choices: { deleafed: 'all', window: choices.window, calibrated: choices.calibrated, answerAfterS: 4 } },
  samples,
  picks,
  calls,
  result: {
    k: res.k,
    n: res.n,
    rate: r3(res.rate[0]),
    lo: r3(res.rate[1]),
    hi: r3(res.rate[2]),
    damaged: res.damaged,
    cycleMedianS: r1(res.cycleMedianS),
    calls: res.calls,
    callsInTime: res.callsInTime,
    kwh: res.kwh,
    kwhUsed: res.kwhUsed,
  },
  research: { success: T.PICK.research.success, cycleS: T.PICK.research.cycleS, source: 'Bac, van Henten, Hemming, Edan 2014, Journal of Field Robotics 31(6), 888–911' },
  befund: {
    messgroesse: {
      de: `Erfolg pro Frucht ${res.k}/${res.n} = ${Math.round(res.rate[0] * 100)} % [${Math.round(res.rate[1] * 100)}–${Math.round(res.rate[2] * 100)}], Zykluszeit Ø ${Math.round(res.cycleMedianS)} s · Forschungsmittel 66 %, 33 s`,
      en: `Success per fruit ${res.k}/${res.n} = ${Math.round(res.rate[0] * 100)} % [${Math.round(res.rate[1] * 100)}–${Math.round(res.rate[2] * 100)}], cycle time Ø ${Math.round(res.cycleMedianS)} s · research mean 66 %, 33 s`,
    },
    grenze: {
      de: 'Das Beet ist für den Roboter gebaut. Menschen entlauben, Hummeln bestäuben, Menschen lösen klemmende Greifer.',
      en: 'The bed is built for the robot. People deleaf, bumblebees pollinate, people free jammed grippers.',
    },
    frage: { de: 'Unter welchen Bedingungen wurde gepflückt: Sorte, Licht, Beet?', en: 'Under which conditions was it picked: variety, light, bed?' },
    fuerDeinWerk: { de: 'Rechne mit den Hilferufen, nicht mit der Vorführung.', en: 'Calculate with the calls for help, not with the demo.' },
  },
};
const json = JSON.stringify(data, null, 1) + '\n';

// targets: a 30 s stand, the 8× day ≤ 10 s, the prepared day's numbers
const problems = [];
if (dayStand > 10) problems.push(`the 8× day takes ${dayStand} s on the stand (≤ 10 s)`);
if (data.stand.befundAt >= STAND_S) problems.push('the Befundkarte comes after the stand ends');
if (res.k !== 50) problems.push(`the prepared day harvests ${res.k}/60 (the station's model says 50/60)`);
if (picks.length !== 60) problems.push(`${picks.length} picks recorded (60)`);
if (samples.akku[samples.akku.length - 1] !== 1) problems.push('the bar does not end full');

if (args.check) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (have !== json) problems.push(have == null ? `no file at ${path.relative(ROOT, OUT)}` : `${path.relative(ROOT, OUT)} differs from a fresh run`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
}
console.log(`${args.check ? 'checked' : 'wrote'} ${path.relative(ROOT, OUT)}: ${(json.length / 1024).toFixed(1)} KB · stand ${STAND_S} s · day ${dayStand} s at ${SPEED}× · ${res.k}/${res.n} = ${Math.round(res.rate[0] * 100)} % [${Math.round(res.rate[1] * 100)}–${Math.round(res.rate[2] * 100)}] · ${res.damaged} damaged · Ø ${r1(res.cycleMedianS)} s · ${res.callsInTime}/${res.calls} calls in time · ${res.kwh} kWh`);
for (const p of problems) console.log(`FAIL ${p}`);
process.exit(problems.length ? 1 : 0);
