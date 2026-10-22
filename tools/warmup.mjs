#!/usr/bin/env node
// Shader programs at the title and the cost of the first frames (promoted from the phase 6
// perf-load audit's warm-breakdown.mjs). Plan item C2.
//
//   node tools/warmup.mjs [--cpu 1,4] [--runs 3] [--quality high] [--dist <dir>] [--table]
//
// The production build on the CDN-like server, a fresh context per run. RenderSystem.render() is
// wrapped from the first moment the game exists, so every scene frame is timed (JS time: shader
// compiles, program links and texture uploads happen synchronously in it):
//   programs        renderer.info.programs at the title (+1 s)
//   hiddenFrames    scene frames rendered while the loading screen is still opaque (C2: only the
//                   one deliberate warm-up frame), and their total ms
//   warmFrameMs     the longest scene frame up to the title (where the uploads happen)
//   firstVisibleMs  the first scene frame after the loading screen starts to fade
//   title           Start visible, s
// Targets: programs ≤ 150 at high (Phase 7 §5.5, re-based on the itemised table; rc4 ≈ 123); hidden
// frames ≤ 1; first visible frame ≤ 150 ms at 1× and ≤ 400 ms at 4× CPU. Medians of --runs. Exit 1 on
// a miss.
// --table: the itemised program table at the title (+1 s), from __academy.programs() (each program with
// the materials that use it and their owners; an in-page fallback for builds without the hook) →
// artifacts/phase7/programs.json, kept by the integrator; printed grouped by owner and material type.
import { Verdict, distsFromArgs, serveCdn, launchChromium, median, range, parseArgs, saveJson, list, round } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 3);
const cpus = list(args.cpu, ['1', '4']).map(Number);
const quality = String(args.quality ?? 'high');
const TARGET_VISIBLE = { 1: 150, 4: 400 };
const TARGET_PROGRAMS = 150;

/** In-page: the itemised program table (__academy.programs(), or the same walk for an older build). */
const PROGRAM_TABLE = () => {
  const A = window.__academy;
  if (typeof A.programs === 'function') return A.programs();
  const R = A.game.rs.renderer;
  const by = new Map();
  A.game.rs.scene.traverse((o) => {
    const ms = o.material;
    if (!ms) return;
    for (const m of Array.isArray(ms) ? ms : [ms]) {
      const p = R.properties.get(m).currentProgram;
      if (!p) continue;
      if (!by.has(p)) by.set(p, new Map());
      let top = o;
      let zone = null;
      for (let q = o; q; q = q.parent) {
        if (!zone && q.name && q.name.startsWith('zone:')) zone = q.name.slice(5);
        if (q.parent) top = q;
      }
      const u = by.get(p);
      if (!u.has(m)) u.set(m, new Set());
      u.get(m).add(zone ?? (top.name || top.type));
    }
  });
  return (R.info.programs ?? []).map((p) => ({ id: p.id, name: p.name, usedTimes: p.usedTimes, key: String(p.cacheKey.length), materials: [...(by.get(p) ?? new Map()).entries()].map(([m, o]) => ({ name: m.name, type: m.type, owners: [...o].sort() })) }));
};

const INIT = () => {
  const W = (window.__warm = { frames: [], done: null, title: null });
  const iv = setInterval(() => {
    const g = window.__academy && window.__academy.game;
    if (!g || !g.rs || typeof g.rs.render !== 'function') return;
    clearInterval(iv);
    const orig = g.rs.render.bind(g.rs);
    g.rs.render = (...a) => {
      const ld = document.getElementById('loading');
      const t = performance.now();
      try {
        return orig(...a);
      } finally {
        W.frames.push({ t: Math.round(t), ms: performance.now() - t, phase: g.phase, loading: !!ld && !ld.classList.contains('done') && !ld.classList.contains('hidden') });
      }
    };
  }, 1);
  const mo = new MutationObserver(() => {
    const ld = document.getElementById('loading');
    if (ld && ld.classList.contains('done') && W.done == null) W.done = Math.round(performance.now());
    const sb = document.getElementById('start-btn');
    if (sb && W.title == null && !sb.closest('.hidden') && sb.getBoundingClientRect().width > 0) W.title = Math.round(performance.now());
  });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true }));
};

