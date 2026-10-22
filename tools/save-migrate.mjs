#!/usr/bin/env node
// Save v2 and the rc4 migration in the browser (docs/PHASE7-PLAN.md §3.5, §5.10): every fixture of
// tools/fixtures/saves/ (WP1) is seeded into a fresh browser profile, the game boots, a short v2
// session changes something persistent, the page reloads, and the result is checked twice (at boot
// and after the reload) with the fixture's own expectations (tools/fixtures/saves/check.mjs, WP1).
//
//   node tools/save-migrate.mjs [--fixtures <dir>] [--only rc4-mid,corrupt] [--dev | --base <url> | --dist <dir>]
//
// Per fixture (the protocol of tools/fixtures/saves/README.md):
//   1. addInitScript seeds the fixture's `storage` once (the reload does not re-seed), then opens
//      /?skipIntro=1&<params>[&retired=…] and waits for __academy.ready;
//   2. `save = __academy.ext('save')()` (WP1) → checkFixture(…, 'boot');
//   3. a v2 session: progress.setZoneValue('world', 'p7.test', 1), then ≥ 300 ms (saves are debounced);
//   4. reload, read the raw v1 and v2 keys → checkFixture(…, 'reload'): v2 under the new key, v1
//      byte-identical, legacy, rev resets, flight ground, the failure path (read-only, nothing written).
// The harness adds its own invariants: no page error; the read-only path logs at most once; and a
// `?reset=1` boot after the session removes the v1 key (clearGameStorage() removes both, §3.5).
// Uses a private dev server by default (the dev toast „Spielstand nur gelesen“ exists only there).
// Exit 1 when a fixture fails, 2 when the fixtures or their check.mjs do not exist yet.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, gameServer, launchChromium, parseArgs, saveJson, list } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(ROOT, String(args.fixtures && args.fixtures !== true ? args.fixtures : 'tools/fixtures/saves'));
const checkFile = path.join(dir, 'check.mjs');
if (!fs.existsSync(checkFile)) {
  console.error(`save-migrate: no ${path.relative(ROOT, checkFile)} yet (WP1 commits the fixtures and their checker)`);
  process.exit(2);
}
const { loadFixtures, checkFixture, seedEntries, fixtureQuery, V1_KEY, V2_KEY } = await import(pathToFileURL(checkFile).href);
const only = list(args.only, null);
const fixtures = loadFixtures(dir).filter((fx) => !only || only.includes(fx.name ?? path.basename(fx.file, '.json')));
if (!fixtures.length) {
  console.error(`save-migrate: no fixtures in ${path.relative(ROOT, dir)}`);
  process.exit(2);
}

/** Seed once per tab: sessionStorage survives the reload, so step 4 reads what the game wrote. */
const SEED = ([entries, flag]) => {
  try {
    if (sessionStorage.getItem(flag)) return;
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    sessionStorage.setItem(flag, '1');
  } catch (e) {
    /* storage blocked: the fixture then runs as fresh */
  }
};
const READ = ([k1, k2]) => ({ v1: localStorage.getItem(k1), v2: localStorage.getItem(k2) });

const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
const results = [];
const t0 = Date.now();
try {
  for (const fx of fixtures) {
    const name = fx.name ?? path.basename(fx.file, '.json');
    const r = { name, file: fx.file, rule: fx.rule ?? null, failures: [], notes: [], ms: 0 };
    results.push(r);
    const ts = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    const saveLogs = [];
    page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e).slice(0, 300)));
    page.on('console', (m) => {
      const t = m.text();
      if (/\[save\]|\[migrate\]/i.test(t)) saveLogs.push(`${m.type()}: ${t.slice(0, 200)}`);
      else if (m.type() === 'error' && !/GPU stall/.test(t)) pageErrors.push(`console.error ${t.slice(0, 300)}`);
    });
    const entries = seedEntries(fx);
    await page.addInitScript(SEED, [entries, '__save_migrate_seeded']);
    const url = `${srv.url}/?${fixtureQuery(fx)}`;
    const ready = async () => page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
    const snapshot = () =>
      page.evaluate(() => {
        const fn = window.__academy.ext && window.__academy.ext('save');
        return typeof fn === 'function' ? JSON.parse(JSON.stringify(fn())) : null;
      });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await ready();
      const before = { v1: entries[V1_KEY] ?? null, v2: entries[V2_KEY] ?? null };
      const boot = checkFixture(fx, { save: await snapshot(), before, after: null }, 'boot');
      r.failures.push(...boot.failures.map((f) => `boot: ${f}`));
      r.notes.push(...boot.notes.map((n) => `boot: ${n}`));
      // a short v2 session: change something persistent (debounced save)
      await page.evaluate(() => window.__academy.game.progress.setZoneValue('world', 'p7.test', 1));
      await page.waitForTimeout(800);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
      await ready();
      await page.waitForTimeout(300);
      const after = await page.evaluate(READ, [V1_KEY, V2_KEY]);
      const rel = checkFixture(fx, { save: await snapshot(), before, after }, 'reload');
      r.failures.push(...rel.failures.map((f) => `reload: ${f}`));
      r.notes.push(...rel.notes.map((n) => `reload: ${n}`));
      // harness invariants
      const readOnly = !!fx.expect?.readOnly;
      if (readOnly && saveLogs.length > 2) r.failures.push(`the read-only path logged ${saveLogs.length}× over two boots (once per boot): ${saveLogs.slice(0, 3).join(' | ')}`);
      // reset (§3.5: clearGameStorage() removes both keys); the rc4 key must not come back
      const u = new URL(url);
      u.searchParams.set('reset', '1');
      await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 180000 });
      await ready();
      await page.waitForTimeout(800);
      const reset = await page.evaluate(READ, [V1_KEY, V2_KEY]);
      if (reset.v1 != null) r.failures.push('reset: the v1 key is still there after ?reset=1 (clearGameStorage() removes both keys)');
      if (reset.v2 != null) {
        let stamps = -1;
        try {
          stamps = Object.keys(JSON.parse(reset.v2).stamps ?? {}).length;
        } catch {
          /* corrupt */
        }
        if (stamps !== 0) r.failures.push(`reset: the v2 key survived ?reset=1 with ${stamps < 0 ? 'unreadable data' : `${stamps} stamps`}`);
      }
    } catch (err) {
      r.failures.push(`harness: ${String(err?.message ?? err).split('\n')[0]}`);
    }
    r.failures.push(...pageErrors.map((e) => `page: ${e}`));
    r.saveLogs = saveLogs;
    r.ms = Date.now() - ts;
    await ctx.close();
    console.log(`${r.failures.length ? 'FAIL' : 'PASS'}  ${name.padEnd(22)} ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${fx.rule ?? fx.about ?? ''}`);
    for (const f of r.failures) console.log(`        ✗ ${f}`);
    for (const n of r.notes) console.log(`        · ${n}`);
  }
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
const failed = results.filter((r) => r.failures.length);
saveJson('save-migrate.json', { fixtures: path.relative(ROOT, dir), results });
console.log(`\n${failed.length ? 'FAIL' : 'OK  '} save-migrate: ${results.length - failed.length}/${results.length} fixtures pass (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(failed.length ? 1 : 0);
