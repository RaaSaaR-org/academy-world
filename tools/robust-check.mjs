#!/usr/bin/env node
// Edge cases of loading and running (promoted from the phase 6 perf-load audit's ux-checks.mjs and
// the ux-browsers-a11y audit's ctx3.mjs). Plan items C8 and C12.
//
//   node tools/robust-check.mjs [--dist <dir>] [--only phone,nowebgl2,ctx-restore,ctx-norestore,wasm,zone,glb,worker]
//
// Runs the production build on the CDN-like server (tools/lib/measure.mjs serveCdn):
//   phone          412×915 touch phone, slow 4G, CPU 4×: the "needs mouse and keyboard" notice
//                  shows within 1.5 s, after ≤ 50 KB
//   nowebgl2       no WebGL2 (4G): the message shows after ≤ 30 KB
//   ctx-restore    WebGL context lost and restored: while lost the frame counter stops and a
//                  message shows; afterwards the same view differs by ≤ 8/255 (mean) from before
//   ctx-norestore  lost for good: a reload button within 6 s
//   wasm           the WebAssembly request fails: a retry button; unblocked, a click reaches the title
//   zone           one zone chunk fails: the title still comes, only that zone errors (after the 3
//                  automatic retries of §5.8), the toast names the zone by its title. Phase 7, once the
//                  site has code: the
//                  Sonnenacker chunk blocked in Entdecker mode → its loading card („Erneut laden“),
//                  after two more failures „Bodencrew übernimmt“ → AKKU bereit by the crew (asset)
//                  and the lift-off still reachable (armed after F3 with the other systems)
//   glb            (§5.8) the first robot GLB the game asks for is blocked: 3 automatic retries
//                  (1, 3, 9 s), then the loading card with „Erneut laden“; on a ◆ station two failed
//                  „Erneut laden“ offer „Bodencrew übernimmt“. Pending while no area loads a robot
//   worker         (§5.4, §5.8) Web Workers unavailable: the duck station runs on recorded
//                  generations, chip „SIM · AUFZEICHNUNG“ (WP5's __academy.ext('robust:worker')
//                  hook starts the worker station). Pending until WP5 registers it
// Deterministic checks, one run each (the timings are single loads; --runs repeats phone/nowebgl2).
// Screenshots and details go to artifacts/<PT_DIR|measure>/robust/. Exit 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { Verdict, distsFromArgs, serveCdn, launchChromium, median, parseArgs, saveJson, list, round, ROOT } from './lib/measure.mjs';
import { decodePng } from './lib/png.mjs';

const args = parseArgs(process.argv.slice(2));
const only = list(args.only, ['phone', 'nowebgl2', 'ctx-restore', 'ctx-norestore', 'wasm', 'zone', 'glb', 'worker']);
const pending = [];
const runs = Number(args.runs ?? 1);
const dir = path.join(ROOT, 'artifacts', process.env.PT_DIR || 'measure', 'robust');
fs.mkdirSync(dir, { recursive: true });
const v = new Verdict('robust-check');
const out = {};

const [dist] = await distsFromArgs(args);
const srv = await serveCdn(dist.dir);
const browser = await launchChromium({ spki: srv.spki });
const U = srv.url;

