// Shared harness for the measurement tools (tools/load-matrix.mjs, perf-cpu.mjs, warmup.mjs, …).
// Promoted from the phase 6 audit scripts (artifacts/phase6/*/scripts) so every lane measures the
// same way: one private production build, a CDN-like or `vite preview` server, Chromium with a real
// GPU, per-frame instrumentation, medians over repeated runs and a pass/fail verdict.
//
// Conventions shared by every tool built on this file:
//   --dist <dir>    measure an existing build (repeat it, or label it, for an A/B: --dist rc3=<dir>)
//   --runs <n>      repetitions per cell (default 3); the tool prints the median
//   --no-check      print the numbers but always exit 0
//   exit code 1     a target was missed (or the run failed), 0 otherwise
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import http2 from 'node:http2';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, freePort, parseArgs, startServer } from './shotlib.mjs';

export { ROOT, freePort, parseArgs, startServer };

// ───────────────────────────── numbers ─────────────────────────────

export function median(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function stats(arr) {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  const q = (p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
  const mean = a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  return { n: a.length, mean: round(mean), p50: round(q(0.5)), p90: round(q(0.9)), p95: round(q(0.95)), p99: round(q(0.99)), max: round(a[a.length - 1] ?? NaN) };
}

export const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);
export const range = (xs) => {
  const a = xs.filter((x) => x != null && Number.isFinite(x));
  return a.length ? `${round(Math.min(...a))}–${round(Math.max(...a))}` : '-';
};

// ───────────────────────────── verdict ─────────────────────────────

/**
 * Collects target checks and prints a PASS/FAIL table. `check('title cable×1', 1.42, '<=', 1.3, 's')`.
 * A null/NaN value counts as a miss (the metric could not be measured).
 */
export class Verdict {
  constructor(tool) {
    this.tool = tool;
    this.rows = [];
    this.notes = [];
  }
  check(name, value, op, target, unit = '') {
    const ok = value != null && Number.isFinite(value) && (op === '<=' ? value <= target : op === '>=' ? value >= target : op === '<' ? value < target : op === '>' ? value > target : value === target);
    this.rows.push({ name, value, op, target, unit, ok });
    return ok;
  }
  /** A boolean requirement (e.g. "the hint is visible"). */
  require(name, ok, detail = '') {
    this.rows.push({ name, value: ok ? 'yes' : 'no', op: '=', target: 'yes', unit: detail ? ` (${detail})` : '', ok: !!ok });
    return !!ok;
  }
  note(s) {
    this.notes.push(s);
  }
  get failed() {
    return this.rows.filter((r) => !r.ok);
  }
  print() {
    console.log(`\n── ${this.tool}: targets ──`);
    const w = Math.max(10, ...this.rows.map((r) => r.name.length));
    for (const r of this.rows) {
      const v = typeof r.value === 'number' ? round(r.value) : r.value ?? 'n/a';
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(w)}  ${String(v).padStart(8)}${r.unit}  (target ${r.op} ${r.target}${typeof r.target === 'number' ? r.unit : ''})`);
    }
    for (const n of this.notes) console.log(`note  ${n}`);
    const f = this.failed.length;
    console.log(f ? `${f} of ${this.rows.length} targets missed` : `all ${this.rows.length} targets met`);
  }
  /** Print and exit: 1 when a target was missed, unless --no-check was given. */
  exit(args = {}) {
    this.print();
    const code = this.failed.length && !args['no-check'] ? 1 : 0;
    process.exit(code);
  }
}

// ───────────────────────────── builds ─────────────────────────────

/** Build a private copy of the production bundle (never dist/). Returns { dir, cleanup }. */
export async function buildDist({ outDir } = {}) {
  const { build } = await import('vite');
  const dir = outDir ? path.resolve(outDir) : path.join(os.tmpdir(), 'emai-academy-measure', `${process.pid}-${Date.now()}`);
  if (path.resolve(dir) === path.join(ROOT, 'dist')) throw new Error('refusing to build into dist/');
  const t0 = Date.now();
  await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
  console.log(`built ${path.relative(ROOT, dir).startsWith('..') ? dir : path.relative(ROOT, dir)} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { dir, cleanup: () => (outDir ? null : fs.rmSync(dir, { recursive: true, force: true })) };
}

/**
 * --dist handling. Returns [{ label, dir }] — built on demand when no --dist was given.
 * `--dist a=<dir> --dist b=<dir>` labels builds for an A/B (runs interleave).
 */
export async function distsFromArgs(args) {
  const list = args.dist === undefined || args.dist === true ? [] : [].concat(args.dist).map(String);
  if (!list.length) {
    const b = await buildDist();
    process.on('exit', () => b.cleanup());
    return [{ label: 'head', dir: b.dir }];
  }
  return list.map((s, i) => {
    const m = s.match(/^([\w.-]+)=(.+)$/);
    const dir = path.resolve(m ? m[2] : s);
    if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`--dist ${dir}: no index.html`);
    return { label: m ? m[1] : list.length > 1 ? `b${i}` : 'dist', dir };
  });
}

// ───────────────────────────── servers ─────────────────────────────

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
// as the build's precompress plugin (vite.config.ts): robot GLBs and the ground's .bin heights travel as brotli too
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.wasm', '.svg', '.json', '.ttf', '.txt', '.glb', '.bin']);
export const CONTENT_TYPES = TYPES;

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}

