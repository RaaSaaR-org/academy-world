#!/usr/bin/env node
// Discover's tour content (WP-D1, plan §3.1): copies every tour text and layout number from the game's
// own sources into src/discover/data/content.gen.ts, each text with its `from` (where it was copied from).
//
//   node tools/discover/content.mjs           write src/discover/data/content.gen.ts
//   node tools/discover/content.mjs --check   regenerate in memory, fail on any difference (drift)
//
// The sources are named in src/discover/tour/content.spec.ts: a module key (string tables, manifests,
// layout.ts) loaded through Vite's SSR loader (as tools/quest-derive.mjs does; no build, no port), or an
// inline { de: '…', en: '…' } literal / t('…', '…') call in a game file. Why a generated file: importing
// the zone files from the Discover chunk would split the desktop zone chunks (plan §3.1).
// Not a discover-check scenario (no `scenario` export): the runner never loads it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'discover', 'data', 'content.gen.ts');
const check = process.argv.includes('--check');

// the modules read localStorage / window at import time in places
class MemStorage {
  m = new Map();
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}
globalThis.window ??= globalThis;
globalThis.localStorage ??= new MemStorage();
globalThis.sessionStorage ??= new MemStorage();

const { createServer } = await import('vite');
const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@': path.join(ROOT, 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

const problems = [];
const fail = (msg) => problems.push(msg);
const mods = new Map();
const load = async (mod) => {
  if (!mods.has(mod)) mods.set(mod, await server.ssrLoadModule(mod));
  return mods.get(mod);
};
const at = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const rel = (mod) => mod.replace(/^\//, '');

/** a single-quoted / double-quoted JS string literal body → its value */
const unquote = (s) => s.replace(/\\(u\{[0-9a-f]+\}|u[0-9a-f]{4}|.)/gi, (m, e) => (e[0] === 'u' ? String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16)) : e === 'n' ? '\n' : e));
const STR = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const LITERALS = [new RegExp(String.raw`\{\s*de:\s*(?:${STR})\s*,\s*en:\s*(?:${STR})\s*,?\s*\}`, 'g'), new RegExp(String.raw`\bt\(\s*(?:${STR})\s*,\s*(?:${STR})\s*\)`, 'g')];

function fromFile(src) {
  const file = path.join(ROOT, src.file);
  if (!fs.existsSync(file)) return fail(`${src.file}: missing`), null;
  const text = fs.readFileSync(file, 'utf8');
  for (const re of LITERALS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const de = unquote(m[1] ?? m[2]);
      const en = unquote(m[3] ?? m[4]);
      if (de.includes(src.find)) {
        const line = text.slice(0, m.index).split('\n').length;
        return { de, en, from: `${src.file}:${line}` };
      }
    }
  }
  fail(`${src.file}: no { de, en } literal containing „${src.find}“`);
  return null;
}

async function fromMod(src) {
  let m;
  try {
    m = await load(src.mod);
  } catch (err) {
    fail(`${src.mod}: ${String(err.message).split('\n')[0]}`);
    return null;
  }
  const out = {};
  if (src.key.includes('{lang}')) {
    for (const l of ['de', 'en']) out[l] = at(m, src.key.replace('{lang}', l));
  } else {
    const v = at(m, src.key);
    if (v && typeof v === 'object') {
      out.de = v.de;
      out.en = v.en;
    }
  }
  for (const l of ['de', 'en']) {
    let v = out[l];
    // mode variants: Discover runs the Entscheider save (plan §1.7)
    if (v && typeof v === 'object') v = v.entscheider ?? v.entdecker;
    if (typeof v !== 'string' || !v) return fail(`${rel(src.mod)} ${src.key}: no ${l} string`), null;
    out[l] = v;
  }
  return { de: out.de, en: out.en, from: `${rel(src.mod)} ${src.key.replace('{lang}', '{de,en}')}` };
}

const titleCase = (s, lang) => s.toLocaleLowerCase(lang).replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, c) => a + c.toLocaleUpperCase(lang));

async function resolve(src) {
  if (src.join) {
    const parts = [];
    for (const s of src.join) parts.push(await resolve(s));
    if (parts.some((p) => !p)) return null;
    const pre = src.prefix ?? '';
    const sep = src.sep ?? ' ';
    return { de: pre + parts.map((p) => p.de).join(sep), en: pre + parts.map((p) => p.en).join(sep), from: parts.map((p) => p.from).join(' + ') };
  }
  const base = src.file ? fromFile(src) : await fromMod(src);
  if (!base) return null;
  const out = { ...base };
  if (src.pick) {
    for (const l of ['de', 'en']) {
      if (!out[l].includes(src.pick[l])) return fail(`${out.from}: „${src.pick[l]}“ is not in „${out[l]}“`), null;
      out[l] = src.pick[l];
    }
    out.from += ' (part)';
  }
  if (src.form === 'title') for (const l of ['de', 'en']) out[l] = titleCase(out[l], l);
  if (src.form === 'cap') for (const l of ['de', 'en']) out[l] = out[l].charAt(0).toLocaleUpperCase(l) + out[l].slice(1);
  return out;
}

