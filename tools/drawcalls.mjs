#!/usr/bin/env node
// Main-pass draw calls by owner at the named views (tools/lib/views.mjs), and the Phase 7 per-owner
// ledger of docs/PHASE7-PLAN.md §5.5 [C1 M2] (promoted from the phase 6 perf-runtime audit's
// drawcalls.mjs + worlddraws.mjs; tools/perf.mjs runs the same count at the spawn and the plaza).
//
//   node tools/drawcalls.mjs [--views spawn,plaza,kanzel240,dunkelfabrik] [--quality high] [--dev | --dist <dir>]
//   node tools/drawcalls.mjs --views bridgehead,plaza --ledger            # the merge gate
//   node tools/drawcalls.mjs --views plaza --ledger --seed world[:n]      # seed n extra world draws: must fail
//   node tools/drawcalls.mjs --views plaza --ledger --selftest            # the seeded miss is caught → exit 0
//
// Without --ledger the phase 6 targets apply (W1, Z1: ≤ 110 world draws at the spawn and the plaza,
// ≤ 200 in all at the plaza, ≤ 50 zone draws at the spawn, ≤ 10 per lobe exterior at the plaza).
// With --ledger every owner is printed (world, ground, region, life, robots, each area; how owners are
// tagged: tools/lib/drawcalls.mjs) and checked against the view's ledger, its total and triangles;
// known rc4 misses print as KNOWN with their owner WP and fail only when they grow. Views whose
// content does not exist yet are skipped with a warning. --seed adds draws tagged to one owner after
// the clean count: by default exactly one more than the owner's bucket allows (so ONE extra draw
// fails). Every area is loaded first (__academy.loadAll), so sites count once they have code.
// Draw counts do not depend on timing, but the tool takes three samples per view and keeps the
// median (a moving rover or a fading label can change a count by one). Exit 1 on a miss.
import { Verdict, gameServer, launchChromium, openGame, gotoView, median, parseArgs, saveJson, list } from './lib/measure.mjs';
import { DRAWS_BY_OWNER, DRAW_TARGETS, SEED_DRAWS, checkLedger, formatDraws, formatLedger } from './lib/drawcalls.mjs';
import { VIEWS, GDD_GATE, knownView } from './lib/views.mjs';

const args = parseArgs(process.argv.slice(2));
const ledgerMode = !!args.ledger || !!args.selftest;
const views = list(args.views, ledgerMode ? ['bridgehead', 'plaza'] : ['spawn', 'plaza', 'kanzel240', 'dunkelfabrik']);
const quality = String(args.quality ?? 'high');
const seedArg = args.selftest && (args.seed == null || args.seed === true) ? 'world' : args.seed && args.seed !== true ? String(args.seed) : null;
const unknown = views.filter((v) => !knownView(v));
if (unknown.length) {
  console.error(`unknown view(s) ${unknown.join(', ')} (known: ${Object.keys(VIEWS).join(', ')})`);
  process.exit(2);
}
const v = new Verdict(ledgerMode ? 'drawcalls --ledger' : 'drawcalls');
const out = {};
const pending = [];
let seeded = null;

/** Three counts, the median one (by total). */
async function count(page) {
  const reps = [];
  for (let i = 0; i < 3; i++) reps.push(await page.evaluate(DRAWS_BY_OWNER));
  const mid = reps.slice().sort((a, b) => a.total - b.total)[1];
  return { mid, reps };
}

function ledgerRows(view, r) {
  const L = VIEWS[view].ledger ?? { buckets: [] };
  return checkLedger(view, L, r, GDD_GATE, VIEWS[view].tris ?? null);
}

const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
try {
  const { page, ctx } = await openGame(browser, `${srv.url}/?skipIntro=1&quality=${quality}`, { instrument: false, all: true });
  await page.waitForTimeout(1500);
  for (const view of views) {
    const st = await gotoView(page, view, 1500);
    if (st.pending) {
      pending.push(`${view}: ${st.pending}`);
      console.log(`WARN  ${view}: pending, skipped (${st.pending})`);
      continue;
    }
    const { mid, reps } = await count(page);
    out[view] = { ...mid, totals: reps.map((r) => r.total) };
    if (!ledgerMode) {
      console.log(formatDraws(view, mid));
      for (const [label, fn, op, target] of DRAW_TARGETS[view] ?? []) v.check(label, median(reps.map(fn)), op, target);
      continue;
    }
    const rows = ledgerRows(view, mid);
    out[view].ledgerRows = rows;
    console.log(formatLedger(view, mid, rows));
    for (const row of rows) {
      if (row.status === 'known') v.note(`known miss ${row.name} ${row.value} > ${row.cap} (owner ${row.owner}; ${row.note})`);
      else if (row.status === 'fixed') v.note(`${row.name}: ${row.note}`);
      else v.check(row.name, row.value, '<=', row.cap);
    }
    if (seedArg && !seeded) {
      // the seeded miss: owner[:n] extra draws, by default one more than the owner's bucket allows
      const [owner, nArg] = seedArg.split(':');
      const bucket = (VIEWS[view].ledger?.buckets ?? []).find(([b]) => b === owner);
      const have = mid.ledger.owners[owner] ?? 0;
      const capTotal = Math.min(VIEWS[view].ledger?.total ?? GDD_GATE.total, GDD_GATE.total);
      const n = nArg ? Number(nArg) : bucket ? Math.max(1, bucket[1] - have + 1) : Math.max(1, capTotal - mid.total + 1);
      const made = await page.evaluate(SEED_DRAWS, [owner, n]);
      await page.waitForTimeout(300);
      const s = await count(page);
      await page.evaluate(() => window.__seededDraws && window.__seededDraws());
      const srows = ledgerRows(view, s.mid);
      const failedRows = srows.filter((r) => r.status === 'fail');
      seeded = { view, owner, n: made, failed: failedRows.map((r) => `${r.name} ${r.value} > ${r.cap}`) };
      console.log(`\nseeded ${made} extra '${owner}' draw(s) at ${view}:`);
      console.log(formatLedger(`${view}+seed`, s.mid, srows));
      if (!args.selftest) for (const row of srows.filter((r) => r.status !== 'known' && r.status !== 'fixed')) v.check(`seeded: ${row.name}`, row.value, '<=', row.cap);
    }
  }
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
for (const p of pending) v.note(`pending view ${p}`);
saveJson(`drawcalls-${quality}.json`, out);
if (args.selftest) {
  v.print();
  const ok = !!seeded && seeded.failed.length > 0 && v.failed.length === 0;
  console.log(seeded ? `selftest: ${seeded.n} seeded '${seeded.owner}' draw(s) at ${seeded.view} → ${seeded.failed.length ? `caught: ${seeded.failed.join(', ')}` : 'NOT caught'}` : 'selftest: no view measured');
  console.log(ok ? 'OK   selftest: the clean ledger passes and the seeded draw fails' : 'FAIL selftest');
  process.exit(ok ? 0 : 1);
}
v.exit(args);
