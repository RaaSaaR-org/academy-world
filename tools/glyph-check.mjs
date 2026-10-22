#!/usr/bin/env node
// Is every character the game shows in the font that renders it? (plan items B2 and C1; promoted
// from the phase 6 perf-load audit's glyph-cover.py + text3d-glyphs.mjs, without Python).
//
//   node tools/glyph-check.mjs [--static] [--dev | --dist <dir> | --base <url>]
//
// Static part (no browser): every character of every string the code can show (tools/lib/glyphs.mjs)
// against the shipped fonts in src/ui/fonts/ and the full originals in src/ui/fonts/full/:
//   - lost by subsetting: the full font has it, the subset does not → error (rerun tools/subset-fonts.mjs)
//   - not in any brand font: the browser falls back to a system font (DOM) and troika to the
//     self-hosted resolver (3D text, C1). These must be listed in FALLBACK_OK below, so a new
//     symbol is a conscious choice → error otherwise
//   - in some faces only: listed for information (the CSS stacks fall back between the families)
// Runtime part (default; skip with --static): boots the game in DE/EN × Entdecker/Entscheider, reads
// every troika 3D text and its font, and lists the characters its own font lacks — the glyphs that
// need the self-hosted fallback (public/fonts/unicode-resolver/, C1). Each one's code-point block
// file must be there.
// Phase 7 glyphs (plan §5.10: π κ ≈ ✓ ± →, for the new stations whether or not their strings exist
// yet): each must be in every brand font or in FALLBACK_OK (an error otherwise). Printed per glyph: a
// glyph the full fonts have but the subsets lost (re-run tools/subset-fonts.mjs once a string uses it:
// the static check above then fails) and a fallback glyph whose resolver block is not self-hosted yet
// (needed once a 3D text uses it: the runtime check below then fails). Exit 1 on an error.
import fs from 'node:fs';
import path from 'node:path';
import { Verdict, gameServer, launchChromium, loadAllAreas, parseArgs, saveJson, ROOT } from './lib/measure.mjs';
import { readFont } from './lib/fontcmap.mjs';
import { sourceChars, hex } from './lib/glyphs.mjs';

const args = parseArgs(process.argv.slice(2));
const FONTS = path.join(ROOT, 'src', 'ui', 'fonts');
const FULL = path.join(FONTS, 'full');
const RESOLVER = path.join(ROOT, 'public', 'fonts', 'unicode-resolver');

/**
 * Characters the brand fonts do not have, accepted on purpose: Greek symbols of the physics, maths
 * signs, stars, ticks and crosses, small shapes. In the DOM they come from a system font; in 3D text
 * from the self-hosted resolver (C1).
 */
// wave 2 (integrator): ᵢ (the Lastdiagramm's Σ mᵢ · xᵢ, WP8), ■ (the Lern-Dojo's pose legend, a canvas),
// ▮ ▯ ✔ ✖ (the Unkrautacker's toy bars and tallies, WP14), ◠ (the Dunkelfabrik's „real“ arc legend, WP8):
// DOM and canvas text only, so the system fallback draws them
const FALLBACK_OK = 'ΣΔθκλμσςτωπ⁻⇕∝∅√∞ⓘ▸▾◆★☆✓✕✗⟦⟧␣│▲▶◀○●ᵢ■▮▯◠✔✖';
/** The new glyphs of the Phase 7 content (§5.10). */
const PHASE7_GLYPHS = 'πκ≈✓±→';
const blockFile = (cp) => {
  const a = cp - (cp % 256);
  return `plane${cp >> 16}/${(a & 0xffff).toString(16)}-${((a & 0xffff) + 255).toString(16)}.json`;
};

const v = new Verdict('glyph-check');
const out = {};
const fontFiles = fs.readdirSync(FONTS).filter((f) => /\.(woff2?|ttf|otf)$/.test(f)).sort();
const faces = Object.fromEntries(fontFiles.map((f) => [f, readFont(fs.readFileSync(path.join(FONTS, f))).cmap]));
const fullFaces = fs.existsSync(FULL) ? Object.fromEntries(fontFiles.filter((f) => fs.existsSync(path.join(FULL, f))).map((f) => [f, readFont(fs.readFileSync(path.join(FULL, f))).cmap])) : {};

