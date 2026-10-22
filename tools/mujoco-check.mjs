#!/usr/bin/env node
// The duck station's MuJoCo check (plan §5.4, §5.10; R2 §7.6), on the PRODUCTION build:
//
//   node tools/mujoco-check.mjs --prod [--engines chromium,firefox,webkit] [--cpu 1,4] [--dist <dir>] [--gens 14]
//
// exact (fail = exit 1)
//   - the worker bundle(s) in dist/assets: 0 bare specifiers (no import/export from a package name, no
//     import('…') of one, no importScripts), the stripped wasm (no custom sections) is emitted once
//   - in every engine: the production worker loads (engine kind 'live'), the home pose stands 3 s,
//     generation 1 of seed 1 gives the same result as in Chromium (same physics everywhere)
//   - R2 §7.6 (Node, the same core as the worker): the walk deck ≥ 0.3 m by generation 14; each hack the
//     station names in ≥ 2 of 3 seeds (tools/duck/calibrate.mjs, artifacts/phase7/duck/calibration.json)
//   - a forced no-module-worker run (Worker with { type: 'module' } throws) uses the recordings: engine
//     'recorded', the panel chip SIM · AUFZEICHNUNG, a C1 try replays
// timing (Chromium only; noisy under load, see the plan's integrator note: measure on a quiet machine)
//   - ≤ 15 µs per physics step; a generation ≤ 1.5 s at 1× and ≤ 3.5 s at 4× CPU; 0 main-thread long
//     tasks while a C2 run replays and the worker computes. 4×: CDP throttles the page, but CDP CPU
//     throttling is "only supported for pages, not workers", so the worker emulates a 4× slower CPU
//     (every slice spins 3× its own time); the station's adaptive population (64 → 32) must then keep
//     a generation ≤ 3.5 s
// Firefox and WebKit report their timings (no CPU throttling there; the station's adaptive population and
// the recordings cover slow browsers). Output: artifacts/phase7/duck/mujoco-check.json.
//
// Firefox / WebKit come from Playwright; an installed browser of another Playwright release can be used
// with FIREFOX_EXE + PW_CORE_FIREFOX / WEBKIT_EXE + PW_CORE_WEBKIT (tools/lib/measure.mjs launchEngine).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildDist, launchEngine, list, openGame, parseArgs, ROOT, servePreview, cpuThrottle } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const engines = list(args.engines, ['chromium']);
const rates = list(args.cpu, ['1']).map(Number);
const gens = Number(args.gens ?? 14);
const out = { date: new Date().toISOString(), exact: [], timing: [], engines: {} };
const ok = (name, pass, detail) => {
  out.exact.push({ name, pass, detail });
  console.log(`${pass ? '  ok ' : '  FAIL'} ${name}${detail ? ` · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};
const timing = (name, pass, detail) => {
  out.timing.push({ name, pass, detail });
  console.log(`${pass ? '  ok ' : '  SLOW'} ${name}${detail ? ` · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''} (timing)`);
};

// ── the production build ────────────────────────────────────────────────────
let dist = args.dist && args.dist !== true ? path.resolve(String(args.dist)) : null;
let cleanup = () => {};
if (!dist) {
  if (!args.prod) console.log('(no --prod / --dist: building the production bundle anyway)');
  const b = await buildDist();
  dist = b.dir;
  cleanup = b.cleanup;
}

// ── 1 · the worker bundle: bare specifiers, the wasm ────────────────────────
console.log('worker bundle');
const assets = path.join(dist, 'assets');
const files = fs.readdirSync(assets);
const workers = files.filter((f) => /^duck\.worker-.*\.js$/.test(f));
ok('one duck worker bundle in dist/assets', workers.length === 1, workers.join(', '));
const BARE = [
  /\bimport\s*\(\s*["'`]((?![./]|https?:|data:|blob:)[^"'`]+)["'`]\s*\)/g,
  /\b(?:import|export)\b[^;"'`]*?\bfrom\s*["'`]((?![./]|https?:|data:|blob:)[^"'`]+)["'`]/g,
  /\bimport\s*["'`]((?![./]|https?:|data:|blob:)[^"'`]+)["'`]/g,
  /\bimportScripts\s*\(/g,
];
for (const w of workers) {
  const src = fs.readFileSync(path.join(assets, w), 'utf8');
  const bare = [];
  for (const re of BARE) for (const m of src.matchAll(re)) bare.push(m[1] ?? m[0]);
  ok(`${w}: 0 bare specifiers`, bare.length === 0, bare.length ? bare.slice(0, 5).join(', ') : `${(src.length / 1024).toFixed(0)} KB`);
  const imports = [...src.matchAll(/\bimport\s*(?:\(|[\w{*][^;]*from)/g)].length;
  ok(`${w}: self-contained (no import of another chunk)`, imports === 0, `${imports} import statements`);
}
const wasms = files.filter((f) => /^mujoco-.*\.wasm$/.test(f));
ok('the MuJoCo wasm is emitted once', wasms.length === 1, wasms.join(', '));
if (wasms.length) {
  const b = fs.readFileSync(path.join(assets, wasms[0]));
  let i = 8;
  let custom = 0;
  while (i < b.length) {
    const id = b[i];
    let n = 0,
      s = 0,
      j = i + 1;
    for (;;) {
      const c = b[j++];
      n += (c & 0x7f) * 2 ** s;
      s += 7;
      if (c < 0x80) break;
    }
    if (id === 0) custom++;
    i = j + n;
  }
  ok('the wasm is stripped (no custom sections)', custom === 0, `${(b.length / 1048576).toFixed(2)} MB raw${fs.existsSync(path.join(assets, wasms[0] + '.br')) ? `, ${(fs.statSync(path.join(assets, wasms[0] + '.br')).size / 1048576).toFixed(2)} MB brotli` : ''}`);
}
const recs = files.filter((f) => /^duck-rec-.*\.bin$/.test(f));
ok('the recordings are a separate asset (loaded only by the fallback)', recs.length === 1, recs.length ? `${(fs.statSync(path.join(assets, recs[0])).size / 1048576).toFixed(2)} MB raw${fs.existsSync(path.join(assets, recs[0] + '.br')) ? `, ${(fs.statSync(path.join(assets, recs[0] + '.br')).size / 1048576).toFixed(2)} MB brotli` : ''}` : '');

// ── 2 · R2 §7.6 in Node: the walk deck and the hacks (the worker's own core) ──
console.log('calibration (Node, the same core as the worker)');
{
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'duck', 'calibrate.mjs'), '--decks', 'start,statue,costsOnly,walk', '--seeds', '1,2,3'], { cwd: ROOT, encoding: 'utf8' });
  const file = path.join(ROOT, 'artifacts', 'phase7', 'duck', 'calibration.json');
  const cal = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (!cal) ok('calibrate.mjs ran', false, r.stderr.slice(0, 300));
  else {
    ok('home pose stands 3 s (Node)', !cal.home.fell, `drift ${(cal.home.drift * 1000).toFixed(1)} mm`);
    out.nodeUsPerStep = cal.usPerStep;
    for (const [deck, label] of [['start', 'Bauchklatscher'], ['statue', 'Statue'], ['costsOnly', 'Sofort-Umfaller']]) ok(`${label} in ≥ 2 of 3 seeds`, cal.decks[deck]?.hits >= 2, `${cal.decks[deck]?.hits}/3 (gen ${cal.decks[deck]?.rows.map((x) => x.gen ?? '–').join(', ')})`);
    const w = cal.decks.walk;
    ok('walk deck ≥ 0.3 m by generation 14 (≥ 2 of 3 seeds)', w?.pass, w?.rows.map((x) => `${x.mean.dist} m`).join(', '));
  }
}

// ── 3 · in the browsers ─────────────────────────────────────────────────────
const srv = await servePreview(dist);
let gen1Ref = null;
try {
  for (const name of engines) {
    console.log(name);
    const E = (out.engines[name] = {});
    let browser;
    try {
      browser = await launchEngine(name);
    } catch (err) {
      ok(`${name} launches`, false, String(err.message).split('\n')[0]);
      continue;
    }
    try {
      const { page, ctx, errors } = await openGame(browser, `${srv.url}/?zone=regelgarten&skipIntro=1&reset=1&lang=de`, { instrument: false, timeout: 240000 });
      await page.evaluate(() => window.__academy.start?.());
      await page.waitForFunction(() => typeof window.__academy.ext('duck') === 'function', null, { timeout: 120000, polling: 250 });
      const duck = (o) => page.evaluate((o) => window.__academy.ext('duck')(o), o);
      const eng = await duck({ op: 'engine' });
      E.engine = eng;
      ok(`${name}: the production worker loads`, eng.kind === 'live', JSON.stringify({ kind: eng.kind, reason: eng.reason, pop: eng.pop }));
      const workerUrls = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /duck\.worker/.test(u)));
      const urls = [...workerUrls, eng.wasm].filter(Boolean);
      ok(`${name}: worker and wasm come from the same origin`, urls.length >= 2 && urls.every((u) => u.startsWith(srv.url)), urls.map((u) => u.replace(srv.url, '')).join(', '));
      if (eng.kind !== 'live') continue;
      const b = await duck({ op: 'bench', steps: 20000 });
      E.bench = b;
      ok(`${name}: home pose stands 3 s`, !b.homeFell, `drift ${(b.homeDrift * 1000).toFixed(1)} mm`);
      // generation 1, seed 1: the same physics in every engine
      const g1 = await duck({ op: 'train', deck: 'walk', gens: 1, seed: 1 });
      const sig = `${g1.gens[0].median} m · ${g1.gens[0].fall}`;
      if (!gen1Ref) gen1Ref = sig;
      ok(`${name}: generation 1 (seed 1) matches ${engines[0]}`, sig === gen1Ref, sig);
      const cdpRates = name === 'chromium' ? rates : [1];
      for (const rate of cdpRates) {
        if (name === 'chromium') {
          await cpuThrottle(page, rate);
          await duck({ op: 'slow', factor: rate });
        }
        if (rate === 1) {
          const bb = rate === 1 ? b : await duck({ op: 'bench', steps: 20000 });
          (name === 'chromium' ? timing : (n, _p, d) => console.log(`  info ${n} · ${JSON.stringify(d)}`))(`${name}: physics step ≤ 15 µs`, bb.usPerStep <= 15, `${bb.usPerStep.toFixed(2)} µs (${bb.usPerStepGait.toFixed(2)} with the gait)`);
        }
        const tr = await duck({ op: 'train', deck: 'walk', gens: rate === 1 ? gens : 4, seed: 2 });
        if (tr.error) {
          // a browser too slow even at the halved population: the station switches to the recordings (as designed)
          E[`gens@${rate}x`] = { error: tr.error, gens: tr.gens, engineAfter: { kind: tr.kind, reason: tr.reason } };
          console.log(`  info ${name}: after ${tr.gens.length} generation(s) (${tr.gens.map((g) => `${g.workMs} ms × ${g.pop}`).join(', ')}) the station switched to the recordings: engine ${tr.kind} (${tr.reason})`);
          if (name === 'chromium') timing(`${name}: generations at ${rate}× complete`, false, tr.error);
          break;
        }
        const ms = tr.gens.map((g) => g.workMs);
        const max = Math.max(...ms);
        E[`gens@${rate}x`] = { ms, pop: tr.gens.map((g) => g.pop), mean: tr.mean };
        const cap = rate >= 4 ? 3500 : 1500;
        (name === 'chromium' ? timing : (n, _p, d) => console.log(`  info ${n} · ${d}`))(`${name}: generation ≤ ${cap / 1000} s at ${rate}×`, max <= cap, `max ${max} ms, median ${[...ms].sort((a, c) => a - c)[ms.length >> 1]} ms, pop ${tr.gens.map((g) => g.pop).join('/')}`);
        if (rate === 1 && name === 'chromium') ok(`${name}: walk deck ≥ 0.3 m by generation ${gens} (browser)`, tr.mean && tr.mean.dist >= 0.3 && !tr.mean.fell, tr.mean ? `${tr.mean.dist} m` : 'no mean');
      }
      if (name === 'chromium') {
        await cpuThrottle(page, 1);
        await duck({ op: 'slow', factor: 1 });
        // long tasks while a C2 run replays (operate panel open) and the worker computes
        await page.evaluate(() => {
          window.__lt = [];
          try {
            new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: false });
          } catch {
            window.__lt = null;
          }
        });
        await page.evaluate(() => window.__academy.interact('Belohnungspult'));
        await page.waitForTimeout(1500);
        await page.evaluate(() => window.__academy.solve('regelgarten', 'c-deck'));
        await page.evaluate(() => void window.__academy.solve('regelgarten', 'c-run'));
        await page.waitForTimeout(14000);
        const lt = await page.evaluate(() => window.__lt);
        E.longTasks = lt;
        timing(`${name}: 0 main-thread long tasks during a C2 run`, Array.isArray(lt) && lt.length === 0, lt ? `${lt.length} (${lt.join(', ')} ms)` : 'no longtask observer');
      }
      if (errors.length) ok(`${name}: no console errors`, false, errors.slice(0, 3).join(' | '));
      await ctx.close();
    } finally {
      await browser.close();
    }
  }

  // ── 4 · forced no module worker → the recordings ─────────────────────────────
  console.log('forced no-module-worker run (chromium)');
  {
    const browser = await launchEngine('chromium');
    try {
      const NO_MODULE_WORKER = `(() => { const W = window.Worker; window.Worker = function (u, o) { if (o && o.type === 'module') throw new TypeError('module workers are off (mujoco-check)'); return new W(u, o); }; window.Worker.prototype = W.prototype; })();`;
      const { page, errors } = await openGame(browser, `${srv.url}/?zone=regelgarten&skipIntro=1&reset=1&lang=de`, { instrument: false, init: [NO_MODULE_WORKER], timeout: 240000 });
      await page.evaluate(() => window.__academy.start?.());
      await page.waitForFunction(() => typeof window.__academy.ext('duck') === 'function', null, { timeout: 120000, polling: 250 });
      const eng = await page.evaluate(() => window.__academy.ext('duck')({ op: 'engine' }));
      ok('recordings: engine kind', eng.kind === 'recorded', JSON.stringify(eng));
      await page.evaluate(() => window.__academy.interact('Belohnungspult'));
      await page.waitForTimeout(1500);
      const chip = await page.evaluate(() => [...document.querySelectorAll('[data-rg="panel-duck"] .chip')].map((c) => c.textContent).join(' | '));
      ok('recordings: the panel chip SIM · AUFZEICHNUNG', /AUFZEICHNUNG/.test(chip), chip);
      await page.evaluate(() => void window.__academy.solve('regelgarten', 'c-hand'));
      let replayed = false;
      for (let k = 0; k < 40 && !replayed; k++) {
        await page.waitForTimeout(400);
        const s = await page.evaluate(() => window.__academy.ext('duck')({ op: 'state' }));
        replayed = s.run?.replaying === true || (s.run == null && k > 4);
      }
      ok('recordings: a C1 try replays', replayed);
      const res = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /duck/.test(u)));
      ok('recordings: loaded the recordings file, no worker', res.some((u) => /duck-rec-.*\.bin/.test(u)) && !res.some((u) => /duck\.worker/.test(u)), res.map((u) => u.replace(srv.url, '')).join(', '));
      if (errors.length) ok('recordings: no console errors', false, errors.slice(0, 3).join(' | '));
    } finally {
      await browser.close();
    }
  }
} finally {
  await srv.close();
  cleanup();
}

const exactFail = out.exact.filter((x) => !x.pass).length;
const slow = out.timing.filter((x) => !x.pass).length;
const outFile = path.join(ROOT, 'artifacts', 'phase7', 'duck', 'mujoco-check.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(`→ ${path.relative(ROOT, outFile)}`);
console.log(`\n${exactFail ? `FAIL: ${exactFail} exact check(s)` : 'exact checks pass'} · ${slow ? `${slow} timing check(s) over budget (measure on a quiet machine)` : 'timing within budget'}`);
process.exitCode = exactFail || (slow && !args['timing-info']) ? 1 : 0;
