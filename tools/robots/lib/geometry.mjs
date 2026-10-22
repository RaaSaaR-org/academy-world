// Part geometry: weld, colour clusters, simplification with an absolute error (metres), smoothing-
// group normals, and a LOD1 index list that reuses LOD0's vertices (so LOD1 costs one index buffer).
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;

/** Default crease angle of the smoothing groups (R7: 35°); a robot entry may set creaseDeg. */
export const CREASE_DEG = 35;
/** Corner colours closer than this (linear RGB distance) share one vertex. */
const COLOR_MERGE = 0.06;

/**
 * Weld a triangle soup by position (1 µm grid) and split each welded point by colour cluster.
 * @param {Float32Array} pos 9 floats per triangle (metres)
 * @param {Float32Array | null} col 9 floats per triangle (linear RGB per corner) or null (uniform)
 * @returns {{ vpos: Float32Array, vcol: Float32Array | null, posId: Uint32Array, index: Uint32Array, rawTris: number }}
 */
export function buildBase(pos, col, weld = 1e-6) {
  const q = 1 / weld;
  const nc = pos.length / 3;
  const grid = new Map();
  const cornerPos = new Uint32Array(nc);
  const points = [];
  for (let c = 0; c < nc; c++) {
    const x = pos[c * 3];
    const y = pos[c * 3 + 1];
    const z = pos[c * 3 + 2];
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = grid.get(key);
    if (id === undefined) {
      id = points.length / 3;
      grid.set(key, id);
      points.push(x, y, z);
    }
    cornerPos[c] = id;
  }
  // drop triangles that collapse on the weld grid
  const keep = [];
  for (let t = 0; t < nc / 3; t++) {
    const a = cornerPos[t * 3];
    const b = cornerPos[t * 3 + 1];
    const d = cornerPos[t * 3 + 2];
    if (a !== b && b !== d && a !== d) keep.push(t);
  }
  const vpos = [];
  const vcol = col ? [] : null;
  const posId = [];
  const index = new Uint32Array(keep.length * 3);
  if (!col) {
    // one vertex per welded point
    const map = new Int32Array(points.length / 3).fill(-1);
    keep.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const p = cornerPos[t * 3 + k];
        if (map[p] < 0) {
          map[p] = vpos.length / 3;
          vpos.push(points[p * 3], points[p * 3 + 1], points[p * 3 + 2]);
          posId.push(p);
        }
        index[i * 3 + k] = map[p];
      }
    });
  } else {
    // greedy colour clusters per point
    const clusters = new Map(); // point → [{ r, g, b, n, v }]
    keep.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const c = t * 3 + k;
        const p = cornerPos[c];
        const r = col[c * 3];
        const g = col[c * 3 + 1];
        const b = col[c * 3 + 2];
        let list = clusters.get(p);
        if (!list) clusters.set(p, (list = []));
        let hit = null;
        for (const cl of list) {
          const dr = cl.r / cl.n - r;
          const dg = cl.g / cl.n - g;
          const db = cl.b / cl.n - b;
          if (dr * dr + dg * dg + db * db < COLOR_MERGE * COLOR_MERGE) {
            hit = cl;
            break;
          }
        }
        if (!hit) {
          hit = { r: 0, g: 0, b: 0, n: 0, v: vpos.length / 3 };
          list.push(hit);
          vpos.push(points[p * 3], points[p * 3 + 1], points[p * 3 + 2]);
          vcol.push(0, 0, 0);
          posId.push(p);
        }
        hit.r += r;
        hit.g += g;
        hit.b += b;
        hit.n++;
        index[i * 3 + k] = hit.v;
      }
    });
    for (const list of clusters.values())
      for (const cl of list) {
        vcol[cl.v * 3] = cl.r / cl.n;
        vcol[cl.v * 3 + 1] = cl.g / cl.n;
        vcol[cl.v * 3 + 2] = cl.b / cl.n;
      }
  }
  return { vpos: new Float32Array(vpos), vcol: vcol ? new Float32Array(vcol) : null, posId: new Uint32Array(posId), index, rawTris: pos.length / 9 };
}

