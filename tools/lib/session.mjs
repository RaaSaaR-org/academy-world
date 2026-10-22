// Playtest session helper (tools/playtest.mjs, tools/perf.mjs): one server, one browser, one page.
// By default it builds a PRIVATE copy of the production bundle and serves it with `vite preview`,
// so source edits during a long run cannot reload the page. PT_DEV=1 uses a private dev server
// instead; PT_BASE=<url> reuses a running server. PT_W / PT_H / PT_DPR set the viewport,
// PT_DIR the folder under artifacts/ (default "playtest").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, freePort, launchBrowser, startServer } from './shotlib.mjs';
import { loadAllAreas } from './measure.mjs';

/** Build a private copy of the production bundle and serve it (immune to source edits during the run). */
async function startPreview() {
  const { build, preview } = await import('vite');
  const outDir = path.join(os.tmpdir(), 'emai-academy-playtest', String(process.pid));
  await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', build: { outDir, emptyOutDir: true } });
  const port = await freePort();
  const server = await preview({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', build: { outDir }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  return { url: `http://127.0.0.1:${port}`, async close() { await new Promise((r) => server.httpServer.close(r)); fs.rmSync(outDir, { recursive: true, force: true }); } };
}

export async function session(name, fn, { base = process.env.PT_BASE, width = Number(process.env.PT_W || 1280), height = Number(process.env.PT_H || 720), dpr = Number(process.env.PT_DPR || 1) } = {}) {
  const outDir = path.join(ROOT, 'artifacts', process.env.PT_DIR || 'playtest', name);
  fs.mkdirSync(outDir, { recursive: true });
  let server = null;
  const url0 = base || (server = await (process.env.PT_DEV ? startServer() : startPreview())).url;
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  const errors = [];
  const warnings = [];
  const t0 = Date.now();
  const ts = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.on('console', (m) => {
    const t = m.text();
    if (/\[vite\]|GPU stall/i.test(t)) return;
    if (m.type() === 'error') { errors.push(`[${ts()}] ${t}`); console.log(`  !! console.error ${t.slice(0, 300)}`); }
    else if (m.type() === 'warning') { warnings.push(`[${ts()}] ${t}`); }
  });
  page.on('pageerror', (e) => { errors.push(`[${ts()}] PAGE ${e.stack || e}`); console.log(`  !! PAGE ERROR ${String(e.stack || e).slice(0, 400)}`); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  let shotN = 0;
  const api = {
    page, outDir, url0,
    async open(q) {
      await page.goto(url0 + q, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 90000, polling: 200 });
      // plan §5.6: `ready` = title up + the eager set; a playtest needs every area (sites too)
      await loadAllAreas(page, 90000);
    },
    ev: (code) => page.evaluate(`(async () => { ${code} })()`),
    val: (expr) => page.evaluate(`(async () => (${expr}))()`),
    wait: (ms) => page.waitForTimeout(ms),
    frames: (n = 30) => page.evaluate((n) => window.__academy.waitFrames(n), n),
    async shot(label) {
      shotN++;
      const f = path.join(outDir, `${String(shotN).padStart(2, '0')}-${label}.png`);
      await page.screenshot({ path: f });
      return f;
    },
    async state(label = '') {
      const s = await page.evaluate(() => {
        const st = window.__academy.state();
        const ri = window.__academy.game.rs.info();
        return { zone: st.player.zone, pos: st.player.pos, objective: st.objective, status: st.status, operating: st.operating, modal: st.modal, infoCard: st.infoCard, dialogue: st.dialogue, stamps: st.stamps.length, toasts: st.toasts.slice(-3), fps: st.fps, calls: ri.calls, tris: ri.triangles };
      });
      console.log(`[${ts()}] ${label} ${JSON.stringify(s)}`);
      return s;
    },
    async panels() {
      // visible right-column cards / HUD DOM leaking
      return page.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
        const out = [];
        document.querySelectorAll('.zone-panel, [data-owner]').forEach((el) => { if (vis(el)) out.push((el.getAttribute('data-owner') || '') + ':' + (el.textContent || '').trim().slice(0, 50)); });
        return out;
      });
    },
    log: (...a) => console.log(`[${ts()}]`, ...a),
    errors, warnings,
  };
  try {
    await fn(api);
  } catch (err) {
    errors.push(`SCRIPT ${err && err.stack || err}`);
    console.log('SCRIPT ERROR', err);
    try { await api.shot('script-error'); } catch {}
  } finally {
    fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify({ errors, warnings }, null, 2));
    console.log(`== ${name}: ${errors.length} errors, ${warnings.length} warnings (${ts()} s)`);
    for (const w of [...new Set(warnings.map((w) => w.replace(/^\[[\d.]+\] /, '')))].slice(0, 30)) console.log('  warn:', w.slice(0, 200));
    await browser.close().catch(() => {});
    await server?.close().catch(() => {});
  }
  return { errors, warnings };
}
