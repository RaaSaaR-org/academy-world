#!/usr/bin/env node
// Look-development stills of the ground (Phase 7 plan WP3 build 10, G-LOOK): named camera views rendered
// from a production build (default) or the dev server, the HUD hidden, the ground's 2 m land loaded.
//
//   node tools/ground/stills.mjs [--views bridgehead,ausguck,sonnenacker] [--out <dir>] [--width 1920 --height 1080]
//                                [--dist <dir> | --dev | --base <url>] [--lookdev] [--fog <density>] [--quality high]
//                                [--lang de|en] [--eval "<page code>"]
//
// --lookdev loads the dev-only region stand-ins and block-outs (src/world/ground/lookdev, `?lookdev=1`).
// --fog overrides the fog density (the grounded 0.0007 of plan §5.7 until WP2's environment is merged).
// Writes <out>/<view>.png (default artifacts/phase7/lookdev/ground/) and prints what each view saw.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, gameServer, launchChromium, openGame, parseArgs, list } from '../lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const W = Number(args.width ?? 1920),
  H = Number(args.height ?? 1080);
const out = path.resolve(ROOT, String(args.out ?? 'artifacts/phase7/lookdev/ground'));
const quality = String(args.quality ?? 'high');

/** camera poses: eye (world, island frame at h = 0) and a look target, or yaw/pitch (yaw 0 = north, + = left) */
const VIEWS = {
  // plan §1.2 / §2.3: the spawn, bearing 0, pitch +6°
  bridgehead: { eye: [0, 1.65, 114], yaw: 0, pitch: 6 },
  // the Ausguck (+44, ring r 9…13) looking WNW over the lake and the shore
  ausguck: { eye: [-11.5, 45.65, -4.75], yaw: 67.5, pitch: -9 },
  // the Sonnenacker at eye level, from the Hofladen gate looking west along the beds into the evening sun
  sonnenacker: { eye: [-229, 1.65, 47], look: [-262, 2.4, 60] },
  // dev: overviews (pit: the flooded pit with its far banks and the spoil heap, from high over the Werft)
  aerial: { eye: [260, 160, 300], look: [-60, -10, -40] },
  pit: { eye: [120, 240, 160], look: [-750, -20, -380] },
  // dev: into the slot from the dock edge east of the notch; down from the Kanzel 240 glass floor; over a lobe tip
  slot: { eye: [-9.5, 1.65, 105.6], look: [24, -26, 96] },
  kanzel: { eye: [-76.2, 1.65, 44], look: [-92, -66, 50] },
  lobe: { eye: [70, 26, 120], look: [52, -24, 92] },
  werft: { eye: [70, 1.65, 120], look: [140, 10, 0] },
  plaza: { eye: [0, 1.65, 30], yaw: 0, pitch: 0 },
  // dev: from the deck over the rim (the terrain's island set): west from the Sensordom's gate, north-west at the Regelgarten
  deckwest: { eye: [-60, 1.65, 8], look: [-400, 0, -40] },
  // dev: the plaza's view of the Regelgarten (its exterior tier, 86 m from its plot)
  plazarg: { eye: [0, 1.65, 30], look: [-40, 3, -69] },
  decknw: { eye: [-36, 1.65, -58], look: [-500, 6, -700] },
  title: { eye: [-65, 26, 178], look: [0, -8, 0] },
  top: { eye: [-60, 160, 60], look: [-60, 0, 59.9] },
  // the lift-off's outside shots (ground C1 at h 12, t 28; slab-top C2 at h 430, t 76)
  // the slot at the Dunkelfabrik's arm (bearing 150) from the yard, and the bridge from the side
  // from the Kielraum catwalk (−36) out through the smoked shell to the dock wall's depth ticks
  kiel: { eye: [0, -34.3, 11], look: [10, -30, 100], keep: true },
  // the shore walk above the mining benches, the lake WNW; the Werft from the yard south-east
  shore: { eye: [-445, 3.5, -118], look: [-560, -14, -140] },
  // dev: the Seeblick over the sailing club's jetty
  jetty: { eye: [-529, -9, -214], look: [-582, -19.5, -212] },
  south: { eye: [0, 1.65, 124], yaw: 180, pitch: 2 },
  armview: { eye: [62, 6, 106], look: [52, -3, 90] },
  bridgeside: { eye: [16, 7, 124], look: [0, -1, 108] },
  c1: { shot: 'C1', h: 12, t: 28, keep: true },
  c2: { shot: 'C2', h: 430, t: 76, keep: true },
};
const views = list(args.views, ['bridgehead', 'ausguck', 'sonnenacker']);
const query = [`skipIntro=1`, `quality=${quality}`, `lang=${args.lang ?? 'de'}`, args.lookdev ? 'lookdev=1' : null, 'mute=1'].filter(Boolean).join('&');

fs.mkdirSync(out, { recursive: true });
const srv = await gameServer(args);
const browser = await launchChromium();
let code = 0;
try {
  const { page, ctx, errors } = await openGame(browser, `${srv.url}/?${query}`, { width: W, height: H, instrument: false });
  await page.waitForFunction(() => window.__academy.ext('ground')?.().stage === 'ring', null, { timeout: 60000, polling: 200 });
  await page.evaluate(() => {
    // the stills show the world only
    for (const el of document.querySelectorAll('body > *')) if (!el.querySelector('canvas#game') && el.id !== 'game') el.style.visibility = 'hidden';
    for (const el of document.querySelectorAll('#app > *')) if (el.tagName !== 'CANVAS') el.style.visibility = 'hidden';
  });
  if (args.fog) await page.evaluate((d) => window.__academy.game.env.set({ fogDensity: d }), Number(args.fog));
  for (const code of [].concat(args.eval ?? []).map(String)) await page.evaluate(`(async () => { ${code} })()`);
  for (const name of views) {
    const v = VIEWS[name];
    if (!v) throw new Error(`unknown view ${name} (${Object.keys(VIEWS).join(', ')})`);
    await page.evaluate(async (v) => {
      const A = window.__academy;
      const G = A.game;
      // outside shots of the lift-off: the ground moves (WP4's fan-out), the camera is the ground's C1 / C2 pose
      if (v.shot) {
        A.ext('frames')('set', v.h);
        const c = A.ext('ground:camera')(v.shot, v.h, v.t);
        v = { eye: c.position, look: c.lookAt };
      }
      const cam = G.camera;
      const P = cam.position.constructor;
      const probe = new cam.constructor();
      probe.position.set(...v.eye);
      if (v.look) probe.lookAt(new P(...v.look));
      else probe.rotation.set((v.pitch * Math.PI) / 180, (v.yaw * Math.PI) / 180, 0, 'YXZ');
      probe.updateMatrixWorld();
      G.player.cameraOverride = { position: probe.position.clone(), quaternion: probe.quaternion.clone(), blend: 1 };
      // the player stands under the camera, so the tiers, the pit and the shadows follow the view
      if (!v.keep) G.player.teleport(new P(v.eye[0], Math.max(0, v.eye[1] - 1.65), v.eye[2]));
    }, v);
    await page.evaluate(() => window.__academy.waitFrames(90));
    const file = path.join(out, `${name}.png`);
    await page.screenshot({ path: file });
    const info = await page.evaluate(() => window.__academy.renderInfo());
    console.log(`${name.padEnd(12)} ${path.relative(ROOT, file)}  ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)} k triangles`);
  }
  if (errors.length) {
    console.log(`page errors:\n  ${errors.slice(0, 6).join('\n  ')}`);
    code = 1;
  }
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
process.exit(code);
