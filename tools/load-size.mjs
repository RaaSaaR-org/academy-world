#!/usr/bin/env node
// First-load size and time of the production build, as a visitor gets it from a link.
//
//   node tools/load-size.mjs [--mbit 16] [--rtt 40] [--dist <dir>] [--server preview] [--chunks] [--no-check]
//
// Builds a private copy of dist/ (or uses --dist), serves it with brotli/gzip like a CDN would
// (Content-Encoding by Accept-Encoding; hashed /assets/* with a one-year immutable cache header),
// opens the page in headless Chromium and records every response until the start screen is
// ready. Prints per-file raw / transferred bytes, the totals, and the time to the start screen
// on an emulated connection (default 16 Mbit/s, 40 ms RTT). Writes artifacts/<PT_DIR|load>/load.json.
//
// Phase 7 gate (plan §5.6, §6.3): the FIRST LOAD is what is transferred before the title shows
// (the start button becomes visible); area code now loads after it. Exit 1 when the first load
// exceeds 1.75 MB, holds an area code chunk (/assets/<area id>-<hash>.js) or a robot model (.glb).
//
// --chunks adds the chunk caps of §5.6 (brotli, from the build's own .br files), each chunk with the
// static imports only it needs (not the first load's, not shared with another lazy chunk): every area
// ≤ 80 KB, region ≤ 120 KB, life ≤ 40 KB, the finale chunk ≤ rc4's 37.8 KB + 60 KB for the lift-off,
// MuJoCo (wasm + glue) ≤ 1.1 MB, terrain heights core ≤ 20 KB (before the title) and ring ≤ 100 KB,
// one robot file ≤ 350 KB (the Apollo ≤ 420 KB; the MUST-set total is tools/robots/check.mjs's). A cap
// whose chunk does not exist yet is listed as pending.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { ROOT, freePort, launchBrowser, parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const mbit = Number(args.mbit ?? 16);
const rtt = Number(args.rtt ?? 40);
/** plan §5.6: the first load (title) cap, brotli */
const FIRST_LOAD_CAP = 1.75 * 1024 * 1024;
// area code chunks are named after their folder (Rolldown names a lazy chunk after src/zones/<id>/)
const AREA_IDS = fs.readdirSync(path.join(ROOT, 'src', 'zones'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
const AREA_CHUNK = new RegExp(`^/assets/(${AREA_IDS.map((id) => id.replace(/[-]/g, '\\-')).join('|')})-[\\w-]+\\.js$`);

const KB = 1024;
/** §5.6 chunk caps (brotli). The finale chunk: rc4 37.8 KB (artifacts/dist/rc4) + the lift-off's 60 KB. */
const CHUNK_CAPS = { area: 80 * KB, region: 120 * KB, life: 40 * KB, finale: (37.8 + 60) * KB, mujoco: 1.1 * 1024 * KB, heightsCore: 20 * KB, heightsRing: 100 * KB, robot: 350 * KB, robotException: 420 * KB };
const ROBOT_EXCEPTION = /apptronik-apollo/;

let dist = args.dist ? path.resolve(String(args.dist)) : null;
let tmp = null;
if (!dist) {
  const { build } = await import('vite');
  tmp = dist = path.join(os.tmpdir(), 'emai-academy-load', String(process.pid));
  await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
// like the build's precompress plugin (vite.config.ts): robot GLBs and the ground's .bin heights travel as brotli too
const COMPRESS = new Set(['.html', '.js', '.css', '.wasm', '.svg', '.json', '.ttf', '.glb', '.bin']);
const cache = new Map();
const served = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  const ext = path.extname(file);
  const raw = fs.readFileSync(file);
  const ae = String(req.headers['accept-encoding'] ?? '');
  let body = raw;
  let enc = null;
  if (COMPRESS.has(ext)) {
    if (/\bbr\b/.test(ae)) {
      enc = 'br';
      body = cache.get(file + ':br') ?? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
    } else if (/gzip/.test(ae)) {
      enc = 'gzip';
      body = cache.get(file + ':gz') ?? zlib.gzipSync(raw, { level: 9 });
    }
    if (enc) cache.set(file + (enc === 'br' ? ':br' : ':gz'), body);
  }
  const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (enc) headers['Content-Encoding'] = enc;
  served.push({ path: url.pathname, raw: raw.length, sent: body.length, enc, at: Date.now() });
  res.writeHead(200, headers).end(body);
});
// pre-compress everything once (brotli 11 on a 3 MB file takes seconds and must not count as load time)
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const file of walk(dist)) {
  if (!COMPRESS.has(path.extname(file))) continue;
  const raw = fs.readFileSync(file);
  cache.set(file + ':br', zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
  cache.set(file + ':gz', zlib.gzipSync(raw, { level: 9 }));
}
const port = await freePort();
// --server preview: measure what `npm run preview` sends (vite preview with the project config)
// instead of this file's CDN-like server; bytes then come from the browser's network log.
const viaPreview = args.server === 'preview';
let previewServer = null;
if (viaPreview) {
  const { preview } = await import('vite');
  previewServer = await preview({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist }, preview: { port, strictPort: true, host: '127.0.0.1' } });
} else await new Promise((r) => server.listen(port, '127.0.0.1', r));

