#!/usr/bin/env node
// Ground walk (Phase 7 plan WP3 acceptance, §5.10 feature check): the player walks the ground the way a
// visitor does and the ground's physics holds.
//
//   node tools/ground-walk.mjs [--dist <dir> | --dev | --base <url>] [--routes bridge,yard,pads,tracks] [--sprint]
//
// 1. Walks (W held, the view turned to each waypoint, real character controller): the bridge (bridge head →
//    the Landedeck edge and back), the yard (through the opened Revier gate and round the ring road), the four
//    ground pads (spur out and back), and the tracks to the Sonnenacker, the Unkrautacker, the Kreislaufhof,
//    the Bahnhof and the shore walk, and into the excavator's lay-by beside the Sonnenacker track (G-LOOK,
//    D42: WP14's bucket-wheel excavator stands there) and back. A snag is the player making < 0.6 m/s toward a waypoint > 1.5 m away
//    while W is held; any snag longer than 0.3 s fails, and so does a waypoint not reached in time.
// 2. Falls: the player dropped into the dock's slot and into the lake must be rescued (the engine's
//    'player:rescue', back on safe ground) within 2 s.
// 3. A crate dropped into the dock is reset to its spawn (the rescue volume's dynamics reset) within 4 s.
// 4. The lay-by's fence holds: walking south out of it for 3 s ends on the lay-by's side of the fence.
// The island is held level for the walk (§5.3 rule 4: docked gusts never tilt it; rc4's gust tilt would switch
// the ground physics off while it lasts). Exit 1 on any failure. Writes artifacts/<PT_DIR|measure>/ground-walk.json.
import { Verdict, gameServer, launchChromium, openGame, parseArgs, saveJson, list } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const routes = list(args.routes, ['bridge', 'yard', 'pads', 'tracks', 'falls', 'crate']);
const sprint = !!args.sprint;
const v = new Verdict('ground-walk');
const out = { routes: {}, falls: {}, crate: null };

const polar = (b, r) => [Math.sin((b * Math.PI) / 180) * r, -Math.cos((b * Math.PI) / 180) * r];
const ring = (from, to, r, step = 15) => {
  const pts = [];
  const n = Math.ceil(Math.abs(to - from) / step);
  for (let i = 0; i <= n; i++) pts.push(polar(from + ((to - from) * i) / n, r));
  return pts;
};
/** [name, start [x, z], waypoints [[x, z] …]] */
const WALKS = {
  bridge: [['bridge', [0, 117], [[0, 112], [0, 106], [0, 102.2], [0, 108], [0, 116.5]]]],
  yard: [
    ['gate', [0, 117], [[0, 124], [0, 128]]],
    ['ring-west', [0, 128], [polar(180, 124), ...ring(180, 300, 124)]],
    ['ring-east', polar(300, 124), ring(300, 420, 124)],
  ],
  pads: [60, 120, 240, 300].map((b) => [`pad-G${b}`, polar(b, 124), [polar(b, 140), polar(b, 150), polar(b, 128)]]),
  tracks: [
    ['sonnenacker', polar(240, 150), [[-152, 78], [-176, 82], [-196, 84], [-210, 76], [-216, 70], [-224, 70]]],
    ['unkrautacker', polar(300, 150), [[-142, -104], [-146, -140], [-140, -172], [-136, -186], [-140, -196]]],
    ['kreislaufhof', polar(60, 150), [[166, -80], [210, -72], [256, -56], [296, -44], [308, -40]]],
    ['bahnhof', [0, 128], [[0, 150], [0, 170], [-4, 200]]],
    ['ufer', [-360, 8], [[-392, -40], [-430, -96], [-462, -146], [-476, -176]]],
    // the lay-by around WP14's excavator (its crawlers stand on x −200.5…−189.5, z 84.5…94.7; the board at
    // x −205): in along the east strip to the fence side, back, then along the north strip (integrator, wave 2)
    ['layby', [-178, 83], [[-186, 84], [-186.5, 92.5], [-186, 86], [-194, 82.6], [-201, 82.6], [-188, 83]]],
  ],
};

