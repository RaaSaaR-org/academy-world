#!/usr/bin/env node
// The hack calibration of „Lauf, Ente!" (R2 §7.6 steps 1 and 4; plan §4.3): every deck of
// tuning.ts DECKS with 3 seeds through the station's own loop (GenerationJob, CEM, detectors), in
// Node with the stripped MuJoCo build. Prints which hack the elite shows first and when, the walk
// deck's distance by generation 14, and writes artifacts/phase7/duck/calibration.json.
//
//   node tools/duck/calibrate.mjs [--decks start,statue,…] [--seeds 1,2,3] [--gens 10] [--pop 64]
//   node tools/duck/calibrate.mjs --reference      print the walk deck's mean gait (tuning.ts REFERENCE)
//
// Pass rules (R2 §7.6): home pose stable 3 s; ≤ 15 µs per step; walk ≥ 0.3 m by generation 14;
// each hack the station names emerges in ≥ 2 of 3 seeds (else its detector stays off, tuning.ts).
import fs from 'node:fs';
import path from 'node:path';
import { loadDuck, parseArgs, ROOT, train } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const D = await loadDuck();
const { core, T } = D;
const sim = D.sim(['trunk_assembly']);
const seeds = String(args.seeds ?? '1,2,3').split(',').map(Number);
const gens = Number(args.gens ?? 10);
const pop = Number(args.pop ?? T.CEM.population);
const EXPECT = { start: 'bauchklatscher', statue: 'statue', costly: 'statue', costsOnly: 'sofortUmfaller', jitter: 'zappelente', stork: 'storch', walk: null, fix: null };
const none = { fwd: 0, alive: 0, upright: 0, energy: 0, smooth: 0, lift: 0, imitate: 0 };

// 1 · home pose and step cost
const still = new Float64Array(core.NPARAM);
still[0] = 2;
const home = sim.episode(still, none, T.WORLDS.nominal, { seconds: 3 });
let steps = 0;
const t0 = performance.now();
for (let k = 0; k < 20; k++) steps += Math.round(sim.episode(T.GAIT.mu0, none, T.WORLDS.nominal, { postFall: 0 }).t / sim.dt);
const usPerStep = (1000 * (performance.now() - t0)) / steps;
const out = { date: new Date().toISOString(), usPerStep: +usPerStep.toFixed(2), home: { fell: home.fell, drift: +home.dist.toFixed(4) }, decks: {} };
console.log(`home 3 s: ${home.fell ? 'FELL' : 'stable'} (drift ${(home.dist * 1000).toFixed(1)} mm) · ${usPerStep.toFixed(2)} µs/step incl. the gait`);

const vec = (mu) => `[${Array.from(mu, (v) => +v.toFixed(4)).join(', ')}]`;
if (args.reference) {
  const r = train(D, sim, { deck: T.DECKS.walk, gens: 14, pop, seed: 1 });
  console.log(`REFERENCE (walk, seed 1, gen 14): ${vec(r.cem.mu)}`);
  process.exit(0);
}
if (args['debug-gaits']) {
  // tuning.ts DEBUG: the gaits the debug hooks stamp with, and what they score on the track
  const one = train(D, sim, { deck: T.DECKS.fix, gens: T.CEM.generations, pop, seed: 1 });
  const rnd = train(D, sim, { deck: T.DECKS.fix, gens: T.CEM.generations, pop, seed: 101, ranges: T.WORLDS.train, repeats: T.CEM.repeatsRandom });
  for (const [name, mu] of [['walkGait', one.cem.mu], ['robustGait', rnd.cem.mu]]) {
    const runs = core.testRuns(sim, mu, T.TRACK.runs, T.TRACK.seed, T.WORLDS.test, T.TRACK.seconds, T.TRACK.successM);
    console.log(`${name}: ${vec(mu)} · track ${runs.filter((r) => r.success).length}/20, falls ${runs.filter((r) => r.result.fell).length}`);
  }
  process.exit(0);
}

const decks = String(args.decks ?? 'start,statue,costsOnly,walk,fix,jitter,stork').split(',');
let fail = home.fell || usPerStep > 15 ? 1 : 0;
for (const name of decks) {
  const deck = T.DECKS[name];
  if (!deck) throw new Error(`no deck ${name}`);
  const rows = [];
  for (const seed of seeds) {
    const isWalk = name === 'walk';
    const r = train(D, sim, { deck, gens: isWalk ? Math.max(gens, 14) : gens, pop, seed, curriculum: !!args.curriculum, stopOnHack: !isWalk });
    let mean = null;
    if (isWalk) {
      const ev = sim.episode(r.cem.mu, core.weightsOf(deck, T.CARDS), T.WORLDS.nominal);
      mean = { dist: +ev.dist.toFixed(3), fell: ev.fell };
    }
    rows.push({ seed, hack: r.hack, gen: r.hackGen, mean, msPerGen: Math.round(r.log.reduce((s, l) => s + l.ms, 0) / r.log.length), log: r.log });
    console.log(`${name.padEnd(10)} seed ${seed}: ${r.hack ? `${r.hack} @ gen ${r.hackGen}` : 'no hack'}${mean ? ` · mean gait ${mean.dist} m${mean.fell ? ' (falls)' : ''}` : ''} · ${rows.at(-1).msPerGen} ms/gen`);
  }
  const want = EXPECT[name];
  const hits = want ? rows.filter((r) => r.hack === want).length : rows.filter((r) => !r.hack).length;
  const verdict = name === 'walk' ? rows.filter((r) => r.mean.dist >= 0.3 && !r.mean.fell).length >= 2 && hits >= 2 : hits >= 2;
  out.decks[name] = { expect: want, hits, of: rows.length, pass: verdict, rows };
  console.log(`  → ${want ?? 'no hack'}: ${hits}/${rows.length}${verdict ? ' ✓' : ' ✗'}`);
  if (!verdict && ['start', 'statue', 'costsOnly', 'walk'].includes(name)) fail = 1;
}
const file = path.join(ROOT, 'artifacts', 'phase7', 'duck', 'calibration.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`→ ${path.relative(ROOT, file)}`);
process.exitCode = fail;