let certCache = null;
/** A throwaway self-signed certificate for 127.0.0.1 (openssl CLI). Returns { key, cert, spki } or null. */
export function selfSignedCert() {
  if (certCache !== null) return certCache;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emai-cert-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '7', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
    const key = fs.readFileSync(path.join(dir, 'k.pem'));
    const cert = fs.readFileSync(path.join(dir, 'c.pem'));
    const x = new crypto.X509Certificate(cert);
    const spki = crypto.createHash('sha256').update(x.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    certCache = { key, cert, spki };
  } catch {
    certCache = null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return certCache;
}

/**
 * A CDN-like static server for a build folder, in-process: HTTPS + HTTP/2 (falls back to HTTP/1.1
 * when openssl is missing), brotli/gzip by Accept-Encoding (the build's own .br/.gz files when
 * present, otherwise brotli 11 / gzip 9 computed once up front), `immutable` on /assets/*,
 * `no-cache` on everything else, application/wasm. This is what README "Hosting" asks of a host.
 * Returns { url, spki, log, close }. `log` gets one entry per response.
 */
export async function serveCdn(dist, { compress = true, h2 = true } = {}) {
  const files = new Map();
  for (const f of walk(dist)) {
    const ext = path.extname(f);
    if (ext === '.br' || ext === '.gz') continue;
    const raw = fs.readFileSync(f);
    const e = { raw, ext };
    if (compress && COMPRESS.has(ext)) {
      e.br = fs.existsSync(f + '.br') ? fs.readFileSync(f + '.br') : zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      e.gz = fs.existsSync(f + '.gz') ? fs.readFileSync(f + '.gz') : zlib.gzipSync(raw, { level: 9 });
    }
    files.set('/' + path.relative(dist, f).split(path.sep).join('/'), e);
  }
  const log = [];
  const handler = (req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const e = files.get(p);
    if (!e) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ae = String(req.headers['accept-encoding'] ?? '');
    let body = e.raw;
    let enc = null;
    if (e.br && /\bbr\b/.test(ae)) (body = e.br), (enc = 'br');
    else if (e.gz && /\bgzip\b/.test(ae)) (body = e.gz), (enc = 'gzip');
    const h = { 'content-type': TYPES[e.ext] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', vary: 'Accept-Encoding' };
    if (enc) h['content-encoding'] = enc;
    log.push({ path: p, raw: e.raw.length, sent: body.length, enc });
    res.writeHead(200, h);
    res.end(body);
  };
  const tls = h2 ? selfSignedCert() : null;
  const server = tls ? http2.createSecureServer({ key: tls.key, cert: tls.cert, allowHTTP1: true }, handler) : http.createServer(handler);
  const port = await freePort();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `${tls ? 'https' : 'http'}://127.0.0.1:${port}`, spki: tls?.spki ?? null, log, close: () => new Promise((r) => server.close(() => r())) };
}

/** `vite preview` of a build folder with the project config (what `npm run preview` serves). */
export async function servePreview(dist) {
  const { preview } = await import('vite');
  const port = await freePort();
  const server = await preview({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist }, preview: { port, strictPort: true, host: '127.0.0.1', open: false } });
  return { url: `http://127.0.0.1:${port}`, spki: null, log: [], close: () => new Promise((r) => server.httpServer.close(() => r())) };
}

