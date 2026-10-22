// Discover's device profiles and sub-path serving (WP-D0, plan §2.4, §6). Used by tools/discover-check.mjs
// and its scenarios (tools/discover/*.mjs).
//
//   pixel7    Chromium, 412×915 @ 2.625, touch, 4× CPU (--cpu 6 as a low-end proxy), 9 Mbit/s, 85 ms
//   iphone15  WebKit (Playwright's), 393×852 @ 3, touch, no CPU or network throttling (WebKit has no CDP):
//             it catches WebKit-only shader-compile and texture-upload stalls. Falls back to Chromium with
//             a warning when this Playwright has no WebKit build.
//   desktop   Chromium, 1280×720 @ 1, mouse (the gate's desktop cases)
//
// The build is the production build with BASE_PATH=/academy-world/ (as GitHub Pages serves it), served
// under that prefix by a small static server that sends the build's own .br / .gz files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ROOT, freePort, launchChromium, launchEngine } from './measure.mjs';

export const BASE_PATH = '/academy-world/';
export const NET = { '4g': { mbit: 9, rtt: 85 }, slow4g: { mbit: 1.6, rtt: 150 } };
export const CPU = { pixel7: 4, lowend: 6 };

const UA = {
  pixel7: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  iphone15: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
};

export const DEVICES = {
  pixel7: { name: 'pixel7', engine: 'chromium', context: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA.pixel7 }, cpu: CPU.pixel7, net: NET['4g'], touch: true },
  iphone15: { name: 'iphone15', engine: 'webkit', context: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA.iphone15 }, cpu: 1, net: null, touch: true },
  desktop: { name: 'desktop', engine: 'chromium', context: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, cpu: 1, net: null, touch: false },
};

/** A device profile with the CLI's overrides (--cpu, --net none). */
export function device(name, args = {}) {
  const d = DEVICES[name];
  if (!d) throw new Error(`unknown device ${name} (${Object.keys(DEVICES).join(', ')})`);
  const out = { ...d, context: { ...d.context } };
  if (args.cpu && out.engine === 'chromium' && name !== 'desktop') out.cpu = Number(args.cpu);
  if (args.net === 'none') out.net = null;
  return out;
}

/** Build the production bundle for the sub-path (BASE_PATH, optionally VITE_AMBER=1) into a temp folder. */
export async function buildSubpath({ prefix = BASE_PATH, amber = false, outDir = null } = {}) {
  const { build } = await import('vite');
  const dir = outDir ? path.resolve(outDir) : path.join(os.tmpdir(), 'emai-discover-check', `${process.pid}-${amber ? 'amber' : 'plain'}`);
  const prev = { BASE_PATH: process.env.BASE_PATH, VITE_AMBER: process.env.VITE_AMBER };
  process.env.BASE_PATH = prefix;
  if (amber) process.env.VITE_AMBER = '1';
  else delete process.env.VITE_AMBER;
  const t0 = Date.now();
  try {
    await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
  } finally {
    for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  console.log(`built ${dir} (BASE_PATH=${prefix}${amber ? ', VITE_AMBER=1' : ''}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { dir, cleanup: () => (outDir ? null : fs.rmSync(dir, { recursive: true, force: true })) };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ico': 'image/x-icon' };

/**
 * Serve a build folder under `prefix` (like GitHub Pages at /academy-world/): the build's .br / .gz by
 * Accept-Encoding, 404 outside the prefix. `log` gets { path, status, raw, br } per request (br: the size
 * of the brotli file, or the raw size for an incompressible one — what a brotli host sends).
 */
export async function serveSubpath(dist, prefix = BASE_PATH) {
  const log = [];
  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (!p.startsWith(prefix)) {
      log.push({ path: p, status: 404, raw: 0, br: 0, outside: true });
      res.writeHead(404);
      return res.end();
    }
    let rel = p.slice(prefix.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(dist, rel);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      log.push({ path: p, status: 404, raw: 0, br: 0 });
      res.writeHead(404);
      return res.end();
    }
    const raw = fs.statSync(file).size;
    const brFile = fs.existsSync(file + '.br') ? file + '.br' : null;
    const gzFile = fs.existsSync(file + '.gz') ? file + '.gz' : null;
    const ae = String(req.headers['accept-encoding'] ?? '');
    let body = file;
    const h = { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', vary: 'Accept-Encoding' };
    if (brFile && /\bbr\b/.test(ae)) (body = brFile), (h['content-encoding'] = 'br');
    else if (gzFile && /\bgzip\b/.test(ae)) (body = gzFile), (h['content-encoding'] = 'gzip');
    h['content-length'] = fs.statSync(body).size;
    log.push({ path: p, status: 200, raw, br: brFile ? fs.statSync(brFile).size : raw, t: Date.now() });
    res.writeHead(200, h);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(body).pipe(res);
  });
  const port = await freePort();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${port}`;
  return { origin, url: origin + prefix, prefix, log, close: () => new Promise((r) => server.close(() => r())) };
}

/** The browser for a device: Chromium with the real GPU, or Playwright's WebKit (Chromium + a warning when it is missing). */
export async function launchFor(dev) {
  if (dev.engine === 'webkit') {
    try {
      return { browser: await launchEngine('webkit'), engine: 'webkit', fallback: false };
    } catch (err) {
      console.warn(`WARN ${dev.name}: ${String(err.message).split('\n')[0]} — running on Chromium instead`);
      return { browser: await launchChromium(), engine: 'chromium', fallback: true };
    }
  }
  return { browser: await launchChromium(), engine: 'chromium', fallback: false };
}

/**
 * A fresh context and page for the device: touch, viewport, UA; on Chromium the CPU and network
 * throttling (CDP). Collects page errors, console errors and every request. `init` scripts run before
 * the page's own (e.g. INSTRUMENT, a seeded save).
 */
export async function openDevice(browser, engine, dev, { throttle = true, init = [], reducedMotion = false } = {}) {
  const ctx = await browser.newContext({ ...dev.context, ...(engine === 'webkit' ? {} : {}), reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  const consoleLog = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(`PAGE ${String(e && (e.stack || e.message || e)).slice(0, 500)}`));
  page.on('console', (m) => {
    const t = m.text();
    consoleLog.push(`${m.type()}: ${t}`.slice(0, 300));
    if (m.type() === 'error' && !/GPU stall|Failed to load resource: the server responded with a status of 404/.test(t)) errors.push(t.slice(0, 500));
  });
  page.on('request', (r) => requests.push({ url: r.url(), t: Date.now(), type: r.resourceType() }));
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (!/ERR_ABORTED|cancelled/i.test(f)) errors.push(`REQUEST FAILED ${r.url()} ${f}`);
  });
  for (const s of init) await page.addInitScript(s);
  let cdp = null;
  if (engine === 'chromium' && throttle) {
    cdp = await ctx.newCDPSession(page);
    if (dev.net) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: dev.net.rtt, downloadThroughput: (dev.net.mbit * 1e6) / 8, uploadThroughput: (dev.net.mbit * 1e6) / 8 / 4 });
    }
    if (dev.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
  }
  return { ctx, page, errors, consoleLog, requests, cdp, close: () => ctx.close() };
}
