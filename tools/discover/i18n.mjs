// discover-check scenario `i18n` (WP-D0, plan §3.1, §4): Discover's texts in both languages.
//   static   every UI string of src/discover/strings.ts has DE and EN; the chip labels of
//            src/discover/ui/card.ts match src/ui/Kit.ts (CHIP_LABELS + the chips registered there);
//            every character is in the font subsets' kept ranges (glyph-check --static covers the source)
//   runtime  3D and stills, DE then EN through the top bar: no ⟦key⟧ marker, <html lang> follows, the
//            top bar and the start card change language, every shown character is in the kept ranges
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/measure.mjs';
import { inKeep } from '../lib/glyphs.mjs';

export const scenario = { name: 'i18n' };

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const labels = (src) => Object.fromEntries([...src.matchAll(/['"]?([\w-]+)['"]?\s*:\s*\{\s*de:\s*'([^']*)',\s*en:\s*'([^']*)'\s*\}/g)].map((m) => [m[1], [m[2], m[3]]]));
const DOM = () => ({ text: document.querySelector('.dsc')?.innerText ?? '', aria: [...document.querySelectorAll('.dsc [aria-label]')].map((e) => e.getAttribute('aria-label')).join(' '), lang: document.documentElement.lang, top: document.querySelector('.dsc-stept')?.textContent ?? '' });

export default async function run(t) {
  // ── static ──
  const { S } = await import(path.join(ROOT, 'src', 'discover', 'strings.ts'));
  const missing = Object.entries(S).filter(([, v]) => !(v && typeof v.de === 'string' && v.de && typeof v.en === 'string' && v.en)).map(([k]) => k);
  t.require('strings.ts: every UI string in DE and EN', missing.length === 0, missing.join(', '));
  const ours = labels(read('src/discover/ui/card.ts').split('export const CHIP_TEXT')[1].split('};')[0]);
  const kitSrc = read('src/ui/Kit.ts');
  const kit = { ...labels(kitSrc.split('export const CHIP_LABELS')[1].split('};')[0]) };
  for (const m of kitSrc.matchAll(/registerChip\('([\w-]+)',\s*\{\s*de:\s*'([^']*)',\s*en:\s*'([^']*)'\s*\}\)/g)) kit[m[1]] = [m[2], m[3]];
  const off = [...new Set([...Object.keys(kit), ...Object.keys(ours)])].filter((k) => JSON.stringify(kit[k]) !== JSON.stringify(ours[k]));
  t.require('chip labels match src/ui/Kit.ts', off.length === 0 && Object.keys(kit).length >= 10, off.join(', '));
  const all = Object.values(S).flatMap((v) => [v.de, v.en]).join('');
  const outside = [...new Set([...all].filter((c) => !inKeep(c.codePointAt(0)) && !/\s/.test(c)))];
  t.require('strings.ts: every character in the kept font ranges', outside.length === 0, outside.join(' '));

  // ── runtime ──
  for (const [label, query] of [
    ['3D', '?discover=1&stills=0&lang=de'],
    ['stills', '?discover=1&stills=1&lang=de'],
  ]) {
    const h = await t.open(query, { throttle: false });
    await t.waitState(h.page, (s) => s.startCard, 180000);
    const de = await h.page.evaluate(DOM);
    await h.page.evaluate(() => document.querySelector('.dsc-lang-btn[lang="en"]').click());
    await h.page.waitForTimeout(300);
    const en = await h.page.evaluate(DOM);
    const markers = (de.text + de.aria + en.text + en.aria).match(/⟦[^⟧]*⟧/g) ?? [];
    t.require(`${label}: no missing-key markers`, markers.length === 0, markers.slice(0, 3).join(' '));
    t.require(`${label}: DE → EN in place (<html lang>, top bar, start card)`, de.lang === 'de' && en.lang === 'en' && de.top !== en.top && de.text !== en.text, `${de.top} → ${en.top}`);
    const chars = [...new Set([...(de.text + de.aria + en.text + en.aria)].filter((c) => !/\s/.test(c) && !inKeep(c.codePointAt(0))))];
    t.require(`${label}: every shown character in the kept font ranges`, chars.length === 0, chars.join(' '));
    t.check(`${label}: page errors`, h.errors.length, '<=', 0);
    await h.close();
  }
}
