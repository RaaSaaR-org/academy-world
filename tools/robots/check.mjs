#!/usr/bin/env node
// Robot checks → tools/robots/REPORT.md (exit 1 on a failed gate).
//
//   node tools/robots/check.mjs [--only id1,id2] [--no-browser] [--timing]
//
//  1. Khronos glTF-Validator on every shipped GLB, as written (meshopt-compressed: structure) and
//     decoded (the same document without EXT_meshopt_compression: every accessor's data). 0 errors.
//  2. Forward kinematics: the game runtime (src/core/robots, in headless Chromium, through
//     tools/robots/viewer) against tools/robots/fk_ref.py, an independent stdlib-Python reading of
//     the SOURCE URDF / MJCF; 6 random poses within the limits × up to 6 deepest links. ≤ 0.01 mm.
//  3. Limits clamp, mimic / coupled joints, IK on every arm chain (CCD, 3 targets, ≤ 2 mm).
//  4. Budgets: brotli ≤ 350 KB per robot; triangles per LOD against the class targets.
//  5. Licence texts present, attribution in every GLB (asset.copyright), no blocked mesh source.
//  --timing: first-frame cost of a new robot at 4× CPU, unwarmed vs after RobotLibrary.prewarm().
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import validator from 'gltf-validator';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { ROBOTS, CAPS, EXCEPTIONS, AREAS } from './sources.mjs';
import { REPOS } from './repos.mjs';
import { ROOT, OUT_GLB, OUT_LICENSES, SCRATCH, TOOL } from './lib/paths.mjs';
import { sourceRoot } from './lib/load.mjs';

const args = process.argv.slice(2);
const onlyArg = args.find((a, i) => args[i - 1] === '--only');
const only = onlyArg ? onlyArg.split(',') : null;
const noBrowser = args.includes('--no-browser');
const timing = args.includes('--timing');
const GLB_DIR = path.join(OUT_GLB, 'glb');
const REC_DIR = path.join(SCRATCH, 'build');
const KB = (n) => (n / 1024).toFixed(0);
const robots = ROBOTS.filter((r) => !only || only.includes(r.id));
const records = new Map(robots.map((r) => [r.id, JSON.parse(fs.readFileSync(path.join(REC_DIR, `${r.id}.json`), 'utf8'))]));
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error('FAIL ' + msg);
};

/**
 * Caps (plan §5.6, D31; WP0 R2/R4/R6) — every one is a failure:
 *  - file ≤ its cap (playable and extra 350 KB, exhibit 150 KB / humanoid exhibit 250 KB, LeKiwi 120 KB;
 *    never > 350 KB except a documented exception) · silhouette ≤ 30 KB · line-up ≤ 200 KB
 *  - exhibit LOD0 ≤ 25 k triangles (humanoid exhibits ≤ 30 k; documented exceptions only)
 *  - LOD2 where requested: duck ≤ 1.5 k, SO-101 ≤ 2 k, the four Unitree hangar robots ≤ 3 k
 *  - MUST set (playable + exhibit + line-up) ≤ 4.0 MB; robots of one area on approach ≤ 1.2 MB
 */
const LOD2_CAP = { 'open-duck-mini-v2': 1500, so101: 2000, 'unitree-r1': 3000, 'unitree-g1': 3000, 'unitree-h1-2': 3000, 'unitree-h2': 3000 };
const MB = 1e6;