async function newPage(o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...o });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  page.on('pageerror', (e) => logs.push(`pageerror: ${String(e.message || e)}`.slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // bytes received so far (including responses still in flight)
  const bytes = { n: 0 };
  cdp.on('Network.dataReceived', (e) => (bytes.n += e.encodedDataLength || 0));
  cdp.on('Network.responseReceived', (e) => (bytes.n += e.response.encodedDataLength || 0));
  return { ctx, page, logs, cdp, bytes };
}
const throttle = async (cdp, mbit, rtt, cpu = 1) => {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: (mbit * 1e6) / 8, uploadThroughput: (mbit * 1e6) / 8 / 4 });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
};
/** Wait until visible page text matches `re`; returns ms since `t0` or null. */
async function waitText(page, re, timeout, t0) {
  try {
    await page.waitForFunction((src) => new RegExp(src, 'i').test(document.body ? document.body.innerText : ''), re.source, { timeout, polling: 30 });
    return Date.now() - t0;
  } catch {
    return null;
  }
}
const visibleButton = (page, re) =>
  page.evaluate((src) => {
    const b = [...document.querySelectorAll('button, a')].find((x) => new RegExp(src, 'i').test(x.textContent || '') && x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden');
    return b ? (b.textContent || '').trim() : null;
  }, re.source);
const meanDiff = (a, b) => {
  const A = decodePng(a);
  const B = decodePng(b);
  let s = 0;
  let n = 0;
  for (let i = 0; i < Math.min(A.data.length, B.data.length); i++) {
    if (A.channels === 4 && i % 4 === 3) continue;
    s += Math.abs(A.data[i] - B.data[i]);
    n++;
  }
  return s / n;
};

const RETRY = /Erneut laden|Load again|Reload|Retry/i;
const CREW = /Bodencrew übernimmt|ground crew takes over/i;
const quest = (page) => page.evaluate(() => (window.__academy.quest ? window.__academy.quest() : window.__academy.game.quest?.snapshot?.()) ?? null);
/** Click the first visible button whose text matches; returns its text or null. */
const clickButton = (page, re) =>
  page.evaluate((src) => {
    const b = [...document.querySelectorAll('button, [role=button]')].find((x) => new RegExp(src, 'i').test(x.textContent || '') && x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden');
    if (!b) return null;
    b.click();
    return (b.textContent || '').trim();
  }, re.source);
const waitButton = async (page, re, ms) => {
  const t0 = Date.now();
  let b = null;
  while (Date.now() - t0 < ms && !(b = await visibleButton(page, re))) await page.waitForTimeout(250);
  return b;
};

/** §5.8: a ◆ site's chunk blocked (Sonnenacker, Entdecker): card → „Erneut laden“ ×2 → „Bodencrew übernimmt“ → AKKU by the crew. */
async function siteChunkCase() {
  const { ctx, page, logs } = await newPage();
  await page.route(/\/assets\/sonnenacker-[^/]*\.js(\?|$)/, (r) => r.abort('failed'));
  await page.goto(`${U}/?reset=1&skipIntro=1&mode=entdecker&area=sonnenacker`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000 });
  const hasCode = await page.evaluate(() => !!window.__academy.manifests('all').find((m) => m.id === 'sonnenacker')?.hasCode);
  if (!hasCode) {
    pending.push('zone (Phase 7): the Sonnenacker has no code yet (WP9): the Bodencrew offer for AKKU is not testable');
    await ctx.close();
    return;
  }
  const R = { card: null, clicks: [], crew: null };
  R.card = await waitButton(page, RETRY, 30000);
  v.require('site chunk blocked: the loading card offers „Erneut laden“', !!R.card, R.card ?? 'no button');
  for (let i = 0; i < 2 && R.card; i++) {
    R.clicks.push(await clickButton(page, RETRY));
    await page.waitForTimeout(15000);
  }
  R.crew = await waitButton(page, CREW, 20000);
  v.require('site chunk blocked twice more: „Bodencrew übernimmt“ is offered', !!R.crew, R.crew ?? 'no button');
  if (R.crew) {
    await clickButton(page, CREW);
    await page.waitForTimeout(1500);
    const q = await quest(page);
    R.energy = q?.start.energy ?? null;
    R.groundCrew = q?.groundCrew ?? null;
    v.require('Bodencrew: AKKU bereit by the crew (asset)', q && (q.start.energy.state === 'bereit' || q.start.energy.state === 'geprueft') && q.start.energy.by === 'crew' && q.groundCrew.some((c) => c.id === 'AKKU' && c.reason === 'asset'), JSON.stringify(R.energy));
  }
  R.logs = logs.slice(0, 8);
  out.siteChunk = R;
  console.log(`zone (Phase 7, sonnenacker): ${JSON.stringify({ ...R, logs: undefined }).slice(0, 300)}`);
  await ctx.close();
}

/** §5.8: the first robot GLB the game asks for fails: retries, the card, the Bodencrew offer on a ◆ station. */
async function glbCase() {
  const { ctx, page, logs } = await newPage();
  let target = null;
  const attempts = [];
  // the robot to block: the duck by default (an area robot with a ◆ area, the Regelgarten). Since wave 2
  // the first GLB of a boot is the island's own SO-101 (WP15's Winke-Arm, area 'world'), which no loading
  // card belongs to (integrator, wave 2); --robot <file prefix> picks another
  const want = String(args.robot && args.robot !== true ? args.robot : 'open-duck-mini-v2');
  await page.route(/\.glb(\?|$)/, (r) => {
    const file = new URL(r.request().url()).pathname.split('/').pop();
    if (!file.startsWith(`${want}-`) || file.includes('.l2-')) return r.continue();
    const name = want;
    target ??= name;
    if (name === target) {
      attempts.push(Date.now());
      return r.abort('failed');
    }
    return r.continue();
  });
  await page.goto(`${U}/?reset=1&skipIntro=1&mode=entdecker`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000 });
  await page.evaluate(() => typeof window.__academy.loadAll === 'function' && window.__academy.loadAll());
  // the area that owns the failing robot (a prefetch can start the fetch while the player is elsewhere)
  await page.evaluate(() => {
    window.__robotsFailed = [];
    window.__academy.game.events.on('robots:failed', (e) => window.__robotsFailed.push({ id: e.id, area: e.area }));
  });
  await page.waitForTimeout(3000);
  // walk the areas until one asks for a robot
  const areas = await page.evaluate(() => window.__academy.manifests('all').filter((m) => m.hasCode && !m.id.startsWith('_')).map((m) => m.id));
  let at = null;
  for (const a of areas) {
    if (target) break;
    await page.evaluate((id) => window.__academy.teleport(id), a);
    await page.waitForTimeout(4000);
    if (target) at = a;
  }
  if (!target) {
    pending.push('glb: no area loads a robot GLB yet (ctx.robots content: WP4 adapter + WP5/WP6/WP9/WP10/WP11)');
    await ctx.close();
    return;
  }
  const R = { robot: target, area: at, retries: 0, card: null, crew: null };
  await page.waitForTimeout(16000); // 1 + 3 + 9 s backoff
  R.retries = attempts.length - 1;
  R.gaps = attempts.slice(1).map((t, i) => round((t - attempts[i]) / 1000, 1));
  v.check(`glb ${target}: automatic retries`, R.retries, '>=', 3);
  // the loading card shows in the area the player stands in (WP1): go to the robot's own area
  const owner = await page.evaluate(() => window.__robotsFailed.find((e) => e.area && e.area !== 'world')?.area ?? null);
  if (owner && owner !== at) {
    R.fetchedAt = at;
    R.area = at = owner;
    await page.evaluate((id) => window.__academy.teleport(id), owner);
    await page.waitForTimeout(1500);
  }
  // teleport() stops at the gate, outside the area's radius: step in like a player (as text-audit does)
  await page.evaluate(() => window.__academy.press('KeyW', 1500));
  await page.waitForTimeout(1500);
  R.card = await waitButton(page, RETRY, 10000);
  v.require(`glb ${target}: the loading card offers „Erneut laden“`, !!R.card, R.card ?? 'no button');
  const star = await page.evaluate((id) => !!window.__academy.manifests('all').find((m) => m.id === id)?.stations.some((s) => s.star), at);
  if (R.card && star) {
    for (let i = 0; i < 2; i++) {
      await clickButton(page, RETRY);
      await page.waitForTimeout(15000);
    }
    R.crew = await waitButton(page, CREW, 10000);
    v.require(`glb ${target} at a ◆ area: „Bodencrew übernimmt“ after two failed „Erneut laden“`, !!R.crew, R.crew ?? 'no button');
  }
  R.logs = logs.slice(0, 8);
  out.glb = R;
  console.log(`glb: ${JSON.stringify({ ...R, logs: undefined }).slice(0, 300)}`);
  await ctx.close();
}

