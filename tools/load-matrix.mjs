#!/usr/bin/env node
// Time-to-play of the production build on emulated connections and CPUs (promoted from the phase 6
// perf-load audit: load-run.mjs + servers.mjs + summarize.mjs + table.mjs).
//
//   node tools/load-matrix.mjs                       # the default cells below, 3 runs each, CDN-like server
//   node tools/load-matrix.mjs --matrix full         # cable / 4g / slow4g × CPU 1× / 4× × cdn / preview
//   node tools/load-matrix.mjs --server preview --profile slow4g --cpu 1
//   node tools/load-matrix.mjs --dist rc3=<dir> --dist head=<dir>   # A/B, runs interleave
//   node tools/load-matrix.mjs --lap                 # a scripted full playthrough transfers ≤ 8 MB (§5.6)
//   options: --runs 3  --no-play (stop at the title)  --query '?reset=1'  --no-check
//
// Per run: a fresh browser context (empty HTTP cache), CDP network + CPU throttling and in-page
// marks for first paint, the loading screen, the title (Start visible), Start → control, the first
// step, long tasks, frames rendered behind the loading overlay, bytes and third-party requests.
// Servers: `cdn` = HTTPS + HTTP/2, brotli 11, immutable /assets/* (README "Hosting"); `preview` =
// `vite preview` with the project config (what `npm run preview` serves).
// Prints the medians per cell and checks the phase 6 plan targets (C1, C8, C13, B1, B2); exit 1 on a miss.
// Raw runs: artifacts/<PT_DIR|measure>/load-matrix.json.
import { Verdict, distsFromArgs, serveDist, serveCdn, launchChromium, median, range, parseArgs, saveJson, list, round } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));

/**
 * --lap (plan §5.6): one fresh profile on the CDN-like server plays the whole game by script and the
 * bytes on the wire are summed: the title, every area (loadAll, then each area visited: approach,
 * walk in, its solve hooks, so robots, workers and MuJoCo load as they would), the Startprüfung and
 * the lift-off (WP13's world:liftoff-skip, else the rc4 ending). Target ≤ 8 MB in all (GDD).
 */
