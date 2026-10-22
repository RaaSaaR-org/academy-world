#!/usr/bin/env node
// Release gallery: the title, the first minute, the hub, each zone's signature moment, the
// Kielraum, the dusk ending and the certificate, at 1280×720 on a private production build.
//
//   node tools/gallery.mjs [--lang de|en] [--mode entdecker|entscheider] [--only name1,name2] [--out artifacts/release]
//
// Shots use the debug solve hooks and zone cinematics (ctx.player.cinematic) for framing; read
// every PNG afterwards. Exit 1 on console errors.
import fs from 'node:fs';
import path from 'node:path';
import { session } from './lib/session.mjs';
import { parseArgs, ROOT } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const lang = String(args.lang ?? 'de');
const mode = String(args.mode ?? 'entdecker');
const only = args.only ? String(args.only).split(',') : null;
const outDir = path.resolve(ROOT, String(args.out ?? 'artifacts/release'));
fs.mkdirSync(outDir, { recursive: true });
process.env.PT_DIR = process.env.PT_DIR || path.join('release', '_session');

const want = (name) => !only || only.includes(name);
const files = [];

/** zone-local cinematic camera: position and look-at in the zone's frame (blend 1) */
const cine = (zone, pos, at) =>
  `{ const c = __academy.game.zones.records.get('${zone}').ctx.player.cinematic(); c.set(${JSON.stringify(pos)}, ${JSON.stringify(at)}, 1); window.__cine = c; }`;
const endCine = `window.__cine?.end(); window.__cine = null;`;
/** island cinematic: world coordinates (the island module's frame is the world frame) */
const cineWorld = (pos, at) =>
  `{ const c = __academy.game.worldCtx.player.cinematic(); c.set(${JSON.stringify(pos)}, ${JSON.stringify(at)}, 1); window.__cine = c; }`;
const hud = (on) => `__academy.game.hud.setPlaying(${on ? 'true' : 'false'})`;

