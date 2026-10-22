// One robot: description → kinematic tree → parts → LOD0 / LOD1 / silhouette → GLB documents.
//
// Frames: link frames stay exactly as in the source below one root node `robot:<id>`, which turns
// the source's Z-up, +X-forward frame into glTF's Y-up, +Z-forward frame (plus an optional yaw) and
// lifts the lowest point of the default pose onto y = 0.
// Skinning: every vertex has weight 1 on its body (the nearest link that moves, fixed links folded
// in), so the whole robot is ONE skinned mesh = one draw call, fully articulated. LOD0 and LOD1 are
// two index lists over ONE vertex buffer and share the skeleton.
import path from 'node:path';
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { loadDescription } from './load.mjs';
import { readMesh } from './meshes.mjs';
import { readImage, bakeCorners } from './textures.mjs';
import { buildBase, simplifyBase, withNormals, lod1Indices, sloppyTo, primitiveSoup, CREASE_DEG } from './geometry.mjs';
import { srgbToLinear, r6, r4 } from './math.mjs';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

export const MOVABLE = new Set(['revolute', 'continuous', 'prismatic']);
/** Third-party hands bundled in vendor repos (authorship unclear, R3): never shipped. */
export const REJECT_THIRD_PARTY_HANDS = /(inspire|brainco|sharpa)/i;
/** Universal Robots' newer meshes fall under UR's own terms (R4 §5.2): a hard stop. */
export const UR_FORBIDDEN = /(^|[\\/_.\-])ur(8_?long|15|18|20|30)([\\/_.\-]|$)/i;

/** Pixel size at 1 m for the reference view (720 px tall, 60° vertical FOV): 1.604 mm. */
export const PX_AT_1M = (2 * Math.tan(Math.PI / 6)) / 720;
/** Distance at which an error of `e` metres is half a pixel in the reference view. */
export const halfPixelDistance = (e) => e / (0.5 * PX_AT_1M);

// ── kinematic tree ──────────────────────────────────────────────────────────

export function buildTree(desc) {
  const jointByChild = new Map(desc.joints.map((j) => [j.child, j]));
  const childrenOf = new Map();
  for (const j of desc.joints) {
    if (!childrenOf.has(j.parent)) childrenOf.set(j.parent, []);
    childrenOf.get(j.parent).push(j);
  }
  let root = desc.rootLink;
  if (!root) {
    const roots = [...desc.links.keys()].filter((l) => !jointByChild.has(l));
    const size = (l) => 1 + (childrenOf.get(l) ?? []).reduce((s, j) => s + size(j.child), 0);
    roots.sort((a, b) => size(b) - size(a));
    if (roots.length > 1) console.warn(`[tree] ${roots.length} root links; using "${roots[0]}" (dropping ${roots.slice(1).join(', ')})`);
    root = roots[0];
  }
  const body = new Map([[root, root]]);
  const toBody = new Map([[root, new THREE.Matrix4()]]);
  const order = [];
  const walk = (link) => {
    order.push(link);
    for (const j of childrenOf.get(link) ?? []) {
      if (MOVABLE.has(j.type)) {
        body.set(j.child, j.child);
        toBody.set(j.child, new THREE.Matrix4());
      } else {
        body.set(j.child, body.get(link));
        toBody.set(j.child, toBody.get(link).clone().multiply(j.origin));
      }
      walk(j.child);
    }
  };
  walk(root);
  return { root, jointByChild, childrenOf, body, toBody, order };
}

/** Joint value incl. mimic: followers take master · multiplier + offset. */
export function resolvePose(desc, values) {
  const byName = new Map(desc.joints.map((j) => [j.name, j]));
  const out = {};
  const get = (n, depth = 0) => {
    if (n in out) return out[n];
    const j = byName.get(n);
    if (!j) return 0;
    let v = values[n] ?? j.ref ?? 0;
    if (j.mimic && depth < 8) v = get(j.mimic.joint, depth + 1) * j.mimic.multiplier + j.mimic.offset;
    return (out[n] = v);
  };
  for (const j of desc.joints) if (MOVABLE.has(j.type)) get(j.name);
  return out;
}

export function jointMotion(j, q) {
  const v = q - (j.ref ?? 0);
  if (j.type === 'prismatic') return new THREE.Matrix4().makeTranslation(j.axis[0] * v, j.axis[1] * v, j.axis[2] * v);
  if (j.type === 'revolute' || j.type === 'continuous') return new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...j.axis), v);
  return new THREE.Matrix4();
}

