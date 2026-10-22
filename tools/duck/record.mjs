#!/usr/bin/env node
// The recorded generations of „Lauf, Ente!" (plan §5.4 fallback: no module worker, no WebAssembly, or
// a CPU too slow even at the halved population): the station's own worker code run in Node with the
// stripped MuJoCo build, so every recorded generation is a real one (chip SIM · AUFZEICHNUNG).
//
//   node tools/duck/record.mjs [--out src/zones/regelgarten/duck/rec/duck-rec.bin] [--check]
//
// What it records (≤ 1.5 MB served with brotli; the raw file is larger, the build writes .br/.gz):
//   c1:<f>_<s>_<l>   C1: 12 hand gaits (rate × stride × foot lift), 64 copies in 64 worlds (stats),
//                    16 of them with poses
//   c2:<deck>        C2: the decks start (belly flop), statue, costsOnly (instant faller) until their
//                    hack stops the run, and fix (walks, 10 generations)
//   retrain:fix      C3: the fix deck retrained in random worlds (2 per gait, the worse counts)
//   track one|rand   C3: the 20 test runs of the one-world and the retrained gait
//
// Format (little-endian): 'DREC' · u32 version · u32 header bytes · header JSON · pad to 8 ·
// Int16 data. Each entry's poses are qpos samples (7 root values + 14 joints: position × 1024,
// quaternion × 4096, joint angle × 1024: ≈ 1 mm and 1 mrad) at `rate` Hz, delta-coded along time per duck and
// channel; the header carries the duck's kinematic tree so the station rebuilds every link pose
// (recorded.ts). Seeds are fixed: re-running writes the same bytes (--check compares).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { LINKS, loadDuck, parseArgs, ROOT } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const OUT = path.resolve(String(args.out ?? path.join(ROOT, 'src/zones/regelgarten/duck/rec/duck-rec.bin')));
const D = await loadDuck();
const { core, T, M } = D;
const sim = D.sim(LINKS);
const DECIM = 2; // 25 Hz → 12.5 Hz
const RATE = T.EPISODE.recHz / DECIM;
const Q = core.QPOS_STRIDE;
const SCALE = { pos: 1024, quat: 4096, joint: 1024 };

// ── the kinematic tree of the recorded links (MuJoCo body frames = the GLB's link frames) ──
const m = sim.model;
const BODY = M.mjtObj.mjOBJ_BODY.value;
const bid = (n) => M.mj_name2id(m, BODY, n);
const nameOf = new Map(LINKS.map((n) => [bid(n), n]));
const tree = LINKS.map((link) => {
  const b = bid(link);
  let p = m.body_parentid[b];
  // the nearest recorded ancestor (all recorded links chain directly in this model)
  if (p > 0 && !nameOf.has(p)) throw new Error(`${link}: parent ${p} not recorded`);
  const jn = m.body_jntnum[b];
  const ja = m.body_jntadr[b];
  const jt = jn ? m.jnt_type[ja] : -1;
  return {
    link,
    parent: p > 0 ? LINKS.indexOf(nameOf.get(p)) : -1,
    pos: Array.from(m.body_pos.slice(b * 3, b * 3 + 3), (v) => +v.toFixed(7)),
    quat: Array.from(m.body_quat.slice(b * 4, b * 4 + 4), (v) => +v.toFixed(7)),
    // hinge joints only (type 3); the root's free joint is qpos 0…6
    q: jn && jt === 3 ? m.jnt_qposadr[ja] : -1,
    root: jn && jt === 0,
  };
});

// ── data ──────────────────────────────────────────────────────────────────
const chunks = [];
let off = 0;
/** qpos Float32 (ducks × samples25 × Q) → delta-coded Int16 (ducks × samples × Q) at 12.5 Hz */
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
        const o = (d * S + s) * Q + k;
        out[o] = v - prev[k];
        prev[k] = v;
      }
    }
  }
  const at = off;
  chunks.push(out);
  off += out.length;
  return { off: at, len: out.length, samples: S };
}
const r3 = (v) => +v.toFixed(3);
const statsOut = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v]));

/** one generation through the station's GenerationJob (fixed seed), recorded */
function generation(cem, { gen, deck, seed, ranges = null, fixed = null, curriculum = false, keepDucks = T.CEM.population }) {
  const ramp = curriculum ? Math.max(0, Math.min(1, (gen - T.CURRICULUM.fromGen) / (T.CURRICULUM.toGen - T.CURRICULUM.fromGen))) : 1;
  const job = new core.GenerationJob(sim, fixed ? null : cem, {
    gen,
    pop: T.CEM.population,
    weights: core.weightsOf(deck, T.CARDS, ramp),
    ranges,
    nominal: T.WORLDS.nominal,
    seed,
    record: false,
    recordQpos: true,
    reference: T.REFERENCE,
    fixed,
    repeats: ranges && !fixed ? T.CEM.repeatsRandom : 1,
  });
  job.work(1e12, () => performance.now());
  const res = job.finish();
  const hack = !fixed && gen >= T.HACKS.minGen ? core.detectHack(res.eliteStats, T.HACKS) : null;
  const keep = Math.min(keepDucks, res.results.length);
  const data = push(res.qrec.subarray(0, keep * res.samples * Q), keep, res.samples);
  return {
    gen,
    pop: res.results.length,
    recDucks: keep,
    ...data,
    dist: res.results.map((r) => r3(r.dist)),
    fallT: res.results.map((r) => (r.fell ? r3(r.t) : -1)),
    friction: res.worlds.map((w) => r3(w.friction)),
    elite: res.elite,
    stats: statsOut(res.stats),
    eliteStats: statsOut(res.eliteStats),
    hack,
    mu: Array.from(res.mu, (v) => +v.toFixed(5)),
    sd: Array.from(res.sd, (v) => +v.toFixed(5)),
  };
}