/** Simplify a base with an absolute error (m). Returns the kept index list and the reached error. */
export function simplifyBase(base, err, { prune = true } = {}) {
  const flags = prune ? ['ErrorAbsolute', 'Prune'] : ['ErrorAbsolute'];
  if (err <= 0 || base.index.length === 0) return { index: base.index, error: 0 };
  let out;
  let e;
  if (base.vcol) {
    // colour costs as much as `err` per 0.25 of linear colour difference
    const w = (err / 0.25) * 1;
    [out, e] = MeshoptSimplifier.simplifyWithAttributes(base.index, base.vpos, 3, base.vcol, 3, [w, w, w], null, 0, err, flags);
  } else {
    [out, e] = MeshoptSimplifier.simplify(base.index, base.vpos, 3, 0, err, flags);
  }
  return { index: dropDegenerate(base.vpos, out), error: e };
}

/** Remove zero-area triangles (a zero normal fails the glTF validator). */
export function dropDegenerate(P, I) {
  const keep = [];
  for (let f = 0; f < I.length; f += 3) {
    const a = I[f] * 3;
    const b = I[f + 1] * 3;
    const c = I[f + 2] * 3;
    const ux = P[b] - P[a];
    const uy = P[b + 1] - P[a + 1];
    const uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a];
    const vy = P[c + 1] - P[a + 1];
    const vz = P[c + 2] - P[a + 2];
    const x = uy * vz - uz * vy;
    const y = uz * vx - ux * vz;
    const z = ux * vy - uy * vx;
    if (x * x + y * y + z * z > 1e-24) keep.push(I[f], I[f + 1], I[f + 2]);
  }
  return keep.length === I.length ? I : new Uint32Array(keep);
}

/**
 * Smoothing-group normals on the simplified triangles. Around each welded POINT (not vertex: colour
 * seams share their normal), faces that share an edge with a dihedral angle below 35° form one
 * group. Output vertices = (input vertex, group): position, colour and an area-weighted normal.
 * @returns {{ pos: Float32Array, nrm: Float32Array, col: Float32Array | null, index: Uint32Array }}
 */
export function withNormals(base, index, creaseDeg = CREASE_DEG) {
  const CREASE_COS = Math.cos((creaseDeg * Math.PI) / 180);
  const P = base.vpos;
  const nf = index.length / 3;
  const fn = new Float64Array(nf * 3);
  const fu = new Float64Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const a = index[f * 3] * 3;
    const b = index[f * 3 + 1] * 3;
    const c = index[f * 3 + 2] * 3;
    const ux = P[b] - P[a];
    const uy = P[b + 1] - P[a + 1];
    const uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a];
    const vy = P[c + 1] - P[a + 1];
    const vz = P[c + 2] - P[a + 2];
    const x = uy * vz - uz * vy;
    const y = uz * vx - ux * vz;
    const z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z) || 1;
    fn[f * 3] = x;
    fn[f * 3 + 1] = y;
    fn[f * 3 + 2] = z;
    fu[f * 3] = x / l;
    fu[f * 3 + 1] = y / l;
    fu[f * 3 + 2] = z / l;
  }
  const pid = (v) => base.posId[v];
  // corners around each point
  const byPoint = new Map();
  for (let k = 0; k < index.length; k++) {
    const p = pid(index[k]);
    let l = byPoint.get(p);
    if (!l) byPoint.set(p, (l = []));
    l.push(k);
  }
  const outP = [];
  const outN = [];
  const outC = base.vcol ? [] : null;
  const cornerOut = new Uint32Array(index.length);
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const [p, corners] of byPoint) {
    parent.clear();
    const byOther = new Map();
    for (const k of corners) {
      const f = (k / 3) | 0;
      parent.set(f, f);
      for (let j = 0; j < 3; j++) {
        const o = pid(index[f * 3 + j]);
        if (o === p) continue;
        let l = byOther.get(o);
        if (!l) byOther.set(o, (l = []));
        l.push(f);
      }
    }
    for (const fs of byOther.values()) {
      for (let i = 1; i < fs.length; i++) {
        const a = fs[0];
        const b = fs[i];
        if (fu[a * 3] * fu[b * 3] + fu[a * 3 + 1] * fu[b * 3 + 1] + fu[a * 3 + 2] * fu[b * 3 + 2] >= CREASE_COS) parent.set(find(a), find(b));
      }
    }
    // normal per group (shared by the colour variants of the point)
    const groupN = new Map();
    for (const k of corners) {
      const f = (k / 3) | 0;
      const r = find(f);
      let n = groupN.get(r);
      if (!n) groupN.set(r, (n = [0, 0, 0]));
      n[0] += fn[f * 3];
      n[1] += fn[f * 3 + 1];
      n[2] += fn[f * 3 + 2];
    }
    const outVert = new Map(); // `${group}|${inputVertex}` → out index
    for (const k of corners) {
      const f = (k / 3) | 0;
      const r = find(f);
      const v = index[k];
      const key = r * 4294967296 + v;
      let o = outVert.get(key);
      if (o === undefined) {
        o = outP.length / 3;
        outVert.set(key, o);
        outP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        const n = groupN.get(r);
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        outN.push(n[0] / l, n[1] / l, n[2] / l);
        if (outC) outC.push(base.vcol[v * 3], base.vcol[v * 3 + 1], base.vcol[v * 3 + 2]);
      }
      cornerOut[k] = o;
    }
  }
  return { pos: new Float32Array(outP), nrm: new Float32Array(outN), col: outC ? new Float32Array(outC) : null, index: cornerOut };
}