async function lapMode() {
  const CAP = 8 * 1024 * 1024;
  const [d] = await distsFromArgs(args);
  const srv = await serveCdn(d.dir);
  const browser = await launchChromium({ spki: srv.spki });
  const marks = [];
  let errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
    const mark = (m) => marks.push({ m, at: srv.log.length });
    const ev = (code) => page.evaluate(`(async () => { ${code} })()`);
    const W = (ms) => page.waitForTimeout(ms);
    await page.goto(`${srv.url}/?reset=1&skipIntro=1&lang=de&mode=entdecker`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
    mark('title');
    await ev(`if (typeof __academy.loadAll === 'function') await __academy.loadAll();`);
    await W(2000);
    mark('all areas');
    const areas = await page.evaluate(() => __academy.manifests('all').filter((m) => m.hasCode && !m.id.startsWith('_')).map((m) => ({ id: m.id, n: m.stations.length })));
    const acts = new Set(await page.evaluate(() => __academy.debugActions()));
    for (const a of areas) {
      await ev(`__academy.teleport('${a.id}')`);
      await W(2500);
      await ev(`__academy.press('KeyW', 1400)`);
      await W(2000);
      for (let i = 0; i < a.n; i++) {
        const h = `${a.id}:solve-${'abc'[i]}`;
        if (!acts.has(h)) continue;
        await ev(`await __academy.solve('${a.id}','solve-${'abc'[i]}'); __academy.closeModals(); __academy.exitOperate();`);
        await W(1500);
      }
      mark(a.id);
    }
    await ev(`await __academy.solve('world','finale-goto')`);
    await W(2000);
    for (const h of ['finale-f1-solve', 'finale-f2-solve', 'finale-f3-solve']) await ev(`await __academy.solve('world','${h}')`);
    await W(3000);
    if (acts.has('world:liftoff-skip')) await ev(`await __academy.solve('world','liftoff-skip')`);
    else await ev(`__academy.closeModals(); await __academy.solve('world','finale-ending')`);
    await W(15000);
    mark('finale');
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
    await srv.close();
  }
  const log = srv.log;
  const sum = (from, to) => log.slice(from, to).reduce((a, e) => a + e.sent, 0);
  const kind = (p) => (/\.glb$/.test(p) ? 'robots' : /\.wasm$/.test(p) ? 'wasm' : /\.woff2?$|\.ttf$/.test(p) ? 'fonts' : /\.js$/.test(p) ? 'js' : 'other');
  const by = {};
  for (const e of log) by[kind(e.path)] = (by[kind(e.path)] ?? 0) + e.sent;
  const total = sum(0);
  const MB = (n) => `${(n / 1048576).toFixed(2)} MB`;
  console.log(`lap: ${log.length} responses, ${MB(total)} on the wire (${Object.entries(by).map(([k, v]) => `${k} ${MB(v)}`).join(' · ')})`);
  let prev = 0;
  for (const m of marks) {
    console.log(`  ${m.m.padEnd(16)} +${MB(sum(prev, m.at)).padStart(9)}  (cumulative ${MB(sum(0, m.at))})`);
    prev = m.at;
  }
  const top = [...log].sort((a, b) => b.sent - a.sent).slice(0, 12);
  console.log(`  largest: ${top.map((e) => `${e.path.split('/').pop()} ${(e.sent / 1024).toFixed(0)} KB`).join(', ')}`);
  for (const e of errors) console.log(`page error: ${e}`);
  saveJson('load-matrix-lap.json', { total, by, marks, log });
  const v = new Verdict('load-matrix --lap');
  v.check('a full playthrough on the wire', round(total / 1048576, 2), '<=', 8, ' MB');
  v.check('page errors', errors.length, '<=', 0);
  if (total > CAP) v.note('robots, MuJoCo and the region are the big items (§5.6)');
  v.exit(args);
}
if (args.lap) await lapMode();
const runs = Number(args.runs ?? 3);
const play = !args['no-play'];
const query = String(args.query ?? '?reset=1');

const PROFILES = {
  cable: { mbit: 40, rtt: 20, up: 10 },
  '4g': { mbit: 9, rtt: 85, up: 3 },
  slow4g: { mbit: 1.6, rtt: 150, up: 0.75 },
  none: null,
};

// Targets of the phase 6 plan (seconds). Cells without an entry are measured but not judged.
const TARGETS = {
  'cdn|cable|1': { title: 1.3, longTasks250: 0 }, // C13 (C2 alone: ≤ 1.5)
  'cdn|cable|4': { title: 4.5 }, // C13 (C2 alone: ≤ 5.8)
  'cdn|4g|1': { title: 3.8, fp: 0.4 }, // C13, C8
  'cdn|slow4g|1': { title: 11.4, fp: 0.8 }, // B2, C8
  'preview|slow4g|1': { title: 12.5 }, // B1 (precompressed files under npm run preview: "about 12.3 s")
};

let cells;
if (args.matrix === 'full') {
  cells = [];
  for (const server of ['cdn', 'preview']) for (const profile of ['cable', '4g', 'slow4g']) for (const cpu of [1, 4]) cells.push({ server, profile, cpu });
} else if (args.server || args.profile || args.cpu) {
  cells = [];
  for (const server of list(args.server, ['cdn'])) for (const profile of list(args.profile, ['cable'])) for (const cpu of list(args.cpu, ['1']).map(Number)) cells.push({ server, profile, cpu });
} else {
  cells = [
    { server: 'cdn', profile: 'cable', cpu: 1 },
    { server: 'cdn', profile: 'cable', cpu: 4 },
    { server: 'cdn', profile: '4g', cpu: 1 },
    { server: 'cdn', profile: 'slow4g', cpu: 1 },
  ];
}
for (const c of cells) if (!(c.profile in PROFILES)) throw new Error(`unknown profile ${c.profile} (${Object.keys(PROFILES).join(', ')})`);

