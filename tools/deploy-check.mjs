#!/usr/bin/env node
// Does a host serve the build the way README "Hosting" asks? (plan item B1)
//
//   node tools/deploy-check.mjs <url> [--insecure]       # e.g. https://academy.example/ or a preview
//   node tools/deploy-check.mjs --preview [--dist <dir>]  # builds privately, checks `vite preview`
//
// Fetches index.html, follows its scripts, styles, preloads and module imports to every hashed
// /assets/* file the title needs (the Rapier .wasm included, found in the JS), and asserts:
//   - index.html: Cache-Control no-cache (or max-age=0 + must-revalidate), text/html
//   - /assets/*: Cache-Control with a long max-age and `immutable`
//   - JS, CSS, WASM, SVG, HTML: Content-Encoding br (or gzip) when the request accepts it
//   - the .wasm as application/wasm (streaming compilation needs it), JS as JavaScript, CSS as text/css
//   - Vary: Accept-Encoding on compressed responses
//   - Phase 7 (§5.10): one robot GLB as model/gltf-binary, br, immutable (the first the chunks name),
//     and the MuJoCo .wasm (WP5) as application/wasm, compressed, immutable; each pending while the
//     build has none
// Exit 1 when a check fails. --insecure accepts a self-signed certificate.
import { Verdict, distsFromArgs, servePreview, parseArgs } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
let url = args._[0];
let srv = null;
if (!url || args.preview) {
  const [d] = await distsFromArgs(args);
  srv = await servePreview(d.dir);
  url = srv.url + '/';
  console.log(`vite preview of ${d.dir} at ${url}`);
}
const root = new URL(url);
const v = new Verdict('deploy-check');

async function get(u) {
  const r = await fetch(u, { headers: { 'accept-encoding': 'br, gzip, deflate', accept: '*/*' }, redirect: 'follow' });
  const body = Buffer.from(await r.arrayBuffer());
  return { status: r.status, h: Object.fromEntries(r.headers), body };
}

