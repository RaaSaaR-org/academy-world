#!/usr/bin/env node
// Reference build of a tag (docs/PHASE7-PLAN.md §5.10): the A/B partner of gpu-ab, perf-cpu and the
// load tools. Builds <ref> in a local detached worktree (no remote, no fetch) into artifacts/dist/<ref>.
//
//   node tools/dist-ref.mjs [rc4] [--out <dir>] [--force] [--keep-src]
//
// 1. `git worktree add --detach artifacts/dist/.src-<ref> <ref>` (the tag is only read);
// 2. node_modules: a symlink to this checkout's when <ref>'s package-lock.json is identical (rc4 and
//    phase7 share it), else the tool stops and says so (nothing is installed);
// 3. `vite build --outDir artifacts/dist/<ref>` inside the worktree (the reference's own vite.config.ts
//    and plugins; no typecheck), then artifacts/dist/<ref>/.dist-ref.json { ref, commit, builtAt };
// 4. the worktree is removed again (--keep-src keeps it).
// An existing build of the same commit is kept unless --force. Exit 1 when the build fails.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, parseArgs } from './lib/shotlib.mjs';

const args = parseArgs(process.argv.slice(2));
const ref = String(args._[0] ?? 'rc4');
if (!/^[\w./-]+$/.test(ref)) {
  console.error(`dist-ref: refusing the ref name ${JSON.stringify(ref)}`);
  process.exit(2);
}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let commit;
try {
  commit = git('rev-parse', '--verify', `${ref}^{commit}`);
} catch {
  console.error(`dist-ref: ${ref} is not a commit in this repository (local tags and branches only)`);
  process.exit(2);
}
const safe = ref.replace(/[^\w.-]+/g, '_');
const out = path.resolve(ROOT, String(args.out && args.out !== true ? args.out : path.join('artifacts', 'dist', safe)));
const stamp = path.join(out, '.dist-ref.json');
if (!args.force && fs.existsSync(path.join(out, 'index.html')) && fs.existsSync(stamp)) {
  const s = JSON.parse(fs.readFileSync(stamp, 'utf8'));
  if (s.commit === commit) {
    console.log(`dist-ref: ${path.relative(ROOT, out)} already holds ${ref} (${commit.slice(0, 7)}, built ${s.builtAt}); --force rebuilds`);
    process.exit(0);
  }
}
const src = path.join(ROOT, 'artifacts', 'dist', `.src-${safe}`);
const removeWorktree = () => {
  try {
    git('worktree', 'remove', '--force', src);
  } catch {
    fs.rmSync(src, { recursive: true, force: true });
    try {
      git('worktree', 'prune');
    } catch {
      /* nothing to prune */
    }
  }
};
if (fs.existsSync(src)) removeWorktree();
fs.mkdirSync(path.dirname(src), { recursive: true });
const t0 = Date.now();
console.log(`dist-ref: ${ref} = ${commit.slice(0, 7)} → worktree ${path.relative(ROOT, src)}`);
git('worktree', 'add', '--detach', src, commit);
let code = 1;
try {
  const lockHere = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
  const lockThere = fs.existsSync(path.join(src, 'package-lock.json')) ? fs.readFileSync(path.join(src, 'package-lock.json'), 'utf8') : null;
  // this checkout's node_modules serves the reference when every package the reference locks is locked
  // here at the same version (a later wave may add packages, e.g. @mujoco/mujoco in wave 1)
  const subset = (() => {
    if (lockThere == null) return false;
    if (lockThere === lockHere) return true;
    try {
      const here = JSON.parse(lockHere).packages ?? {};
      const there = JSON.parse(lockThere).packages ?? {};
      return Object.entries(there).every(([k, v]) => k === '' || (here[k] && here[k].version === v.version && (here[k].integrity ?? '') === (v.integrity ?? '')));
    } catch {
      return false;
    }
  })();
  if (!subset) {
    console.error(`dist-ref: ${ref}'s package-lock.json locks packages this checkout does not have at the same version: install its dependencies yourself (npm ci in ${path.relative(ROOT, src)} with --keep-src), the tool installs nothing`);
    if (!args['keep-src']) removeWorktree();
    process.exit(1);
  }
  if (lockThere !== lockHere) console.log(`dist-ref: ${ref}'s lockfile is a subset of this checkout's (same versions): using this node_modules`);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(src, 'node_modules'), 'dir');
  fs.rmSync(out, { recursive: true, force: true });
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const r = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], { cwd: src, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
  code = r.status ?? 1;
  if (code === 0) {
    if (!fs.existsSync(path.join(out, 'index.html'))) {
      console.error('dist-ref: the build wrote no index.html');
      code = 1;
    } else fs.writeFileSync(stamp, JSON.stringify({ ref, commit, builtAt: new Date().toISOString() }, null, 1));
  }
} finally {
  if (!args['keep-src']) removeWorktree();
}
console.log(code === 0 ? `OK   dist-ref: ${ref} built into ${path.relative(ROOT, out)} in ${((Date.now() - t0) / 1000).toFixed(0)} s` : `FAIL dist-ref: the ${ref} build failed`);
process.exit(code);