// ── static ──
const chars = sourceChars();
const lost = [];
const noFont = [];
const partial = [];
for (const [ch, files] of [...chars.entries()].sort()) {
  const cp = ch.codePointAt(0);
  const missing = fontFiles.filter((f) => !faces[f].has(cp));
  if (!missing.length) continue;
  const lostIn = missing.filter((f) => fullFaces[f]?.has(cp));
  if (lostIn.length) lost.push({ ch, cp: hex(cp), fonts: lostIn, files: [...files].slice(0, 3) });
  else if (missing.length === fontFiles.length) noFont.push({ ch, cp: hex(cp), ok: FALLBACK_OK.includes(ch), files: [...files].slice(0, 3) });
  else partial.push({ ch, cp: hex(cp), missingIn: missing.map((f) => f.replace(/\.woff2?$/, '')), files: [...files].slice(0, 2) });
}
console.log(`${chars.size} distinct characters in the source strings; ${fontFiles.length} fonts (${Object.keys(fullFaces).length} with full originals)`);
for (const l of lost) console.log(`LOST BY SUBSETTING  ${l.ch} ${l.cp} in ${l.fonts.join(', ')} (used in ${l.files.join(', ')})`);
const unexpected = noFont.filter((n) => !n.ok);
for (const n of unexpected) console.log(`NO BRAND FONT HAS  ${n.ch} ${n.cp} (used in ${n.files.join(', ')}): add it to FALLBACK_OK if a fallback font is acceptable`);
console.log(`fallback (no brand font, accepted): ${noFont.filter((n) => n.ok).map((n) => n.ch).join(' ') || '-'}`);
console.log(`in some faces only: ${partial.map((p) => `${p.ch} (not ${p.missingIn.map((m) => m.replace(/-(Regular|Medium|SemiBold|Bold)$/, '')).filter((x, i, a) => a.indexOf(x) === i).join('/')})`).join(' ') || '-'}`);
out.static = { chars: chars.size, lost, noFont, partial };
v.check('characters lost by subsetting', lost.length, '<=', 0);
v.check('characters without a brand font and not in FALLBACK_OK', unexpected.length, '<=', 0);
// ── the Phase 7 glyphs ──
const p7 = [...PHASE7_GLYPHS].map((ch) => {
  const cp = ch.codePointAt(0);
  const inFonts = fontFiles.filter((f) => faces[f].has(cp));
  const lostIn = fontFiles.filter((f) => !faces[f].has(cp) && fullFaces[f]?.has(cp));
  const block = blockFile(cp);
  const blockOk = fs.existsSync(path.join(RESOLVER, 'codepoint-index', block));
  const ok = inFonts.length === fontFiles.length || FALLBACK_OK.includes(ch);
  return { ch, cp: hex(cp), inFonts: inFonts.length, fonts: fontFiles.length, lostIn, fallback: FALLBACK_OK.includes(ch), block, blockOk, ok };
});
console.log(`Phase 7 glyphs: ${p7.map((g) => `${g.ch} ${g.inFonts === g.fonts ? 'in every brand font' : g.fallback ? `fallback (${g.inFonts}/${g.fonts} fonts; resolver block ${g.blockOk ? 'present' : 'MISSING'})` : `${g.inFonts}/${g.fonts} fonts, NOT in FALLBACK_OK`}${g.lostIn.length ? ` — LOST BY SUBSETTING in ${g.lostIn.join(', ')}` : ''}`).join(' · ')}`);
out.phase7 = p7;
v.check('Phase 7 glyphs (π κ ≈ ✓ ± →) in no brand font and not in FALLBACK_OK', p7.filter((g) => !g.ok).length, '<=', 0);
for (const g of p7) {
  if (g.lostIn.length) v.note(`${g.ch} ${g.cp}: the full fonts have it, the subsets do not; re-run tools/subset-fonts.mjs once a string uses it`);
  if (g.inFonts < g.fonts && !g.blockOk) v.note(`${g.ch} ${g.cp}: resolver block codepoint-index/${g.block} (+ font-meta, font file) is not self-hosted yet; needed before a 3D text uses it`);
}

