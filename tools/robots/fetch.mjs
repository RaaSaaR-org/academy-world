#!/usr/bin/env node
// Fetch the pinned robot sources (repos.mjs) into the git-ignored cache artifacts/robots-src/.
//
//   node tools/robots/fetch.mjs [repoKey ...] [--reuse <dir>] [--no-reuse] [--verify]
//
// Downloads are untrusted data. The checkout is a sparse, blob-less git fetch of exactly the pinned
// commit, with hooks, symlinks, LFS and other filters off; nothing inside it is ever executed.
// Before fetching, existing research downloads (artifacts/phase7/downloads/*, also those of the
// main checkout when this is a worktree) are reused when their HEAD is the pinned commit: each file
// is copied only if its git blob hash equals the one in the commit's tree. --verify re-hashes a
// cached folder against its record.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPOS } from './repos.mjs';
import { CACHE, ROOT } from './lib/paths.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const reuseDirs = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--reuse') reuseDirs.push(path.resolve(argv[++i]));
const keys = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--reuse');

const SAFE = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.symlinks=false', '-c', 'core.fsmonitor=false', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false', '-c', 'protocol.file.allow=never', '-c', 'advice.detachedHead=false'];
const git = (cwd, args, o = {}) => execFileSync('git', [...SAFE, ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' }, ...o });

export const destOf = (key) => path.join(CACHE, `${key}@${REPOS[key].commit.slice(0, 7)}`);
const recordOf = (dest) => path.join(dest, '.emai-fetch.json');

/** Candidate research downloads: folders with a .git (directly or in ./repo). */
function candidates() {
  const dirs = [...reuseDirs];
  if (!flag('--no-reuse')) {
    dirs.push(path.join(ROOT, 'artifacts', 'phase7', 'downloads'));
    try {
      const common = git(ROOT, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
      dirs.push(path.join(path.dirname(common), 'artifacts', 'phase7', 'downloads'));
    } catch {
      /* not a git checkout */
    }
  }
  const out = new Set();
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      for (const sub of [path.join(d, e.name), path.join(d, e.name, 'repo')]) if (fs.existsSync(path.join(sub, '.git'))) out.add(sub);
    }
  }
  return [...out];
}

/** Expected files of the pinned commit under the wanted paths: [{ mode, sha, file }]. */
function expectedFiles(repoDir, commit, paths) {
  const out = git(repoDir, ['ls-tree', '-r', commit, '--', ...paths]);
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [meta, file] = l.split('\t');
      const [mode, type, sha] = meta.split(' ');
      return { mode, type, sha, file };
    })
    .filter((f) => f.type === 'blob');
}

function tryReuse(key, dest) {
  const r = REPOS[key];
  for (const cand of candidates()) {
    let head;
    try {
      head = git(cand, ['rev-parse', 'HEAD']).trim();
    } catch {
      continue;
    }
    if (head !== r.commit) continue;
    let want;
    try {
      want = expectedFiles(cand, r.commit, r.paths);
    } catch {
      continue;
    }
    if (!want.length) continue;
    const files = want.filter((f) => f.mode !== '120000'); // symlinks are never copied
    const present = files.every((f) => {
      const st = fs.lstatSync(path.join(cand, f.file), { throwIfNoEntry: false });
      return st && st.isFile();
    });
    if (!present) continue;
    const hashes = git(cand, ['hash-object', '--no-filters', '--stdin-paths'], { input: files.map((f) => f.file).join('\n') + '\n' })
      .trim()
      .split('\n');
    const bad = files.filter((f, i) => hashes[i] !== f.sha);
    if (bad.length) {
      console.warn(`[fetch] ${key}: ${cand} has ${bad.length} files that differ from ${r.commit.slice(0, 7)}; not reused`);
      continue;
    }
    fs.rmSync(dest, { recursive: true, force: true });
    for (const f of files) {
      const to = path.join(dest, f.file);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(cand, f.file), to);
    }
    writeRecord(dest, key, files, `reused from ${path.relative(ROOT, cand) || cand}`);
    return files.length;
  }
  return 0;
}

