// Load a robot description named in sources.mjs: URDF, xacro (expanded first) or MJCF.
import fs from 'node:fs';
import path from 'node:path';
import { readXml, toXml } from './xml.mjs';
import { readUrdf } from './urdf.mjs';
import { expandXacro, isXacro } from './xacro.mjs';
import { readMjcf, menagerieVisual } from './mjcf.mjs';
import { CACHE, SCRATCH, confine } from './paths.mjs';
import { REPOS } from '../repos.mjs';

export const sourceRoot = (repo) => path.join(CACHE, `${repo}@${REPOS[repo].commit.slice(0, 7)}`);

/**
 * @returns {{ desc: object, root: string, file: string, urdfForFk: string | null }}
 * urdfForFk: the URDF the independent FK reference reads (the expanded xacro is written to scratch)
 */
export function loadDescription(cfg) {
  const root = sourceRoot(cfg.repo);
  if (!fs.existsSync(root)) throw new Error(`${cfg.id}: source ${cfg.repo} missing; run node tools/robots/fetch.mjs`);
  const file = confine(root, path.join(root, cfg.entry));
  if (cfg.format === 'mjcf') {
    const desc = readMjcf(file, { root, visual: cfg.visual ?? menagerieVisual });
    return { desc, root, file, fkSource: { kind: 'mjcf', file } };
  }
  let robotEl;
  let fkFile = file;
  if (isXacro(file)) {
    robotEl = expandXacro(file, { root, args: cfg.xacroArgs ?? {} });
    fs.mkdirSync(SCRATCH, { recursive: true });
    fkFile = path.join(SCRATCH, `${cfg.id}.expanded.urdf`);
    fs.writeFileSync(fkFile, toXml(robotEl) + '\n');
  } else robotEl = readXml(file);
  const desc = readUrdf(robotEl, { root, file });
  return { desc, root, file, fkSource: { kind: 'urdf', file: fkFile } };
}