const srv = await gameServer(args);
const browser = await launchChromium();
try {
  const { page, ctx, errors } = await openGame(browser, `${srv.url}/?skipIntro=1&mute=1`, { instrument: false });
  // the ground's land and colliders (the ring), then the Revier gate open (as at the first rotor)
  await page.waitForFunction(() => window.__academy.ext('ground')?.().stage === 'ring' && window.__academy.ext('ground')().tiles > 0, null, { timeout: 60000, polling: 200 });
  await page.evaluate(() => window.__academy.solve('world', 'ground-gate-open'));
  // §5.3 rule 4: docked gusts never tilt the island (WP12 makes the arms catch them). Until that is merged,
  // rc4's gust tilt would switch the ground physics off for its 4.5 s (WP4: tilted = not docked), so the
  // walk holds the island level as the docked rule says.
  await page.evaluate(() => {
    const G = window.__academy.game;
    G.setIslandTilt(0, 0);
    G.setIslandTilt = () => {};
  });
  await page.waitForTimeout(3000);

  const walk = (start, pts, sprintOn) =>
    page.evaluate(
      async ({ start, pts, sprintOn }) => {
        const A = window.__academy;
        const G = A.game;
        // onto the terrain (the sites and tracks lie up to a few metres above the yard)
        A.teleport([start[0], G.frames.heightAt(start[0], start[1]) + 0.5, start[1]]);
        await A.waitFrames(20);
        const res = { reached: 0, of: pts.length, maxStuck: 0, stuckAt: null, timedOut: null, seconds: 0 };
        // hold W (and Shift) for the whole walk: real keydown / keyup (a repeated press would release it in between)
        const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
        key('keydown', 'KeyW');
        if (sprintOn) key('keydown', 'ShiftLeft');
        const t0 = performance.now();
        for (const [x, z] of pts) {
          const tl = performance.now();
          let stuck = 0;
          let last = performance.now();
          const prev = G.player.feet.clone();
          const budget = (Math.hypot(x - G.player.feet.x, z - G.player.feet.z) / (sprintOn ? 6 : 3.5) + 3) * 1000;
          for (;;) {
            await new Promise((r) => requestAnimationFrame(() => r()));
            const now = performance.now();
            const dt = (now - last) / 1000;
            last = now;
            const p = G.player.feet;
            const dx = x - p.x,
              dz = z - p.z;
            const d = Math.hypot(dx, dz);
            if (d < 1.2) {
              res.reached++;
              res.maxStuck = Math.max(res.maxStuck, stuck);
              break;
            }
            if (now - tl > budget) {
              res.timedOut = [x, z, Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10];
              break;
            }
            A.look((Math.atan2(-dx, -dz) * 180) / Math.PI, 0);
            const moved = Math.hypot(p.x - prev.x, p.z - prev.z);
            prev.copy(p);
            if (dt > 0 && moved / dt < 0.6 && d > 1.5 && now - tl > 400) {
              stuck += dt;
              if (stuck > res.maxStuck) {
                res.maxStuck = stuck;
                res.stuckAt = [Math.round(p.x * 10) / 10, Math.round(p.y * 100) / 100, Math.round(p.z * 10) / 10];
              }
            } else stuck = 0;
          }
          if (res.timedOut) break;
        }
        key('keyup', 'KeyW');
        if (sprintOn) key('keyup', 'ShiftLeft');
        res.seconds = Math.round((performance.now() - t0) / 100) / 10;
        return res;
      },
      { start, pts, sprintOn },
    );

  for (const group of routes.filter((r) => WALKS[r])) {
    for (const [name, start, pts] of WALKS[group]) {
      const r = await walk(start, pts, sprint || group === 'tracks' || group === 'yard');
      out.routes[name] = r;
      console.log(`${name.padEnd(13)} ${r.reached}/${r.of} waypoints in ${r.seconds} s · longest snag ${(r.maxStuck * 1000).toFixed(0)} ms${r.stuckAt ? ` at ${r.stuckAt.join(', ')}` : ''}${r.timedOut ? ` · TIMED OUT before ${r.timedOut.slice(0, 2).join(', ')} (at ${r.timedOut.slice(2).join(', ')})` : ''}`);
      v.check(`${name}: waypoints reached`, r.reached, '>=', r.of);
      v.check(`${name}: longest snag (s)`, Math.round(r.maxStuck * 100) / 100, '<=', 0.3);
    }
  }

  // ── the lay-by's fence (plan.ts GRUBENRAND.pad, 1 m outside it) holds: W toward the cut for 3 s ──
  if (routes.includes('tracks')) {
    const r = await page.evaluate(async () => {
      const A = window.__academy;
      const G = A.game;
      // on the lay-by's east strip, beside the excavator's crawlers (WP14), facing the fence at z 96
      A.teleport([-186.5, G.frames.heightAt(-186.5, 91) + 0.5, 91]);
      await A.waitFrames(20);
      A.look(180, 0);
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
      key('keydown', 'KeyW');
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) await new Promise((res) => requestAnimationFrame(() => res()));
      key('keyup', 'KeyW');
      return { z: Math.round(G.player.feet.z * 10) / 10 };
    });
    out.laybyFence = r;
    console.log(`lay-by fence: walking south for 3 s ends at z ${r.z} (fence at z 96)`);
    v.check('lay-by fence holds (end z)', r.z, '<=', 96.2);
  }

  // ── falls: into the dock's slot (south-east, at the Dunkelfabrik's lobe tip) and into the lake ──
  const fall = (at) =>
    page.evaluate(async (at) => {
      const A = window.__academy;
      const G = A.game;
      // stand on safe ground first (the rescue goes back to the last safe position or the bridge head)
      A.teleport([at.safe[0], G.frames.heightAt(at.safe[0], at.safe[1]) + 0.5, at.safe[1]]);
      await A.waitFrames(30);
      const n0 = A.events(200).length;
      const t0 = performance.now();
      // drop the player there, keeping the safe ground it stood on as its last safe position (a teleport resets it)
      const safe = G.player.lastSafePosition.clone();
      G.player.teleport(new G.camera.position.constructor(at.drop[0], at.drop[1], at.drop[2]));
      G.player.lastSafe.copy(safe);
      let rescuedAt = null;
      let backAt = null;
      while (performance.now() - t0 < 4000) {
        await new Promise((r) => requestAnimationFrame(() => r()));
        const ev = A.events(200).slice(n0).find((e) => e.type === 'player:rescue');
        if (ev && rescuedAt == null) rescuedAt = performance.now() - t0;
        const p = G.player.feet;
        if (rescuedAt != null && p.y > -1 && G.player.grounded) {
          backAt = performance.now() - t0;
          break;
        }
      }
      const p = G.player.feet;
      return { rescueMs: rescuedAt == null ? null : Math.round(rescuedAt), backMs: backAt == null ? null : Math.round(backAt), at: [Math.round(p.x), Math.round(p.y * 10) / 10, Math.round(p.z)] };
    }, at);
  if (routes.includes('falls')) {
    const slot = polar(150, 104);
    const lake = polar(295, 645);
    for (const [name, at] of [
      ['dock', { safe: polar(150, 114), drop: [slot[0], 1, slot[1]] }],
      ['lake', { safe: polar(295, 520), drop: [lake[0], -16, lake[1]] }],
    ]) {
      const r = await fall(at);
      out.falls[name] = r;
      console.log(`fall ${name.padEnd(5)} rescue after ${r.rescueMs ?? '—'} ms, back on safe ground after ${r.backMs ?? '—'} ms (at ${r.at.join(', ')})`);
      v.check(`fall into the ${name}: rescued (ms)`, r.rescueMs ?? 99999, '<=', 2000);
      v.check(`fall into the ${name}: back on safe ground`, r.backMs == null ? 0 : 1, '>=', 1);
    }
  }

  // ── a crate dropped into the dock is reset to its spawn ──
  if (routes.includes('crate')) {
    const r = await page.evaluate(async () => {
      const A = window.__academy;
      const G = A.game;
      const { id } = await A.solve('world', 'ground-crate');
      await A.waitFrames(30);
      const d = [...G.physics.dynamics].find((b) => b.id === id);
      const spawn = d.spawnPos.clone();
      await A.solve('world', 'ground-crate-drop');
      const t0 = performance.now();
      let left = false;
      let resetAt = null;
      while (performance.now() - t0 < 6000) {
        await new Promise((res) => requestAnimationFrame(() => res()));
        const t = d.body.translation();
        const dist = Math.hypot(t.x - spawn.x, t.y - spawn.y, t.z - spawn.z);
        if (dist > 5) left = true;
        if (left && dist < 0.6) {
          resetAt = performance.now() - t0;
          break;
        }
      }
      const t = d.body.translation();
      return { resetMs: resetAt == null ? null : Math.round(resetAt), at: [Math.round(t.x), Math.round(t.y), Math.round(t.z)] };
    });
    out.crate = r;
    console.log(`crate into the dock: reset after ${r.resetMs ?? '—'} ms (at ${r.at.join(', ')})`);
    v.check('crate dropped into the dock is reset (ms)', r.resetMs ?? 99999, '<=', 4000);
  }

  if (errors.length) console.log(`page errors:\n  ${errors.slice(0, 6).join('\n  ')}`);
  v.check('page errors', errors.length, '<=', 0);
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('ground-walk.json', out);
v.exit(args);
