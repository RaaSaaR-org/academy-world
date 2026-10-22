#!/usr/bin/env node
// Subset the brand fonts to the characters the game can show (plan item B2).
//
//   node tools/subset-fonts.mjs [--python <venv>/bin/python] [--check]
//
// Sources: the full fonts in src/ui/fonts/full/ (as converted from the EmAI brand kit's fonts,
// OFL 1.1, see LICENSES/OFL-1.1.txt). Output: src/ui/fonts/<same name>.<same format>, so hud.css,
// Text3D.ts and the index.html preloads need no change. Kept in every font (where the font has a
// glyph): tools/lib/glyphs.mjs KEEP_RANGES (Basic Latin, Latin-1, Latin Extended-A, typographic
// punctuation, super- and subscripts, €, arrows, − ≈ ≠ ≤ ≥) plus every character in the source
// strings (tools/lib/glyphs.mjs sourceChars). Kept OpenType features: FEATURES below (what browsers
// and troika apply by default, plus tabular / lining figures and the case forms the CSS can ask
// for); the stylistic sets (ss01…, salt, aalt, dlig, onum, zero) go, since nothing turns them on.
// The name table and the TrueType hinting stay. A run is deterministic: the same sources and
// strings give the same files.
// src/ui/fonts/subset.json records what was kept. --check exits 1 when the committed subsets are
// out of date (a new string uses a character a font has but its subset lacks; glyph-check says so too).
//
// Needs fontTools with brotli (WOFF2) and zopfli (smaller WOFF) — a dev tool, not a project
// dependency: python3 -m venv <dir> && <dir>/bin/pip install fonttools brotli zopfli, then pass
// --python <dir>/bin/python or set FONTTOOLS_PYTHON.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, parseArgs } from './lib/shotlib.mjs';
import { KEEP_RANGES, sourceChars, hex } from './lib/glyphs.mjs';
import { readFont } from './lib/fontcmap.mjs';

const args = parseArgs(process.argv.slice(2));
const FONTS = path.join(ROOT, 'src', 'ui', 'fonts');
const FULL = path.join(FONTS, 'full');
const python = String(args.python ?? process.env.FONTTOOLS_PYTHON ?? 'python3');
// browser / troika defaults (pyftsubset's default list without the vertical ones) + figures and case
const FEATURES = ['calt', 'ccmp', 'clig', 'curs', 'dnom', 'frac', 'kern', 'liga', 'locl', 'mark', 'mkmk', 'numr', 'rlig', 'rvrn', 'subs', 'sups', 'tnum', 'pnum', 'lnum', 'case', 'ordn', 'sinf'];

const sources = fs.readdirSync(FULL).filter((f) => /\.(woff2?|ttf|otf)$/.test(f)).sort();
if (!sources.length) throw new Error(`no fonts in ${FULL}`);

// the characters to keep
const used = sourceChars();
const wanted = new Set();
for (const [a, b] of KEEP_RANGES) for (let cp = a; cp <= b; cp++) wanted.add(cp);
for (const ch of used.keys()) wanted.add(ch.codePointAt(0));
const unicodes = [...wanted].sort((a, b) => a - b);

if (args.check) {
  // every wanted character a full font has must be in its subset
  let stale = 0;
  for (const f of sources) {
    const full = readFont(fs.readFileSync(path.join(FULL, f))).cmap;
    const sub = fs.existsSync(path.join(FONTS, f)) ? readFont(fs.readFileSync(path.join(FONTS, f))).cmap : new Set();
    const lost = unicodes.filter((cp) => full.has(cp) && !sub.has(cp));
    if (lost.length) {
      stale++;
      console.log(`${f}: subset lacks ${lost.map((cp) => `${String.fromCodePoint(cp)} ${hex(cp)}`).join(', ')} — run node tools/subset-fonts.mjs`);
    }
  }
  console.log(stale ? `${stale} font(s) out of date` : `all ${sources.length} subsets up to date`);
  process.exit(stale ? 1 : 0);
}

try {
  execFileSync(python, ['-I', '-c', 'import fontTools.subset, brotli, zopfli'], { stdio: 'pipe' });
} catch {
  console.error(`${python} has no fontTools with brotli and zopfli. Install them into a venv outside the project:\n  python3 -m venv /tmp/fonttools && /tmp/fonttools/bin/pip install fonttools brotli zopfli\n  node tools/subset-fonts.mjs --python /tmp/fonttools/bin/python`);
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emai-subset-'));
const listFile = path.join(tmp, 'unicodes.txt');
fs.writeFileSync(listFile, unicodes.map((cp) => cp.toString(16)).join('\n') + '\n');
const record = { tool: 'tools/subset-fonts.mjs', note: 'generated: do not edit; rerun the tool after a new character appears in the strings', features: FEATURES, keepRanges: KEEP_RANGES.map(([a, b]) => `${hex(a)}-${hex(b)}`), extra: [...used.keys()].filter((ch) => !KEEP_RANGES.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b)).sort().join(''), fonts: {} };
let before = 0;
let after = 0;
try {
  for (const f of sources) {
    const src = path.join(FULL, f);
    const flavor = f.endsWith('.woff2') ? 'woff2' : f.endsWith('.woff') ? 'woff' : null;
    const out = path.join(tmp, f);
    const opts = [
      src,
      `--unicodes-file=${listFile}`,
      `--output-file=${out}`,
      `--layout-features=${FEATURES.join(',')}`,
      '--name-IDs=*',
      '--name-languages=*',
      '--name-legacy',
      '--notdef-outline',
      // keep head's bounding box and the OS/2 ranges as they are: a recalculated bbox moves the
      // text baseline by a pixel in Chrome on macOS (seen in the A/B screenshots)
      '--no-recalc-bounds',
      '--recalc-timestamp=false',
      '--no-prune-unicode-ranges',
      '--no-prune-codepage-ranges',
      '--drop-tables+=DSIG',
    ];
    if (flavor) opts.push(`--flavor=${flavor}`);
    if (flavor === 'woff') opts.push('--with-zopfli');
    execFileSync(python, ['-I', '-m', 'fontTools.subset', ...opts], { stdio: 'pipe', env: { ...process.env, SOURCE_DATE_EPOCH: '0' } });
    const a = fs.statSync(src).size;
    const b = fs.statSync(out).size;
    before += a;
    after += b;
    const full = readFont(fs.readFileSync(src));
    const sub = readFont(fs.readFileSync(out));
    const lost = unicodes.filter((cp) => full.cmap.has(cp) && !sub.cmap.has(cp));
    if (lost.length) throw new Error(`${f}: the subset lost ${lost.map(hex).join(' ')}`);
    fs.copyFileSync(out, path.join(FONTS, f));
    record.fonts[f] = { sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 16), fullBytes: a, subsetBytes: b, codepoints: sub.cmap.size, ofFull: full.cmap.size };
    console.log(`${f.padEnd(28)} ${(a / 1024).toFixed(1).padStart(6)} KB → ${(b / 1024).toFixed(1).padStart(6)} KB  (${sub.cmap.size} of ${full.cmap.size} characters)`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
record.totalBytes = { full: before, subset: after };
fs.writeFileSync(path.join(FONTS, 'subset.json'), JSON.stringify(record, null, 1) + '\n');
console.log(`total ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB (${((1 - after / before) * 100).toFixed(0)} % smaller); kept ${unicodes.length} code points where present`);
