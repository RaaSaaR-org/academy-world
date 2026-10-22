#!/usr/bin/env node
// Build the robot GLBs, the typed manifest, the credits data and the licence files.
//
//   node tools/robots/build.mjs [robotId ...]      (default: every robot in sources.mjs)
//   node tools/robots/build.mjs --records           (convert nothing: rewrite the line-ups, manifest.ts,
//                                                    credits.ts and LICENSES/robots/ from the build records)
//
// Inputs: the pinned checkouts in artifacts/robots-src/ (node tools/robots/fetch.mjs first).
// Outputs (committed): src/robots/glb/<id>.glb (+ .l2.glb), the line-ups lineup.l2.glb (every hall
// robot) and lineup-noamber.l2.glb (without the amber models), src/robots/manifest.ts,
// src/robots/credits.ts, LICENSES/robots/*. Scratch: artifacts/phase7/robots/build/<id>.json.
// Building a subset keeps the other robots' manifest rows (read back from their build records).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { ROBOTS, LICENSE_TEXTS, CAPS, EXCEPTIONS } from './sources.mjs';
import { REPOS } from './repos.mjs';
import { convertRobot, robotDocument, silhouetteDocument, MOVABLE } from './lib/robot.mjs';
import { buildBase, sloppyTo, withNormals } from './lib/geometry.mjs';
import { sourceRoot } from './lib/load.mjs';
import { ROOT, OUT_GLB, OUT_LICENSES, SCRATCH, confine } from './lib/paths.mjs';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([KHRMeshQuantization, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const GLB_DIR = path.join(OUT_GLB, 'glb');
const REC_DIR = path.join(SCRATCH, 'build');
fs.mkdirSync(GLB_DIR, { recursive: true });
fs.mkdirSync(REC_DIR, { recursive: true });

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const unknown = want.filter((w) => !ROBOTS.some((r) => r.id === w));
if (unknown.length) throw new Error(`unknown robot id(s): ${unknown.join(', ')}`);

export function sizes(buf) {
  return {
    raw: buf.length,
    gzip: zlib.gzipSync(buf, { level: 9 }).length,
    br: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length,
  };
}

const q = (v) => JSON.stringify(v);
const repoUrl = (cfg) => cfg.sourceUrl ?? `${REPOS[cfg.repo].url}/tree/${REPOS[cfg.repo].commit}`;

function metaFor(cfg, r, variant) {
  return {
    copyright: `${cfg.attribution.en} Source: ${REPOS[cfg.repo].url} @ ${REPOS[cfg.repo].commit.slice(0, 7)}. ${cfg.license.copyright.join('; ')}.`,
    extras: {
      format: 'emai-robot/1',
      id: cfg.id,
      variant,
      name: cfg.name,
      vendor: cfg.vendor,
      source: { repo: REPOS[cfg.repo].url, commit: REPOS[cfg.repo].commit, path: cfg.entry, format: cfg.format },
      license: { spdx: cfg.license.spdx, copyright: cfg.license.copyright, files: cfg.license.texts.map((t) => `licenses/robots/${t}`) },
      attribution: cfg.attribution,
      ...(variant === 'skinned'
        ? {
            rootTransform: r.rootTransform,
            bodies: r.bodyNames,
            joints: r.joints,
            defaultPose: r.defaultPose,
            poses: r.poses,
            bounds: r.bounds,
            lod: {
              lod0: { tris: r.stats.lod0Tris, errorM: r.stats.lod0ErrorM },
              lod1: { tris: r.stats.lod1Tris, errorM: r.stats.lod1ErrorM },
              ...(r.stats.lod2Tris ? { lod2: { tris: r.stats.lod2Tris, errorM: r.stats.lod2ErrorM } } : {}),
              switchM: r.switchM,
            },
            inertials: r.inertials,
            ...(cfg.mounts ? { mounts: cfg.mounts } : {}),
            ik: cfg.ik ?? [],
          }
        : { lod: { silhouette: { tris: r.stats.l2Tris, errorM: r.stats.l2ErrorM } } }),
    },
  };
}

/** The file cap of a robot (KB brotli, plan §5.6). */
export function capKB(cfg) {
  if (cfg.maxKB) return cfg.maxKB;
  if (EXCEPTIONS[cfg.id]?.fileKB) return EXCEPTIONS[cfg.id].fileKB;
  if (cfg.set === 'exhibit') return cfg.category === 'humanoid' ? CAPS.humanoidExhibitKB : CAPS.exhibitKB;
  return CAPS.fileKB;
}

async function buildFiles(cfg) {
  const r = await convertRobot(cfg);
  const glb = Buffer.from(await io.writeBinary(robotDocument(r, metaFor(cfg, r, 'skinned'))));
  const l2 = Buffer.from(await io.writeBinary(silhouetteDocument(r, metaFor(cfg, r, 'silhouette'))));
  // LOD1's share of the file: the same document without the LOD1 primitive
  const only0 = robotDocument(r, metaFor(cfg, r, 'skinned'));
  for (const n of only0.getRoot().listNodes()) if (n.getName() === `${cfg.id}__lod1`) n.dispose();
  for (const m of only0.getRoot().listMeshes()) {
    if (m.getName() !== `${cfg.id}__lod1`) continue;
    for (const p of m.listPrimitives()) p.getIndices()?.dispose();
    m.dispose();
  }
  const glb0 = Buffer.from(await io.writeBinary(only0));
  return { r, glb, l2, s: sizes(glb), sl2: sizes(l2), s0: sizes(glb0) };
}

const results = [];
// --raw: no simplification (reference look for debugging; never commit such a build)
const RAW = process.argv.includes('--raw');
const RECORDS_ONLY = process.argv.includes('--records');
for (const cfg0 of ROBOTS) {
  if (RECORDS_ONLY || (want.length && !want.includes(cfg0.id))) continue;
  let cfg = RAW ? { ...cfg0, lod: { ...cfg0.lod, lod0: Infinity, lod1: Infinity, minErr: 0 } } : cfg0;
  // caps: lower the triangle targets until the file (and the silhouette) fit (≤ 6 rounds)
  let b = await buildFiles(cfg);
  const cap = capKB(cfg) * 1024;
  const capL2 = CAPS.silhouetteKB * 1024;
  for (let round = 0; !RAW && round < 6 && (b.s.br > cap || b.sl2.br > capL2); round++) {
    const f = Math.min(1, (cap / b.s.br) * 0.96);
    const f2 = Math.min(1, (capL2 / b.sl2.br) * 0.95);
    cfg = {
      ...cfg,
      lod: {
        ...cfg.lod,
        lod0: Math.round(Math.min(cfg.lod.lod0, b.r.stats.lod0Tris) * f),
        lod1: Math.round(Math.min(cfg.lod.lod1, b.r.stats.lod1Tris) * f),
        l2: Math.round(Math.min(cfg.lod.l2 ?? 3000, b.r.stats.l2Tris) * f2),
      },
    };
    console.log(`  ${cfg.id}: ${(b.s.br / 1024).toFixed(0)} KB / silhouette ${(b.sl2.br / 1024).toFixed(1)} KB over the cap → targets ${cfg.lod.lod0} / ${cfg.lod.lod1} / ${cfg.lod.l2}`);
    b = await buildFiles(cfg);
  }
  const { r, glb, l2, s, sl2, s0 } = b;
  fs.writeFileSync(path.join(GLB_DIR, `${cfg.id}.glb`), glb);
  fs.writeFileSync(path.join(GLB_DIR, `${cfg.id}.l2.glb`), l2);
  const record = {
    id: cfg.id,
    set: cfg.set,
    builtAt: new Date().toISOString(),
    source: { repo: cfg.repo, url: REPOS[cfg.repo].url, commit: REPOS[cfg.repo].commit, entry: cfg.entry, format: cfg.format },
    fk: r.fkSource,
    rootTransform: r.rootTransform,
    rootLink: r.tree.root,
    links: r.tree.order.map((l) => ({ name: l, body: r.tree.body.get(l), frame: !!r.desc.links.get(l)?.frameOnly, site: !!r.desc.links.get(l)?.site })),
    joints: r.joints,
    movable: r.movable,
    defaultPose: r.defaultPose,
    inertials: r.inertials,
    stats: r.stats,
    targets: { lod0: cfg.lod.lod0, lod1: cfg.lod.lod1, lod2: cfg.lod.lod2 ?? null, l2: cfg.lod.l2 ?? 3000 },
    capKB: capKB(cfg),
    switchM: r.switchM,
    bounds: r.bounds,
    bytes: { glb: s, lod0Only: s0, lod1Br: s.br - s0.br, silhouette: sl2 },
    report: { visuals: r.report.visuals, excluded: r.report.excluded, rejected: r.report.rejected, colors: [...r.report.colors], textures: [...r.report.textures], meshFiles: r.report.files.size },
    ms: r.ms,
  };
  fs.writeFileSync(path.join(REC_DIR, `${cfg.id}.json`), JSON.stringify(record, null, 1));
  // the default-pose silhouette, kept for the line-up file (built from every hall robot at the end)
  fs.writeFileSync(path.join(REC_DIR, `${cfg.id}.l2mesh.json`), JSON.stringify({ pos: Array.from(r.l2.pos, (x) => +x.toFixed(5)), col: Array.from(r.l2.col, (x) => +x.toFixed(4)), index: Array.from(r.l2.index) }));
  results.push(record);
  console.log(
    `${cfg.id.padEnd(20)} tris ${r.stats.sourceTris} → ${r.stats.lod0Tris} / ${r.stats.lod1Tris}${r.stats.lod2Tris ? ' / ' + r.stats.lod2Tris : ''} / ${r.stats.l2Tris}  err ${(r.stats.lod0ErrorM * 1000).toFixed(2)} / ${(r.stats.lod1ErrorM * 1000).toFixed(2)} mm  ` +
      `${(s.br / 1024).toFixed(0)} KB br (cap ${capKB(cfg)}; lod1 ${((s.br - s0.br) / 1024).toFixed(0)}), l2 ${(sl2.br / 1024).toFixed(1)} KB  h ${r.bounds.heightM} m  ${r.bodyNames.length} bodies  ${r.ms} ms` +
      (r.report.rejected.length ? `  REJECTED ${r.report.rejected.length}` : '') +
      (r.report.excluded.length ? `  excluded ${r.report.excluded.length}` : ''),
  );
}

// ── every robot's record (built now or earlier) → manifest, credits, licences ──
const records = new Map();
for (const cfg of ROBOTS) {
  const f = path.join(REC_DIR, `${cfg.id}.json`);
  if (fs.existsSync(f)) records.set(cfg.id, JSON.parse(fs.readFileSync(f, 'utf8')));
}
const missing = ROBOTS.filter((c) => !records.has(c.id)).map((c) => c.id);
if (missing.length) console.warn(`[build] no build record yet for: ${missing.join(', ')} (left out of the manifest)`);
const built = ROBOTS.filter((c) => records.has(c.id));

writeLicenses(built);
const lineup = await writeLineup(built.filter((c) => c.lineup), records);
// the public build's line-up (VITE_AMBER unset, src/core/release.ts): the same wall without the amber
// models (docs/LEGAL-REVIEW.md item 2), so their geometry is not shipped inside the merged mesh either
const lineupNoAmber = await writeLineup(built.filter((c) => c.lineup && !c.flags.amber), records, 'lineup-noamber');
writeManifest(built, records, { all: lineup, noAmber: lineupNoAmber });
writeCredits(built, records);

// ── line-up (R6): every hall robot in its default pose, one static mesh at true scale ──

/**
 * src/robots/glb/<name>.l2.glb: the hall robots sorted by height along +x (0.25 m apart, floor
 * y = 0, fronts to +z, centred on z = 0), each clustered from its silhouette to a share of the
 * triangle budget; the budget shrinks until the file is ≤ CAPS.lineupKB.
 */
async function writeLineup(list, recs, name = 'lineup') {
  const items = list
    .filter((c) => fs.existsSync(path.join(REC_DIR, `${c.id}.l2mesh.json`)))
    .map((c) => ({ c, rec: recs.get(c.id), mesh: JSON.parse(fs.readFileSync(path.join(REC_DIR, `${c.id}.l2mesh.json`), 'utf8')) }))
    .sort((a, b) => a.rec.bounds.heightM - b.rec.bounds.heightM || a.c.id.localeCompare(b.c.id));
  if (!items.length) return null;
  const GAP = 0.25;
  let perRobot = 1100;
  let out = null;
  for (let round = 0; round < 8; round++) {
    const soupPos = [];
    const soupCol = [];
    const entries = [];
    let x = 0;
    for (const { c, rec, mesh } of items) {
      const a = rec.bounds.defaultAabb;
      const dx = x - a.min[0];
      const dz = -(a.min[2] + a.max[2]) / 2;
      // the robot's own clustering, to its share of the budget (taller robots get more)
      const want = Math.max(150, Math.round(perRobot * Math.sqrt(Math.max(0.15, rec.bounds.heightM) / 1.2)));
      const base = buildBase(new Float32Array(trisToSoup(mesh.pos, mesh.index)), new Float32Array(trisToSoup(mesh.col, mesh.index)));
      const { index } = sloppyTo(base.vpos, base.index, want);
      for (const v of index) {
        soupPos.push(base.vpos[v * 3] + dx, base.vpos[v * 3 + 1], base.vpos[v * 3 + 2] + dz);
        soupCol.push(base.vcol[v * 3], base.vcol[v * 3 + 1], base.vcol[v * 3 + 2]);
      }
      entries.push({ id: c.id, x: [+(x).toFixed(4), +(x + a.max[0] - a.min[0]).toFixed(4)], heightM: rec.bounds.heightM, tris: index.length / 3 });
      x += a.max[0] - a.min[0] + GAP;
    }
    const base = buildBase(new Float32Array(soupPos), new Float32Array(soupCol));
    const mesh = withNormals(base, base.index, 50);
    const doc = lineupDocument(mesh);
    const glb = Buffer.from(await io.writeBinary(doc));
    const sz = sizes(glb);
    out = { glb, sz, entries, lengthM: +(x - GAP).toFixed(4), tris: mesh.index.length / 3 };
    if (sz.br <= CAPS.lineupKB * 1024) break;
    perRobot = Math.round(perRobot * (CAPS.lineupKB * 1024 / sz.br) * 0.95);
  }
  fs.writeFileSync(path.join(GLB_DIR, `${name}.l2.glb`), out.glb);
  fs.writeFileSync(path.join(REC_DIR, `${name}.json`), JSON.stringify({ entries: out.entries, lengthM: out.lengthM, tris: out.tris, bytes: out.sz }, null, 1));
  console.log(`${`${name}.l2.glb`.padEnd(20)} ${items.length} robots, ${out.tris} tris, ${out.lengthM} m long, ${(out.sz.br / 1024).toFixed(1)} KB br (cap ${CAPS.lineupKB})`);
  return { entries: out.entries, lengthM: out.lengthM, tris: out.tris, bytes: out.sz };
}

function trisToSoup(arr, index) {
  const out = new Array(index.length * 3);
  for (let k = 0; k < index.length; k++) for (let c = 0; c < 3; c++) out[k * 3 + c] = arr[index[k] * 3 + c];
  return out;
}

function lineupDocument(mesh) {
  const fake = { cfg: { id: 'lineup' }, l2: mesh };
  return silhouetteDocument(fake, {
    copyright: 'Robot models: see THIRD-PARTY-NOTICES.txt (licenses/robots/). Converted to glTF and simplified by EmAI.',
    extras: { format: 'emai-robot/1', id: 'lineup', variant: 'lineup' },
  });
}

// ── licences ────────────────────────────────────────────────────────────────

function readLicenseText(spec) {
  const [repo, rel] = spec.split(':');
  const root = sourceRoot(repo);
  return fs.readFileSync(confine(root, path.join(root, rel)), 'utf8');
}

function writeLicenses(list) {
  const dir = path.join(OUT_LICENSES, 'robots');
  fs.mkdirSync(dir, { recursive: true });
  const used = new Set(list.flatMap((c) => [...c.license.texts, ...(c.license.notice ? [c.license.notice] : [])]));
  for (const name of used) {
    const spec = LICENSE_TEXTS[name];
    if (!spec) throw new Error(`licence text ${name} has no source`);
    const [repo, rel] = spec.split(':');
    const head = `Source: ${REPOS[repo].url} @ ${REPOS[repo].commit} — ${rel} (verbatim copy)\n\n`;
    fs.writeFileSync(path.join(dir, name), head + readLicenseText(spec).replace(/\r\n/g, '\n'));
  }
  // remove texts no robot uses any more
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.txt') && f !== 'NOTICES.txt' && !used.has(f)) fs.rmSync(path.join(dir, f));
  // the robots' part of THIRD-PARTY-NOTICES (the build concatenates it with the npm part)
  const lines = [
    'ROBOT MODELS',
    '============',
    '',
    'Every robot in this game is shown with the 3D model its maker or project published. EmAI converted',
    'the models to glTF and simplified them (fewer triangles, hidden internals removed, vendor colours',
    'kept as vertex colours). The makers have neither reviewed nor endorsed this game. All names and',
    'trademarks belong to their owners.',
    '',
  ];
  for (const c of list) {
    lines.push(`* ${c.name.en} (${c.vendor})`);
    lines.push(`  Model: ${REPOS[c.repo].url} @ ${REPOS[c.repo].commit}, ${c.entry}`);
    lines.push(`  Licence: ${c.license.spdx} — ${c.license.texts.map((t) => `licenses/robots/${t}`).join(', ')}`);
    for (const cp of c.license.copyright) lines.push(`  ${cp}`);
    if (c.license.notice) lines.push(`  NOTICE: licenses/robots/${c.license.notice} (reproduced below)`);
    lines.push(`  ${c.attribution.en}`);
    if (c.disclaimer) lines.push(`  ${c.disclaimer.en}`);
    lines.push('');
  }
  for (const name of [...used].sort()) {
    lines.push('-'.repeat(78), `licenses/robots/${name}`, '-'.repeat(78), '', fs.readFileSync(path.join(dir, name), 'utf8').trimEnd(), '');
  }
  fs.writeFileSync(path.join(dir, 'NOTICES.txt'), lines.join('\n') + '\n');
}

// ── manifest.ts ─────────────────────────────────────────────────────────────

function writeManifest(list, recs, lineups) {
  const ids = list.map((c) => c.id);
  const rows = list.map((c) => {
    const r = recs.get(c.id);
    const joints = r.joints
      .filter((j) => MOVABLE.has(j.type))
      .map((j) => {
        const lim = j.limit ?? null;
        const o = { name: j.name, type: j.type, parent: j.parent, child: j.child, lower: lim?.lower ?? null, upper: lim?.upper ?? null };
        if (j.mimic) o.mimic = j.mimic;
        return o;
      });
    const notice = c.license.notice ? readLicenseText(LICENSE_TEXTS[c.license.notice]).trim() : null;
    return `  {
    id: ${q(c.id)},
    name: ${q(c.name)},
    vendor: ${q(c.vendor)},
    category: ${q(c.category)},
    use: ${q(c.use)},
    source: ${q({ url: repoUrl(c), repo: REPOS[c.repo].url, commit: REPOS[c.repo].commit, path: c.entry, format: c.format })},
    license: ${q({ spdx: c.license.spdx, files: c.license.texts.map((t) => `licenses/robots/${t}`), copyright: c.license.copyright })},
    notice: ${q(notice)},
    attribution: ${q(c.attribution)},
    heightM: ${r.bounds.heightM},
    restHeightM: ${r.bounds.restHeightM},
    joints: ${q(joints)},
    defaultPose: ${q(r.defaultPose)},
    demoJoint: ${q(c.demoJoint ?? null)},
    ik: ${q(c.ik ?? [])},
    lod: ${q({ lod0: { tris: r.stats.lod0Tris, errorMm: +(r.stats.lod0ErrorM * 1000).toFixed(3) }, lod1: { tris: r.stats.lod1Tris, errorMm: +(r.stats.lod1ErrorM * 1000).toFixed(3), switchM: r.switchM.lod1 }, lod2: r.stats.lod2Tris ? { tris: r.stats.lod2Tris, errorMm: +(r.stats.lod2ErrorM * 1000).toFixed(3), switchM: r.switchM.lod2 } : null, silhouette: { tris: r.stats.l2Tris, switchM: r.switchM.silhouette } })},
    set: ${q(c.set)},
    inertials: ${q(r.inertials ?? [])},
    mounts: ${q(c.mounts ?? {})},
    bytes: ${q({ glb: r.bytes.glb, lod1Br: r.bytes.lod1Br, silhouette: r.bytes.silhouette })},
    sourceTris: ${r.stats.sourceTris},
    bounds: ${q({ center: r.bounds.sphere.center, radius: r.bounds.sphere.radius })},
    colours: ${q(c.colours ?? '')},
    flags: ${q({ amber: !!c.flags.amber, legalReviewBeforeRelease: !!c.flags.legalReviewBeforeRelease, noLogoElsewhere: !!c.flags.noLogoElsewhere })},
    legalNote: ${q(c.legalNote ?? null)},
    glb: () => import('./glb/${c.id}.glb?url'),
    silhouette: () => import('./glb/${c.id}.l2.glb?url'),
  },`;
  });
  const ts = `// GENERATED by tools/robots/build.mjs — do not edit by hand. Rebuild: node tools/robots/build.mjs
//
// One row per shipped robot model: identity, pinned source, licence and attribution, measured
// model data (height in the default pose, joints, LOD triangles and switch distances, bytes).
// The GLB URLs are dynamic imports, so importing this module fetches no model. Player-facing specs
// (payload, speed, prices) are NOT here; they belong to the showroom data with their sources.
//
// The amber models (flags.amber, docs/LEGAL-REVIEW.md item 2) are in ROBOTS and the line-up only when
// the build sets VITE_AMBER=1 (src/core/release.ts); vite.config.ts then also leaves their GLBs out.

import { SHOW_AMBER } from '@/core/release';

export type RobotId =
${ids.map((i) => `  | ${q(i)}`).join('\n')};

export type RobotCategory = 'humanoid' | 'quadruped' | 'biped' | 'arm' | 'mobile-manipulator' | 'amr' | 'hand' | 'gripper';

export interface RobotJointInfo {
  readonly name: string;
  readonly type: 'revolute' | 'continuous' | 'prismatic';
  readonly parent: string;
  readonly child: string;
  /** rad (m for prismatic); null = unlimited */
  readonly lower: number | null;
  readonly upper: number | null;
  /** follows another joint: value = master · multiplier + offset */
  readonly mimic?: { readonly joint: string; readonly multiplier: number; readonly offset: number };
}

export interface RobotIkChain {
  readonly name: string;
  /** base → tip */
  readonly joints: readonly string[];
  /** link (or MJCF site) whose origin is moved to the target */
  readonly tip: string;
}

export interface RobotInertial {
  readonly link: string;
  readonly mass: number;
  readonly com: readonly [number, number, number];
}

export interface RobotBytes {
  readonly raw: number;
  readonly gzip: number;
  readonly br: number;
}

export interface RobotManifestEntry {
  readonly id: RobotId;
  readonly name: { readonly de: string; readonly en: string };
  readonly vendor: string;
  readonly category: RobotCategory;
  readonly use: readonly ('game' | 'showroom')[];
  /** the published description this model was converted from */
  readonly source: { readonly url: string; readonly repo: string; readonly commit: string; readonly path: string; readonly format: 'urdf' | 'mjcf' };
  /** SPDX expression, the licence texts (served from /licenses/robots/), the copyright lines to show */
  readonly license: { readonly spdx: string; readonly files: readonly string[]; readonly copyright: readonly string[] };
  /** Apache-2.0 NOTICE text to reproduce, if the source has one */
  readonly notice: string | null;
  /** one line for plaques, data cards and the credits (DE / EN) */
  readonly attribution: { readonly de: string; readonly en: string };
  /** model height (m) in the default pose; restHeightM: all joints at 0 */
  readonly heightM: number;
  readonly restHeightM: number;
  readonly joints: readonly RobotJointInfo[];
  readonly defaultPose: Readonly<Record<string, number>>;
  readonly demoJoint: string | null;
  readonly ik: readonly RobotIkChain[];
  /** triangles per LOD, the simplification error and the switch distances at the 720 p / 60° reference view */
  readonly lod: {
    readonly lod0: { readonly tris: number; readonly errorMm: number };
    readonly lod1: { readonly tris: number; readonly errorMm: number; readonly switchM: number };
    /** articulated LOD2 (a third index list on the same skinned mesh: crowds, far ghosts); null where not built */
    readonly lod2: { readonly tris: number; readonly errorMm: number; readonly switchM: number } | null;
    readonly silhouette: { readonly tris: number; readonly switchM: number };
  };
  /** download set (plan §5.6): playable and exhibit form the MUST build; extra robots are built but not part of it */
  readonly set: 'playable' | 'exhibit' | 'extra';
  /** link masses (kg) and centres of mass (m, in the link frame = the GLB node of that link) from the source */
  readonly inertials: readonly RobotInertial[];
  /** named attach frames (links), e.g. where another robot mounts: { arm: 'Base_08q-v1' } */
  readonly mounts: Readonly<Record<string, string>>;
  /** file sizes; LOD0 and LOD1 share one file (lod1Br: LOD1's brotli share of it) */
  readonly bytes: { readonly glb: RobotBytes; readonly lod1Br: number; readonly silhouette: RobotBytes };
  readonly sourceTris: number;
  /** conservative sphere for any pose (glTF frame of the model: y up, front +z, floor y = 0) */
  readonly bounds: { readonly center: readonly [number, number, number]; readonly radius: number };
  readonly colours: string;
  readonly flags: { readonly amber: boolean; readonly legalReviewBeforeRelease: boolean; readonly noLogoElsewhere: boolean };
  readonly legalNote: string | null;
  readonly glb: () => Promise<{ default: string }>;
  readonly silhouette: () => Promise<{ default: string }>;
}

/** Every built model, the amber ones included. */
const ALL_ROBOTS: readonly RobotManifestEntry[] = [
${rows.join('\n')}
];

/** The models this build ships: without the amber ones unless VITE_AMBER=1. */
export const ROBOTS: readonly RobotManifestEntry[] = SHOW_AMBER ? ALL_ROBOTS : ALL_ROBOTS.filter((r) => !r.flags.amber);

export const ROBOT_IDS: readonly RobotId[] = ROBOTS.map((r) => r.id);

/** The size wall's line-up (R6): every hall robot in its default pose as ONE static mesh. */
export interface RobotLineup {
  /** sorted by height along +x from x = 0 (0.25 m gaps), floor y = 0, fronts to +z, centred on z = 0 */
  readonly entries: readonly { readonly id: RobotId; readonly x: readonly [number, number]; readonly heightM: number; readonly tris: number }[];
  readonly lengthM: number;
  readonly tris: number;
  readonly bytes: RobotBytes;
  readonly glb: () => Promise<{ default: string }>;
}

${lineupTs('LINEUP_ALL', lineups.all, 'lineup', 'every hall robot')}

${lineupTs('LINEUP_NO_AMBER', lineups.noAmber, 'lineup-noamber', 'the hall robots without the amber models')}

export const ROBOT_LINEUP: RobotLineup | null = SHOW_AMBER ? LINEUP_ALL : LINEUP_NO_AMBER;

const byId = new Map<string, RobotManifestEntry>(ROBOTS.map((r) => [r.id, r]));

/** The manifest row of a robot (throws on an unknown id). */
export function robotInfo(id: RobotId): RobotManifestEntry {
  const r = byId.get(id);
  if (!r) throw new Error(\`unknown robot "\${id}"\`);
  return r;
}

export function isRobotId(id: string): id is RobotId {
  return byId.has(id);
}
`;
  fs.writeFileSync(path.join(OUT_GLB, 'manifest.ts'), ts);
}

function lineupTs(name, lineup, file, what) {
  return `/** ${file}.l2.glb: ${what}. */
const ${name}: RobotLineup | null = ${lineup ? `{
  entries: ${q(lineup.entries)},
  lengthM: ${lineup.lengthM},
  tris: ${lineup.tris},
  bytes: ${q(lineup.bytes)},
  glb: () => import('./glb/${file}.l2.glb?url'),
}` : 'null'};`;
}

// ── credits.ts (robots part of the in-game credits) ─────────────────────────

function writeCredits(list, recs) {
  const rows = list.map((c) => {
    const r = recs.get(c.id);
    const mm = (r.stats.lod0ErrorM * 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 });
    const mmEn = (r.stats.lod0ErrorM * 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 });
    const removed = r.report.excluded.length;
    return {
      id: c.id,
      name: c.name,
      maker: c.vendor,
      licensor: c.license.copyright,
      spdx: c.license.spdx,
      attribution: c.attribution,
      changes: {
        de: `nach glTF konvertiert, vereinfacht (höchstens ${mm} mm Abweichung)${removed ? ', innenliegende Teile entfernt' : ''}, Farben aus dem Quellmodell`,
        en: `converted to glTF, simplified (at most ${mmEn} mm off)${removed ? ', internal parts removed' : ''}, colours from the source model`,
      },
      source: repoUrl(c),
      commit: REPOS[c.repo].commit,
      licenseFiles: c.license.texts.map((t) => `licenses/robots/${t}`),
      notice: c.license.notice ? `licenses/robots/${c.license.notice}` : null,
      amber: !!c.flags.amber,
    };
  });
  const ts = `// GENERATED by tools/robots/build.mjs — do not edit by hand.
// The robot rows of the in-game credits (see src/core/credits.ts, which adds software and fonts).

export interface RobotCredit {
  readonly id: string;
  readonly name: { readonly de: string; readonly en: string };
  readonly maker: string;
  /** copyright lines of the model's licensor (not always the maker: see amber) */
  readonly licensor: readonly string[];
  readonly spdx: string;
  readonly attribution: { readonly de: string; readonly en: string };
  /** what EmAI changed (Apache-2.0 §4b) */
  readonly changes: { readonly de: string; readonly en: string };
  readonly source: string;
  readonly commit: string;
  /** same-origin paths of the licence texts (dist/licenses/…) */
  readonly licenseFiles: readonly string[];
  readonly notice: string | null;
  /** the licensor is a third party, not the maker: legal review before public release */
  readonly amber: boolean;
}

export const ROBOT_CREDITS: readonly RobotCredit[] = ${JSON.stringify(rows, null, 2)};
`;
  fs.writeFileSync(path.join(OUT_GLB, 'credits.ts'), ts);
}
