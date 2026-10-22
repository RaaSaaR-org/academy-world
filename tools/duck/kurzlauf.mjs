#!/usr/bin/env node
// The Schaufenster's Kurzlauf „Belohnung" (plan §4.9, D41; R2 §6.7): the duck station's Entscheider run,
// recorded by the station's own code in Node (real MuJoCo, real CEM) for WP11's stand. WP11 commits the
// output; WP5 owns this generator (plan §6.2 hand-off).
//
//   node tools/duck/kurzlauf.mjs --out src/zones/schauhalle/kurzlauf/duck.bin [--ducks 8]
//
// The story (≈ 40 s on the stand, each generation 4 s, chip SIM · AUFZEICHNUNG):
//   1  „Nur Vorwärts" (the default deck): generation 1, then 2, where the elite shows the belly flop
//      and the run stops early (the hack sticker)
//   2  one tap „Durchhalten + Aufrecht dazu": generations 2, 4, 6 and 10 of the fixed deck, walking
//   3  the Teststrecke: the one-world gait and the gait retrained in random worlds, 20 runs each under
//      the hidden conditions (results for all 20, poses for the first 8: two rounds of 4 lanes)
//
// File (little-endian): 'DKZL' · u32 version 2 · u32 header bytes · header JSON · zero pad to 8 · Int16
// data. Every segment holds qpos samples per duck (header.stride = 21: root position × scale.pos, root
// quaternion w x y z × scale.quat, the 14 joints in header.actuators order × scale.joint) at `rate` Hz,
// duck-major then sample-major, DELTA-CODED along time per duck and channel. Decode a segment:
//
//   const v = new Int16Array(buf, dataStart + seg.off * 2, seg.len);  // seg.off/len in Int16 units
//   const Q = header.stride, q = new Float32Array(v.length);
//   for (let d = 0; d < seg.ducks; d++) {
//     const acc = new Int32Array(Q);
//     for (let s = 0; s < seg.samples; s++) for (let k = 0; k < Q; k++) {
//       const o = (d * seg.samples + s) * Q + k;
//       acc[k] += v[o];
//       q[o] = acc[k] / (k < 3 ? header.scale.pos : k < 7 ? header.scale.quat : header.scale.joint);
//     }
//   }
//
// The link poses follow from qpos by MuJoCo's kinematics over header.tree (parent index, body pos, quat,
// hinge qpos index): src/zones/regelgarten/duck/core.ts `fkPoses` does it (pure, no imports: copy it), or
// pose one RobotModel per duck with setJoint(header.actuators[k], q[7 + k]) and the root from q[0…6].
// header.links are the duck GLB's body links (RobotLibrary.bodies('open-duck-mini-v2', 2) naming); place
// body b with base × C × [R(q) | p], C turning MuJoCo's world into the GLB root's frame (x → z, y → x,
// z → y; src/zones/regelgarten/duck/field.ts). Seeds are fixed: the same bytes every run (--check).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { LINKS, loadDuck, parseArgs, ROOT } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const OUT = path.resolve(String(args.out ?? path.join(ROOT, 'src/zones/schauhalle/kurzlauf/duck.bin')));
const DUCKS = Number(args.ducks ?? 8);
const D = await loadDuck();
const { core, T } = D;
const sim = D.sim(LINKS);
const DECIM = 2; // 25 → 12.5 Hz
const RATE = T.EPISODE.recHz / DECIM;
const Q = core.QPOS_STRIDE;
/** ≈ 1 mm and 1 mrad, like the station's recordings (tools/duck/record.mjs) */
const SCALE = { pos: 1024, quat: 4096, joint: 1024 };

