#!/usr/bin/env node
// Region check (Phase 7 plan WP14 acceptance, §5.10 feature check): the Revier around the dock.
//
//   node tools/region-check.mjs [--dist <dir> | --dev | --base <url>] [--steps load,walk,board,resume]
//
// 1. load: a fresh start builds the region chunk after the title (state 'built', when 'idle'), its root hangs
//    under the ground root with the ledger tag 'region', and the map has its „Revier“ layer.
// 2. walk: every path is walkable from its pad (W held, the view turned to each waypoint, the real character
//    controller; the region's own colliders — the excavator, the Revier-Chronik, the signposts — must not block
//    a track): G240 → the Revier-Chronik's reading spot → the Hofladen; G300 → the Unkrautacker's field station;
//    G60 → the Kreislaufhof's door → its console; G120 → the Traumhangar's doors. A snag (< 0.6 m/s toward a
//    waypoint > 1.5 m away for > 0.3 s) or a waypoint not reached fails.
// 3. board: the Grubenrand board is readable from its reading spot: the face shows (near tier), nothing stands
//    between the eye and it, its title is ≥ 22 px and its body ≥ 11 px tall on a 1280 × 720 screen, light text on
//    the dark enamel ≥ 7:1, and E opens the same story as a card with its FIKTION chip. A screenshot for people.
// 4. resume: a returning player whose last area is on the ground (a seeded v2 save: Sensordom ◆ stamped, so the
//    Revier is open; lastZone 'kreislaufhof'; docked) gets the region built before the title (when 'boot', built
//    before #start shows); a fresh start does not (when 'idle').
// Exit 1 on a miss. Writes artifacts/<PT_DIR|measure>/region-check.json (+ region-check-board.png).
import path from 'node:path';
import { Verdict, gameServer, launchChromium, openGame, parseArgs, saveJson, list } from './lib/measure.mjs';
import { ROOT } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const steps = list(args.steps, ['load', 'walk', 'board', 'resume']);
const v = new Verdict('region-check');
const out = {};

const polar = (b, r) => [Math.sin((b * Math.PI) / 180) * r, -Math.cos((b * Math.PI) / 180) * r];
const waitRegion = (page) => page.waitForFunction(() => ['built', 'failed'].includes(window.__academy.ext('region')?.()?.state), null, { timeout: 60000, polling: 250 });

