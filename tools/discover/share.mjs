// discover-check scenario `share` (WP-D3, plan §4 „Share“): „Am Laptop spielen“ from the menu, by touch.
//   static   the share texts are the game's own: film/strings.ts F.subtitle = core.start.subtitle,
//            F.film = core.start.replay, strings.ts S.laptopNote = core.start.touch (DE and EN)
//   3D       navigator.share gets { title, text, url } with url = the site's root under /academy-world/,
//            never ?discover; a cancel (AbortError) does nothing more; a refusal (NotAllowedError) falls
//            back to the clipboard („Link kopiert“) and the card with the link; without share and clipboard
//            the card's read-only field holds the whole link (wrapped), „Kopieren“ selects it all, the field
//            survives a language switch, „Zurück“ is not offered there
//   end card the film's „Am Laptop spielen“ shares too, its fallback card offers „Zurück“ to the end card
//            (only checked when the film scenario's handle is there: modes.has('film'))
//   stills   the stills path shares the same link through StillsHandle.share
// Screenshot (artifacts/discover/<device>/share-field.png, 390×844): the field fallback over the 3D view.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/measure.mjs';
import { tapEl } from './boot.mjs';

export const scenario = { name: 'share' };

/** navigator.share / clipboard stand-ins, steered by window.__shareMode ('ok' | 'abort' | 'deny' | 'none') and __clipMode ('ok' | 'deny' | 'none') */
const STUBS = `(() => {
  window.__shared = []; window.__clip = null; window.__shareMode = 'ok'; window.__clipMode = 'ok';
  const share = async (d) => { window.__shared.push(JSON.parse(JSON.stringify(d))); if (window.__shareMode === 'abort') throw new DOMException('cancelled', 'AbortError'); if (window.__shareMode === 'deny') throw new DOMException('denied', 'NotAllowedError'); };
  const clip = { writeText: async (s) => { if (window.__clipMode === 'deny') throw new DOMException('denied', 'NotAllowedError'); window.__clip = s; } };
  Object.defineProperty(Navigator.prototype, 'share', { configurable: true, get: () => (window.__shareMode === 'none' ? undefined : share) });
  Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => (window.__clipMode === 'none' ? undefined : clip) });
  document.execCommand = () => false;
})();`;
const PHONE = { width: 390, height: 844 };

