#!/usr/bin/env node
// Lern-Dojo acceptance (docs/PHASE7-PLAN.md WP6, R1 §11): the station's own simulation core in Node —
// the same files the zone runs (src/zones/lern-dojo/{kin,bench,demo,expert,policy,vision,lab}.ts,
// loaded through Vite's SSR loader like tools/quest-derive.mjs), Rapier, and the SO-101 chain read from
// WP0's GLB (src/robots/glb/so101.glb, its node table; no hand-typed kinematics).
//
//   node tools/lerndojo-check.mjs [--seeds 10] [--verbose] [--json <file>]
//
// Checks (R1 §11 acceptance, plan §4.5):
//   1 lag     the follower mirrors the leader within 2° after 0.3 s (a 20° step on every joint; a
//             teleop sweep at hand speed that stops)
//   2 end     a demo ends by itself when its cube rests in the Kiste (every scripted demo of the run)
//   3 words   with one-cube one-word demos the policy picks by position in ≥ 9/10 seeds: the
//             prediction (red where no demo was, blue on a recorded field, „rot“ → blue) and
//             „Anderes Wort“ (red on a recorded field, „blau“ → red)
//   4 rescue  after 4 two-colour demos with alternating words it picks blue in ≥ 9/10
//   5 cards   „Abendlicht“ and „Kamera angestoßen“ fail in ≥ 9/10, then recover after their fixes
//             („Helligkeit variieren“ + retrain; „Kamera festschrauben“) in ≥ 9/10
// Reported (not gated): the first command in distribution, „Neue Lage“ failing, the selector weights,
// pairs, run times. Exit 1 on a failed check. Output: artifacts/phase7/lerndojo/check.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i < 0 ? d : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
};
const SEEDS = Number(arg('seeds', 10));
const verbose = !!arg('verbose', false);
const outFile = arg('json', path.join(ROOT, 'artifacts', 'phase7', 'lerndojo', 'check.json'));

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
const load = (p) => server.ssrLoadModule(p);
const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
await RAPIER.init();

const results = [];
let failed = 0;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const glbJson = (file) => {
  const b = fs.readFileSync(file);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
};
const report = {};

