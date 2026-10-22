#!/usr/bin/env node
// Work done while nothing changes: paused, behind the Pass, on the start screen (promoted from the
// phase 6 plan's verify.mjs and the perf-runtime audit's pause.mjs). Plan item C9.
//
//   node tools/idle-render.mjs [--dist <dir> | --dev | --base <url>] [--runs 3]
//
// Measures renderer.render() calls per second and JS ms per rAF frame (median of --runs samples)
// while playing at the plaza, paused, with the Pass open and on the start screen, plus how far the
// attract camera moves in 1 s with reduced motion. Targets: paused and Pass: 0 render calls/s after
// the first frame and ≤ 0.3 ms JS per frame; start screen ≤ half the render calls of playing;
// reduced motion: < 0.1 m/s. Resuming must render again. Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, loadAllAreas, openGame, record, median, parseArgs, saveJson, round } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 3);
const v = new Verdict('idle-render');
const rows = {};

const renderCalls = (page, ms = 1000) =>
  page.evaluate(async (ms) => {
    const r = window.__academy.game.rs.renderer;
    // three counts renderer.render() calls in info.render.frame (the composer's passes call it too)
    const f0 = r.info.render.frame;
    await new Promise((res) => setTimeout(res, ms));
    return Math.round(((r.info.render.frame - f0) * 1000) / ms);
  }, ms);

async function measure(page, name) {
  const reps = [];
  for (let i = 0; i < runs; i++) {
    const calls = await renderCalls(page, 1000);
    const r = await record(page, 1500);
    reps.push({ renderCallsPerS: calls, jsMsPerFrame: r.js.p50, fps: r.fps });
  }
  rows[name] = { renderCallsPerS: median(reps.map((x) => x.renderCallsPerS)), jsMsPerFrame: median(reps.map((x) => x.jsMsPerFrame)), fps: median(reps.map((x) => x.fps)), reps };
  console.log(`${name.padEnd(18)} render calls/s ${String(rows[name].renderCallsPerS).padStart(5)} · JS ${String(round(rows[name].jsMsPerFrame)).padStart(5)} ms/frame · fps ${rows[name].fps}`);
  return rows[name];
}

const srv = await gameServer(args);
const browser = await launchChromium({ full: true });
try {
  // start screen (attract camera)
  {
    const { page, ctx } = await openGame(browser, `${srv.url}/?reset=1&quality=high`, { width: 1280, height: 720 });
    await page.waitForFunction(() => window.__academy.game.phase === 'start', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await measure(page, 'start-screen');
    await ctx.close();
  }
  // reduced motion on the start screen
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`${srv.url}/?reset=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready && window.__academy.game.phase === 'start', null, { timeout: 180000, polling: 200 });
    // every area (sites too) before measuring: an area finishing later would request renders
    await loadAllAreas(page);
    await page.waitForTimeout(1500);
    const moved = [];
    for (let i = 0; i < runs; i++) {
      moved.push(await page.evaluate(async () => {
        const c = window.__academy.game.camera;
        const p0 = c.position.clone();
        await new Promise((r) => setTimeout(r, 1000));
        return c.position.distanceTo(p0);
      }));
    }
    rows.reducedMotion = { setting: await page.evaluate(() => window.__academy.game.settings.data.reducedMotion), attractMetersPerS: median(moved), reps: moved };
    console.log(`reduced motion     attract camera ${round(median(moved), 3)} m in 1 s (setting ${rows.reducedMotion.setting})`);
    await ctx.close();
  }
  const { page, ctx } = await openGame(browser, `${srv.url}/?skipIntro=1&quality=high`, { width: 1280, height: 720, all: true });
  await page.evaluate(() => {
    window.__academy.teleport([0, 0, 30]);
    window.__academy.look(0, 0);
  });
  await page.waitForTimeout(1500);
  const playing = await measure(page, 'playing-plaza');
  await page.evaluate(() => window.__academy.pause());
  await page.waitForTimeout(800);
  const paused = await measure(page, 'paused');
  await page.evaluate(() => window.__academy.resume());
  await page.waitForTimeout(300);
  const resumed = await renderCalls(page, 1000);
  console.log(`resumed            render calls/s ${resumed}`);
  await page.evaluate(() => window.__academy.openPass());
  await page.waitForTimeout(800);
  const pass = await measure(page, 'pass-open');
  await page.evaluate(() => window.__academy.closeModals());
  await page.waitForTimeout(300);
  const closed = await renderCalls(page, 1000);
  await ctx.close();

  v.check('paused: render calls per second', paused.renderCallsPerS, '<=', 0);
  v.check('paused: JS per frame', paused.jsMsPerFrame, '<=', 0.3, ' ms');
  v.check('Pass open: render calls per second', pass.renderCallsPerS, '<=', 0);
  v.check('Pass open: JS per frame', pass.jsMsPerFrame, '<=', 0.3, ' ms');
  v.check('start screen: render calls vs playing', round(rows['start-screen'].renderCallsPerS / Math.max(1, playing.renderCallsPerS), 2), '<=', 0.5, '×');
  v.check('reduced motion: attract camera per second', round(rows.reducedMotion.attractMetersPerS, 3), '<', 0.1, ' m');
  v.require('resume renders again', resumed > 0, `${resumed} calls/s`);
  v.require('closing the Pass renders again', closed > 0, `${closed} calls/s`);
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('idle-render.json', rows);
v.exit(args);
