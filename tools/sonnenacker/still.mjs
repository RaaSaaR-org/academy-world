#!/usr/bin/env node
// Sonnenacker stills (WP9; G-FARM, plan §6.6): renders named views of the farm from a production build
// (default: a private build; --dist <dir> reuses one, --dev runs the dev server) at 1920 × 1080, the HUD
// hidden, the ground's 2 m land loaded, the farm's life running (and, for 'day', the automated day).
//
//   node tools/sonnenacker/still.mjs [--views hero,beds,day,dashboard,aerial] [--out <dir>] [--dist <dir> | --dev]
//                                    [--width 1920 --height 1080] [--lang de] [--frames 120]
//
// Writes <out>/<view>.png (default artifacts/phase7/lookdev/sonnenacker/) and prints the draws and
// triangles of each frame. Views are in the farm's local frame (x north, z east; zone-local metres), so
// they follow the plot; `eye`/`look` heights are above the site's terrain plane.
import fs from 'node:fs';
import path from 'node:path';
import { gameServer, launchChromium, openGame, parseArgs, ROOT } from '../lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const W = Number(args.width ?? 1920),
  H = Number(args.height ?? 1080);
const out = path.resolve(ROOT, String(args.out ?? 'artifacts/phase7/lookdev/sonnenacker'));
const frames = Number(args.frames ?? 120);

/** eye / look in local (x, yAboveTerrain, z); `day`: start the automated day first; `t`: seconds to run before the shot */
const VIEWS = {
  hero: { eye: [-9.6, 3.6, 4.5], look: [2.5, 1.0, 40], t: 10 },
  vista: { eye: [-8.4, 2.1, 9.5], look: [-1.5, 1.1, 31], t: 12 },
  lane: { eye: [-8.7, 1.75, 12], look: [-4.5, 1.25, 30], t: 12 },
  island: { eye: [-9.2, 2.2, 2.5], look: [14, 3, 120], t: 10 },
  aisle: { eye: [-4.8, 1.7, 17], look: [-4.7, 1.0, 34], t: 12 },
  beds: { eye: [-2.4, 1.75, 16], look: [-1.0, 0.9, 40], t: 10 },
  day: { eye: [-8.4, 1.75, 47.6], look: [0, 0.9, 20], t: 12, day: true },
  arm: { eye: [-4.6, 1.55, 27.0], look: [-4.2, 1.2, 30.5], t: 10 },
  dashboard: { eye: [-10.5, 1.7, 60], look: [-17, 2.0, 66.4], t: 3 },
  aerial: { eye: [-30, 26, 70], look: [0, 0, 18], t: 4 },
};
const views = String(args.views ?? 'vista,lane,hero,island,aisle,beds,day,arm,dashboard,aerial').split(',');
for (const v of views) if (!VIEWS[v]) throw new Error(`unknown view ${v} (${Object.keys(VIEWS).join(', ')})`);

fs.mkdirSync(out, { recursive: true });
const srv = await gameServer(args);
const browser = await launchChromium();
let code = 0;
try {
  const { page, ctx, errors } = await openGame(browser, `${srv.url}/?area=sonnenacker&skipIntro=1&quality=${args.quality ?? 'high'}&lang=${args.lang ?? 'de'}&mute=1`, { width: W, height: H, instrument: false });
  await page.waitForFunction(() => window.__academy.ext('ground')?.().stage === 'ring', null, { timeout: 90000, polling: 200 });
  await page.waitForFunction(() => window.__academy.zones().some((z) => z.id === 'sonnenacker' && z.status === 'ready'), null, { timeout: 120000, polling: 200 });
  // into the farm (the robots load within 60 m of the plot), then wait for them
  await page.evaluate(() => window.__academy.teleport('sonnenacker'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__academy.press('KeyW', 1500));
  await page.waitForFunction(async () => (await window.__academy.solve('sonnenacker', 'state'))?.arms?.ready === true, null, { timeout: 60000, polling: 250 }).catch(() => console.log('note: the SO-101 did not load in time'));
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body > *')) if (!el.querySelector('canvas#game') && el.id !== 'game') el.style.visibility = 'hidden';
    for (const el of document.querySelectorAll('#app > *')) if (el.tagName !== 'CANVAS') el.style.visibility = 'hidden';
    window.__academy.closeModals?.();
  });
  for (const name of views) {
    const v = VIEWS[name];
    await page.evaluate(
      async ({ v }) => {
        const A = window.__academy;
        const G = A.game;
        const z = G.zones.records.get('sonnenacker');
        const c = z.ctx;
        const st = await A.solve('sonnenacker', 'state');
        const p = st.plane;
        const at = (q) => c.toWorld([q[0], p.h0 + p.gx * q[0] + p.gz * q[2] + q[1], q[2]]);
        const eye = at(v.eye),
          look = at(v.look);
        // the player stands under the camera (the tiers, the near arms and the shadows follow the view)
        G.player.teleport(eye.clone().setY(eye.y - 1.65));
        const cam = G.camera;
        const probe = new cam.constructor();
        probe.position.copy(eye);
        probe.lookAt(look);
        probe.updateMatrixWorld();
        G.player.cameraOverride = { position: probe.position.clone(), quaternion: probe.quaternion.clone(), blend: 1 };
        if (v.day && !st.c.run) await A.solve('sonnenacker', 'day');
      },
      { v },
    );
    await page.waitForTimeout(v.t * 1000);
    // labels and cards that appeared meanwhile stay out of the still too
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body > *')) if (!el.querySelector('canvas#game') && el.id !== 'game') el.style.visibility = 'hidden';
      for (const el of document.querySelectorAll('#app > *')) if (el.tagName !== 'CANVAS') el.style.visibility = 'hidden';
    });
    await page.evaluate((n) => window.__academy.waitFrames(n), frames);
    const file = path.join(out, `${name}.png`);
    await page.screenshot({ path: file });
    const info = await page.evaluate(() => window.__academy.renderInfo());
    console.log(`${name.padEnd(10)} ${path.relative(ROOT, file)}  ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)} k triangles`);
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
