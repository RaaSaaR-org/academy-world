// discover-check scenario `tour` (WP-D1, plan §3.2, §3.3, §4, §5 WP-D1): the 12 stops, their cards and
// the hotspots, on the phone profile at 390×844 (portrait), then 4 stops in English and 2 in landscape.
//   stops       „Los“, then every stop by a tap on the sheet's ›, then all the way back by ←; each arrival:
//               the stop, the top bar „i / 12“, the stop's card, the live line
//   cards       every stop card and every spot card („Hier zu sehen“): its text is the generated text of
//               src/discover/data/content.gen.ts (whose provenance tools/discover/content.mjs --check
//               re-resolves against the game's sources), a chip in every block with a number, ≤ 35 words
//               at half height; „Zurück“ returns to the stop card
//   hotspots    a marker tap opens its spot card; the stop list (menu „Alle Stopps“) is an <ol> with
//               aria-current="step" and goes to a stop
//   rules       0 lobe zone:enter, 0 MuJoCo / duck worker requests, 0 third-party requests, every request
//               under /academy-world/, 0 page errors
//   screens     artifacts/discover/<device>/tour-de-NN-<stop>.png (every stop, DE), tour-en-<stop>.png (4),
//               tour-land-<stop>.png (844×390, 2)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib/measure.mjs';
import { tapEl } from './boot.mjs';

export const scenario = { name: 'tour' };

const ENTERS = `(() => { const iv = setInterval(() => { const g = window.__academy && window.__academy.game; if (g && g.events) { clearInterval(iv); window.__dcEnters = []; g.events.on('zone:enter', (p) => window.__dcEnters.push(p && p.id)); } }, 10); })();`;
const LOBES = new Set(['sensordom', 'regelgarten', 'greifwerkstatt', 'lern-dojo', 'dunkelfabrik', 'prueffeld']);
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const EN_STOPS = ['dock', 'schauhalle', 'sonnenacker', 'abheben'];
const LAND_STOPS = ['zonen-nord', 'traumhangar'];

/** the generated content (TITLES, CARDS, CARD_ALIAS) parsed out of content.gen.ts */
function readGen() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'discover', 'data', 'content.gen.ts'), 'utf8');
  const grab = (name) => {
    const a = src.indexOf('{', src.indexOf('= ', src.indexOf(`export const ${name}`)));
    // the matching brace, outside JSON strings („{de,en}“ sits inside the `from` texts)
    let depth = 0;
    let str = false;
    for (let i = a; i < src.length; i++) {
      const c = src[i];
      if (str) {
        if (c === '\\') i++;
        else if (c === '"') str = false;
      } else if (c === '"') str = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return JSON.parse(src.slice(a, i + 1));
    }
    throw new Error(`content.gen.ts: no ${name}`);
  };
  return { titles: grab('TITLES'), cards: grab('CARDS'), alias: grab('CARD_ALIAS') };
}

let provenance = null;
/** tools/discover/content.mjs --check: every text still resolves to its source and matches it */
function checkProvenance() {
  if (provenance) return provenance;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'discover', 'content.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  provenance = { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ') };
  return provenance;
}