// ── 1. validator ────────────────────────────────────────────────────────────
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([KHRMeshQuantization, EXTMeshoptCompression]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const validation = [];
for (const file of [...robots.flatMap((r) => [`${r.id}.glb`, `${r.id}.l2.glb`]), ...(only ? [] : ['lineup.l2.glb', 'lineup-noamber.l2.glb'])]) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(GLB_DIR, file)));
  const asIs = await validator.validateBytes(bytes, { maxIssues: 100 });
  const doc = await io.readBinary(bytes);
  const copyright = doc.getRoot().getAsset().copyright ?? '';
  doc.getRoot()
    .listExtensionsUsed()
    .filter((e) => e.extensionName === 'EXT_meshopt_compression')
    .forEach((e) => e.dispose());
  const decoded = await validator.validateBytes(await new NodeIO().registerExtensions([KHRMeshQuantization]).writeBinary(doc), { maxIssues: 100 });
  const issues = (v) => v.issues.messages.filter((m) => m.severity <= 1).map((m) => `${m.code} ${m.pointer ?? ''}`);
  const row = { file, errors: asIs.issues.numErrors + decoded.issues.numErrors, warnings: asIs.issues.numWarnings + decoded.issues.numWarnings, infos: asIs.issues.numInfos, detail: [...issues(asIs), ...issues(decoded)].slice(0, 6), copyright: copyright.length > 40 };
  validation.push(row);
  if (row.errors) fail(`${file}: ${row.errors} validator errors (${row.detail.join('; ')})`);
  if (!row.copyright) fail(`${file}: no attribution in asset.copyright`);
}
console.log(`validator: ${validation.length} files, ${validation.reduce((s, v) => s + v.errors, 0)} errors, ${validation.reduce((s, v) => s + v.warnings, 0)} warnings`);

// ── 4/5. caps and licences ──────────────────────────────────────────────────
const budgetRows = [];
for (const r of robots) {
  const rec = records.get(r.id);
  const misses = [];
  const ex = EXCEPTIONS[r.id];
  const cap = rec.capKB;
  if (rec.bytes.glb.br > cap * 1024) misses.push(`${KB(rec.bytes.glb.br)} KB br > ${cap}`);
  if (rec.bytes.glb.br > CAPS.fileKB * 1024 && !(ex && rec.bytes.glb.br <= ex.fileKB * 1024)) misses.push(`${KB(rec.bytes.glb.br)} KB br > ${CAPS.fileKB} (no documented exception)`);
  if (r.set === 'exhibit') {
    const lim = ex?.lod0 ?? (r.category === 'humanoid' ? CAPS.humanoidExhibitLod0 : CAPS.exhibitLod0);
    if (rec.stats.lod0Tris > lim) misses.push(`LOD0 ${rec.stats.lod0Tris} > ${lim}`);
  }
  if (LOD2_CAP[r.id] && !(rec.stats.lod2Tris > 0 && rec.stats.lod2Tris <= LOD2_CAP[r.id])) misses.push(`LOD2 ${rec.stats.lod2Tris || 'missing'} (cap ${LOD2_CAP[r.id]})`);
  if (rec.bytes.silhouette.br > CAPS.silhouetteKB * 1024) misses.push(`silhouette ${KB(rec.bytes.silhouette.br)} KB > ${CAPS.silhouetteKB}`);
  for (const m of misses) fail(`${r.id}: ${m}`);
  for (const t of r.license.texts) if (!fs.existsSync(path.join(OUT_LICENSES, 'robots', t))) fail(`${r.id}: licence text ${t} missing`);
  if (r.license.notice && !fs.existsSync(path.join(OUT_LICENSES, 'robots', r.license.notice))) fail(`${r.id}: NOTICE ${r.license.notice} missing`);
  if (rec.report.rejected.length) console.log(`${r.id}: rejected third-party meshes: ${rec.report.rejected.join(', ')}`);
  budgetRows.push({ r, rec, misses });
}
if ((only ?? ['so101']).includes('so101') && !(records.get('so101')?.inertials?.length > 0)) fail('so101: no inertials in the build record (R3)');
const lineupRec = fs.existsSync(path.join(REC_DIR, 'lineup.json')) ? JSON.parse(fs.readFileSync(path.join(REC_DIR, 'lineup.json'), 'utf8')) : null;
// the public build's line-up without the amber models (VITE_AMBER unset, src/core/release.ts)
const lineupNoAmberRec = fs.existsSync(path.join(REC_DIR, 'lineup-noamber.json')) ? JSON.parse(fs.readFileSync(path.join(REC_DIR, 'lineup-noamber.json'), 'utf8')) : null;
let mustTotal = null;
const areaTotals = {};
if (!only) {
  if (!lineupRec) fail('lineup.l2.glb missing (R6)');
  else if (lineupRec.bytes.br > CAPS.lineupKB * 1024) fail(`lineup.l2.glb ${KB(lineupRec.bytes.br)} KB > ${CAPS.lineupKB}`);
  if (!lineupNoAmberRec) fail('lineup-noamber.l2.glb missing (node tools/robots/build.mjs --records)');
  else if (lineupNoAmberRec.bytes.br > CAPS.lineupKB * 1024) fail(`lineup-noamber.l2.glb ${KB(lineupNoAmberRec.bytes.br)} KB > ${CAPS.lineupKB}`);
  else if (lineupNoAmberRec.entries.some((e) => robots.find((r) => r.id === e.id)?.flags?.amber)) fail('lineup-noamber.l2.glb holds an amber model');
  const must = budgetRows.filter((b) => b.r.set !== 'extra');
  mustTotal = must.reduce((t, b) => t + b.rec.bytes.glb.br, 0) + (lineupRec?.bytes.br ?? 0);
  console.log(`MUST set: ${must.length} robot files + line-up = ${(mustTotal / MB).toFixed(3)} MB brotli (${(mustTotal / 1048576).toFixed(3)} MiB; cap ${CAPS.mustTotalMB} MB)`);
  if (mustTotal > CAPS.mustTotalMB * MB) fail(`MUST set ${(mustTotal / MB).toFixed(3)} MB > ${CAPS.mustTotalMB} MB`);
  for (const [area, ids] of Object.entries(AREAS)) {
    areaTotals[area] = ids.reduce((t, id) => t + records.get(id).bytes.glb.br, 0);
    console.log(`area ${area}: ${(areaTotals[area] / MB).toFixed(3)} MB (cap ${CAPS.areaMB} MB)`);
    if (areaTotals[area] > CAPS.areaMB * MB) fail(`area ${area}: ${(areaTotals[area] / MB).toFixed(3)} MB > ${CAPS.areaMB} MB`);
  }
}

