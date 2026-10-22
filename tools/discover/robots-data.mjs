#!/usr/bin/env node
// „Entdecken“ (Discover, WP-D2, plan §3.1, §3.4): writes src/discover/data/robots.gen.ts — the robot
// cards and the viewer's texts, COPIED from the game, never retyped:
//   - every hall robot of src/zones/schauhalle/data/robots.ts (HALL_ROBOTS, read with VITE_AMBER=1 so
//     the four amber exhibits are in it too) through sheet() of src/zones/schauhalle/sheet.ts in DE and
//     EN: name, category, status, kind, „Kann heute“, size, the size measured on the model (MODELL),
//     payload with its condition, the sources with „Stand 17.10.2026“, model & licence (the attribution
//     the licences require) and, for the amber exhibits, the hall's amber line;
//   - the model data of src/robots/manifest.ts the studio needs (height in the default pose, bounds);
//   - the viewer's words from the hall's strings and manifest (tabs = the pylons, the Größenwand's
//     „Du“ and EMI labels and its line, „Gemessen am Modell“).
// Amber exhibits go into AMBER_ROBOTS, which the viewer reaches only under SHOW_AMBER
// (src/core/release.ts): a build without VITE_AMBER=1 drops them and the amber line.
//
// Importing zone files from the Discover chunk would split the desktop Schauhalle chunk; this file
// is why it does not have to.
//
//   node tools/discover/robots-data.mjs           write src/discover/data/robots.gen.ts
//   node tools/discover/robots-data.mjs --check   regenerate in memory; exit 1 on any difference (drift)
//
// Not a discover-check scenario (no `scenario` export): the runner never loads it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'discover', 'data', 'robots.gen.ts');
const check = process.argv.includes('--check');

// every hall robot, the amber exhibits included (split below)
process.env.VITE_AMBER = '1';
globalThis.window ??= globalThis;

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

let text;
try {
  const load = (p) => server.ssrLoadModule(p);
  const { HALL_ROBOTS, INSPECT_ORDER } = await load('/src/zones/schauhalle/data/robots.ts');
  const { sheet, zs } = await load('/src/zones/schauhalle/sheet.ts');
  const { robotInfo } = await load('/src/robots/manifest.ts');
  const { SHOW_AMBER } = await load('/src/core/release.ts');
  const hall = (await load('/src/zones/schauhalle/manifest.ts')).default;
  if (!SHOW_AMBER) throw new Error('VITE_AMBER=1 did not reach src/core/release.ts: the amber exhibits would be missing');
  text = generate({ HALL_ROBOTS, INSPECT_ORDER, sheet, zs, robotInfo, hall });
} finally {
  await server.close();
}

