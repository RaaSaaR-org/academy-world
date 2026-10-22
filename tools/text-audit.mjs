#!/usr/bin/env node
// Text audit (release QA): plays every area's solve hooks in one language/mode and records
//   - every info card: title, word count (body, bullets, decision box; no metrics), overflow at
//     the viewport size (px the card has to scroll), plus a screenshot
//   - every EMI / subtitle line: speaker, words, sentences
// Budgets. Phase 7 (docs/PHASE7-PLAN.md §4 conventions, §3.2) for every area that is new in Phase 7 or
// reworked (a station with manifest rev ≥ 2, or a request string `zone.<id>.request`); the rc4 budgets
// (docs/FUN-PLAN.md §5 C3) for the legacy rc4 lobes, whose Phase 7 misses are reported, not failed:
//   - the zone's request (its first EMI line on entry): ≤ 12 words              (legacy: reported)
//   - EMI lines ≤ 18 words and ≤ 2 sentences                                   (legacy: ≤ 22 words)
//   - prose words (EMI lines + objective; key legends excluded) on zone entry before the first
//     input: ≤ 25
//   - operate panels (consoles) at open: ≤ 35 words                           (legacy: ≤ 50; ≤ 70 on
//     the ◆ decision panels Dunkelfabrik C, Prüffeld A)
//   - banner lessons (ChallengeDef.lesson): ≤ 14 words
//   - info cards that opened with no click: 0 in Entdecker mode; cards that scroll: 0
// Every card a player can open in an area (signs, robot plaques, site cards) is opened through the
// area's interactables; egg cards (secrets, WP15) are pending until WP15 registers them.
// --chips: every number in player text (info cards and consoles) carries a chip (`.chip`,
// Kit.chipElement) in its block (row, paragraph, list item, metric) or in the block's header. Exempt:
// names (headings, eyebrows, keys, system ids M1/T3/F1), source lines, UI counters „5 / 12“, and any
// element marked data-chip (e.g. data-chip="ui" on a slider value). The result banner is the player's
// own result (game UI) and is not scanned. Legacy rc4 areas are reported, Phase 7 areas fail.
//
//   node tools/text-audit.mjs [--lang de|en] [--mode entdecker|entscheider] [--zones a,b] [--chips] [--shots]
//
// Output: artifacts/release/text-audit/<lang>-<mode>.json (+ card PNGs with --shots). Exit 1 on a page
// error or a failed budget (legacy findings are listed as „report“).
// Runs on a private production build (tools/lib/session.mjs), 1280×720 by default.
import fs from 'node:fs';
import path from 'node:path';
import { session } from './lib/session.mjs';
import { parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const lang = String(args.lang ?? 'de');
const mode = String(args.mode ?? 'entdecker');
const shots = !!args.shots;
const chipsMode = !!args.chips;
let ZONES = args.zones ? String(args.zones).split(',') : null;
const RC4_LOBES = new Set(['sensordom', 'regelgarten', 'greifwerkstatt', 'lern-dojo', 'dunkelfabrik', 'prueffeld']);
/** per area: true = Phase 7 budgets (fail), false = legacy rc4 (report) */
const strict = {};
const chipFindings = [];
process.env.PT_DIR = process.env.PT_DIR || path.join('release', 'text-audit');

const cards = [];
const flags = [];
/** flag(area, message): a failure in a Phase 7 area, a report in a legacy one (area null = the island: legacy until WP12) */
const flag = (area, msg) => flags.push({ area, msg, fail: !!(area && strict[area]) });
const flagAlways = (msg) => flags.push({ area: null, msg, fail: true });
let lines = [];
const entry = [];
const panels = [];
let lessons = [];
let autoCards = [];
const countWords = (t) => String(t || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const { errors } = await session(`${lang}-${mode}`, async (s) => {
  await s.open(`/?reset=1&skipIntro=1&lang=${lang}&mode=${mode}`);
  await s.wait(1200);
  const areas = await s.val(`__academy.manifests('all').filter((m) => m.hasCode && !m.id.startsWith('_')).map((m) => ({ id: m.id, kind: m.kind, rev2: m.stations.some((st) => (st.rev ?? 1) >= 2), request: __academy.game.i18n.has('zone.' + m.id + '.request') }))`);
  ZONES ??= areas.map((a) => a.id);
  for (const a of areas) strict[a.id] = !RC4_LOBES.has(a.id) || a.rev2 || a.request;
  // sites load once the Revier is open (plan §5.6), which a fresh game is not: load them as a player who
  // landed would find them. A site's spawn is inside its plot (frames-check), so its entry starts at the teleport.
  const sites = new Set(areas.filter((a) => a.kind === 'site').map((a) => a.id));
  if (ZONES.some((z) => sites.has(z))) {
    await s.ev(`void __academy.loadAll()`);
    for (let t = 0; t < 360 && !(await s.val(`__academy.settledAll === true`)); t++) await s.wait(500);
  }
  s.log('AREAS', areas.map((a) => `${a.id}${strict[a.id] ? ' (Phase 7 budgets)' : ' (legacy rc4)'}`).join(', '));
  // log every subtitle line as it is queued, resolved in the current language and mode
  await s.ev(`
    const g = __academy.game; window.__lines = [];
    const d = g.hud.dialogue; const orig = d.say.bind(d);
    d.say = (ls, o = {}) => {
      const arr = Array.isArray(ls) ? ls : [ls];
      for (const l of arr) {
        const isObj = l && typeof l === 'object' && 'text' in l;
        const text = g.i18n.resolve(isObj ? l.text : l);
        const sp = g.i18n.resolve((isObj && l.speaker) || o.speaker || 'EMI');
        window.__lines.push({ speaker: sp, text, zone: g.zones.current ? g.zones.current() : null });
      }
      return orig(ls, o);
    };`);
  const measureCard = async (label) => {
    const c = await s.val(`(() => {
      const card = document.querySelector('.modal-backdrop:not(.passthrough) .modal');
      if (!card) return null;
      const text = card.querySelector('.text');
      const clone = text ? text.cloneNode(true) : document.createElement('div');
      clone.querySelectorAll('.metrics, .illus, .eyebrow').forEach((e) => e.remove());
      const words = (clone.textContent || '').replace(/\\*\\*/g, '').split(/\\s+/).filter((w) => /[\\p{L}\\p{N}]/u.test(w)).length;
      const kind = card.classList.contains('infocard') ? 'card' : 'modal';
      return { kind, title: (card.querySelector('h2, h1, .title')?.textContent || '').trim().slice(0, 80), words, overflow: Math.max(0, card.scrollHeight - card.clientHeight), height: card.clientHeight };
    })()`);
    if (!c) return;
    c.at = label;
    cards.push(c);
    if (shots) await s.shot(`card-${label.replace(/\s+/g, '-')}`);
    if (c.overflow > 0) flagAlways(`card scrolls ${c.overflow}px: ${label} "${c.title}"`);
    if (chipsMode) await chipScan('.modal-backdrop:not(.passthrough) .modal', label, label.split(' ')[0]);
  };
  /** --chips: numbers without a chip in their block (cards, consoles) */
  const chipScan = async (selector, where, area) => {
    const found = await s.val(`(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      if (!root) return [];
      const EXEMPT = 'h1, h2, h3, .title, .eyebrow, .chip, kbd, .kbd, .key, button, .source, .src, .credit, .lesson-src, .legend';
      const BLOCK = 'p, li, tr, .metric, .row, .kv, .line, .stat, .readout, .decision, section, .klhead, .kennlinie';
      const out = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || el.closest(EXEMPT)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        // UI counters („Clip 5 / 12“, „2/9 Fragen“) are game state, not claims
        const text = n.textContent.replace(/\\d+\\s*\\/\\s*\\d+/g, '');
        for (const m of text.matchAll(/(?<![\\p{L}\\d\\/·#])[-−+±≈]?\\d+(?:[.,]\\d+)*(?![\\p{L}\\d])/gu)) {
          const block = el.closest(BLOCK) || root;
          const head = block.parentElement ? block.parentElement.querySelector(':scope > .chips, :scope > .klhead, :scope > header') : null;
          const has = !!(block.querySelector('.chip') || (head && head.querySelector('.chip')) || el.closest('[data-chip]'));
          if (!has) out.push({ number: m[0], text: text.trim().slice(0, 90) });
        }
      }
      return out;
    })()`);
    for (const f of found) chipFindings.push({ where, area, ...f, fail: !!strict[area] });
  };
  for (const z of ZONES) {
    // lines still queued from the areas before (the island's beats: ignitions, 6/6, the Revier) play out
    // where the player stands first (≥ 3 s without a line, ≤ 40 s), so they do not count as this area's
    // entry prose (Request(WP7) from WP9: the 6/6 line landed in the Sonnenacker's entry)
    await s.val(`(async () => { let quiet = 0; for (let i = 0; i < 80 && quiet < 6; i++) { await new Promise((r) => setTimeout(r, 500)); quiet = __academy.state().dialogue ? 0 : quiet + 1; } return quiet; })()`);
    const at = await s.val(`window.__lines.length`);
    await s.ev(`__academy.teleport('${z}')`);
    await s.wait(1000);
    const l0 = sites.has(z) ? at : await s.val(`window.__lines.length`);
    await s.ev(`__academy.press('KeyW', 2600)`);
    await s.wait(5200);
    // prose before the first input: the zone's own lines since the gate + the objective now
    const pre = await s.val(`({ lines: window.__lines.slice(${l0}).map((l) => l.text), objective: __academy.state().objective, hint: document.querySelector('#hint.show')?.textContent || null })`);
    const proseWords = pre.lines.reduce((n, t) => n + countWords(t), 0) + countWords(pre.objective);
    const request = pre.lines[0] ?? null;
    entry.push({ zone: z, words: proseWords, lines: pre.lines, objective: pre.objective, hint: pre.hint, request, requestWords: countWords(request) });
    if (proseWords > 25) flag(z, `zone entry ${z}: ${proseWords} words of prose before the first input (≤ 25)`);
    if (!request) flag(z, `zone entry ${z}: no EMI line on entry (the request, §3.2)`);
    else if (countWords(request) > 12) flag(z, `zone request ${z}: ${countWords(request)} words (≤ 12): „${request}“`);
    const extra = { 'lern-dojo': ['card-a', 'card-b', 'card-c', 'befund'] }[z] ?? [];
    for (const h of ['solve-a', 'solve-b', 'solve-c', 'album', ...extra]) {
      // the extra hooks stand for a player reading a sign (E): their cards count as requested
      const asked = extra.includes(h);
      if (asked) await s.ev(`const ic = __academy.game.infoCards; window.__ua ??= ic.userActive; ic.userActive = () => true;`);
      // some hooks resolve only when their card closes: never wait longer than 15 s
      await s.val(`Promise.race([__academy.solve('${z}','${h}'), new Promise((r) => setTimeout(r, 15000))])`);

      // cards open after their station's EMI line (up to ≈ 9 s) and can queue: poll, measure, close
      let n = 0;
      for (let t = 0, quiet = 0; t < 34 && quiet < (n ? 6 : 30); t++) {
        await s.wait(500);
        const open = await s.val(`!!document.querySelector('.modal-backdrop:not(.passthrough) .modal')`);
        if (!open) { quiet++; continue; }
        quiet = 0;
        await s.wait(400);
        await measureCard(`${z} ${h}${n ? ` #${n + 1}` : ''}`);
        n++;
        await s.ev(`__academy.closeTopModal()`);
      }
      if (asked) await s.ev(`__academy.game.infoCards.userActive = window.__ua;`);
      const st = await s.state(`${z} ${h}`);
      if (st.operating) await s.ev(`__academy.exitOperate()`);
      if (st.modal) await s.ev(`__academy.closeModals()`);
      // the help key at this station
      await s.ev(`__academy.ask()`);
      await s.wait(300);
    }
    await s.ev(`__academy.teleport([0,0,40],{yaw:0,pitch:0})`);
    await s.wait(1200);
  }
  // operate panels at open (after the solves: every station is reachable). Every interact() below stands
  // for a player pressing E, so cards it opens (signs, the Gehirn-Stapel, the Prüffeld report) count as
  // requested; only the solve hooks above can reveal a card that opens by itself.
  await s.ev(`const ic = __academy.game.infoCards; window.__ua ??= ic.userActive; ic.userActive = () => true;`);
  for (const z of ZONES) {
    await s.ev(`__academy.teleport('${z}')`);
    await s.wait(1500);
    await s.ev(`__academy.press('KeyW', 1200)`);
    await s.wait(1600);
    const labels = await s.val(`[...new Set(__academy.interactables(70).filter((i) => i.owner === '${z}' && i.enabled !== false).map((i) => i.label))]`);
    for (const label of labels) {
      const st0 = await s.state('');
      if (st0.operating) await s.ev(`__academy.exitOperate()`);
      if (st0.modal) await s.ev(`__academy.closeModals()`);
      await s.val(`__academy.interact(${JSON.stringify(label)})`);
      await s.wait(1100);
      const r = await s.val(`(() => { const p = document.querySelector('.operate-panel'); return __academy.state().operating && p ? p.innerText : null; })()`);
      if (r != null) {
        const words = countWords(r);
        const decision = (z === 'dunkelfabrik' && /leitstand|licht|lights|control/i.test(label)) || (z === 'prueffeld' && /hersteller|vendor|vorführ|demo|frag/i.test(label));
        const limit = strict[z] ? 35 : decision ? 70 : 50;
        panels.push({ zone: z, label, words, limit });
        if (words > limit) flag(z, `operate panel ${z} „${label}": ${words} words at open (≤ ${limit})`);
        else if (!strict[z] && words > 35) flag(z, `operate panel ${z} „${label}": ${words} words at open (Phase 7 ≤ 35 for reworked consoles; legacy ≤ ${limit})`);
        if (chipsMode) await chipScan('.operate-panel', `panel ${z} „${label}“`, z);
        if (shots) await s.shot(`panel-${z}-${label.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30)}`);
        await s.ev(`__academy.exitOperate()`);
        await s.wait(500);
      }
      await s.ev(`__academy.closeModals()`);
    }
  }
  await s.ev(`__academy.game.infoCards.userActive = window.__ua;`);
  lessons = await s.val(`[...__academy.game.gameLayer.entries.values()].map((e) => ({ key: e.key, lesson: e.def.lesson ? __academy.game.i18n.resolve(e.def.lesson) : null }))`);
  autoCards = await s.val(`__academy.cards().filter((c) => !c.requested).map((c) => c.title)`);
  lines = await s.val(`window.__lines`);
});
for (const l of lessons) {
  l.words = countWords(l.lesson);
  if (l.words > 14) flag(l.key.split('.')[0], `banner lesson ${l.key}: ${l.words} words (≤ 14) „${l.lesson}"`);
}
if (mode === 'entdecker' && autoCards.length) flagAlways(`${autoCards.length} info card(s) opened with no click: ${autoCards.join(' | ')}`);

const seen = new Set();
const uniq = [];
for (const l of lines) {
  const k = l.speaker + '|' + l.text;
  if (seen.has(k)) continue;
  seen.add(k);
  const words = l.text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const sentences = (l.text.match(/[.!?…](?=\s|$)/g) || []).length || 1;
  uniq.push({ ...l, words, sentences });
  const area = l.zone && l.zone !== 'world' ? l.zone : null;
  if (sentences > 2) flag(area, `line has ${sentences} sentences: ${l.speaker} "${l.text}"`);
  if (words > 22) flag(area, `line has ${words} words (legacy ≤ 22, Phase 7 ≤ 18): ${l.speaker} "${l.text}"`);
  else if (words > 18) flag(area, `line has ${words} words (Phase 7 ≤ 18): ${l.speaker} "${l.text}"`);
}
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'artifacts', 'release', 'text-audit');
fs.mkdirSync(outDir, { recursive: true });
const words = cards.map((c) => c.words);
const summary = {
  lang, mode,
  cards: cards.length,
  cardWords: words.length ? { min: Math.min(...words), max: Math.max(...words), mean: Math.round(words.reduce((a, b) => a + b, 0) / words.length) } : null,
  cardsScrolling: cards.filter((c) => c.overflow > 0).length,
  lines: uniq.length,
  linesOver2Sentences: uniq.filter((l) => l.sentences > 2).length,
  maxLineWords: uniq.reduce((m, l) => Math.max(m, l.words), 0),
  zoneEntryProse: Object.fromEntries(entry.map((e) => [e.zone, e.words])),
  operatePanels: panels.length,
  operatePanelsOver: panels.filter((p) => p.words > p.limit).length,
  lessons: lessons.filter((l) => l.lesson).length,
  lessonsOver14: lessons.filter((l) => l.words > 14).length,
  cardsAuto: autoCards.length,
  requests: Object.fromEntries(entry.map((e) => [e.zone, e.requestWords])),
  phase7Areas: Object.keys(strict).filter((k) => strict[k]),
  failed: flags.filter((f) => f.fail).length,
  reported: flags.filter((f) => !f.fail).length,
  chips: chipsMode ? { unchipped: chipFindings.length, failing: chipFindings.filter((f) => f.fail).length } : null,
  errors: errors.length,
};
fs.writeFileSync(path.join(outDir, `${lang}-${mode}${chipsMode ? '-chips' : ''}.json`), JSON.stringify({ summary, cards, lines: uniq, entry, panels, lessons, autoCards, flags, chipFindings }, null, 2));
console.log(JSON.stringify(summary));
for (const f of flags) console.log(`  ${f.fail ? 'FAIL  ' : 'report'} ${f.msg}`);
if (chipsMode) {
  for (const f of chipFindings.slice(0, 60)) console.log(`  ${f.fail ? 'FAIL  ' : 'report'} no chip: ${f.number} in „${f.text}“ (${f.where})`);
  if (chipFindings.length > 60) console.log(`  … ${chipFindings.length - 60} more numbers without a chip`);
}
for (const c of cards) console.log(`  card ${String(c.words).padStart(3)} w ${c.overflow ? `scroll ${c.overflow}px` : ''}  ${c.at}: ${c.title}`);
for (const p of panels) console.log(`  panel ${String(p.words).padStart(3)} w (≤ ${p.limit})  ${p.zone}: ${p.label}`);
for (const e of entry) console.log(`  entry ${String(e.words).padStart(3)} w  ${e.zone}: ${e.objective ?? ''} | ${e.lines.join(' / ')}`);
const failed = flags.filter((f) => f.fail).length + chipFindings.filter((f) => f.fail).length;
console.log(errors.length || failed ? `FAIL text-audit: ${errors.length} errors, ${failed} failed budget(s)` : `OK   text-audit (${flags.length + chipFindings.length} legacy findings reported)`);
process.exit(errors.length || failed ? 1 : 0);
