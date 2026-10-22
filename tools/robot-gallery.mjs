#!/usr/bin/env node
// Robot gallery: every robot of src/robots at LOD0 next to a 1.55 m reference bar, a three-pose
// strip of one joint, LOD0 next to LOD1 from one camera, and a line-up of all robots by height.
//
//   node tools/robot-gallery.mjs [--only id1,id2] [--out artifacts/phase7/robots] [--prod]
//
// --prod: build the viewer with the game's production config (content-hashed GLBs, the robot
// chunks, precompressed .br) into a temp folder and serve it with `vite preview` (production
// headers), instead of the dev server: proves the lazy GLB URLs and the decoder work in a build.
//
// Serves tools/robots/viewer/ (it loads the GLBs through the game runtime, src/core/robots) from a
// private Vite dev server, renders in headless Chromium (ANGLE Metal, as tools/shot.mjs) and
// writes <id>.png, <id>-joint.png, <id>-lod.png (LOD0 / LOD1 / LOD2 / silhouette), lineup*.png and
// lineup-file.png (the shipped lineup.l2.glb). Read every PNG afterwards: wrong
// axes, scale, missing parts, inside-out normals, colours. Exit 1 on console or page errors.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, freePort, launchBrowser, parseArgs, startServer } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(ROOT, String(args.out ?? 'artifacts/phase7/robots'));
const only = args.only ? String(args.only).split(',') : null;
fs.mkdirSync(outDir, { recursive: true });

const save = (file, dataUrl) => {
  if (!dataUrl) return null;
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return path.relative(ROOT, file);
};

async function prodServer() {
  const { build, preview } = await import('vite');
  const outDir = path.join(os.tmpdir(), 'emai-robot-viewer', String(process.pid));
  const configFile = path.join(ROOT, 'vite.config.ts');
  await build({ root: ROOT, configFile, logLevel: 'error', build: { outDir, emptyOutDir: true, rolldownOptions: { input: path.join(ROOT, 'tools/robots/viewer/index.html') } } });
  const glbs = fs.readdirSync(path.join(outDir, 'assets')).filter((f) => f.endsWith('.glb'));
  console.log(`production viewer build: ${glbs.length} GLB assets with content hashes (e.g. ${glbs[0]}), ${glbs.filter((f) => fs.existsSync(path.join(outDir, 'assets', f + '.br'))).length} with .br`);
  const port = await freePort();
  const srv = await preview({ root: ROOT, configFile, logLevel: 'error', build: { outDir }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((r) => srv.httpServer.close(r));
      fs.rmSync(outDir, { recursive: true, force: true });
    },
  };
}

const server = args.prod ? await prodServer() : await startServer();
const browser = await launchBrowser();
const errors = [];
const external = [];
const files = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e && (e.stack || e.message || e))));
  // the robot runtime must not reach any other origin (GLB, decoder, loader: all same-origin)
  const origin = new URL(server.url).origin;
  page.on('request', (r) => {
    if (/^(https?|wss?):/.test(r.url()) && new URL(r.url()).origin !== origin) external.push(r.url());
  });
  await page.goto(`${server.url}/tools/robots/viewer/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.viewer && window.viewer.ready, null, { timeout: 120000 });
  const robots = (await page.evaluate(() => window.viewer.robots)).filter((r) => !only || only.includes(r.id));
  for (const r of robots) {
    const t0 = Date.now();
    const res = await page.evaluate((id) => window.viewer.shot(id), r.id);
    files.push(save(path.join(outDir, `${r.id}.png`), res.main), save(path.join(outDir, `${r.id}-joint.png`), res.strip), save(path.join(outDir, `${r.id}-lod.png`), res.lods));
    console.log(`${r.id.padEnd(20)} ${String(res.triangles).padStart(6)} tris  joint ${res.joint ?? '—'}  ${Date.now() - t0} ms`);
  }
  if (!only) {
    const ids = robots.map((r) => r.id);
    const humanoids = ['unitree-r1', 'unitree-g1', 'unitree-h1', 'unitree-h1-2', 'unitree-h2', 'pal-talos', 'apptronik-apollo', 'unitree-g1-dex3'];
    files.push(save(path.join(outDir, 'lineup-humanoids.png'), await page.evaluate((x) => window.viewer.lineup(x), humanoids.filter((i) => ids.includes(i)))));
    files.push(save(path.join(outDir, 'lineup-others.png'), await page.evaluate((x) => window.viewer.lineup(x), ids.filter((i) => !humanoids.includes(i)))));
    // the shipped size-wall file (R6): one static mesh, every hall robot at true scale
    const lf = await page.evaluate(() => window.viewer.lineupFile());
    files.push(save(path.join(outDir, 'lineup-file.png'), lf.url));
    console.log(`lineup.l2.glb: ${lf.tris} triangles`);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`${files.filter(Boolean).length} images → ${path.relative(ROOT, outDir)}/`);
console.log(`requests to other origins: ${external.length}${external.length ? '\n  ' + external.slice(0, 10).join('\n  ') : ''}`);
if (external.length) errors.push(`${external.length} third-party requests`);
if (errors.length) {
  console.error(`console / page errors:\n  ${errors.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
