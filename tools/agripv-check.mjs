#!/usr/bin/env node
// Sonnenacker model check (WP9; plan §4.10, §5.10; R8 §2.3): runs the zone's own pure models
// (src/zones/sonnenacker/model.ts with tuning.ts, Node type stripping) and checks them against the
// research report:
//   B „Licht teilen“  T by density 0,85 / 0,70 / 0,55; Y_crop = 1 − s·(1 − T) as the band s ∈ [0,7; 1,0];
//                     Y_el = 0,83·(1 − T)/0,30 capped at 1; LER = the sum: T 0,85 → 1,27–1,31, T 0,70 →
//                     1,53–1,62 (crop 70–79 %), T 0,55 → 1,55–1,69 with the crop band below 66 % (the densest
//                     roof has the highest LER and fails DIN); the stars' roofs (★★ only with the Schutzstellung)
//   A „Reif oder nicht?“ good labels: sun ≥ 37/40, shade drops (≤ 33/40), the colour card restores ≥ 36/40;
//                     a careless teacher (Pink as „pflücken“) stays below 36/40 even with the card
//   C „Erntetag“      the prepared day 50/60 = 83 % [72–91] (plan's example), morning ≥ 49 (Wilson ≥ 70 %),
//                     unprepared below 49; damage ≤ 2 when every call is answered; median cycle ≈ 25 s;
//                     a jam never answered loses that row's rest of the day
//   energy            ≈ 30 kWp, ≈ 39 MWh/a, ≈ 106 kWh/day, ≤ 10 kWh/day for the 12 arms (RICHTWERT)
//   cost card         the research average → ≈ 25 k€, SWEEPER ≈ 31 k€, AHPPEBot ≈ 33 k€ (R8 §2.6)
//
//   node tools/agripv-check.mjs [--json]
// Exit 1 on a miss. No browser, no build.
import { loadFarm, parseArgs } from './sonnenacker/lib.mjs';

const args = parseArgs(process.argv.slice(2));
const { M, T } = await loadFarm();
const rows = [];
const check = (name, value, op, target, unit = '') => {
  const ok = value != null && Number.isFinite(value) && (op === '<=' ? value <= target : op === '>=' ? value >= target : op === '<' ? value < target : op === '>' ? value > target : Math.abs(value - target) < 1e-9);
  rows.push({ name, value, op, target, unit, ok });
};
const near = (name, value, target, tol, unit = '') => rows.push({ name, value, op: '≈', target: `${target} ± ${tol}`, unit, ok: Math.abs(value - target) <= tol });
const req = (name, ok, detail = '') => rows.push({ name, value: ok ? 'yes' : 'no', op: '=', target: 'yes', unit: detail ? ` (${detail})` : '', ok: !!ok });
const r2 = (v) => Math.round(v * 100) / 100;