// ── runtime: troika 3D texts ──
if (!args.static) {
  const srv = await gameServer(args, { prefer: 'dev' });
  const browser = await launchChromium();
  const texts = new Map(); // key font|text
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    for (const lang of ['de', 'en'])
      for (const mode of ['entdecker', 'entscheider']) {
        await page.goto(`${srv.url}/?reset=1&skipIntro=1&lang=${lang}&mode=${mode}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForFunction(() => window.__academy && window.__academy.ready, null, { timeout: 180000, polling: 200 });
        // every area (sites too): `ready` is only the eager set (plan §5.6)
        await loadAllAreas(page);
        await page.waitForFunction(() => (window.__academy.zones() || []).every((z) => !['pending', 'loading', 'loaded'].includes(z.status)), null, { timeout: 120000, polling: 250 }).catch(() => {});
        await page.waitForTimeout(1500);
        const items = await page.evaluate(() => {
          const res = [];
          window.__academy.game.rs.scene.traverse((o) => {
            if (o.isMesh && typeof o.text === 'string' && typeof o.sync === 'function') res.push([String(o.font || ''), o.text]);
          });
          return res;
        });
        for (const [font, text] of items) texts.set(`${font}|${text}`, { font, text });
        console.log(`${lang}/${mode}: ${items.length} 3D texts`);
      }
  } finally {
    await browser.close().catch(() => {});
    await srv.close();
  }
  const fileOf = (url) => {
    const base = decodeURIComponent(url.split('?')[0].split('/').pop() || '');
    if (faces[base]) return base;
    const m = base.match(/^(.*)-[\w-]{6,12}(\.woff2?)$/); // Vite's content hash
    return m && faces[m[1] + m[2]] ? m[1] + m[2] : null;
  };
  const need = new Map(); // ch → { fonts, texts }
  let unknownFont = 0;
  for (const { font, text } of texts.values()) {
    const f = font ? fileOf(font) : null;
    if (!f) {
      unknownFont++;
      continue;
    }
    for (const ch of new Set(text)) {
      const cp = ch.codePointAt(0);
      if (/\s/.test(ch) || faces[f].has(cp)) continue;
      if (!need.has(ch)) need.set(ch, { fonts: new Set(), texts: new Set() });
      need.get(ch).fonts.add(f);
      need.get(ch).texts.add(text.slice(0, 40));
    }
  }
  const blockOf = (cp) => {
    const a = cp - (cp % 256);
    return `plane${cp >> 16}/${(a & 0xffff).toString(16)}-${((a & 0xffff) + 255).toString(16)}.json`;
  };
  const rows = [...need.entries()].map(([ch, n]) => ({ ch, cp: hex(ch.codePointAt(0)), block: blockOf(ch.codePointAt(0)), fonts: [...n.fonts], texts: [...n.texts].slice(0, 3) }));
  console.log(`\n3D-text glyphs that need the self-hosted fallback (C1): ${rows.length ? '' : 'none'}`);
  for (const r of rows) console.log(`  ${r.ch} ${r.cp} → codepoint-index/${r.block} · font ${r.fonts.join(', ')} · e.g. ${JSON.stringify(r.texts)}`);
  const missingBlocks = [...new Set(rows.map((r) => r.block))].filter((b) => !fs.existsSync(path.join(RESOLVER, 'codepoint-index', b)));
  if (rows.length) console.log(`resolver blocks needed: ${[...new Set(rows.map((r) => r.block))].join(', ')}${missingBlocks.length ? ` — MISSING in public/fonts/unicode-resolver: ${missingBlocks.join(', ')}` : ' (all present)'}`);
  out.runtime = { texts: texts.size, unknownFont, need: rows, missingBlocks };
  v.check('3D texts read (DE/EN × both modes)', texts.size, '>=', 1);
  v.check('3D-text fallback glyphs whose resolver block is not self-hosted', missingBlocks.length, '<=', 0);
  const notAccepted = rows.filter((r) => !FALLBACK_OK.includes(r.ch));
  v.check('3D-text glyphs missing from their font and not in FALLBACK_OK', notAccepted.length, '<=', 0);
}
saveJson('glyph-check.json', out);
v.exit(args);