/** the card in the sheet as the page shows it */
const CARD = () => {
  const sh = document.querySelector('.dsc-sheet');
  const strip = (b) => {
    const c = b.cloneNode(true);
    c.querySelectorAll('.chip, .dsc-psrc').forEach((x) => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const ps = [...sh.querySelectorAll('.dsc-card .dsc-p')].map((p) => ({ text: strip(p), chip: !!(p.closest('.dsc-pb') ?? p).querySelector('.chip') }));
  const rows = [...sh.querySelectorAll('.dsc-card .dsc-row')].map((r) => ({ label: r.querySelector('dt').textContent.trim(), value: strip(r.querySelector('dd')), chip: !!r.querySelector('.chip') }));
  return {
    id: sh.dataset.card,
    snap: sh.dataset.snap,
    title: sh.querySelector('.dsc-title')?.textContent ?? '',
    ps,
    rows,
    chips: [...sh.querySelectorAll('.dsc-chipbtn')].map((b) => b.textContent),
    actions: [...sh.querySelectorAll('.dsc-actions [data-action]')].map((b) => b.dataset.action),
    rect: (() => {
      const r = sh.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    })(),
  };
};

/** a number: a digit not glued to a letter or a hyphen (ids such as M1, UR5e, SO-101, EMI-02 are names) */
const NUMBER = /(?<![\p{L}\d-])\d/u;
const words = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** compare the shown card with the generated one; returns the problems */
function cardProblems(gen, shown, lang) {
  const id = shown.id;
  const g = gen.cards[gen.alias[id] ?? id];
  if (!g) return [`${id}: not a generated card`];
  const out = [];
  if (shown.title !== g.title[lang]) out.push(`${id}: title „${shown.title}“ ≠ „${g.title[lang]}“`);
  const gp = g.blocks.filter((b) => b.kind === 'p');
  const gr = g.blocks.filter((b) => b.kind === 'rows').flatMap((b) => b.rows);
  if (shown.ps.length !== gp.length) out.push(`${id}: ${shown.ps.length} paragraphs, generated ${gp.length}`);
  gp.forEach((b, i) => {
    if (shown.ps[i]?.text !== b.text[lang]) out.push(`${id}: paragraph ${i + 1} „${shown.ps[i]?.text}“ ≠ „${b.text[lang]}“`);
    if (!b.text.from) out.push(`${id}: paragraph ${i + 1} has no provenance`);
  });
  gr.forEach((r, i) => {
    if (shown.rows[i]?.value !== r.value[lang]) out.push(`${id}: row ${i + 1} „${shown.rows[i]?.value}“ ≠ „${r.value[lang]}“`);
    if (!r.value.from || !r.label.from) out.push(`${id}: row ${i + 1} has no provenance`);
  });
  for (const [i, p] of shown.ps.entries()) if (NUMBER.test(p.text) && !p.chip) out.push(`${id}: paragraph ${i + 1} has a number but no chip: „${p.text}“`);
  for (const [i, r] of shown.rows.entries()) if (NUMBER.test(r.value) && !r.chip) out.push(`${id}: row ${i + 1} has a number but no chip: „${r.value}“`);
  const n = words(shown.ps.map((p) => p.text).join(' '));
  if (n > 35) out.push(`${id}: ${n} words at half height (≤ 35)`);
  return out;
}

const arrived = (id) => {
  const s = window.__discover.state();
  return s.stop === id && !s.flying && s.card === `stop:${id}`;
};

export default async function run(t) {
  const gen = readGen();
  const prov = checkProvenance();
  t.require('content.gen.ts: every text resolves to its source (content.mjs --check)', prov.ok, prov.out);
  const problems = [];
  const seenCards = new Set();

  // ── portrait, German: every stop forward by ›, back by ← ──
  const dev = { ...t.dev, context: { ...t.dev.context, viewport: PORTRAIT } };
  const h = await t.open('?discover=1&stills=0&lang=de', { dev, init: [ENTERS], waitUntil: 'commit' });
  const { page } = h;
  await t.waitState(page, (s) => s.startCard, 180000);
  const stops = await page.evaluate(() => window.__discover.stops());
  t.require('12 stops', stops.length === 12, stops.map((s) => s.id).join(', '));
  await tapEl(t, page, '.dsc-start [data-action="go"]');
  const inspect = async (i) => {
    const st = stops[i];
    const ok = await page.waitForFunction(arrived, st.id, { timeout: 150000, polling: 100 }).then(() => true, () => false);
    const s = await t.state(page);
    const top = await page.evaluate(() => document.querySelector('.dsc-stepn')?.textContent ?? '');
    await page.waitForFunction((title) => document.querySelector('.dsc-live')?.textContent === title, st.title, { timeout: 3000 }).catch(() => {});
    const live = await page.evaluate(() => document.querySelector('.dsc-live')?.textContent ?? '');
    return { ok: ok && top === `${i + 1} / ${stops.length}` && live === st.title, detail: `${s.stop} · ${top} · ${s.card} · „${live}“` };
  };

  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    if (i > 0) await tapEl(t, page, '.dsc-sheet .dsc-nav.next');
    const r = await inspect(i);
    t.require(`› reaches stop ${i + 1} (${st.id}): stop, „i / 12“, card, live line`, r.ok, r.detail);
    if (!r.ok) break;
    const card = await page.evaluate(CARD);
    seenCards.add(card.id);
    problems.push(...cardProblems(gen, card, 'de'));
    if (card.snap !== 'peek') problems.push(`${st.id}: arrives with the sheet ${card.snap}, not peek`);
    await page.waitForTimeout(400); // the sheet's height transition (0.28 s)
    await t.shot(page, `de-${String(i + 1).padStart(2, '0')}-${st.id}`);
    // „Hier zu sehen“: every chip opens its card, „Zurück“ returns
    const tour = await page.evaluate(() => window.__discoverTour());
    for (let k = 0; k < card.chips.length; k++) {
      await page.evaluate(() => window.__discover.handle.sheet.setSnap('half'));
      await page.waitForTimeout(350);
      const sel = `.dsc-sheet .dsc-chipbtn:nth-of-type(${k + 1})`;
      await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), sel);
      await page.waitForTimeout(150);
      await tapEl(t, page, sel);
      await page.waitForTimeout(250);
      const spot = await page.evaluate(CARD);
      seenCards.add(spot.id);
      const want = tour.chips[k] ?? '';
      // a robot chip opens D2's robot card (its own id); a spot chip its generated card
      if (want.startsWith('spot:') ? spot.id !== want : !spot.id || spot.id === `stop:${st.id}`) problems.push(`${st.id}: chip ${k + 1} „${card.chips[k]}“ opened ${spot.id}, expected ${want}`);
      if (want.startsWith('spot:')) problems.push(...cardProblems(gen, spot, 'de'));
      if (!spot.actions.includes('back')) problems.push(`${spot.id}: no „Zurück“`);
      else {
        await page.evaluate(() => document.querySelector('.dsc-sheet [data-action="back"]').click());
        await page.waitForTimeout(150);
        const back = await page.evaluate(() => document.querySelector('.dsc-sheet').dataset.card);
        if (back !== `stop:${st.id}`) problems.push(`${spot.id}: „Zurück“ shows ${back}`);
      }
    }
    if (card.chips.length) {
      await page.evaluate(() => window.__discover.handle.sheet.setSnap('peek'));
      await page.waitForTimeout(350);
    }
    // a marker on screen: a tap opens its spot card
    if (tour.markers.length && !seenCards.has('marker-tapped')) {
      const id = tour.markers[0];
      await tapEl(t, page, `.dsc-mark[data-spot="${id}"]`).catch(() => {});
      await page.waitForTimeout(300);
      const c = await page.evaluate(() => document.querySelector('.dsc-sheet').dataset.card);
      t.require(`a marker tap opens its card (${id} at ${st.id})`, c === `spot:${id}`, c);
      seenCards.add('marker-tapped');
      await page.evaluate(() => document.querySelector('.dsc-sheet [data-action="back"]')?.click());
      await page.evaluate(() => window.__discover.handle.sheet.setSnap('peek'));
      await page.waitForTimeout(300);
    }
  }
  t.require('a marker was on screen and tapped at some stop', seenCards.has('marker-tapped'));
  const expectSpots = Object.keys(gen.cards).filter((k) => k.startsWith('spot:')).concat(Object.keys(gen.alias));
  const missed = expectSpots.filter((k) => !seenCards.has(k));
  t.require('every spot card was opened from a „Hier zu sehen“ chip', missed.length === 0, missed.join(', '));
  t.check('card problems (text = generated text, chips on numbers, ≤ 35 words, peek on arrival)', problems.length, '<=', 0);
  for (const p of problems.slice(0, 12)) t.log(p);

  // the stop list: menu → „Alle Stopps“ → <ol>, aria-current on the current stop → go to stop 6
  await tapEl(t, page, '.dsc-menu-btn');
  await page.waitForTimeout(200);
  await tapEl(t, page, '.dsc-menu [data-id="stops"]');
  await page.waitForTimeout(400);
  const list = await page.evaluate(() => ({ n: document.querySelectorAll('.dsc-sheet ol.dsc-stoplist > li > button').length, cur: document.querySelector('.dsc-sheet .dsc-stopbtn[aria-current="step"]')?.dataset.stop }));
  t.require('„Alle Stopps“: an <ol> of 12 stops, aria-current="step" on the current one', list.n === 12 && list.cur === stops[stops.length - 1].id, JSON.stringify(list));
  await t.shot(page, 'de-list');
  await tapEl(t, page, `.dsc-sheet .dsc-stopbtn[data-stop="${stops[5].id}"]`);
  const viaList = await page.waitForFunction(arrived, stops[5].id, { timeout: 150000, polling: 100 }).then(() => true, () => false);
  t.require(`the stop list goes to stop 6 (${stops[5].id})`, viaList);

  // back by ←: from stop 12 to stop 1
  await page.evaluate(() => window.__discover.goto(window.__discover.stops()[11].id));
  await page.waitForFunction(arrived, stops[11].id, { timeout: 150000, polling: 100 }).catch(() => {});
  for (let i = stops.length - 2; i >= 0; i--) {
    await page.focus('body').catch(() => {});
    await page.keyboard.press('ArrowLeft');
    const r = await inspect(i);
    t.require(`← reaches stop ${i + 1} (${stops[i].id})`, r.ok, r.detail);
    if (!r.ok) break;
  }

  // rules of the whole run
  const enters = await page.evaluate(() => window.__dcEnters ?? []);
  t.check('lobe zone:enter events (the whole tour, twice)', enters.filter((id) => LOBES.has(id)).length, '<=', 0);
  const urls = h.requests.map((r) => r.url);
  const mj = urls.filter((u) => /mujoco|duck\.worker|duck-rec|\/duck-[\w-]+\.bin/i.test(u));
  t.check('MuJoCo / duck worker requests', mj.length, '<=', 0);
  if (mj.length) t.log(mj.slice(0, 4).map((u) => new URL(u).pathname).join(', '));
  t.check('third-party requests', t.thirdParty(h.requests).length, '<=', 0);
  t.check('requests outside /academy-world/', t.outside(h.requests).length, '<=', 0);
  t.check('page and console errors', h.errors.length, '<=', 0);
  if (h.errors.length) t.log(h.errors.slice(0, 4));
  await h.close();

  // ── English: 4 stops, the cards' English text ──
  {
    const e = await t.open(`?discover=1&stills=0&lang=en&stop=${EN_STOPS[0]}`, { dev, throttle: false });
    await t.waitState(e.page, (s) => s.stop != null && !s.flying, 180000);
    const enProblems = [];
    for (const id of EN_STOPS) {
      await e.page.evaluate((id) => window.__discover.goto(id), id);
      const ok = await e.page.waitForFunction(arrived, id, { timeout: 150000, polling: 100 }).then(() => true, () => false);
      if (!ok) {
        enProblems.push(`${id}: not reached`);
        continue;
      }
      const card = await e.page.evaluate(CARD);
      enProblems.push(...cardProblems(gen, card, 'en'));
      const top = await e.page.evaluate(() => document.querySelector('.dsc-stept')?.textContent ?? '');
      if (top !== gen.titles[id].en) enProblems.push(`${id}: top bar „${top}“ ≠ „${gen.titles[id].en}“`);
      await e.page.waitForTimeout(800);
      await t.shot(e.page, `en-${id}`);
    }
    t.check('English: card and top-bar problems (4 stops)', enProblems.length, '<=', 0);
    for (const p of enProblems.slice(0, 6)) t.log(p);
    t.check('English: page errors', e.errors.length, '<=', 0);
    await e.close();
  }

  // ── landscape 844×390: the sheet is a side panel ──
  {
    const land = { ...t.dev, context: { ...t.dev.context, viewport: LANDSCAPE } };
    const l = await t.open(`?discover=1&stills=0&lang=de&stop=${LAND_STOPS[0]}`, { dev: land, throttle: false });
    await t.waitState(l.page, (s) => s.stop != null && !s.flying, 180000);
    for (const id of LAND_STOPS) {
      await l.page.evaluate((id) => window.__discover.goto(id), id);
      const ok = await l.page.waitForFunction(arrived, id, { timeout: 150000, polling: 100 }).then(() => true, () => false);
      await l.page.evaluate(() => window.__discover.handle.sheet.setSnap('half'));
      await l.page.waitForTimeout(800);
      const card = await l.page.evaluate(CARD);
      t.require(`landscape: ${id} reached, the card a right side panel`, ok && card.rect.left > LANDSCAPE.width / 2 && card.rect.height > LANDSCAPE.height * 0.6, JSON.stringify(card.rect));
      await t.shot(l.page, `land-${id}`);
    }
    t.check('landscape: page errors', l.errors.length, '<=', 0);
    await l.close();
  }
}
