#!/usr/bin/env node
// WCAG contrast of every visible HUD/menu text over the live WebGL scene (promoted from the phase 6
// ux-browsers-a11y audit, contrast.mjs). Plan item C7.
//
//   node tools/contrast.mjs [--dev | --dist <dir> | --base <url>] [--shots]
//
// 11 screens (title, arrival, plaza, pause settings + controls, Pass, map, zone entry, after a
// solve, an info card, the result banner) in Chromium at 1280×720, DPR 1. The background of each
// text is what is really behind it: a screenshot of the same frame with all text made transparent
// (scene, gradients, glass and blur as the player sees them), sampled on a 6×3 grid in the text
// box; the worst sample counts.
// Targets: 0 texts under 18 px below 4.5:1; compass labels and the EN switch ≥ 4.5:1.
// Deterministic, so one run. Writes artifacts/<PT_DIR|measure>/contrast.json (+ screenshots with --shots).
import path from 'node:path';
import fs from 'node:fs';
import { Verdict, gameServer, launchChromium, loadAllAreas, parseArgs, saveJson, ROOT } from './lib/measure.mjs';
import { decodePng } from './lib/png.mjs';

const args = parseArgs(process.argv.slice(2));
const shotDir = path.join(ROOT, 'artifacts', process.env.PT_DIR || 'measure', 'contrast');
if (args.shots) fs.mkdirSync(shotDir, { recursive: true });

/** In-page: every visible text element with its text box, colour and effective opacity. */
const COLLECT = () => {
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const text = n.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || el.closest('svg')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rr = range.getBoundingClientRect();
    // only the part not clipped away by an `overflow` ancestor is on screen (the compass strip renders
    // its letters for −360…720° and clips them to the band)
    let [l, t, rgt, btm] = [rr.left, rr.top, rr.right, rr.bottom];
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const c = a.getBoundingClientRect();
      if (s.overflowX !== 'visible') (l = Math.max(l, c.left)), (rgt = Math.min(rgt, c.right));
      if (s.overflowY !== 'visible') (t = Math.max(t, c.top)), (btm = Math.min(btm, c.bottom));
    }
    const r = { left: l, top: t, right: rgt, bottom: btm, width: rgt - l, height: btm - t };
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    let op = 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      op *= Number(s.opacity);
      if (s.display === 'none' || s.visibility === 'hidden') op = 0;
    }
    if (op < 0.1) continue;
    const fg = parse(cs.color);
    if (!fg || fg[3] === 0) continue;
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    out.push({
      text: text.slice(0, 50),
      sel: (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''),
      color: cs.color,
      fg: [fg[0], fg[1], fg[2], fg[3] * op],
      size,
      weight: cs.fontWeight,
      opacity: Math.round(op * 100) / 100,
      large: size >= 24 || (bold && size >= 18.66),
      disabled: !!el.closest('button:disabled,[aria-disabled=true]'),
      compass: !!el.closest('#compass'),
      lang: !!el.closest('.lang-toggle'),
      box: [r.left, r.top, r.width, r.height],
    });
  }
  return out;
};

// Hide all text (keep every box, border, gradient, blur and the 3D scene) for the background shot.
const HIDE_TEXT = `*, *::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; transition: none !important; }`;

const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3]));

/**
 * Text colour against the pixels really behind it: a screenshot of the same frame with every text
 * made transparent, sampled on a 6×3 grid in the text box (the worst sample counts). This sees the
 * scene, gradients, glass and backdrop blur exactly as the player does.
 */
async function measureScreen(page) {
  const rows = await page.evaluate(COLLECT);
  const tag = await page.addStyleTag({ content: HIDE_TEXT });
  await page.waitForTimeout(80);
  const png = decodePng(await page.screenshot({ type: 'png' }));
  await tag.evaluate((n) => n.remove());
  for (const r of rows) {
    const [x0, y0, w, h] = r.box;
    const ratios = [];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        const x = Math.min(png.width - 1, Math.max(0, x0 + ((i + 0.5) / 6) * w));
        const y = Math.min(png.height - 1, Math.max(0, y0 + ((j + 0.5) / 3) * h));
        const bg = png.px(x, y);
        ratios.push(ratio(over(r.fg, bg), bg));
      }
    ratios.sort((a, b) => a - b);
    r.worst = Math.round(ratios[0] * 100) / 100;
    r.median = Math.round(ratios[9] * 100) / 100;
    r.need = r.large ? 3 : 4.5;
    r.fail = !r.disabled && r.worst < r.need;
    delete r.fg;
  }
  return rows;
}

