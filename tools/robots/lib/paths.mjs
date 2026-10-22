// Folders of the robot build and the confinement rule for every path read from a download.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(TOOL, '..', '..');
/** Pinned source checkouts (git-ignored, see fetch.mjs). ROBOTS_SRC overrides. */
export const CACHE = path.resolve(process.env.ROBOTS_SRC ?? path.join(ROOT, 'artifacts', 'robots-src'));
/** Shipped outputs. */
export const OUT_GLB = path.join(ROOT, 'src', 'robots');
export const OUT_LICENSES = path.join(ROOT, 'LICENSES');
/** Scratch outputs (reports, reference data): git-ignored. */
export const SCRATCH = path.join(ROOT, 'artifacts', 'phase7', 'robots');

/** Throw unless `p` lies inside `root` (downloads must never make the build read elsewhere). */
export function confine(root, p) {
  const r = path.resolve(root);
  const a = path.resolve(p);
  if (a !== r && !a.startsWith(r + path.sep)) throw new Error(`path leaves the source checkout: ${p}`);
  const st = fs.lstatSync(a, { throwIfNoEntry: false });
  if (st && st.isSymbolicLink()) throw new Error(`refusing a symbolic link inside a download: ${p}`);
  return a;
}

const pkgCache = new Map();
/** $(find pkg) / package://pkg: the folder named `pkg` inside the checkout (prefers one with package.xml). */
export function findPackage(root, pkg) {
  const key = root + '|' + pkg;
  if (pkgCache.has(key)) return pkgCache.get(key);
  const hits = [];
  // a folder is the package when it is named so, or when its package.xml says <name>pkg</name>
  const declares = (dir) => {
    const f = path.join(dir, 'package.xml');
    if (!fs.existsSync(f)) return false;
    const m = /<name>\s*([^<\s]+)\s*<\/name>/.exec(fs.readFileSync(f, 'utf8'));
    return !!m && m[1] === pkg;
  };
  const walk = (dir, depth) => {
    if (depth > 5) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.name === pkg || declares(p)) hits.push(p);
      walk(p, depth + 1);
    }
  };
  if (path.basename(root) === pkg || declares(root)) hits.push(root);
  walk(root, 0);
  hits.sort((a, b) => Number(fs.existsSync(path.join(b, 'package.xml'))) - Number(fs.existsSync(path.join(a, 'package.xml'))) || a.length - b.length);
  if (!hits.length) throw new Error(`package "${pkg}" not found under ${root}`);
  pkgCache.set(key, hits[0]);
  return hits[0];
}

/** URDF mesh filename → absolute path inside the checkout (package://, package:///, relative). */
export function resolveMeshPath(root, baseDir, filename) {
  let f = String(filename).trim();
  const m = /^package:\/\/([^/]*)\/(.*)$/.exec(f);
  if (m) {
    if (m[1]) return confine(root, path.join(findPackage(root, m[1]), m[2]));
    f = m[2];
  }
  if (/^file:\/\//.test(f)) throw new Error(`file:// mesh paths are not allowed: ${f}`);
  return confine(root, path.resolve(baseDir, f));
}
