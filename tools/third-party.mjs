#!/usr/bin/env node
// No request may leave the page's origin, and 3D text must render without the internet (promoted
// from the phase 6 ux-browsers-a11y audit, net.mjs + cdnblock3.mjs). Plan item C1.
//
//   node tools/third-party.mjs [--dev | --dist <dir> | --base <url>] [--langs de,en]
//
// 1. Title, then the hub and every area with code (loadAll, then a teleport and 2.5 s each) per
//    language: every request to a host other than the page origin is listed. Requests from
//    dedicated workers are included (troika resolves fallback fonts in one; the MuJoCo duck runs in
//    one, [C1 m10]): a canary blob worker fetches another origin first and the harness must see it.
//    Target 0.
// 3. locateFile ([C1 m10]): every `locateFile` in src/ (the wasm loaders: Rapier, MuJoCo) must not
//    name an absolute http(s) URL (the wasm comes from the page's own origin).
// 2. The same build with every other origin blocked: every troika text must still lay out (a
//    text whose fallback font cannot load renders nothing), including the Greek ones (σ on the
//    Sensordom sign). A screenshot of the first non-Latin text goes to artifacts/<PT_DIR|measure>/.
// Deterministic, so one run. Exit 1 on a third-party request or a text that failed to render.
import fs from 'node:fs';
import path from 'node:path';
import { Verdict, gameServer, launchChromium, parseArgs, saveJson, list, ROOT } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const langs = list(args.langs, ['de', 'en']);
const CANARY = 'http://127.0.0.1:9/__third-party-canary';

const v = new Verdict('third-party');
const out = { external: {}, blocked: {} };
const srv = await gameServer(args, { prefer: 'dev' });
const origin = new URL(srv.url).origin;
const isExternal = (u) => /^(https?|wss?):/.test(u) && new URL(u).origin !== origin;
const browser = await launchChromium();
const waitZones = (page) =>
  page.waitForFunction(() => (window.__academy.zones() || []).every((z) => z.status !== 'pending' && z.status !== 'loading' && z.status !== 'loaded'), null, { timeout: 120000, polling: 250 }).catch(() => {});
