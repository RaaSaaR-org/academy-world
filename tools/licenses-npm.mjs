#!/usr/bin/env node
// Copy the licence texts of the game's shipped npm packages into LICENSES/npm/ (verbatim, with a
// one-line source header): the runtime dependencies of package.json and their own dependencies,
// plus meshoptimizer, whose decoder three.js bundles in examples/jsm/libs/ (used by the robots).
//
//   node tools/licenses-npm.mjs           write / refresh LICENSES/npm/
//   node tools/licenses-npm.mjs --check   exit 1 when a file is missing or out of date
//
// `npm run build` (tools/notices-plugin.mjs) warns when it bundles a package that has no file here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'LICENSES', 'npm');
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
const check = process.argv.includes('--check');

export const fileFor = (name) => name.replace('/', '__') + '.txt';

function pkgDir(name) {
  for (const base of [path.join(ROOT, 'node_modules'), path.join(ROOT, 'tools', 'robots', 'node_modules')]) {
    const d = path.join(base, name);
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
  }
  return null;
}

const seen = new Map();
const visit = (name) => {
  if (seen.has(name)) return;
  const dir = pkgDir(name);
  if (!dir) throw new Error(`package ${name} not installed`);
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  seen.set(name, { dir, pj });
  for (const dep of Object.keys(pj.dependencies ?? {})) visit(dep);
};
const root = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const dep of Object.keys(root.dependencies ?? {})) visit(dep);
// three.js ships meshoptimizer's decoder (examples/jsm/libs/meshopt_decoder.module.js, MIT)
visit('meshoptimizer');

fs.mkdirSync(OUT, { recursive: true });
let stale = 0;
for (const [name, { dir, pj }] of [...seen].sort()) {
  const lic = fs.readdirSync(dir).find((f) => LICENSE_FILE.test(f));
  if (!lic) throw new Error(`${name}: no licence file in the package (package.json says ${JSON.stringify(pj.license)})`);
  const text = `${name} ${pj.version} — ${typeof pj.license === 'string' ? pj.license : ''}${name === 'meshoptimizer' ? ' (its decoder is bundled inside three: examples/jsm/libs/meshopt_decoder.module.js)' : ''}\n\n` + fs.readFileSync(path.join(dir, lic), 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
  const file = path.join(OUT, fileFor(name));
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === text) continue;
  stale++;
  if (check) console.error(`${path.relative(ROOT, file)}: ${current === null ? 'missing' : 'out of date'}`);
  else fs.writeFileSync(file, text);
}
console.log(`${seen.size} packages${check ? (stale ? `, ${stale} missing or out of date` : ', all up to date') : stale ? `, ${stale} written` : ', unchanged'} → ${path.relative(ROOT, OUT)}/`);
process.exit(check && stale ? 1 : 0);