if (check) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== text) {
    const a = now.split('\n'),
      b = text.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    console.error(`FAIL robots-data: ${path.relative(ROOT, OUT)} drifted from its sources (first difference at line ${i + 1}):\n  file: ${a[i] ?? '(end)'}\n  now:  ${b[i] ?? '(end)'}\nRun: node tools/discover/robots-data.mjs`);
    process.exit(1);
  }
  console.log(`ok robots-data: ${path.relative(ROOT, OUT)} matches HALL_ROBOTS, sheet() and the manifest`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(text.length / 1024).toFixed(1)} KB)`);
}

// ── generation ────────────────────────────────────────────────────────────────────────────────────

function generate({ HALL_ROBOTS, INSPECT_ORDER, sheet, zs, robotInfo, hall }) {
  const bi = (de, en) => ({ de, en });
  const both = (fn) => bi(fn('de'), fn('en'));
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const order = new Map(INSPECT_ORDER.map((id, i) => [id, i]));
  const SRC = 'src/zones/schauhalle/sheet.ts sheet()';

  const card = (r) => {
    const info = robotInfo(r.id);
    const s = { de: sheet(r, 'de', info), en: sheet(r, 'en', info) };
    const row = (lang, pick) => s[lang].more.find(pick) ?? s[lang].head.find(pick) ?? null;
    /** a row in both languages: label, value, chip, condition */
    const rowBi = (pick, name) => {
      const de = row('de', pick),
        en = row('en', pick);
      if (!de || !en) throw new Error(`${r.id}: no row ${name}`);
      return {
        label: bi(de.label, en.label),
        value: de.value == null ? null : bi(de.value, en.value),
        chip: de.chip ?? null,
        cond: de.cond ? bi(de.cond, en.cond) : null,
      };
    };
    const can = rowBi((x) => x.key === 'can', 'can');
    const canSrc = row('de', (x) => x.key === 'can').src;
    const rows = {
      size: rowBi((x) => x.key === 'size', 'size'),
      // the first „model“ row: the height measured on the model (MODELL); the second is the joint count
      model: rowBi((x) => x.key === 'model' && x.label !== '', 'model height'),
      payload: rowBi((x) => x.key === 'payload', 'payload'),
      source: rowBi((x) => x.key === 'source', 'source'),
      license: rowBi((x) => x.key === 'license', 'licence'),
    };
    return {
      id: r.id,
      cat: r.cat,
      amber: !!r.amber,
      order: order.get(r.id) ?? 99,
      name: bi(s.de.name, s.en.name),
      short: r.short,
      catLabel: bi(s.de.cat, s.en.cat),
      status: bi(s.de.status, s.en.status),
      kind: rowBi((x) => x.key === 'kind', 'kind'),
      can: { label: can.label, value: can.value, chip: can.chip, src: canSrc },
      rows,
      asOf: bi(s.de.asOf, s.en.asOf),
      heightM: info.heightM,
      bounds: { c: info.bounds.center.map(r4), r: r4(info.bounds.radius) },
      from: `HALL_ROBOTS['${r.id}'] (src/zones/schauhalle/data/robots.ts) · ${SRC} · robotInfo('${r.id}') (src/robots/manifest.ts)`,
    };
  };

  const all = HALL_ROBOTS.map(card).sort((a, b) => a.order - b.order);
  const plain = all.filter((c) => !c.amber);
  const amber = all.filter((c) => c.amber);
  if (all.length !== 21 || plain.length !== 17 || amber.length !== 4) throw new Error(`expected 21 hall robots (17 + 4 amber), got ${all.length} (${plain.length} + ${amber.length})`);
  for (const c of amber) if (!c.rows.license.cond) throw new Error(`${c.id}: amber exhibit without the amber line`);
  for (const c of plain) if (c.rows.license.cond) throw new Error(`${c.id}: amber line on a cleared robot`);

  const T = (key) => ({ ...both((l) => zs(l, key)), from: `zone.schauhalle.${key} (src/zones/schauhalle/strings.ts)` });
  const viewerText = {
    hall: { ...hall.title, from: 'title (src/zones/schauhalle/manifest.ts)' },
    eyebrow: { ...hall.eyebrow, from: 'eyebrow (src/zones/schauhalle/manifest.ts)' },
    tabs: { gehen: T('pylon.gehen'), greifen: T('pylon.greifen'), bauen: T('pylon.bauen') },
    du: T('wall.du'),
    emi: T('wall.emi'),
    wallLine: T('wall.line'),
    modelRow: T('row.model'),
    ka: T('ka'),
  };

  const json = (v) => JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ');
  const lines = [];
  lines.push('// GENERATED by tools/discover/robots-data.mjs — do not edit. Rebuild: node tools/discover/robots-data.mjs');
  lines.push('// (`--check` fails when this file drifts from its sources). Every text is copied from the game; `from` names');
  lines.push('// the source. Amber exhibits: AMBER_ROBOTS, reached only under SHOW_AMBER (src/core/release.ts).');
  lines.push("import type { GenRobot, ViewerText } from '../viewer/types';");
  lines.push('');
  lines.push(`export const VIEWER_TEXT: ViewerText = ${json(viewerText)};`);
  lines.push('');
  lines.push('/** the cleared hall robots, in the hall\'s order (GEHEN, GREIFEN & FAHREN, SELBST BAUEN) */');
  lines.push('export const ROBOTS: readonly GenRobot[] = [');
  for (const c of plain) lines.push(`  ${json(c)},`);
  lines.push('];');
  lines.push('');
  lines.push('/** the amber exhibits (docs/LEGAL-REVIEW.md item 2): only with VITE_AMBER=1 */');
  lines.push('export const AMBER_ROBOTS: readonly GenRobot[] = [');
  for (const c of amber) lines.push(`  ${json(c)},`);
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}
