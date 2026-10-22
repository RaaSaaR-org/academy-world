// discover-check scenario `storage` (WP-D0, plan §1.1, §1.7): Discover writes nothing to localStorage.
// The save fixture v2-present (tools/fixtures/saves) is seeded first, plus the quality-auto entry; then
// ?discover=1&reset=1 boots, tours the stops, switches the language, toggles reduced motion and sound and
// reloads. localStorage must be byte-identical before and after; sessionStorage may hold only Discover's
// own keys (discover-alive, discover-mode). The in-memory save is the seed (Entscheider, every station).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/measure.mjs';
import { seedEntries } from '../fixtures/saves/check.mjs';

export const scenario = { name: 'storage', quick: true };

const SEED = ([entries]) => {
  try {
    if (!sessionStorage.getItem('dc-seeded')) {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      sessionStorage.setItem('dc-seeded', '1');
    }
  } catch (e) {
    /* blocked */
  }
};
const SNAP = () => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    o[k] = localStorage.getItem(k);
  }
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
};

export default async function run(t) {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'saves', 'v2-present.json'), 'utf8'));
  const entries = { ...seedEntries(fx), 'emai-academy-island/v1:quality-auto': JSON.stringify({ level: 'medium', scale: 0.8, renderer: 'seeded' }) };
  const h = await t.open('?discover=1&stills=0&reset=1', { throttle: false, init: [`(${SEED.toString()})(${JSON.stringify([entries])})`] });
  const { page } = h;
  await t.waitState(page, (s) => s.startCard, 180000);
  const before = JSON.stringify(Object.keys(entries).sort().map((k) => [k, entries[k]]));
  const seed = await page.evaluate(() => {
    const d = window.__academy.game.progress.dataCopy();
    return { mode: d.mode, stamps: Object.keys(d.stamps).length, readOnly: window.__academy.game.progress.readOnly, quest: d.zoneData?.world?.['p7.quest']?.start ?? null };
  });
  t.require('the in-memory save: Entscheider, every station stamped, read-only', seed.mode === 'entscheider' && seed.stamps >= 18 && seed.readOnly === true && seed.quest?.probestart === true, JSON.stringify(seed));
  const q = await page.evaluate(() => {
    const s = window.__academy.quest();
    return { regionOpen: s.regionOpen, flight: s.flight?.state };
  });
  t.require('the Revier is open and the island grounded', q.regionOpen === true && q.flight === 'ground', JSON.stringify(q));

  await page.evaluate(() => window.__discover.start());
  for (const st of await page.evaluate(() => window.__discover.stops())) {
    await page.evaluate((id) => window.__discover.goto(id), st.id);
  }
  // the language both ways, reduced motion and sound on and off (menu)
  await page.evaluate(async () => {
    const click = (sel) => document.querySelector(sel)?.click();
    for (const l of ['en', 'de']) click(`.dsc-lang-btn[lang="${l}"]`);
    for (const id of ['reduced-motion', 'reduced-motion', 'sound', 'sound']) {
      click('.dsc-menu-btn');
      click(`.dsc-menu [data-id="${id}"]`);
    }
    await new Promise((r) => setTimeout(r, 400));
  });
  const mid = await page.evaluate(SNAP);
  const sess = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k !== 'dc-seeded'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await t.waitState(page, (s) => s.startCard, 180000);
  await page.waitForTimeout(500);
  const after = await page.evaluate(SNAP);
  t.require('localStorage unchanged after the tour, the language, the menu toggles and ?reset=1', mid === before, diff(before, mid));
  t.require('localStorage unchanged after a reload', after === before, diff(before, after));
  const extra = sess.filter((k) => !/^emai-academy-island\/v1:discover-(alive|mode)$/.test(k));
  t.require('sessionStorage: only Discover’s own keys', extra.length === 0, `${sess.join(', ')}`);
  t.check('page errors', h.errors.length, '<=', 0);
  await h.close();
}

function diff(a, b) {
  if (a === b) return '';
  const A = new Map(JSON.parse(a));
  const B = new Map(JSON.parse(b));
  const keys = [...new Set([...A.keys(), ...B.keys()])].filter((k) => A.get(k) !== B.get(k));
  return keys.join(', ').slice(0, 200);
}