/** World matrices of every link for a pose (values by joint name), under `rootM`. */
export function forward(tree, desc, rootM, values = {}) {
  const pose = resolvePose(desc, values);
  const world = new Map();
  const walk = (link, m) => {
    world.set(link, m);
    for (const j of tree.childrenOf.get(link) ?? []) {
      const c = m.clone().multiply(j.origin);
      if (MOVABLE.has(j.type)) c.multiply(jointMotion(j, pose[j.name] ?? j.ref ?? 0));
      walk(j.child, c);
    }
  };
  walk(tree.root, rootM.clone());
  return world;
}

// ── parts ───────────────────────────────────────────────────────────────────

const baseCache = new Map();
const simplifyCache = new Map();
const normalCache = new Map();

function linColor(c) {
  return [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
}

async function collectParts(cfg, desc, tree, root) {
  const parts = new Map();
  const report = { visuals: 0, excluded: [], rejected: [], sourceTris: 0, colors: new Set(), textures: new Set(), files: new Set() };
  for (const link of tree.order) {
    const ld = desc.links.get(link);
    if (!ld) continue;
    const bodyName = tree.body.get(link);
    const toBody = tree.toBody.get(link);
    for (const vis of ld.visuals) {
      const where = vis.mesh ? path.relative(root, vis.mesh.file) : `${link}:${vis.prim.type}`;
      if (vis.mesh && UR_FORBIDDEN.test(where)) throw new Error(`${cfg.id}: UR mesh under UR's own terms: ${where}`);
      if (vis.mesh && REJECT_THIRD_PARTY_HANDS.test(where)) {
        report.rejected.push(where);
        continue;
      }
      if ((cfg.exclude ?? []).some((re) => re.test(where) || re.test(link) || (vis.name && re.test(vis.name)))) {
        report.excluded.push(where);
        continue;
      }
      report.visuals++;
      const errScale = (cfg.partErrScale ?? []).find((p) => p.match.test(where))?.scale ?? 1;
      const matrix = toBody.clone().multiply(vis.origin);
      if (vis.prim) {
        const soup = await primitiveSoup(vis.prim);
        if (!soup) continue;
        const key = 'prim:' + JSON.stringify(vis.prim);
        const color = vis.color ?? cfg.defaultColor ?? [0.6, 0.6, 0.6, 1];
        addInstance(parts, key, () => ({ pos: soup, col: null }), { body: bodyName, matrix, color: linColor(color) }, errScale, report, soup.length / 9);
        report.colors.add(hex(color));
        continue;
      }
      const ext = path.extname(vis.mesh.file).toLowerCase();
      report.files.add(where);
      const fileColors = cfg.meshColors === 'file' ? true : cfg.meshColors === 'visual' ? false : ext === '.dae' || (desc.format === 'urdf' && ext === '.obj');
      const sub = readMesh(vis.mesh.file, root);
      const [sx, sy, sz] = vis.mesh.scale;
      sub.forEach((part, k) => {
        if ((cfg.exclude ?? []).some((re) => re.test(part.name))) {
          report.excluded.push(part.name);
          return;
        }
        let color = (fileColors && part.color) || vis.color || cfg.defaultColor || [0.6, 0.6, 0.6, 1];
        if (cfg.recolor) color = cfg.recolor(color, { link, file: where, part: part.name }) ?? color;
        const texture = (fileColors && part.texture) || vis.texture || null;
        const textured = !!(texture && part.uvs && !cfg.noTextures);
        const key = `${vis.mesh.file}#${k}|${sx},${sy},${sz}${textured ? `|${texture}|${color.join(',')}` : ''}`;
        const make = () => {
          const pos = new Float32Array(part.positions.length);
          for (let i = 0; i < pos.length; i += 3) {
            pos[i] = part.positions[i] * sx;
            pos[i + 1] = part.positions[i + 1] * sy;
            pos[i + 2] = part.positions[i + 2] * sz;
          }
          let uvs = textured ? new Float32Array(part.uvs) : null;
          if (sx * sy * sz < 0) {
            for (let i = 0; i < pos.length; i += 9) for (let c = 0; c < 3; c++) [pos[i + 3 + c], pos[i + 6 + c]] = [pos[i + 6 + c], pos[i + 3 + c]];
            if (uvs) for (let t = 0; t < uvs.length; t += 6) for (let c = 0; c < 2; c++) [uvs[t + 2 + c], uvs[t + 4 + c]] = [uvs[t + 4 + c], uvs[t + 2 + c]];
          }
          const col = textured ? bakeCorners(readImage(texture), uvs, linColor(color)) : null;
          return { pos, col };
        };
        if (textured) report.textures.add(path.relative(root, texture));
        else report.colors.add(hex(color));
        addInstance(parts, key + (cfg.weldMm ? `|w${cfg.weldMm}` : '') + (cfg.lod.prune === false ? '|np' : ''), make, { body: bodyName, matrix, color: linColor(color), alpha: color[3] ?? 1, weld: cfg.weldMm ? cfg.weldMm / 1000 : undefined, prune: cfg.lod.prune }, errScale, report, part.positions.length / 9);
      });
    }
  }
  return { parts: [...parts.values()], report };
}

function addInstance(parts, key, make, inst, errScale, report, tris) {
  let p = parts.get(key);
  if (!p) parts.set(key, (p = { key, make, instances: [], errScale, weld: inst.weld, prune: inst.prune }));
  p.instances.push(inst);
  report.sourceTris += tris;
}

const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

function baseOf(p) {
  let b = baseCache.get(p.key);
  if (!b) {
    const { pos, col } = p.make();
    // crack repair: a coarser weld closes the hairline gaps of pre-decimated CAD exports
    b = buildBase(pos, col, p.weld ?? 1e-6);
    baseCache.set(p.key, b);
  }
  return b;
}

function simplified(p, err) {
  const e = err * p.errScale;
  const k = p.key + '|' + e;
  let r = simplifyCache.get(k);
  if (!r) {
    r = simplifyBase(baseOf(p), e, { prune: p.prune !== false });
    simplifyCache.set(k, r);
  }
  return r;
}

function finalMesh(p, err, creaseDeg) {
  const e = err * p.errScale;
  const k = p.key + '|' + e + '|' + creaseDeg;
  let m = normalCache.get(k);
  if (!m) {
    const s = simplified(p, err);
    m = { ...withNormals(baseOf(p), s.index, creaseDeg), error: s.error };
    normalCache.set(k, m);
  }
  return m;
}

/**
 * Smallest error in [minErr, maxErr] whose triangle count (all instances) is ≤ target (log
 * bisection). When even maxErr is not enough, maxErr: the count then stays above the target.
 */
function searchError(count, target, minErr, maxErr = 0.05) {
  if (count(minErr) <= target) return minErr;
  if (count(maxErr) > target) return maxErr;
  let lo = minErr;
  let hi = maxErr;
  for (let i = 0; i < 12; i++) {
    const mid = Math.sqrt(lo * hi);
    if (count(mid) > target) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ── conversion ──────────────────────────────────────────────────────────────

export async function convertRobot(cfg) {
  const t0 = performance.now();
  const { desc, root, fkSource } = loadDescription(cfg);
  // couplings the source closes with constraints (MJCF connect) → kinematic followers
  for (const [name, [master, multiplier, offset]] of Object.entries(cfg.mimic ?? {})) {
    const j = desc.joints.find((x) => x.name === name);
    if (!j || !desc.joints.some((x) => x.name === master)) throw new Error(`${cfg.id}: mimic ${name} ← ${master}: unknown joint`);
    j.mimic = { joint: master, multiplier, offset };
  }
  // base only (e.g. LeKiwi without its arm): drop everything below a link, keep that link as a bare frame
  for (const cut of cfg.pruneBelow ?? []) {
    if (!desc.links.has(cut)) throw new Error(`${cfg.id}: pruneBelow ${cut}: unknown link`);
    const gone = new Set();
    const stack = desc.joints.filter((j) => j.parent === cut).map((j) => j.child);
    while (stack.length) {
      const l = stack.pop();
      gone.add(l);
      for (const j of desc.joints) if (j.parent === l) stack.push(j.child);
    }
    desc.joints = desc.joints.filter((j) => !gone.has(j.child));
    for (const l of gone) desc.links.delete(l);
    desc.links.get(cut).visuals = [];
    desc.links.get(cut).frameOnly = true;
  }
  const tree = buildTree(desc);
  const { parts, report } = await collectParts(cfg, desc, tree, root);
  if (!parts.length) throw new Error(`${cfg.id}: no visual geometry`);

  // LOD0: the smallest absolute error (m) that meets the triangle target
  const tris0 = (e) => parts.reduce((s, p) => s + (simplified(p, e).index.length / 3) * p.instances.length, 0);
  const e0 = searchError(tris0, cfg.lod.lod0, cfg.lod.minErr ?? 0.0001);
  const meshes = new Map(parts.map((p) => [p, finalMesh(p, e0, cfg.creaseDeg ?? CREASE_DEG)]));
  // LOD1: from LOD0's vertices, at least twice LOD0's error
  const lod1Cache = new Map();
  const lod1Of = (p, e) => {
    const k = p.key + '|' + e;
    let r = lod1Cache.get(k);
    if (!r) lod1Cache.set(k, (r = lod1Indices(meshes.get(p), e * p.errScale, { sloppy: cfg.lod.sloppyLod1 === true })));
    return r;
  };
  const tris1 = (e) => parts.reduce((s, p) => s + (lod1Of(p, e).index.length / 3) * p.instances.length, 0);
  // LOD1's error stays within 10× LOD0's: a part that cannot get simpler keeps its triangles
  // (cracked CAD exports lock their open borders) instead of being crushed by a huge error
  const e1 = searchError(tris1, cfg.lod.lod1, Math.max(e0 * 2, cfg.lod.minErr1 ?? 0), cfg.lod.maxErr1 ?? Math.max(e0 * 10, 0.002));
  let maxErr0 = 0;
  for (const m of meshes.values()) maxErr0 = Math.max(maxErr0, m.error);
  let maxErr1 = 0;
  for (const p of parts) maxErr1 = Math.max(maxErr1, lod1Of(p, e1).error * 1);

  // root transform: source Z-up / +X front → glTF Y-up / +Z front, plus yaw; rotation of an MJCF root body kept
  const rootQ = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad((cfg.yawDeg ?? 0) - 90))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  const rootLinkRot = new THREE.Quaternion();
  const rootLinkData = desc.links.get(tree.root);
  // an MJCF root body's own rotation is kept unless the entry says it only places the model in a scene
  if (rootLinkData?.rootMatrix && cfg.keepRootRotation !== false) rootLinkData.rootMatrix.decompose(new THREE.Vector3(), rootLinkRot, new THREE.Vector3());
  rootQ.multiply(rootLinkRot);
  // presentation turn in the glTF frame (e.g. a hand standing upright on a column)
  if (cfg.viewRotationDeg) rootQ.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...cfg.viewRotationDeg.map((d) => THREE.MathUtils.degToRad(d)), 'XYZ')));
  const rotM = new THREE.Matrix4().makeRotationFromQuaternion(rootQ);

  // bodies in tree order (the skin's joint order)
  const bodyNames = [];
  for (const l of tree.order) if (tree.body.get(l) === l && parts.some((p) => p.instances.some((i) => i.body === l))) bodyNames.push(l);
  const bodyIndex = new Map(bodyNames.map((b, i) => [b, i]));

  // default pose (keyframe name or explicit values) → floor offset and silhouette
  const defaultPose = typeof cfg.defaultPose === 'string' ? desc.poses[cfg.defaultPose] ?? {} : cfg.defaultPose ?? {};
  if (typeof cfg.defaultPose === 'string' && !desc.poses[cfg.defaultPose]) console.warn(`[${cfg.id}] keyframe "${cfg.defaultPose}" not found`);
  const movable = desc.joints.filter((j) => MOVABLE.has(j.type));
  const posedDefault = {};
  for (const j of movable) if (j.name in defaultPose) posedDefault[j.name] = defaultPose[j.name];

  // assemble one vertex buffer (scene space at rest, before the floor offset)
  const restNoFloor = forward(tree, desc, rotM, {});
  const V = { pos: [], nrm: [], col: [], jnt: [] };
  const I0 = [];
  const I1 = [];
  const bodyAabb = new Map();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const p of parts) {
    const m = meshes.get(p);
    const l1 = lod1Of(p, e1).index;
    for (const inst of p.instances) {
      const M = restNoFloor.get(inst.body).clone().multiply(inst.matrix);
      nm.getNormalMatrix(M);
      const flip = M.determinant() < 0;
      const off = V.pos.length / 3;
      const bi = bodyIndex.get(inst.body);
      const local = inst.matrix;
      let bb = bodyAabb.get(inst.body);
      if (!bb) bodyAabb.set(inst.body, (bb = new THREE.Box3()));
      for (let i = 0; i < m.pos.length; i += 3) {
        v.set(m.pos[i], m.pos[i + 1], m.pos[i + 2]);
        bb.expandByPoint(v.clone().applyMatrix4(local));
        v.applyMatrix4(M);
        V.pos.push(v.x, v.y, v.z);
        v.set(m.nrm[i], m.nrm[i + 1], m.nrm[i + 2]).applyMatrix3(nm).normalize();
        V.nrm.push(v.x, v.y, v.z);
        if (m.col) V.col.push(m.col[i], m.col[i + 1], m.col[i + 2]);
        else V.col.push(inst.color[0], inst.color[1], inst.color[2]);
        V.jnt.push(bi);
      }
      const push = (dst, idx) => {
        for (let f = 0; f < idx.length; f += 3) {
          if (flip) dst.push(idx[f] + off, idx[f + 2] + off, idx[f + 1] + off);
          else dst.push(idx[f] + off, idx[f + 1] + off, idx[f + 2] + off);
        }
      };
      push(I0, m.index);
      push(I1, l1);
    }
  }

  // floor: lowest point of LOD0 in the default pose
  const posed = forward(tree, desc, rotM, posedDefault);
  const box = new THREE.Box3();
  const boxRest = new THREE.Box3();
  const inv = new Map(bodyNames.map((b) => [b, restNoFloor.get(b).clone().invert()]));
  const toPosed = new Map(bodyNames.map((b) => [b, posed.get(b).clone().multiply(inv.get(b))]));
  for (let i = 0; i < V.jnt.length; i++) {
    v.set(V.pos[i * 3], V.pos[i * 3 + 1], V.pos[i * 3 + 2]);
    boxRest.expandByPoint(v);
    box.expandByPoint(v.applyMatrix4(toPosed.get(bodyNames[V.jnt[i]])));
  }
  const floorY = cfg.floor === 'origin' ? 0 : -box.min.y;
  const rootM = new THREE.Matrix4().makeTranslation(0, floorY, 0).multiply(rotM);
  const floorM = new THREE.Matrix4().makeTranslation(0, floorY, 0);
  for (let i = 0; i < V.pos.length; i += 3) V.pos[i + 1] += floorY;
  box.translate(new THREE.Vector3(0, floorY, 0));
  boxRest.translate(new THREE.Vector3(0, floorY, 0));
  const rest = forward(tree, desc, rootM, {});

  // conservative bounding sphere for any pose: chain length from the root to each body + its extent
  const chainLen = new Map([[tree.root, 0]]);
  for (const l of tree.order) {
    for (const j of tree.childrenOf.get(l) ?? []) {
      const t = new THREE.Vector3().setFromMatrixPosition(j.origin).length();
      const travel = j.type === 'prismatic' && j.limit ? Math.max(Math.abs(j.limit.lower ?? 0), Math.abs(j.limit.upper ?? 0)) : 0;
      chainLen.set(j.child, chainLen.get(l) + t + travel);
    }
  }
  let radius = 0;
  for (const b of bodyNames) {
    const bb = bodyAabb.get(b);
    if (!bb || bb.isEmpty()) continue; // every triangle of this body simplified away
    const sq = (a, b) => Math.max(a * a, b * b);
    const ext = Math.sqrt(sq(bb.min.x, bb.max.x) + sq(bb.min.y, bb.max.y) + sq(bb.min.z, bb.max.z));
    radius = Math.max(radius, chainLen.get(b) + ext + 1e-3);
  }
  const center = new THREE.Vector3().setFromMatrixPosition(rest.get(tree.root));

  // silhouette (L2): LOD1 in the default pose, one static mesh, topology-free clustering
  const l2 = buildSilhouette(V, I1, bodyNames, toPosed, floorM, cfg.lod.l2 ?? 3000);
  // articulated LOD2 (crowds, far ghosts): a third index list over LOD0's vertices, clustered per body
  const lod2 = cfg.lod.lod2 ? buildLod2(V, I0, bodyNames.length, cfg.lod.lod2) : null;

  // inertials from the source (mass, centre of mass in the link frame)
  const inertials = [];
  for (const l of tree.order) {
    const ld = desc.links.get(l);
    if (ld?.mass > 0 && ld.com) inertials.push({ link: l, mass: r6(ld.mass), com: ld.com.map(r6) });
  }

  const stats = {
    sourceTris: report.sourceTris,
    lod0Tris: I0.length / 3,
    lod1Tris: I1.length / 3,
    l2Tris: l2.index.length / 3,
    vertices: V.jnt.length,
    lod0ErrorM: r6(e0),
    lod0MaxErrorM: r6(maxErr0),
    lod1ErrorM: r6(e1),
    lod1MaxErrorM: r6(maxErr1),
    l2ErrorM: r6(l2.errorM),
    lod2Tris: lod2 ? lod2.index.length / 3 : 0,
    lod2ErrorM: lod2 ? r6(lod2.errorM) : null,
    bodies: bodyNames.length,
    visuals: report.visuals,
  };
  const joints = desc.joints.map((j) => {
    const t = new THREE.Vector3();
    const q = new THREE.Quaternion();
    j.origin.decompose(t, q, new THREE.Vector3());
    return {
      name: j.name,
      type: j.type,
      parent: j.parent,
      child: j.child,
      origin: { xyz: t.toArray().map(r6), quat: q.toArray().map(r6) },
      axis: j.axis.map(r6),
      ...(MOVABLE.has(j.type) ? { limit: j.limit ? { lower: j.limit.lower === null ? null : r6(j.limit.lower), upper: j.limit.upper === null ? null : r6(j.limit.upper) } : null } : {}),
      ...(j.mimic ? { mimic: j.mimic } : {}),
      ...(j.ref ? { ref: r6(j.ref) } : {}),
      ...(j.generated ? { generated: true } : {}),
    };
  });
  const rootT = new THREE.Vector3();
  const rootQout = new THREE.Quaternion();
  rootM.decompose(rootT, rootQout, new THREE.Vector3());
  return {
    cfg,
    desc,
    tree,
    root,
    fkSource,
    report,
    stats,
    bodyNames,
    V,
    I0,
    I1,
    I2: lod2 ? lod2.index : null,
    l2,
    inertials,
    rest,
    rootM,
    joints,
    movable: movable.map((j) => j.name),
    defaultPose: posedDefault,
    poses: desc.poses,
    rootTransform: { translation: rootT.toArray().map(r6), quaternion: rootQout.toArray().map(r6) },
    bounds: {
      sphere: { center: center.toArray().map(r6), radius: r6(radius) },
      defaultAabb: { min: box.min.toArray().map(r4), max: box.max.toArray().map(r4) },
      restAabb: { min: boxRest.min.toArray().map(r4), max: boxRest.max.toArray().map(r4) },
      heightM: r4(box.max.y - box.min.y),
      restHeightM: r4(boxRest.max.y - boxRest.min.y),
    },
    bodyAabb: Object.fromEntries([...bodyAabb].map(([b, bb]) => [b, { min: bb.min.toArray().map(r4), max: bb.max.toArray().map(r4) }])),
    // switch where the reached error (meshopt's own measure, never above the bound) is half a pixel
    switchM: (() => {
      const d1 = halfPixelDistance(Math.max(maxErr1, e0));
      const d2 = lod2 ? Math.max(halfPixelDistance(lod2.errorM), d1 * 1.5) : null;
      return { lod1: r4(d1), lod2: d2 === null ? null : r4(d2), silhouette: r4(Math.max(halfPixelDistance(l2.errorM), (d2 ?? d1) * (d2 ? 1.25 : 2))) };
    })(),
    ms: Math.round(performance.now() - t0),
  };
}

