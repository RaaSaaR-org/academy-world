#!/usr/bin/env node
// The stills tour's pictures (WP-D1, founder decision 3): renders the 12 stop poses of the 3D tour from a
// production build and writes public/discover/stills/<stop>-1280.webp and <stop>-720.webp (portrait 9:16,
// each ≤ 120 KB; the quality steps down until it fits). Weak phones show them instead of the 3D world.
//
//   node tools/discover/stills.mjs [--only dock,ausguck] [--dist <dir built with BASE_PATH=/academy-world/>]
//                                  [--out <dir>] [--max-kb 118]
//
// The build is served under /academy-world/ (tools/lib/devices.mjs) and opened with ?discover=1&stills=0
// &tier=full on the real GPU (Chromium); each stop is reached with handle.goto(id, { instant: true }) —
// the tour's own pre-roll (areas, robots, programs) — and the Discover layer is hidden for the picture.
// WebP is encoded by the browser (canvas.toBlob), so the tool needs no image library.
// Not a discover-check scenario (no `scenario` export): the runner never loads it.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, list, ROOT, launchChromium } from '../lib/measure.mjs';
import { BASE_PATH, buildSubpath, serveSubpath } from '../lib/devices.mjs';

const args = parseArgs(process.argv.slice(2));
const OUT = path.resolve(args.out && args.out !== true ? String(args.out) : path.join(ROOT, 'public', 'discover', 'stills'));
const MAX = Number(args['max-kb'] ?? 118) * 1024;
/** CSS viewport × device scale = the 1280 × 2276 render (9:16) */
const VIEW = { width: 640, height: 1138 };
const DPR = 2;
const WIDTHS = [1280, 720];

let build = null;
let dist = args.dist && args.dist !== true ? path.resolve(String(args.dist)) : null;
if (!dist) {
  build = await buildSubpath();
  dist = build.dir;
}
const server = await serveSubpath(dist, BASE_PATH);
const browser = await launchChromium();
fs.mkdirSync(OUT, { recursive: true });
const report = [];
let failed = 0;
try {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${server.url}?discover=1&stills=0&tier=full&dpr=${DPR}&fps=60&lang=de`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__discover && window.__discover.state().startCard, null, { timeout: 240000 });
  await page.addStyleTag({ content: '.dsc { visibility: hidden !important; }' });
  await page.evaluate(() => window.__discover.start());
  await page.waitForFunction(() => { const s = window.__discover.state(); return s.stop && !s.flying; }, null, { timeout: 240000 });
  const all = await page.evaluate(() => window.__discover.stops().map((s) => s.id));
  const ids = list(args.only, all);
  // an encoder page: PNG in, WebP out at a width and a quality
  const enc = await ctx.newPage();
  await enc.setContent('<canvas></canvas>');
  for (const id of ids) {
    await page.evaluate((id) => window.__discover.handle.goto(id, { instant: true }), id);
    await page.waitForFunction((id) => { const s = window.__discover.state(); return s.stop === id && !s.flying; }, id, { timeout: 180000 });
    // the areas' level of detail, late robots and textures settle
    await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const png = (await page.screenshot({ type: 'png' })).toString('base64');
    for (const w of WIDTHS) {
      const out = await enc.evaluate(
        async ({ png, w, max }) => {
          const img = new Image();
          img.src = `data:image/png;base64,${png}`;
          await img.decode();
          const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
          const c = document.querySelector('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d');
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, w, h);
          const blob = (q) => new Promise((r) => c.toBlob(r, 'image/webp', q));
          let q = 0.84;
          let b = await blob(q);
          while (b.size > max && q > 0.3) {
            q = Math.round((q - 0.06) * 100) / 100;
            b = await blob(q);
          }
          const bytes = new Uint8Array(await b.arrayBuffer());
          let s = '';
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return { b64: btoa(s), q, size: b.size, h, type: b.type };
        },
        { png, w, max: MAX },
      );
      if (out.type !== 'image/webp') throw new Error(`this browser cannot encode WebP (${out.type})`);
      const file = path.join(OUT, `${id}-${w}.webp`);
      fs.writeFileSync(file, Buffer.from(out.b64, 'base64'));
      const ok = out.size <= 120 * 1024;
      if (!ok) failed++;
      report.push({ id, w, h: out.h, kb: Math.round(out.size / 102.4) / 10, q: out.q });
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${path.relative(ROOT, file)} ${w}×${out.h} ${(out.size / 1024).toFixed(1)} KB (q ${out.q})`);
    }
  }
  if (errors.length) {
    console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    failed++;
  }
} finally {
  await browser.close();
  await server.close();
  build?.cleanup();
}
fs.mkdirSync(path.join(ROOT, 'artifacts', 'discover'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts', 'discover', 'stills.json'), JSON.stringify({ made: new Date().toISOString(), view: VIEW, dpr: DPR, report }, null, 1));
process.exit(failed ? 1 : 0);
