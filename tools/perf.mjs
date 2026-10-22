#!/usr/bin/env node
// Performance survey of the production build with ALL zones loaded: fps, main-thread CPU ms per
// frame, draw calls and triangles (shadow + main + post passes) at the spawn, the plaza, the
// Ausguck, each zone (gate + four bearings from inside), the four Kanzeln, a juice view (bursts +
// banner) and the Kielraum.
//
//   node tools/perf.mjs [--quality high|medium|low] [--width 1440 --height 900 --dpr 2]
//
// Phase 7: then the named views of tools/lib/views.mjs (the bridge head, the airborne plaza, Kanzel 240,
// the cloud view, the Ausguck and the content views once they exist; pending ones are skipped) with
// their triangle budgets, and the §5.5 per-owner ledger at the spawn, the bridge head and the plaza
// (known rc4 misses print with their owner and fail only when they grow).
// Writes artifacts/playtest/perf-<quality>/perf.json; exit 1 when a view breaks the GDD §11 budget
// (500 draw calls, 1.5 M triangles) or averages below 55 fps, or when the ledger misses (--no-owners
// skips it).
import { session } from './lib/session.mjs';
import { DRAWS_BY_OWNER, checkLedger, formatLedger } from './lib/drawcalls.mjs';
import { VIEWS, GDD_GATE, gotoView, PHASE7_VIEWS } from './lib/views.mjs';
import { parseArgs } from './lib/shotlib.mjs';
import { loadAllAreas } from './lib/measure.mjs';
import fs from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const q = String(args.quality ?? 'high');
if (args.width) process.env.PT_W = String(args.width);
if (args.height) process.env.PT_H = String(args.height);
if (args.dpr) process.env.PT_DPR = String(args.dpr);
const rows = [];
const owners = {};
const A = { sensordom: [-80, 0], regelgarten: [-40, -69.28], greifwerkstatt: [40, -69.28], 'lern-dojo': [80, 0], dunkelfabrik: [40, 69.28], prueffeld: [-40, 69.28] };

