#!/usr/bin/env node
// „Entdecken“ (Discover) checks (WP-D0, plan §2.4, §5, §6): one runner, one scenario per file in
// tools/discover/. The production build with BASE_PATH=/academy-world/, served under that prefix
// (tools/lib/devices.mjs), on the phone profiles.
//
//   node tools/discover-check.mjs [--only gate,boot,…] [--devices pixel7,iphone15] [--quick]
//                                 [--dist <dir>] [--amber] [--cpu <rate>] [--net none] [--strict] [--no-check]
//
//   --only      scenarios by name (default: every scenario file, in the order below)
//   --devices   pixel7 (Chromium, 4× CPU, 9 Mbit/s 85 ms), iphone15 (WebKit), desktop (default pixel7,iphone15)
//   --quick     the merge-tier smoke test: Pixel profile only, the scenarios marked quick (gate, boot,
//               storage: the spike's / the tour's first 3 stops)
//   --dist      an existing build (must be built with BASE_PATH=/academy-world/); else a private build
//   --amber     build with VITE_AMBER=1 (the wave tier runs both)
//   --strict    the indicative frame budgets (the desktop GPU predicts nothing) fail instead of warn
//
// A scenario is tools/discover/<name>.mjs with
//   export const scenario = { name, devices?: ['pixel7', …], quick?: true };
//   export default async function run(t) { … }
// where t carries the device, the browser, the served URL and helpers (see makeContext below):
// t.open(query, o) → { page, errors, requests, close }, t.state(page), t.waitState(page, fn, ms),
// t.check / t.require / t.note / t.pending (one verdict for the whole run), t.shot(page, name),
// t.thirdParty(requests), t.outside(requests). Files without `export const scenario` (the content
// generators of D1 / D2 live in the same folder) are never loaded by the runner.
// Screenshots and the JSON summary: artifacts/discover/. Exit 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { Verdict, parseArgs, list, ROOT } from './lib/measure.mjs';
import { BASE_PATH, buildSubpath, device, launchFor, openDevice, serveSubpath } from './lib/devices.mjs';

const args = parseArgs(process.argv.slice(2));
const quick = !!args.quick;
const ORDER = ['gate', 'boot', 'storage', 'load', 'perf', 'memory', 'i18n', 'tour', 'viewer', 'film', 'share'];
const dir = path.join(ROOT, 'tools', 'discover');
const available = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.mjs') && /export const scenario\s*=/.test(fs.readFileSync(path.join(dir, f), 'utf8')))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
const wanted = list(args.only, available);
for (const n of wanted) if (!available.includes(n)) console.warn(`WARN no scenario tools/discover/${n}.mjs (pending)`);
const names = wanted.filter((n) => available.includes(n));
const devNames = quick ? ['pixel7'] : list(args.devices, ['pixel7', 'iphone15']);
const out = path.join(ROOT, 'artifacts', 'discover');
fs.mkdirSync(out, { recursive: true });

const v = new Verdict('discover-check');
const summary = { started: new Date().toISOString(), base: BASE_PATH, amber: !!args.amber, quick, scenarios: names, devices: devNames, results: [], pending: [], notes: [] };

let build = null;
let distDir = args.dist && args.dist !== true ? path.resolve(String(args.dist)) : null;
if (!distDir) {
  build = await buildSubpath({ amber: !!args.amber });
  distDir = build.dir;
}
const server = await serveSubpath(distDir, BASE_PATH);
console.log(`serving ${distDir} at ${server.url}`);

const mods = {};
for (const n of names) mods[n] = await import(path.join(dir, `${n}.mjs`));

