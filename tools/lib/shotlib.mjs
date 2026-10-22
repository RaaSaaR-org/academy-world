// Shared helpers for tools/shot.mjs and tools/shots-all.mjs.
// Safe to run many times in parallel: every run gets its own free port, its own Vite
// dep-cache directory and its own browser instance.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    const next = argv[i + 1];
    const val = inline !== undefined ? inline : next !== undefined && !next.startsWith('--') ? (i++, next) : true;
    if (out[k] === undefined) out[k] = val;
    else out[k] = [].concat(out[k], val);
  }
  return out;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Remove per-run Vite caches whose owning process is gone (killed runs leave them behind). */
function sweepStaleCaches() {
  const dir = path.join(ROOT, 'node_modules', '.vite-shot');
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const pid = Number(name.split('-')[0]);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(pid, 0); // still running (or not ours to judge): keep
    } catch (err) {
      if (err && err.code === 'ESRCH') fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }
}

/** Start a private Vite dev server. Returns { url, close }. */
export async function startServer({ quiet = true } = {}) {
  const { createServer } = await import('vite');
  sweepStaleCaches();
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const port = await freePort();
    const cacheDir = path.join(ROOT, 'node_modules', '.vite-shot', `${process.pid}-${port}`);
    try {
      const server = await createServer({
        root: ROOT,
        configFile: path.join(ROOT, 'vite.config.ts'),
        cacheDir,
        logLevel: quiet ? 'error' : 'info',
        clearScreen: false,
        // hmr stays an object so the config's overlay: false survives (a full-screen Vite error overlay
        // from ANOTHER zone's broken import would otherwise cover the screenshot)
        server: { port, strictPort: true, host: '127.0.0.1', hmr: { overlay: false }, watch: null },
      });
      await server.listen();
      return {
        url: `http://127.0.0.1:${port}`,
        async close() {
          await server.close().catch(() => {});
          fs.rmSync(cacheDir, { recursive: true, force: true });
        },
      };
    } catch (err) {
      lastErr = err;
      fs.rmSync(cacheDir, { recursive: true, force: true });
      if (!/EADDRINUSE|address already in use/i.test(String(err && err.message))) break;
    }
  }
  throw lastErr;
}

function findCachedHeadlessShell() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const dirs = fs
    .readdirSync(cache)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const base = path.join(cache, d);
    for (const sub of fs.readdirSync(base)) {
      for (const exe of ['chrome-headless-shell', 'headless_shell', 'chrome-headless-shell.exe']) {
        const p = path.join(base, sub, exe);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

/**
 * Headless Chromium with real GPU (ANGLE Metal on macOS → ~60 fps).
 * SHOT_GPU=swiftshader forces the software path (CI / no GPU, ~30 fps).
 * SHOT_CHANNEL=chromium runs full Chromium in the new headless mode instead of the headless
 * shell: it grants pointer lock, so real mouse-look tests work (or use __academy.lookDelta()).
 */
export async function launchBrowser() {
  const { chromium } = await import('playwright');
  const soft = process.env.SHOT_GPU === 'swiftshader' || (process.platform !== 'darwin' && process.env.SHOT_GPU !== 'gpu');
  const args = soft ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
  args.push('--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling');
  // headless runs stay silent on the speakers (WebAudio still renders, so __academy.audioMeter works);
  // SHOT_AUDIO=1 lets you listen along
  if (process.env.SHOT_AUDIO !== '1') args.push('--mute-audio');
  const channel = process.env.SHOT_CHANNEL || undefined;
  try {
    return await chromium.launch({ args, channel });
  } catch (err) {
    if (channel) throw err;
    const exe = findCachedHeadlessShell();
    if (!exe) throw err;
    return await chromium.launch({ args, executablePath: exe });
  }
}

const IGNORED_CONSOLE = [/Download the React DevTools/i, /\[vite\] connect/i, /GPU stall due to ReadPixels/i];

/**
 * Load a URL, wait for the game, run evals, capture one or more views.
 * views: array of { yaw, pitch } (degrees) or null for the current view.
 * all (default true): after `ready`, force every area (sites too) through __academy.loadAll() and wait
 * for settledAll (plan §5.6: `ready` alone is the eager set; a build without loadAll is complete at ready).
 * reducedMotion: open the page with prefers-reduced-motion: reduce (a fresh profile takes it as its setting).
 */
export async function capture(browser, { url, out, wait = 2500, views = [null], evals = [], dumps = [], width = 1280, height = 720, timeout = 90000, all = true, reducedMotion = false }) {
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    const text = m.text();
    if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
    if (m.type() === 'error') consoleErrors.push(text);
    else if (m.type() === 'warning' && consoleWarnings.length < 40) consoleWarnings.push(text);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && (e.stack || e.message || e))));
  page.on('requestfailed', (r) => failedRequests.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });

  const result = { url, out, files: [], ok: false, consoleErrors, consoleWarnings, pageErrors, failedRequests, zones: null, state: null, fps: null, render: null, gl: null, ms: {} };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout, polling: 200 });
    result.ms.ready = Date.now() - t0;
    if (all && (await page.evaluate(() => typeof window.__academy.loadAll === 'function'))) {
      await page.evaluate(() => {
        void window.__academy.loadAll();
      });
      await page.waitForFunction(() => window.__academy.settledAll === true, null, { timeout, polling: 200 });
      result.ms.settledAll = Date.now() - t0;
    }
    for (const code of evals) {
      await page.evaluate(`(async () => { ${code} })()`);
    }
    await page.waitForTimeout(Number(wait));
    result.gl = await page.evaluate(() => {
      const c = document.querySelector('canvas#game');
      const gl = c && c.getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const ext = path.extname(out) || '.png';
    const base = out.slice(0, out.length - ext.length);
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      if (v) {
        await page.evaluate(([y, p]) => window.__academy.look(y, p), [v.yaw, v.pitch]);
        await page.evaluate(() => window.__academy.waitFrames(20));
      }
      const file = views.length > 1 ? `${base}-${i + 1}${ext}` : out;
      await page.screenshot({ path: file });
      result.files.push(file);
    }
    result.dumps = [];
    for (const expr of dumps) {
      try {
        result.dumps.push({ expr, value: await page.evaluate(`(async () => (${expr}))()`) });
      } catch (err) {
        result.dumps.push({ expr, error: String(err && err.message ? err.message : err) });
      }
    }
    result.fps = await page.evaluate(() => window.__academy.fps());
    // draw calls / triangles of the last frame (shadow + main + post passes)
    result.render = await page.evaluate(() => (window.__academy.renderInfo ? window.__academy.renderInfo() : null));
    result.zones = await page.evaluate(() => window.__academy.zones());
    result.state = await page.evaluate(() => window.__academy.state());
  } catch (err) {
    pageErrors.push(`[shot] ${err && err.message ? err.message : String(err)}`);
    try {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out });
      result.files.push(out);
    } catch {
      /* ignore */
    }
  }
  result.ms.total = Date.now() - t0;
  const zoneErrors = (result.zones || []).filter((z) => z.status === 'error');
  result.zoneErrors = zoneErrors;
  result.ok = pageErrors.length === 0 && zoneErrors.length === 0;
  await page.close();
  return result;
}

export function parseViews(s) {
  if (!s || s === true) return [null];
  return String(s)
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [yaw, pitch] = p.split(',').map(Number);
      return { yaw: yaw || 0, pitch: pitch || 0 };
    });
}
