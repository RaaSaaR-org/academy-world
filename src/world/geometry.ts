import * as THREE from 'three';
import { DEG, outlineRadius } from './layout';
import { faceUp } from './util';

/** A ring of a polar mesh: radius per bearing (degrees) and the number of samples (must be equal or double the previous ring). */
export interface PolarRing {
  r: (bearing: number) => number;
  n: number;
}

/**
 * Flat polar mesh (y const) from concentric rings with sample doubling between rings
 * (no T-junctions — safe as a trimesh collider). World-XZ UVs (metres / uvScale).
 */
export function polarMesh(rings: PolarRing[], y: number, uvScale: number, down = false): THREE.BufferGeometry {
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const start: number[] = [];
  for (const ring of rings) {
    start.push(pos.length / 3);
    for (let i = 0; i < ring.n; i++) {
      const b = (i / ring.n) * 360;
      const r = ring.r(b);
      const x = Math.sin(b * DEG) * r,
        z = -Math.cos(b * DEG) * r;
      pos.push(x, y, z);
      uv.push(x / uvScale, -z / uvScale);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k],
      b = rings[k + 1];
    const sa = start[k],
      sb = start[k + 1];
    if (b.n === a.n) {
      for (let j = 0; j < a.n; j++) {
        const j1 = (j + 1) % a.n;
        idx.push(sa + j, sb + j, sa + j1, sa + j1, sb + j, sb + j1);
      }
    } else if (b.n === a.n * 2) {
      for (let j = 0; j < a.n; j++) {
        const c0 = sa + j,
          c1 = sa + ((j + 1) % a.n);
        const f0 = sb + 2 * j,
          f1 = sb + 2 * j + 1,
          f2 = sb + ((2 * j + 2) % b.n);
        idx.push(c0, f0, f1, c0, f1, c1, c1, f1, f2);
      }
    } else throw new Error('polarMesh: ring sample counts must be equal or doubled');
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  faceUp(g);
  if (down) flip(g);
  return g;
}

/** Reverse the winding (and normals) of an indexed geometry. */
export function flip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

export interface OutlineSample {
  b: number;
  r: number;
  x: number;
  z: number;
  /** outward unit normal (xz) */
  nx: number;
  nz: number;
  /** cumulative arc length (m) */
  s: number;
}

/** The solid deck outline sampled at n bearings (closed loop), optionally inset by `inset` metres. */
export function outlineSamples(n: number, inset = 0): OutlineSample[] {
  const pts: OutlineSample[] = [];
  for (let i = 0; i < n; i++) {
    const b = (i / n) * 360;
    const r = outlineRadius(b);
    pts.push({ b, r, x: Math.sin(b * DEG) * r, z: -Math.cos(b * DEG) * r, nx: 0, nz: 0, s: 0 });
  }
  // normals from neighbours
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n],
      q = pts[(i + 1) % n];
    const tx = q.x - p.x,
      tz = q.z - p.z;
    const l = Math.hypot(tx, tz) || 1;
    // outward = tangent rotated: bearing grows clockwise (from above) → outward = (−tz, tx)?
    let nx = -tz / l,
      nz = tx / l;
    const c = pts[i];
    if (nx * c.x + nz * c.z < 0) {
      nx = -nx;
      nz = -nz;
    }
    c.nx = nx;
    c.nz = nz;
  }
  if (inset) for (const c of pts) {
    c.x -= c.nx * inset;
    c.z -= c.nz * inset;
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].s = s;
  }
  return pts;
}

/**
 * Sweep a 2D profile along a 3D polyline. Profile points are (u = sideways along the
 * left normal, v = up). Returns an indexed geometry with smooth normals.
 */
export function sweep(path: THREE.Vector3[], profile: [number, number][], closed: boolean, closedProfile = true): THREE.BufferGeometry {
  const pos: number[] = [],
    idx: number[] = [],
    uv: number[] = [];
  const n = path.length;
  const up = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3(),
    side = new THREE.Vector3(),
    vup = new THREE.Vector3();
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    t.subVectors(b, a).normalize();
    side.crossVectors(up, t).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    vup.crossVectors(t, side).normalize();
    if (i > 0) s += p.distanceTo(path[i - 1]);
    for (let k = 0; k < profile.length; k++) {
      const [u, v] = profile[k];
      pos.push(p.x + side.x * u + vup.x * v, p.y + side.y * u + vup.y * v, p.z + side.z * u + vup.z * v);
      uv.push(s, k / (profile.length - (closedProfile ? 0 : 1)));
    }
  }
  const m = profile.length;
  const segs = closed ? n : n - 1;
  const pm = closedProfile ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % n;
    for (let k = 0; k < pm; k++) {
      const k1 = (k + 1) % m;
      const a = i * m + k,
        b = i * m + k1,
        c = i1 * m + k,
        d = i1 * m + k1;
      // profile runs counter-clockwise in the (side, up) plane → this winding faces outward
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Circle profile for `sweep`. */
export function circleProfile(radius: number, seg = 6): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return out;
}