const [dist] = await distsFromArgs(args);
const srv = await serveCdn(dist.dir);
const browser = await launchChromium({ spki: srv.spki });
const rows = [];
try {
  for (const cpu of cpus)
    for (let i = 1; i <= runs; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await page.addInitScript(INIT);
      await page.goto(`${srv.url}/?reset=1&quality=${quality}`, { waitUntil: 'commit' });
      await page.waitForSelector('#start-btn', { state: 'visible', timeout: 180000 });
      await page.waitForTimeout(1000);
      const r = await page.evaluate(() => {
        const W = window.__warm;
        const g = window.__academy.game;
        const hidden = W.frames.filter((f) => f.loading);
        const visible = W.frames.filter((f) => !f.loading);
        return { programs: g.rs.renderer.info.programs.length, level: g.rs.level, hiddenFrames: hidden.length, hiddenMs: hidden.reduce((a, f) => a + f.ms, 0), warmFrameMs: Math.max(0, ...W.frames.filter((f) => W.title == null || f.t <= W.title).map((f) => f.ms)), firstVisibleMs: visible[0]?.ms ?? null, title: W.title };
      });
      const row = { cpu, run: i, ...r, hiddenMs: round(r.hiddenMs, 1), warmFrameMs: round(r.warmFrameMs, 1), firstVisibleMs: round(r.firstVisibleMs, 1) };
      rows.push(row);
      console.log(`cpu×${cpu} run${i}: programs ${row.programs} (${row.level}) · hidden frames ${row.hiddenFrames} (${row.hiddenMs} ms) · warm frame ${row.warmFrameMs} ms · first visible ${row.firstVisibleMs} ms · title ${(row.title / 1000).toFixed(2)} s`);
      await ctx.close();
    }
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
let table = null;
if (args.table) {
  // the itemised table at the title, one more fresh run at 1× CPU
  const srv2 = await serveCdn(dist.dir);
  const b2 = await launchChromium({ spki: srv2.spki });
  try {
    const ctx = await b2.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(`${srv2.url}/?reset=1&quality=${quality}`, { waitUntil: 'commit' });
    await page.waitForSelector('#start-btn', { state: 'visible', timeout: 180000 });
    await page.waitForTimeout(1000);
    table = await page.evaluate(PROGRAM_TABLE);
    await ctx.close();
  } finally {
    await b2.close().catch(() => {});
    await srv2.close();
  }
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ROOT } = await import('./lib/measure.mjs');
  const file = path.join(ROOT, 'artifacts', 'phase7', 'programs.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ at: 'title + 1 s', quality, count: table.length, programs: table }, null, 1));
  const byOwner = new Map();
  const byType = new Map();
  for (const p of table) {
    const owners = new Set(p.materials.flatMap((m) => m.owners));
    const key = owners.size ? [...owners].sort().join('+') : '(no material on the scene now: warm-up or post)';
    byOwner.set(key, (byOwner.get(key) ?? 0) + 1);
    for (const t of new Set(p.materials.map((m) => m.type))) byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  console.log(`\nPROGRAM TABLE at the title: ${table.length} programs → ${path.relative(ROOT, file)}`);
  console.log(`  by owner: ${[...byOwner.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  console.log(`  by material type: ${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
}
const v = new Verdict('warmup');
if (table) v.check('programs at the title (itemised table)', table.length, '<=', TARGET_PROGRAMS);
for (const cpu of cpus) {
  const s = rows.filter((r) => r.cpu === cpu);
  const m = (k) => median(s.map((r) => r[k]));
  console.log(`MEDIAN cpu×${cpu}: programs ${m('programs')} · hidden frames ${m('hiddenFrames')} (${m('hiddenMs')} ms) · warm frame ${m('warmFrameMs')} ms · first visible ${m('firstVisibleMs')} ms (${range(s.map((r) => r.firstVisibleMs))}) · title ${round(m('title') / 1000)} s`);
  if (cpu === cpus[0] && quality === 'high') v.check('programs at the title (high)', m('programs'), '<=', TARGET_PROGRAMS);
  v.check(`cpu×${cpu}: frames rendered behind the loading screen`, m('hiddenFrames'), '<=', 1);
  if (TARGET_VISIBLE[cpu] != null) v.check(`cpu×${cpu}: first visible frame`, m('firstVisibleMs'), '<=', TARGET_VISIBLE[cpu], ' ms');
}
saveJson('warmup.json', rows);
v.exit(args);