try {
  const THREE = await import('three');
  const K = await load('/src/zones/lern-dojo/kin.ts');
  const T = await load('/src/zones/lern-dojo/tuning.ts');
  const L = await load('/src/zones/lern-dojo/lab.ts');
  const V = await load('/src/zones/lern-dojo/vision.ts');
  const B = await load('/src/zones/lern-dojo/bench.ts');
  const E = await load('/src/zones/lern-dojo/expert.ts');
  const follower = K.chainFromGlb(glbJson(path.join(ROOT, 'src/robots/glb/so101.glb')));
  const leader = K.chainFromGlb(glbJson(path.join(ROOT, 'src/robots/glb/so101-leader.glb')));
  const lab = new L.DojoLab(RAPIER, new RAPIER.World({ x: 0, y: -9.81, z: 0 }), follower);
  const sim = lab.sim;
  const F = T.LAYOUT.fields;
  const deg = (r) => (r * 180) / Math.PI;

  // ── 0 · the leader moves the follower's kinematics (R1 §2.2: they differ only below gripper_link) ──
  {
    const above = (c) => c.links.filter((l) => l.link !== 'gripper_frame_link' && !/jaw|trigger|handle/i.test(l.link) && l.link !== 'gripper_link').map((l) => [l.link, l.p.map((v) => v.toFixed(5)).join(','), l.q.map((v) => v.toFixed(5)).join(',')].join(' '));
    const a = above(follower), b = above(leader);
    const g = (c) => c.links.find((l) => l.link === 'gripper_link');
    const same = JSON.stringify(a) === JSON.stringify(b) && g(follower).p.every((v, i) => Math.abs(v - g(leader).p[i]) < 1e-5);
    check('chain: leader = follower up to gripper_link (joint copy moves the same arm)', same, `${a.length} links`);
  }

  // ── 1 · follower lag ──────────────────────────────────────────────────────────────────────
  {
    // a 20° step on every arm joint at once, from home
    sim.setArm(lab.home);
    const step = Float64Array.from(lab.home);
    for (let j = 0; j < 5; j++) step[j] += (20 * Math.PI) / 180 * (j % 2 ? -1 : 1);
    let t = 0;
    lab.stepper.run(0.3 + 1e-6, () => sim.command(step), () => false);
    t = 0.3;
    const errStep = Math.max(...[0, 1, 2, 3, 4].map((j) => Math.abs(deg(sim.q[j] - sim.target[j]))));
    const errLeader = Math.max(...[0, 1, 2, 3, 4].map((j) => Math.abs(deg(sim.q[j] - Math.min(sim.arm.limits(j)[1], Math.max(sim.arm.limits(j)[0], step[j]))))));
    check('lag: a 20° step, 0.3 s later within 2°', errLeader < 2, `max ${errLeader.toFixed(2)}° (vs target ${errStep.toFixed(2)}°)`);
    // a teleop sweep: the jaw centre at 0.4 m/s over the fields for 2 s, then it stops
    sim.setArm(lab.home);
    const ik = lab.ik;
    ik.setAll(lab.home);
    const p = new THREE.Vector3();
    let k = 0;
    const path = (s) => p.set(0.04 + 0.12 * Math.sin(s * 1.7), 0.06 + 0.02 * Math.sin(s * 2.3), -0.15 + 0.07 * Math.cos(s * 1.3));
    lab.stepper.run(2, () => {
      E.reach(ik, path(k++ / T.CLOCK.ctrlHz), 0);
      sim.command(ik.q);
    }, () => false);
    const hold = Float64Array.from(ik.q);
    lab.stepper.run(0.3, () => sim.command(hold), () => false);
    const errSweep = Math.max(...[0, 1, 2, 3, 4].map((j) => Math.abs(deg(sim.q[j] - hold[j]))));
    check('lag: a teleop sweep stops, 0.3 s later within 2°', errSweep < 2, `max ${errSweep.toFixed(2)}°, clipped ticks ${sim.clipped}`);
    report.lag = { stepDeg: +errLeader.toFixed(3), sweepDeg: +errSweep.toFixed(3), tauS: T.SERVO.tauS };
  }

  // ── 2–5 · demos, words, rescue, cards over seeds ────────────────────────────────────────────
  const rnd = (s) => E.mulberry32(s);
  const jit = (r, c, m = 0.002) => ({ ...c, x: c.x + (r() - 0.5) * 2 * m, z: c.z + (r() - 0.5) * 2 * m, yaw: (r() - 0.5) * 0.1 });
  const tally = {};
  const count = (k, ok) => {
    tally[k] ??= { ok: 0, n: 0 };
    tally[k].n++;
    if (ok) tally[k].ok++;
  };
  let demosTotal = 0,
    demosEnded = 0,
    demoMs = 0;
  const weights = [];
  const t0 = performance.now();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = rnd(seed * 7919);
    // A: five one-cube demos (one per field, „rot“), as a player would after five rounds
    const a0 = performance.now();
    const A = F.map((f, i) => lab.expertDemo([jit(r, L.fieldCube(i))], 'rot', 'rot', seed * 100 + i, i + seed));
    demoMs += performance.now() - a0;
    demosTotal += A.length;
    demosEnded += A.filter((d) => d.ok).length;
    const m0 = lab.train(A);
    // the first command (in distribution)
    const first = lab.rollout(m0, [jit(r, L.fieldCube(T.STATION_B.firstField))], 'rot');
    count('first command in distribution', first.status === 'success');
    // 3 · words: the prediction and „Anderes Wort“
    const pred = lab.rollout(m0, L.SETUPS.prediction(2).map((c) => jit(r, c)), 'rot');
    count('prediction: blue', pred.boxed === 'blau');
    const word = lab.rollout(m0, L.SETUPS.otherWord(1).map((c) => jit(r, c)), 'blau');
    count('other word: red', word.boxed === 'rot');
    const pose = lab.rollout(m0, L.SETUPS.newPose().map((c) => jit(r, c)), 'rot');
    count('new pose fails', pose.status !== 'success');
    // 5 · cards
    const dusk = lab.rollout(m0, [jit(r, L.fieldCube(2))], 'rot', { light: V.DUSK });
    count('dusk fails', dusk.status !== 'success');
    const mj = lab.train(A, true);
    const duskFix = lab.rollout(mj, [jit(r, L.fieldCube(2))], 'rot', { light: V.DUSK });
    count('dusk fixed (jitter + retrain)', duskFix.status === 'success');
    const bump = lab.rollout(m0, [jit(r, L.fieldCube(3))], 'rot', { bump: T.VISION.bump });
    count('camera fails', bump.status !== 'success');
    const unbump = lab.rollout(m0, [jit(r, L.fieldCube(3))], 'rot', { bump: V.NO_BUMP });
    count('camera fixed (screwed tight)', unbump.status === 'success');
    // 4 · the rescue: 4 two-colour demos, alternating words
    const R = [0, 1, 2, 3].map((k) => {
      const s = L.SETUPS.rescue(k);
      return lab.expertDemo(s.cubes.map((c) => jit(r, c)), s.word, s.word, seed * 1000 + k, k + 2 * seed);
    });
    demosTotal += R.length;
    demosEnded += R.filter((d) => d.ok).length;
    const m1 = lab.train([...A, ...R]);
    const pre = lab.rollout(m0, L.SETUPS.rescueTest().map((c) => jit(r, c)), 'blau');
    count('before the rescue: blue ignored', pre.status !== 'success');
    const post = lab.rollout(m1, L.SETUPS.rescueTest().map((c) => jit(r, c)), 'blau');
    count('after 4 two-colour demos: blue', post.status === 'success');
    weights.push({ before: [+m0.selector.a.toFixed(2), +m0.selector.b.toFixed(2)], after: [+m1.selector.a.toFixed(2), +m1.selector.b.toFixed(2)], pairs: m0.pairs });
    if (verbose)
      console.log(
        `  seed ${seed}: first ${first.status} · pred ${pred.boxed} · word ${word.boxed} · pose ${pose.status} · dusk ${dusk.status}→${duskFix.status} · cam ${bump.status}→${unbump.status} · rescue ${pre.status}→${post.status} · a ${m1.selector.a.toFixed(2)} b ${m1.selector.b.toFixed(2)}`,
      );
  }
  const ms = performance.now() - t0;
  const rate = (k) => `${tally[k].ok}/${tally[k].n}`;
  const atLeast9 = (k) => tally[k].ok >= Math.ceil(0.9 * tally[k].n);
  check('end: every scripted demo ended by itself with its cube resting in the Kiste', demosEnded === demosTotal, `${demosEnded}/${demosTotal}`);
  check('words: one-cube demos pick by position (prediction → blue) in ≥ 9/10 seeds', atLeast9('prediction: blue'), rate('prediction: blue'));
  check('words: one-cube demos pick by position („Anderes Wort“ → red) in ≥ 9/10 seeds', atLeast9('other word: red'), rate('other word: red'));
  check('rescue: after 4 two-colour demos it picks blue in ≥ 9/10', atLeast9('after 4 two-colour demos: blue'), rate('after 4 two-colour demos: blue'));
  check('cards: Abendlicht fails in ≥ 9/10', atLeast9('dusk fails'), rate('dusk fails'));
  check('cards: Abendlicht recovers after „Helligkeit variieren“ in ≥ 9/10', atLeast9('dusk fixed (jitter + retrain)'), rate('dusk fixed (jitter + retrain)'));
  check('cards: Kamera angestoßen fails in ≥ 9/10', atLeast9('camera fails'), rate('camera fails'));
  check('cards: Kamera recovers after „Kamera festschrauben“ in ≥ 9/10', atLeast9('camera fixed (screwed tight)'), rate('camera fixed (screwed tight)'));
  console.log(`  info first command ${rate('first command in distribution')} · new pose fails ${rate('new pose fails')} · blue ignored before the rescue ${rate('before the rescue: blue ignored')}`);
  console.log(`  info selector a/b before ${JSON.stringify(weights[0]?.before)} after ${JSON.stringify(weights[0]?.after)} · pairs ${weights[0]?.pairs} · ${(demoMs / demosTotal).toFixed(1)} ms per scripted demo · ${(ms / 1000).toFixed(1)} s in all`);
  report.tally = tally;
  report.weights = weights;
  report.seconds = +(ms / 1000).toFixed(1);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await server.close();
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), seeds: SEEDS, failed, results, ...report }, null, 1));
console.log(failed ? `FAIL lerndojo-check: ${failed} failed` : `OK   lerndojo-check (${results.length} checks)`);
process.exit(failed ? 1 : 0);