const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
try {
  // ── 1–3 on one page: a fresh start ──
  if (steps.some((s) => s !== 'resume')) {
    const { page, ctx, errors } = await openGame(browser, `${srv.url}/?skipIntro=1&mute=1&reset=1&lang=de`, { instrument: false });
    await waitRegion(page);
    const R = await page.evaluate(() => window.__academy.ext('region')());
    out.load = R;
    if (steps.includes('load')) {
      const tags = await page.evaluate(() => {
        const G = window.__academy.game;
        const g = G.frames.ground;
        const root = g?.children.find((c) => c.name === 'region:root') ?? null;
        return { underGround: !!root, ledger: root?.userData.ledger ?? null, mapLayer: !!G.map?.layers?.has?.('region') };
      });
      console.log(`load: ${R.state}, when ${R.when} after ${R.builtAtMs} ms · ${R.draws} draws, ${R.triangles} triangles · under the ground root ${tags.underGround} · ledger '${tags.ledger}' · map layer ${tags.mapLayer}`);
      v.require('the region chunk is built', R.state === 'built', R.state);
      v.require("a fresh start builds it in idle time after the title (when 'idle')", R.when === 'idle', String(R.when));
      v.require('its root hangs under the ground root', tags.underGround);
      v.require("its root carries the ledger tag 'region'", tags.ledger === 'region', String(tags.ledger));
      v.require('the map has the „Revier“ layer', tags.mapLayer);
    }

    if (steps.includes('walk') || steps.includes('board')) {
      // the land's colliders, every area (the sites' floors), the Revier gate open as at the first rotor; the
      // island held level (§5.3 rule 4: docked gusts never tilt it)
      await page.waitForFunction(() => window.__academy.ext('ground')?.().stage === 'ring' && window.__academy.ext('ground')().tiles > 0, null, { timeout: 60000, polling: 200 });
      await page.evaluate(() => void window.__academy.loadAll());
      await page.waitForFunction(() => window.__academy.settledAll === true, null, { timeout: 120000, polling: 300 });
      await page.evaluate(() => {
        window.__academy.solve('world', 'ground-gate-open');
        const G = window.__academy.game;
        G.setIslandTilt(0, 0);
        G.setIslandTilt = () => {};
      });
      await page.waitForTimeout(2500);
    }

    if (steps.includes('walk')) {
      const spots = await page.evaluate(() => {
        const A = window.__academy;
        const local = (id, x, z) => {
          const c = A.game.zones.records.get(id)?.ctx;
          if (!c) return null;
          const w = c.toWorld([x, 0, z]);
          return [Math.round(w.x * 10) / 10, Math.round(w.z * 10) / 10];
        };
        return { read: A.ext('region')().grubenrand.readAt, uk: local('unkrautacker', 0, 57.2), khDoor: local('kreislaufhof', 0, 17), khIn: local('kreislaufhof', -2, 10), khConsole: local('kreislaufhof', -15, 9.6) };
      });
      const hangar = [122.6, 110.4];
      const doors = [hangar[0] + Math.sin((312 * Math.PI) / 180) * 19, hangar[1] - Math.cos((312 * Math.PI) / 180) * 19];
      const WALKS = [
        ['G240 → Revier-Chronik → Hofladen', polar(240, 150), [[-152, 78], [-176, 82], [spots.read[0], spots.read[2]], [-210, 76], [-216, 70]]],
        ['G300 → Unkrautacker field station', polar(300, 150), [[-142, -104], [-146, -140], [-140, -172], [-136, -186], ...(spots.uk ? [spots.uk] : [])]],
        ['G60 → Kreislaufhof console', polar(60, 150), [[166, -80], [210, -72], [256, -56], [296, -44], [308, -40], ...[spots.khDoor, spots.khIn, spots.khConsole].filter(Boolean)]],
        ['G120 → Traumhangar doors', polar(120, 150), [doors]],
      ];
      out.walks = {};
      for (const [name, start, pts] of WALKS) {
        const r = await page.evaluate(
          async ({ start, pts }) => {
            const A = window.__academy;
            const G = A.game;
            A.teleport([start[0], G.frames.heightAt(start[0], start[1]) + 0.5, start[1]]);
            await A.waitFrames(20);
            const res = { reached: 0, of: pts.length, maxStuck: 0, stuckAt: null, timedOut: null, seconds: 0 };
            const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
            key('keydown', 'KeyW');
            key('keydown', 'ShiftLeft');
            const t0 = performance.now();
            for (const [x, z] of pts) {
              const tl = performance.now();
              let stuck = 0;
              let last = performance.now();
              const prev = G.player.feet.clone();
              const budget = (Math.hypot(x - G.player.feet.x, z - G.player.feet.z) / 5 + 4) * 1000;
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
            key('keyup', 'ShiftLeft');
            res.seconds = Math.round((performance.now() - t0) / 100) / 10;
            return res;
          },
          { start, pts },
        );
        out.walks[name] = r;
        console.log(`walk ${name.padEnd(36)} ${r.reached}/${r.of} waypoints in ${r.seconds} s · longest snag ${(r.maxStuck * 1000).toFixed(0)} ms${r.stuckAt ? ` at ${r.stuckAt.join(', ')}` : ''}${r.timedOut ? ` · TIMED OUT before ${r.timedOut.slice(0, 2).join(', ')} (at ${r.timedOut.slice(2).join(', ')})` : ''}`);
        v.check(`${name}: waypoints reached`, r.reached, '>=', r.of);
        v.check(`${name}: longest snag (s)`, Math.round(r.maxStuck * 100) / 100, '<=', 0.3);
      }
    }

    if (steps.includes('board')) {
      const b = await page.evaluate(async () => {
        const A = window.__academy;
        const G = A.game;
        const g = A.ext('region')().grubenrand;
        A.teleport([g.readAt[0], g.readAt[1] + 0.3, g.readAt[2]]);
        await A.waitFrames(30);
        A.lookAt(g.board[0], g.board[1], g.board[2]);
        await A.waitFrames(30);
        const face = G.frames.ground.getObjectByName('region:grubenrand:board');
        const cam = G.rs.camera;
        cam.updateMatrixWorld();
        face.updateMatrixWorld(true);
        face.geometry.computeBoundingBox();
        const bb = face.geometry.boundingBox;
        const V = cam.position.constructor;
        const H = G.rs.renderer.domElement.clientHeight || 720;
        const corners = [
          [bb.min.x, bb.min.y],
          [bb.max.x, bb.min.y],
          [bb.min.x, bb.max.y],
          [bb.max.x, bb.max.y],
        ].map(([x, y]) => new V(x, y, 0).applyMatrix4(face.matrixWorld).project(cam));
        const inView = corners.every((c) => c.z < 1 && Math.abs(c.x) <= 1.05 && Math.abs(c.y) <= 1.05);
        const ys = corners.map((c) => ((1 - c.y) / 2) * H);
        const facePx = Math.max(...ys) - Math.min(...ys);
        // nothing solid between the eye and the face (the board's own post sits 8 cm behind it)
        const eye = cam.getWorldPosition(new V());
        const centre = new V(0, 0, 0).applyMatrix4(face.matrixWorld);
        const dir = centre.clone().sub(eye);
        const dist = dir.length();
        const hit = G.worldCtx.physics.raycast([eye.x, eye.y, eye.z], [dir.x / dist, dir.y / dist, dir.z / dist], dist);
        // the canvas: the enamel and the brightest title pixel
        const can = face.material.map.image;
        const c2 = can.getContext('2d');
        const px = (x, y, w, h) => c2.getImageData(x, y, w, h).data;
        const lum = (r, g, b) => {
          const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const bg = px(30, 30, 1, 1);
        const t = px(56, 80, 700, 60);
        let best = 0;
        for (let i = 0; i < t.length; i += 4) best = Math.max(best, lum(t[i], t[i + 1], t[i + 2]));
        const lb = lum(bg[0], bg[1], bg[2]);
        return { faceVisible: face.visible && A.ext('region')().grubenrand.faceVisible, inView, facePx: Math.round(facePx), canvasH: can.height, dist: Math.round(dist * 100) / 100, blocked: hit && hit.distance < dist - 0.25 ? Math.round(hit.distance * 100) / 100 : null, contrast: Math.round(((best + 0.05) / (lb + 0.05)) * 10) / 10 };
      });
      const titlePx = Math.round((b.facePx * 64) / b.canvasH),
        bodyPx = Math.round((b.facePx * 32) / b.canvasH);
      // the screenshot for people: the board without the onboarding's movement card over it
      await page.addStyleTag({ content: '#onb-move{display:none!important}' });
      await page.screenshot({ path: path.join(ROOT, 'artifacts', process.env.PT_DIR || 'measure', 'region-check-board.png') });
      // E: the same story as a card, with its FIKTION chip
      const card = await page.evaluate(async () => {
        const A = window.__academy;
        const hit = A.interact('Revier-Chronik');
        await new Promise((r) => setTimeout(r, 700));
        const m = document.querySelector('.modal.infocard');
        const res = { interact: !!hit, card: !!m, fiktion: !!m?.querySelector('.chips .chip-fiktion'), text: (m?.querySelector('.text')?.textContent ?? '').slice(0, 400) };
        A.closeModals();
        return res;
      });
      out.board = { ...b, titlePx, bodyPx, card };
      console.log(`board: face ${b.faceVisible ? 'shown' : 'hidden'}, in view ${b.inView}, ${b.facePx} px tall at ${b.dist} m (title ${titlePx} px, body ${bodyPx} px), contrast ${b.contrast}:1, blocked ${b.blocked ?? 'no'} · card ${card.card}, FIKTION chip ${card.fiktion}`);
      v.require('the board shows near its reading spot', b.faceVisible);
      v.require('the whole board is in view from the reading spot', b.inView);
      v.require('nothing solid stands between the eye and the board', b.blocked == null, `hit at ${b.blocked} m`);
      v.check('title height on screen (px)', titlePx, '>=', 22);
      v.check('body height on screen (px)', bodyPx, '>=', 11);
      v.check('text contrast on the enamel', b.contrast, '>=', 7);
      v.require('E opens the Revier-Chronik card', card.interact && card.card);
      v.require('the card carries its FIKTION chip', card.fiktion);
      v.require('the card tells pit → lake → field', /Grube/.test(card.text) && /See/.test(card.text) && /Acker/.test(card.text), card.text.slice(0, 80));
    }
    out.errors = errors.slice(0, 10);
    v.check('page errors', errors.length, '<=', 0);
    await ctx.close();
  }

  // ── 4: a returning player on the ground ──
  if (steps.includes('resume')) {
    const now = Date.now();
    const save = {
      v: 2,
      mode: 'entdecker',
      stamps: { 'sensordom.messstrecke': { t: now - 60000, value: { de: 'σ(6 m) = 7,8 cm', en: 'σ(6 m) = 7.8 cm' }, skipped: false } },
      visited: { sensordom: now - 120000, kreislaufhof: now - 30000 },
      zoneData: { world: { onboarding: 3, logoShown: 1, 'p7.quest': { flight: { state: 'ground', firstFlightAt: null, liftoffSeen: false }, start: { glideSeen: true, probestart: true }, seenBeats: ['M1', 'revier', 'probestart'], groundCrew: [], mastery: { h2Unveiled: false } } } },
      predictions: {},
      questions: [],
      album: [],
      best: {},
      challenges: {},
      collectibles: [],
      lastZone: 'kreislaufhof',
      secrets: [],
    };
    const seed = `(() => { try { if (sessionStorage.getItem('__rc_seeded')) return; localStorage.setItem('emai-academy-island/v1:progress.v2', ${JSON.stringify(JSON.stringify(save))}); sessionStorage.setItem('__rc_seeded', '1'); } catch (e) {} })();`;
    // when the title shows: #start without .hidden / .leaving, stamped by a poll that starts with the page
    const watch = `(() => { const t = () => { const s = document.getElementById('start'); if (s && s.isConnected && !s.classList.contains('hidden') && !s.classList.contains('leaving') && getComputedStyle(s).display !== 'none') { window.__titleAt = performance.now(); return; } requestAnimationFrame(t); }; requestAnimationFrame(t); })();`;
    const { page, ctx, errors } = await openGame(browser, `${srv.url}/?mute=1&lang=de`, { instrument: false, init: [seed, watch] });
    await page.waitForFunction(() => window.__titleAt != null, null, { timeout: 120000, polling: 100 });
    await waitRegion(page);
    const r = await page.evaluate(() => ({ region: window.__academy.ext('region')(), titleAt: Math.round(window.__titleAt), resume: window.__academy.game.quest?.resumeArea?.() ?? null, flight: window.__academy.quest()?.flight?.state, regionOpen: window.__academy.quest()?.regionOpen }));
    out.resume = { ...r, errors: errors.slice(0, 5) };
    console.log(`resume (lastZone ${r.resume}, ${r.flight}, Revier open ${r.regionOpen}): region ${r.region.state}, when ${r.region.when}, built at ${r.region.builtAtMs} ms · title at ${r.titleAt} ms`);
    v.require('the seeded save resumes into a ground area while docked', r.resume === 'kreislaufhof' && r.flight === 'ground', `${r.resume} · ${r.flight}`);
    v.require("a ground resume builds the region at boot (when 'boot')", r.region.when === 'boot', String(r.region.when));
    v.check('the region is built before the title shows (ms before)', r.titleAt - (r.region.builtAtMs ?? Infinity), '>=', 0);
    v.check('resume page errors', errors.length, '<=', 0);
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('region-check.json', out);
v.exit(args);
