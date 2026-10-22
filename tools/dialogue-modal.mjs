#!/usr/bin/env node
// Does time stand still behind full-screen panels? (promoted from the phase 6 ux-browsers-a11y
// audit, dlg.mjs). Plan items C4 and W4.
//
//   node tools/dialogue-modal.mjs [--dev | --dist <dir> | --base <url>] [--runs 3]
//
// 1. EMI queues three lines; the Pass opens for 10 s and closes: line 1 must still be on screen
//    (the player has not missed anything) and no other line may have played behind the Pass.
// 2. The same with the map, and while paused.
// 3. Game time (time.elapsed, which drives every run clock, e.g. Sensordom A) may advance ≤ 0.2 s
//    while the map is open for 5 s or the Pass for 4 s; median of --runs.
// Exit 1 when a check fails. Writes artifacts/<PT_DIR|measure>/dialogue-modal.json.
import { Verdict, gameServer, launchChromium, loadAllAreas, median, parseArgs, saveJson, round } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 3);
const LINES = {
  de: ['Zeile eins: ein Satz zum Lesen, nicht zu kurz.', 'Zeile zwei: noch ein Satz zum Lesen.', 'Zeile drei: der letzte Satz.'],
};

const v = new Verdict('dialogue-modal');
const out = {};
const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${srv.url}/?skipIntro=1&reset=1&lang=de`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__academy && window.__academy.ready && window.__academy.game.phase === 'playing', null, { timeout: 180000, polling: 200 });
  // every area (sites too): `ready` is only the eager set (plan §5.6)
  await loadAllAreas(page);
  await page.waitForTimeout(2500);
  const dlg = () => page.evaluate(() => window.__academy.state().dialogue);
  // the test owns the queue: drop whatever the island queued (radio lines, hints)
  const settleDialogue = () => page.evaluate(() => window.__academy.game.hud.dialogue.stop());

  // ── 1/2: lines behind a panel ──
  for (const [label, open] of [
    ['pass', () => page.evaluate(() => window.__academy.openPass())],
    ['map', () => page.evaluate(() => window.__academy.toggleMap())],
    ['pause', () => page.evaluate(() => window.__academy.pause())],
  ]) {
    await settleDialogue();
    await page.evaluate((lines) => {
      window.__dlgDone = false;
      window.__academy.game.hud.dialogue.say(lines).then(() => (window.__dlgDone = true));
    }, LINES.de);
    await page.waitForTimeout(600);
    const before = await dlg();
    await open();
    const seen = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const d = await dlg();
      seen.push(d ? d.text.slice(0, 12) : null);
    }
    await page.evaluate(() => (window.__academy.game.phase === 'paused' ? window.__academy.resume() : window.__academy.closeModals()));
    await page.waitForTimeout(400);
    const after = await dlg();
    const playedBehind = new Set(seen.filter(Boolean)).size;
    out[label] = { before, seen, after, playedBehind, finished: await page.evaluate(() => window.__dlgDone) };
    console.log(`${label.padEnd(6)} before "${before?.text.slice(0, 12) ?? '-'}" · while open ${JSON.stringify(seen)} · after "${after?.text.slice(0, 12) ?? '-'}"`);
    v.require(`${label}: line 1 still on screen after 10 s behind the ${label}`, !!after && after.text.startsWith('Zeile eins'), after ? after.text.slice(0, 20) : 'no line');
    v.check(`${label}: lines that advanced behind it`, playedBehind - 1, '<=', 0);
  }
  await settleDialogue();

  // ── 3: game time behind the map (5 s) and the Pass (4 s) ──
  const clock = async (openFn, ms) => {
    const t0 = await page.evaluate(() => window.__academy.game.time.elapsed);
    await openFn();
    await page.waitForTimeout(ms);
    const t1 = await page.evaluate(() => window.__academy.game.time.elapsed);
    await page.evaluate(() => window.__academy.closeModals());
    await page.waitForTimeout(500);
    return t1 - t0;
  };
  const mapD = [];
  const passD = [];
  for (let i = 0; i < runs; i++) {
    mapD.push(await clock(() => page.evaluate(() => window.__academy.toggleMap()), 5000));
    passD.push(await clock(() => page.evaluate(() => window.__academy.openPass()), 4000));
  }
  out.clock = { mapD, passD };
  console.log(`game time while the map is open 5 s: ${mapD.map((x) => round(x)).join(', ')} s · Pass 4 s: ${passD.map((x) => round(x)).join(', ')} s`);
  v.check('game time advance, map open 5 s (median)', median(mapD), '<=', 0.2, ' s');
  v.check('game time advance, Pass open 4 s (median)', median(passD), '<=', 0.2, ' s');
  out.errors = errors;
  v.check('page errors', errors.length, '<=', 0);
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
saveJson('dialogue-modal.json', out);
v.exit(args);
