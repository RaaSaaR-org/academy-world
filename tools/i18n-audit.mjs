#!/usr/bin/env node
// German/English string audit over every area (docs/PHASE7-PLAN.md §5.10, [C1 m4]). Every area is
// initialised first through __academy.loadAll() (sites too), so the lazy string tables are registered;
// then the registry of src/i18n/I18n.ts and the manifests are read in the page.
//
//   node tools/i18n-audit.mjs [--dev | --base <url> | --dist <dir>] [--seed-missing-en] [--selftest]
//
// Fails on:
//   areas      an area with code that is not ready after loadAll (its strings never registered)
//   parity     a key in one language only (DE without EN, or EN without DE)
//   shape      a mode variant ({ entdecker, entscheider }) in one language and a plain string in the
//              other, or a broken variant: a table whose only children are entdecker / entscheider
//              that the registry did not take as a variant (one leg missing or not a string). A table
//              with other keys beside them (e.g. card.a.{title, entdecker, entscheider}) is plain.
//   params     different {placeholder} sets between DE and EN (per mode leg)
//   empty      an empty string where the other language has text
//   manifests  a manifest Text (title, verb, eyebrow, systemLabel, takeaway, station titles) without
//              both languages
//   stamps     a Pass stamp or a challenge whose title names a missing key, or a {de, en} without en
// --seed-missing-en registers one German-only key first (the run must fail); --selftest does that and
// exits 0 only when the seeded key is reported. Exit 1 on any finding.
import { gameServer, launchChromium, openGame, parseArgs, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const seed = !!args['seed-missing-en'] || !!args.selftest;
const SEED_KEY = '_i18n_audit_seed.probe';

const AUDIT = async (seedKey) => {
  const A = window.__academy;
  const G = A.game;
  const I = G.i18n;
  if (seedKey) {
    const [ns, leaf] = seedKey.split('.');
    I.registerStrings(ns, { de: { [leaf]: 'nur deutsch (i18n-audit seed)' } });
  }
  const T = I.tables;
  const out = { areas: [], parity: [], shape: [], params: [], empty: [], manifests: [], stamps: [], counts: { de: T.de.size, en: T.en.size } };
  const isVariant = (v) => v && typeof v === 'object' && typeof v.entdecker === 'string' && typeof v.entscheider === 'string';
  const legs = (v) => (typeof v === 'string' ? [v] : isVariant(v) ? [v.entdecker, v.entscheider] : []);
  const ph = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
  // areas: every area with code must be ready
  for (const z of A.zones()) if (z.status === 'error') out.areas.push(`${z.id}: ${String(z.error ?? 'error').slice(0, 160)}`);
  for (const m of A.manifests('all')) {
    const z = A.zones().find((x) => x.id === m.id);
    if (m.hasCode && z && z.status !== 'ready') out.areas.push(`${m.id}: ${z.status} after loadAll()`);
  }
  // broken variants: a table whose only flattened children are entdecker / entscheider leaves
  for (const [lang, table] of [['DE', T.de], ['EN', T.en]]) {
    const kids = new Map();
    for (const key of table.keys()) {
      const i = key.lastIndexOf('.');
      if (i < 0) continue;
      const parent = key.slice(0, i);
      if (!kids.has(parent)) kids.set(parent, new Set());
      kids.get(parent).add(key.slice(i + 1));
    }
    // a parent with deeper children (a nested table) is a plain table, never a variant
    const nested = new Set();
    for (const key of table.keys()) {
      const parts = key.split('.');
      for (let i = 1; i < parts.length - 1; i++) nested.add(parts.slice(0, i).join('.'));
    }
    for (const [parent, names] of kids) {
      if (nested.has(parent)) continue;
      const legsOnly = [...names].every((n) => n === 'entdecker' || n === 'entscheider');
      if (legsOnly) out.shape.push(`${parent}: broken mode variant in ${lang} (${[...names].join(' + ')} only, or a leg is not a string)`);
    }
  }
  // parity, shape, params, empty
  for (const [key, dv] of T.de) {
    const ev = T.en.get(key);
    if (ev === undefined) {
      out.parity.push(`${key}: no EN`);
      continue;
    }
    if (isVariant(dv) !== isVariant(ev)) out.shape.push(`${key}: ${isVariant(dv) ? 'mode variant' : 'plain'} in DE, ${isVariant(ev) ? 'mode variant' : 'plain'} in EN`);
    // per mode leg (a plain string stands for both legs)
    const leg = (v, m) => (typeof v === 'string' ? v : isVariant(v) ? v[m] : '');
    for (const m of isVariant(dv) || isVariant(ev) ? ['entdecker', 'entscheider'] : ['entdecker']) {
      const a = ph(leg(dv, m));
      const b = ph(leg(ev, m));
      if (a !== b) out.params.push(`${key}${isVariant(dv) || isVariant(ev) ? ` (${m})` : ''}: placeholders differ (DE {${a}} · EN {${b}})`);
    }
    const dEmpty = legs(dv).some((s) => !s.trim());
    const eEmpty = legs(ev).some((s) => !s.trim());
    if (dEmpty !== eEmpty) out.empty.push(`${key}: empty in ${dEmpty ? 'DE' : 'EN'} only`);
  }
  for (const key of T.en.keys()) {
    if (!T.de.has(key)) out.parity.push(`${key}: EN only (no DE)`);
  }
  // manifests: plain { de, en } texts
  const both = (t) => !t || typeof t !== 'object' || 'key' in t || (typeof t.de === 'string' && t.de.trim() && typeof t.en === 'string' && t.en.trim());
  for (const m of A.manifests('all')) {
    for (const f of ['name', 'title', 'verb', 'eyebrow', 'systemLabel', 'takeaway']) if (m[f] && !both(m[f])) out.manifests.push(`${m.id}.${f}: ${JSON.stringify(m[f]).slice(0, 80)}`);
    for (const s of m.stations ?? []) if (s.title && !both(s.title)) out.manifests.push(`${m.id}.${s.id}.title: ${JSON.stringify(s.title).slice(0, 80)}`);
  }
  // stamp and challenge titles (Text: a literal, { de, en }, { key })
  const text = (where, t) => {
    if (!t || typeof t === 'function' || typeof t === 'string') return;
    if ('key' in t) {
      if (!T.de.has(t.key)) out.stamps.push(`${where}: key ${t.key} does not exist`);
      return;
    }
    if (!both(t)) out.stamps.push(`${where}: ${JSON.stringify(t).slice(0, 80)}`);
  };
  for (const d of G.progress.stampDefs.values()) text(`stamp ${d.id}`, d.title);
  for (const [k, e] of G.gameLayer.entries) {
    text(`challenge ${k} title`, e.def.title);
    text(`challenge ${k} metric`, e.def.metric && e.def.metric.label);
    text(`challenge ${k} lesson`, e.def.lesson);
    (e.def.goals || []).forEach((g, i) => text(`challenge ${k} goal ${i + 1}`, g.text));
  }
  return out;
};

const srv = await gameServer(args, { prefer: 'dev' });
const browser = await launchChromium();
let res;
try {
  const { page, ctx, errors } = await openGame(browser, `${srv.url}/?skipIntro=1&lang=de`, { instrument: false, all: true });
  res = await page.evaluate(AUDIT, seed ? SEED_KEY : null);
  res.pageErrors = errors.slice(0, 10);
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
const groups = ['areas', 'parity', 'shape', 'params', 'empty', 'manifests', 'stamps'];
console.log(`i18n-audit: ${res.counts.de} DE keys, ${res.counts.en} EN keys`);
let n = 0;
for (const g of groups) {
  const xs = res[g];
  n += xs.length;
  console.log(`${xs.length ? 'FAIL' : 'PASS'}  ${g.padEnd(10)} ${xs.length}`);
  for (const x of xs.slice(0, 40)) console.log(`        ${x}`);
  if (xs.length > 40) console.log(`        … ${xs.length - 40} more`);
}
for (const e of res.pageErrors) console.log(`page error: ${e}`);
saveJson('i18n-audit.json', res);
if (args.selftest) {
  const caught = res.parity.some((x) => x.startsWith(`${SEED_KEY}:`));
  console.log(caught ? `OK   selftest: the seeded German-only key ${SEED_KEY} is reported` : `FAIL selftest: the seeded key ${SEED_KEY} was not reported`);
  process.exit(caught ? 0 : 1);
}
console.log(n ? `FAIL i18n-audit: ${n} finding(s)` : 'OK   i18n-audit: DE and EN agree');
process.exit(n || res.pageErrors.length ? 1 : 0);
