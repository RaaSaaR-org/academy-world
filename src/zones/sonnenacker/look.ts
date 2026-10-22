/**
 * Sonnenacker look (plan §2.7, D42; R8 §4.6): solarpunk, but believable. The ground tokens of §2.7
 * (warm-neutral), weathered larch, clay only on the Hofladen roof, carbon-dark PV glass on alu, orange
 * only on what moves (the arms' jaws, the slew drives), teal only for data (soil-moisture stake tips,
 * the arms' camera rings and status lamps). Ripe tomatoes read deep red (#B5332A), never brand orange.
 *
 * Geometry helpers for the static batches: everything static is built as plain meshes with cached
 * standard materials and baked by ctx.mergeStatic (one draw per tier); instanced crowds use the
 * robots' shared vertex-colour paint (its instanced variants are compiled at boot, so nothing here
 * links a program on its first frame).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZoneContext } from '@/core/zones';

/** §2.7 rule 4 ground tokens, plus the farm's own materials. */
export const TOK = {
  soil: 0x857a6c,
  soilDark: 0x6b6156,
  grassDry: 0xa39c7a,
  grassGreen: 0x6f7a50,
  crop: 0x5f7046,
  timberSilver: 0x9a9188,
  timberFresh: 0xb9a68a,
  timberDark: 0x7d756c,
  chips: 0x8f806c,
  clay: 0xb08a72,
  water: 0x5e6b66,
  gravel: 0x8f887b,
  alu: 0xbab7b1,
  ceramic: 0xd9d3c9,
  carbon: 0x262322,
  pv: 0x1d2128,
  leaf: 0x56683f,
  leafDark: 0x465633,
  leafLight: 0x6d7f4a,
  leafOld: 0x8e8f52,
  stake: 0x8a7a62,
  hedge: 0x4d5a39,
  reed: 0x8f8a5c,
  flowers: [0xd8cf9e, 0xb9a9c2, 0xe4e0d6, 0xc7ad78, 0xa7b3c4],
  tomato: 0xb5332a,
  white: 0xe7e5e4,
  servo: 0x1c1917,
  orange: 0xff6700,
  teal: 0x2dd4bf,
  amber: 0xfbbf24,
  red: 0xf87171,
} as const;

export interface Look {
  /** a cached opaque standard material (packed by mergeStatic) */
  mat(color: number, o?: { rough?: number; metal?: number }): THREE.MeshStandardMaterial;
  /** the robots' shared vertex-colour paint (instanced crowds, plants, tomatoes, carriages) */
  readonly paint: THREE.MeshStandardMaterial;
  /** the island rows' module frame material (vertex colours, instanced; already compiled) */
  readonly frame: THREE.MeshStandardMaterial;
  /** PV cells (shared clearcoat module texture) */
  readonly pv: THREE.Material;
  /** emissive data light (teal, T0 by day) and the objective/signal orange */
  readonly teal: THREE.Material;
  readonly orange: THREE.Material;
}

export function createLook(ctx: ZoneContext): Look {
  const M = ctx.materials;
  return {
    mat: (color, o = {}) => M.standard({ color, roughness: o.rough ?? 0.86, metalness: o.metal ?? 0 }),
    get paint() {
      return ctx.robots.paint;
    },
    // the same parameters as the island's PV frames (src/world/landscape/solar.ts): one cached material, one program
    frame: M.standard({ vertexColors: true, roughness: 0.42, metalness: 0.28 }),
    pv: M.pvCell,
    teal: M.light(TOK.teal),
    orange: M.light(TOK.orange),
  };
}

// ── geometry helpers ──────────────────────────────────────────────────────────

/** A constant vertex colour (non-indexed copy, so merged parts keep hard colour edges). */
export function paint(g: THREE.BufferGeometry, hex: number, jitter = 0, seed = 0): THREE.BufferGeometry {
  const gg = g.index ? g.toNonIndexed() : g;
  if (gg !== g) g.dispose();
  const c = new THREE.Color(hex);
  const n = gg.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < n; i += 3) {
    // one shade per triangle: weathered boards and leaves read as many surfaces, not one plastic
    s = (s * 9301 + 49297) % 233280;
    const k = 1 + (jitter ? (s / 233280 - 0.5) * 2 * jitter : 0);
    for (let j = 0; j < 3 && i + j < n; j++) a.set([c.r * k, c.g * k, c.b * k], (i + j) * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return gg;
}

/** Merge geometries with the same attributes (non-indexed); disposes the inputs. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = geos.map((g) => {
    if (!g.index) return g;
    const n = g.toNonIndexed();
    g.dispose();
    return n;
  });
  const names = Object.keys(list[0].attributes).filter((n) => list.every((g) => g.getAttribute(n)));
  for (const g of list) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('[sonnenacker] mergeGeometries failed');
  for (const g of list) g.dispose();
  return m;
}

/** A box centred at (x, y, z), optionally turned about y. */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yaw) g.rotateY(yaw);
  return g.translate(x, y, z);
}

/** A vertical cylinder standing on y0. */
export function post(r: number, h: number, x: number, y0: number, z: number, seg = 10): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r * 0.92, r, h, seg).translate(x, y0 + h / 2, z);
}

/** A cylinder along x or z (pipes, tubes, rails). */
export function tube(r: number, len: number, axis: 'x' | 'z', x: number, y: number, z: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

/** A mesh of one cached material, named for the ledger detail and the merge. */
export function part(geo: THREE.BufferGeometry, material: THREE.Material, name: string, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.name = `sonnenacker:${name}`;
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  return m;
}

/** A seeded PRNG for placement (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
