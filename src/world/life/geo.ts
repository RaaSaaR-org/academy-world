/**
 * WP15: small geometry helpers for life and the eggs. Everything is built from primitives with a
 * per-vertex colour (no uv, no textures) and drawn with ONE material, the robots' shared paint
 * (ctx.robots.paint: vertex colours, matte), whose plain, instanced and instanced-tinted programs the
 * boot warm-up already compiles (WP4 robots.ts buildWarmup) — so life links no program after the title.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Plan §2.7 palette and the people's accents (matte stone base, olive / sand / slate). */
export const PAL = {
  stone: 0xd6d3d1,
  stoneDark: 0xa8a29e,
  white: 0xe7e5e4,
  carbon: 0x2a2622,
  slate: 0x5b6470,
  olive: 0x6f7a50,
  sand: 0xb9a68a,
  timberSilver: 0x9a9188,
  timberFresh: 0xb9a68a,
  clay: 0xb08a72,
  soil: 0x857a6c,
  crop: 0x5f7046,
  leaf: 0x56693f,
  /** ripe tomatoes read deep red, never brand orange (§2.7 rule 5) */
  tomato: 0xb5332a,
  tomatoUnripe: 0x7d8c45,
  teal: 0x2dd4bf,
  amber: 0xfbbf24,
  water: 0x5e6b66,
  paper: 0xe8dfc8,
  yellow: 0xfbbf24,
};

/** A geometry with one constant vertex colour; non-indexed, uv dropped (merge-ready). */
export function col(g: THREE.BufferGeometry, hex: THREE.ColorRepresentation): THREE.BufferGeometry {
  const gg = g.index ? g.toNonIndexed() : g;
  if (g !== gg) g.dispose();
  if (gg.getAttribute('uv')) gg.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = gg.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return gg;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Place a geometry: translate (x, y, z) and rotate (rx, ry, rz) about its own origin first. */
export function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
  return g.applyMatrix4(_m);
}

/** A coloured box centred at (x, y, z). */
export function box(w: number, h: number, d: number, hex: THREE.ColorRepresentation, x = 0, y = 0, z = 0, ry = 0): THREE.BufferGeometry {
  return at(col(new THREE.BoxGeometry(w, h, d), hex), x, y, z, 0, ry, 0);
}

/** Merge coloured parts (position, normal, color) into one geometry. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of parts) {
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'color') g.deleteAttribute(n);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
  }
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!m) throw new Error('[life] mergeGeometries failed');
  m.computeBoundingSphere();
  return m;
}

/** Triangles of a geometry (the ≤ 300 rule of the vitrine objects). */
export function triangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/**
 * The unit part of the people and the props: a soft box spanning x, z ∈ [−0.5, 0.5] and y ∈ [−1, 0]
 * (pivot at its top: a limb hangs from its joint), white so the instance colour is the colour.
 */
export function unitPart(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.42, 1, 8, 1);
  g.translate(0, -0.5, 0);
  // round the ends a little (a capsule-like limb at 34 triangles)
  return col(g, 0xffffff);
}

/** A unit flat quad on the floor (x, z ∈ [−0.5, 0.5], y = 0, facing up): safety rings and A* tiles. */
export function unitTile(): THREE.BufferGeometry {
  return col(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0xffffff);
}
