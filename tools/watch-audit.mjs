#!/usr/bin/env node
// The watching rule (docs/PHASE7-PLAN.md §4 conventions, [C2 M6]): unattended time (no input
// required or offered) is ≤ 10 s per stretch and ≤ 20 % of the station's time. Stations mark such
// stretches with ctx.game.unattended(true/false, label); a playtest run saves the marks with its
// area timeline (artifacts/playtest/route-<lang>-<mode>/unattended.json, tools/playtest.mjs); this
// tool reads them and judges.
//
//   node tools/watch-audit.mjs [--from <unattended.json>[,<file>]] [--zones a,b] [--selftest]
//
// Without --from it reads every artifacts/<PT_DIR|playtest>/*/unattended.json. Per mark: the stretch
// length (an open mark runs to the end of its area visit or of the run). Per area: the summed
// unattended time over the time the player spent in the area (enter → exit, game time). The share is
// judged per station when the marks carry the station id as their label and the run timed the
// station (playtest `stations`), else per area visit. Legacy rc4 stations (the 18 rc4 stamps that keep
// their rc4 goals, i.e. no manifest rev ≥ 2) are reported, not failed. --zones limits the areas.
// --selftest judges synthetic runs: a seeded 12 s stretch and a 25 % share must fail, 9 s / 15 % must
// pass. Exit 1 on a miss (or a failed self-test), 2 when there is no run to read.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, list, saveJson } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
export const MAX_STRETCH = 10;
export const MAX_SHARE = 0.2;
/** The rc4 stations (frozen at tag rc4): legacy unless their manifest rev says they changed. */
export const RC4_STATIONS = {
  sensordom: ['messbrille', 'dunkelkammer', 'messstrecke'],
  regelgarten: ['balancieren', 'regler-takt', 'tausend-welten'],
  greifwerkstatt: ['gelenke', 'ei', 'griffe'],
  'lern-dojo': ['vormachen', 'nachmachen', 'datensatz-audit'],
  dunkelfabrik: ['schicht', 'schichtplan', 'lichtaus'],
  prueffeld: ['vorfuehrung', 'unter-last', 'drei-auditoren'],
};

/** Is a mark of `area` with `label` (a station id or free text) a legacy rc4 station? */
function legacy(area, label, revs) {
  const rc4 = RC4_STATIONS[area];
  if (!rc4) return false;
  const changed = (st) => (revs?.[`${area}.${st}`] ?? 1) >= 2;
  if (label && rc4.includes(label)) return !changed(label);
  // an unlabelled mark of an rc4 lobe is legacy only while every station there keeps its rc4 goal
  return rc4.every((st) => !changed(st)) && !(revs && Object.keys(revs).some((k) => k.startsWith(area + '.') && !rc4.includes(k.split('.')[1])));
}

/**
 * Judge one run: { marks: [{ owner, label, t0, t1 }], timeline: [{ t, kind: 'enter'|'exit', area }],
 * stations?: [{ area, station, t0, t1 }], end, revs? }. Returns rows { area, label, kind, value, cap, status }.
 */
export function judge(run, { zones = null } = {}) {
  const rows = [];
  const end = run.end ?? Math.max(0, ...run.marks.map((m) => m.t1 ?? m.t0), ...(run.timeline ?? []).map((e) => e.t));
  // area visits from the timeline
  const visits = new Map();
  const open = new Map();
  for (const e of [...(run.timeline ?? [])].sort((a, b) => a.t - b.t)) {
    if (e.kind === 'enter') open.set(e.area, e.t);
    else if (e.kind === 'exit' && open.has(e.area)) {
      if (!visits.has(e.area)) visits.set(e.area, []);
      visits.get(e.area).push([open.get(e.area), e.t]);
      open.delete(e.area);
    }
  }
  for (const [a, t0] of open) {
    if (!visits.has(a)) visits.set(a, []);
    visits.get(a).push([t0, end]);
  }
  const visitEnd = (area, t) => {
    const v = (visits.get(area) ?? []).find(([a, b]) => t >= a && t <= b);
    return v ? v[1] : end;
  };
  const areas = new Set(run.marks.map((m) => m.owner));
  for (const area of areas) {
    if (zones && !zones.includes(area)) continue;
    const marks = run.marks.filter((m) => m.owner === area);
    // stretches
    for (const m of marks) {
      const len = (m.t1 ?? visitEnd(area, m.t0)) - m.t0;
      const isLegacy = legacy(area, m.label, run.revs);
      const ok = len <= MAX_STRETCH;
      rows.push({ area, label: m.label, kind: 'stretch', value: +len.toFixed(2), cap: MAX_STRETCH, status: ok ? 'pass' : isLegacy ? 'legacy' : 'fail', at: +m.t0.toFixed(1) });
    }
    // shares: per timed station when the run has station spans and the marks name them, else per area
    const stationSpans = (run.stations ?? []).filter((s) => s.area === area);
    const byLabel = new Map();
    for (const m of marks) {
      const key = stationSpans.some((s) => s.station === m.label) ? m.label : null;
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(m);
    }
    for (const [label, ms] of byLabel) {
      const spans = label ? stationSpans.filter((s) => s.station === label).map((s) => [s.t0, s.t1 ?? end]) : visits.get(area) ?? [];
      const total = spans.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
      if (total <= 0) {
        rows.push({ area, label, kind: 'share', value: null, cap: MAX_SHARE, status: 'warn', note: 'no time in the area recorded' });
        continue;
      }
      let un = 0;
      for (const m of ms) {
        const a = m.t0;
        const b = m.t1 ?? visitEnd(area, m.t0);
        for (const [s0, s1] of spans) un += Math.max(0, Math.min(b, s1) - Math.max(a, s0));
      }
      const share = un / total;
      const isLegacy = label ? legacy(area, label, run.revs) : ms.every((m) => legacy(area, m.label, run.revs));
      rows.push({ area, label, kind: 'share', value: +share.toFixed(3), cap: MAX_SHARE, status: share <= MAX_SHARE ? 'pass' : isLegacy ? 'legacy' : 'fail', unattended: +un.toFixed(1), total: +total.toFixed(1) });
    }
  }
  return rows;
}