const results = {};
const v = new Verdict('contrast');
const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  const grab = async (label) => {
    await page.waitForTimeout(700);
    const rows = await measureScreen(page);
    if (args.shots) await page.screenshot({ path: path.join(shotDir, `${label}.png`) });
    results[label] = rows;
    const fails = rows.filter((r) => r.fail);
    console.log(`${label.padEnd(16)} ${String(rows.length).padStart(3)} texts, ${fails.length} below AA`);
    for (const f of fails.slice(0, 12)) console.log(`   ${String(f.worst).padStart(5)} need ${f.need}  ${f.size}px ${f.color}  ${f.sel}  "${f.text}"`);
  };
  await page.goto(`${srv.url}/?reset=1&lang=de&mode=entdecker`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__academy && window.__academy.ready && window.__academy.game.phase === 'start', null, { timeout: 180000, polling: 200 });
  // every area (sites too): `ready` is only the eager set (plan §5.6)
  await loadAllAreas(page);
  await page.waitForTimeout(1500);
  await grab('title');
  await page.evaluate(() => window.__academy.start());
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(3000);
  await grab('hud-arrival');
  await page.evaluate(() => {
    window.__academy.teleport([0, 0, 30]);
    window.__academy.look(0, 0);
  });
  await page.waitForTimeout(1500);
  await grab('hud-plaza');
  await page.evaluate(() => window.__academy.pause());
  await grab('pause-settings');
  await page.click('.modal.pause .tabs button:nth-child(2)').catch(() => {});
  await grab('pause-controls');
  await page.evaluate(() => window.__academy.closeModals());
  await page.evaluate(() => window.__academy.openPass());
  await grab('pass');
  await page.evaluate(() => window.__academy.closeModals());
  await page.evaluate(() => window.__academy.toggleMap());
  await grab('map');
  await page.evaluate(() => window.__academy.closeModals());
  await page.evaluate(() => window.__academy.teleport('sensordom'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__academy.press('KeyW', 1400));
  await page.waitForTimeout(2600);
  await grab('hud-zone-entry');
  await page.evaluate(() => window.__academy.solve('sensordom', 'solve-a'));
  await page.waitForTimeout(2500);
  await grab('after-solve-a');
  if (!(await page.evaluate(() => window.__academy.state().infoCard))) {
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(1200);
  }
  if (await page.evaluate(() => window.__academy.state().infoCard)) await grab('infocard');
  await page.evaluate(() => window.__academy.closeModals());
  await page.evaluate(() => window.__academy.juiceDemo());
  await grab('result-banner');
  results.errors = errors;
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}

const all = Object.entries(results).filter(([k]) => k !== 'errors').flatMap(([screen, rows]) => rows.map((r) => ({ screen, ...r })));
const small = all.filter((r) => r.size < 18 && r.fail);
const compass = all.filter((r) => r.compass);
const lang = all.filter((r) => r.lang && /^(EN|English)$/i.test(r.text));
console.log(`\n${all.length} text elements on ${Object.keys(results).length - 1} screens; ${all.filter((r) => r.fail).length} below AA, ${small.length} of them under 18 px`);
const minOf = (rows) => (rows.length ? Math.min(...rows.map((r) => r.worst)) : null);
v.check('texts under 18 px below 4.5:1', small.length, '<=', 0);
v.check('compass labels, worst', minOf(compass), '>=', 4.5, ':1');
v.check('EN language switch, worst', minOf(lang), '>=', 4.5, ':1');
v.check('page errors', results.errors?.length ?? 0, '<=', 0);
const f = saveJson('contrast.json', results);
console.log(`details: ${f}`);
v.exit(args);
