#!/usr/bin/env node
// WP11 feature check (plan §5.10, §6.6 WP11 „Acceptance“): the Schauhalle Nord as a player meets it.
// Real page, the hall's own hooks (__academy.ext('hall' | 'schaufenster' | 'befunde'), solve hooks).
//
//   node tools/hall-check.mjs [--only cards,plates,consoles,compare,governor,vorfuehrung,deliveries,tresor,lastenheft,fenster]
//                             [--langs de,en] [--shots] [--dev | --dist <dir> | --base <url>]
//
// Scenarios
//   cards        the Datenblatt card of every robot (20 + LeKiwi + the H2 = 21; 17 in a build without the amber
//                exhibits, src/core/release.ts, and then none of theirs) in each language: ≤ 35 words
//                at open (counted as tools/text-audit.mjs counts them), every number in a block with a chip
//                (its `--chips` rule), a price row with its band, „Mehr“ holds the source and „Stand …“
//   plates       every Datenblatt stand plate: a price basis and a date, every number line chipped
//   consoles     the hall's other operate panels at open ≤ 35 words: terminal, compare stage, SELBST
//                BAUEN, the three Kurzlauf stands, Pannen-Wand, Fundvitrine; the entrance card holds the
//                disclaimer
//   compare      the compare stage with every pair of the 20 standing robots: ≤ 35 words at open, every
//                number chipped
//   governor     a walk through the hall: never more than 2 robots at LOD0 or 8 at LOD1, skinning only on
//                the ≤ 2 robots playing a Vorführung, parsed files released beyond the LRU
//   vorfuehrung  a robot plays its Vorführung once per approach (≤ 6 m), not again while you stay, again
//                after you walked away
//   deliveries   Entdecker: forced due robots arrive by drone once each ('schauhalle:delivered'), stand
//                on their plinths after it, are not delivered again after a reload; Entscheider: all stand
//   tresor       the H2 under its cover until it is unveiled (the debug hook stands in for the earned
//                Meisterprüfung): then it stands on its plinth, the quest records it (D21), its card opens
//                ≤ 35 words, and the unveiling does not repeat after a reload
//   lastenheft   the solve hook stamps the station with a merged banner; stars3 gives ★★★
//   fenster      Entscheider: the Schaufenster by bot ≤ 180 s, the three Befundkarten in the set, the
//                route stop reported done
// Exit 1 on a miss.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, Verdict, gameServer, launchChromium, list, openGame, parseArgs, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const only = list(args.only, ['cards', 'plates', 'consoles', 'compare', 'governor', 'vorfuehrung', 'deliveries', 'tresor', 'lastenheft', 'fenster']);
const langs = list(args.langs, ['de', 'en']);
const shots = !!args.shots;
const SHOT_DIR = path.join(ROOT, 'artifacts', 'phase7', 'hall');
if (shots) fs.mkdirSync(SHOT_DIR, { recursive: true });
const v = new Verdict('hall-check');
const out = {};

const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
const wait = (page, ms) => page.waitForTimeout(ms);
const ev = (page, code) => page.evaluate(`(async () => { ${code} })()`);
const val = (page, expr) => page.evaluate(`(async () => (${expr}))()`);
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
};

/** the amber exhibits (docs/LEGAL-REVIEW.md item 2): in the hall only with VITE_AMBER=1 */
const AMBER = ['spot', 'spot-arm', 'mir250', 'kuka-iiwa-14', 'robotiq-2f85'];

/** the hall's local frame: anchor (0, 0, −66), facing 0 → world = local + (0, 0, −66) */
const W = (x, z) => `[${x},0,${z - 66}]`;

async function open(q) {
  const g = await openGame(browser, `${srv.url}/?skipIntro=1&flight=ground&${q}`, { all: true });
  await wait(g.page, 1500);
  const ready = await val(g.page, `__academy.zones().find((z) => z.id === 'schauhalle')?.status`);
  if (ready !== 'ready') throw new Error(`schauhalle not ready (${ready})`);
  return g;
}