/**
 * §5.6 chunk caps over the build folder: the import graph from the chunks' own `from"./x.js"` and
 * `import("./x.js")`; a chunk's size = its brotli bytes + those of its static imports that no other
 * lazy chunk and not the entry's static closure uses.
 */
function chunkTable(dir) {
  const assets = path.join(dir, 'assets');
  const files = fs.readdirSync(assets).filter((f) => !/\.(br|gz)$/.test(f));
  const br = (f) => {
    const p = path.join(assets, f);
    return fs.existsSync(p + '.br') ? fs.statSync(p + '.br').size : zlib.brotliCompressSync(fs.readFileSync(p), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  };
  const js = files.filter((f) => f.endsWith('.js'));
  // the build imports chunks by stable names that an import map resolves to the hashed files
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const mapSrc = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? (fs.existsSync(path.join(dir, 'importmap.json')) ? fs.readFileSync(path.join(dir, 'importmap.json'), 'utf8') : '{}');
  let imports = {};
  try {
    imports = JSON.parse(mapSrc).imports ?? {};
  } catch {
    imports = {};
  }
  const real = (name) => path.basename(imports[`/assets/${name}`] ?? `/assets/${name}`);
  const graph = new Map();
  for (const f of js) {
    const src = fs.readFileSync(path.join(assets, f), 'utf8');
    // static: `from"./x.js"` and bare `import"./x.js"`; dynamic: import("./x.js") or import(`./x.js`)
    const stat = [...src.matchAll(/(?:\bfrom|\bimport)\s*["'`]\.\/([^"'`]+\.js)["'`]/g)].map((m) => real(m[1]));
    const dyn = [...src.matchAll(/\bimport\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g)].map((m) => real(m[1]));
    graph.set(f, { stat: [...new Set(stat)], dyn: [...new Set(dyn)] });
  }
  const entries = [...html.matchAll(/<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]).filter((f) => graph.has(f));
  const closure = (roots) => {
    const seen = new Set();
    const st = [...roots];
    while (st.length) {
      const f = st.pop();
      if (seen.has(f) || !graph.has(f)) continue;
      seen.add(f);
      st.push(...graph.get(f).stat);
    }
    return seen;
  };
  const eager = closure(entries);
  const lazyRoots = [...new Set([...graph.values()].flatMap((g) => g.dyn))].filter((f) => !eager.has(f));
  const users = new Map();
  for (const r of lazyRoots) for (const f of closure([r])) if (!eager.has(f)) users.set(f, (users.get(f) ?? 0) + 1);
  const own = (root) => [...closure([root])].filter((f) => !eager.has(f) && (f === root || users.get(f) === 1));
  const size = (root) => own(root).reduce((a, f) => a + br(f), 0);
  const rows = [];
  const add = (kind, name, bytes, cap, files = []) => rows.push({ kind, name, bytes, cap, ok: bytes == null ? null : bytes <= cap, files });
  const pend = (kind, name, cap, why) => rows.push({ kind, name, bytes: null, cap, ok: null, pending: why });
  const chunkOf = (re) => lazyRoots.filter((f) => re.test(f));
  for (const id of AREA_IDS) {
    const c = chunkOf(new RegExp(`^${id.replace(/-/g, '\\-')}-[\\w-]+\\.js$`));
    if (!c.length) pend('area', id, CHUNK_CAPS.area, 'no code chunk yet (manifest only)');
    for (const f of c) add('area', id, size(f), CHUNK_CAPS.area, own(f));
  }
  for (const [kind, re, cap, why] of [
    ['region', /^region-[\w-]+\.js$/, CHUNK_CAPS.region, 'WP14'],
    ['life', /^life-[\w-]+\.js$/, CHUNK_CAPS.life, 'WP15'],
    ['finale', /^finale-[\w-]+\.js$/, CHUNK_CAPS.finale, 'the finale chunk'],
  ]) {
    const c = chunkOf(re);
    if (!c.length) pend(kind, kind, cap, `no ${kind} chunk yet (${why})`);
    for (const f of c) add(kind, f.replace(/-[\w-]+\.js$/, ''), size(f), cap, own(f));
  }
  const mj = files.filter((f) => /mujoco/i.test(f));
  if (!mj.length) pend('mujoco', 'mujoco', CHUNK_CAPS.mujoco, 'not in the build yet (WP5)');
  else add('mujoco', 'mujoco wasm + glue', mj.reduce((a, f) => a + br(f), 0), CHUNK_CAPS.mujoco, mj);
  const pub = (rel) => {
    const p = path.join(dir, rel);
    return fs.existsSync(p) ? walk(p).filter((f) => !/\.(br|gz)$/.test(f)) : [];
  };
  const heights = [...pub('world'), ...files.map((f) => path.join(assets, f))].filter((f) => /height/i.test(path.basename(f)));
  const brAny = (f) => (fs.existsSync(f + '.br') ? fs.statSync(f + '.br').size : zlib.brotliCompressSync(fs.readFileSync(f)).length);
  const core = heights.filter((f) => /core/i.test(path.basename(f)));
  const ring = heights.filter((f) => /ring/i.test(path.basename(f)));
  if (!core.length) pend('heights', 'heights core', CHUNK_CAPS.heightsCore, 'no heights core file yet (WP3)');
  else add('heights', 'heights core', core.reduce((a, f) => a + brAny(f), 0), CHUNK_CAPS.heightsCore, core.map((f) => path.basename(f)));
  if (!ring.length) pend('heights', 'heights ring', CHUNK_CAPS.heightsRing, 'no heights ring file yet (WP3)');
  else add('heights', 'heights ring', ring.reduce((a, f) => a + brAny(f), 0), CHUNK_CAPS.heightsRing, ring.map((f) => path.basename(f)));
  const glbs = files.filter((f) => f.endsWith('.glb') && !/\.l2-/.test(f));
  // GLBs are already compressed: the raw bytes are what travels (deploy-check checks br on the wire)
  const glbSize = (f) => fs.statSync(path.join(assets, f)).size;
  let worst = null;
  for (const f of glbs) {
    const cap = ROBOT_EXCEPTION.test(f) ? CHUNK_CAPS.robotException : CHUNK_CAPS.robot;
    const b = Math.min(glbSize(f), br(f));
    if (b > cap) add('robot', f.replace(/-[\w-]+\.glb$/, ''), b, cap, [f]);
    if (!worst || b > worst.b) worst = { f, b };
  }
  if (worst) add('robot', `largest robot file (${worst.f.replace(/-[\w-]+\.glb$/, '')})`, worst.b, ROBOT_EXCEPTION.test(worst.f) ? CHUNK_CAPS.robotException : CHUNK_CAPS.robot, [worst.f]);
  // the ≤ 4.0 MB MUST-set total is tools/robots/check.mjs's (WP0): it knows which files form the set
  return rows;
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
if (viaPreview) {
  const live = new Map();
  const sentAt = new Map();
  cdp.on('Network.requestWillBeSent', (e) => sentAt.set(e.requestId, Date.now()));
  cdp.on('Network.responseReceived', (e) => live.set(e.requestId, { path: new URL(e.response.url).pathname, enc: e.response.headers['content-encoding'] || e.response.headers['Content-Encoding'] || null, raw: 0, at: sentAt.get(e.requestId) ?? Date.now() }));
  cdp.on('Network.dataReceived', (e) => live.has(e.requestId) && (live.get(e.requestId).raw += e.dataLength));
  cdp.on('Network.loadingFinished', (e) => {
    const r = live.get(e.requestId);
    if (r && !r.path.startsWith('blob:')) served.push({ path: r.path, raw: r.raw, sent: e.encodedDataLength, enc: r.enc, at: r.at });
  });
}
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: (mbit * 1e6) / 8, uploadThroughput: (mbit * 1e6) / 8 / 4 });
// boot phases from the loading screen's status line
await page.addInitScript(() => {
  const t0 = performance.now();
  const log = (window.__bootPhases = []);
  let last = '';
  const iv = setInterval(() => {
    const el = document.querySelector('#loading .status');
    const s = el ? el.textContent : '';
    if (s !== last) log.push([Math.round(performance.now() - t0), (last = s)]);
    if (window.__academy && window.__academy.ready) {
      log.push([Math.round(performance.now() - t0), 'ready']);
      clearInterval(iv);
    }
  }, 20);
  // the title: the start button becomes visible. A MutationObserver sees it at the end of the task that
  // showed it (the 20 ms poll could be late); wall clock, compared with the requests' arrival times.
  const titleUp = () => {
    const btn = document.getElementById('start-btn');
    return !!btn && btn.offsetParent !== null && getComputedStyle(btn).visibility !== 'hidden';
  };
  const mo = new MutationObserver(() => {
    if (window.__titleAt || !titleUp()) return;
    window.__titleAt = Date.now();
    log.push([Math.round(performance.now() - t0), 'title']);
    mo.disconnect();
  });
  mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
});
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?reset=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 100 });
const tReady = Date.now() - t0;
await page.waitForSelector('#start-btn', { state: 'visible', timeout: 30000 });
const tStart = Date.now() - t0;
await page.waitForTimeout(1500); // late requests (fonts swapped in, lazy chunks)
const phases = await page.evaluate(() => window.__bootPhases);
const titleAt = await page.evaluate(() => window.__titleAt ?? null);
await browser.close();
if (previewServer) await new Promise((r) => previewServer.httpServer.close(r));
else server.close();
const chunks = args.chunks ? chunkTable(dist) : null;
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });

const groups = { wasm: /\.wasm$/, fonts: /\.woff2?$|\.ttf$/, js: /\.js$/, css: /\.css$/, other: /./ };
const sum = { raw: 0, sent: 0 };
const byGroup = {};
for (const f of served) {
  sum.raw += f.raw;
  sum.sent += f.sent;
  const g = Object.keys(groups).find((k) => groups[k].test(f.path));
  byGroup[g] ??= { raw: 0, sent: 0, files: 0 };
  byGroup[g].raw += f.raw;
  byGroup[g].sent += f.sent;
  byGroup[g].files++;
}
const kb = (n) => `${(n / 1024).toFixed(0).padStart(6)} KB`;
for (const f of served.sort((a, b) => b.sent - a.sent)) console.log(`${kb(f.sent)} sent  ${kb(f.raw)} raw  ${f.enc ?? '   '}  ${f.path}`);
console.log('—');
for (const [g, v] of Object.entries(byGroup)) console.log(`${g.padEnd(6)} ${String(v.files).padStart(3)} files  ${kb(v.sent)} sent  ${kb(v.raw)} raw`);
console.log(`TOTAL  ${served.length} requests  ${kb(sum.sent)} transferred (brotli where the browser accepts it)  ${kb(sum.raw)} uncompressed`);
console.log('boot phases (ms since navigation start):', phases.map(([t, p]) => `${p || '—'} ${t}`).join(' · '));
console.log(`start screen after ${(tStart / 1000).toFixed(1)} s at ${mbit} Mbit/s, ${rtt} ms RTT (game ready ${(tReady / 1000).toFixed(1)} s)`);
// ── the first load: everything that arrived before the title ──
const first = titleAt == null ? served : served.filter((f) => f.at <= titleAt);
const firstSent = first.reduce((n, f) => n + f.sent, 0);
const areaChunks = first.filter((f) => AREA_CHUNK.test(f.path)).map((f) => f.path);
const robotFiles = first.filter((f) => /\.glb$/i.test(f.path)).map((f) => f.path);
const later = served.filter((f) => !first.includes(f));
console.log(`FIRST LOAD (before the title)  ${first.length} requests  ${kb(firstSent)} transferred  (${(firstSent / 1048576).toFixed(2)} MB; cap ${(FIRST_LOAD_CAP / 1048576).toFixed(2)} MB)`);
console.log(`after the title (until ready + 1.5 s)  ${later.length} requests  ${kb(later.reduce((n, f) => n + f.sent, 0))}: ${later.map((f) => path.basename(f.path)).join(', ') || '—'}`);
console.log(`area code chunks in the first load: ${areaChunks.join(', ') || 'none'} · robot files: ${robotFiles.join(', ') || 'none'}`);
const fails = [];
if (titleAt == null) fails.push('the title never showed (start button not visible)');
if (firstSent > FIRST_LOAD_CAP) fails.push(`first load ${(firstSent / 1048576).toFixed(2)} MB > 1.75 MB`);
if (areaChunks.length) fails.push(`area code in the first load: ${areaChunks.join(', ')}`);
if (robotFiles.length) fails.push(`robot models in the first load: ${robotFiles.join(', ')}`);
if (chunks) {
  console.log('— chunk caps (§5.6, brotli) —');
  for (const r of chunks) {
    const tag = r.ok == null ? 'PEND' : r.ok ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${r.kind.padEnd(8)} ${r.name.padEnd(40)} ${r.bytes == null ? '       —' : kb(r.bytes)}  cap ${kb(r.cap)}${r.pending ? `  (${r.pending})` : r.files.length > 1 ? `  (${r.files.length} files: ${r.files.slice(0, 4).join(', ')}${r.files.length > 4 ? ' …' : ''})` : ''}`);
    if (r.ok === false) fails.push(`${r.kind} ${r.name} ${(r.bytes / KB).toFixed(0)} KB > ${(r.cap / KB).toFixed(0)} KB`);
  }
}
console.log(fails.length ? `FAIL  ${fails.join(' · ')}` : `PASS  first load ≤ 1.75 MB, no area code chunk, no robot model${chunks ? ', every chunk within its cap' : ''}`);
const out = path.join(ROOT, 'artifacts', process.env.PT_DIR || 'load', 'load.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ mbit, rtt, tStartMs: tStart, tReadyMs: tReady, phases, total: sum, byGroup, firstLoad: { sent: firstSent, requests: first.length, areaChunks, robotFiles, pass: !fails.length }, chunks, files: served }, null, 2));
if (fails.length && !args['no-check']) process.exitCode = 1;