function trainRun(name, deck, { seed, maxGen = T.CEM.generations, ranges = null, stopOnHack = true }) {
  const cem = new core.Cem(T.GAIT, T.CEM);
  const gens = [];
  const r = core.rng(seed);
  for (let g = 1; g <= maxGen; g++) {
    const e = generation(cem, { gen: g, deck, seed: (r() * 2 ** 31) | 0, ranges });
    gens.push(e);
    if (stopOnHack && e.hack) break;
  }
  console.log(`${name}: ${gens.length} generations${gens.at(-1).hack ? `, stopped: ${gens.at(-1).hack}` : ''} · median ${gens.at(-1).stats.medianDist} m`);
  return { deck, gens };
}

const header = { version: 1, rate: RATE, seconds: T.EPISODE.seconds, trackSeconds: T.TRACK.seconds, links: LINKS, tree, scale: SCALE, stride: Q, runs: {}, tracks: {}, built: { tool: 'tools/duck/record.mjs', model: 'src/zones/regelgarten/duck/model.xml' } };

// C1: 12 hand gaits (rate × stride × foot lift); the station plays the nearest
const H = T.HAND;
const grid = [];
for (const f of [1.5, H.freq.value, 3.0]) for (const s of [H.hipAmp.value, 0.3]) for (const l of [H.kneeAmp.value, 0.6]) grid.push([f, s, l]);
for (const [f, s, l] of grid) {
  const p = [...H.base];
  p[H.freq.param] = f;
  p[H.hipAmp.param] = s;
  p[H.kneeAmp.param] = l;
  const e = generation(null, { gen: 1, deck: T.DECKS.start, seed: 7, ranges: T.WORLDS.train, fixed: p, keepDucks: 16 });
  header.runs[`c1:${f}_${s}_${l}`] = { hand: [f, s, l], gens: [e] };
}
console.log(`c1: ${Object.keys(header.runs).length} hand gaits`);

// C2 decks
header.runs['c2:start'] = trainRun('c2:start', T.DECKS.start, { seed: 1 });
header.runs['c2:statue'] = trainRun('c2:statue', T.DECKS.statue, { seed: 2 });
header.runs['c2:costsOnly'] = trainRun('c2:costsOnly', T.DECKS.costsOnly, { seed: 1 });
header.runs['c2:fix'] = trainRun('c2:fix', T.DECKS.fix, { seed: 1, stopOnHack: false });
header.runs['retrain:fix'] = trainRun('retrain:fix', T.DECKS.fix, { seed: 101, ranges: T.WORLDS.train, stopOnHack: false });

// C3 tracks
for (const [key, run] of [['one', 'c2:fix'], ['rand', 'retrain:fix']]) {
  const gait = header.runs[run].gens.at(-1).mu;
  const S = sim.samples(T.TRACK.seconds);
  const qrec = new Float32Array(T.TRACK.runs * S * Q);
  const runs = core.testRuns(sim, gait, T.TRACK.runs, T.TRACK.seed, T.WORLDS.test, T.TRACK.seconds, T.TRACK.successM, undefined, qrec);
  const data = push(qrec, T.TRACK.runs, S);
  header.tracks[key] = { gait, seed: T.TRACK.seed, ...data, runs: runs.map((r) => ({ world: Object.fromEntries(Object.entries(r.world).map(([k, v]) => [k, r3(v)])), dist: r3(r.result.dist), fell: r.result.fell, t: r3(r.result.t), success: r.success })) };
  console.log(`track ${key}: ${runs.filter((r) => r.success).length}/20 (falls ${runs.filter((r) => r.result.fell).length})`);
}

// ── write ─────────────────────────────────────────────────────────────────
const json = Buffer.from(JSON.stringify(header));
const headLen = 12 + json.length;
const pad = (8 - (headLen % 8)) % 8;
const data = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
const head = Buffer.alloc(12);
head.write('DREC', 0, 'ascii');
head.writeUInt32LE(1, 4);
head.writeUInt32LE(json.length, 8);
const file = Buffer.concat([head, json, Buffer.alloc(pad), data]);
const br = zlib.brotliCompressSync(file, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: file.length } }).length;
console.log(`${path.relative(ROOT, OUT)}: ${(file.length / 1048576).toFixed(2)} MB raw · ${(br / 1048576).toFixed(2)} MB brotli (cap 1.5)`);
if (args.check) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT) : null;
  if (!cur || !cur.equals(file)) {
    console.error('the committed recordings differ from what this run writes');
    process.exit(1);
  }
  console.log('up to date');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, file);
}
if (br > 1.5 * 1048576) process.exitCode = 1;