function print(name, rows) {
  console.log(`== ${name}: ${rows.length ? '' : 'no unattended marks'}`);
  for (const r of rows) {
    const tag = { pass: 'PASS ', fail: 'FAIL ', legacy: 'LEGACY', warn: 'WARN ' }[r.status];
    const what = r.kind === 'stretch' ? `stretch at ${r.at} s` : `share${r.total != null ? ` (${r.unattended} of ${r.total} s)` : ''}`;
    const v = r.kind === 'share' && r.value != null ? `${(r.value * 100).toFixed(0)} %` : r.value == null ? 'n/a' : `${r.value} s`;
    console.log(`${tag} ${`${r.area}${r.label ? `.${r.label}` : ''}`.padEnd(32)} ${what.padEnd(30)} ${v.padStart(7)}  (≤ ${r.kind === 'share' ? `${r.cap * 100} %` : `${r.cap} s`})${r.status === 'legacy' ? '  rc4 station: reported, not failed' : ''}${r.note ? `  ${r.note}` : ''}`);
  }
}

if (args.selftest) {
  // synthetic runs: area 'testfeld' visited 0 → 60 s
  const base = { timeline: [{ t: 0, kind: 'enter', area: 'testfeld' }, { t: 60, kind: 'exit', area: 'testfeld' }], end: 60 };
  const cases = [
    { name: 'seeded 12 s stretch', run: { ...base, marks: [{ owner: 'testfeld', label: 'a', t0: 10, t1: 22 }] }, expect: 'fail' },
    { name: '9 s stretch, 15 %', run: { ...base, marks: [{ owner: 'testfeld', label: 'a', t0: 10, t1: 19 }] }, expect: 'pass' },
    { name: 'three 5 s stretches = 25 %', run: { ...base, marks: [10, 25, 40].map((t) => ({ owner: 'testfeld', label: 'a', t0: t, t1: t + 5 })) }, expect: 'fail' },
    { name: 'an open mark runs to the exit (15 s)', run: { ...base, marks: [{ owner: 'testfeld', label: null, t0: 45, t1: null }] }, expect: 'fail' },
    { name: 'rc4 station 12 s: reported, not failed', run: { timeline: [{ t: 0, kind: 'enter', area: 'sensordom' }, { t: 100, kind: 'exit', area: 'sensordom' }], end: 100, marks: [{ owner: 'sensordom', label: 'messbrille', t0: 10, t1: 22 }] }, expect: 'pass' },
  ];
  let bad = 0;
  for (const c of cases) {
    const rows = judge(c.run);
    const got = rows.some((r) => r.status === 'fail') ? 'fail' : 'pass';
    const ok = got === c.expect;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'BAD '} ${c.name.padEnd(42)} → ${got} (expected ${c.expect})`);
  }
  console.log(bad ? `FAIL selftest: ${bad} case(s) judged wrong` : 'OK   selftest: the seeded 12 s stretch fails, the rule holds');
  process.exit(bad ? 1 : 0);
}

const files = args.from && args.from !== true
  ? String(args.from).split(',').map((f) => path.resolve(ROOT, f))
  : (() => {
      const dir = path.join(ROOT, 'artifacts', process.env.PT_DIR || 'playtest');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).map((d) => path.join(dir, d, 'unattended.json')).filter((f) => fs.existsSync(f));
    })();
if (!files.length) {
  console.error('watch-audit: no playtest run to read (run `npm run playtest -- …` first, or pass --from <unattended.json>)');
  process.exit(2);
}
const zones = list(args.zones, null);
let failed = 0;
const all = {};
for (const f of files) {
  const run = JSON.parse(fs.readFileSync(f, 'utf8'));
  const rows = judge(run, { zones });
  all[path.relative(ROOT, f)] = rows;
  print(`${path.relative(ROOT, f)} (${run.marks.length} marks)`, rows);
  failed += rows.filter((r) => r.status === 'fail').length;
}
saveJson('watch-audit.json', all);
console.log(failed ? `FAIL watch-audit: ${failed} miss(es) of the watching rule` : `OK   watch-audit: ${files.length} run(s) within the watching rule`);
process.exit(failed ? 1 : 0);
