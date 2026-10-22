import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge } from '../util';
import { staticMerger, type StaticMerger } from '../statics';

/**
 * Static batcher (ART-V2 §7: "static merges go per material"): every landscape feature adds its
 * static parts here, and `flush` turns each material into ONE mesh for the whole island, so the
 * new deck costs ~1 draw call per material instead of one per object.
 */
export class Batch {
  private parts = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; name: string; order: number }>();

  add(mat: THREE.Material, g: THREE.BufferGeometry, o: { cast?: boolean; name?: string; order?: number } = {}): void {
    let p = this.parts.get(mat);
    if (!p) {
      p = { geos: [], cast: false, name: o.name ?? mat.name ?? 'batch', order: o.order ?? 0 };
      this.parts.set(mat, p);
    }
    if (o.cast) p.cast = true;
    // W1: parts stay indexed (the static merger concatenates indexed geometry: far fewer vertices)
    const gg = g;
    if (gg.getAttribute('uv') && !(mat as THREE.MeshStandardMaterial).map) gg.deleteAttribute('uv');
    if (!gg.getAttribute('normal')) gg.computeVertexNormals();
    p.geos.push(gg);
  }

  /** Hand every part to the island's static merger (W1: it merges across materials of one shading model). */
  flushTo(merger: StaticMerger, scope?: THREE.Object3D, prefix = 'island:static'): void {
    // `?mergeab`: the old per-material meshes as the A/B reference
    if (merger.abMode)
      for (const [mat, p] of this.parts) {
        if (!p.geos.length) continue;
        const geos = p.geos.map((g) => g.clone());
        if (!(mat as THREE.MeshStandardMaterial).vertexColors) for (const g of geos) if (g.getAttribute('color')) g.deleteAttribute('color');
        const mesh = new THREE.Mesh(merge(geos), mat);
        mesh.name = `${prefix}:${p.name}`;
        mesh.castShadow = p.cast;
        mesh.receiveShadow = true;
        mesh.renderOrder = p.order;
        merger.addReference(mesh, scope);
      }
    for (const [mat, p] of this.parts) for (const g of p.geos) merger.addGeometry(mat, g, { cast: p.cast, order: p.order, scope });
    this.parts.clear();
  }

  flush(parent: THREE.Object3D, prefix: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, p] of this.parts) {
      if (!p.geos.length) continue;
      const vc = (mat as THREE.MeshStandardMaterial).vertexColors;
      if (!vc) for (const g of p.geos) if (g.getAttribute('color')) g.deleteAttribute('color');
      const mesh = new THREE.Mesh(merge(p.geos), mat);
      mesh.name = `${prefix}:${p.name}`;
      mesh.castShadow = p.cast;
      mesh.receiveShadow = true;
      mesh.renderOrder = p.order;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

const SHARED = new WeakMap<object, Batch>();
const LATE = new WeakSet<Batch>();
/**
 * One batch for the whole island module (deck, railings, landscape, masts, underside, landing). It
 * flushes into the island's static merger (statics.ts) when the island's init has finished
 * (`enrichSurfaces` → `finishStatic`), also when the init yields between builders, so each
 * shading model is one draw call for everything the landscape builds.
 */
export function sharedBatch(ctx: ZoneContext): Batch {
  const merger = staticMerger(ctx);
  let b = SHARED.get(ctx);
  // a module built after the merge gets a fresh batch that flushes on its own, per material (as before W1)
  if (!b || (merger.finished && !LATE.has(b))) {
    const nb = new Batch();
    SHARED.set(ctx, nb);
    if (merger.finished) {
      LATE.add(nb);
      queueMicrotask(() => {
        nb.flush(ctx.root, 'island:late');
        SHARED.delete(ctx);
      });
    } else merger.beforeRun(() => nb.flushTo(merger));
    b = nb;
  }
  return b;
}

/** ART-V2 §2.5: a box with an edge over 0.5 m is a RoundedBox, radius clamp(0.04 × min, 0.02, 0.25). */
export function rbox(w: number, h: number, d: number, segments = 2): THREE.BufferGeometry {
  const min = Math.min(w, h, d);
  const r = Math.min(0.25, Math.max(0.02, 0.04 * min), min / 2 - 1e-3);
  if (Math.max(w, h, d) <= 0.5) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

/** Paint a constant vertex colour (non-indexed copy). */
export function paint(g: THREE.BufferGeometry, hex: THREE.ColorRepresentation): THREE.BufferGeometry {
  const gg = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = gg.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return gg;
}

/** Thin flat ring (annulus) on the deck, centred at (x, z), at height y. */
export function flatRing(x: number, z: number, r0: number, r1: number, y: number, seg = 48, a0 = 0, a1 = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.RingGeometry(r0, r1, seg, 1, a0, a1 - a0).rotateX(-Math.PI / 2).translate(x, y, z);
}

/** A flat strip along a polyline on the deck (width w, height y). */
export function flatStrip(pts: [number, number][], w: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [],
    idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0],
      tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const nx = -tz * (w / 2),
      nz = tx * (w / 2);
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // face up
  const p = g.getAttribute('position');
  const ia = g.getIndex()!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < ia.length; i += 3) {
    const ax = p.getX(ia[i]),
      az = p.getZ(ia[i]),
      bx = p.getX(ia[i + 1]),
      bz = p.getZ(ia[i + 1]),
      cx = p.getX(ia[i + 2]),
      cz = p.getZ(ia[i + 2]);
    if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) {
      const t = ia[i + 1];
      ia[i + 1] = ia[i + 2];
      ia[i + 2] = t;
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Arc polyline points (bearing degrees, clockwise from north) at radius r around (cx, cz). */
export function arcPts(cx: number, cz: number, r: number, b0: number, b1: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const b = ((b0 + ((b1 - b0) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.sin(b) * r, cz - Math.cos(b) * r]);
  }
  return out;
}