// In-page marks (installed before any page script).
const INIT = () => {
  const L = (window.__lt = { phases: [], lt: [], paints: [], marks: {}, raf: { n: 0, ms: 0, max: 0, beforeDone: 0, beforeDoneMs: 0 } });
  const now = () => Math.round(performance.now());
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) L.paints.push([e.name, Math.round(e.startTime)]); }).observe({ type: 'paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) L.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
  } catch {}
  // time spent in rAF callbacks; before the loading overlay fades these frames are invisible
  const raf0 = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf0((t) => {
      const a = performance.now();
      try {
        cb(t);
      } finally {
        const d = performance.now() - a;
        L.raf.n++;
        L.raf.ms += d;
        if (d > L.raf.max) L.raf.max = d;
        if (!L.marks.loadingDone) {
          L.raf.beforeDone++;
          L.raf.beforeDoneMs += d;
        }
      }
    });
  let lastStatus = null;
  const check = () => {
    const ld = document.getElementById('loading');
    if (ld && !L.marks.loadingDom) {
      L.marks.loadingDom = now();
      raf0(() => (L.marks.loadingRaf = now()));
    }
    if (ld) {
      const s = (ld.querySelector('.status')?.textContent ?? '') + ' ' + (ld.querySelector('.bar i')?.style.width ?? '');
      if (s !== lastStatus) L.phases.push([now(), (lastStatus = s)]);
      if (ld.classList.contains('done') && !L.marks.loadingDone) L.marks.loadingDone = now();
      if (ld.classList.contains('hidden') && !L.marks.loadingHidden) L.marks.loadingHidden = now();
      const err = ld.querySelector('.err')?.textContent;
      if (err && !L.marks.err) L.marks.err = [now(), err];
    }
    const sb = document.getElementById('start-btn');
    if (sb && !L.marks.startVisible && !sb.closest('.hidden') && sb.getBoundingClientRect().width > 0) L.marks.startVisible = now();
    if (window.__academy?.ready && !L.marks.ready) L.marks.ready = now();
  };
  const mo = new MutationObserver(check);
  const startMo = () => {
    L.marks.dcl = now();
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    check();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMo);
  else startMo();
  const iv = setInterval(() => {
    check();
    if (L.marks.loadingHidden && L.marks.ready) {
      mo.disconnect();
      clearInterval(iv);
    }
  }, 16);
};