/** in-page: words and unchipped numbers of the visible operate panel (text-audit's rules) */
const PANEL_AUDIT = `(() => {
  const root = document.querySelector('.operate-panel');
  if (!root) return null;
  const words = root.innerText.split(/\\s+/).filter((w) => /[\\p{L}\\p{N}]/u.test(w)).length;
  const EXEMPT = 'h1, h2, h3, .title, .eyebrow, .chip, kbd, .kbd, .key, button, .source, .src, .credit, .lesson-src, .legend';
  const BLOCK = 'p, li, tr, .metric, .row, .kv, .line, .stat, .readout, .decision, section, .klhead, .kennlinie';
  const bad = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest(EXEMPT)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    const text = n.textContent.replace(/\\d+\\s*\\/\\s*\\d+/g, '');
    for (const m of text.matchAll(/(?<![\\p{L}\\d\\/·#])[-−+±≈]?\\d+(?:[.,]\\d+)*(?![\\p{L}\\d])/gu)) {
      const block = el.closest(BLOCK) || root;
      const head = block.parentElement ? block.parentElement.querySelector(':scope > .chips, :scope > .klhead, :scope > header') : null;
      const has = !!(block.querySelector('.chip') || (head && head.querySelector('.chip')) || el.closest('[data-chip]'));
      if (!has) bad.push(m[0] + ' in „' + text.trim().slice(0, 60) + '“');
    }
  }
  const more = root.querySelector('.more');
  const moreText = more ? more.textContent : '';
  return { words, bad, text: root.innerText.slice(0, 400), price: /Preisklasse|Price band/i.test(root.innerText), source: /Stand \\d|as of \\d/.test(moreText) };
})()`;

