// discover-check scenario `stills-tour` (WP-D1, founder decision 3): the picture tour for weak phones
// (?stills=1), at 390×844.
//   stops      the same 12 stops and cards as the 3D tour: „Los“, › (tap), a sideways swipe on the picture,
//              → (key), then every stop by goto; each: the top bar „i / 12“, the stop's card, its picture
//              loaded (the webp of public/discover/stills, not the placeholder)
//   pictures   both widths of every stop exist in the build, each ≤ 120 KB
//   hotspots   „Hier zu sehen“ opens a spot card, „Zurück“ returns
//   language   DE → EN changes the card in place
//   rules      no game, Rapier, world chunk, wasm or GLB requested; ≤ 400 KB (brotli) before the first
//              picture; 0 third-party requests; 0 page errors
//   screens    artifacts/discover/<device>/stills-tour-<n>-<stop>.png (3 pages)
import fs from 'node:fs';
import path from 'node:path';
import { tapEl } from './boot.mjs';

export const scenario = { name: 'stills-tour' };

const PORTRAIT = { width: 390, height: 844 };
const FORBIDDEN = /\/assets\/(Game|world|rapier[\w.]*|vendor-three)-[\w-]+\.js$|\.wasm$|\.glb$/;
const SHOTS = new Set([1, 6, 10]);

const at = (id) => {
  const s = window.__discover.state();
  const img = document.querySelector('.dsc-stage img:not(.off)');
  return s.stop === id && s.card === `stop:${id}` && s.image === true && !!img && img.complete && img.naturalWidth > 0 && img.dataset.stop === id;
};

export default async function run(t) {
  // the pictures in the build
  const dir = path.join(t.dist, 'discover', 'stills');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.webp')) : [];
  const big = files.filter((f) => fs.statSync(path.join(dir, f)).size > 120 * 1024);
  t.require('24 pictures in the build (12 stops × 720 / 1280)', files.length === 24, `${files.length} files`);
  t.require('every picture ≤ 120 KB', big.length === 0, big.join(', '));

  const from = Date.now();
  const dev = { ...t.dev, context: { ...t.dev.context, viewport: PORTRAIT } };
  const h = await t.open('?discover=1&stills=1&lang=de', { dev });
  const { page } = h;
  await t.waitState(page, (s) => s.path === 'stills' && s.startCard, 90000);
  const stops = await page.evaluate(() => window.__discover.stops());
  t.require('the stills tour has the 12 stops', stops.length === 12, stops.map((s) => s.id).join(', '));
  await tapEl(t, page, '.dsc-start [data-action="go"]');
  const step = async (i, how) => {
    const ok = await page.waitForFunction(at, stops[i].id, { timeout: 30000, polling: 100 }).then(() => true, () => false);
    const top = await page.evaluate(() => document.querySelector('.dsc-stepn')?.textContent ?? '');
    const s = await t.state(page);
    t.require(`${how} reaches stop ${i + 1} (${stops[i].id}) with its card and picture`, ok && top === `${i + 1} / 12`, `${s.stop} · ${s.card} · image ${s.image} · ${top}`);
    if (SHOTS.has(i + 1)) {
      await page.waitForTimeout(700);
      await t.shot(page, `${i + 1}-${stops[i].id}`);
    }
    return ok;
  };
  await step(0, '„Los“');
  // the bytes before the first picture
  const firstImg = t.serverLog.find((e) => e.t >= from && /\.webp$/.test(e.path) && e.status === 200);
  const before = t.serverLog.filter((e) => e.t >= from && e.status === 200 && !/\.webp$/.test(e.path) && (!firstImg || e.t <= firstImg.t)).reduce((a, e) => a + e.br, 0) / 1024;
  t.check('transferred before the first picture (brotli)', before, '<=', 400, ' KB');
  t.require('the first picture comes from /academy-world/discover/stills/', !!firstImg && firstImg.path.startsWith(`${t.prefix}discover/stills/`), firstImg?.path ?? 'none');

  // › (tap), a swipe on the picture, → (key)
  await tapEl(t, page, '.dsc-sheet .dsc-nav.next');
  await step(1, '›');
  await page.evaluate(() => {
    const st = document.querySelector('.dsc-stage');
    const ev = (type, x) => st.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 300, bubbles: true }));
    ev('pointerdown', 320);
    ev('pointermove', 200);
    ev('pointerup', 80);
  });
  await step(2, 'a swipe on the picture');
  await page.keyboard.press('ArrowRight');
  await step(3, '→');
  for (let i = 4; i < stops.length; i++) {
    await page.evaluate((id) => window.__discover.goto(id), stops[i].id);
    await step(i, 'goto');
  }

  // „Hier zu sehen“ at the Ausguck: a spot card, then „Zurück“
  await page.evaluate((id) => window.__discover.goto(id), 'ausguck');
  await page.waitForFunction(at, 'ausguck', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => window.__discover.handle.sheet.setSnap('half'));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.dsc-sheet .dsc-chipbtn')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await tapEl(t, page, '.dsc-sheet .dsc-chipbtn');
  await page.waitForTimeout(250);
  const spot = await page.evaluate(() => document.querySelector('.dsc-sheet').dataset.card);
  await page.evaluate(() => document.querySelector('.dsc-sheet [data-action="back"]')?.click());
  await page.waitForTimeout(150);
  const back = await page.evaluate(() => document.querySelector('.dsc-sheet').dataset.card);
  t.require('„Hier zu sehen“ opens a spot card, „Zurück“ the stop card', /^spot:/.test(spot) && back === 'stop:ausguck', `${spot} → ${back}`);

  // DE → EN in place
  const de = await page.evaluate(() => document.querySelector('.dsc-sheet .dsc-title').textContent);
  await page.evaluate(() => document.querySelector('.dsc-lang-btn[lang="en"]').click());
  await page.waitForTimeout(300);
  const en = await page.evaluate(() => ({ title: document.querySelector('.dsc-sheet .dsc-title').textContent, top: document.querySelector('.dsc-stept').textContent }));
  t.require('DE → EN: the card and the top bar change language', de === 'Ausguck' && en.title === 'Lookout' && en.top === 'Lookout', `${de} → ${JSON.stringify(en)}`);

  const bad = h.requests.map((r) => r.url).filter((u) => FORBIDDEN.test(new URL(u).pathname));
  t.require('no game, Rapier, three, world chunk, wasm or GLB requested', bad.length === 0, bad.slice(0, 3).join(', '));
  t.check('third-party requests', t.thirdParty(h.requests).length, '<=', 0);
  t.check('requests outside /academy-world/', t.outside(h.requests).length, '<=', 0);
  t.check('page and console errors', h.errors.length, '<=', 0);
  if (h.errors.length) t.log(h.errors.slice(0, 4));
  await h.close();
}
