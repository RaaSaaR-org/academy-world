#!/usr/bin/env node
// Phase 7 ctx.robots check (plan §5.6, §5.8, §5.5; WP4 acceptance) on the Vite dev server, with the
// dev site src/zones/_site-example (a ground area whose init prefetches and loads an SO-101).
//
//   node tools/robots-adapter-check.mjs [--skip-fail]
//
//   1. reachability: with the Revier closed no site-area robot is fetched, also with the player on
//      the site; with the Revier open (a seeded ◆ stamp) the site's robot still waits while the
//      player is 950 m away, and is fetched once the player stands on the site (≤ 60 m);
//   2. ≤ 2 fetches at once: six robots requested at once by the island module;
//   3. no prewarm during a cinematic camera: a prefetch stays queued under it, runs after it;
//   4. a blocked GLB ends as 'failed' after 3 retries (4 attempts) and emits robots:failed (≈ 13 s;
//      --skip-fail leaves it out); then, unblocked, WP1's „Erneut laden“ ('robots:retry' { id, area }) resets
//      the failed job and fetches it again, and the area's next load() resolves (WPF, plan §5.8);
//   5. animate() allocates nothing per frame: 20,000 clip steps on the SO-101, heap delta (Chromium
//      with --enable-precise-memory-info);
//   6. LOD tracking: the site's SO-101 at LOD0 next to it, coarser from 30 m;
//   7. the first show of a prewarmed robot links 0 programs (the hitches gate of plan §5.5 for
//      WP0's runtime): G1 prefetched, then shown in front of the camera.
// Exit 1 on a miss. Raw results: artifacts/measure/robots-adapter-check.json.
import { startServer, parseArgs } from './lib/shotlib.mjs';
import { Verdict, launchChromium, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const v = new Verdict('robots-adapter-check');
const out = {};
const SITE = '_site-example';
// robots only the Schauhalle shows (not the amber exhibits, which a default build leaves out: src/core/release.ts)
const BLOCKED = 'pal-tiago';

let server = null;
let browser = null;
try {
  server = await startServer();
  // precise heap numbers for the animate() allocation step
  browser = await launchChromium({ extra: ['--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const blocked = new RegExp(`${BLOCKED}[^/?]*\\.glb$`);
  page.on('pageerror', (e) => errors.push(String(e && (e.stack || e.message || e)).slice(0, 400)));
  page.on('console', (m) => {
    const t = m.text();
    // the blocked GLB's own network errors are the point of step 4
    if (m.type() === 'error' && !/GPU stall/.test(t) && !/ERR_FAILED|Failed to load resource/.test(t)) errors.push(t.slice(0, 400));
  });
  await page.route(blocked, (r) => r.abort('failed'));
  await page.goto(`${server.url}/?skipIntro=1&reset=1&dev=1&lang=de&mute=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
  await page.waitForFunction((id) => window.__academy.zones().some((z) => z.id === id && z.status === 'ready'), SITE, { timeout: 120000, polling: 200 });
  const W = (ms) => page.waitForTimeout(ms);
  const R = (cmd, ...a) => page.evaluate(([c, x]) => window.__academy.ext('robots')(c, ...x), [cmd, a]);
  const tele = (target, o = {}) => page.evaluate(([t, oo]) => window.__academy.teleport(t, oo), [target, o]);
  const siteJob = async () => (await R()).jobs.find((j) => j.key === 'glb:so101') ?? null;
  // the site's own fetches: since wave 2 the island loads the SO-101 too (WP15's Winke-Arm and Kapsel arm
  // at boot, area 'world'; the Greifwerkstatt, the Lern-Dojo), so a fetch counts for the site gate only when
  // the site asked for it (integrator, wave 2)
  const siteFetches = async () => (await R()).log.filter((l) => l.key === 'glb:so101' && l.area === SITE);
  const sharedFetch = async () => (await R()).log.some((l) => l.key === 'glb:so101' && l.area !== SITE);

  // ── 1. reachability, then distance ─────────────────────────────────────────
  await W(1500);
  let s = await R();
  out.start = { regionOpen: s.regionOpen, job: await siteJob() };
  v.require('Revier closed at the start (no stamp)', s.regionOpen === false);
  await tele(SITE);
  await W(3000);
  const closedOnSite = await siteFetches();
  out.closedOnSite = { job: await siteJob(), fetches: closedOnSite };
  v.check('Revier closed, player on the site: site robot fetches', closedOnSite.length, '=', 0, '');
  if (await sharedFetch()) v.note(`… its state is ${(await siteJob())?.state ?? 'none'}: the SO-101 file was already fetched for an island area, so the site's queue is not observable`);
  else v.require('… and its state is queued', (await siteJob())?.state === 'queued', (await siteJob())?.state ?? 'none');
  await tele([0, 0, 26], { yaw: 0, pitch: 0 });
  await W(800);
  // the Revier opens with the first rotor: M1 = the Sensordom ◆
  await page.evaluate(() => window.__academy.game.progress.awardStamp('sensordom.messstrecke'));
  await W(2000);
  s = await R();
  const openFar = await siteFetches();
  out.openFar = { regionOpen: s.regionOpen, fetches: openFar };
  v.require('the ◆ stamp opened the Revier (quest regionOpen)', s.regionOpen === true);
  v.check('Revier open, player 950 m away: site robot fetches', openFar.length, '=', 0, '');
  await tele(SITE);
  await page.waitForFunction(() => window.__academy.ext('robots')().jobs.find((j) => j.key === 'glb:so101')?.state === 'ready', null, { timeout: 30000, polling: 100 }).catch(() => {});
  const openNear = await siteFetches();
  out.openNear = { job: await siteJob(), fetches: openNear };
  v.require('Revier open, player on the site: the robot is fetched and ready', (await siteJob())?.state === 'ready', (await siteJob())?.state ?? 'none');
  if (!openNear.length && (await sharedFetch())) v.note('every site fetch started with the Revier open: the site made none (the file came from an island area first)');
  else v.require('every site fetch started with the Revier open', openNear.length > 0 && openNear.every((l) => l.regionOpen), JSON.stringify(openNear.map((l) => l.regionOpen)));

  // ── 6. LOD tracking (the site's SO-101) ─────────────────────────────────────
  await page.waitForFunction((id) => window.__academy.solve(id, 'state').then((x) => !!x?.robot), SITE, { timeout: 20000, polling: 250 }).catch(() => {});
  const lodAt = async (pos) => {
    await tele(pos.map((c, i) => c), { yaw: 0, pitch: 0 });
    await W(900);
    return (await R()).models.find((m) => m.area === SITE)?.lod ?? null;
  };
  const sitePos = await page.evaluate((id) => {
    const rec = window.__academy.game.zones.records.get(id);
    const near = rec.ctx.toWorld([2, 0, 0.6]);
    const far = rec.ctx.toWorld([2, 0, 30]);
    return { near: [near.x, 0, near.z], far: [far.x, 0, far.z] };
  }, SITE);
  const lodNear = await lodAt(sitePos.near);
  const lodFar = await lodAt(sitePos.far);
  out.lod = { near: lodNear, far: lodFar };
  v.require('LOD tracked: LOD0 next to the robot', lodNear === '0', String(lodNear));
  v.require('LOD tracked: coarser 30 m away', lodFar != null && lodFar !== '0', String(lodFar));

  // ── 5. animate() allocates nothing per frame ────────────────────────────────
  const bench = await page.evaluate(async (id) => {
    const model = await window.__academy.solve(id, 'robot');
    const clip = await window.__academy.solve(id, 'wave-clip');
    if (!model || !clip) return null;
    const R = window.__academy.ext('robots');
    return { own: R('bench', model, clip, 20000, 'stub'), full: R('bench', model, clip, 20000) };
  }, SITE);
  out.bench = bench;
  // the adapter's per-step code (sampling, segment cache, the loop) against a recording stand-in
  v.check('animate(): heap growth over 20,000 clip steps (adapter code)', bench?.own?.heapDelta ?? null, '<=', 4096, ' B');
  const perStep = bench?.full?.heapDelta != null ? Math.round(bench.full.heapDelta / bench.full.steps) : null;
  v.note(`animate() with RobotModel.setJoint: ${perStep ?? 'n/a'} B per step for 3 joints (V8 boxes the double setJoint returns; WP0's API) · ${bench?.full ? Math.round((bench.full.ms / bench.full.steps) * 1e6) / 1e3 : 'n/a'} µs per step`);

  // ── 2. ≤ 2 fetches at once ──────────────────────────────────────────────────
  await tele([0, 0, 26], { yaw: 0, pitch: 0 });
  await W(500);
  const many = ['so101-leader', 'franka-fr3', 'shadow-hand', 'anymal-d', 'stretch-3', 'ur5e'];
  const t0 = await page.evaluate(() => performance.now());
  await page.evaluate(async (ids) => {
    const api = window.__academy.ext('robots')('api', 'world');
    const models = await Promise.all(ids.map((id) => api.load(id, { priority: 'now' })));
    for (const m of models) m.dispose();
  }, many);
  const log = (await R()).log.filter((l) => l.t0 >= t0 && many.some((id) => l.key === `glb:${id}`));
  let maxAt = 0;
  for (const a of log) maxAt = Math.max(maxAt, log.filter((b) => b.t0 <= a.t0 && (b.t1 ?? Infinity) > a.t0).length);
  out.concurrency = { fetches: log.length, maxAt };
  v.check('six robots requested at once: fetches made', log.length, '=', many.length, '');
  v.check('… at most at once', maxAt, '<=', 2, '');

  // ── 3. no prewarm during a cinematic camera ─────────────────────────────────
  await page.evaluate(() => {
    const G = window.__academy.game;
    G.player.cameraOverride = { position: G.camera.position.clone(), quaternion: G.camera.quaternion.clone(), blend: 1 };
    window.__academy.ext('robots')('api', 'world').prefetch(['unitree-go2']);
  });
  await W(3000);
  const during = await R();
  const goDuring = during.log.filter((l) => l.key === 'glb:unitree-go2');
  out.cinematic = { paused: during.paused, job: during.jobs.find((j) => j.key === 'glb:unitree-go2'), fetches: goDuring.length };
  v.require('cinematic camera: prefetch paused', during.paused === true);
  v.check('cinematic camera: prewarm fetches', goDuring.length, '=', 0, '');
  await page.evaluate(() => {
    window.__academy.game.player.cameraOverride = null;
  });
  await page.waitForFunction(() => window.__academy.ext('robots')().jobs.find((j) => j.key === 'glb:unitree-go2')?.state === 'ready', null, { timeout: 30000, polling: 100 }).catch(() => {});
  const afterCine = (await R()).log.filter((l) => l.key === 'glb:unitree-go2');
  out.cinematic.after = afterCine;
  v.require('after the cinematic the prefetch ran (not paused at its start)', afterCine.length > 0 && afterCine.every((l) => !l.paused), JSON.stringify(afterCine.map((l) => l.paused)));

  // ── 7. first show of a prewarmed robot: 0 program links ─────────────────────
  await page.evaluate(() => window.__academy.ext('robots')('api', 'world').prefetch(['unitree-g1']));
  await page.waitForFunction(
    () => {
      const s = window.__academy.ext('robots')();
      return s.jobs.find((j) => j.key === 'glb:unitree-g1')?.state === 'ready' && !s.prewarming;
    },
    null,
    { timeout: 60000, polling: 100 },
  ).catch(() => {});
  await W(1500);
  const show = await page.evaluate(async () => {
    const G = window.__academy.game;
    const api = window.__academy.ext('robots')('api', 'world');
    const m = await api.load('unitree-g1', { priority: 'now' });
    const cam = G.camera;
    const dir = cam.getWorldDirection(m.object.position.clone());
    m.object.position.copy(cam.position).addScaledVector(dir, 3).setY(cam.position.y - 1.6);
    m.object.updateMatrixWorld(true);
    const programs = () => G.rs.renderer.info.programs.length;
    const keys = () => new Set(G.rs.renderer.info.programs.map((p) => p.cacheKey));
    const frame = () => new Promise((r) => requestAnimationFrame((t) => r(t)));
    await frame();
    const before = programs();
    const k0 = keys();
    const t0 = await frame();
    G.rs.scene.add(m.object);
    const t1 = await frame();
    const t2 = await frame();
    const after = programs();
    const added = G.rs.renderer.info.programs.filter((p) => !k0.has(p.cacheKey)).map((p) => `${p.name} · ${String(p.cacheKey).slice(0, 400)}`);
    const shown = m.object.parent === G.rs.scene;
    m.dispose();
    return { before, after, linked: after - before, frameMs: t2 - t1, shown, sinceAdd: t1 - t0, added };
  });
  out.firstShow = show;
  v.require('the prewarmed G1 was shown', !!show?.shown);
  v.check('programs linked on the first-show frame of a prewarmed robot', show?.linked ?? null, '=', 0, '');
  v.note(`first-show frame of the G1: ${Math.round(show?.frameMs ?? 0)} ms (indicative)`);

  // ── 4. a blocked GLB: 3 retries, failed, robots:failed ──────────────────────
  if (!args['skip-fail']) {
    const fail = await page.evaluate(async (id) => {
      const G = window.__academy.game;
      const api = window.__academy.ext('robots')('api', 'world');
      const t0 = performance.now();
      let event = null;
      const off = G.events.on('robots:failed', (p) => {
        if (p?.id === id) event = { ...p, ms: performance.now() - t0 };
      });
      let rejected = null;
      try {
        await api.load(id, { priority: 'now' });
      } catch (err) {
        rejected = String(err?.message ?? err).slice(0, 160);
      }
      off();
      return { rejected, event, state: api.state(id), ms: performance.now() - t0 };
    }, BLOCKED);
    const attempts = (await R()).log.filter((l) => l.key === `glb:${BLOCKED}`);
    out.blocked = { ...fail, attempts };
    v.check('blocked GLB: fetch attempts (1 + 3 retries)', attempts.length, '=', 4, '');
    v.require('blocked GLB: state failed, load() rejected', fail.state === 'failed' && !!fail.rejected, `${fail.state} · ${fail.rejected ?? 'resolved'}`);
    v.require('blocked GLB: robots:failed emitted with its id', fail.event?.id === BLOCKED && fail.event?.area === 'world', JSON.stringify(fail.event));
    v.note(`blocked GLB failed after ${Math.round(fail.ms / 100) / 10} s (retries 1, 3, 9 s)`);

    // ── 4b. „Erneut laden“: 'robots:retry' resets the failed job, the next load() fetches again ──
    await page.unroute(blocked);
    const retried = await page.evaluate(async (id) => {
      const G = window.__academy.game;
      const api = window.__academy.ext('robots')('api', 'world');
      const before = api.state(id);
      const t0 = performance.now();
      let failedAgain = false;
      const off = G.events.on('robots:failed', (p) => {
        if (p?.id === id) failedAgain = true;
      });
      G.events.emit('robots:retry', { id, area: 'world' });
      const after = api.state(id);
      for (let k = 0; k < 300 && api.state(id) !== 'ready' && !failedAgain; k++) await new Promise((r) => setTimeout(r, 100));
      const readyMs = performance.now() - t0;
      let model = null;
      let err = null;
      try {
        model = await api.load(id, { priority: 'now' });
      } catch (e) {
        err = String(e?.message ?? e).slice(0, 160);
      }
      const ok = !!model;
      model?.dispose();
      off();
      return { before, after, ready: api.state(id), ok, err, failedAgain, readyMs };
    }, BLOCKED);
    const attempts2 = (await R()).log.filter((l) => l.key === `glb:${BLOCKED}`);
    out.retry = { ...retried, attempts: attempts2.length - attempts.length };
    v.require("robots:retry resets the failed job (no longer 'failed' right after the event)", retried.before === 'failed' && retried.after !== 'failed', `${retried.before} → ${retried.after}`);
    v.check('robots:retry: fetches made after the event', attempts2.length - attempts.length, '>=', 1, '');
    v.require('robots:retry: the next load() resolves, the robot is ready', retried.ok && retried.ready === 'ready' && !retried.failedAgain, `${retried.ready} · ${retried.err ?? 'ok'}`);
    v.note(`robots:retry: ready ${Math.round(retried.readyMs)} ms after the event`);
  } else v.note('blocked-GLB step skipped (--skip-fail)');

  v.check('console errors', errors.length, '=', 0, '');
  out.errors = errors;
  const f = saveJson('robots-adapter-check.json', out);
  v.note(`raw: ${f}`);
} catch (err) {
  console.error('[robots-adapter-check] failed:', err);
  v.require('the check ran', false, String(err?.message ?? err).slice(0, 200));
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
v.exit(args);
