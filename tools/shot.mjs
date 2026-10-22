#!/usr/bin/env node
// Screenshot + health check of the running game.
//
//   node tools/shot.mjs --url "/?zone=_example&skipIntro=1" --out artifacts/shots/example.png
//        [--wait 3000]              extra ms after the game reports ready
//        [--base http://localhost:5173]  use an existing server (else a private Vite server is started)
//        [--views "0,0;90,-10"]     several views (yaw,pitch in degrees) → out-1.png, out-2.png …
//        [--eval "__academy.grabNearest()"]  JS run in the page before shooting (repeatable, may await)
//        [--dump "__academy.interactables()"] expression evaluated after shooting; value printed + saved (repeatable)
//        [--width 1280 --height 720]
//        [--allow-console-errors]   only page errors / zone errors fail the run
//        [--help]                   print this header
//
// Writes <out>.png and <out>.json (console errors, page errors, failed requests, zones() status,
// state(), avg fps, GPU renderer). Exit code 1 on page errors, zone load errors or console errors.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, capture, launchBrowser, parseArgs, parseViews, startServer } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  console.log(src.split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
const rel = String(args.url ?? '/?skipIntro=1');
const out = path.resolve(ROOT, String(args.out ?? 'artifacts/shots/shot.png'));
const evals = [].concat(args.eval ?? []).map(String);
const dumps = [].concat(args.dump ?? []).map(String);

let server = null;
let browser = null;
let code = 1;
try {
  const base = args.base ? String(args.base).replace(/\/$/, '') : (server = await startServer()).url;
  const url = /^https?:/.test(rel) ? rel : base + (rel.startsWith('/') ? rel : '/' + rel);
  browser = await launchBrowser();
  const r = await capture(browser, {
    url,
    out,
    wait: Number(args.wait ?? 2500),
    views: parseViews(args.views),
    evals,
    dumps,
    width: Number(args.width ?? 1280),
    height: Number(args.height ?? 720),
  });
  const allowConsole = !!args['allow-console-errors'];
  r.ok = r.ok && (allowConsole || r.consoleErrors.length === 0);
  const jsonPath = out.replace(/\.[a-z]+$/i, '') + '.json';
  fs.writeFileSync(jsonPath, JSON.stringify(r, null, 2));
  const zs = (r.zones || []).map((z) => `${z.id}:${z.status}`).join(' ');
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${url}`);
  console.log(`     files: ${r.files.map((f) => path.relative(ROOT, f)).join(', ')}  json: ${path.relative(ROOT, jsonPath)}`);
  console.log(`     fps: ${r.fps}  draw: ${r.render ? `${r.render.calls} calls / ${(r.render.triangles / 1000).toFixed(0)}k tris` : '-'}  gpu: ${r.gl}  ready: ${r.ms.ready ?? '-'} ms  zones: ${zs}`);
  for (const d of r.dumps || []) console.log(`     dump ${d.expr} → ${d.error ? 'ERROR ' + d.error : JSON.stringify(d.value).slice(0, 1500)}`);
  for (const e of r.pageErrors) console.log(`     PAGE ERROR: ${e.split('\n')[0]}`);
  for (const e of r.consoleErrors.slice(0, 10)) console.log(`     console.error: ${e.split('\n')[0]}`);
  for (const z of r.zoneErrors || []) console.log(`     ZONE ERROR ${z.id}: ${String(z.error).split('\n').slice(0, 6).join('\n       ')}`);
  for (const f of r.failedRequests.slice(0, 10)) console.log(`     request: ${f}`);
  code = r.ok ? 0 : 1;
} catch (err) {
  console.error('[shot] failed:', err);
  code = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
process.exit(code);
