#!/usr/bin/env node
// Phase 7 gate tiers (docs/PHASE7-PLAN.md §6.3, §5.10): one command per merge, one per wave.
//
//   node tools/gates.mjs --tier merge|wave|selftest [--base <ref>] [--only id,id] [--skip id,id] [--dry]
//
//   --tier merge     ≈ 15–25 min: typecheck, typecheck:zone for every area folder touched since the base,
//                    build, load-size, i18n-audit, save-migrate, robots/check (only when src/robots/**
//                    changed), third-party, text-audit, drawcalls --ledger, playtest --quick, and „Entdecken“
//                    (Discover plan §6): the two generators' drift checks (discover/content, discover/
//                    robots-data --check) and discover-check --quick (Pixel profile, /academy-world/ build)
//   --tier wave      ≈ 2–3 h: a head build into artifacts/dist/head, the rc4 reference once (dist-ref), the
//                    merge tier, then the playtests, perf, A/B, hitches, memory, lift-off, flash,
//                    onboarding, ending, chips, glyphs, watching rule, secrets, a11y, robustness, chunk
//                    caps, the playthrough lap and the deploy check of §6.3; plus discover-full: every
//                    Discover scenario on pixel7 + iphone15, in a default and a VITE_AMBER=1 build
//   --tier selftest  ≈ 5 min: the self-tests of the gate tools (each must catch its seeded miss):
//                    drawcalls, i18n-audit, watch-audit, flash-check, secret-audit, liftoff-check
//   --base <ref>     where „touched“ starts: default the newest Phase 7 wave tag that HEAD contains
//                    (p7-w2, p7-w1, p7-w1-base, p7-w0 …), so on a WP branch AND on phase7 after the merges
//                    every area the wave touched is typechecked (wave-0 note 1); else phase7
//   --only/--skip    run or skip steps by id (ids are printed with --dry)
//   --dry            print the plan, run nothing
//
// A tool that does not exist yet is SKIPPED with a warning (e.g. mujoco-check until WP5); so is a step
// whose input file does not exist when it is its turn (WP1's save fixtures, the rc4 reference). Each
// step's output goes to artifacts/phase7/gates/<tier>-<sha>/<id>.log; the summary (with the known
// misses and pending checks the tools printed) to artifacts/phase7/gates/<tier>-<sha>.json. Exit 1 when
// any step fails.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { ROOT, parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const tier = String(args.tier ?? '');
if (tier !== 'merge' && tier !== 'wave' && tier !== 'selftest') {
  console.error('usage: node tools/gates.mjs --tier merge|wave|selftest [--base <ref>] [--only a,b] [--skip a,b] [--dry]');
  process.exit(2);
}
const list = (v) => (v == null || v === true ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));
const only = list(args.only);
const skipIds = list(args.skip);
const dry = !!args.dry;

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const sha = git('rev-parse', '--short', 'HEAD') || 'nogit';
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
/** the newest wave tag HEAD contains (wave-0 note 1): the start of the current wave */
const waveTag = () =>
  git('tag', '--merged', 'HEAD', '--sort=-creatordate', '--list', 'p7-w*')
    .split('\n')
    .filter(Boolean)[0] ?? '';