/** §5.4: no Web Workers → recorded generations, chip „SIM · AUFZEICHNUNG“. */
async function workerCase() {
  const { ctx, page, logs } = await newPage();
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('robust-check: Web Workers blocked');
      }
    };
  });
  await page.goto(`${U}/?reset=1&skipIntro=1&mode=entdecker`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000 });
  await page.evaluate(() => typeof window.__academy.loadAll === 'function' && window.__academy.loadAll());
  await page.waitForTimeout(2000);
  const has = await page.evaluate(() => typeof window.__academy.ext === 'function' && typeof window.__academy.ext('robust:worker') === 'function');
  if (!has) {
    pending.push("worker: no __academy.ext('robust:worker') hook yet (WP5 starts the MuJoCo duck station through it)");
    await ctx.close();
    return;
  }
  await page.evaluate(() => window.__academy.ext('robust:worker')());
  await page.waitForTimeout(6000);
  const chip = await page.evaluate(() => {
    const re = /SIM · AUFZEICHNUNG|SIM · RECORD(ING|ED)/i; // WP1's EN label is „SIM · RECORDED“ (src/ui/Kit.ts)
    if (re.test(document.body.innerText)) return 'dom';
    let hit = null;
    window.__academy.game.rs.scene.traverse((o) => {
      if (!hit && typeof o.text === 'string' && re.test(o.text)) hit = o.text.slice(0, 60);
    });
    return hit;
  });
  v.require('no Web Workers: the duck runs on recordings (chip „SIM · AUFZEICHNUNG“)', !!chip, chip ?? 'no chip');
  const errs = logs.filter((l) => l.startsWith('pageerror'));
  v.check('no Web Workers: page errors', errs.length, '<=', 0);
  out.worker = { chip, logs: logs.slice(0, 8) };
  console.log(`worker: ${JSON.stringify({ chip })}`);
  await ctx.close();
}

