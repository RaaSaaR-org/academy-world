#!/usr/bin/env node
// How quality "auto" behaves and what a manual switch costs (promoted from the phase 6 perf-runtime
// audit's auto.mjs). Plan item C10.
//
//   node tools/auto-quality.mjs [--runs 3] [--watch 20] [--cpu 10] [--no-gpu] [--dist <dir> | --dev]
//
// 1. CPU-bound weak laptop: quality auto at the plaza with the CPU throttled 10×, watched for
//    --watch seconds: the preset must not change (lowering the resolution cannot help a CPU-bound
//    frame) and no frame may take over 100 ms.
// 2. GPU-bound (3840×2160 at DPR 2): what auto does to the level and the canvas size (reported only).
// 3. Manual switches high → medium → low → high at 1920×1080: the longest frame around each switch
//    must stay ≤ 50 ms; programs linked per switch are reported.
// Medians over --runs. Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, openGame, median, parseArgs, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 3);
const watchS = Number(args.watch ?? 20);
const cpu = Number(args.cpu ?? 10);
const v = new Verdict('auto-quality');
const res = { cpuBound: [], gpuBound: null, switches: [] };

async function watch(page, seconds) {
  const samples = [];
  await page.evaluate(() => window.__perf.start());
  for (let t = 0; t < seconds; t++) {
    await page.waitForTimeout(1000);
    samples.push(await page.evaluate(() => {
      const s = window.__academy.state();
      const c = window.__academy.game.rs.renderer.domElement;
      return { level: s.quality.level, setting: s.quality.setting, fps: s.fps, canvas: `${c.width}x${c.height}` };
    }));
  }
  const frames = await page.evaluate(() => {
    window.__perf.stop();
    return window.__perf.frames.map((f) => [f.t, f.ms, f.d.link || 0]);
  });
  let worst = { iv: 0, js: 0, links: 0 };
  for (let i = 1; i < frames.length; i++) {
    const iv = frames[i][0] - frames[i - 1][0];
    if (iv > worst.iv) worst = { iv: Math.round(iv), js: Math.round(frames[i - 1][1]), links: frames[i - 1][2] };
  }
  return { samples, worst, frames: frames.length };
}

const srv = await gameServer(args);
const browser = await launchChromium({ full: true });
try {
  // (1) CPU-bound
  for (let i = 0; i < runs; i++) {
    const { page, ctx, infos } = await openGame(browser, `${srv.url}/?skipIntro=1`);
    const cdp = await ctx.newCDPSession(page);
    await page.evaluate(() => {
      window.__academy.teleport([0, 0, 30]);
      window.__academy.look(0, 0);
    });
    await page.waitForTimeout(1000);
    const level0 = await page.evaluate(() => window.__academy.state().quality.level);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.waitForTimeout(500);
    const w = await watch(page, watchS);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const levels = [level0, ...w.samples.map((s) => s.level)];
    const changes = levels.filter((l, k) => k > 0 && l !== levels[k - 1]).length;
    const r = { setting: w.samples[0]?.setting, level0, levels: w.samples.map((s) => `${s.level}@${s.fps}`), changes, worstFrameMs: w.worst.iv, worst: w.worst, infos };
    res.cpuBound.push(r);
    console.log(`cpu-bound ×${cpu} run${i + 1}: ${r.setting} start ${level0}, changes ${changes}, worst frame ${w.worst.iv} ms (js ${w.worst.js} ms, ${w.worst.links} links) · ${r.levels.join(' ')}`);
    await ctx.close();
  }
  v.check(`CPU ×${cpu}: preset changes in ${watchS} s (median)`, median(res.cpuBound.map((r) => r.changes)), '<=', 0);
  v.check(`CPU ×${cpu}: longest frame (median)`, median(res.cpuBound.map((r) => r.worstFrameMs)), '<=', 100, ' ms');

  // (2) GPU-bound, reported
  if (!args['no-gpu']) {
    const { page, ctx } = await openGame(browser, `${srv.url}/?skipIntro=1`, { width: 3840, height: 2160, dpr: 2 });
    await page.evaluate(() => {
      window.__academy.teleport([0, 0, 30]);
      window.__academy.look(0, 0);
    });
    await page.waitForTimeout(1000);
    const w = await watch(page, watchS);
    res.gpuBound = { levels: w.samples.map((s) => `${s.level}@${s.fps}`), canvas: [w.samples[0]?.canvas, w.samples.at(-1)?.canvas], worst: w.worst };
    console.log(`gpu-bound 3840×2160@2: canvas ${res.gpuBound.canvas.join(' → ')} · worst frame ${w.worst.iv} ms · ${res.gpuBound.levels.join(' ')}`);
    await ctx.close();
  }

  // (3) manual switches
  const { page, ctx } = await openGame(browser, `${srv.url}/?skipIntro=1&quality=high`, { width: 1920, height: 1080 });
  await page.evaluate(() => {
    window.__academy.teleport([0, 0, 30]);
    window.__academy.look(0, 0);
  });
  await page.waitForTimeout(1500);
  for (let rep = 0; rep < runs; rep++)
    for (const q of ['medium', 'low', 'high']) {
      await page.evaluate(() => window.__perf.start());
      await page.waitForTimeout(300);
      await page.evaluate((q) => window.__academy.setQuality(q), q);
      await page.waitForTimeout(1500);
      const fr = await page.evaluate(() => {
        window.__perf.stop();
        return window.__perf.frames.map((f) => ({ t: f.t, ms: f.ms, d: f.d }));
      });
      let worst = { iv: 0, links: 0 };
      for (let i = 1; i < fr.length; i++) {
        const iv = fr[i].t - fr[i - 1].t;
        if (iv > worst.iv) worst = { iv: Math.round(iv), links: fr[i - 1].d.link || 0, js: Math.round(fr[i - 1].ms) };
      }
      const programs = await page.evaluate(() => window.__academy.renderInfo().programs);
      const links = fr.reduce((a, f) => a + (f.d.link || 0), 0);
      res.switches.push({ to: q, rep, worstFrameMs: worst.iv, links, programs });
      console.log(`switch → ${q.padEnd(6)} run${rep + 1}: longest frame ${worst.iv} ms, ${links} programs linked, ${programs} programs`);
    }
  await ctx.close();
  for (const q of ['medium', 'low', 'high']) v.check(`manual switch → ${q}: longest frame (median)`, median(res.switches.filter((s) => s.to === q).map((s) => s.worstFrameMs)), '<=', 50, ' ms');
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('auto-quality.json', res);
v.exit(args);