try {
  for (const dn of devNames) {
    const dev = device(dn, args);
    const { browser, engine, fallback } = await launchFor(dev);
    if (fallback) summary.notes.push(`${dn}: WebKit missing, ran on Chromium`);
    try {
      for (const n of names) {
        const m = mods[n];
        const meta = m.scenario ?? {};
        if (meta.devices && !meta.devices.includes(dn)) continue;
        if (quick && !meta.quick) continue;
        const t = makeContext({ dev, dn, engine, fallback, browser, scenario: n });
        const t0 = Date.now();
        console.log(`\n── ${dn} (${engine}) · ${n} ──`);
        try {
          await m.default(t);
        } catch (err) {
          t.require('ran to the end', false, String(err && (err.stack || err)).split('\n').slice(0, 3).join(' | '));
        }
        summary.results.push({ device: dn, scenario: n, seconds: Math.round((Date.now() - t0) / 1000) });
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }
} finally {
  await server.close();
  build?.cleanup();
}

summary.rows = v.rows;
fs.writeFileSync(path.join(out, `discover-check${quick ? '-quick' : ''}.json`), JSON.stringify(summary, null, 1));
for (const p of summary.pending) v.note(`PENDING ${p}`);
for (const n of summary.notes) v.note(n);
v.exit(args);

function makeContext({ dev, dn, engine, fallback, browser, scenario }) {
  const tag = (s) => `${dn} ${scenario}: ${s}`;
  const shotDir = path.join(out, dn);
  fs.mkdirSync(shotDir, { recursive: true });
  const t = {
    dev,
    device: dn,
    engine,
    fallback,
    browser,
    args,
    quick,
    strict: !!args.strict,
    url: server.url,
    origin: server.origin,
    prefix: BASE_PATH,
    dist: distDir,
    serverLog: server.log,
    out: shotDir,
    log: (...a) => console.log(`  ${dn} ${scenario}:`, ...a),
    check: (name, value, op, target, unit = '') => v.check(tag(name), value, op, target, unit),
    require: (name, ok, detail = '') => v.require(tag(name), ok, detail),
    /** an indicative budget: a check with --strict, else printed (WARN when missed) */
    indicative(name, value, op, target, unit = '') {
      if (t.strict) return v.check(tag(name + ' (indicative)'), value, op, target, unit);
      const ok = value != null && Number.isFinite(value) && (op === '<=' ? value <= target : op === '>=' ? value >= target : value === target);
      const line = `${ok ? 'ok  ' : 'WARN'} ${tag(name)} ${typeof value === 'number' ? Math.round(value * 100) / 100 : value}${unit} (indicative ${op} ${target}${unit})`;
      console.log('  ' + line);
      summary.notes.push(line);
      return ok;
    },
    note: (s) => summary.notes.push(tag(s)),
    pending: (s) => summary.pending.push(tag(s)),
    /** fresh context + page at url + query (no throttling with { throttle: false }) */
    async open(query = '', o = {}) {
      const h = await openDevice(browser, engine, o.dev ?? dev, o);
      await h.page.goto(server.url + query, { waitUntil: o.waitUntil ?? 'domcontentloaded', timeout: 180000 });
      return h;
    },
    /** window.__discover.state() (null before Discover is up) */
    state: (page) => page.evaluate(() => (window.__discover ? window.__discover.state() : null)),
    /** wait until fn(state) is true; fn is a function (serialised) of the state */
    async waitState(page, fn, ms = 120000) {
      await page.waitForFunction(`(() => { const s = window.__discover && window.__discover.state(); return !!s && (${fn.toString()})(s); })()`, null, { timeout: ms, polling: 50 });
      return t.state(page);
    },
    async shot(page, name) {
      const f = path.join(shotDir, `${scenario}-${name}.png`);
      await page.screenshot({ path: f });
      return f;
    },
    thirdParty: (requests) => requests.filter((r) => /^(https?|wss?):/.test(r.url) && new URL(r.url).origin !== server.origin).map((r) => r.url),
    outside: (requests) => requests.filter((r) => r.url.startsWith(server.origin) && !new URL(r.url).pathname.startsWith(BASE_PATH)).map((r) => r.url),
  };
  return t;
}
