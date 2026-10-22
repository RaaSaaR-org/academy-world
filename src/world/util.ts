import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '@/core/zones';
import { DEG } from './layout';

/** Deterministic RNG (all procedural geometry is seeded → identical screenshots). */
export function rng(seed: number): () => number {
  return mulberry32(seed);
}

// ── value noise (cheap, deterministic) ───────────────────────────────────────

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}
const fade = (t: number): number => t * t * (3 - 2 * t);

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = fade(x - xi),
    yf = fade(y - yi),
    zf = fade(z - zi);
  const l = THREE.MathUtils.lerp;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

export function fbm3(x: number, y: number, z: number, oct = 4): number {
  let v = 0,
    a = 0.5,
    f = 1,
    n = 0;
  for (let i = 0; i < oct; i++) {
    v += a * noise3(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return v / n;
}

// ── geometry helpers ─────────────────────────────────────────────────────────

/** Merge geometries (all converted to non-indexed when mixing). */
export function merge(geos: THREE.BufferGeometry[], groups = false): THREE.BufferGeometry {
  const anyIndexed = geos.some((g) => g.index);
  const anyNon = geos.some((g) => !g.index);
  const list = anyIndexed && anyNon ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
  // keep only common attributes
  const names = Object.keys(list[0].attributes).filter((n) => list.every((g) => g.getAttribute(n)));
  for (const g of list) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  const m = mergeGeometries(list, groups);
  if (!m) throw new Error('mergeGeometries failed');
  for (const g of geos) g.dispose();
  return m;
}

/** Paint a constant vertex colour onto a geometry (for merged multi-tone meshes). */
export function tint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Matrix for a unit box (1×1×1, centred) stretched between two points with a w×h cross-section. */
export function beamMatrix(a: THREE.Vector3Like, b: THREE.Vector3Like, w: number, h = w, out = new THREE.Matrix4()): THREE.Matrix4 {
  _a.set(a.x, a.y, a.z);
  _b.set(b.x, b.y, b.z);
  const len = _a.distanceTo(_b);
  const dir = _b.clone().sub(_a).normalize();
  // align local +Y with dir
  _q.setFromUnitVectors(_up, dir);
  _s.set(w, len, h);
  const mid = _a.add(_b).multiplyScalar(0.5);
  return out.compose(mid, _q, _s);
}

/** Instanced unit-box beams. */
export function beams(list: { a: THREE.Vector3Like; b: THREE.Vector3Like; w: number; h?: number }[], material: THREE.Material, geo?: THREE.BufferGeometry): THREE.InstancedMesh {
  const g = geo ?? new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(g, material, Math.max(1, list.length));
  list.forEach((l, i) => mesh.setMatrixAt(i, beamMatrix(l.a, l.b, l.w, l.h ?? l.w, _m4)));
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Flat polygon strip (quad) on the ground between two points, width w, at height y. */
export function groundStrip(x0: number, z0: number, x1: number, z1: number, w: number, y: number, uvScale = 1): THREE.BufferGeometry {
  const dx = x1 - x0,
    dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const nx = (-dz / len) * (w / 2),
    nz = (dx / len) * (w / 2);
  const pos = new Float32Array([x0 + nx, y, z0 + nz, x0 - nx, y, z0 - nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz]);
  const uv = new Float32Array([0, 0, w / uvScale, 0, 0, len / uvScale, w / uvScale, len / uvScale]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return faceUp(g);
}

/**
 * Flat annulus sector (on y) between radii r0/r1 and bearings b0/b1 (degrees, clockwise),
 * with world-XZ UVs scaled by `uvScale` metres per unit.
 */
export function annulus(r0: number, r1: number, b0: number, b1: number, y: number, seg: number, uvScale = 1, rings = 1, polarUv = false): THREE.BufferGeometry {
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const rm = (r0 + r1) / 2;
  for (let j = 0; j <= rings; j++) {
    const r = r0 + ((r1 - r0) * j) / rings;
    for (let i = 0; i <= seg; i++) {
      const bd = b0 + ((b1 - b0) * i) / seg;
      const b = bd * DEG;
      const x = Math.sin(b) * r,
        z = -Math.cos(b) * r;
      pos.push(x, y, z);
      if (polarUv) uv.push((r - r0) / uvScale, (bd * DEG * rm) / uvScale);
      else uv.push(x / uvScale, -z / uvScale);
    }
  }
  const w = seg + 1;
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * w + i,
        b = a + 1,
        c = a + w,
        d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return faceUp(g);
}

/** Fix winding so all face normals of a flat (XZ) geometry point up (+Y). */
export function faceUp(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex();
  const p = g.getAttribute('position');
  if (!idx) return g;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const arr = idx.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(p, arr[i]);
    b.fromBufferAttribute(p, arr[i + 1]);
    c.fromBufferAttribute(p, arr[i + 2]);
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    if (ny < 0) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
  }
  idx.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export const clamp = THREE.MathUtils.clamp;
export const smooth = THREE.MathUtils.smoothstep;