const chunks = [];
let off = 0;
/** qpos Float32 (ducks × samples25 × Q) → 12.5 Hz Int16, delta-coded per duck and channel */
function push(qrec, ducks, samples25) {
  const S = Math.floor((samples25 - 1) / DECIM) + 1;
  const out = new Int16Array(ducks * S * Q);
  for (let d = 0; d < ducks; d++) {
    const prev = new Int32Array(Q);
    for (let s = 0; s < S; s++) {
      const src = (d * samples25 + s * DECIM) * Q;
      for (let k = 0; k < Q; k++) {
        const sc = k < 3 ? SCALE.pos : k < 7 ? SCALE.quat : SCALE.joint;
        const v = Math.max(-32767, Math.min(32767, Math.round(qrec[src + k] * sc)));
        out[(d * S + s) * Q + k] = v - prev[k];
        prev[k] = v;
      }
    }
  }
  const at = off;
  chunks.push(out);
  off += out.length;
  return { off: at, len: out.length, samples: S, ducks };
}
const r3 = (v) => +v.toFixed(3);

function run(deck, { seed, maxGen, keepGens, ranges = null, stopOnHack = true }) {
  const cem = new core.Cem(T.GAIT, T.CEM);
  const r = core.rng(seed);
  const segs = [];
  let last = null;
  for (let g = 1; g <= maxGen; g++) {
    const job = new core.GenerationJob(sim, cem, {
      gen: g,
      pop: T.CEM.population,
      weights: core.weightsOf(deck, T.CARDS),
      ranges,
      nominal: T.WORLDS.nominal,
      seed: (r() * 2 ** 31) | 0,
      record: false,
      recordQpos: keepGens.includes(g),
      reference: T.REFERENCE,
      repeats: ranges ? T.CEM.repeatsRandom : 1,
    });
    job.work(1e12, () => performance.now());
    const res = job.finish();
    const hack = g >= T.HACKS.minGen ? core.detectHack(res.eliteStats, T.HACKS) : null;
    if (res.qrec) {
      // show the elite first, then the rest (the stand's 8 tiles tell the generation's story)
      const order = [...res.elite, ...res.results.map((_, i) => i).filter((i) => !res.elite.includes(i))].slice(0, DUCKS);
      const per = res.samples * Q;
      const pick = new Float32Array(order.length * per);
      order.forEach((i, k) => pick.set(res.qrec.subarray(i * per, (i + 1) * per), k * per));
      segs.push({
        kind: 'generation',
        gen: g,
        ...push(pick, order.length, res.samples),
        fallT: order.map((i) => (res.results[i].fell ? r3(res.results[i].t) : -1)),
        dist: order.map((i) => r3(res.results[i].dist)),
        stats: { pop: res.results.length, fallFrac: r3(res.stats.fallFrac), medianDist: r3(res.stats.medianDist), eliteFallFrac: r3(res.eliteStats.fallFrac), eliteMeanDist: r3(res.eliteStats.meanDist) },
        hack,
      });
    }
    last = res;
    if (stopOnHack && hack) break;
  }
  return { segs, mu: Array.from(last.mu, (v) => +v.toFixed(5)), lastGen: last.gen, lastHack: core.detectHack(last.eliteStats, T.HACKS) };
}

function track(gait, label) {
  const S = sim.samples(T.TRACK.seconds);
  const qrec = new Float32Array(T.TRACK.runs * S * Q);
  const runs = core.testRuns(sim, gait, T.TRACK.runs, T.TRACK.seed, T.WORLDS.test, T.TRACK.seconds, T.TRACK.successM, undefined, qrec);
  const keep = Math.min(DUCKS, runs.length);
  const k = runs.filter((x) => x.success).length;
  return {
    kind: 'track',
    gait: label,
    ...push(qrec.subarray(0, keep * S * Q), keep, S),
    runs: runs.map((x) => ({ world: Object.fromEntries(Object.entries(x.world).map(([a, v]) => [a, r3(v)])), dist: r3(x.result.dist), fell: x.result.fell, success: x.success })),
    k,
    n: runs.length,
    falls: runs.filter((x) => x.result.fell).length,
    medianDist: r3(runs.map((x) => x.result.dist).sort((a, b) => a - b)[runs.length >> 1]),
  };
}

