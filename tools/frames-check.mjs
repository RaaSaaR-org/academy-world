#!/usr/bin/env node
// Phase 7 frames check (plan §5.3, §5.2; WP4 acceptance): the ground frame, the one altitude setter,
// suspension, frozen dynamics, the interior tier cap and the rescue volumes, on the Vite dev server.
//
//   node tools/frames-check.mjs [--area _site-example] [--keep]
//
// Default area: the dev site src/zones/_site-example (ground frame, crates, a rover, a rescue net).
// With --area <id> another ground area is checked (its own crates; the rescue steps need the dev
// site's hooks and are skipped otherwise). Steps:
//   1. the area is in the ground frame, its root a child of the ground root; it enters and exits;
//   2. setAltitude(10): the area suspends (onSuspend, root detached, far tier shown), every ground
//      collider is off, every ground body frozen with its pose kept;
//   3. setAltitude(0): it resumes, the colliders are on, the bodies run and sit within 1 mm of
//      their poses before the climb;
//   4. setAltitude(0.3) + a 2.5° tilt (the Probestart): no ground body falls, their meshes ride the
//      ground root (≤ 1 mm from root × docked pose), and back at 0 they are within 1 mm;
//   5. inside the Schauhalle rect the neighbouring lobes render their exterior tier (and 4 m south
//      of the rect, outside it, Regelgarten's detail is on);
//   6. the rescue volume resets a crate and rescues the player within 0.5 s;
//   7. piloting, enterOperate({ capture }): captured keys and mouse look reach the station only, its
//      camera() moves the view, Escape leaves (dev site only);
//   8. the fan-out cost at h ≈ 300 at 4× CPU (indicative; the gate is perf-cpu --views climb).
// Exit 1 on a miss. Raw results: artifacts/measure/frames-check.json.
import { startServer, launchBrowser, parseArgs } from './lib/shotlib.mjs';
import { Verdict, cpuThrottle, round, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const area = String(args.area ?? '_site-example');
const devSite = area === '_site-example';
const v = new Verdict('frames-check');
const out = { area };

let server = null;
let browser = null;
try {
  server = await startServer();
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && (e.stack || e.message || e)).slice(0, 400)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GPU stall/.test(m.text())) errors.push(m.text().slice(0, 400));
  });
  await page.goto(`${server.url}/?zone=${encodeURIComponent(area)}&skipIntro=1&reset=1&dev=1&lang=de&mute=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
  await page.waitForFunction((id) => window.__academy.zones().some((z) => z.id === id && (z.status === 'ready' || z.status === 'error')), area, { timeout: 120000, polling: 200 });
  const W = (ms) => page.waitForTimeout(ms);
  const F = (cmd, ...a) => page.evaluate(([c, x]) => window.__academy.ext('frames')(c, ...x), [cmd, a]);
  const tele = (target, o = {}) => page.evaluate(([t, oo]) => window.__academy.teleport(t, oo), [target, o]);
  const events = () => page.evaluate(() => window.__academy.events(200));
  const mine = (A) => A.find((a) => a.id === area);
  // rc4's island gusts tilt the island for a few seconds every 60–90 s (WP12 stops them while docked):
  // wait them out before every docked assertion
  const untilted = async () => {
    for (let i = 0; i < 100; i++) {
      const s = await F();
      if (s.roll === 0 && s.pitch === 0) return true;
      await W(150);
    }
    return false;
  };
  const bodies = async () => (await F('physics')).bodies.filter((b) => b.owner === area);
  const maxDev = (a, b) => {
    let m = 0;
    for (const x of a) {
      const y = b.find((q) => q.id === x.id);
      if (!y) return Infinity;
      m = Math.max(m, Math.hypot(x.pos[0] - y.pos[0], x.pos[1] - y.pos[1], x.pos[2] - y.pos[2]));
    }
    return m;
  };

  // ── 1. the ground frame, enter / exit ───────────────────────────────────────
  const zst = (await page.evaluate(() => window.__academy.zones())).find((z) => z.id === area);
  v.require(`${area} is ready`, zst?.status === 'ready', zst?.error ?? zst?.status ?? 'missing');
  const parented = await page.evaluate((id) => {
    const G = window.__academy.game;
    const rec = G.zones.records.get(id);
    return { frame: rec ? G.zones.frameOf(rec) : null, ground: !!rec?.ctx && rec.ctx.root.parent === G.frames.groundRoot, groundName: G.frames.groundRoot?.name ?? null };
  }, area);
  out.parented = parented;
  v.require('the area is in the ground frame, its root a child of the ground root', parented.frame === 'ground' && parented.ground, JSON.stringify(parented));
  await W(1500);
  let A = mine(await F('areas'));
  v.require('at its spawn the player is inside it', !!A?.inside);
  await tele([0, 0, 26], { yaw: 0, pitch: 0 });
  await W(1500);
  A = mine(await F('areas'));
  v.require('back on the plaza the player has left it (zone:exit)', !A?.inside && (await events()).some((e) => e.type === 'zone:exit' && JSON.stringify(e.payload).includes(area)));
  await tele(area);
  await W(1500);
  A = mine(await F('areas'));
  const enters = (await events()).filter((e) => e.type === 'zone:enter' && JSON.stringify(e.payload).includes(area)).length;
  v.require('teleported back it is entered again (zone:enter)', !!A?.inside && enters >= 2, `${enters} enters`);
  // the player waits aboard while the ground moves
  await tele([0, 0, 26], { yaw: 0, pitch: 0 });
  await W(2500);
  await untilted();
  const before = await bodies();
  out.before = before;
  v.check('ground dynamics in the area', before.length, '>=', devSite ? 3 : 0, '');

  // ── 2. setAltitude(10) ──────────────────────────────────────────────────────
  await F('set', 10);
  await W(1500);
  const s10 = await F();
  const p10 = await F('physics');
  A = mine(await F('areas'));
  out.h10 = { frames: s10, physics: { colliders: p10.groundColliders, active: p10.active }, area: A };
  v.require('h 10: the area is suspended, its root detached, its far tier shown', !!A?.suspended && !A.attached && A.tiers.far, JSON.stringify(A?.tiers ?? null));
  v.require('h 10: onSuspend ran (zone:suspend)', (await events()).some((e) => e.type === 'zone:suspend' && JSON.stringify(e.payload).includes(area)));
  v.check('h 10: ground colliders still on', p10.groundColliders.on, '=', 0, '');
  v.require('h 10: every ground body is frozen', p10.bodies.filter((b) => b.owner === area).every((b) => b.frozen));
  v.check('h 10: ground bodies moved (pose kept)', maxDev(before, p10.bodies) * 1000, '<=', 1, ' mm');
  if (devSite) {
    const st = await page.evaluate((id) => window.__academy.solve(id, 'state'), area);
    out.h10.site = st;
    v.check('h 10: ctx.flight.altitude in the area', st?.flight?.altitude, '=', 10, ' m');
  }

  // ── 3. back at 0 ────────────────────────────────────────────────────────────
  await F('set', 0);
  await untilted();
  await W(1500);
  const p0 = await F('physics');
  A = mine(await F('areas'));
  const after0 = p0.bodies.filter((b) => b.owner === area);
  out.h0 = { physics: { colliders: p0.groundColliders, active: p0.active }, area: A, bodies: after0 };
  v.require('h 0: the area resumed, its root attached again', !!A && !A.suspended && A.attached);
  v.require('h 0: onResume ran (zone:resume)', (await events()).some((e) => e.type === 'zone:resume' && JSON.stringify(e.payload).includes(area)));
  v.check('h 0: ground colliders still off', p0.groundColliders.off, '=', 0, '');
  v.require('h 0: no ground body is frozen', after0.every((b) => !b.frozen));
  v.check('h 0: bodies vs their poses before the climb', maxDev(before, after0) * 1000, '<=', 1, ' mm');

  // ── 4. the Probestart: 0.3 m + tilt ─────────────────────────────────────────
  await F('set', 0.3);
  await F('tilt', 2.5, 1.2);
  await W(2000);
  const pt = await F('physics');
  A = mine(await F('areas'));
  const ride = await page.evaluate((id) => {
    const G = window.__academy.game;
    const root = G.frames.groundRoot;
    root.updateWorldMatrix(true, false);
    let m = 0;
    for (const d of G.physics.dynamics) {
      if (d.owner !== id || d.removed) continue;
      const t = d.body.translation();
      const want = new d.object.position.constructor(t.x, t.y, t.z).applyMatrix4(root.matrixWorld);
      d.object.updateWorldMatrix(true, false);
      const got = new d.object.position.constructor().setFromMatrixPosition(d.object.matrixWorld);
      m = Math.max(m, want.distanceTo(got));
    }
    return m;
  }, area);
  out.probestart = { physics: { colliders: pt.groundColliders, active: pt.active }, area: A, ride };
  v.require('h 0.3 + tilt: the area is not suspended', !!A && !A.suspended);
  v.check('h 0.3 + tilt: ground colliders still on', pt.groundColliders.on, '=', 0, '');
  v.check('h 0.3 + tilt: ground bodies moved', maxDev(before, pt.bodies) * 1000, '<=', 1, ' mm');
  v.check('h 0.3 + tilt: meshes vs ground root × docked pose', ride * 1000, '<=', 1, ' mm');
  await F('tilt', 0, 0);
  await F('set', 0);
  await untilted();
  await W(1500);
  const pb = (await F('physics')).bodies.filter((b) => b.owner === area);
  out.probestartBack = pb;
  v.check('back from the Probestart: bodies vs their poses before', maxDev(before, pb) * 1000, '<=', 1, ' mm');
  v.require('back from the Probestart: no body fell (y ≥ −1 m)', pb.every((b) => b.pos[1] > -1));

  // ── 5. the interior cap (Schauhalle rect x −15…15, z −80…−52) ────────────────
  await tele([-12, 0, -48], { yaw: 0, pitch: 0 });
  await W(1500);
  const outside = await F('areas');
  await tele([-12, 0, -56], { yaw: 0, pitch: 0 });
  await W(1500);
  const inside = await F('areas');
  const fr = await F();
  const tierOf = (L, id) => L.find((a) => a.id === id)?.tiers ?? null;
  out.interior = { outside: { regelgarten: tierOf(outside, 'regelgarten'), greifwerkstatt: tierOf(outside, 'greifwerkstatt') }, inside: { regelgarten: tierOf(inside, 'regelgarten'), greifwerkstatt: tierOf(inside, 'greifwerkstatt') }, interior: fr.interior };
  v.require('4 m south of the Schauhalle: Regelgarten shows its detail tier', !!tierOf(outside, 'regelgarten')?.detail);
  v.require('inside the Schauhalle rect: the interior is the Schauhalle', fr.interior === 'schauhalle', String(fr.interior));
  v.require('inside the Schauhalle rect: Regelgarten and Greifwerkstatt at their exterior tier', ['regelgarten', 'greifwerkstatt'].every((id) => tierOf(inside, id) && !tierOf(inside, id).detail && tierOf(inside, id).exterior), JSON.stringify(out.interior.inside));

  // ── 6. rescue volumes ───────────────────────────────────────────────────────
  if (devSite) {
    await tele(area);
    await W(1500);
    const crate = await page.evaluate(async (id) => {
      const G = window.__academy.game;
      const d = [...G.physics.dynamics].find((x) => x.owner === id && !x.removed);
      const spawn = d.spawnPos.clone();
      const t0 = performance.now();
      await window.__academy.solve(id, 'drop-crate');
      return await new Promise((resolve) => {
        const tick = () => {
          const t = d.body.translation();
          if (Math.hypot(t.x - spawn.x, t.y - spawn.y, t.z - spawn.z) < 0.01) resolve(performance.now() - t0);
          else if (performance.now() - t0 > 3000) resolve(null);
          else requestAnimationFrame(tick);
        };
        tick();
      });
    }, area);
    out.rescueCrate = crate;
    v.check('a crate in the rescue volume is reset within', crate, '<=', 500, ' ms');
    const player = await page.evaluate(async (id) => {
      const G = window.__academy.game;
      const rec = G.zones.records.get(id);
      const p = rec.ctx.toWorld([0, -8, 0]);
      const t0 = performance.now();
      const fired = new Promise((resolve) => {
        const off = G.events.on('player:rescue', () => {
          off();
          resolve(performance.now() - t0);
        });
        setTimeout(() => resolve(null), 3000);
      });
      window.__academy.teleport([p.x, p.y, p.z]);
      return await fired;
    }, area);
    out.rescuePlayer = player;
    v.check('the player in the rescue volume is rescued within', player, '<=', 500, ' ms');
    await W(2000);
    const back = await page.evaluate(() => window.__academy.state().player.pos);
    out.rescuedTo = back;
    v.require('the rescued player stands on the ground again (y ≥ −0.5)', Array.isArray(back) && back[1] > -0.5, JSON.stringify(back));
  } else v.note(`rescue steps need the dev site's hooks (--area _site-example)`);

  // ── 7. piloting: enterOperate({ capture }) (WP2's spike, WP10) ──────────────
  if (devSite) {
    await tele(area);
    await W(1200);
    const feet0 = (await page.evaluate(() => window.__academy.state().player.pos)).slice();
    const cam0 = await page.evaluate(() => window.__academy.game.camera.position.toArray());
    await page.evaluate((id) => window.__academy.solve(id, 'pilot'), area);
    await W(700);
    await page.evaluate(() => window.__academy.press('KeyW', 600));
    await W(900);
    await page.evaluate(() => window.__academy.press('KeyM', 120));
    await W(400);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.__academy.lookDelta(12, -4));
      await W(50);
    }
    await W(600);
    const mid = await page.evaluate((id) => window.__academy.solve(id, 'pilot-state'), area);
    const feet1 = await page.evaluate(() => window.__academy.state().player.pos);
    const cam1 = await page.evaluate(() => window.__academy.game.camera.position.toArray());
    const mapOpen = await page.evaluate(() => !!window.__academy.game.map.isOpen);
    await page.evaluate(() => window.__academy.press('Escape', 80));
    await W(900);
    const end = await page.evaluate((id) => window.__academy.solve(id, 'pilot-state'), area);
    const operating = await page.evaluate(() => window.__academy.game.operate.isActive);
    out.pilot = { mid, end, feet0, feet1, cam0, cam1, mapOpen, operating };
    v.require('piloting: the captured W reached the station (isDown and its onKey)', mid.wFrames > 0 && mid.onKey.KeyW >= 1, `${mid.wFrames} frames · ${mid.onKey.KeyW} onKey`);
    v.check('piloting: the player walked while W was held', Math.hypot(feet1[0] - feet0[0], feet1[2] - feet0[2]), '<=', 0.05, ' m');
    v.require('piloting: a captured M went to the station, not to the map', mid.onKey.KeyM >= 1 && !mapOpen);
    v.require('piloting: mouse movement went to onLook', mid.look[0] >= 50, JSON.stringify(mid.look));
    v.require('piloting: the camera follows the station’s camera()', mid.camFrames > 10 && Math.hypot(cam1[0] - cam0[0], cam1[2] - cam0[2]) > 0.5, `${mid.camFrames} frames`);
    v.require('piloting: Escape leaves operate mode', end.exited && !operating);
  }

  // ── 8. the fan-out cost at h ≈ 300 (indicative) ─────────────────────────────
  await tele([0, 0, 26], { yaw: 0, pitch: 0 });
  await W(500);
  // at 4× CPU, like perf-cpu --rates 4 (the gate)
  const cdp = await cpuThrottle(page, 4);
  const cost = await page.evaluate(() => {
    const G = window.__academy.game;
    const fr = G.frames;
    fr.setAltitude(300);
    const n = 2000;
    let t0 = performance.now();
    for (let i = 0; i < n; i++) fr.setAltitude(300 + (i % 100) * 0.05);
    const setter = (performance.now() - t0) / n;
    t0 = performance.now();
    for (let i = 0; i < n; i++) {
      fr.setAltitude(300 + (i % 100) * 0.05);
      fr.groundRoot?.updateMatrixWorld(true);
    }
    const withMatrices = (performance.now() - t0) / n;
    fr.setAltitude(0);
    return { setter, withMatrices, groundNodes: (() => { let n = 0; fr.groundRoot?.traverse(() => n++); return n; })() };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  out.fanout = cost;
  v.check('fan-out at h ≈ 300, 4× CPU (setter, indicative)', cost.setter * 1000, '<=', 300, ' µs');
  v.note(`fan-out + ground subtree matrices at 4× CPU: ${round(cost.withMatrices * 1000, 2)} µs per frame over ${cost.groundNodes} ground nodes (indicative; the gate is perf-cpu --views climb with WP3's ground)`);
  await W(800);

  v.check('console errors', errors.length, '=', 0, '');
  out.errors = errors;
  const f = saveJson('frames-check.json', out);
  v.note(`raw: ${f}`);
} catch (err) {
  console.error('[frames-check] failed:', err);
  v.require('the check ran', false, String(err?.message ?? err).slice(0, 200));
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
v.exit(args);
