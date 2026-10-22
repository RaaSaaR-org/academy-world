// Shared by the duck tools (calibrate, record, kurzlauf, mujoco-check's Node part): loads MuJoCo
// (the package's own glue and the wasm stripped like the build does), the station's light model,
// its tuning and its simulation core, the same files the browser worker runs (Node strips the
// TypeScript types itself).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DUCK = path.join(ROOT, 'src', 'zones', 'regelgarten', 'duck');
const PKG = path.join(ROOT, 'node_modules', '@mujoco', 'mujoco');

/** The recorded bodies: every link of the duck GLB that has geometry (core.ts LINKS). */
export { LINKS } from '../../src/zones/regelgarten/duck/core.ts';

export async function loadDuck({ stripped = true } = {}) {
  const core = await import(pathToFileURL(path.join(DUCK, 'core.ts')).href);
  const tuning = await import(pathToFileURL(path.join(ROOT, 'src', 'zones', 'regelgarten', 'tuning.ts')).href);
  const { default: loadMujoco } = await import(pathToFileURL(path.join(PKG, 'mujoco.js')).href);
  let wasmBinary;
  if (stripped) {
    const { stripWasm } = await import(pathToFileURL(path.join(ROOT, 'tools', 'mujoco', 'strip.mjs')).href);
    wasmBinary = stripWasm(fs.readFileSync(path.join(PKG, 'mujoco.wasm'))).bytes;
  }
  const M = await loadMujoco({ locateFile: (p) => path.join(PKG, p), ...(wasmBinary ? { wasmBinary } : {}) });
  const xml = fs.readFileSync(path.join(DUCK, 'model.xml'), 'utf8');
  const sim = (links = LINKS) => new core.DuckSim(M, xml, links, tuning.EPISODE);
  return { M, core, T: tuning, xml, sim };
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    const next = argv[i + 1];
    out[k] = inline !== undefined ? inline : next !== undefined && !next.startsWith('--') ? (i++, next) : true;
  }
  return out;
}

/**
 * Train one deck for up to `gens` generations (the station's C2 loop without the replay): the same
 * GenerationJob, CEM and detectors as the worker. Returns the per-generation log and the first hack.
 */
export function train(D, sim, { deck, gens, pop, seed, curriculum = false, ranges = null, stopOnHack = false, record = false, cem = null, onGen = null, repeats = 1 }) {
  const { core, T } = D;
  const c = cem ?? new core.Cem(T.GAIT, T.CEM);
  const r = core.rng(seed);
  const log = [];
  let hack = null;
  let hackGen = null;
  let streak = 0;
  for (let g = 1; g <= gens; g++) {
    const ramp = curriculum ? Math.max(0, Math.min(1, (g - T.CURRICULUM.fromGen) / (T.CURRICULUM.toGen - T.CURRICULUM.fromGen))) : 1;
    const job = new core.GenerationJob(sim, c, { gen: g, pop, weights: core.weightsOf(deck, T.CARDS, ramp), ranges, nominal: T.WORLDS.nominal, seed: (r() * 2 ** 31) | 0, record, reference: T.REFERENCE, repeats });
    job.work(1e12, () => performance.now());
    const res = job.finish();
    const h = g >= T.HACKS.minGen ? core.detectHack(res.eliteStats, T.HACKS) : null;
    streak = h && h === log.at(-1)?.hack ? streak + 1 : h ? 1 : 0;
    log.push({ gen: g, ms: Math.round(res.ms), fall: +res.stats.fallFrac.toFixed(2), median: +res.stats.medianDist.toFixed(3), elite: { fall: +res.eliteStats.fallFrac.toFixed(2), fall1: +res.eliteStats.fall1.toFixed(2), fall2: +res.eliteStats.fall2.toFixed(2), dist: +res.eliteStats.meanDist.toFixed(3), lift: +(res.eliteStats.meanLift * 1000).toFixed(1), act: +res.eliteStats.meanActRate.toFixed(4) }, hack: h });
    onGen?.(res, log.at(-1));
    if (h && !hack && streak >= T.HACKS.confirm) {
      hack = h;
      hackGen = g;
      if (stopOnHack) break;
    }
  }
  return { cem: c, log, hack, hackGen };
}