/** kind: 'cdn' | 'preview' */
export function serveDist(kind, dist) {
  if (kind === 'preview') return servePreview(dist);
  if (kind === 'cdn') return serveCdn(dist);
  if (kind === 'cdn-h1') return serveCdn(dist, { h2: false });
  throw new Error(`unknown server kind ${kind} (cdn | cdn-h1 | preview)`);
}

/**
 * The game server a UI tool runs against: --base <url> (a running server), --dev (a private dev
 * server, no build), or a private production build / --dist <dir> served by `vite preview`.
 * prefer: 'dev' makes the dev server the default (UI checks that need no production timing).
 */
export async function gameServer(args, { prefer = 'build' } = {}) {
  if (args.base && args.base !== true) return { url: String(args.base).replace(/\/$/, ''), spki: null, close: async () => {} };
  if (args.dev || (prefer === 'dev' && !args.dist)) return { ...(await startServer()), spki: null };
  const [d] = await distsFromArgs(args);
  return servePreview(d.dir);
}

// ───────────────────────────── browsers ─────────────────────────────

const PW_CACHE = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');

function cachedExecutable(prefix, names) {
  if (!fs.existsSync(PW_CACHE)) return null;
  const dirs = fs
    .readdirSync(PW_CACHE)
    .filter((d) => new RegExp(`^${prefix}-\\d+$`).test(d))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  for (const d of dirs) {
    for (const rel of names) {
      const p = path.join(PW_CACHE, d, rel);
      if (fs.existsSync(p)) return p;
    }
    // headless shell: <dir>/<platform>/<exe>
    for (const sub of fs.readdirSync(path.join(PW_CACHE, d))) for (const rel of names) if (fs.existsSync(path.join(PW_CACHE, d, sub, rel))) return path.join(PW_CACHE, d, sub, rel);
  }
  return null;
}

/**
 * Chromium with the real GPU (ANGLE Metal on macOS), muted, no background throttling.
 *   full: Chrome for Testing in the new headless mode (the perf-runtime audit used it; it paces
 *         frames like a desktop Chrome) instead of the headless shell.
 *   uncapped: vsync and the frame-rate limit off (GPU-bound A/B).
 *   spki: trust a self-signed certificate (serveCdn) so the HTTP cache behaves normally.
 * SHOT_GPU=swiftshader forces the software renderer.
 */