/** the `{ de, en }` object literal named `key` in a TS source (single-quoted strings) */
function pair(src, key) {
  const m = src.match(new RegExp(`\\b${key}:\\s*\\{\\s*de:\\s*'([^']*)',\\s*en:\\s*'([^']*)'`));
  return m ? [m[1], m[2]] : null;
}
/** core.ts: the value of start.<key> in both languages (the DE table comes first) */
function core(src, key) {
  const de = src.split(/\n {2}en: \{/)[0];
  const en = src.split(/\n {2}en: \{/)[1] ?? '';
  const one = (s) => {
    const start = s.slice(s.indexOf('\n    start: {'));
    const m = start.match(new RegExp(`\\n {6}${key}:\\s*\\n?\\s*'([^']*)'`));
    return m ? m[1] : null;
  };
  return [one(de), one(en)];
}

async function menuShare(t, page) {
  await tapEl(t, page, '.dsc-menu-btn');
  await page.waitForSelector('.dsc-menu-item[data-id="laptop"]', { state: 'visible', timeout: 5000 });
  await tapEl(t, page, '.dsc-menu-item[data-id="laptop"]');
  await page.waitForTimeout(400);
}

const look = (page) =>
  page.evaluate(() => {
    const s = window.__discover.state();
    const input = document.querySelector('.dsc-sheet .dsc-url textarea');
    return {
      shared: window.__shared.slice(),
      clip: window.__clip,
      card: s.snap === 'hidden' ? null : s.card,
      field: input ? { value: input.value, readOnly: input.readOnly, sel: [input.selectionStart, input.selectionEnd], whole: input.scrollHeight <= input.clientHeight + 2 && input.scrollWidth <= input.clientWidth + 2 } : null,
      toast: document.querySelector('.dsc-toast.on')?.textContent ?? null,
      actions: [...document.querySelectorAll('.dsc-sheet .dsc-actions [data-action]')].map((b) => b.dataset.action),
    };
  });

export default async function run(t) {
  // ── static: the copies ──
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const coreSrc = read('src/i18n/core.ts');
  const filmSrc = read('src/discover/film/strings.ts');
  const dscSrc = read('src/discover/strings.ts');
  const sub = filmSrc.match(/subtitle:\s*\{\s*de:\s*'([^']*)',\s*en:\s*'([^']*)'/s);
  const copies = [
    ['F.subtitle = core.start.subtitle', sub ? [sub[1], sub[2]] : null, core(coreSrc, 'subtitle')],
    ['F.film = core.start.replay', pair(filmSrc, 'film'), core(coreSrc, 'replay')],
    ['S.laptopNote = core.start.touch', (() => { const m = dscSrc.match(/laptopNote:\s*\{\s*de:\s*'([^']*)',\s*en:\s*'([^']*)'/s); return m ? [m[1], m[2]] : null; })(), core(coreSrc, 'touch')],
  ];
  for (const [name, ours, theirs] of copies) t.require(`copy ${name}`, !!ours && !!theirs[0] && JSON.stringify(ours) === JSON.stringify(theirs), `${JSON.stringify(ours)} ≠ ${JSON.stringify(theirs)}`);

  const want = t.url; // http://127.0.0.1:<port>/academy-world/
  const dev = { ...t.dev, context: { ...t.dev.context, viewport: PHONE } };

  // ── 3D ──
  {
    const h = await t.open('?discover=1&stills=0&lang=de', { dev, init: [STUBS], throttle: false, waitUntil: 'commit' });
    const { page } = h;
    await t.waitState(page, (s) => s.startCard, 180000);
    await page.evaluate(() => window.__discover.start());
    await t.waitState(page, (s) => s.mode === 'tour' && s.stop != null && !s.flying && s.snap === 'peek', 180000);
    t.require('3D: handle.share is registered', await page.evaluate(() => typeof window.__discover.handle.share === 'function'));

    // the Web Share API
    await menuShare(t, page);
    let s = await look(page);
    const d = s.shared[0] ?? {};
    t.require('3D: navigator.share gets the game’s link (sub-path, no ?discover)', d.url === want && !/discover/.test(d.url ?? ''), `${d.url} (want ${want})`);
    t.require('3D: …with the title and the game’s own text', /Schwebewerk/.test(d.title ?? '') && /Maus und Tastatur/.test(d.text ?? '') && /Insel, die fliegen soll/.test(d.text ?? ''), JSON.stringify({ title: d.title, text: (d.text ?? '').slice(0, 60) }));
    t.require('3D: shared: no fallback card', s.card !== 'share', String(s.card));

    // cancelled
    await page.evaluate(() => (window.__shareMode = 'abort'));
    await menuShare(t, page);
    s = await look(page);
    t.require('3D: a cancel (AbortError) shows nothing more', s.shared.length === 2 && s.card !== 'share' && s.clip == null, JSON.stringify({ n: s.shared.length, card: s.card, clip: s.clip }));

    // refused → the clipboard
    await page.evaluate(() => (window.__shareMode = 'deny'));
    await menuShare(t, page);
    s = await look(page);
    t.require('3D: refused → the clipboard holds the link', s.clip === want, String(s.clip));
    t.require('3D: …„Link kopiert“ and the card with the link', s.card === 'share' && /Link kopiert/.test(s.toast ?? '') && s.field?.value === want, JSON.stringify({ card: s.card, toast: s.toast, field: s.field?.value }));

    // neither share nor clipboard → the field
    await page.evaluate(() => {
      window.__shareMode = 'none';
      window.__clipMode = 'none';
      window.__clip = null;
      window.__discover.handle.sheet.hide();
    });
    await page.waitForTimeout(800);
    await menuShare(t, page);
    s = await look(page);
    t.require('3D: no share, no clipboard → a read-only field with the link', s.card === 'share' && s.field?.readOnly === true && s.field?.value === want && s.clip == null, JSON.stringify(s.field));
    t.require('3D: …and „Kopieren“ (no „Zurück“ from the menu)', JSON.stringify(s.actions) === JSON.stringify(['copy']), JSON.stringify(s.actions));
    t.require('3D: the whole link is readable in the field (wrapped, not cut off)', s.field?.whole === true, JSON.stringify(s.field));
    await tapEl(t, page, '.dsc-sheet [data-action="copy"]');
    await page.waitForTimeout(300);
    s = await look(page);
    t.require('3D: „Kopieren“ without a clipboard selects the whole link', s.field && s.field.sel[0] === 0 && s.field.sel[1] === want.length, JSON.stringify(s.field?.sel));
    // the language changes in place: the field stays
    await tapEl(t, page, '.dsc-lang-btn[lang="en"]');
    await page.waitForTimeout(300);
    s = await look(page);
    const title = await page.evaluate(() => document.querySelector('.dsc-sheet .dsc-title')?.textContent);
    t.require('3D: DE → EN keeps the field on the card', s.field?.value === want && title === 'Play on a laptop', `${title} · ${s.field?.value}`);
    await tapEl(t, page, '.dsc-lang-btn[lang="de"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.waitForFunction(() => !document.querySelector('.dsc-toast.on'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await t.shot(page, 'field');

    // the end card's „Am Laptop spielen“ offers „Zurück“ (the film's mode, skipped at once)
    if (await page.evaluate(() => window.__discover.handle.modes.has('film'))) {
      const entered = page.evaluate(() => window.__discover.handle.modes.enter('film', { stills: true }).then(() => true));
      await page.waitForFunction(() => document.querySelector('.dsc-film-skip:not([hidden])'), null, { timeout: 120000 });
      await tapEl(t, page, '.dsc-film-skip');
      await entered;
      await page.waitForTimeout(700); // the sheet slides up
      await tapEl(t, page, '.dsc-sheet [data-action="laptop"]');
      await page.waitForTimeout(400);
      s = await look(page);
      t.require('end card: „Am Laptop spielen“ → the card with the link and „Zurück“', s.card === 'share' && s.field?.value === want && s.actions.includes('back'), JSON.stringify(s.actions));
      await tapEl(t, page, '.dsc-sheet [data-action="back"]');
      await page.waitForTimeout(300);
      t.require('end card: „Zurück“ shows the end card again', (await look(page)).card === 'film:end');
    } else t.pending('end card share: no film mode registered');
    t.check('3D: third-party requests', t.thirdParty(h.requests).length, '<=', 0);
    t.check('3D: page and console errors', h.errors.length, '<=', 0);
    if (h.errors.length) t.log(h.errors.slice(0, 4));
    await h.close();
  }

  // ── stills ──
  {
    const h = await t.open('?discover=1&stills=1&lang=de', { dev, init: [STUBS], throttle: false });
    const { page } = h;
    await t.waitState(page, (s) => s.startCard, 120000);
    t.require('stills: StillsHandle.share is registered', await page.evaluate(() => typeof window.__discover.handle.share === 'function'));
    await page.evaluate(() => window.__discover.start());
    await t.waitState(page, (s) => s.started && s.snap === 'peek', 60000);
    await menuShare(t, page);
    let s = await look(page);
    t.require('stills: navigator.share gets the same link', s.shared[0]?.url === want, String(s.shared[0]?.url));
    await page.evaluate(() => {
      window.__shareMode = 'none';
      window.__clipMode = 'deny';
    });
    await menuShare(t, page);
    s = await look(page);
    t.require('stills: the field fallback holds the link', s.card === 'share' && s.field?.value === want, JSON.stringify(s.field));
    const heavy = h.requests.filter((r) => /three|rapier|world-|\.glb(\?|$)/i.test(new URL(r.url).pathname));
    t.check('stills: no 3D chunk or model requested by sharing', heavy.length, '<=', 0);
    t.check('stills: page and console errors', h.errors.length, '<=', 0);
    if (h.errors.length) t.log(h.errors.slice(0, 4));
    await h.close();
  }
}
