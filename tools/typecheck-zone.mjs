#!/usr/bin/env node
// Type-check the engine + ONE zone (other zones are excluded), so a half-written zone of
// another agent never blocks you.
//
//   node tools/typecheck-zone.mjs <zone-id>      (npm run typecheck:zone -- <zone-id>)
//
// Exit code = tsc exit code.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/shotlib.mjs';

const id = process.argv[2];
if (!id || !/^[\w-]+$/.test(id)) {
  console.error('usage: node tools/typecheck-zone.mjs <zone-id>');
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, 'src', 'zones', id))) {
  console.error(`no folder src/zones/${id}`);
  process.exit(2);
}
const cfg = path.join(ROOT, `tsconfig.zone-${id}-${process.pid}.tmp.json`);
const include = fs
  .readdirSync(path.join(ROOT, 'src'), { withFileTypes: true })
  .filter((d) => d.name !== 'zones')
  .map((d) => (d.isDirectory() ? `src/${d.name}` : `src/${d.name}`));
include.push(`src/zones/${id}`);
fs.writeFileSync(cfg, JSON.stringify({ extends: './tsconfig.json', include }, null, 2));
try {
  const tsc = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  const r = spawnSync(tsc, ['--noEmit', '-p', cfg], { cwd: ROOT, stdio: 'inherit' });
  if (r.status === 0) console.log(`typecheck OK: engine + src/zones/${id}`);
  process.exitCode = r.status ?? 1;
} finally {
  fs.rmSync(cfg, { force: true });
}