export async function launchChromium({ full = false, uncapped = false, spki = null, extra = [] } = {}) {
  const { chromium } = await import('playwright');
  const soft = process.env.SHOT_GPU === 'swiftshader' || (process.platform !== 'darwin' && process.env.SHOT_GPU !== 'gpu');
  const args = soft ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
  args.push('--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--mute-audio');
  if (uncapped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  if (spki) args.push(`--ignore-certificate-errors-spki-list=${spki}`);
  args.push(...extra);
  const exe = process.env.CHROME_EXE || null;
  if (exe) return chromium.launch({ args, executablePath: exe });
  try {
    return await chromium.launch({ args, channel: full ? 'chromium' : undefined });
  } catch (err) {
    const fallback = full
      ? cachedExecutable('chromium', ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win64/chrome.exe'])
      : cachedExecutable('chromium_headless_shell', ['chrome-headless-shell', 'headless_shell', 'chrome-headless-shell.exe']);
    if (!fallback) throw err;
    return chromium.launch({ args, executablePath: fallback });
  }
}

/**
 * Any Playwright engine by name. Firefox and WebKit come from the project's Playwright when its
 * browsers are installed (`npx playwright install firefox webkit`). An installed browser of a
 * different Playwright release can be used with FIREFOX_EXE / WEBKIT_EXE plus PW_CORE_FIREFOX /
 * PW_CORE_WEBKIT (the folder of a playwright-core package that speaks that browser's protocol).
 */
export async function launchEngine(name, opts = {}) {
  if (name === 'chromium') return launchChromium(opts);
  const { createRequire } = await import('node:module');
  const key = name.toUpperCase();
  const core = process.env[`PW_CORE_${key}`] ? createRequire(path.join(process.env[`PW_CORE_${key}`], 'package.json'))('playwright-core') : await import('playwright');
  const engine = core[name] ?? core.default?.[name];
  if (!engine) throw new Error(`unknown browser ${name}`);
  const executablePath = process.env[`${key}_EXE`] || undefined;
  const o = { executablePath };
  if (name === 'firefox') o.firefoxUserPrefs = { 'media.volume_scale': '0.0' };
  try {
    return await engine.launch(o);
  } catch (err) {
    throw new Error(`${name} could not be launched (${String(err.message).split('\n')[0]}). Install it with \`npx playwright install ${name}\`, or set ${key}_EXE and PW_CORE_${key}.`);
  }
}

// ───────────────────────────── in-page instrumentation ─────────────────────────────

/**
 * Init script: per-rAF-frame JS time and WebGL call counters (texture uploads and bytes, shader
 * compiles and links, getProgramParameter, draws, buffer uploads), long animation frames and long
 * tasks. window.__perf.start() / stop() / mark(label).
 */
export const INSTRUMENT = String.raw`(() => {
  if (window.__perf) return;
  const P = window.__perf = { rec: false, frames: [], loaf: [], lt: [], marks: [], c: { tex:0, texB:0, sub:0, subB:0, compile:0, link:0, linkMs:0, gpp:0, gppMs:0, draw:0, buf:0, bufB:0, bsub:0, bsubB:0, rt:0 } };
  const C = P.c;
  const W = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  const bytesOf = (args) => { for (const a of args) { if (a && a.byteLength != null) return a.byteLength; if (a && a.width && a.height) return (a.width * a.height * 4) | 0; } return 0; };
  const wrap = (name, fn) => { if (!W) return; const o = W[name]; if (!o) return; W[name] = function (...a) { return fn.call(this, o, a); }; };
  for (const n of ['texImage2D', 'texImage3D', 'compressedTexImage2D']) wrap(n, function (o, a) { C.tex++; let b = bytesOf(a); if (!b && typeof a[3] === 'number' && typeof a[4] === 'number') b = a[3] * a[4] * 4; C.texB += b; return o.apply(this, a); });
  for (const n of ['texSubImage2D', 'texSubImage3D']) wrap(n, function (o, a) { C.sub++; C.subB += bytesOf(a); return o.apply(this, a); });
  wrap('texStorage2D', function (o, a) { C.tex++; C.texB += (a[3] * a[4] * 4) | 0; return o.apply(this, a); });
  wrap('compileShader', function (o, a) { C.compile++; return o.apply(this, a); });
  wrap('linkProgram', function (o, a) { C.link++; const t = performance.now(); const r = o.apply(this, a); C.linkMs += performance.now() - t; return r; });
  wrap('getProgramParameter', function (o, a) { C.gpp++; const t = performance.now(); const r = o.apply(this, a); C.gppMs += performance.now() - t; return r; });
  for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) wrap(n, function (o, a) { C.draw++; return o.apply(this, a); });
  wrap('bufferData', function (o, a) { C.buf++; C.bufB += (a[1] && a[1].byteLength) || (typeof a[1] === 'number' ? a[1] : 0); return o.apply(this, a); });
  wrap('bufferSubData', function (o, a) { C.bsub++; C.bsubB += (a[2] && a[2].byteLength) || 0; return o.apply(this, a); });
  wrap('framebufferTexture2D', function (o, a) { C.rt++; return o.apply(this, a); });
  const raf = window.requestAnimationFrame.bind(window);
  let cur = null;
  window.requestAnimationFrame = (cb) => raf((t) => {
    const s = performance.now();
    const snap = P.rec ? Object.assign({}, C) : null;
    try { cb(t); } finally {
      if (P.rec) {
        const e = performance.now();
        const d = {};
        for (const k in C) { const v = C[k] - snap[k]; if (v) d[k] = Math.round(v * 100) / 100; }
        if (cur && cur.t === t) { cur.ms += e - s; for (const k in d) cur.d[k] = (cur.d[k] || 0) + d[k]; }
        else { cur = { t, s, ms: e - s, d }; P.frames.push(cur); }
      }
    }
  });
  try { new PerformanceObserver((l) => { if (!P.rec) return; for (const e of l.getEntries()) P.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, scripts: (e.scripts || []).map((s) => ({ inv: s.invoker, src: (s.sourceURL || '').split('/').pop() + ':' + s.sourceFunctionName, dur: Math.round(s.duration) })) }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) {}
  try { new PerformanceObserver((l) => { if (!P.rec) return; for (const e of l.getEntries()) P.lt.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: false }); } catch (e) {}
  P.start = () => { P.frames = []; P.loaf = []; P.lt = []; P.marks = []; cur = null; P.rec = true; };
  P.stop = () => { P.rec = false; };
  P.mark = (m) => P.marks.push({ t: performance.now(), m });
})();`;

/**
 * New context + page, instrumented, waiting for window.__academy.ready (plan §5.6: the title is up and
 * the eager set settled). `all: true` also loads every area (sites too) and waits for settledAll.
 */
export async function openGame(browser, url, { width = 1280, height = 720, dpr = 1, instrument = true, init = [], timeout = 180000, all = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  const infos = [];
  page.on('pageerror', (e) => errors.push(String(e && (e.stack || e.message || e)).slice(0, 600)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/GPU stall/.test(t)) errors.push(t.slice(0, 600));
    if (/auto quality|quality/i.test(t) && m.type() !== 'error') infos.push(t.slice(0, 200));
  });
  if (instrument) await page.addInitScript(INSTRUMENT);
  for (const s of init) await page.addInitScript(s);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout, polling: 200 });
  // views.mjs reloads a page for another flight state; it loads every area again when this was set
  page.__academyAll = !!all;
  if (all) await loadAllAreas(page, timeout);
  return { page, ctx, errors, infos };
}