async function oneRun(browser, srv, cell) {
  const prof = PROFILES[cell.profile];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ignoreHTTPSErrors: !srv.spki && srv.url.startsWith('https') });
  try {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    if (prof) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: prof.rtt, downloadThroughput: (prof.mbit * 1e6) / 8, uploadThroughput: (prof.up * 1e6) / 8 });
    if (cell.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cell.cpu });
    const net = new Map();
    const origin = new URL(srv.url).origin;
    // Playwright's context events also see requests from workers (troika fetches fallback fonts in one)
    const seen = new Set();
    ctx.on('request', (r) => seen.add(r.url()));
    cdp.on('Network.requestWillBeSent', (e) => net.set(e.requestId, { url: e.request.url, bytes: 0 }));
    cdp.on('Network.responseReceived', (e) => {
      const r = net.get(e.requestId);
      if (r) {
        r.status = e.response.status;
        r.enc = e.response.headers['content-encoding'] ?? e.response.headers['Content-Encoding'] ?? null;
        r.proto = e.response.protocol;
      }
    });
    cdp.on('Network.loadingFinished', (e) => {
      const r = net.get(e.requestId);
      if (r) r.bytes = e.encodedDataLength;
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGE ' + String(e.message || e).slice(0, 300)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/GPU stall/.test(m.text())) errors.push(m.text().slice(0, 300));
    });
    await page.addInitScript(INIT);
    await page.goto(`${srv.url}/${query}`, { waitUntil: 'commit', timeout: 300000 });
    await page.waitForFunction(() => window.__lt && (window.__lt.marks.startVisible || window.__lt.marks.err), null, { timeout: 300000, polling: 50 });
    let tClick = null;
    let tControl = null;
    let tMoved = null;
    if (play && (await page.evaluate(() => !!window.__lt.marks.startVisible))) {
      // an eager visitor: click Start as soon as it shows, skip the ascent, walk
      tClick = await page.evaluate(() => Math.round(performance.now()));
      await page.click('#start-btn', { timeout: 60000 });
      await page.waitForTimeout(400);
      await page.keyboard.press('Space');
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const c = await page.evaluate(() => ({ t: Math.round(performance.now()), cine: document.querySelector('#hud')?.classList.contains('cinematic') ?? false, st: window.__academy.state() }));
        if (c.st.phase === 'playing' && !c.cine && c.st.objective) {
          tControl = c.t;
          break;
        }
        await page.waitForTimeout(50);
      }
      const p0 = await page.evaluate(() => window.__academy.state().player.pos);
      await page.keyboard.down('KeyW');
      for (let k = 0; k < 80; k++) {
        const c = await page.evaluate(() => ({ t: Math.round(performance.now()), p: window.__academy.state().player.pos }));
        if (Math.hypot(c.p[0] - p0[0], c.p[2] - p0[2]) > 0.05) {
          tMoved = c.t;
          break;
        }
        await page.waitForTimeout(16);
      }
      await page.keyboard.up('KeyW');
    }
    await page.waitForTimeout(1000);
    const L = await page.evaluate(() => window.__lt);
    const reqs = [...net.values()].filter((r) => !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
    const thirdParty = [...new Set([...reqs.map((r) => r.url), ...seen])].filter((u) => {
      try {
        return /^(https?|wss?):/.test(u) && new URL(u).origin !== origin;
      } catch {
        return false;
      }
    });
    const fp = L.paints.find((p) => p[0] === 'first-paint')?.[1] ?? null;
    const fcp = L.paints.find((p) => p[0] === 'first-contentful-paint')?.[1] ?? null;
    const title = L.marks.startVisible ?? null;
    return {
      fp,
      fcp,
      loading: L.marks.loadingRaf ?? null,
      title,
      overlayGone: L.marks.loadingHidden ?? null,
      clickToControl: tControl && tClick ? tControl - tClick : null,
      moved: tMoved,
      longTasks200: L.lt.filter((x) => x[1] >= 200).length,
      longTasks250BeforeTitle: L.lt.filter((x) => x[1] > 250 && (title == null || x[0] < title)).length,
      longTaskMax: Math.max(0, ...L.lt.map((x) => x[1])),
      hiddenFrames: L.raf.beforeDone,
      hiddenFrameMs: Math.round(L.raf.beforeDoneMs),
      bytes: reqs.reduce((a, r) => a + (r.bytes || 0), 0),
      requests: reqs.length,
      encodings: [...new Set(reqs.map((r) => r.enc || 'identity'))],
      protocol: reqs[0]?.proto ?? null,
      thirdParty,
      err: L.marks.err ?? null,
      errors,
      phases: L.phases,
    };
  } finally {
    await ctx.close();
  }
}

const dists = await distsFromArgs(args);
const servers = new Map();
const results = [];
let browser = null;
try {
  for (const d of dists) for (const kind of new Set(cells.map((c) => c.server))) servers.set(`${d.label}|${kind}`, await serveDist(kind, d.dir));
  const spki = [...servers.values()].find((s) => s.spki)?.spki ?? null;
  browser = await launchChromium({ spki });
  for (const cell of cells) {
    for (let i = 1; i <= runs; i++) {
      for (const d of dists) {
        const srv = servers.get(`${d.label}|${cell.server}`);
        const r = await oneRun(browser, srv, cell);
        const rec = { dist: d.label, ...cell, run: i, ...r };
        results.push(rec);
        const s = (v) => (v == null ? '-' : (v / 1000).toFixed(2));
        console.log(`${d.label} ${cell.server} ${cell.profile} cpu${cell.cpu} run${i}: FP ${s(r.fp)} loading ${s(r.loading)} title ${s(r.title)} moved ${s(r.moved)} | ${(r.bytes / 1048576).toFixed(2)} MB ${r.requests} req ${r.encodings.join('/')} ${r.protocol ?? ''} | long tasks >200 ${r.longTasks200} (max ${r.longTaskMax}) | hidden frames ${r.hiddenFrames} (${r.hiddenFrameMs} ms) | 3rd-party ${r.thirdParty.length} | errors ${r.errors.length}${r.err ? ' | LOAD ERROR ' + r.err[1] : ''}`);
      }
    }
  }
} finally {
  await browser?.close().catch(() => {});
  for (const s of servers.values()) await s.close().catch(() => {});
}

