#!/usr/bin/env node
// Main-thread cost per frame at a throttled CPU (promoted from the phase 6 perf-runtime audit's
// throttle.mjs + cpu-ab.mjs). Plan items W1, C11, Z1.
//
//   node tools/perf-cpu.mjs [--rates 4,6] [--views spawn,plaza,dunkelfabrik,sensordom] [--quality high] [--runs 3]
//   node tools/perf-cpu.mjs --dist rc3=<dir> --dist head=<dir>      # A/B, the builds alternate per run
//   node tools/perf-cpu.mjs --browser firefox --rates 1 --views plaza   # the game's own cpuMs in Firefox
//   node tools/perf-cpu.mjs --dev --rates 4 --views plaza                  # on a private Vite dev server
//
// --dev measures on a private Vite dev server instead of a production build, for views that exist only
// there (wave 1's `traum-spike`; WP10 moved the spike into the Traumhangar). Unminified code with the dev checks: the
// numbers are indicative, the targets are printed but not judged (exit 0 unless the run itself fails).
// Per run: a fresh page of the production build (vite preview), Chrome for Testing headless; per
// view the CPU is throttled (CDP) after the camera is placed, then 4 s of frames are recorded: JS ms
// per rAF frame (p50 / p95), fps, frames over 33 / 50 ms, and the game's own cpuMs. Prints medians.
// Targets (phase 6 plan): 4× spawn and plaza js50 ≤ 11 ms (W1) and ≤ 8.4 / 7.8 ms (C11);
// 6× spawn and plaza ≥ 45 fps (W1); Firefox plaza cpuMs ≤ 4.5 ms (W1). Phase 7 (§5.5): at 4× every
// view's js4x of tools/lib/views.mjs (bridge head 8.4, plaza 7.8, duck field 8.4, Sonnenacker C 9.5,
// Traumhangar 9.0, climb 8.4 ms). Views whose content does not exist yet are skipped with a warning.
// The climb view also reads WP13's lift-off director (__academy.ext('liftoff')().ms, its own time per
// frame): ≤ 0.3 ms at 1× (§5.5), judged as ms / CPU rate. Exit 1 on a miss.
import { Verdict, distsFromArgs, gameServer, servePreview, launchChromium, launchEngine, openGame, record, gotoView, loadAllAreas, median, range, parseArgs, saveJson, list, round } from './lib/measure.mjs';
import { VIEWS, knownView } from './lib/views.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 3);
const quality = String(args.quality ?? 'high');
const engine = String(args.browser ?? 'chromium');
const rates = list(args.rates, engine === 'chromium' ? ['4', '6'] : ['1']).map(Number);
const views = list(args.views, ['spawn', 'plaza', 'dunkelfabrik', 'sensordom']);
const ms = Number(args.ms ?? 4000);
if (engine !== 'chromium' && rates.some((r) => r !== 1)) throw new Error('CPU throttling needs Chromium (CDP); use --rates 1 with --browser firefox|webkit');
for (const view of views) if (!knownView(view)) throw new Error(`unknown view ${view} (${Object.keys(VIEWS).join(', ')})`);
const pending = new Map();