const baseRef = String(args.base && args.base !== true ? args.base : waveTag() || 'phase7');
const mergeBase = git('merge-base', 'HEAD', baseRef);
// files the branch changed against the merge base, plus uncommitted ones
const changed = new Set(
  [
    ...(mergeBase ? git('diff', '--name-only', mergeBase).split('\n') : []),
    ...git('status', '--porcelain', '--untracked-files=all')
      .split('\n')
      .map((l) => l.slice(3).split(' -> ').pop()),
  ].filter(Boolean),
);
const touchedAreas = [...new Set([...changed].map((f) => f.match(/^src\/zones\/([^/]+)\//)?.[1]).filter((id) => id && fs.existsSync(path.join(ROOT, 'src', 'zones', id))))].sort();
const robotsChanged = [...changed].some((f) => f.startsWith('src/robots/'));

// ── what the existing tools support ───────────────────────────────────────────────────────────────
const toolPath = (t) => path.join(ROOT, 'tools', `${t}.mjs`);
const exists = (t) => fs.existsSync(toolPath(t));
const source = (t) => (exists(t) ? fs.readFileSync(toolPath(t), 'utf8') : '');
const supports = (t, flag) => {
  const s = source(t);
  return s.includes(`args.${flag}`) || s.includes(`args['${flag}']`) || s.includes(`'--${flag}'`) || s.includes(`"--${flag}"`);
};
// one view table for every tool (tools/lib/views.mjs); a view whose content does not exist yet is the
// tool's to skip (pending), an unknown name is dropped here
const { VIEWS } = await import('./lib/views.mjs');
const knownViews = new Set(Object.keys(VIEWS));
// the Playwright engines this machine has (Chromium always runs: measure.mjs falls back to a cached
// headless shell); Firefox and WebKit need this Playwright's own builds or FIREFOX_EXE / WEBKIT_EXE
const engines = { chromium: true };
{
  const pw = await import('playwright').catch(() => null);
  for (const name of ['firefox', 'webkit']) {
    let ok = !!process.env[`${name.toUpperCase()}_EXE`];
    try {
      ok ||= !!pw && fs.existsSync(pw[name].executablePath());
    } catch {
      /* not installed */
    }
    engines[name] = ok;
  }
}

/**
 * One step. `tool` (tools/<tool>.mjs) must exist, else skip. `flags` the tool must support, else skip.
 * `views` are filtered to the views the table knows. `needsFile` is checked when the step's turn comes.
 */
const steps = [];
function step(id, o) {
  steps.push({ id, ...o });
}
const node = (tool, ...a) => ({ cmd: 'node', argv: [`tools/${tool}.mjs`, ...a], tool });
const npm = (script, ...a) => ({ cmd: 'npm', argv: ['run', script, ...(a.length ? ['--', ...a] : [])] });

function mergeTier() {
  step('typecheck', npm('typecheck'));
  if (!touchedAreas.length) step('typecheck-zone', { skip: `no area folder touched since ${baseRef}` });
  for (const id of touchedAreas) step(`typecheck-zone:${id}`, npm('typecheck:zone', id));
  step('build', npm('build'));
  step('load-size', node('load-size'));
  step('i18n-audit', node('i18n-audit'));
  // WP1's fixtures and their checker (tools/fixtures/saves/check.mjs)
  step('save-migrate', { ...node('save-migrate'), needsFile: 'tools/fixtures/saves/check.mjs' });
  step('robots-check', robotsChanged ? node('robots/check') : { skip: 'src/robots/** unchanged' });
  step('third-party', node('third-party'));
  step('text-audit', node('text-audit', '--lang', 'de', '--mode', 'entdecker'));
  step('drawcalls', { ...node('drawcalls', '--views', 'bridgehead,plaza', '--ledger'), flags: ['ledger'], views: true });
  step('playtest-quick', { ...npm('playtest', '--lang', 'de', '--mode', 'entdecker', '--quick'), tool: 'playtest', flags: ['quick'] });
  // „Entdecken“ (Discover plan §6): the copied card texts match their sources, then the phone smoke test
  // (gate, boot with the tour's first 3 stops, storage) on its own BASE_PATH=/academy-world/ build
  step('discover-content-check', node('discover/content', '--check'));
  step('discover-robots-check', node('discover/robots-data', '--check'));
  step('discover-quick', { ...node('discover-check', '--quick'), flags: ['quick'] });
}

function waveTier() {
  step('build-head', { cmd: 'npx', argv: ['vite', 'build', '--outDir', 'artifacts/dist/head', '--emptyOutDir'] });
  step('dist-ref', node('dist-ref', 'rc4'));
  mergeTier();
  step('playtest-en-entscheider', { ...npm('playtest', '--lang', 'en', '--mode', 'entscheider'), tool: 'playtest' });
  step('playtest-de-entdecker', { ...npm('playtest', '--lang', 'de', '--mode', 'entdecker'), tool: 'playtest' });
  step('playtest-rc4-mid', { ...npm('playtest', '--lang', 'de', '--mode', 'entdecker', '--save', 'tools/fixtures/saves/rc4-mid.json'), tool: 'playtest', flags: ['save'], needsFile: 'tools/fixtures/saves/rc4-mid.json' });
  step('perf-high', node('perf', '--quality', 'high'));
  step('perf-low', node('perf', '--quality', 'low'));
  step('perf-cpu', { ...node('perf-cpu', '--rates', '4', '--views', 'bridgehead,plaza,duckfield,sonnenacker-c,traumhangar-ghost,climb'), views: true });
  step('gpu-ab', { ...node('gpu-ab', '--views', 'plaza,clouddown,bridgehead,ausguck', '--runs', '5', '--dist', 'rc4=artifacts/dist/rc4', '--dist', 'head=artifacts/dist/head'), views: true, needsFile: 'artifacts/dist/rc4/index.html' });
  step('hitches', node('hitches', '--runs', '1'));
  step('hitches-webkit', { ...node('hitches', '--runs', '1', '--browser', 'webkit'), flags: ['browser'], engine: 'webkit' });
  step('warmup-table', { ...node('warmup', '--table'), flags: ['table'] });
  step('memory-lap', node('memory-lap'));
  step('liftoff-check', node('liftoff-check'));
  step('liftoff-check-rm', { ...node('liftoff-check', '--rm'), flags: ['rm'] });
  step('flash-check', node('flash-check', '--sequence', 'all'));
  step('onboarding-de-entdecker', node('onboarding-run', '--lang', 'de', '--mode', 'entdecker'));
  step('onboarding-en-entscheider-idle', node('onboarding-run', '--lang', 'en', '--mode', 'entscheider', '--idle', '10'));
  step('onboarding-returning', { ...node('onboarding-run', '--lang', 'de', '--mode', 'entdecker', '--returning'), flags: ['returning'] });
  step('ending-check', node('ending-check', '--lang', 'de'));
  for (const [lang, mode] of [['de', 'entdecker'], ['de', 'entscheider'], ['en', 'entdecker'], ['en', 'entscheider']])
    step(`text-audit-chips-${lang}-${mode}`, { ...node('text-audit', '--lang', lang, '--mode', mode, '--chips'), flags: ['chips'] });
  step('glyph-check', node('glyph-check'));
  // after the playtests: it reads their unattended marks
  step('watch-audit', node('watch-audit'));
  // 30 curiosity-bot runs on the full wave-2 world take ≈ 2 h 10 min (≈ 4.3 min a run): its own limit
  step('secret-audit', { ...node('secret-audit', '--runs', '30'), timeoutMin: 180 });
  step('a11y-keyboard', node('a11y-keyboard', '--browsers', 'chromium,firefox,webkit'));
  step('contrast', node('contrast'));
  step('audio-levels', node('audio-levels'));
  step('idle-render', node('idle-render'));
  step('dialogue-modal', node('dialogue-modal'));
  step('brand-check', node('brand-check'));
  step('robust-check', node('robust-check'));
  step('mujoco-check', node('mujoco-check', '--prod', '--engines', 'chromium,firefox,webkit', '--cpu', '1,4'));
  step('load-size-chunks', { ...node('load-size', '--chunks'), flags: ['chunks'] });
  step('load-matrix-lap', { ...node('load-matrix', '--lap'), flags: ['lap'] });
  step('deploy-check', node('deploy-check', '--preview'));
  // „Entdecken“ (Discover plan §6): every scenario on both phone profiles, each in its own /academy-world/
  // build, without and with the amber exhibits (iphone15 falls back to Chromium with a note without WebKit)
  step('discover-full', { ...node('discover-check', '--devices', 'pixel7,iphone15'), timeoutMin: 120 });
  step('discover-full-amber', { ...node('discover-check', '--devices', 'pixel7,iphone15', '--amber'), flags: ['amber'], timeoutMin: 120 });
}

function selftestTier() {
  // each tool must catch the miss it seeds (exit 0 = caught)
  step('drawcalls-selftest', { ...node('drawcalls', '--views', 'plaza', '--selftest'), flags: ['selftest'] });
  step('i18n-audit-selftest', { ...node('i18n-audit', '--selftest'), flags: ['selftest'] });
  step('watch-audit-selftest', { ...node('watch-audit', '--selftest'), flags: ['selftest'] });
  step('flash-check-selftest', { ...node('flash-check', '--selftest'), flags: ['selftest'] });
  step('secret-audit-selftest', { ...node('secret-audit', '--selftest', '--dev'), flags: ['selftest'] });
  step('liftoff-check-selftest', { ...node('liftoff-check', '--selftest', '--dev'), flags: ['selftest'] });
}

if (tier === 'merge') mergeTier();
else if (tier === 'wave') waveTier();
else selftestTier();

// ── resolve each step against the tools as they are ───────────────────────────────────────────────
for (const s of steps) {
  if (s.skip) continue;
  if (s.tool && !exists(s.tool)) {
    s.skip = `tools/${s.tool}.mjs does not exist yet`;
    continue;
  }
  const missing = (s.flags ?? []).filter((f) => !supports(s.tool, f));
  if (missing.length) {
    s.skip = `tools/${s.tool}.mjs has no ${missing.map((f) => `--${f}`).join(', ')} yet`;
    continue;
  }
  if (s.engine && !engines[s.engine]) {
    s.skip = `${s.engine} for this Playwright is not installed (npx playwright install ${s.engine}, or ${s.engine.toUpperCase()}_EXE + PW_CORE_${s.engine.toUpperCase()})`;
    continue;
  }
  // --browsers / --engines lists keep the engines this machine has
  for (const flag of ['--browsers', '--engines']) {
    const i = s.argv?.indexOf(flag) ?? -1;
    if (i < 0) continue;
    const want = s.argv[i + 1].split(',');
    const have = want.filter((e) => engines[e] !== false);
    if (have.length < want.length) {
      s.argv = [...s.argv.slice(0, i + 1), have.join(','), ...s.argv.slice(i + 2)];
      s.warn = [s.warn, `${want.filter((e) => !have.includes(e)).join(', ')} not installed: ran ${have.join(',')}`].filter(Boolean).join(' · ');
    }
  }
  if (s.views) {
    const i = s.argv.indexOf('--views');
    const want = s.argv[i + 1].split(',');
    const have = want.filter((v) => knownViews.has(v));
    const unknown = want.filter((v) => !knownViews.has(v));
    if (!have.length) {
      s.skip = `none of the views ${want.join(',')} exists`;
      continue;
    }
    if (unknown.length) {
      s.argv = [...s.argv.slice(0, i + 1), have.join(','), ...s.argv.slice(i + 2)];
      s.warn = `views ${unknown.join(',')} unknown: ran ${have.join(',')}`;
    }
  }
}
for (const s of steps) {
  if ((only.length && !only.includes(s.id)) || skipIds.includes(s.id)) s.skip ??= 'deselected (--only / --skip)';
}

const outDir = path.join(ROOT, 'artifacts', 'phase7', 'gates');
const logDir = path.join(outDir, `${tier}-${sha}`);
fs.mkdirSync(logDir, { recursive: true });
const fmt = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
const line = (s) => `${s.cmd} ${s.argv.join(' ')}`;

console.log(`gates · tier ${tier} · ${branch}@${sha} · base ${baseRef}${mergeBase ? ` (${mergeBase.slice(0, 7)})` : ' (not found)'} · touched areas: ${touchedAreas.join(', ') || 'none'} · engines: ${Object.entries(engines).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
if (dry) {
  for (const s of steps) console.log(`${s.skip ? 'SKIP' : s.warn ? 'WARN' : 'RUN '}  ${s.id.padEnd(34)} ${s.skip ? s.skip : line(s)}${s.needsFile ? `  (needs ${s.needsFile})` : ''}${s.warn ? `  (${s.warn})` : ''}`);
  process.exit(0);
}

/** Run one step, output to its log file; resolves with the exit code. */
function run(s) {
  return new Promise((resolve) => {
    const log = fs.openSync(path.join(logDir, `${s.id.replace(/[^\w.-]+/g, '_')}.log`), 'w');
    fs.writeSync(log, `$ ${line(s)}\n`);
    const child = spawn(s.cmd, s.argv, { cwd: ROOT, stdio: ['ignore', log, log], env: process.env });
    // a hung tool must not hold the tier forever (60 min, or the step's own `timeoutMin`)
    const timer = setTimeout(() => child.kill('SIGTERM'), (s.timeoutMin ?? 60) * 60 * 1000);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      fs.closeSync(log);
      resolve(code ?? (signal ? 128 : 1));
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(127);
    });
  });
}

/** The known misses and pending checks a tool printed (its log), for the summary. */
function notesOf(file) {
  const out = { known: [], pending: [] };
  if (!fs.existsSync(file)) return out;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = l.trim();
    // one line per miss: the tools' summary notes (the per-row KNOWN lines repeat them)
    if (/^note\s+known miss|^note\s+.*known miss:/i.test(t)) out.known.push(t.replace(/^note\s+/, '').slice(0, 240));
    else if (/^note\s+pending|^PENDING\b|^WARN\s+\S+.*pending|: pending — /i.test(t)) out.pending.push(t.replace(/^note\s+/, '').slice(0, 240));
  }
  out.known = [...new Set(out.known)];
  out.pending = [...new Set(out.pending)];
  return out;
}

const t0 = Date.now();
const results = [];
for (const s of steps) {
  // an input made by an earlier step (the rc4 reference, WP1's fixtures) is checked when the step's turn comes
  if (!s.skip && s.needsFile && !fs.existsSync(path.join(ROOT, s.needsFile))) s.skip = `${s.needsFile} does not exist (yet)`;
  const r = { id: s.id, cmd: s.skip ? null : line(s), status: 'skip', code: null, ms: 0, note: s.skip ?? s.warn ?? null, log: null, known: [], pending: [] };
  results.push(r);
  if (s.skip) {
    console.log(`SKIP  ${s.id.padEnd(34)} ${s.skip}`);
    continue;
  }
  if (process.stdout.isTTY) process.stdout.write(`…     ${s.id.padEnd(34)} ${line(s)}\r`);
  const ts = Date.now();
  r.code = await run(s);
  r.ms = Date.now() - ts;
  r.log = path.relative(ROOT, path.join(logDir, `${s.id.replace(/[^\w.-]+/g, '_')}.log`));
  r.status = r.code === 0 ? (s.warn ? 'warn' : 'pass') : 'fail';
  Object.assign(r, notesOf(path.join(ROOT, r.log)));
  const extra = [s.warn, r.known.length ? `${r.known.length} known miss(es)` : null, r.pending.length ? `${r.pending.length} pending` : null].filter(Boolean).join(' · ');
  console.log(`${r.status.toUpperCase().padEnd(5)} ${s.id.padEnd(34)} ${fmt(r.ms).padStart(10)}${extra ? `  (${extra})` : ''}${r.status === 'fail' ? `  → ${r.log}` : ''}`);
  if (r.status === 'fail') {
    const tail = fs.readFileSync(path.join(ROOT, r.log), 'utf8').trimEnd().split('\n').slice(-12);
    for (const l of tail) console.log(`        ${l.slice(0, 220)}`);
  }
}
const failed = results.filter((r) => r.status === 'fail');
const summary = { tier, sha, branch, base: baseRef, mergeBase: mergeBase || null, touchedAreas, startedAt: new Date(t0).toISOString(), ms: Date.now() - t0, pass: !failed.length, steps: results };
const out = path.join(outDir, `${tier}-${sha}.json`);
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
const known = results.flatMap((r) => r.known.map((k) => `${r.id}: ${k}`));
const pend = results.flatMap((r) => r.pending.map((k) => `${r.id}: ${k}`));
if (known.length) {
  console.log('\nknown misses (listed with their owner by the tools):');
  for (const k of known) console.log(`  ${k}`);
}
if (pend.length) {
  console.log(`\npending checks (content of later WPs): ${pend.length}`);
  for (const k of pend.slice(0, 40)) console.log(`  ${k}`);
  if (pend.length > 40) console.log(`  … ${pend.length - 40} more in ${path.relative(ROOT, out)}`);
}
const n = (st) => results.filter((r) => r.status === st).length;
console.log(`\n${failed.length ? 'FAIL' : 'PASS'}  tier ${tier}: ${n('pass')} pass · ${n('warn')} pass with a warning · ${n('skip')} skipped · ${failed.length} failed · ${fmt(Date.now() - t0)} → ${path.relative(ROOT, out)}`);
process.exit(failed.length ? 1 : 0);