try {
  // ── cards ─────────────────────────────────────────────────────────────────
  if (only.includes('cards')) {
    for (const lang of langs) {
      const { page, errors } = await open(`reset=1&lang=${lang}&mode=entdecker`);
      const hall = await val(page, `__academy.ext('hall')()`);
      const all = await val(page, `__academy.debugActions().filter((a) => a.startsWith('schauhalle:inspect:')).map((a) => a.slice('schauhalle:inspect:'.length))`);
      out[`cards-${lang}`] = [];
      let maxW = 0;
      let unchipped = 0;
      let noPrice = 0;
      let noSource = 0;
      await ev(page, `__academy.teleport(${W(0, 0)},{yaw:0,pitch:0})`);
      await wait(page, 1500);
      for (const id of all) {
        await val(page, `__academy.solve('schauhalle','inspect:${id}')`);
        await wait(page, 700);
        const a = await val(page, PANEL_AUDIT);
        // the „Mehr“ tab: its source line and date
        await ev(page, `[...document.querySelectorAll('.operate-panel .btn')].find((b) => /Mehr|More/.test(b.textContent))?.click()`);
        await wait(page, 150);
        const more = await val(page, `(() => { const m = document.querySelector('.operate-panel .more'); return m ? { text: m.innerText, source: /Stand \\d|as of \\d/.test(m.innerText) } : null; })()`);
        if (!a) {
          v.require(`card ${id} (${lang}) opens`, false);
          continue;
        }
        out[`cards-${lang}`].push({ id, words: a.words, bad: a.bad, text: a.text, more: more?.text?.slice(0, 300) });
        maxW = Math.max(maxW, a.words);
        if (a.words > 35) v.check(`card ${id} (${lang}) words at open`, a.words, '<=', 35);
        unchipped += a.bad.length;
        if (a.bad.length) v.note(`${id} (${lang}): numbers without a chip: ${a.bad.join(' | ')}`);
        if (!a.price) noPrice++;
        if (!more?.source) noSource++;
        if (id === all[0]) await shot(page, `card-${id}-${lang}`);
        await ev(page, `__academy.exitOperate()`);
        await wait(page, 250);
      }
      // 21 robots, 17 without the four amber exhibits (VITE_AMBER unset, src/core/release.ts)
      const want = hall?.amber === false ? 17 : 21;
      v.check(`cards (${lang}): robots with a card`, all.length, '>=', want);
      if (hall?.amber === false) v.check(`cards (${lang}): amber exhibits with a card`, all.filter((id) => AMBER.includes(id)).length, '<=', 0);
      v.check(`cards (${lang}): the most words at open`, maxW, '<=', 35);
      v.check(`cards (${lang}): numbers without a chip`, unchipped, '<=', 0);
      v.check(`cards (${lang}): cards without a price row`, noPrice, '<=', 0);
      v.check(`cards (${lang}): cards without source and date on „Mehr“`, noSource, '<=', 0);
      v.check(`cards (${lang}): console errors`, errors.length, '<=', 0);
      await page.context().close();
    }
  }

  // ── plates ────────────────────────────────────────────────────────────────
  if (only.includes('plates')) {
    for (const lang of langs) {
      const { page } = await open(`reset=1&lang=${lang}&mode=entdecker`);
      await ev(page, `__academy.teleport(${W(0, 0)},{yaw:0,pitch:0})`);
      await wait(page, 800);
      const plates = await val(page, `__academy.ext('hall')('plates')`);
      const amber = (await val(page, `__academy.ext('hall')().amber`)) !== false;
      out[`plates-${lang}`] = plates;
      let noBasis = 0;
      let unchipped = 0;
      for (const p of plates) {
        const foot = p.lines.find((l) => /Stand \d|as of \d/.test(l));
        if (!foot || !/LISTE|QUELLE|ANFRAGE|LIST|SOURCE|ON REQUEST/i.test(foot)) noBasis++;
        // a key-number line: „Label: value [CHIP]“ — a number in its value needs the chip
        for (const l of p.lines.filter((x) => /: /.test(x) && !/Stand \d|as of \d/.test(x))) {
          const value = l.slice(l.indexOf(': ') + 2);
          if (/\d/.test(value.replace(/\[[^\]]*\]/g, '')) && !/\[[^\]]+\]/.test(value)) {
            unchipped++;
            v.note(`plate ${p.id} (${lang}): „${l}“ has no chip`);
          }
        }
      }
      v.check(`plates (${lang}): stands with a plate`, plates.filter((p) => p.lines.length).length, '>=', amber ? 21 : 17);
      if (!amber) v.check(`plates (${lang}): amber exhibits with a plate`, plates.filter((p) => AMBER.includes(p.id)).length, '<=', 0);
      v.check(`plates (${lang}): without a price basis and date`, noBasis, '<=', 0);
      v.check(`plates (${lang}): key numbers without a chip`, unchipped, '<=', 0);
      await page.context().close();
    }
  }

  // ── consoles and the disclaimer ────────────────────────────────────────────
  if (only.includes('consoles')) {
    for (const lang of langs) {
      const { page } = await open(`reset=1&lang=${lang}&mode=entdecker`);
      await ev(page, `__academy.teleport(${W(0, 6)},{yaw:0,pitch:0})`);
      await wait(page, 1500);
      const labels = await val(page, `[...new Set(__academy.interactables(60).filter((i) => i.owner === 'schauhalle' && !/^(Datenblatt|Datasheet) ·/.test(i.label)).map((i) => i.label))]`);
      out[`consoles-${lang}`] = [];
      for (const label of labels) {
        await ev(page, `__academy.closeModals(); __academy.exitOperate()`);
        await val(page, `__academy.interact(${JSON.stringify(label)})`);
        await wait(page, 1300);
        const a = await val(page, PANEL_AUDIT);
        const card = await val(page, `(() => { const c = document.querySelector('.modal-backdrop:not(.passthrough) .modal'); return c ? c.innerText : null; })()`);
        out[`consoles-${lang}`].push({ label, words: a?.words ?? null, bad: a?.bad ?? [], card: card?.slice(0, 200) ?? null });
        if (a) {
          v.check(`console „${label}“ (${lang}) words at open`, a.words, '<=', 35);
          if (a.bad.length) v.check(`console „${label}“ (${lang}) numbers without a chip`, a.bad.length, '<=', 0);
        }
        if (/Hinweis|Note/.test(label)) v.require(`entrance card (${lang}) holds the disclaimer`, !!card && /Kein Hersteller hat diese Halle|No manufacturer has reviewed/.test(card), card?.replace(/\s+/g, " ").slice(0, 60));
        await ev(page, `__academy.closeModals(); __academy.exitOperate()`);
        await wait(page, 300);
      }
      v.check(`consoles (${lang}): panels and cards audited`, out[`consoles-${lang}`].length, '>=', 9);
      await page.context().close();
    }
  }

  // ── the compare stage, every pair ───────────────────────────────────────────
  if (only.includes('compare')) {
    for (const lang of langs) {
      const { page } = await open(`reset=1&lang=${lang}&mode=entscheider`);
      await ev(page, `__academy.teleport(${W(5.4, -7.3)},{yaw:0,pitch:0})`);
      await wait(page, 1200);
      const ids = (await val(page, `__academy.ext('hall')()`)).shown;
      let max = 0;
      let worst = '';
      let unchipped = 0;
      let pairs = 0;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          await val(page, `__academy.ext('hall')('compare', '${ids[i]}', '${ids[j]}')`);
          await wait(page, 120);
          const a = await val(page, PANEL_AUDIT);
          await ev(page, `__academy.exitOperate()`);
          if (!a) continue;
          pairs++;
          if (a.words > max) {
            max = a.words;
            worst = `${ids[i]} + ${ids[j]}`;
          }
          if (a.bad.length) {
            unchipped += a.bad.length;
            v.note(`compare ${ids[i]} + ${ids[j]} (${lang}): ${a.bad.join(' | ')}`);
          }
        }
      out[`compare-${lang}`] = { pairs, max, worst };
      v.check(`compare (${lang}): pairs opened`, pairs, '>=', (ids.length * (ids.length - 1)) / 2);
      v.check(`compare (${lang}): the most words at open (${worst})`, max, '<=', 35);
      v.check(`compare (${lang}): numbers without a chip`, unchipped, '<=', 0);
      await page.context().close();
    }
  }

  // ── the governor on a walk ──────────────────────────────────────────────────
  if (only.includes('governor')) {
    const { page, errors } = await open(`reset=1&lang=de&mode=entscheider`);
    const path_ = [
      [0, 12.5, 0],
      [0, 6, 90],
      [-3.4, 2, 90],
      [-3.4, -4, 90],
      [0, -8, 0],
      [3, -6, -90],
      [3, 0, -90],
      [9.5, 1.5, -90],
      [9.5, 6, 180],
      [6, 9.5, 180],
      [-8, 9.5, 90],
      [-12, 6, 0],
      [-12, -2, 0],
      [0, 0, 0],
    ];
    let max0 = 0;
    let max1 = 0;
    let maxSkin = 0;
    let maxPlaying = 0;
    let samples = 0;
    for (const [x, z, yaw] of path_) {
      await ev(page, `__academy.teleport(${W(x, z)},{yaw:${yaw},pitch:-4})`);
      for (let k = 0; k < 6; k++) {
        await wait(page, 500);
        const s = await val(page, `__academy.ext('hall')('show')`);
        max0 = Math.max(max0, s.lod0);
        max1 = Math.max(max1, s.lod1);
        maxSkin = Math.max(maxSkin, s.skinnedUpdates);
        maxPlaying = Math.max(maxPlaying, s.playing);
        samples++;
      }
    }
    const end = await val(page, `__academy.ext('hall')('show')`);
    out.governor = { max0, max1, maxSkin, maxPlaying, samples, end };
    v.check('governor: robots at LOD0 at once (max)', Math.max(max0, end.maxLod0Seen), '<=', 2);
    v.check('governor: robots at LOD1 at once (max)', Math.max(max1, end.maxLod1Seen), '<=', 8);
    // skinned meshes updated in a frame: the ≤ 2 playing robots (LeKiwi's arm is its own mesh)
    v.check('governor: skinned meshes updated per frame (max)', maxSkin, '<=', 3);
    v.check('governor: Vorführungen at once (max)', maxPlaying, '<=', 2);
    v.check('governor: LRU of parsed files beyond the visible set', end.lru.length, '<=', 3);
    v.check('governor: console errors on the walk', errors.length, '<=', 0);
    await page.context().close();
  }

  // ── Vorführung once per approach ────────────────────────────────────────────
  if (only.includes('vorfuehrung')) {
    const { page } = await open(`reset=1&lang=de&mode=entscheider`);
    // the Go2 (west, at −5.2, 6.6): approach from the aisle
    const count = async () => (await val(page, `__academy.ext('hall')('show')`)).vorfuehrungen['plinth:unitree-go2'] ?? 0;
    await ev(page, `__academy.teleport(${W(0, 12)},{yaw:0,pitch:0})`);
    await wait(page, 3000);
    const c0 = await count();
    await ev(page, `__academy.teleport(${W(-1.5, 6.6)},{yaw:90,pitch:-8})`);
    await wait(page, 8000);
    const c1 = await count();
    await wait(page, 9000);
    const c2 = await count();
    await ev(page, `__academy.teleport(${W(6, -6)},{yaw:0,pitch:0})`);
    await wait(page, 2500);
    await ev(page, `__academy.teleport(${W(-1.5, 6.6)},{yaw:90,pitch:-8})`);
    await wait(page, 6000);
    const c3 = await count();
    out.vorfuehrung = { c0, c1, c2, c3 };
    v.check('Vorführung: plays on the first approach', c1 - c0, '=', 1);
    v.check('Vorführung: not again while you stay', c2 - c1, '=', 0);
    v.check('Vorführung: again after you walked away and came back', c3 - c2, '=', 1);
    await page.context().close();
  }

  // ── deliveries ──────────────────────────────────────────────────────────────
  if (only.includes('deliveries')) {
    const g = await open(`reset=1&lang=de&mode=entdecker`);
    const { page } = g;
    const evts = async (type) => (await val(page, `__academy.events(200)`)).filter((e) => e.type === type).map((e) => e.payload?.id);
    // the first visit holds deliveries until a Lastenheft round: play one, then force two arrivals
    await ev(page, `__academy.teleport(${W(0, 8)},{yaw:0,pitch:0})`);
    await wait(page, 2500);
    await val(page, `__academy.solve('schauhalle','solve-a')`);
    await wait(page, 2500);
    await ev(page, `__academy.closeModals()`);
    await val(page, `__academy.solve('schauhalle','deliver:anymal-d')`);
    await val(page, `__academy.solve('schauhalle','deliver:open-duck-mini-v2')`);
    let st = null;
    for (let k = 0; k < 60; k++) {
      await wait(page, 1000);
      st = await val(page, `__academy.ext('hall')('deliveries')`);
      if (!st.busy && !st.pending.length) break;
      if (k === 6) await shot(page, 'delivery');
    }
    const delivered = await evts('schauhalle:delivered');
    const shown = (await val(page, `__academy.ext('hall')()`)).shown;
    out.deliveries = { st, delivered, shown };
    v.check('deliveries: robots delivered', st.unboxed.length, '>=', 2);
    v.check('deliveries: ANYmal D delivered once', delivered.filter((e) => e === 'anymal-d').length, '=', 1);
    v.check('deliveries: Open Duck delivered once', delivered.filter((e) => e === 'open-duck-mini-v2').length, '=', 1);
    v.require('deliveries: both stand on their plinths after it', shown.includes('anymal-d') && shown.includes('open-duck-mini-v2'));
    // a reload (the same save) keeps them unboxed: no second flight
    await page.waitForTimeout(1500);
    await page.goto(`${srv.url}/?skipIntro=1&flight=ground&lang=de&mode=entdecker`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 120000, polling: 200 });
    await page.evaluate(() => void window.__academy.loadAll?.());
    await page.waitForFunction(() => window.__academy.settledAll === true, null, { timeout: 120000, polling: 200 });
    await ev(page, `__academy.teleport(${W(0, 8)},{yaw:0,pitch:0})`);
    await wait(page, 8000);
    const again = await evts('schauhalle:delivery');
    const st2 = await val(page, `__academy.ext('hall')('deliveries')`);
    out.deliveries.reload = { again, st2 };
    v.check('deliveries: none again after a reload', again.length, '=', 0);
    v.check('deliveries: still unboxed after a reload', st2.unboxed.length, '>=', 2);
    await page.context().close();
    // Entscheider: everything stands (the H2 stays covered)
    const e = await open(`reset=1&lang=de&mode=entscheider`);
    const sh = await val(e.page, `__academy.ext('hall')()`);
    v.check('deliveries (Entscheider): robots standing', sh.shown.length, '=', sh.robots - 1);
    v.require('deliveries (Entscheider): the H2 stays covered', !sh.unveiled);
    await e.page.context().close();
  }

  // ── the Tresor ────────────────────────────────────────────────────────────────
  if (only.includes('tresor')) {
    const { page, errors } = await open(`reset=1&lang=de&mode=entdecker`);
    await ev(page, `__academy.teleport(${W(-3.6, -8.4)},{yaw:0,pitch:-4})`);
    await wait(page, 2500);
    const before = await val(page, `__academy.ext('hall')()`);
    const covered = await val(page, `(async () => { await __academy.solve('schauhalle','inspect:unitree-h2'); await new Promise((r) => setTimeout(r, 1200)); const p = document.querySelector('.operate-panel'); const t = p ? p.innerText : ''; __academy.exitOperate(); return { words: t.split(/\\s+/).filter((w) => /[\\p{L}\\p{N}]/u.test(w)).length, text: t.slice(0, 300) }; })()`);
    await val(page, `__academy.solve('schauhalle','unveil-h2')`);
    await wait(page, 7000);
    await shot(page, 'tresor');
    const after = await val(page, `__academy.ext('hall')()`);
    const quest = await val(page, `__academy.quest()?.mastery ?? null`);
    out.tresor = { before: { unveiled: before.unveiled, h2: before.shown.includes('unitree-h2') }, after: { unveiled: after.unveiled, h2: after.shown.includes('unitree-h2') }, quest, covered };
    v.require('Tresor: the H2 stands covered at first', !before.unveiled && !before.shown.includes('unitree-h2'));
    v.check('Tresor: the covered H2 card at open (words)', covered.words, '<=', 35);
    v.require('Tresor: the covered H2 card shows its datasheet', /Unitree H2/.test(covered.text) && /Preisklasse|Price band/i.test(covered.text));
    v.require('Tresor: after the unveiling the H2 stands on its plinth', after.unveiled && after.shown.includes('unitree-h2'));
    v.require('Tresor: the quest records the unveiling (ctx.quest.unveilH2)', quest?.h2Unveiled === true);
    await page.waitForTimeout(1500);
    await page.goto(`${srv.url}/?skipIntro=1&flight=ground&lang=de&mode=entdecker`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 120000, polling: 200 });
    await page.evaluate(() => void window.__academy.loadAll?.());
    await page.waitForFunction(() => window.__academy.settledAll === true, null, { timeout: 120000, polling: 200 });
    const again = await val(page, `__academy.ext('hall')()`);
    v.require('Tresor: still unveiled after a reload', again.unveiled && again.shown.includes('unitree-h2'));
    v.check('Tresor: console errors', errors.length, '<=', 0);
    await page.context().close();
  }

  // ── the Lastenheft ──────────────────────────────────────────────────────────
  if (only.includes('lastenheft')) {
    const { page, errors } = await open(`reset=1&lang=de&mode=entdecker`);
    await ev(page, `__academy.teleport(${W(-3, 10.6)},{yaw:90,pitch:0})`);
    await wait(page, 1500);
    const a = await val(page, `__academy.solve('schauhalle','solve-a')`);
    await wait(page, 2000);
    const merged = await val(page, `__academy.gameUi().log.filter((l) => l.key.startsWith('schauhalle.') && l.merged).length`);
    await shot(page, 'lastenheft-banner');
    await ev(page, `__academy.closeModals()`);
    const b = await val(page, `__academy.solve('schauhalle','stars3-a')`);
    await wait(page, 1500);
    const ch = await val(page, `__academy.challenges().find((c) => c.key === 'schauhalle.lastenheft') ?? null`);
    out.lastenheft = { a, b, merged, ch };
    v.require('Lastenheft: the solve hook stamps the station', !!a?.stamped);
    v.check('Lastenheft: stamp and result in one banner', merged, '>=', 1);
    v.check('Lastenheft: stars3 hook', ch?.stars ?? 0, '=', 3);
    v.check('Lastenheft: console errors', errors.length, '<=', 0);
    await page.context().close();
  }

  // ── the Schaufenster (Entscheider) ──────────────────────────────────────────
  if (only.includes('fenster')) {
    const { page, errors } = await open(`reset=1&lang=en&mode=entscheider`);
    await ev(page, `__academy.teleport(${W(0, 12)},{yaw:0,pitch:0})`);
    await wait(page, 2500);
    const r = await val(page, `__academy.ext('schaufenster')()`);
    const stop = (await val(page, `__academy.events(200)`)).filter((e) => e.type === 'route:stop').map((e) => e.payload).pop() ?? null;
    out.fenster = { r, stop };
    await shot(page, 'schaufenster');
    v.check('Schaufenster by bot (s)', r?.seconds ?? null, '<=', 180);
    for (const id of ['belohnung', 'erntetag', 'traumdaten']) v.require(`Schaufenster: Befundkarte „${id}“ in the set`, !!r?.befunde?.includes(id));
    v.require('Schaufenster: the route stop is reported done', !!stop?.done && stop.area === 'schauhalle');
    v.check('Schaufenster: console errors', errors.length, '<=', 0);
    await page.context().close();
  }
} catch (err) {
  v.require(`run without a script error (${String(err).slice(0, 160)})`, false);
  console.error(err);
}

saveJson('hall-check.json', out);
await browser.close().catch(() => {});
await srv.close().catch(() => {});
v.exit(args);