/**
 * LOD2: per body, LOD0's triangles clustered topology-free (meshopt simplifySloppy) down to a share
 * of `maxTris`; every kept vertex is one of LOD0's, so the result is one more index list on the same
 * skinned vertex buffer and stays articulated. Returns the indices and the largest error (m).
 */
function buildLod2(V, I0, nBodies, maxTris) {
  const P = V.pos;
  const byBody = Array.from({ length: nBodies }, () => []);
  for (let f = 0; f < I0.length; f += 3) byBody[V.jnt[I0[f]]].push(I0[f], I0[f + 1], I0[f + 2]);
  // compact per-body vertex buffers (meshopt measures the relative error against the given vertices)
  const bodies = byBody.map((idx) => {
    const map = new Map();
    const local = new Uint32Array(idx.length);
    const pos = [];
    idx.forEach((g, k) => {
      let l = map.get(g);
      if (l === undefined) {
        l = pos.length / 3;
        map.set(g, l);
        pos.push(P[g * 3], P[g * 3 + 1], P[g * 3 + 2]);
      }
      local[k] = l;
    });
    return { local, pos: new Float32Array(pos), back: [...map.keys()], tris: idx.length / 3 };
  });
  const total = bodies.reduce((s, b) => s + b.tris, 0);
  const run = (scale) => {
    const idx = [];
    let err = 0;
    for (const b of bodies) {
      if (!b.tris) continue;
      const want = Math.max(4, Math.round((maxTris * scale * b.tris) / total));
      if (b.tris <= want) {
        for (const l of b.local) idx.push(b.back[l]);
        continue;
      }
      const [sl, e] = MeshoptSimplifier.simplifySloppy(b.local, b.pos, 3, null, want * 3, 1);
      err = Math.max(err, e * MeshoptSimplifier.getScale(b.pos, 3));
      for (const l of sl) idx.push(b.back[l]);
    }
    return { index: idx, errorM: err };
  };
  // the clustering undershoots its targets on small bodies: search the largest share scale that fits
  let lo = 0.05;
  let hi = 6;
  let best = run(lo);
  for (let i = 0; i < 10; i++) {
    const mid = Math.sqrt(lo * hi);
    const r = run(mid);
    if (r.index.length / 3 <= maxTris) {
      best = r;
      lo = mid;
    } else hi = mid;
  }
  return best;
}