const { errors } = await session(`perf-${q}`, async (s) => {
  await s.open(`/?skipIntro=1&quality=${q}`);
  await s.wait(2500);
  const meas = async (name, setup, views) => {
    await s.ev(setup);
    await s.wait(1200);
    for (const [yaw, pitch] of views) {
      await s.ev(`__academy.look(${yaw},${pitch})`);
      await s.wait(1800);
      const r = await s.val(`({ fps: __academy.fps(), ...__academy.renderInfo() })`);
      rows.push({ name, yaw: Math.round(yaw), pitch, ...r });
      console.log(`${name.padEnd(20)} yaw ${String(Math.round(yaw)).padStart(4)} pitch ${String(pitch).padStart(3)}  fps ${String(r.fps).padEnd(6)} cpu ${String(r.cpuMs).padEnd(5)} ms  calls ${String(r.calls).padStart(4)}  tris ${(r.triangles / 1000).toFixed(0).padStart(5)}k`);
    }
    await s.shot(name);
  };
  await meas('spawn', `__academy.teleport([0,0,94.5])`, [[0, 6], [90, 0], [-90, 0], [180, 0]]);
  await meas('plaza', `__academy.teleport([0,0,30])`, [[0, 0], [60, 0], [120, 0], [180, 0], [240, 0], [300, 0]]);
  if (!args['no-owners'])
    for (const v of ['spawn', 'bridgehead', 'plaza']) {
      const st = await gotoView(s.page, v, 1500);
      if (st.pending) continue;
      const r = await s.page.evaluate(DRAWS_BY_OWNER);
      owners[v] = { r, rows: checkLedger(v, VIEWS[v].ledger, r, GDD_GATE, VIEWS[v].tris ?? null) };
      console.log(formatLedger(v, r, owners[v].rows));
    }
  await meas('ausguck', `__academy.teleport([0,44.05,-11.5])`, [[0, -10], [60, -10], [120, -10], [180, -10], [240, -10], [300, -10], [0, -40]]);
  for (const [z, [x, zz]] of Object.entries(A)) {
    await s.ev(`__academy.teleport('${z}')`);
    await s.wait(1500);
    const yaw = await s.val(`__academy.state().player.yawDeg`);
    await meas(`${z}-gate`, `void 0`, [[yaw, 0]]);
    await meas(z, `__academy.teleport([${x * 0.85},0.1,${zz * 0.85}])`, [[yaw, 0], [yaw + 90, 0], [yaw + 180, 0], [yaw + 270, 0]]);
  }
  // the four Aussichtskanzeln look across the whole island (QA-18: the worst view in phase 4)
  for (const kb of [60, 120, 240, 300]) {
    const x = Math.sin((kb * Math.PI) / 180) * 86, z = -Math.cos((kb * Math.PI) / 180) * 86;
    const yaw = (Math.atan2(x, z) * 180) / Math.PI;
    await meas(`kanzel-${kb}`, `__academy.teleport([${x.toFixed(2)},0,${z.toFixed(2)}])`, [[yaw, 0], [yaw, -20], [yaw - 35, 0], [yaw + 35, 0]]);
  }
  // juice: three particle bursts + a popup + the result banner in front of the camera at the plaza
  await meas('juice-plaza', `__academy.teleport([0,0,30]); __academy.look(0,0)`, []);
  for (const [yaw, pitch] of [[0, 0], [180, 0]]) {
    await s.ev(`__academy.look(${yaw},${pitch}); __academy.juiceDemo()`);
    await s.wait(250);
    const r = await s.val(`({ fps: __academy.fps(), ...__academy.renderInfo() })`);
    rows.push({ name: 'juice-plaza', yaw, pitch, ...r });
    console.log(`${'juice-plaza'.padEnd(20)} yaw ${String(yaw).padStart(4)} pitch ${String(pitch).padStart(3)}  fps ${String(r.fps).padEnd(6)} cpu ${String(r.cpuMs).padEnd(5)} ms  calls ${String(r.calls).padStart(4)}  tris ${(r.triangles / 1000).toFixed(0).padStart(5)}k`);
    await s.shot(`juice-plaza-${yaw}`);
    await s.wait(1200);
  }
  await meas('keel', `__academy.solve('world','finale-goto')`, [[0, -10], [90, -10], [180, -20], [270, -10]]);
  // Phase 7 named views (tools/lib/views.mjs): the ones that exist on this build
  let allLoaded = false;
  for (const name of PHASE7_VIEWS) {
    if (['spawn', 'plaza'].includes(name)) continue;
    let st = await gotoView(s.page, name, 1800);
    // a content view of an area that loads only on demand (a ground site before the Revier opens): load
    // every area once and try again (Request(WP7) from WP9: sonnenacker-c, as in perf-cpu)
    if (st.pending && VIEWS[name].requires && !allLoaded) {
      allLoaded = true;
      await loadAllAreas(s.page);
      st = await gotoView(s.page, name, 1800);
    }
    if (st.pending) {
      console.log(`${name.padEnd(20)} pending (${st.pending})`);
      continue;
    }
    const r = await s.val(`({ fps: __academy.fps(), ...__academy.renderInfo() })`);
    rows.push({ name: `view:${name}`, yaw: null, pitch: null, ...r, trisCap: VIEWS[name].tris ?? null });
    console.log(`${('view:' + name).padEnd(20)}                 fps ${String(r.fps).padEnd(6)} cpu ${String(r.cpuMs).padEnd(5)} ms  calls ${String(r.calls).padStart(4)}  tris ${(r.triangles / 1000).toFixed(0).padStart(5)}k${VIEWS[name].tris ? ` (≤ ${(VIEWS[name].tris / 1000).toFixed(0)}k)` : ''}`);
    await s.shot(`view-${name}`);
  }
  fs.writeFileSync(s.outDir + '/perf.json', JSON.stringify(rows, null, 2));
});

const worst = (k) => rows.reduce((a, b) => (b[k] > a[k] ? b : a));
const minFps = rows.reduce((a, b) => (b.fps < a.fps ? b : a));
console.log(`worst draw calls ${worst('calls').calls} (${worst('calls').name}) · worst triangles ${(worst('triangles').triangles / 1e6).toFixed(2)} M (${worst('triangles').name}) · worst CPU ${worst('cpuMs').cpuMs} ms (${worst('cpuMs').name}) · min fps ${minFps.fps} (${minFps.name})`);
const over = rows.filter((r) => r.calls > 500 || r.triangles > 1.5e6 || r.fps < 55 || (r.trisCap && r.triangles > r.trisCap));
for (const r of over) console.log('OVER BUDGET', JSON.stringify(r));
const ownerMiss = Object.values(owners).flatMap((o) => o.rows.filter((x) => x.status === 'fail').map((x) => `${x.name}: ${x.value} (target <= ${x.cap})`));
for (const m of ownerMiss) console.log('OVER DRAW TARGET', m);
for (const o of Object.values(owners)) for (const x of o.rows.filter((y) => y.status === 'known')) console.log(`note  known miss ${x.name} ${x.value} > ${x.cap} (owner ${x.owner})`);
process.exit(errors.length || over.length || ownerMiss.length ? 1 : 0);