/**
 * LOD1 from LOD0's final mesh: topology-aware simplification at err1, then (optionally) a
 * topology-free pass that also merges small separate parts. The result indexes LOD0's vertices.
 */
export function lod1Indices(mesh, err1, { sloppy = true, minTris = 24 } = {}) {
  const n0 = mesh.index.length / 3;
  if (n0 <= minTris) return { index: mesh.index, error: 0 };
  let [idx, e] = MeshoptSimplifier.simplify(mesh.index, mesh.pos, 3, 0, err1, ['ErrorAbsolute', 'Prune']);
  // topology-free clustering on top: always when asked (merges many small parts), and as a fallback
  // for parts the topology-aware pass cannot reduce (cracked CAD exports keep their open borders)
  const stuck = n0 > 300 && idx.length / 3 > 0.6 * n0;
  if ((sloppy || stuck) && idx.length > 3 * 64) {
    const scale = MeshoptSimplifier.getScale(mesh.pos, 3);
    const [sl, se] = MeshoptSimplifier.simplifySloppy(idx, mesh.pos, 3, null, 0, err1 / scale);
    if (sl.length >= 3) {
      idx = sl;
      e = Math.max(e, se * scale);
    }
  }
  return { index: dropDegenerate(mesh.pos, idx), error: e };
}

/** Topology-free reduction of a whole mesh to at most `maxTris` (the far silhouette). */
export function sloppyTo(pos, index, maxTris) {
  if (index.length / 3 <= maxTris) return { index, errorM: 0 };
  const [idx, e] = MeshoptSimplifier.simplifySloppy(index, pos, 3, null, maxTris * 3, 1);
  return { index: dropDegenerate(pos, idx), errorM: e * MeshoptSimplifier.getScale(pos, 3) };
}

/** Primitive shapes (URDF / MJCF) as triangle soups in their own frame (cylinders and capsules along +Z). */
export async function primitiveSoup(prim) {
  const THREE = await import('three');
  let g;
  if (prim.type === 'box') g = new THREE.BoxGeometry(prim.size[0], prim.size[1], prim.size[2]);
  else if (prim.type === 'sphere') g = new THREE.SphereGeometry(prim.radius, 24, 16);
  else if (prim.type === 'ellipsoid') {
    g = new THREE.SphereGeometry(1, 24, 16);
    g.scale(prim.radii[0], prim.radii[1], prim.radii[2]);
  } else if (prim.type === 'cylinder') {
    g = new THREE.CylinderGeometry(prim.radius, prim.radius, prim.length, 32);
    g.rotateX(Math.PI / 2);
  } else if (prim.type === 'capsule') {
    g = new THREE.CapsuleGeometry(prim.radius, prim.length, 8, 24);
    g.rotateX(Math.PI / 2);
  } else return null;
  const ni = g.toNonIndexed();
  return new Float32Array(ni.attributes.position.array);
}
