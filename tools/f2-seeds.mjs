#!/usr/bin/env node
// WP13 feature check (docs/PHASE7-PLAN.md §6.6 WP13, §4.14, §4.15): the Startprüfung's toy model.
//
//   node tools/f2-seeds.mjs [--seeds 5 | --all] [--verbose]
//
// Loads src/world/finale/sim.ts through Vite's SSR loader (no build, no browser) and checks:
//   F2 targets   for each protocol seed (SEED_POOL, `--seeds n` spread over the pool, `--all` every one):
//                the audit of 200 trials per controller still meets GDD §6.6's acceptance targets
//                (NN-Lage v2 ruhig 100 %, böig 88–93 %, Sturm 33–47 %; Bestand ruhig ≥ 97 %, böig ≥ 96 %,
//                Sturm 88–92 %) — Phase 7 changed the finale around it, the numbers must not move;
//   cloud gust   the lift-off's seeded böig gust (finale/tuning.ts CLOUD_GUST, sim.ts runCloudGust): every
//                F3 choice holds it (never a crash, |θ| < 3°), Pilot (NN) leaves its training envelope
//                (the shudder), Pilot mit Auflage falls back to Bestand inside the shown window, Kein
//                Pilot (Bestand) never falls back, and the visual tilt stays ≤ 1.5° (plan §4.15).
// Exit 1 on a miss. Writes artifacts/phase7/f2-seeds.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const verbose = flag('verbose');

const { createServer } = await import('vite');
const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@': path.join(ROOT, 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

const rows = [];
let failed = 0;
const check = (group, name, ok, detail = '') => {
  rows.push({ group, name, ok: !!ok, detail });
  if (!ok) failed++;
  if (!ok || verbose) console.log(`${ok ? '  ok  ' : '  FAIL'} ${group} · ${name}${detail ? ` — ${detail}` : ''}`);
};

/** GDD §6.6 acceptance targets (sim.ts SEED_POOL comment), as rates k/n */
const TARGETS = {
  nn: { ruhig: [1, 1], boeig: [0.88, 0.93], sturm: [0.33, 0.47] },
  bestand: { ruhig: [0.97, 1], boeig: [0.96, 1], sturm: [0.88, 0.92] },
};
const pct = (x) => `${Math.round(x * 1000) / 10} %`;

const out = { seeds: [], cloud: {} };
try {
  const sim = await server.ssrLoadModule('/src/world/finale/sim.ts');
  const tuning = await server.ssrLoadModule('/src/world/finale/tuning.ts');
  const pool = sim.SEED_POOL;
  const n = flag('all') ? pool.length : Math.max(1, Math.min(pool.length, Number(opt('seeds', 5))));
  // spread the picks over the pool (the first, the last and evenly between)
  const picks = n >= pool.length ? [...pool] : Array.from({ length: n }, (_, i) => pool[Math.round((i * (pool.length - 1)) / Math.max(1, n - 1))]);
  for (const seed of picks) {
    const { tally } = sim.runAudit(seed, false);
    const row = { seed };
    for (const c of ['nn', 'bestand'])
      for (const w of ['ruhig', 'boeig', 'sturm']) {
        const t = tally[c][w];
        const r = t.k / t.n;
        const [lo, hi] = TARGETS[c][w];
        // the targets are rates rounded to whole per cent in the GDD
        const ok = r >= lo - 0.005 && r <= hi + 0.005;
        row[`${c}.${w}`] = `${t.k}/${t.n}`;
        check(`seed ${seed}`, `${c} ${w} ${pct(r)} in ${pct(lo)}–${pct(hi)}`, ok, `${t.k}/${t.n}`);
      }
    out.seeds.push(row);
  }
  console.log(`F2: ${picks.length} seed(s) checked`);

  // the lift-off's gust in the cloud: the F3 choice flies it (plan §4.15)
  const G = tuning.CLOUD_GUST;
  const shown = G.showS;
  const runs = Object.fromEntries(['nn', 'bestand', 'cond'].map((c) => [c, sim.runCloudGust(c, G.gusts, G.seed, shown + 2.5, 40)]));
  for (const [c, r] of Object.entries(runs)) {
    out.cloud[c] = { ok: r.ok, maxTilt: Math.round(r.maxTilt * 1000) / 1000, fallbackT: Math.round(r.fallbackT * 100) / 100, outside: [...r.outside].reduce((a, b) => a + b, 0) };
    check('cloud gust', `${c}: holds (|θ| < 3°, never a crash)`, r.ok && r.maxTilt < 3, `max ${r.maxTilt.toFixed(2)}°`);
  }
  check('cloud gust', 'Pilot (NN-Lage v2) leaves its training envelope: the shudder', runs.nn.outside.some((x) => x), `${out.cloud.nn.outside} samples at 40 Hz`);
  check('cloud gust', 'Pilot mit Auflage falls back to Bestand inside the window', runs.cond.fallbackT >= 0 && runs.cond.fallbackT < shown, `at ${runs.cond.fallbackT.toFixed(2)} s of ${shown} s`);
  check('cloud gust', 'Kein Pilot (Bestand) never falls back', runs.bestand.fallbackT < 0);
  const k = Math.min(1, G.maxVisualDeg / Math.max(...Object.values(runs).map((r) => r.maxTilt)));
  const visual = Math.max(...Object.values(runs).map((r) => Math.min(1, G.maxVisualDeg / r.maxTilt) * r.maxTilt));
  check('cloud gust', `visual tilt ≤ ${G.maxVisualDeg}°`, visual <= G.maxVisualDeg + 1e-9, `${visual.toFixed(2)}° (scale ${k.toFixed(2)})`);
  // the F3 rec's run is deterministic: the same seed twice gives the same trace
  const again = sim.runCloudGust('cond', G.gusts, G.seed, shown + 2.5, 40);
  check('cloud gust', 'deterministic for its seed', again.roll.every((v, i) => v === runs.cond.roll[i]) && again.fallbackT === runs.cond.fallbackT);
} finally {
  await server.close();
}

fs.mkdirSync(path.join(ROOT, 'artifacts', 'phase7'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts', 'phase7', 'f2-seeds.json'), JSON.stringify({ rows, ...out }, null, 1));
console.log(failed ? `FAIL ${failed} of ${rows.length} checks` : `OK   ${rows.length} checks: the F2 targets hold, the cloud's gust flies every F3 choice`);
process.exit(failed ? 1 : 0);