async function card(id, c) {
  const out = { id };
  if (c.eyebrow) out.eyebrow = await resolve(c.eyebrow);
  out.title = await resolve(c.title);
  out.blocks = [];
  for (const b of c.blocks) {
    if ('p' in b) {
      const blk = { kind: 'p', text: await resolve(b.p) };
      if (b.chip) blk.chip = b.chip;
      if (b.src) blk.src = await resolve(b.src);
      out.blocks.push(blk);
    } else {
      const rows = [];
      for (const r of b.rows) {
        const row = { label: await resolve(r.label), value: await resolve(r.value) };
        if (r.chip) row.chip = r.chip;
        rows.push(row);
      }
      out.blocks.push({ kind: 'rows', rows });
    }
  }
  if (c.srcLine) out.srcLine = await resolve(c.srcLine);
  return out;
}

/** plain data only (numbers, strings, arrays, objects); functions and three objects are dropped */
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'function' ? undefined : typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x)));

let text;
try {
  const spec = await load('/src/discover/tour/content.spec.ts');
  const titles = {};
  for (const [id, s] of Object.entries(spec.STOP_TITLES)) titles[id] = await resolve(s);
  const labels = {};
  for (const [id, x] of Object.entries(spec.LABELS)) labels[id] = await resolve(x);
  const cards = {};
  for (const [id, c] of Object.entries(spec.CARD_SPEC)) cards[id] = await card(id, c);
  for (const [id, to] of Object.entries(spec.CARD_ALIAS)) if (!spec.CARD_SPEC[to]) fail(`alias ${id} → ${to}: no such card`);
  const anchors = {};
  for (const [id, a] of Object.entries(spec.ANCHOR_SPEC)) {
    const m = await load(a.mod);
    const v = a.call ? m[a.call]?.(...a.args) : at(m, a.key);
    if (v === undefined) fail(`anchor ${id}: ${a.mod} ${a.call ?? a.key} is undefined`);
    const keep = (o) => (a.fields && o && typeof o === 'object' ? Object.fromEntries(a.fields.map((f) => [f, o[f]])) : o);
    anchors[id] = plain(Array.isArray(v) && a.fields ? v.map(keep) : keep(v));
  }
  for (const c of Object.values(cards)) {
    for (const l of ['de', 'en']) {
      const n = c.blocks
        .filter((b) => b.kind === 'p')
        .map((b) => b.text?.[l] ?? '')
        .join(' ')
        .split(/\s+/)
        .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      if (n > 35) fail(`${c.id}: ${n} words at half height (${l}; ≤ 35)`);
    }
  }
  // compact: a leaf object (a text, a point) on one line
  const leaf = (x) => typeof x !== 'object' || x === null || (Array.isArray(x) && x.every((y) => typeof y !== 'object' || y === null));
  const json = (v, ind = '') => {
    if (leaf(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return `[\n${v.map((x) => `${ind}  ${json(x, ind + '  ')}`).join(',\n')}\n${ind}]`;
    const e = Object.entries(v);
    if (e.every(([, x]) => leaf(x))) return `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
    return `{\n${e.map(([k, x]) => `${ind}  ${JSON.stringify(k)}: ${json(x, ind + '  ')}`).join(',\n')}\n${ind}}`;
  };
  text = `// GENERATED by tools/discover/content.mjs from src/discover/tour/content.spec.ts — do not edit.
// Every text is copied from the game (its \`from\`: the source file and key); \`--check\` fails on drift.
import type { ChipType } from '../types';

export interface GenText {
  readonly de: string;
  readonly en: string;
  /** where the text was copied from */
  readonly from: string;
}
export type GenBlock =
  | { readonly kind: 'p'; readonly text: GenText; readonly chip?: ChipType; readonly src?: GenText }
  | { readonly kind: 'rows'; readonly rows: readonly { readonly label: GenText; readonly value: GenText; readonly chip?: ChipType }[] };
export interface GenCard {
  readonly id: string;
  readonly eyebrow?: GenText;
  readonly title: GenText;
  readonly blocks: readonly GenBlock[];
  readonly srcLine?: GenText;
}

/** the stops' titles (top bar) */
export const TITLES: Readonly<Record<string, GenText>> = ${json(titles)};

/** button labels the game already has */
export const LABELS: Readonly<Record<string, GenText>> = ${json(labels)};

/** stop:<id> and spot:<id> cards */
export const CARDS: Readonly<Record<string, GenCard>> = ${json(cards)};

/** spots whose card is a stop's card */
export const CARD_ALIAS: Readonly<Record<string, string>> = ${json(spec.CARD_ALIAS)};

/** layout numbers (world metres, island frame at h = 0), as the game defines them */
export const ANCHORS = ${json(anchors)} as const;
`;
} finally {
  await server.close();
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
if (check) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== text) {
    const a = cur.split('\n'),
      b = text.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    console.error(`FAIL content.gen.ts is out of date (first difference at line ${i + 1}):\n  file: ${a[i] ?? '(end)'}\n  now:  ${b[i] ?? '(end)'}\nrun: node tools/discover/content.mjs`);
    process.exit(1);
  }
  console.log('PASS content.gen.ts matches its sources');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(text.length / 1024).toFixed(1)} KB)`);
}
