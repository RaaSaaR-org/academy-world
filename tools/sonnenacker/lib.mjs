// Shared by the Sonnenacker tools (WP9): load the zone's pure models (src/zones/sonnenacker/model.ts and
// tuning.ts) with Node's type stripping. The zone's imports are extensionless (Vite), so a resolve hook
// lets Node find the .ts files; nothing else from src/ is loaded.
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  register(
    'data:text/javascript,' +
      encodeURIComponent(`export async function resolve(s, c, next) {
  if ((s.startsWith('./') || s.startsWith('../')) && !/\\.[cm]?[jt]s$/.test(s)) { try { return await next(s + '.ts', c); } catch {} }
  return next(s, c);
}`),
  );
}

/** { M: model.ts, T: tuning.ts } */
export async function loadFarm() {
  hook();
  const dir = path.join(ROOT, 'src', 'zones', 'sonnenacker');
  const [M, T] = await Promise.all([import(pathToFileURL(path.join(dir, 'model.ts')).href), import(pathToFileURL(path.join(dir, 'tuning.ts')).href)]);
  return { M, T };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) out[k] = true;
    else {
      out[k] = v;
      i++;
    }
  }
  return out;
}