const dev = !!args.dev;
if (dev && args.dist !== undefined) throw new Error('--dev and --dist exclude each other');
const dists = dev ? [{ label: 'dev', dir: null }] : await distsFromArgs(args);
const servers = new Map();
// --dev: a private Vite dev server (dev-only views); else vite preview of each build
if (dev) servers.set('dev', await gameServer(args));
else for (const d of dists) servers.set(d.label, await servePreview(d.dir));
const browser = engine === 'chromium' ? await launchChromium({ full: true }) : await launchEngine(engine);
const rows = [];
try {
  for (let rep = 1; rep <= runs; rep++) {
    for (const d of dists) {
      const { page, ctx, errors } = await openGame(browser, `${servers.get(d.label).url}/?skipIntro=1&quality=${quality}`, { instrument: true });
      const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
      await page.waitForTimeout(1500);
      for (const rate of rates)
        for (const view of views) {
          if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          let st = await gotoView(page, view, 300);
          // a content view of an area that loads only on demand (a ground site before the Revier opens):
          // load every area once and try again (Request(WP7) from WP9: sonnenacker-c)
          if (st.pending && VIEWS[view].requires) {
            await loadAllAreas(page);
            st = await gotoView(page, view, 300);
          }
          if (st.pending) {
            pending.set(view, st.pending);
            continue;
          }
          if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          await page.waitForTimeout(1500);
          const r = await record(page, ms);
          const cpuMs = await page.evaluate(() => window.__academy.renderInfo().cpuMs);
          // the lift-off director's own time per frame (the climb view; null elsewhere)
          const directorMs = view === 'climb' ? await page.evaluate(async () => (typeof window.__academy.ext('liftoff') === 'function' ? ((await window.__academy.ext('liftoff')())?.ms ?? null) : null)) : null;
          const row = { dist: d.label, rep, rate, view, js50: r.js.p50, js95: r.js.p95, fps: r.fps, over33: r.over33, over50: r.over50, cpuMs, directorMs, frames: r.raw.frames.length };
          rows.push(row);
          console.log(`${d.label} run${rep} ×${rate} ${view.padEnd(13)} js50 ${String(row.js50).padStart(6)} js95 ${String(row.js95).padStart(6)} fps ${String(row.fps).padStart(5)} >33ms ${row.over33} >50ms ${row.over50} cpuMs ${cpuMs}`);
        }
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      if (errors.length) console.log('page errors:', errors.slice(0, 3));
      await ctx.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
  for (const s of servers.values()) await s.close();
}

const v = new Verdict('perf-cpu');
console.log(`\nMEDIANS (${runs} runs, ${engine}, quality ${quality}${dev ? ', DEV SERVER: indicative, targets not judged' : ''})`);
// on the dev server the checks are printed as notes only (unminified code, dev checks)
const judge = dev
  ? { check: (tag, val, op, target, unit = '') => v.note(`${tag}: ${val}${unit} (target ${op} ${target}${unit}; dev server, not judged)`) }
  : v;
for (const d of dists)
  for (const rate of rates)
    for (const view of views) {
      const s = rows.filter((r) => r.dist === d.label && r.rate === rate && r.view === view);
      if (!s.length) continue;
      const m = (k) => round(median(s.map((x) => x[k])));
      console.log(`${dists.length > 1 ? d.label.padEnd(6) + ' ' : ''}×${rate} ${view.padEnd(13)} js50 ${String(m('js50')).padStart(6)} (${range(s.map((x) => x.js50))})  js95 ${String(m('js95')).padStart(6)}  fps ${String(m('fps')).padStart(5)} (${range(s.map((x) => x.fps))})  >33ms ${m('over33')}  >50ms ${m('over50')}  cpuMs ${m('cpuMs')}`);
      const tag = `${dists.length > 1 ? d.label + ' ' : ''}×${rate} ${view}`;
      if (engine === 'chromium' && rate === 4 && (view === 'plaza' || view === 'spawn')) {
        judge.check(`${tag}: js50 (W1)`, m('js50'), '<=', 11, ' ms');
        judge.check(`${tag}: js50 (C11)`, m('js50'), '<=', view === 'plaza' ? 7.8 : 8.4, ' ms');
      } else if (engine === 'chromium' && rate === 4 && VIEWS[view].js4x != null) judge.check(`${tag}: js50 (§5.5)`, m('js50'), '<=', VIEWS[view].js4x, ' ms');
      if (engine === 'chromium' && rate === 6 && (view === 'plaza' || view === 'spawn')) judge.check(`${tag}: fps (W1)`, m('fps'), '>=', 45);
      if (view === 'climb') {
        const dm = s.map((x) => x.directorMs).filter((x) => Number.isFinite(x));
        if (dm.length) judge.check(`${tag}: lift-off director at 1× (ms / rate)`, round(median(dm) / rate, 3), '<=', 0.3, ' ms');
        else v.note(`${tag}: no lift-off director time (WP13's __academy.ext('liftoff'))`);
      }
      if (engine === 'firefox' && rate === 1 && view === 'plaza') judge.check(`${tag}: game cpuMs in Firefox (W1)`, m('cpuMs'), '<=', 4.5, ' ms');
    }
for (const [view, why] of pending) v.note(`pending view ${view}: ${why}`);
if (dev && !rows.length) v.require('dev server: at least one view measured', false, [...pending.keys()].join(', ') || 'no view');
saveJson(`perf-cpu-${engine}-${quality}${dev ? '-dev' : ''}.json`, rows);
v.exit(args);