// 1 · Nur Vorwärts → belly flop (stops at the hack)
const flop = run(T.DECKS.start, { seed: 1, maxGen: 6, keepGens: [1, 2, 3, 4, 5, 6] });
// 2 · Durchhalten + Aufrecht dazu → walking
const fix = run(T.DECKS.fix, { seed: 1, maxGen: T.CEM.generations, keepGens: [2, 4, 6, T.CEM.generations], stopOnHack: false });
// 3 · the track: one world vs retrained in random worlds
const rand = run(T.DECKS.fix, { seed: 101, maxGen: T.CEM.generations, keepGens: [], ranges: T.WORLDS.train, stopOnHack: false });
const one = track(fix.mu, 'one-world');
const robust = track(rand.mu, 'random-worlds');

/** the recorded links' kinematic tree (as tools/duck/record.mjs writes it) */
function kinTree() {
  const { M } = D;
  const m = sim.model;
  const BODY = M.mjtObj.mjOBJ_BODY.value;
  const bid = (n) => M.mj_name2id(m, BODY, n);
  return LINKS.map((link) => {
    const b = bid(link);
    const p = m.body_parentid[b];
    const jn = m.body_jntnum[b];
    const ja = m.body_jntadr[b];
    return {
      link,
      parent: p > 0 ? LINKS.findIndex((l) => bid(l) === p) : -1,
      pos: Array.from(m.body_pos.slice(b * 3, b * 3 + 3), (v) => +v.toFixed(7)),
      quat: Array.from(m.body_quat.slice(b * 4, b * 4 + 4), (v) => +v.toFixed(7)),
      q: jn && m.jnt_type[ja] === 3 ? m.jnt_qposadr[ja] : -1,
    };
  });
}

const header = {
  version: 2,
  kind: 'duck-kurzlauf',
  chip: 'sim-aufzeichnung',
  robot: 'open-duck-mini-v2',
  rate: RATE,
  seconds: T.EPISODE.seconds,
  trackSeconds: T.TRACK.seconds,
  links: LINKS,
  actuators: core.ACTUATORS,
  tree: kinTree(),
  scale: SCALE,
  stride: Q,
  steps: [
    { id: 'nur-vorwaerts', deck: T.DECKS.start, segments: flop.segs, stoppedBy: flop.lastHack, gen: flop.lastGen },
    { id: 'durchhalten-aufrecht', deck: T.DECKS.fix, segments: fix.segs, gen: fix.lastGen },
    { id: 'teststrecke', hidden: T.WORLDS.test, train: T.WORLDS.train, successM: T.TRACK.successM, segments: [one, robust] },
  ],
  built: { tool: 'tools/duck/kurzlauf.mjs', station: 'src/zones/regelgarten/duck/core.ts', model: 'src/zones/regelgarten/duck/model.xml' },
};
const json = Buffer.from(JSON.stringify(header));
const pad = (8 - ((12 + json.length) % 8)) % 8;
const head = Buffer.alloc(12);
head.write('DKZL', 0, 'ascii');
head.writeUInt32LE(2, 4);
head.writeUInt32LE(json.length, 8);
const file = Buffer.concat([head, json, Buffer.alloc(pad), ...chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))]);
const br = zlib.brotliCompressSync(file, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC } }).length;
console.log(`nur-vorwaerts: ${flop.segs.length} generation(s), stopped: ${flop.lastHack ?? '–'} · fix: generations ${fix.segs.map((s) => s.gen).join(', ')} (median ${fix.segs.at(-1).stats.medianDist} m) · track one world ${one.k}/20, random worlds ${robust.k}/20`);
console.log(`${path.relative(ROOT, OUT)}: ${(file.length / 1024).toFixed(0)} KB raw · ${(br / 1024).toFixed(0)} KB brotli`);
if (args.check) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT) : null;
  if (!cur || !cur.equals(file)) {
    console.error('differs from the committed file');
    process.exit(1);
  }
  console.log('up to date');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, file);
}