function buildSilhouette(V, I1, bodyNames, toPosed, floorM, maxTris) {
  const pos = [];
  const col = [];
  const v = new THREE.Vector3();
  // LOD1 as a triangle soup in the default pose (the weld in buildBase re-joins it)
  for (let k = 0; k < I1.length; k++) {
    const i = I1[k];
    v.set(V.pos[i * 3], V.pos[i * 3 + 1], V.pos[i * 3 + 2]);
    const fy = new THREE.Vector3().setFromMatrixPosition(floorM).y;
    v.y -= fy;
    v.applyMatrix4(toPosed.get(bodyNames[V.jnt[i]]));
    v.y += fy;
    pos.push(v.x, v.y, v.z);
    col.push(V.col[i * 3], V.col[i * 3 + 1], V.col[i * 3 + 2]);
  }
  const base = buildBase(new Float32Array(pos), new Float32Array(col));
  const { index, errorM } = sloppyTo(base.vpos, base.index, maxTris);
  // meshopt's own error estimate of the clustering (metres); it drives the switch distance
  return { ...withNormals(base, index), errorM };
}

// ── glTF documents ──────────────────────────────────────────────────────────

function quantizePositions(pos, bits = 14) {
  const n = pos.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i * 3 + k]);
      max[k] = Math.max(max[k], pos[i * 3 + k]);
    }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const steps = (1 << bits) - 1;
  const s = extent / steps;
  const q = new Int16Array(n * 3);
  for (let i = 0; i < n * 3; i++) q[i] = Math.round((pos[i] - min[i % 3]) / s);
  // dequantization: p = min + s · q
  const D = new THREE.Matrix4().makeTranslation(min[0], min[1], min[2]).multiply(new THREE.Matrix4().makeScale(s, s, s));
  return { q, D, s, min };
}

