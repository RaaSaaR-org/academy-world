#!/usr/bin/env node
// Brand check (docs/ART-V2.md §2.6, §5.7): from the Messpunkt (the spawn eye) the tower's Recamán
// sculpture must land on the brand colours. Pixel test on screenshots at 1920×1080:
//   - 5 disc points (between strokes): every channel within ±4/255 of #141414
//   - 5 stroke centres (lit mark, ring and arc 17): every channel within ±6/255 of #FF6700
//   - halo: the mean of a 4 px band just outside the ring, lit vs ghost, rises ≤ 6/255 (no glow)
// Uses the tower's debug hooks logo-0 / logo-18 (__academy.solve('world', …)); the HUD is hidden.
//
//   node tools/brand-check.mjs [--base http://localhost:5173] [--out artifacts/brand-check]
//
// Exit 1 on a failed sample. Also called by tools/shots-all.mjs with its own browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, launchBrowser, parseArgs, startServer } from './lib/shotlib.mjs';
import { decodePng } from './lib/png.mjs';

const ORANGE = [255, 103, 0];
const DISC = [20, 20, 20];

/** run the check on an open browser; returns { ok, rows, notes } */
export async function brandCheck(browser, base, outDir) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const notes = [];
  const rows = [];
  try {
    await page.goto(`${base}/?reset=1&skipIntro=1&lang=de`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 90000, polling: 200 });
    await page.waitForTimeout(2500);
    const hooks = await page.evaluate(() => window.__academy.debugActions());
    if (!hooks.includes('world:logo-18') || !hooks.includes('world:logo-0')) {
      notes.push('tower hooks logo-0 / logo-18 missing: skipped');
      return { ok: true, skipped: true, rows, notes };
    }
    // the Messpunkt: spawn feet, eye on the sculpture centre; HUD off
    await page.evaluate(() => {
      const a = window.__academy;
      a.teleport([0, 0, 94.5]);
      a.game.hud.setPlaying(false);
    });
    await page.waitForTimeout(800);
    // where the mark is: the tower's logo-geom hook (Phase 5 relief: one plane), else the rc2 plane
    const geom = hooks.includes('world:logo-geom') ? await page.evaluate(() => window.__academy.solve('world', 'logo-geom')) : { center: [0, 24, 12.4], radius: 10.5 };
    notes.push(`mark centre ${geom.center.map((v) => +v.toFixed(2)).join(', ')}, R ${geom.radius}`);
    await page.evaluate((c) => window.__academy.lookAt(c[0], c[1], c[2]), geom.center);
    const shoot = async (hook, name) => {
      await page.evaluate((h) => window.__academy.solve('world', h), hook);
      await page.waitForTimeout(900);
      const buf = await page.screenshot();
      if (outDir) fs.writeFileSync(path.join(outDir, `${name}.png`), buf);
      return decodePng(buf);
    };
    const ghost = await shoot('logo-0', 'ghost');
    const lit = await shoot('logo-18', 'lit');
    // canonical mark points (SVG units, +y up) → world in the mark plane (tube centres; the disc
    // samples land on the dial face behind it, between the strokes)
    const pts = await page.evaluate((geom) => {
      const cam = window.__academy.game.camera;
      const V = cam.position.constructor;
      const R = geom.radius,
        s = R / 400,
        [cx, cy, zs] = geom.center;
      const proj = (u, v) => {
        const p = new V(cx + u * s, cy + v * s, zs).project(cam);
        return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
      };
      const deg = Math.PI / 180;
      const ring = [0, 20, -20, 180, 160].map((a) => ({ kind: 'stroke', name: `ring ${a}°`, at: proj(375 * Math.cos(a * deg), 375 * Math.sin(a * deg)) }));
      const arc17 = { kind: 'stroke', name: 'arc 17 apex', at: proj(255, 120) };
      const disc = [
        [330, 0],
        [-330, 0],
        [300, 150],
        [-300, 150],
        [-300, -150],
      ].map(([u, v]) => ({ kind: 'disc', name: `disc (${u}, ${v})`, at: proj(u, v) }));
      // halo band: 4 px outside the ring's outer edge, 48 samples
      const c = proj(0, 0);
      const e = proj(375 + 8, 0);
      const rPx = Math.hypot(e[0] - c[0], e[1] - c[1]);
      const band = Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        return [c[0] + Math.cos(a) * (rPx + 4), c[1] - Math.sin(a) * (rPx + 4)];
      });
      return { samples: [...ring.slice(0, 4), arc17, ...disc], band, ringPx: rPx };
    }, geom);
    notes.push(`ring radius on screen ≈ ${pts.ringPx.toFixed(1)} px`);
    let ok = true;
    for (const smp of pts.samples) {
      const ref = smp.kind === 'disc' ? DISC : ORANGE;
      const tol = smp.kind === 'disc' ? 4 : 6;
      // the pixel nearest to the reference within 1.5 px (thin strokes: anti-aliasing)
      let best = null,
        bd = Infinity;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = lit.px(smp.at[0] + dx, smp.at[1] + dy);
          const d = Math.max(...c.map((v, i) => Math.abs(v - ref[i])));
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
      const pass = bd <= tol;
      ok &&= pass;
      rows.push({ name: smp.name, kind: smp.kind, at: smp.at.map((v) => Math.round(v)), rgb: best, maxDiff: bd, tol, pass });
    }
    const mean = (img) => pts.band.reduce((sum, p) => sum + img.px(p[0], p[1]).reduce((a, b) => a + b, 0) / 3, 0) / pts.band.length;
    const rise = mean(lit) - mean(ghost);
    const haloPass = rise <= 6;
    ok &&= haloPass;
    rows.push({ name: 'halo band (lit − ghost mean)', kind: 'halo', rise: Math.round(rise * 10) / 10, tol: 6, pass: haloPass });
    return { ok, rows, notes };
  } finally {
    await page.close().catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, String(args.out ?? 'artifacts/brand-check'));
  fs.mkdirSync(outDir, { recursive: true });
  let server = null,
    browser = null,
    res = { ok: false, rows: [], notes: ['did not run'] };
  try {
    const base = args.base ? String(args.base).replace(/\/$/, '') : (server = await startServer()).url;
    browser = await launchBrowser();
    res = await brandCheck(browser, base, outDir);
  } catch (err) {
    res.notes.push(String(err));
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
  for (const r of res.rows) console.log(`${r.pass ? 'OK  ' : 'FAIL'} ${r.name.padEnd(28)} ${r.kind === 'halo' ? `rise ${r.rise}/255 (≤ ${r.tol})` : `rgb(${r.rgb}) Δmax ${r.maxDiff} (≤ ${r.tol}) @ ${r.at}`}`);
  for (const n of res.notes) console.log('note:', n);
  fs.writeFileSync(path.join(outDir, 'brand-check.json'), JSON.stringify(res, null, 2));
  console.log(res.ok ? 'OK   brand check passed' : 'FAIL brand check');
  process.exit(res.ok ? 0 : 1);
}