/**
 * Load every area (sites too) and wait for `__academy.settledAll` — for tools that need all of them.
 * A build without loadAll (rc4, an --dist A/B reference) is already complete at `ready`.
 */
export async function loadAllAreas(page, timeout = 180000) {
  const has = await page.evaluate(() => typeof window.__academy.loadAll === 'function');
  if (!has) return;
  await page.evaluate(() => { void window.__academy.loadAll(); });
  await page.waitForFunction(() => window.__academy.settledAll === true, null, { timeout, polling: 200 });
}

/** Record `ms` of frames: { js: stats(callback ms), interval: stats, fps, raw }. */
export async function record(page, ms) {
  await page.evaluate(() => window.__perf.start());
  await page.waitForTimeout(ms);
  const r = await page.evaluate(() => {
    window.__perf.stop();
    const P = window.__perf;
    return { frames: P.frames.map((f) => ({ t: f.t, s: f.s, ms: f.ms, d: f.d })), loaf: P.loaf, lt: P.lt, marks: P.marks };
  });
  const iv = [];
  for (let i = 1; i < r.frames.length; i++) iv.push(r.frames[i].t - r.frames[i - 1].t);
  const span = r.frames.length > 1 ? (r.frames[r.frames.length - 1].t - r.frames[0].t) / 1000 : 0;
  return { js: stats(r.frames.map((f) => f.ms)), interval: stats(iv), fps: span ? round((r.frames.length - 1) / span, 1) : 0, over33: iv.filter((x) => x > 33.4).length, over50: iv.filter((x) => x > 50).length, raw: r };
}

export async function cpuThrottle(page, rate) {
  const cdp = page.__cdp ?? (page.__cdp = await page.context().newCDPSession(page));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

// ───────────────────────────── places ─────────────────────────────

// The named views live in ONE table (tools/lib/views.mjs, plan §5.10): camera, flight state, ledger and
// budgets. gotoView returns { ok } or { pending: reason } (a view whose content does not exist yet).
export { VIEWS, ZONE_ANCHORS, gotoView, viewPending, viewBudget, knownView, PHASE7_VIEWS } from './views.mjs';

// ───────────────────────────── output ─────────────────────────────

/** artifacts/<PT_DIR|measure>/<name> (JSON). */
export function saveJson(name, obj) {
  const dir = path.join(ROOT, 'artifacts', process.env.PT_DIR || 'measure');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  fs.writeFileSync(f, JSON.stringify(obj, null, 1));
  return f;
}

export const list = (v, dflt) => (v === undefined || v === true ? dflt : String(v).split(',').map((s) => s.trim()).filter(Boolean));