function freshFetch(key, dest) {
  const r = REPOS[key];
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  git(dest, ['init', '-q']);
  git(dest, ['remote', 'add', 'origin', r.url]);
  // a bare path pattern without a trailing slash matches the file; folders need the trailing slash
  git(dest, ['sparse-checkout', 'set', '--no-cone', ...r.paths.flatMap((p) => ['/' + p, '/' + p + '/'])]);
  git(dest, ['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', r.commit], { stdio: ['ignore', 'pipe', 'inherit'] });
  git(dest, ['checkout', '-q', r.commit], { stdio: ['ignore', 'pipe', 'inherit'] });
  const head = git(dest, ['rev-parse', 'HEAD']).trim();
  if (head !== r.commit) throw new Error(`${key}: HEAD ${head} is not the pinned ${r.commit}`);
  const files = expectedFiles(dest, r.commit, r.paths).filter((f) => f.mode !== '120000');
  for (const f of files) {
    const st = fs.lstatSync(path.join(dest, f.file), { throwIfNoEntry: false });
    if (!st || !st.isFile()) throw new Error(`${key}: ${f.file} missing after checkout`);
    const head4 = fs.readFileSync(path.join(dest, f.file)).subarray(0, 40).toString('latin1');
    if (head4.startsWith('version https://git-lfs')) throw new Error(`${key}: ${f.file} is a Git LFS pointer (not supported)`);
  }
  writeRecord(dest, key, files, `fetched from ${r.url}`);
  return files.length;
}

function writeRecord(dest, key, files, how) {
  const r = REPOS[key];
  fs.writeFileSync(recordOf(dest), JSON.stringify({ key, url: r.url, commit: r.commit, paths: r.paths, how, at: new Date().toISOString(), files: files.map((f) => [f.file, f.sha]) }, null, 1));
}

/** Re-hash every file of a cached folder against its record (git blob ids, computed in JS). */
async function verify(dest) {
  const { createHash } = await import('node:crypto');
  const rec = JSON.parse(fs.readFileSync(recordOf(dest), 'utf8'));
  let bad = 0;
  for (const [file, sha] of rec.files) {
    const p = path.join(dest, file);
    const buf = fs.existsSync(p) ? fs.readFileSync(p) : null;
    const got = buf ? createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex') : null;
    if (got !== sha) {
      bad++;
      console.warn(`[fetch] ${rec.key}: ${file} does not match ${sha.slice(0, 10)}`);
    }
  }
  return bad;
}

const wanted = keys.length ? keys : Object.keys(REPOS);
fs.mkdirSync(CACHE, { recursive: true });
let failed = 0;
for (const key of wanted) {
  const r = REPOS[key];
  if (!r) {
    console.error(`unknown repo key: ${key}`);
    failed++;
    continue;
  }
  const dest = destOf(key);
  const rec = fs.existsSync(recordOf(dest)) ? JSON.parse(fs.readFileSync(recordOf(dest), 'utf8')) : null;
  if (rec && rec.commit === r.commit && JSON.stringify(rec.paths) === JSON.stringify(r.paths)) {
    const bad = flag('--verify') ? await verify(dest) : 0;
    console.log(`${key}: cached (${rec.files.length} files, ${rec.how})${flag('--verify') ? `, verify: ${bad ? bad + ' bad' : 'ok'}` : ''}`);
    if (bad) failed++;
    continue;
  }
  try {
    const t0 = Date.now();
    let n = tryReuse(key, dest);
    const how = n ? 'reused' : 'fetched';
    if (!n) n = freshFetch(key, dest);
    console.log(`${key}: ${how} ${n} files @ ${r.commit.slice(0, 7)} in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${path.relative(ROOT, dest)}`);
  } catch (err) {
    failed++;
    console.error(`${key}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