const seen = new Map();
const queue = [new URL('./', root).href];
const assetRefs = (text, base) => {
  const out = new Set();
  const add = (r, b) => {
    try {
      out.add(new URL(r, b).href);
    } catch {}
  };
  for (const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) add(m[1], base);
  // relative imports between chunks ("./Game-xxxx.js") and Vite's preload map ("assets/Game-xxxx.js",
  // relative to the site root), plus hashed asset URLs built with new URL("…", import.meta.url)
  for (const m of text.matchAll(/["'`](\.{1,2}\/[\w./-]+\.(?:js|mjs|css|wasm|woff2?|svg|json|glb))["'`]/g)) add(m[1], base);
  for (const m of text.matchAll(/["'`]\/?(assets\/[\w.-]+\.(?:js|mjs|css|wasm|woff2?|svg|json|glb))["'`]/g)) add(m[1], root.href);
  return [...out].filter((h) => h.startsWith(root.origin) && !h.includes('#'));
};

try {
  let glbFetched = 0;
  while (queue.length && seen.size < 600) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    // one GLB is enough (the robot files are large): the rest are listed, not fetched
    if (u.endsWith('.glb') && glbFetched++ >= 1) continue;
    const r = await get(u);
    seen.set(u, r);
    const ct = r.h['content-type'] || '';
    if (r.status === 200 && /html|javascript|css/.test(ct)) for (const ref of assetRefs(r.body.toString('utf8'), u)) if (!seen.has(ref)) queue.push(ref);
  }

  const index = seen.get(new URL('./', root).href);
  v.require('index.html: 200', index?.status === 200, String(index?.status));
  const cc = (index?.h['cache-control'] || '').toLowerCase();
  v.require('index.html: Cache-Control no-cache', /no-cache|max-age=0.*must-revalidate|must-revalidate.*max-age=0/.test(cc), cc || 'none');
  v.require('index.html: text/html', /text\/html/.test(index?.h['content-type'] || ''), index?.h['content-type'] || 'none');
  v.require('index.html: compressed', /^(br|gzip)$/.test(index?.h['content-encoding'] || ''), index?.h['content-encoding'] || 'identity');

  // an SPA fallback answers unknown paths with index.html: not an asset
  const assets = [...seen.entries()].filter(([u, r]) => new URL(u).pathname.startsWith(root.pathname.replace(/\/?$/, '/') + 'assets/') && r.status === 200 && !(/text\/html/.test(r.h['content-type'] || '') && !u.endsWith('.html')));
  const kinds = { js: 0, css: 0, wasm: 0, font: 0, other: 0 };
  const fail = { cache: [], enc: [], type: [], vary: [] };
  for (const [u, r] of assets) {
    const p = new URL(u).pathname;
    const ext = p.split('.').pop();
    const kind = ext === 'js' || ext === 'mjs' ? 'js' : ext === 'css' ? 'css' : ext === 'wasm' ? 'wasm' : /^woff2?$/.test(ext) ? 'font' : 'other';
    kinds[kind]++;
    const c = (r.h['cache-control'] || '').toLowerCase();
    const maxAge = Number(c.match(/max-age=(\d+)/)?.[1] ?? 0);
    if (!(c.includes('immutable') && maxAge >= 31536000)) fail.cache.push(`${p} (${c || 'none'})`);
    const enc = r.h['content-encoding'] || '';
    // files under 1 KB gain nothing from compression (the build writes no .br for them either)
    if (/^(js|mjs|css|wasm|svg|json|html)$/.test(ext) && !/^(br|gzip)$/.test(enc) && Number(r.h['content-length'] ?? r.body.length) >= 1024) fail.enc.push(`${p} (${enc || 'identity'})`);
    if (enc && !/accept-encoding/i.test(r.h.vary || '')) fail.vary.push(p);
    const ct = r.h['content-type'] || '';
    const want = { js: /javascript/, css: /text\/css/, wasm: /^application\/wasm/, font: /font\/woff2?|application\/font-woff/ }[kind];
    if (want && !want.test(ct)) fail.type.push(`${p} (${ct || 'none'})`);
  }
  console.log(`checked ${seen.size} URLs, ${assets.length} hashed assets: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  const br = assets.filter(([, r]) => r.h['content-encoding'] === 'br').length;
  console.log(`encodings: ${br} br, ${assets.filter(([, r]) => r.h['content-encoding'] === 'gzip').length} gzip, ${assets.filter(([, r]) => !r.h['content-encoding']).length} identity`);
  const wasm = assets.find(([u]) => u.endsWith('.wasm'));
  if (wasm) console.log(`wasm: ${new URL(wasm[0]).pathname} ${wasm[1].h['content-type']} ${wasm[1].h['content-encoding'] || 'identity'} ${(Number(wasm[1].h['content-length'] || wasm[1].body.length) / 1048576).toFixed(2)} MB on the wire`);
  v.require('the Rapier .wasm is among the assets', kinds.wasm > 0);
  v.require('JS and CSS found', kinds.js > 0 && kinds.css > 0, `${kinds.js} js, ${kinds.css} css`);
  v.require('/assets/*: immutable, max-age ≥ 1 year', !fail.cache.length, fail.cache.slice(0, 3).join(' · '));
  v.require('JS / CSS / WASM compressed (br or gzip)', !fail.enc.length, fail.enc.slice(0, 3).join(' · '));
  v.require('Content-Type (application/wasm, JS, CSS, fonts)', !fail.type.length, fail.type.slice(0, 3).join(' · '));
  v.require('Vary: Accept-Encoding on compressed responses', !fail.vary.length, fail.vary.slice(0, 3).join(' · '));
  // Phase 7: one robot GLB and the MuJoCo wasm
  const hdr = (r) => `${r.h['content-type'] || 'none'} · ${r.h['content-encoding'] || 'identity'} · ${r.h['cache-control'] || 'no cache-control'}`;
  const glb = assets.find(([u]) => u.endsWith('.glb'));
  if (!glb) v.note('pending: no robot GLB referenced by the build yet');
  else {
    const [u, r] = glb;
    console.log(`glb: ${new URL(u).pathname} ${hdr(r)}`);
    v.require('a robot GLB: model/gltf-binary', /^model\/gltf-binary/.test(r.h['content-type'] || ''), hdr(r));
    v.require('a robot GLB: br', r.h['content-encoding'] === 'br', hdr(r));
    v.require('a robot GLB: immutable', /immutable/.test(r.h['cache-control'] || ''), hdr(r));
  }
  const mj = assets.find(([u]) => /mujoco[^/]*\.wasm$/i.test(u));
  if (!mj) v.note('pending: no MuJoCo .wasm in the build yet (WP5)');
  else {
    const [u, r] = mj;
    console.log(`mujoco wasm: ${new URL(u).pathname} ${hdr(r)} ${(Number(r.h['content-length'] || r.body.length) / 1048576).toFixed(2)} MB on the wire`);
    v.require('MuJoCo wasm: application/wasm', /^application\/wasm/.test(r.h['content-type'] || ''), hdr(r));
    v.require('MuJoCo wasm: compressed (br or gzip)', /^(br|gzip)$/.test(r.h['content-encoding'] || ''), hdr(r));
    v.require('MuJoCo wasm: immutable', /immutable/.test(r.h['cache-control'] || ''), hdr(r));
  }
} finally {
  await srv?.close();
}
v.exit(args);