// ── 2/3. browser checks ─────────────────────────────────────────────────────
let seed = 20261017;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const fkRows = [];
const clampRows = [];
const ikRows = [];
const mimicRows = [];
const lodRows = [];
const bodyRows = [];
let timingRows = [];
if (!noBrowser) {
  const { startServer, launchBrowser } = await import('../lib/shotlib.mjs');
  // the pipeline checks every model it built, the amber exhibits included (src/core/release.ts)
  process.env.VITE_AMBER = '1';
  const server = await startServer();
  const browser = await launchBrowser();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${server.url}/tools/robots/viewer/index.html?w=640&h=360`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.viewer && window.viewer.ready, null, { timeout: 120000 });
    for (const r of robots) {
      const rec = records.get(r.id);
      // probes: the deepest real links (no generated joint frames, no sites)
      const parentOf = new Map(rec.joints.map((j) => [j.child, j.parent]));
      const depth = (l) => {
        let n = 0;
        for (let p = l; parentOf.has(p); p = parentOf.get(p)) n++;
        return n;
      };
      const real = rec.links.filter((l) => !l.frame && !l.site && !l.name.includes('#')).map((l) => l.name);
      const probes = real.sort((a, b) => depth(b) - depth(a)).slice(0, 6);
      const movable = rec.joints.filter((j) => ['revolute', 'continuous', 'prismatic'].includes(j.type) && !j.mimic);
      const poses = [];
      for (let k = 0; k < 6; k++) {
        const p = {};
        for (const j of movable) {
          const lo = j.limit?.lower ?? -Math.PI;
          const hi = j.limit?.upper ?? Math.PI;
          p[j.name] = lo + (hi - lo) * rnd();
        }
        poses.push(p);
      }
      const got = await page.evaluate(([id, ps, ls]) => window.viewer.fk(id, ps, ls), [r.id, poses, probes]);
      const fkReq = { kind: rec.fk.kind, file: rec.fk.file, root: sourceRoot(r.repo), poses: got.map((g) => g.applied), links: probes };
      const ref = JSON.parse(execFileSync('python3', ['-I', path.join(TOOL, 'fk_ref.py')], { input: JSON.stringify(fkReq), encoding: 'utf8', maxBuffer: 1 << 26 }));
      const rootM = new THREE.Matrix4().compose(new THREE.Vector3(...rec.rootTransform.translation), new THREE.Quaternion(...rec.rootTransform.quaternion), new THREE.Vector3(1, 1, 1));
      let worstMm = 0;
      let worstDeg = 0;
      let compared = 0;
      for (let k = 0; k < got.length; k++) {
        for (let i = 0; i < probes.length; i++) {
          const a = got[k].links[i];
          const b = ref[k][i];
          if (!a || !b) continue;
          const want = rootM.clone().multiply(new THREE.Matrix4().set(...b));
          const have = new THREE.Matrix4().fromArray(a);
          const pw = new THREE.Vector3().setFromMatrixPosition(want);
          const ph = new THREE.Vector3().setFromMatrixPosition(have);
          worstMm = Math.max(worstMm, pw.distanceTo(ph) * 1000);
          const qw = new THREE.Quaternion().setFromRotationMatrix(want);
          const qh = new THREE.Quaternion().setFromRotationMatrix(have);
          worstDeg = Math.max(worstDeg, THREE.MathUtils.radToDeg(qw.angleTo(qh)));
          compared++;
        }
      }
      fkRows.push({ id: r.id, probes: probes.length, poses: got.length, compared, worstMm, worstDeg });
      if (!compared || worstMm > 0.01 || worstDeg > 0.01) fail(`${r.id}: FK off by ${worstMm.toFixed(4)} mm / ${worstDeg.toFixed(4)}° (${compared} comparisons)`);

      const lods = await page.evaluate((id) => window.viewer.lodAuto(id), r.id);
      const wantLods = [0, 1, ...(rec.stats.lod2Tris ? [2] : []), 'silhouette'];
      const lodOk = lods.length === wantLods.length && lods.every((l, i) => l.lod === wantLods[i]);
      lodRows.push({ id: r.id, ok: lodOk, lods });
      if (!lodOk) fail(`${r.id}: LOD auto picked ${lods.map((l) => l.lod).join(' / ')} (want ${wantLods.join(' / ')})`);

      // bodies(id, 2): per-body unskinned geometry in the link frame matches the skinned LOD in a random pose
      if (rec.stats.lod2Tris) {
        const pose = {};
        for (const j of movable) pose[j.name] = (j.limit?.lower ?? -1) + ((j.limit?.upper ?? 1) - (j.limit?.lower ?? -1)) * rnd();
        const bc = await page.evaluate(([id, p]) => window.viewer.bodiesCheck(id, 2, p), [r.id, pose]);
        bodyRows.push({ id: r.id, ...bc });
        if (bc.tris !== bc.skinnedTris || bc.worstM > 1e-4) fail(`${r.id}: bodies(2) off by ${(bc.worstM * 1000).toFixed(3)} mm, ${bc.tris} vs ${bc.skinnedTris} tris`);
      }

      const clamp = await page.evaluate((id) => window.viewer.clamp(id), r.id);
      const bad = clamp.filter((c) => Math.abs(c.got - c.upper) > 1e-9);
      clampRows.push({ id: r.id, joints: clamp.length, bad: bad.length });
      if (bad.length) fail(`${r.id}: ${bad.length} joints not clamped to their upper limit`);

      // mimic / coupled joints follow their master
      const followers = rec.joints.filter((j) => j.mimic);
      if (followers.length) {
        const res = await page.evaluate(
          ([id, fs]) =>
            window.viewer.fk(id, fs.map((f) => ({ [f.mimic.joint]: 0.3 })), []).then((o) => o.map((x) => x.applied)),
          [r.id, followers],
        );
        let worst = 0;
        followers.forEach((f, i) => {
          const lim = f.limit ?? { lower: -Infinity, upper: Infinity };
          const masterV = res[i][f.mimic.joint];
          const want = Math.min(lim.upper ?? Infinity, Math.max(lim.lower ?? -Infinity, masterV * f.mimic.multiplier + f.mimic.offset));
          worst = Math.max(worst, Math.abs(res[i][f.name] - want));
        });
        mimicRows.push({ id: r.id, followers: followers.length, worst });
        if (worst > 1e-9) fail(`${r.id}: mimic joints off by ${worst}`);
      }

      for (const chain of r.ik ?? []) {
        const s = rec.bounds.restHeightM;
        const step = Math.min(0.06, Math.max(0.02, s * 0.08));
        const offsets = [
          [step, -step * 0.5, 0],
          [-step * 0.6, step * 0.4, step * 0.5],
          [0, -step, -step * 0.6],
        ];
        const res = await page.evaluate(([id, c, o]) => window.viewer.ik(id, c, o), [r.id, chain.name, offsets]);
        const worst = Math.max(...res.map((x) => x.error));
        ikRows.push({ id: r.id, chain: chain.name, tip: chain.tip, targets: res.length, worstMm: worst * 1000, reached: res.filter((x) => x.reached).length });
        if (worst > 0.002) fail(`${r.id}: IK chain ${chain.name} misses by ${(worst * 1000).toFixed(2)} mm`);
      }
      console.log(`${r.id.padEnd(20)} FK ${worstMm.toFixed(5)} mm / ${worstDeg.toFixed(5)}°  clamp ${clamp.length - bad.length}/${clamp.length}`);
    }
    if (timing) timingRows = await measureTiming(browser, server.url);
  } finally {
    await browser.close();
    await server.close();
  }
  if (errors.length) fail(`viewer console errors: ${errors.slice(0, 5).join(' | ')}`);
}

async function measureTiming(browser, url) {
  const rows = [];
  for (const id of ['so101', 'unitree-g1', 'open-duck-mini-v2', 'apptronik-apollo']) {
    for (const prewarm of [false, true]) {
      for (const shadows of [true]) {
      // fresh page per run: nothing cached, the program not compiled yet
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${url}/tools/robots/viewer/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.viewer && window.viewer.ready, null, { timeout: 120000 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t = await page.evaluate(([i, p, sh]) => window.viewer.timing(i, { prewarm: p, shadows: sh }), [id, prewarm, shadows]);
      rows.push({ id, prewarm, shadows, ...t });
      await page.close();
      }
    }
  }
  return rows;
}

// ── REPORT.md ───────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString('en-GB');
const lines = [];
lines.push('# Robot build report', '');
lines.push(`Generated by \`node tools/robots/check.mjs\` on ${new Date().toISOString().slice(0, 10)} from the GLBs in \`src/robots/glb/\` and the build records of \`node tools/robots/build.mjs\`. Sizes are measured on the shipped files: raw, gzip -9, brotli q11. Triangles: LOD0 / LOD1 / LOD2 (index lists over LOD0's vertices in one file; LOD2 articulated, per-body clustering) / static silhouette (own file). Errors are the simplifier's absolute error bounds; switch distances are where that error is half a pixel at 720 p and 60° (scale with the real viewport).`, '');
lines.push(`**Gates:** ${failures.length ? `${failures.length} FAILED` : 'all passed'} · validator ${validation.length} files, ${validation.reduce((s, v) => s + v.errors, 0)} errors, ${validation.reduce((s, v) => s + v.warnings, 0)} warnings${noBrowser ? ' · browser checks skipped' : ` · FK worst ${Math.max(0, ...fkRows.map((f) => f.worstMm)).toFixed(5)} mm / ${Math.max(0, ...fkRows.map((f) => f.worstDeg)).toFixed(5)}°`}.`, '');
lines.push('## Caps (plan §5.6, D31)', '');
if (mustTotal !== null) {
  lines.push(`- **MUST set** (playable + exhibit robots + the line-up): **${(mustTotal / MB).toFixed(3)} MB** brotli (${(mustTotal / 1048576).toFixed(3)} MiB), cap ${CAPS.mustTotalMB} MB.`);
  for (const [area, t] of Object.entries(areaTotals)) lines.push(`- Area **${area}** (${AREAS[area].join(', ')}): ${(t / MB).toFixed(3)} MB, cap ${CAPS.areaMB} MB.`);
  if (lineupRec) lines.push(`- **Line-up** \`lineup.l2.glb\`: ${lineupRec.entries.length} hall robots, ${fmt(lineupRec.tris)} triangles, ${lineupRec.lengthM} m long, ${(lineupRec.bytes.br / 1024).toFixed(1)} KB brotli (cap ${CAPS.lineupKB} KB).`);
  if (lineupNoAmberRec) lines.push(`- **Line-up without the amber models** \`lineup-noamber.l2.glb\` (the public build, VITE_AMBER unset): ${lineupNoAmberRec.entries.length} hall robots, ${fmt(lineupNoAmberRec.tris)} triangles, ${lineupNoAmberRec.lengthM} m long, ${(lineupNoAmberRec.bytes.br / 1024).toFixed(1)} KB brotli (cap ${CAPS.lineupKB} KB).`);
}
lines.push(`- Per file: playable and extra ≤ ${CAPS.fileKB} KB, exhibits ≤ ${CAPS.exhibitKB} KB (humanoid exhibits ≤ ${CAPS.humanoidExhibitKB} KB) with LOD0 ≤ ${fmt(CAPS.exhibitLod0)} (≤ ${fmt(CAPS.humanoidExhibitLod0)}), LeKiwi base ≤ 120 KB, silhouettes ≤ ${CAPS.silhouetteKB} KB. \`build.mjs\` lowers a robot's triangle targets until its file fits.`);
for (const [id, ex] of Object.entries(EXCEPTIONS)) lines.push(`- **Documented exception — ${id}:** file ≤ ${ex.fileKB} KB, LOD0 ${fmt(ex.lod0)} triangles. ${ex.reason}.`);
lines.push('');
lines.push('## Robots', '');
lines.push('| Robot | Set | Source | Licence | Source tris | LOD0 tris (err mm) | LOD1 tris (err mm, switch m) | LOD2 tris (err mm, switch m) | Silhouette tris (switch m) | Joints | Inertials | Height m | GLB raw / gz / br KB (cap) | LOD1 share br KB | Silhouette br KB | Caps |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
let total = { br: 0, l2: 0 };
for (const { r, rec, misses } of budgetRows) {
  total.br += rec.bytes.glb.br;
  total.l2 += rec.bytes.silhouette.br;
  const g = rec.bytes.glb;
  lines.push(
    `| ${r.name.en}${r.flags.amber ? ' (amber)' : ''} | ${r.set} | ${REPOS[r.repo].url.replace('https://github.com/', '')} @ ${REPOS[r.repo].commit.slice(0, 7)} \`${r.entry}\` | ${r.license.spdx} | ${fmt(rec.stats.sourceTris)} | ${fmt(rec.stats.lod0Tris)} (${(rec.stats.lod0ErrorM * 1000).toFixed(2)}) | ${fmt(rec.stats.lod1Tris)} (${((rec.stats.lod1MaxErrorM ?? rec.stats.lod1ErrorM) * 1000).toFixed(2)}, ${rec.switchM.lod1}) | ${rec.stats.lod2Tris ? `${fmt(rec.stats.lod2Tris)} (${(rec.stats.lod2ErrorM * 1000).toFixed(1)}, ${rec.switchM.lod2})` : '—'} | ${fmt(rec.stats.l2Tris)} (${rec.switchM.silhouette}) | ${rec.movable.length} | ${rec.inertials?.length ?? 0} | ${rec.bounds.heightM} | ${KB(g.raw)} / ${KB(g.gzip)} / **${KB(g.br)}** (${rec.capKB}) | ${KB(rec.bytes.lod1Br)} | ${KB(rec.bytes.silhouette.br)} | ${misses.length ? '**miss:** ' + misses.join('; ') : 'ok'} |`,
  );
}
lines.push('', `All robots: ${(total.br / 1048576).toFixed(2)} MB brotli for the skinned GLBs + ${(total.l2 / 1048576).toFixed(2)} MB for the silhouettes. Nothing of it is in the first load (dynamic imports).`, '');
const missRows = budgetRows.filter((b) => b.misses.length);
lines.push('### Budget misses', '');
if (!missRows.length) lines.push('None.', '');
else for (const b of missRows) lines.push(`- **${b.r.name.en}**: ${b.misses.join('; ')}.`);
lines.push('', '### LeKiwi licence gate (R5)', '');
lines.push('`SIGRobotics-UIUC/LeKiwi` @ ' + REPOS.lekiwi.commit.slice(0, 7) + ': `LICENSE.txt` is Apache-2.0 for the whole repository; `CITATION.cff` repeats it and names the authors; the README, BOM and the URDF / mesh folders carry no other terms. **Green**: `lekiwi-base` ships (base only; the arm on top is `so101`, mounted at link `Base_08q-v1`, manifest `mounts.arm`). Notes: the URDF bundles vendor part models (Feetech ST3215 servos, omni wheels, a battery, a USB camera) whose provenance is undocumented, as with the SO-101 servos (legal check with the duck); the McMaster-Carr standoffs (94868A713, catalogue CAD) are left out by path. The URDF has no colours: printed parts white as D32, servos, battery and camera black, wheels dark grey.', '');
lines.push('### Decisions applied to the models', '');
lines.push('- D32: SO-101 printed parts white #F5F5F4, servos black #1A1A1A, the moving jaw (follower) and the trigger (leader) orange #FF6700 (the source prints them yellow).');
lines.push('- D29: Open Duck Mini in neutral white and greys: every saturated source colour (orange, amber, blue) becomes the grey of its luminance.');
lines.push('- R3: link inertials (mass, centre of mass in the link frame) from the source in the manifest (`inertials`) and the GLB extras, wherever the source has them.', '');
lines.push('', '### Removed and rejected parts', '');
for (const { r, rec } of budgetRows) if (rec.report.excluded.length || rec.report.rejected.length) lines.push(`- ${r.name.en}: ${rec.report.excluded.length} hidden internal visuals removed (${[...new Set(rec.report.excluded.map((x) => path.basename(x).replace(/:.*/, '')))].join(', ')})${rec.report.rejected.length ? `; rejected third-party hand meshes: ${rec.report.rejected.join(', ')}` : ''}.`);
lines.push('- Third-party hands (Inspire, BrainCo, Sharpa) are rejected by path in every source; Universal Robots meshes of UR8 Long / UR15 / UR18 / UR20 / UR30 stop the build (none are referenced by the pinned sources).', '');
lines.push('## Validation (Khronos glTF-Validator)', '');
lines.push('Each file is validated twice: as shipped (the validator cannot decode EXT_meshopt_compression, so this checks structure, extensions and the skin) and decoded (the same document re-written without meshopt compression, so every accessor\'s data is checked: unit normals, index ranges, quantized attributes).', '');
lines.push('| File | Errors | Warnings | Infos (as shipped) |', '|---|---|---|---|');
for (const v of validation) lines.push(`| ${v.file} | ${v.errors} | ${v.warnings} | ${v.infos} |`);
if (!noBrowser) {
  lines.push('', '## Forward kinematics (runtime vs independent source FK)', '');
  lines.push('`tools/robots/fk_ref.py` (stdlib Python, run with `-I`) reads the source URDF / expanded xacro / MJCF with its own parser and computes each probe link\'s pose relative to the root link for the joint values the runtime applied; the runtime pose (`RobotModel.getLinkWorldMatrix`) is compared after the GLB\'s root transform.', '');
  lines.push('| Robot | Poses | Probe links | Worst position error mm | Worst rotation error ° | Clamp (upper + 1 → upper) | Mimic / coupled joints | LOD auto: near / past LOD1 switch / past silhouette switch |', '|---|---|---|---|---|---|---|---|');
  for (const f of fkRows) {
    const c = clampRows.find((x) => x.id === f.id);
    const m = mimicRows.find((x) => x.id === f.id);
    const l = lodRows.find((x) => x.id === f.id);
    lines.push(`| ${f.id} | ${f.poses} | ${f.probes} | ${f.worstMm.toFixed(5)} | ${f.worstDeg.toFixed(5)} | ${c.joints - c.bad}/${c.joints} | ${m ? `${m.followers} ok (worst ${m.worst.toExponential(1)})` : '—'} | ${l ? l.lods.map((x) => `${x.lod} (${x.triangles})`).join(' / ') : '—'} |`);
  }
  if (bodyRows.length) {
    lines.push('', '## LOD2 bodies (`RobotLibrary.bodies(id, 2)`, R2)', '');
    lines.push('Per body, the unskinned geometry placed with `getLinkWorldMatrix(link)` against the skinned LOD2 in a random pose (every 7th used vertex).', '');
    lines.push('| Robot | Bodies | Triangles (bodies / skinned LOD2) | Worst gap mm |', '|---|---|---|---|');
    for (const b of bodyRows) lines.push(`| ${b.id} | ${b.bodies} | ${b.tris} / ${b.skinnedTris} | ${(b.worstM * 1000).toFixed(4)} |`);
  }
  lines.push('', '## IK (CCD, `RobotModel.solveIK`)', '');
  lines.push('| Robot | Chain → tip | Targets | Reached (≤ 0.5 mm) | Worst error mm |', '|---|---|---|---|---|');
  for (const k of ikRows) lines.push(`| ${k.id} | ${k.chain} → ${k.tip} | ${k.targets} | ${k.reached} | ${k.worstMm.toFixed(3)} |`);
}
if (timingRows.length) {
  lines.push('', '## First frame of a new robot at 4× CPU (headless Chromium, ANGLE Metal)', '');
  lines.push('The viewer\'s static scene is drawn twice first, so only the robot\'s own cost is timed. Prewarm = `RobotLibrary.prewarm()` (fetch + parse, compile, 1×1 upload draws, each in its own idle slot); its total includes the idle waits.', '');
  lines.push('| Robot | Prewarmed | Shadows | Prewarm ms (idle slots) | Load ms | Longest task before the first frame ms (> 50 ms only) | First frame ms | Programs linked in that frame | Second frame ms |', '|---|---|---|---|---|---|---|---|---|');
  for (const t of timingRows) lines.push(`| ${t.id} | ${t.prewarm ? 'yes' : 'no'} | ${t.shadows ? 'on' : 'off'} | ${t.prewarmMs.toFixed(0)} | ${t.loadMs.toFixed(1)} | ${t.longestTaskMs ? t.longestTaskMs.toFixed(0) : '—'} | ${t.firstFrameMs.toFixed(1)} | ${t.programsLinked}${t.newPrograms?.length ? ` (${t.newPrograms.join(', ')})` : ''} | ${t.secondFrameMs.toFixed(1)} |`);
}
if (failures.length) lines.push('', '## Failures', '', ...failures.map((f) => `- ${f}`));
fs.writeFileSync(path.join(TOOL, 'REPORT.md'), lines.join('\n') + '\n');
console.log(`REPORT.md written; ${failures.length} failures`);
process.exit(failures.length ? 1 : 0);
