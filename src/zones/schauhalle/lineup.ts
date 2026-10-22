/**
 * The robots' merged line-up (`lineup.l2.glb`, WP0 R6) cut back into one silhouette per robot: the
 * Größenwand shows the whole mesh, the plinths beyond the governor's LOD1 set show their slice, and the
 * exterior tier shows all delivered slices merged into one draw. No silhouette file is fetched per robot
 * (≤ 0.2 MB on approach, plan §5.6).
 */
import * as THREE from 'three';
import type { RobotId, RobotLineup } from '@/core/zones';

export interface Slice {
  id: RobotId;
  /** the robot alone, centred on x = 0 (its own frame: floor y = 0, front +z) */
  geometry: THREE.BufferGeometry;
  heightM: number;
  tris: number;
}

/** Split the line-up mesh into per-robot geometries by the entries' x ranges (triangle centroids). */
export function sliceLineup(mesh: THREE.Mesh, info: RobotLineup): Map<RobotId, Slice> {
  const src = mesh.geometry;
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const names = Object.keys(src.attributes);
  const index = src.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vi = (t: number, k: number): number => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const ranges = info.entries.map((e) => ({ id: e.id, x0: e.x[0], x1: e.x[1], h: e.heightM, mid: (e.x[0] + e.x[1]) / 2 }));
  const tris = new Map<RobotId, number[]>(ranges.map((r) => [r.id, []]));
  for (let t = 0; t < triCount; t++) {
    const cx = (pos.getX(vi(t, 0)) + pos.getX(vi(t, 1)) + pos.getX(vi(t, 2))) / 3;
    // the gaps between robots are 0.25 m: the nearest range by centre wins
    let best = ranges[0];
    let bd = Infinity;
    for (const r of ranges) {
      const d = cx < r.x0 ? r.x0 - cx : cx > r.x1 ? cx - r.x1 : 0;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    tris.get(best.id)!.push(t);
  }
  const out = new Map<RobotId, Slice>();
  for (const r of ranges) {
    const list = tris.get(r.id)!;
    const remap = new Map<number, number>();
    const idx: number[] = [];
    for (const t of list)
      for (let k = 0; k < 3; k++) {
        const v = vi(t, k);
        let n = remap.get(v);
        if (n === undefined) remap.set(v, (n = remap.size));
        idx.push(n);
      }
    const g = new THREE.BufferGeometry();
    for (const name of names) {
      const a = src.getAttribute(name) as THREE.BufferAttribute;
      const arr = new Float32Array(remap.size * a.itemSize);
      for (const [o, n] of remap) for (let c = 0; c < a.itemSize; c++) arr[n * a.itemSize + c] = a.getComponent(o, c);
      g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    g.setIndex(idx);
    g.translate(-r.mid, 0, 0);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    out.set(r.id, { id: r.id, geometry: g, heightM: r.h, tris: idx.length / 3 });
  }
  return out;
}