// ── medians per cell ──
const v = new Verdict('load-matrix');
const sec = (x) => (x == null ? null : round(x / 1000, 2));
console.log('\ndist | server | profile | cpu | n | FP s | FCP s | loading s | title s (range) | Start→control s | moved s | long tasks>200 (max ms) | LT>250 before title | hidden frames (ms) | MB | req | 3rd-party');
const summary = [];
for (const cell of cells) {
  for (const d of dists) {
    const rs = results.filter((r) => r.dist === d.label && r.server === cell.server && r.profile === cell.profile && r.cpu === cell.cpu);
    const m = (k) => median(rs.map((r) => r[k]));
    const row = {
      dist: d.label,
      ...cell,
      n: rs.length,
      fp: sec(m('fp')),
      fcp: sec(m('fcp')),
      loading: sec(m('loading')),
      title: sec(m('title')),
      titleRange: range(rs.map((r) => sec(r.title))),
      clickToControl: sec(m('clickToControl')),
      moved: sec(m('moved')),
      longTasks200: m('longTasks200'),
      longTaskMax: m('longTaskMax'),
      longTasks250BeforeTitle: m('longTasks250BeforeTitle'),
      hiddenFrames: m('hiddenFrames'),
      hiddenFrameMs: m('hiddenFrameMs'),
      mb: round(m('bytes') / 1048576, 2),
      requests: m('requests'),
      thirdParty: Math.max(0, ...rs.map((r) => r.thirdParty.length)),
      errors: rs.reduce((a, r) => a + r.errors.length + (r.err ? 1 : 0), 0),
    };
    summary.push(row);
    console.log(`${row.dist} | ${row.server} | ${row.profile} | ${row.cpu} | ${row.n} | ${row.fp ?? '-'} | ${row.fcp ?? '-'} | ${row.loading ?? '-'} | ${row.title ?? '-'} (${row.titleRange}) | ${row.clickToControl ?? '-'} | ${row.moved ?? '-'} | ${row.longTasks200} (${row.longTaskMax}) | ${row.longTasks250BeforeTitle} | ${row.hiddenFrames} (${row.hiddenFrameMs}) | ${row.mb} | ${row.requests} | ${row.thirdParty}`);
    const tag = `${dists.length > 1 ? d.label + ' ' : ''}${cell.server} ${cell.profile} cpu${cell.cpu}`;
    const t = TARGETS[`${cell.server}|${cell.profile}|${cell.cpu}`];
    if (t?.title != null) v.check(`${tag}: title`, row.title, '<=', t.title, ' s');
    if (t?.fp != null) v.check(`${tag}: first paint`, row.fp, '<=', t.fp, ' s');
    if (t?.longTasks250 != null) v.check(`${tag}: long tasks > 250 ms before the title`, row.longTasks250BeforeTitle, '<=', t.longTasks250);
    v.check(`${tag}: third-party requests`, row.thirdParty, '<=', 0);
    v.check(`${tag}: load errors`, row.errors, '<=', 0);
  }
}
if (dists.length > 1) v.note('A/B run: every dist is judged against the same targets; compare the medians above.');
const third = [...new Set(results.flatMap((r) => r.thirdParty))];
if (third.length) v.note(`third-party URLs: ${third.slice(0, 6).join(' ')}`);
const f = saveJson('load-matrix.json', { cells, runs, summary, results });
console.log(`raw runs: ${f}`);
v.exit(args);