function positionBits(P, err) {
  const bb = new THREE.Box3().setFromArray(P);
  const extent = Math.max(...bb.getSize(new THREE.Vector3()).toArray());
  return Math.min(14, Math.max(11, Math.ceil(Math.log2(extent / Math.max(err / 4, 1e-6)))));
}

const toI8 = (a) => Int8Array.from(a, (x) => Math.max(-127, Math.min(127, Math.round(x * 127))));
const toU8 = (a) => Uint8Array.from(a, (x) => Math.max(0, Math.min(255, Math.round(x * 255))));

function newDoc(cfg, meta) {
  const doc = new Document();
  doc.createBuffer();
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const asset = doc.getRoot().getAsset();
  asset.generator = 'EmAI robot pipeline (tools/robots), glTF-Transform';
  asset.copyright = meta.copyright;
  asset.extras = { emai: meta.extras };
  return doc;
}

/** The skinned GLB: root node + link nodes, LOD0 and LOD1 mesh nodes on one skin. */
export function robotDocument(r, meta) {
  const { cfg, desc, tree, V, I0, I1, bodyNames, rest, rootM } = r;
  const doc = newDoc(cfg, meta);
  const scene = doc.createScene(cfg.id);
  doc.getRoot().setDefaultScene(scene);
  const mat = doc.createMaterial('robot-paint').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.55).setMetallicFactor(0);
  const rootNode = doc.createNode(`robot:${cfg.id}`);
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  rootM.decompose(t, q, s);
  rootNode.setTranslation(t.toArray()).setRotation(q.toArray()).setExtras({ robot: cfg.id });
  scene.addChild(rootNode);
  const nodes = new Map();
  const make = (link, parent) => {
    const n = doc.createNode(link);
    const j = tree.jointByChild.get(link);
    if (j) {
      j.origin.decompose(t, q, s);
      n.setTranslation(t.toArray()).setRotation(q.toArray());
      const jd = { name: j.name, type: j.type, axis: j.axis };
      if (MOVABLE.has(j.type)) {
        jd.limit = j.limit ? { lower: j.limit.lower, upper: j.limit.upper } : null;
        if (j.mimic) jd.mimic = j.mimic;
        if (j.ref) jd.ref = j.ref;
      }
      n.setExtras({ link, joint: jd, ...(desc.links.get(link)?.frameOnly ? { frame: true } : {}) });
    } else n.setExtras({ link, root: true });
    parent.addChild(n);
    nodes.set(link, n);
    for (const cj of tree.childrenOf.get(link) ?? []) make(cj.child, n);
  };
  make(tree.root, rootNode);

  // vertex order for compression (LOD1 only uses LOD0's vertices, so one remap serves both)
  const idx0 = new Uint32Array(I0);
  const nv = V.jnt.length;
  const [remap, unique] = MeshoptEncoder.reorderMesh(idx0, true, true);
  const idx1 = Uint32Array.from(I1, (i) => {
    const m = remap[i];
    if (m === 0xffffffff) throw new Error(`${cfg.id}: LOD1 uses a vertex LOD0 does not`);
    return m;
  });
  const P = new Float32Array(unique * 3);
  const N = new Float32Array(unique * 3);
  const C = new Float32Array(unique * 3);
  const J = new Uint8Array(unique * 4);
  for (let i = 0; i < nv; i++) {
    const d = remap[i];
    if (d === 0xffffffff) continue;
    for (let k = 0; k < 3; k++) {
      P[d * 3 + k] = V.pos[i * 3 + k];
      N[d * 3 + k] = V.nrm[i * 3 + k];
      C[d * 3 + k] = V.col[i * 3 + k];
    }
    J[d * 4] = V.jnt[i];
  }
  // position steps of at most a quarter of LOD0's error (11–14 bits over the model's extent)
  const { q: Pq, D } = quantizePositions(P, positionBits(P, r.stats.lod0ErrorM));
  const W = new Uint8Array(unique * 4);
  for (let i = 0; i < unique; i++) W[i * 4] = 255;
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr, normalized = false) => doc.createAccessor().setType(type).setArray(arr).setNormalized(normalized).setBuffer(buf);
  const aPos = acc('VEC3', Pq);
  const aNrm = acc('VEC3', toI8(N), true);
  const aCol = acc('VEC3', toU8(C), true);
  const aJnt = acc('VEC4', J);
  const aWgt = acc('VEC4', W, true);

  const skin = doc.createSkin(`${cfg.id}-skin`).setSkeleton(rootNode);
  const ibm = new Float32Array(bodyNames.length * 16);
  bodyNames.forEach((b, i) => {
    skin.addJoint(nodes.get(b));
    rest.get(b).clone().invert().multiply(D).toArray(ibm, i * 16);
  });
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
  const idx2 = r.I2 ? Uint32Array.from(r.I2, (i) => remap[i]) : null;
  for (const [lod, idx] of [
    ['lod0', idx0],
    ['lod1', idx1],
    ...(idx2 ? [['lod2', idx2]] : []),
  ]) {
    const prim = doc
      .createPrimitive()
      .setMaterial(mat)
      .setAttribute('POSITION', aPos)
      .setAttribute('NORMAL', aNrm)
      .setAttribute('COLOR_0', aCol)
      .setAttribute('JOINTS_0', aJnt)
      .setAttribute('WEIGHTS_0', aWgt)
      .setIndices(acc('SCALAR', unique > 65535 ? idx : new Uint16Array(idx)));
    const mesh = doc.createMesh(`${cfg.id}__${lod}`).addPrimitive(prim);
    scene.addChild(doc.createNode(`${cfg.id}__${lod}`).setMesh(mesh).setSkin(skin).setExtras({ lod }));
  }
  return doc;
}

