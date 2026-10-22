#!/usr/bin/env node
// GPU-bound frame time with vsync off (promoted from the phase 6 perf-runtime audit's
// uncapped-ab3.mjs). Plan item C10.
//
//   node tools/gpu-ab.mjs [--views plaza,clouddown] [--runs 3] [--dist rc3=<dir> --dist head=<dir>]
//   node tools/gpu-ab.mjs --views plaza,clouddown,bridgehead,ausguck --runs 5 --dist rc4=artifacts/dist/rc4 --dist head=artifacts/dist/head
//
// Chrome for Testing with the frame-rate limit and vsync off, a 2560×1440 viewport at DPR 2 (the
// high preset caps the canvas at 3840×2160), quality high (fixed, so an adaptive controller stays
// out of the A/B). Per view, four 1.5 s windows per run; frame ms = 1000 / median fps. With several
// --dist builds the runs alternate. Targets: the view's gpuMs of tools/lib/views.mjs (§5.5: plaza and
// bridge head ≤ 4.5, Ausguck ≤ 6.0, the cloud view ≤ 7.0 ms). The A/B rule of §5.5: with an rc4 build in
// the run (label rc4…, measured but not judged), a build that misses its budget still passes at
// ≤ rc4 + 0.15 ms, printed as WARN „founder told“. Views whose content does not exist yet are skipped.
// Exit 1 on a miss. A shared machine adds noise: compare A/B in one run (median of 5), on a quiet machine.
import { Verdict, distsFromArgs, servePreview, launchChromium, openGame, record, gotoView, median, range, parseArgs, saveJson, list, round } from './lib/measure.mjs';
import { VIEWS, knownView } from './lib/views.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 3);
const views = list(args.views, ['plaza', 'clouddown']);
const AB_MARGIN = 0.15;
for (const view of views) if (!knownView(view)) throw new Error(`unknown view ${view} (${Object.keys(VIEWS).join(', ')})`);
const pending = new Map();

const dists = await distsFromArgs(args);
const servers = new Map();
for (const d of dists) servers.set(d.label, await servePreview(d.dir));
const browser = await launchChromium({ full: true, uncapped: true });
const rows = [];
try {
  for (let rep = 1; rep <= runs; rep++)
    for (const d of dists) {
      const { page, ctx } = await openGame(browser, `${servers.get(d.label).url}/?skipIntro=1&quality=high`, { width: 2560, height: 1440, dpr: 2 });
      const canvas = await page.evaluate(() => {
        const c = window.__academy.game.rs.renderer.domElement;
        return `${c.width}x${c.height}`;
      });
      await page.waitForTimeout(1500);
      for (const view of views) {
        const st = await gotoView(page, view, 1500);
        if (st.pending) {
          pending.set(view, st.pending);
          console.log(`${d.label} run${rep} ${view.padEnd(10)} pending, skipped (${st.pending})`);
          continue;
        }
        const fps = [];
        for (let k = 0; k < 4; k++) fps.push((await record(page, 1500)).fps);
        const f = median(fps);
        rows.push({ dist: d.label, rep, view, fps: f, frameMs: round(1000 / f), canvas });
        console.log(`${d.label} run${rep} ${view.padEnd(10)} ${round(1000 / f)} ms/frame (${f} fps, canvas ${canvas})`);
      }
      await ctx.close();
    }
} finally {
  await browser.close().catch(() => {});
  for (const s of servers.values()) await s.close();
}
const v = new Verdict('gpu-ab');
console.log(`\nMEDIANS (${runs} runs)`);
const ref = dists.find((d) => /^rc4/.test(d.label));
const med = (label, view) => round(median(rows.filter((r) => r.dist === label && r.view === view).map((r) => r.frameMs)));
for (const view of views)
  for (const d of dists) {
    const s = rows.filter((r) => r.dist === d.label && r.view === view);
    if (!s.length) continue;
    const m = med(d.label, view);
    const target = VIEWS[view].gpuMs;
    const refMs = ref && ref !== d ? med(ref.label, view) : null;
    console.log(`${d.label.padEnd(6)} ${view.padEnd(10)} ${m} ms/frame (${range(s.map((r) => r.frameMs))})${refMs != null ? `  Δ vs ${ref.label} ${round(m - refMs)} ms` : ''}`);
    // the reference is measured, not judged
    if (target == null || d === ref) continue;
    const tag = `${dists.length > 1 ? d.label + ' ' : ''}${view}: GPU frame`;
    // the A/B rule (§5.5 „The GPU gate as an A/B“): over the fixed budget but within rc4 + 0.15 ms passes,
    // with the founder told
    if (refMs != null && m > target && m <= refMs + AB_MARGIN) {
      v.require(`${tag} ≤ ${ref.label} + ${AB_MARGIN} ms (A/B rule)`, true, `${m} ms > ${target} ms but ≤ ${round(refMs + AB_MARGIN)} ms`);
      v.note(`WARN ${view}: ${d.label} ${m} ms misses ${target} ms and passes on the A/B rule against ${ref.label} ${refMs} ms: tell the founder`);
    } else v.check(tag, m, '<=', target, ' ms');
  }
for (const [view, why] of pending) v.note(`pending view ${view}: ${why}`);
saveJson('gpu-ab.json', rows);
v.exit(args);
