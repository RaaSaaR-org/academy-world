#!/usr/bin/env node
// Screenshot the hub and every zone folder in src/zones/ (one server, one browser).
//
//   node tools/shots-all.mjs [--out artifacts/shots] [--base http://localhost:5173] [--dev] [--wait 3000]
//        [--views "0,0;180,0"] [--rm]
//
// --dev also includes dev-only zones (folders starting with "_").
// --rm (reduced motion, plan §5.10): every page opens with prefers-reduced-motion: reduce (a fresh profile
// takes it as its setting); adds the title and the first second after Start (the glide is a fade under
// reduced motion) and writes to artifacts/shots-rm by default.
// Every area is loaded first (__academy.loadAll), so sites show once they have code.
// Writes <out>/<id>.png (+ .json) and <out>/summary.json, then runs tools/brand-check.mjs (the
// tower sculpture's brand colours from the Messpunkt). Exit 1 if any shot or the brand check failed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, capture, launchBrowser, parseArgs, parseViews, startServer } from './lib/shotlib.mjs';
import { brandCheck } from './brand-check.mjs';

const args = parseArgs(process.argv.slice(2));
const rm = !!args.rm;
const outDir = path.resolve(ROOT, String(args.out ?? (rm ? 'artifacts/shots-rm' : 'artifacts/shots')));
const zonesDir = path.join(ROOT, 'src', 'zones');
const ids = fs
  .readdirSync(zonesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(zonesDir, d.name, 'index.ts')))
  .map((d) => d.name)
  .filter((id) => args.dev || !id.startsWith('_'))
  .sort();

let server = null;
let browser = null;
const summary = [];
let failed = 0;
try {
  const base = args.base ? String(args.base).replace(/\/$/, '') : (server = await startServer()).url;
  browser = await launchBrowser();
  const targets = [{ id: 'hub', url: `${base}/?skipIntro=1${args.dev ? '&dev=1' : ''}` }, ...ids.map((id) => ({ id, url: `${base}/?zone=${encodeURIComponent(id)}&skipIntro=1${args.dev ? '&dev=1' : ''}` }))];
  // reduced motion: the title and the start (the glide fades under reduced motion)
  if (rm) targets.unshift({ id: 'title', url: `${base}/?reset=1`, wait: 1500 }, { id: 'start', url: `${base}/?reset=1`, evals: ['window.__academy.start()'], wait: 1000 });
  for (const t of targets) {
    const out = path.join(outDir, `${t.id}.png`);
    const r = await capture(browser, { url: t.url, out, wait: Number(t.wait ?? args.wait ?? 3000), views: t.evals ? [null] : parseViews(args.views), evals: t.evals ?? [], reducedMotion: rm, dumps: rm ? ['window.__academy.game.settings.data.reducedMotion'] : [] });
    if (rm && r.dumps?.[0]?.value !== true) r.pageErrors.push('[shots-all] reduced motion did not take (settings.data.reducedMotion is not true)');
    r.ok = r.ok && r.consoleErrors.length === 0;
    fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(r, null, 2));
    summary.push({ id: t.id, ok: r.ok, fps: r.fps, files: r.files.map((f) => path.relative(ROOT, f)), pageErrors: r.pageErrors.length, consoleErrors: r.consoleErrors.length, zoneErrors: r.zoneErrors });
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${t.id.padEnd(22)} fps ${String(r.fps).padEnd(6)} ${r.files.map((f) => path.relative(ROOT, f)).join(', ')}`);
    for (const e of [...r.pageErrors, ...r.consoleErrors].slice(0, 5)) console.log(`       ${e.split('\n')[0]}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  // brand check (ART-V2 §2.6): the sculpture from the Messpunkt lands on #141414 / #FF6700, no halo
  const bc = await brandCheck(browser, base, outDir);
  console.log(`${bc.ok ? 'OK  ' : 'FAIL'} brand-check            ${bc.skipped ? 'skipped (no tower hooks)' : bc.rows.filter((r) => !r.pass).map((r) => r.name).join(', ') || 'all samples in tolerance'}`);
  if (!bc.ok) failed++;
  summary.push({ id: 'brand-check', ok: bc.ok, rows: bc.rows, notes: bc.notes });
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
} catch (err) {
  console.error('[shots-all] failed:', err);
  failed++;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