// ── B: the light rule, electricity, LER, DIN ────────────────────────────────────────────────
const roof = (density, policy = 'sonne', hailStow = true) => M.agriPv({ density, policy, hailStow });
const loose = roof(0), mid = roof(1), dense = roof(2);
near('B T at density 1 / 2 / 3: 0,85', loose.T, 0.85, 1e-9);
near('B T at density 2: 0,70', mid.T, 0.7, 1e-9);
near('B T at density 3: 0,55', dense.T, 0.55, 1e-9);
near('B T 0,70: crop band low (s = 1,0)', mid.crop.lo, 0.7, 0.005);
near('B T 0,70: crop band high (s = 0,7)', mid.crop.hi, 0.79, 0.005);
near('B T 0,70: Y_el (Heggelbach anchor 83 %)', mid.el, 0.83, 0.005);
near('B T 0,70: LER low (R8 1,53)', mid.ler.lo, 1.53, 0.005);
near('B T 0,70: LER high (R8 1,62)', mid.ler.hi, 1.62, 0.005);
near('B T 0,85: LER low (R8 1,27)', loose.ler.lo, 1.27, 0.006);
near('B T 0,85: LER high (R8 1,31)', loose.ler.hi, 1.31, 0.006);
near('B T 0,55: Y_el capped at 1', dense.el, 1, 1e-9);
near('B T 0,55: LER low (R8 1,55)', dense.ler.lo, 1.55, 0.006);
near('B T 0,55: LER high (R8 1,69)', dense.ler.hi, 1.69, 0.006);
req('B the densest roof has the highest LER …', dense.ler.hi > mid.ler.hi && dense.ler.hi > loose.ler.hi, `${r2(dense.ler.hi)} > ${r2(mid.ler.hi)}`);
req('B … and fails DIN SPEC 91434 (crop band below 66 %)', !dense.din && dense.crop.lo < 0.66, `crop ${r2(dense.crop.lo)}–${r2(dense.crop.hi)}`);
req('B densities 1 and 2 pass DIN', loose.din && mid.din);
req('B „Pflanze zuerst“ at density 3 still fails DIN', !roof(2, 'pflanze').din);
const s2 = (r) => r.lerSeason.lo >= T.STARS.b.lerLo && r.harvest.lo >= T.STARS.b.cropLo;
req('B ★★ (LER ≥ 1,5, crop ≥ 70 %) with density 2 and the Schutzstellung', s2(mid));
req('B ★★ also with „Pflanze zuerst“ and the Schutzstellung', s2(roof(1, 'pflanze')));
req('B no ★★ without the Schutzstellung (the hail front, FIKTION)', !s2(roof(1, 'sonne', false)), `crop ${r2(roof(1, 'sonne', false).harvest.lo)}`);
req('B no ★★ with the loose roof (LER below 1,5)', !s2(loose));
near('B prediction centre, density 2 + Schutzstellung (%)', mid.centrePct, 74.5, 0.01);
// the table model's gauges pull against each other
const g0 = M.gauges(0.2, { density: 1, policy: 'sonne' }), g1 = M.gauges(0.2, { density: 1, policy: 'pflanze' });
req('B gauges: „Pflanze zuerst“ gives the crop more light and less power', g1.crop > g0.crop && g1.kw < g0.kw, `crop ${r2(g0.crop)} → ${r2(g1.crop)}, kW ${r2(g0.kw)} → ${r2(g1.kw)}`);
const gN = M.gauges(0.5, { density: 1, policy: 'sonne' });
check('B gauges: noon power of block A (kW, model)', gN.kw, '<=', 30.5, ' kW');

// ── A: the wrist camera ─────────────────────────────────────────────────────────────────────
const teach = M.ripeTeach(), test = M.ripeTest();
check('A teaching tray', teach.length, '=', 12);
check('A test bench', test.length, '=', 40);
const good = teach.map((f) => M.shouldPick(f.cls));
const th = M.learnThreshold(teach, good);
const sun = M.runRipeTest(test, th, 'sun'), shade = M.runRipeTest(test, th, 'shade'), card = M.runRipeTest(test, th, 'card');
check('A good labels: sun (plan „38/40“)', sun.k, '>=', 37, '/40');
check('A good labels: under the panels drops (plan „31/40“)', shade.k, '<=', 33, '/40');
check('A good labels: under the panels, at least', shade.k, '>=', 28, '/40');
check('A good labels: with the colour card (★★ ≥ 36)', card.k, '>=', T.STARS.a.shade2, '/40');
const careless = teach.map((f) => f.cls >= 3);
const thc = M.learnThreshold(teach, careless);
check('A Pink taught as „pflücken“: card test stays below ★★', M.runRipeTest(test, thc, 'card').k, '<', T.STARS.a.shade2, '/40');
const strict = teach.map((f) => f.cls >= 5);
check('A only Red taught as „pflücken“: card test stays below ★★', M.runRipeTest(test, M.learnThreshold(teach, strict), 'card').k, '<', T.STARS.a.shade2, '/40');