try {
  // ── 1: third-party requests over the title and the island ──
  for (const lang of langs) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const reqs = [];
    const t0 = Date.now();
    let canarySeen = false;
    ctx.on('request', (r) => {
      if (r.url() === CANARY) canarySeen = true;
      else if (isExternal(r.url())) reqs.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${r.frame?.() ? '' : '[worker] '}${r.url()}`);
    });
    const page = await ctx.newPage();
    await page.goto(`${srv.url}/?reset=1&lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000, polling: 200 });
    await page.waitForTimeout(3000);
    const atTitle = reqs.length;
    // the canary: a dedicated worker's request to another origin must be seen by the harness
    await page.evaluate((u) => {
      const w = new Worker(URL.createObjectURL(new Blob([`fetch(${JSON.stringify(u)}).catch(() => {})`], { type: 'text/javascript' })));
      setTimeout(() => w.terminate(), 3000);
    }, CANARY);
    await page.waitForTimeout(800);
    v.require(`${lang}: the harness sees dedicated-worker requests (canary)`, canarySeen);
    await page.evaluate(() => typeof window.__academy.loadAll === 'function' && window.__academy.loadAll());
    await page.evaluate(() => window.__academy.start());
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    await page.waitForTimeout(2000);
    await waitZones(page);
    const places = ['hub', ...(await page.evaluate(() => window.__academy.manifests('all').filter((m) => m.hasCode && !m.id.startsWith('_')).map((m) => m.id)))];
    for (const z of places) {
      await page.evaluate((z) => window.__academy.teleport(z), z);
      await page.waitForTimeout(2500);
    }
    out.external[lang] = { atTitle, places, all: reqs };
    console.log(`${lang}: ${reqs.length} third-party requests (${atTitle} by the title; places ${places.join(', ')})${reqs.length ? '\n  ' + reqs.slice(0, 12).join('\n  ') : ''}`);
    v.check(`${lang}: third-party requests (title + hub + ${places.length - 1} areas, workers included)`, reqs.length, '<=', 0);
    await ctx.close();
  }

  // ── 2: 3D text with every other origin blocked ──
  for (const lang of langs) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.route('**/*', (route) => (isExternal(route.request().url()) ? route.abort('blockedbyclient') : route.continue()));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(`${srv.url}/?skipIntro=1&reset=1&lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000, polling: 200 });
    // every area (sites too), so their texts are checked as well
    await page.evaluate(async () => typeof window.__academy.loadAll === 'function' && (await window.__academy.loadAll()));
    await waitZones(page);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      const texts = [];
      window.__academy.game.rs.scene.traverse((o) => {
        if (o.isMesh && typeof o.text === 'string' && typeof o.sync === 'function') texts.push(o);
      });
      await Promise.all(texts.map((t) => new Promise((res) => {
        try {
          t.sync(res);
        } catch {
          res();
        }
        setTimeout(res, 10000);
      })));
      await new Promise((res) => setTimeout(res, 1500));
      const exotic = /[^\u0000-ÿĀ-ſ‐-‧‰-⁞←-↓€−]/;
      const failed = texts.filter((t) => t.text.trim() && !t.textRenderInfo);
      const ex = texts.filter((t) => exotic.test(t.text));
      const shown = (o) => {
        for (let q = o; q; q = q.parent) if (!q.visible) return false;
        return true;
      };
      // the screenshot needs a text that is on display right now (some signs appear later)
      const first = ex.find((t) => t.textRenderInfo && shown(t));
      let at = null;
      if (first) {
        const p = first.getWorldPosition(new first.position.constructor());
        const q = first.getWorldQuaternion(new first.quaternion.constructor());
        const n = new first.position.constructor(0, 0, 1).applyQuaternion(q);
        at = { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z], text: first.text.slice(0, 40) };
      }
      const hidden = ex.filter((t) => !shown(t)).map((t) => t.text.slice(0, 40));
      return {
        total: texts.length,
        failed: failed.length,
        failedSamples: [...new Set(failed.map((t) => t.text.slice(0, 40)))].slice(0, 20),
        exoticTexts: ex.length,
        exoticRendered: ex.filter((t) => t.textRenderInfo).length,
        exoticChars: [...new Set(ex.flatMap((t) => [...t.text].filter((c) => exotic.test(c))))].join(''),
        notOnDisplay: hidden,
        at,
      };
    });
    if (r.at) {
      // look at the first non-Latin text from 2.5 m in front of it
      const [x, y, z] = r.at.p;
      const [nx, , nz] = r.at.n;
      const d = Math.hypot(nx, nz) || 1;
      r.view = await page.evaluate(async ([fx, fz, x, y, z]) => {
        window.__academy.teleport([fx, 0, fz]);
        await new Promise((res) => setTimeout(res, 400));
        window.__academy.lookAt(x, y, z);
        window.__academy.game.hud.root.style.visibility = 'hidden';
        await window.__academy.waitFrames(3);
        const g = window.__academy.game;
        g.camera.updateMatrixWorld();
        const v = new g.camera.position.constructor(x, y, z).project(g.camera);
        return { player: window.__academy.state().player.pos, screen: [Math.round(((v.x + 1) / 2) * innerWidth), Math.round(((1 - v.y) / 2) * innerHeight)] };
      }, [x + (nx / d) * 3.5, z + (nz / d) * 3.5, x, y, z]);
      await page.waitForTimeout(1200);
      r.shot = path.join(ROOT, 'artifacts', process.env.PT_DIR || 'measure', `third-party-blocked-${lang}.png`);
      await page.screenshot({ path: r.shot });
    }
    r.errors = errors;
    out.blocked[lang] = r;
    console.log(`${lang} (other origins blocked): ${r.total} 3D texts, ${r.failed} failed${r.failed ? ' e.g. ' + JSON.stringify(r.failedSamples.slice(0, 5)) : ''}; non-Latin ${r.exoticRendered}/${r.exoticTexts} laid out (${r.exoticChars})${r.notOnDisplay.length ? `, not on display yet: ${JSON.stringify(r.notOnDisplay)}` : ''}${r.shot ? ' · shot ' + r.shot : ''}`);
    v.check(`${lang}: 3D texts that fail with other origins blocked`, r.failed, '<=', 0);
    v.check(`${lang}: non-Latin 3D texts not rendered`, r.exoticTexts - r.exoticRendered, '<=', 0);
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}

// ── 3: locateFile in the sources names no absolute URL ──
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|js|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const hits = [];
  for (const f of walk(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/locateFile/g)) {
      const around = src.slice(m.index, m.index + 300);
      hits.push({ file: path.relative(ROOT, f), absolute: /https?:\/\//.test(around), text: around.split('\n').slice(0, 3).join(' ').slice(0, 160) });
    }
  }
  out.locateFile = hits;
  console.log(`locateFile in src/: ${hits.length ? hits.map((h) => `${h.file}${h.absolute ? ' (ABSOLUTE URL)' : ''}`).join(', ') : 'none (no wasm loader with locateFile yet)'}`);
  v.check('locateFile naming an absolute http(s) URL', hits.filter((h) => h.absolute).length, '<=', 0);
}
saveJson('third-party.json', out);
v.exit(args);
