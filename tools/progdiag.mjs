#!/usr/bin/env node
// Which materials make three.js re-validate their shader program every frame? (promoted from the
// phase 6 perf-runtime audit's progdiag.mjs). Plan item C11a.
//
//   node tools/progdiag.mjs [--views plaza,dunkelfabrik] [--runs 3] [--top 15] [--dist <dir> | --dev]
//
// Counts material.customProgramCacheKey() calls (three calls it once per getParameters(), i.e.
// once per program re-validation) per material over 60 frames, three times per view; prints the
// median calls per frame and the worst offenders (material, users, mesh kinds). Target: ≤ 2 per
// frame at the plaza and in the Dunkelfabrik (C11a). Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, openGame, gotoView, median, parseArgs, saveJson, list } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const views = list(args.views, ['plaza', 'dunkelfabrik']);
const runs = Number(args.runs ?? 3);
const top = Number(args.top ?? 15);
const TARGET = { plaza: 2, dunkelfabrik: 2 };

const COUNT = async () => {
  const G = window.__academy.game;
  const counts = new Map();
  const users = new Map();
  const mats = new Set();
  G.rs.scene.traverse((o) => {
    const m = o.material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      mats.add(x);
      if (!users.has(x)) users.set(x, []);
      users.get(x).push(o);
    }
  });
  const orig = new Map();
  for (const m of mats) {
    orig.set(m, Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : undefined);
    const base = m.customProgramCacheKey;
    m.customProgramCacheKey = function () {
      counts.set(m, (counts.get(m) || 0) + 1);
      return base.call(this);
    };
  }
  const N = 60;
  await new Promise((res) => {
    let n = 0;
    const f = () => (++n >= N ? res() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  });
  for (const m of mats) {
    const o = orig.get(m);
    if (o === undefined) delete m.customProgramCacheKey;
    else m.customProgramCacheKey = o;
  }
  let total = 0;
  const rows = [];
  for (const [m, c] of counts) {
    total += c;
    const us = users.get(m) || [];
    const kinds = {};
    for (const o of us) {
      const k = `${o.type}${o.isSkinnedMesh ? '/skinned' : ''}${o.geometry?.attributes?.color ? '/color' : ''}${o.isInstancedMesh && o.instanceColor ? '/icolor' : ''}`;
      kinds[k] = (kinds[k] || 0) + 1;
    }
    const path = (o) => {
      let s = o.name || o.type;
      for (let q = o.parent, d = 0; q && d < 3; q = q.parent, d++) s = (q.name || q.type) + '/' + s;
      return s;
    };
    rows.push({ name: m.name || m.type, type: m.type, perFrame: Math.round((c / N) * 100) / 100, users: us.length, kinds, firstUsers: us.slice(0, 2).map(path) });
  }
  rows.sort((a, b) => b.perFrame - a.perFrame);
  return { materials: mats.size, perFrame: Math.round((total / N) * 10) / 10, rows };
};

const v = new Verdict('progdiag');
const out = {};
const srv = await gameServer(args);
const browser = await launchChromium({ full: true });
try {
  const { page, ctx } = await openGame(browser, `${srv.url}/?skipIntro=1&quality=high`, { instrument: false });
  for (const view of views) {
    const st = await gotoView(page, view, 2000);
    if (st.pending) {
      v.note(`pending view ${view}: ${st.pending}`);
      continue;
    }
    const reps = [];
    for (let i = 0; i < runs; i++) reps.push(await page.evaluate(COUNT));
    const m = median(reps.map((r) => r.perFrame));
    out[view] = { perFrame: m, reps: reps.map((r) => r.perFrame), materials: reps[0].materials, top: reps[0].rows.slice(0, 40) };
    console.log(`\n== ${view}: ${reps[0].materials} materials; getParameters calls per frame ${m} (runs ${reps.map((r) => r.perFrame).join(', ')})`);
    for (const t of reps[0].rows.slice(0, top)) console.log(`  ${String(t.perFrame).padStart(5)}/frame  ${t.type} "${t.name}" users ${t.users} ${JSON.stringify(t.kinds)} :: ${t.firstUsers.join(' | ')}`);
    if (TARGET[view] != null) v.check(`${view}: getParameters calls per frame`, m, '<=', TARGET[view]);
  }
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('progdiag.json', out);
v.exit(args);