try {
  if (only.includes('phone')) {
    const t = [];
    const kb = [];
    for (let i = 0; i < runs; i++) {
      const { ctx, page, cdp, bytes, logs } = await newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
      await throttle(cdp, 1.6, 150, 4);
      const t0 = Date.now();
      await page.goto(`${U}/?reset=1`, { waitUntil: 'commit' });
      const ms = await waitText(page, /Maus und Tastatur|mouse and keyboard/, 180000, t0);
      t.push(ms);
      kb.push(bytes.n / 1024);
      if (i === 0) await page.screenshot({ path: path.join(dir, 'phone.png') });
      out.phone = { ms: t, kb: kb.map((x) => round(x, 1)), logs: logs.slice(0, 8) };
      await ctx.close();
    }
    console.log(`phone: notice after ${t.map((x) => (x == null ? 'never' : (x / 1000).toFixed(2) + ' s')).join(', ')} · ${kb.map((x) => x.toFixed(0)).join(', ')} KB`);
    v.check('phone: notice visible after', median(t) == null ? null : median(t) / 1000, '<=', 1.5, ' s');
    v.check('phone: transferred until the notice', median(kb), '<=', 50, ' KB');
  }

  if (only.includes('nowebgl2')) {
    const kb = [];
    let shown = false;
    for (let i = 0; i < runs; i++) {
      const { ctx, page, cdp, bytes } = await newPage();
      await throttle(cdp, 9, 85);
      await page.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...a) {
          return type === 'webgl2' ? null : orig.call(this, type, ...a);
        };
      });
      const t0 = Date.now();
      await page.goto(`${U}/`, { waitUntil: 'commit' });
      shown = (await waitText(page, /WebGL ?2/, 30000, t0)) != null;
      await page.waitForTimeout(2000); // anything still downloading counts
      kb.push(bytes.n / 1024);
      if (i === 0) await page.screenshot({ path: path.join(dir, 'nowebgl2.png') });
      out.nowebgl2 = { shown, kb: kb.map((x) => round(x, 1)), text: (await page.evaluate(() => document.body.innerText)).slice(0, 300) };
      await ctx.close();
    }
    console.log(`nowebgl2: message ${shown ? 'shown' : 'NOT shown'} · ${kb.map((x) => x.toFixed(0)).join(', ')} KB`);
    v.require('no WebGL2: message shown', shown);
    v.check('no WebGL2: transferred', median(kb), '<=', 30, ' KB');
  }

  for (const mode of ['ctx-restore', 'ctx-norestore']) {
    if (!only.includes(mode)) continue;
    const { ctx, page, logs } = await newPage();
    await page.goto(`${U}/?reset=1&skipIntro=1&quality=high`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000 });
    const view = async () => {
      await page.evaluate(() => {
        window.__academy.teleport([0, 0, 22]);
        window.__academy.look(0, 2);
        window.__academy.game.hud.root.style.visibility = 'hidden';
      });
      await page.waitForTimeout(2000);
    };
    await view();
    const before = await page.screenshot({ path: path.join(dir, `${mode}-0-before.png`) });
    await page.evaluate(() => {
      window.__lose = window.__academy.game.rs.renderer.getContext().getExtension('WEBGL_lose_context');
      window.__lose.loseContext();
    });
    const tLoss = Date.now();
    await page.waitForTimeout(1200);
    const f0 = await page.evaluate(() => window.__academy.game.time.frame);
    await page.waitForTimeout(1000);
    const f1 = await page.evaluate(() => window.__academy.game.time.frame);
    const lostText = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: path.join(dir, `${mode}-1-lost.png`) });
    const R = { framesWhileLost: f1 - f0, message: /Grafik|graphics|WebGL/i.test(lostText) };
    if (mode === 'ctx-restore') {
      v.check('context lost: frames advanced in 1 s', R.framesWhileLost, '<=', 0);
      v.require('context lost: a message shows', R.message);
      await page.evaluate(() => window.__lose.restoreContext());
      await page.waitForTimeout(3000);
      // the game resumes by itself after a restore (C12a); a pause menu left open would hide the view
      await page.evaluate(() => {
        if (window.__academy.game.phase === 'paused') window.__academy.resume();
      });
      await view();
      const after = await page.screenshot({ path: path.join(dir, `${mode}-2-after.png`) });
      R.meanDiff = round(meanDiff(before, after), 1);
      R.after = await page.evaluate(() => ({ lost: window.__academy.game.rs.renderer.getContext().isContextLost(), phase: window.__academy.game.phase, ri: window.__academy.renderInfo() }));
      v.check('context restored: mean difference to the view before', R.meanDiff, '<=', 8, '/255');
    } else {
      let btn = null;
      while (Date.now() - tLoss < 8000 && !(btn = await visibleButton(page, /neu laden|reload/))) await page.waitForTimeout(200);
      R.reloadButton = btn;
      R.reloadAfterMs = btn ? Date.now() - tLoss : null;
      v.check('context lost for good: reload button after', R.reloadAfterMs == null ? null : R.reloadAfterMs / 1000, '<=', 6, ' s');
    }
    R.logs = logs.filter((l) => !/GPU stall/.test(l)).slice(0, 15);
    out[mode] = R;
    console.log(`${mode}: ${JSON.stringify({ ...R, logs: undefined })}`);
    await ctx.close();
  }

  if (only.includes('wasm')) {
    const { ctx, page, logs } = await newPage();
    let block = true;
    await page.route(/\.wasm(\?|$)/, (r) => (block ? r.abort('failed') : r.continue()));
    await page.goto(`${U}/?reset=1`, { waitUntil: 'commit' });
    const t0 = Date.now();
    let btn = null;
    while (Date.now() - t0 < 12000 && !(btn = await visibleButton(page, /erneut versuchen|try again|retry|neu laden|reload/))) await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(dir, 'wasm-blocked.png') });
    const R = { retryButton: btn, status: await page.evaluate(() => document.querySelector('#loading')?.innerText?.replace(/\s+/g, ' ').slice(0, 200) ?? null) };
    v.require('wasm blocked: a retry button shows', !!btn, btn ?? R.status ?? '');
    if (btn) {
      block = false;
      await page.getByRole('button', { name: new RegExp(btn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30), 'i') }).first().click({ timeout: 5000 }).catch(() => {});
      const ok = await page.waitForSelector('#start-btn', { state: 'visible', timeout: 120000 }).then(() => true, () => false);
      R.titleAfterRetry = ok;
      v.require('wasm unblocked: the retry click reaches the title', ok);
    }
    R.logs = logs.slice(0, 8);
    out.wasm = R;
    console.log(`wasm: ${JSON.stringify({ ...R, logs: undefined })}`);
    await ctx.close();
  }

  if (only.includes('zone')) {
    const { ctx, page, logs } = await newPage();
    await page.route(/\/assets\/sensordom-[^/]*\.js(\?|$)/, (r) => r.abort('failed'));
    await page.goto(`${U}/?reset=1`, { waitUntil: 'commit' });
    const title = await page.waitForSelector('#start-btn', { state: 'visible', timeout: 120000 }).then(() => true, () => false);
    await page.waitForTimeout(1500);
    const read = () => page.evaluate(() => ({ zones: window.__academy?.zones().map((z) => [z.id, z.status]), toasts: window.__academy?.toasts?.() ?? [] }));
    const st = await read();
    if (st.zones && !st.zones.some(([id, s]) => id === 'sensordom' && s === 'error')) {
      // deferred zone init (C13): start and give the zones their idle slots; Phase 7 (§5.8) retries an
      // area chunk 3× with backoff (1, 3, 9 s) before it errors, so poll up to 45 s
      await page.evaluate(() => window.__academy.start());
      for (let t = 0; t < 45000; t += 1000) {
        await page.waitForTimeout(1000);
        Object.assign(st, await read());
        if (st.zones.some(([id, s]) => id === 'sensordom' && s === 'error')) break;
      }
      await page.waitForTimeout(500);
      Object.assign(st, await read());
    }
    await page.screenshot({ path: path.join(dir, 'zone-chunk-failed.png') });
    const errs = (st.zones || []).filter(([, s]) => s === 'error').map(([id]) => id);
    v.require('zone chunk failed: the title still comes', title);
    v.require('zone chunk failed: only that zone errors', errs.length === 1 && errs[0] === 'sensordom', errs.join(',') || 'none');
    // the zone's title in either language: since D12 a browser not set to German (Playwright's en-US) starts in English
    v.require('zone chunk failed: the toast names the zone by its title', st.toasts.some((t) => /Sensordom|Sensor Dome/.test(t)), st.toasts.slice(-2).join(' | ').slice(0, 120));
    out.zone = { ...st, logs: logs.slice(0, 8) };
    console.log(`zone: ${JSON.stringify(st).slice(0, 300)}`);
    await ctx.close();
    await siteChunkCase();
  }
  if (only.includes('glb')) await glbCase();
  if (only.includes('worker')) await workerCase();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
for (const p of pending) v.note(`pending: ${p}`);
saveJson('robust/robust-check.json', out);
v.exit(args);