const { errors } = await session(`gallery-${lang}-${mode}`, async (s) => {
  const snap = async (name) => {
    const f = path.join(outDir, `${name}.png`);
    await s.page.screenshot({ path: f });
    files.push(f);
    s.log('shot', name);
  };
  const settle = async (ms = 1500) => {
    await s.wait(ms);
    await s.frames(10);
  };
  /** no subtitles, hint or toasts in the frame (the zone HUD stays) */
  const clean = async () => {
    await s.ev(`__academy.game.hud.dialogue.stop(); __academy.game.gameLayer?.ui.closeBanner(); __academy.game.gameLayer?.ui.closeFail(); document.getElementById('hint')?.classList.remove('show'); document.querySelectorAll('#toasts > *').forEach((e) => e.remove())`);
    await settle(500);
  };
  /** a hook that may wait for a card to close: never block longer than ms */
  const solve = (z, h, ms = 15000) => s.val(`Promise.race([__academy.solve('${z}','${h}'), new Promise((r) => setTimeout(r, ${ms}))])`);

  // ── title + ascent ──────────────────────────────────────────────────────────
  if (want('title') || want('ascent')) {
    await s.open(`/?reset=1&lang=${lang}&mode=${mode}`);
    await settle(2500);
    if (want('title')) await snap('title');
    if (want('ascent')) {
      await s.ev(`__academy.start('${mode}')`);
      await s.wait(3600);
      await snap('ascent');
      await s.wait(4600);
      await snap('ascent-2');
    }
  }

  // ── the island ──────────────────────────────────────────────────────────────
  await s.open(`/?reset=1&skipIntro=1&lang=${lang}&mode=${mode}`);
  await settle(2500);
  await s.ev(`__academy.closeModals(); __academy.game.hud.dialogue.stop()`);
  if (want('arrival')) {
    await s.ev(`__academy.teleport([0, 0, 94.5], { yaw: 0, pitch: 6 })`);
    await settle(2500);
    await s.ev(`__academy.game.hud.dialogue.stop()`);
    await s.ev(hud(false));
    await settle(400);
    await snap('arrival');
    await s.ev(hud(true));
  }
  if (want('hub')) {
    await s.ev(`__academy.teleport([-20, 0, 36], { yaw: -30, pitch: 8 })`);
    await settle(1500);
    // framed for the default FOV 60° and the v2 tower (Ausguck +44, needle to +58)
    await s.ev(cineWorld([-58, 34, 80], [0, 12, 0]));
    await settle(2500);
    await s.ev(`__academy.game.hud.dialogue.stop()`);
    await s.ev(hud(false));
    await settle(400);
    await snap('hub');
    await s.ev(hud(true));
    await s.ev(endCine);
  }

  // ── zones: walk in, run the stations, frame the signature moment ───────────
  const zone = async (id, steps) => {
    await s.ev(`__academy.teleport('${id}')`);
    await s.wait(800);
    await s.ev(`__academy.press('KeyW', 2600)`);
    await s.wait(3000);
    await steps();
  };

  if (want('sensordom')) {
    await zone('sensordom', async () => {
      await solve('sensordom', 'tp-overview');
      await settle(1500);
      await clean();
      await snap('sensordom-dome');
      await solve('sensordom', 'tp-corridor');
      await solve('sensordom', 'mode-lidar');
      await settle(2500);
      await clean();
      await snap('sensordom-lidar');
      await solve('sensordom', 'tp-mirror');
      await settle(2500);
      await clean();
      await snap('sensordom-mirror');
    });
  }
  if (want('regelgarten')) {
    await zone('regelgarten', async () => {
      await solve('regelgarten', 'solve-c');
      await s.wait(6000);
      await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
      await s.ev(cine('regelgarten', [7, 4.2, 15], [-3, 3.5, -2]));
      await settle(1800);
      await clean();
      await snap('regelgarten');
      await s.ev(endCine);
    });
  }
  if (want('greifwerkstatt')) {
    await zone('greifwerkstatt', async () => {
      await s.ev(cine('greifwerkstatt', [2, 3.2, 14], [0, 3.5, -2]));
      await settle(1800);
      await clean();
      await snap('greifwerkstatt');
      await s.ev(endCine);
    });
  }
  if (want('lern-dojo')) {
    await zone('lern-dojo', async () => {
      await solve('lern-dojo', 'solve-a');
      await s.wait(3000);
      await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
      await s.ev(cine('lern-dojo', [3, 1.7, 21], [0, 7.5, -2]));
      await settle(1800);
      await clean();
      await snap('lern-dojo');
      await s.ev(endCine);
    });
  }
  if (want('dunkelfabrik')) {
    await zone('dunkelfabrik', async () => {
      // the lights-out interior lighting only applies while the player stands inside the hall
      await s.ev(`{ const c = __academy.game.zones.records.get('dunkelfabrik').ctx; const p = c.toWorld([0, 0, 0]); __academy.teleport([p.x, p.y, p.z]); }`);
      await s.wait(1500);
      await solve('dunkelfabrik', 'lever');
      await s.wait(9000);
      await clean();
      await snap('dunkelfabrik');
      await s.wait(6000);
      await clean();
      await snap('dunkelfabrik-2');
      await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
    });
  }
  if (want('prueffeld')) {
    await zone('prueffeld', async () => {
      await solve('prueffeld', 'solve-b');
      await s.wait(12000);
      await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
      await s.ev(cine('prueffeld', [0, 3.2, 17], [-3, 3.6, -4]));
      await settle(1800);
      await clean();
      await snap('prueffeld');
      await s.ev(endCine);
    });
  }

  // ── finale ──────────────────────────────────────────────────────────────────
  if (want('kielraum') || want('dusk') || want('certificate')) {
    for (const z of ['sensordom', 'regelgarten', 'greifwerkstatt', 'lern-dojo', 'dunkelfabrik', 'prueffeld']) {
      for (const h of ['solve-a', 'solve-b', 'solve-c']) {
        await solve(z, h, 8000).catch(() => {});
        await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
      }
    }
    await s.ev(`__academy.closeModals(); __academy.exitOperate(); __academy.game.hud.dialogue.stop()`);
    await s.ev(`__academy.teleport([0,0,-7.5],{yaw:180,pitch:0})`);
    await s.wait(1200);
    await s.val(`__academy.interact('${lang === 'de' ? 'KIEL' : 'KEEL'}')`);
    await s.wait(10000);
    if (want('kielraum')) {
      await s.ev(`__academy.closeModals()`);
      await s.ev(`__academy.look(180, -17)`);
      await settle(1200);
      await clean();
      await snap('kielraum');
    }
    await s.ev(`await __academy.solve('world','finale-f1-bot')`);
    await s.wait(23000);
    await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
    await s.ev(`await __academy.solve('world','finale-f2-solve')`);
    await s.wait(3000);
    await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
    await s.ev(`await __academy.solve('world','finale-f3-solve')`);
    await s.wait(3000);
    await s.ev(`__academy.closeModals(); __academy.exitOperate()`);
    await s.ev(`await __academy.solve('world','finale-ending')`);
    await s.wait(36000);
    await s.ev(`__academy.closeModals()`);
    if (want('dusk')) {
      await s.ev(`__academy.game.hud.dialogue.stop()`);
      await s.ev(hud(false));
      await s.ev(cineWorld([-62, 30, 84], [0, 4, 0]));
      await settle(2500);
      await snap('dusk-aerial');
      await s.ev(endCine);
      await s.ev(hud(true));
    }
    if (want('certificate')) {
      await s.ev(`await __academy.solve('world','finale-certificate')`);
      await settle(2500);
      await snap('certificate');
    }
  }
});

console.log(JSON.stringify({ files, errors: errors.length }, null, 1));
process.exit(errors.length ? 1 : 0);
