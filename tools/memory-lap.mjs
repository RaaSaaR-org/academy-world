#!/usr/bin/env node
// Memory over a full lap, and JS time while paused (docs/PHASE7-PLAN.md §5.9 [C1 m3, m8, m12]).
//
//   node tools/memory-lap.mjs [--dist <dir> | --dev] [--no-check]
//
// Production build, Chromium with CDP: every area loaded (__academy.loadAll), then
//   lap 1   each area with code: approach, walk in, its solve hooks, back to the plaza; after each
//           area a sample after a forced GC: three's geometries, textures, programs
//           (renderer.info.memory) and the JS heap (CDP Runtime.getHeapUsage);
//   lap 2   the same areas again (visits only): memory must not keep growing (a leak):
//           geometries and textures ≤ lap 1 + 5 %, JS heap ≤ lap 1 + 10 % + 8 MB;
//   suspend once ground areas have code and the lift-off exists (WP13 world:liftoff-skip): airborne,
//           the ground areas suspended, they must give memory back (geometries + textures drop, the
//           robot models of suspended areas leave the scene). The first flight uploads what only the
//           air shows (sky dressing, cloud sea, the lift-off's own objects: ≈ +60 geometries), so the
//           comparison is the second flight: fly, dock (world:liftoff-dock), visit the ground areas
//           again, sample, fly again, sample (integrator, wave 2: WP13's note). Pending until then;
//   paused  the game paused 3 s: main-thread script time ≤ 30 ms (CDP ScriptDuration; the CEM worker,
//           the LifeDirector and every zone stop on game:pause), JS per rAF frame p95 ≤ 0.3 ms, no draws.
// Writes artifacts/<PT_DIR|measure>/memory-lap.json. Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, openGame, record, parseArgs, saveJson, round } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const v = new Verdict('memory-lap');
const srv = await gameServer(args);
const browser = await launchChromium({ full: true });
const samples = [];
const out = { samples };
try {
  const { page, ctx, errors } = await openGame(browser, `${srv.url}/?reset=1&skipIntro=1&lang=de&mode=entdecker&quality=high`, { all: true });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const ev = (code) => page.evaluate(`(async () => { ${code} })()`);
  const W = (ms) => page.waitForTimeout(ms);
  const sample = async (label) => {
    await cdp.send('HeapProfiler.collectGarbage');
    await W(400);
    const heap = await cdp.send('Runtime.getHeapUsage');
    const m = await page.evaluate(() => {
      const A = window.__academy;
      const r = A.game.rs.renderer.info;
      // robot models in the scene (RobotModel.object carries userData.robot)
      let robots = 0;
      A.game.rs.scene.traverse((o) => {
        if (o.userData && o.userData.robot && o.name && o.name.startsWith('robot:')) robots++;
      });
      return { geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length ?? 0, robots };
    });
    const s = { label, ...m, heapMB: round(heap.usedSize / 1048576, 1) };
    samples.push(s);
    console.log(`${label.padEnd(26)} geometries ${String(s.geometries).padStart(5)} · textures ${String(s.textures).padStart(4)} · programs ${String(s.programs).padStart(4)} · heap ${String(s.heapMB).padStart(6)} MB${s.robots ? ` · robots ${s.robots}` : ''}`);
    return s;
  };
  await W(2500);
  await sample('start (all areas loaded)');
  const areas = await page.evaluate(() => window.__academy.manifests('all').filter((m) => m.hasCode && !m.id.startsWith('_')).map((m) => ({ id: m.id, n: m.stations.length, frame: m.frame })));
  const acts = new Set(await page.evaluate(() => window.__academy.debugActions()));
  const visit = async (a, solve) => {
    await ev(`__academy.teleport('${a.id}')`);
    await W(1500);
    await ev(`__academy.press('KeyW', 1400)`);
    await W(2000);
    if (solve)
      for (let i = 0; i < a.n; i++) {
        const h = `solve-${'abc'[i]}`;
        if (!acts.has(`${a.id}:${h}`)) continue;
        await ev(`await Promise.race([__academy.solve('${a.id}','${h}'), new Promise((r) => setTimeout(r, 15000))]); __academy.closeModals(); __academy.exitOperate();`);
        await W(1500);
      }
    await ev(`__academy.closeModals(); __academy.exitOperate(); __academy.teleport([0,0,40],{yaw:0,pitch:0})`);
    await W(2000);
  };
  for (const a of areas) {
    await visit(a, true);
    await sample(`lap 1: ${a.id}`);
  }
  const lap1 = samples[samples.length - 1];
  for (const a of areas) await visit(a, false);
  const lap2 = await sample('lap 2: end');
  v.check('lap 2 vs lap 1: geometries', lap2.geometries, '<=', Math.ceil(lap1.geometries * 1.05));
  v.check('lap 2 vs lap 1: textures', lap2.textures, '<=', Math.ceil(lap1.textures * 1.05));
  v.check('lap 2 vs lap 1: JS heap after GC', lap2.heapMB, '<=', round(lap1.heapMB * 1.1 + 8, 1), ' MB');

  // suspension (§5.9): ground areas give their memory back when the island is airborne
  const ground = areas.filter((a) => a.frame === 'ground');
  if (!ground.length || !acts.has('world:liftoff-skip')) {
    v.note(`pending: suspension (${!ground.length ? 'no ground area with code yet: WP9, WP10, WP14' : 'no world:liftoff-skip hook yet: WP13'})`);
  } else {
    await ev(`await __academy.solve('world','finale-goto')`);
    for (const h of ['finale-f1-solve', 'finale-f2-solve', 'finale-f3-solve']) await ev(`await __academy.solve('world','${h}')`);
    // flight 1: the air's own first uploads, then back into the dock
    await ev(`await __academy.solve('world','liftoff-skip')`);
    await W(4000);
    await sample('flight 1 (first airborne uploads)');
    await ev(`await __academy.solve('world','liftoff-dock')`);
    await W(3000);
    for (const a of ground) await visit(a, false);
    const before = await sample('docked again, ground areas visited');
    await ev(`await __academy.solve('world','liftoff-skip')`);
    await W(4000);
    const after = await sample('flight 2 (ground suspended)');
    v.check('suspended ground areas give memory back: geometries + textures', after.geometries + after.textures, '<', before.geometries + before.textures);
    if (before.robots > 0) v.check('suspended ground areas release their robots', after.robots, '<', before.robots);
  }

  // paused: no JS, no draws
  await ev(`__academy.teleport([0,0,30],{yaw:0,pitch:0})`);
  await W(1500);
  await ev(`__academy.pause()`);
  await W(800);
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const rec = await record(page, 3000);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const scriptMs = round((m1.ScriptDuration - m0.ScriptDuration) * 1000, 1);
  const draws = rec.raw.frames.reduce((a, f) => a + (f.d.draw || 0), 0);
  out.paused = { scriptMs, js95: rec.js.p95, frames: rec.raw.frames.length, draws };
  console.log(`paused 3 s: script ${scriptMs} ms on the main thread · JS per frame p95 ${rec.js.p95} ms · ${draws} draws`);
  v.check('paused 3 s: main-thread script time', scriptMs, '<=', 30, ' ms');
  v.check('paused: JS per rAF frame p95', rec.js.p95, '<=', 0.3, ' ms');
  v.check('paused: draw calls', draws, '<=', 0);
  await ev(`__academy.resume()`);
  out.errors = errors;
  v.check('page errors', errors.length, '<=', 0);
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('memory-lap.json', out);
v.exit(args);