/** The static far silhouette GLB (default pose, one mesh; dequantized by its node transform). */
export function silhouetteDocument(r, meta) {
  const { cfg, l2 } = r;
  const doc = newDoc(cfg, meta);
  const scene = doc.createScene(`${cfg.id}-l2`);
  doc.getRoot().setDefaultScene(scene);
  const mat = doc.createMaterial('robot-paint').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.55).setMetallicFactor(0);
  const idx = new Uint32Array(l2.index);
  const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, true);
  const P = new Float32Array(unique * 3);
  const N = new Float32Array(unique * 3);
  const C = new Float32Array(unique * 3);
  for (let i = 0; i < l2.pos.length / 3; i++) {
    const d = remap[i];
    if (d === 0xffffffff) continue;
    for (let k = 0; k < 3; k++) {
      P[d * 3 + k] = l2.pos[i * 3 + k];
      N[d * 3 + k] = l2.nrm[i * 3 + k];
      C[d * 3 + k] = l2.col[i * 3 + k];
    }
  }
  const { q: Pq, s, min } = quantizePositions(P, 12);
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr, normalized = false) => doc.createAccessor().setType(type).setArray(arr).setNormalized(normalized).setBuffer(buf);
  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', acc('VEC3', Pq))
    .setAttribute('NORMAL', acc('VEC3', toI8(N), true))
    .setAttribute('COLOR_0', acc('VEC3', toU8(C), true))
    .setIndices(acc('SCALAR', unique > 65535 ? idx : new Uint16Array(idx)));
  const mesh = doc.createMesh(`${cfg.id}__l2`).addPrimitive(prim);
  scene.addChild(doc.createNode(`${cfg.id}__l2`).setMesh(mesh).setTranslation(min).setScale([s, s, s]).setExtras({ lod: 'l2', robot: cfg.id }));
  return doc;
}
