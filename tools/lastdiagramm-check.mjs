#!/usr/bin/env node
// WP8 feature check (docs/PHASE7-PLAN.md §4.4, §6.6 WP8): Greifwerkstatt C „Lastdiagramm“ on the real
// SO-101. The game derives the arm's plane from the loaded GLB (link frames at the zero pose) and takes
// the link masses and centres of mass from WP0's manifest (`inertials`); this check reads the numbers
// the station computes (debug hook `ld-model`) and judges them against R1 §1.1:
//   1. the stretched reach ≈ 0,41 m (R1, own calculation from the URDF);
//   2. stretched, the arm alone needs more than the rated 6,5 kg·cm: the payload at Nenn is 0 g;
//   3. stretched, the stall band 16,5–19,5 kg·cm gives 190–260 g (rounded to 10 g; exact ≈ 188–261 g);
//   4. closer in the arm carries more (the Nenn curve falls with reach, the band stays above it);
//   5. the gear task (100 g, pedestal → back box, 0,35 m) is solvable under Nenn along the bot's straight
//      path, and a wide path (box at 0,33 m) is not: the task needs the close-in path;
//   6. the station: solve-c stamps it with ≥ 4 reach points and question card #5; stars3-c gives ★★★.
//
//   node tools/lastdiagramm-check.mjs [--dist <dir> | --dev]
//
// Exit 1 on a miss. Raw results: artifacts/measure/lastdiagramm-check.json.
import { Verdict, gameServer, launchChromium, openGame, parseArgs, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const v = new Verdict('lastdiagramm-check');
const out = {};
const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
try {
  const { page } = await openGame(browser, `${srv.url}/?reset=1&skipIntro=1&lang=de&mode=entdecker`, { instrument: false, all: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && (e.stack || e.message || e)).slice(0, 400)));
  await page.evaluate(() => window.__academy.teleport('greifwerkstatt'));
  await page.waitForTimeout(1500);
  // the hook waits for the SO-101's GLB (ctx.robots, priority 'route': the player is inside the area)
  const m = await page.evaluate(() => Promise.race([window.__academy.solve('greifwerkstatt', 'ld-model'), new Promise((r) => setTimeout(() => r(null), 60000))]));
  out.model = m;
  if (!v.require('the SO-101 model loaded and the station derived its arm', !!m)) throw new Error('no model');
  const last = m.rows[m.rows.length - 1];
  v.check('stretched reach (shoulder axis → grasp point)', m.rMax, '>=', 0.4, ' m');
  v.check('stretched reach, upper end', m.rMax, '<=', 0.42, ' m');
  v.check('moving link masses (manifest inertials)', m.masses, '>=', 0.37, ' kg');
  v.check('stretched arm alone vs. rated torque', m.stretchedTauArmNm, '>', m.limitsNm.nenn, ' N·m');
  v.check('stretched payload at Nenn', m.stretched.nenn, '=', 0, ' g');
  v.check('stretched Spitze band, lower edge (to 10 g)', Math.round(m.stretched.lo / 10) * 10, '=', 190, ' g');
  v.check('stretched Spitze band, upper edge (to 10 g)', Math.round(m.stretched.hi / 10) * 10, '=', 260, ' g');
  v.check('stretched Spitze band, exact lower edge', m.exact.lo, '>=', 180, ' g');
  v.check('stretched Spitze band, exact upper edge', m.exact.hi, '<=', 270, ' g');
  v.require('the 0,41 m diagram point equals the stretched result', last.nenn === m.stretched.nenn && Math.abs(last.lo - m.stretched.lo) <= 3 && Math.abs(last.hi - m.stretched.hi) <= 3, `${last.nenn} / ${last.lo}–${last.hi} g`);
  const reach = m.rows.filter((r) => !r.unreachable);
  v.check('reach points the rig can measure', reach.length, '=', 6);
  v.require('the Nenn curve falls with reach', reach.every((r, i) => i === 0 || r.nenn <= reach[i - 1].nenn), reach.map((r) => r.nenn).join(' · '));
  v.require('the stall band lies above the Nenn curve', reach.every((r) => r.lo >= r.nenn && r.hi >= r.lo));
  v.check('payload at 0,20 m, Nenn', m.at20, '>', 0, ' g');
  v.check('gear task: peak torque on the straight path', m.gearTask.peakNm, '<=', m.limitsNm.nenn, ' N·m');
  v.require('gear task solvable under Nenn', m.gearTask.solvable);
  v.check('gear task: a wide path (box at 0,33 m) exceeds Nenn', m.gearTask.wideNm, '>', m.limitsNm.nenn, ' N·m');
  // the station on the deck: the stamp, card #5, ★★★
  const before = await page.evaluate(() => window.__academy.pass().questions.includes(5));
  await page.evaluate(() => window.__academy.solve('greifwerkstatt', 'solve-c'));
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => window.__academy.solve('greifwerkstatt', 'c-state'));
  out.state = st;
  const pass = await page.evaluate(() => window.__academy.pass());
  const rec = pass.stamps.find((s) => s.id === 'greifwerkstatt.lastdiagramm')?.record;
  out.stampValue = rec?.value ?? null;
  v.require('solve-c stamps greifwerkstatt.lastdiagramm', !!rec && st.done);
  v.check('reach points in the stamped diagram', st.points.length, '>=', 4);
  v.require('question card #5 awarded', pass.questions.includes(5), before ? 'already held' : '');
  await page.evaluate(() => window.__academy.solve('greifwerkstatt', 'stars3-c'));
  await page.waitForTimeout(800);
  const st3 = await page.evaluate(() => window.__academy.solve('greifwerkstatt', 'c-state'));
  v.check('stars3-c', st3.stars, '=', 3, ' ★');
  v.check('page errors', errors.length, '=', 0);
  out.errors = errors;
} catch (err) {
  v.require(`check ran (${String(err).slice(0, 120)})`, false);
} finally {
  saveJson('lastdiagramm-check', out);
  await browser.close();
  await srv.close?.();
}
v.exit(args);
