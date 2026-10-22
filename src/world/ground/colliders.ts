/**
 * Ground colliders (plan WP3 build 4, §5.3 rule 3, C1 M13):
 *  - the yard (wall edge → r 200): one trimesh, the same geometry the terrain draws there;
 *  - beyond it, 64 m Rapier heightfield tiles at 2 m, only over the tracks' corridors and the site rects
 *    (built once the ring heights are in, a few per idle task);
 *  - invisible bands along the dock rail, the yard fence, the corridor and site fences, and the hard
 *    boundary at r 650 (the fences bound the walkable area).
 * Every one of them is handed to the ground frame (ctx.frames.adopt, WP4): on only while the ground is
 * docked (h ≤ 0.05 m, untilted).
 */
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { StaticHandle, ZoneContext } from '@/core/zones';
import { COLLIDERS, FIELDS, FLATS, GRID, PATHS, PLATEAU, type XZ } from './plan';
import type { Heights } from './heights';
import type { P2 } from './material';
import { densify } from './werft';

export interface GroundColliders {
  /** the tiles and the outer fence bands (call once the ring heights are in) */
  addOuter(heights: Heights, fences: P2[][], step: () => Promise<void>): Promise<void>;
  /** tile ids (i, j on the 64 m grid from −672) that carry a heightfield */
  readonly tiles: string[];
  count(): number;
}

/** a vertical band (two triangles per segment) along a polyline, from y0 to y1 above the terrain */
function band(lines: P2[][], y0: number, y1: number, heightAt?: (x: number, z: number) => number): THREE.Mesh {
  const pos: number[] = [],
    idx: number[] = [];
  for (const l of lines) {
    const base = pos.length / 3;
    for (const [x, z] of l) {
      const h = heightAt ? heightAt(x, z) : 0;
      pos.push(x, h + y0, z, x, h + y1, z);
    }
    for (let i = 0; i < l.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g);
}

/** Which 64 m tiles need a heightfield: corridors of the tracks, the site rects, the flats beyond the yard. */
export function colliderTiles(): [number, number][] {
  const T = COLLIDERS.tile;
  const n = Math.round((GRID.near.half * 2) / T);
  const x0 = -GRID.near.half;
  const want = new Set<string>();
  const mark = (x: number, z: number, pad: number): void => {
    for (let i = Math.floor((x - pad - x0) / T); i <= Math.floor((x + pad - x0) / T); i++)
      for (let j = Math.floor((z - pad - x0) / T); j <= Math.floor((z + pad - x0) / T); j++) if (i >= 0 && j >= 0 && i < n && j < n) want.add(`${i},${j}`);
  };
  for (const p of PATHS) {
    if (p.open) continue;
    for (const [x, z] of densify(p.pts, 4)) if (Math.hypot(x, z) > PLATEAU.flat - 12) mark(x, z, p.width / 2 + COLLIDERS.corridor + 2);
  }
  const rects: { at: XZ; half: XZ }[] = [
    ...FIELDS.map((f) => ({ at: f.at, half: [f.size[0] / 2 + COLLIDERS.siteMargin + 2, f.size[1] / 2 + COLLIDERS.siteMargin + 2] as XZ })),
    ...FLATS.filter((f) => Math.hypot(...f.at) > PLATEAU.flat).map((f) => ({ at: f.at, half: (f.size ? [f.size[0] / 2 + 4, f.size[1] / 2 + 4] : [f.radius! + 4, f.radius! + 4]) as XZ })),
  ];
  for (const r of rects) for (let x = r.at[0] - r.half[0]; x <= r.at[0] + r.half[0]; x += T / 2) for (let z = r.at[1] - r.half[1]; z <= r.at[1] + r.half[1]; z += T / 2) mark(x, z, 0);
  const out: [number, number][] = [];
  for (const k of want) {
    const [i, j] = k.split(',').map(Number);
    // never over the dock (a heightfield has no holes)
    const cx = x0 + (i + 0.5) * T,
      cz = x0 + (j + 0.5) * T;
    const near = Math.hypot(Math.max(0, Math.abs(cx) - T / 2), Math.max(0, Math.abs(cz) - T / 2));
    if (near < COLLIDERS.dockClear) continue;
    out.push([i, j]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function buildColliders(ctx: ZoneContext, yard: THREE.Mesh, rail: P2[][], yardFence: P2[][]): GroundColliders {
  const handles: StaticHandle[] = [];
  const raw: RAPIER_NS.Collider[] = [];
  const tiles: string[] = [];
  const add = (mesh: THREE.Mesh, surface: 'concrete' | 'metal' | 'grass' | 'wood', fix = false): void => {
    ctx.root.add(mesh);
    mesh.updateMatrixWorld(true);
    const h = ctx.physics.addStaticTrimesh(mesh, { surface, fixInternalEdges: fix });
    mesh.removeFromParent();
    mesh.geometry.dispose();
    ctx.frames.adopt(h);
    handles.push(h);
  };
  // the yard: the terrain's own geometry there (flat at y 0, the notch exact)
  const ym = new THREE.Mesh(yard.geometry.clone());
  add(ym, 'concrete', true);
  // the dock rail and the yard fence, the hard boundary
  add(band(rail, 0, 1.3), 'metal');
  add(band(yardFence, 0, 1.35), 'wood');
  const ring: P2[] = [];
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    ring.push([Math.sin(a) * COLLIDERS.boundary, -Math.cos(a) * COLLIDERS.boundary]);
  }

  return {
    tiles,
    async addOuter(heights, fences, step) {
      const R = ctx.physics.rapier;
      const T = COLLIDERS.tile;
      const cells = T / GRID.near.step;
      const g = heights.near;
      const list = colliderTiles();
      let k = 0;
      for (const [ti, tj] of list) {
        const i0 = ti * cells,
          j0 = tj * cells;
        const H = new Float32Array((cells + 1) * (cells + 1));
        // Rapier: rows along +z, columns along +x, column-major
        for (let i = 0; i <= cells; i++) for (let j = 0; j <= cells; j++) H[i * (cells + 1) + j] = g.h[(j0 + j) * g.n + (i0 + i)];
        const cx = g.x0 + (i0 + cells / 2) * g.step,
          cz = g.z0 + (j0 + cells / 2) * g.step;
        const desc = R.ColliderDesc.heightfield(cells, cells, H, { x: T, y: 1, z: T }, R.HeightFieldFlags.FIX_INTERNAL_EDGES)
          .setTranslation(cx, 0, cz)
          .setFriction(0.7)
          .setCollisionGroups(ctx.physics.groups.STATIC);
        const c = ctx.physics.world.createCollider(desc);
        ctx.physics.track(c);
        ctx.frames.adopt(c);
        raw.push(c);
        tiles.push(`${ti},${tj}`);
        if (++k % 12 === 0) await step();
      }
      const hAt = (x: number, z: number): number => heights.heightAt(x, z);
      add(band(fences, -0.2, 1.35, hAt), 'wood');
      add(band([ring], -40, 40), 'concrete');
    },
    count() {
      return handles.reduce((s, h) => s + h.colliders.length, 0) + raw.length;
    },
  };
}