// ── C: the automated day ────────────────────────────────────────────────────────────────────
const day = (ch) => M.simulateDay(ch).result;
const best = day(M.preparedChoices('midday'));
check('C prepared, midday, calibrated: k/60 (plan „50/60“)', best.k, '=', 50, '/60');
near('C … Wilson low (plan [72–91])', best.rate[1] * 100, 72, 0.6, ' %');
near('C … Wilson high', best.rate[2] * 100, 91, 0.6, ' %');
check('C … damaged fruits (★★★ ≤ 2)', best.damaged, '<=', T.STARS.c.damagedMax);
near('C … median cycle (≈ 25 s)', best.cycleMedianS, 25, 2.5, ' s');
check('C … calls answered in time', best.callsInTime, '=', 5);
const morning = day(M.preparedChoices('morning'));
check('C prepared, morning: Wilson low ≥ 70 % (★★)', morning.rate[1], '>=', T.STARS.c.wilsonLo);
const evening = day(M.preparedChoices('evening'));
check('C prepared, evening: below ★★ (low sun in the cameras)', evening.rate[1], '<', T.STARS.c.wilsonLo);
const uncal = day({ ...M.preparedChoices('midday'), calibrated: false });
check('C midday stripes without the calibration of A: below ★★', uncal.rate[1], '<', T.STARS.c.wilsonLo);
const lazy = day({ ...M.preparedChoices('midday'), deleafed: [[], []] });
check('C not deleafed: below ★★', lazy.rate[1], '<', T.STARS.c.wilsonLo);
check('C not deleafed: k/60', lazy.k, '<=', 40, '/60');
const ignored = day({ ...M.preparedChoices('midday'), answerS: T.DAY.calls.map(() => null) });
check('C no call answered: k/60 drops', ignored.k, '<', best.k - 10, '/60');
const late = day({ ...M.preparedChoices('midday'), answerS: T.DAY.calls.map(() => 14) });
check('C every call answered after 14 s: calls in time', late.callsInTime, '=', 0);
check('C … but the day is still harvested (late, not never)', late.k, '>=', best.k - 3, '/60');
req('C a day with ≥ 1 full tray (★)', best.trays >= 1, `${best.trays} trays`);

// ── energy and the cost card ────────────────────────────────────────────────────────────────
const e = M.energyFacts();
near('energy: block A kWp (≈ 30)', e.kwp, 30, 0.5, ' kWp');
near('energy: MWh per year (≈ 39)', e.kwhYear / 1000, 39, 0.5, ' MWh');
near('energy: kWh per day (≈ 106, RICHTWERT)', e.kwhDay, 106, 1, ' kWh');
check('energy: the 12 arms use ≤ 10 kWh per day (upper bound)', e.kwhUsed, '<=', 10.1, ' kWh');
near('energy: the dashboard figure', T.ENERGY.kwhDay, Math.round(e.kwhDay), 0.5, ' kWh');
near('cost: research average (33 s, 66 %) ≈ 25 k€', M.robotWorth(33, 0.66) / 1000, 25, 0.6, ' k€');
near('cost: SWEEPER (24 s, 61 %) ≈ 31 k€', M.robotWorth(24, 0.61) / 1000, 31, 0.6, ' k€');
near('cost: AHPPEBot (32,46 s, 86,67 %) ≈ 33 k€', M.robotWorth(32.46, 0.8667) / 1000, 33, 0.6, ' k€');
near('cost: the anchor at 20 s (≤ 59 k€)', M.robotWorth(20, 0.95) / 1000, 58.8, 0.3, ' k€');

const failed = rows.filter((r) => !r.ok);
if (args.json) console.log(JSON.stringify({ rows, failed: failed.length }, null, 1));
else {
  console.log('\n── agripv-check (WP9, R8 §2.3): targets ──');
  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(w)}  ${String(typeof r.value === 'number' ? Math.round(r.value * 1000) / 1000 : r.value).padStart(8)}${r.unit}  (target ${r.op} ${r.target})`);
  console.log(failed.length ? `${failed.length} of ${rows.length} targets missed` : `all ${rows.length} targets met`);
}
process.exit(failed.length ? 1 : 0);
