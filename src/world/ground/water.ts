/**
 * The pit lake („Revier-See“, plan WP3 build 5, §2.3, D22): one opaque, green-grey water plane at y −20
 * over the flooded pit, WNW: from just inland of the near shore to just beyond the far and lateral banks
 * (plan.ts PIT; G-LOOK fix 2, D42: the far banks show, so the lake reads as a pit, not a sea). The shore
 * benches stay ≥ 1 m above it (the bake checks that) and the water carries a polygon offset, so the
 * waterline holds at 600 m and more (C1 m6). The ground program draws it (a GroundMaterial with its water flag: a slow analytic swell in the
 * normal, no texture); the low sun (295°) draws its glitter path.
 */
import * as THREE from 'three';
import { DEG } from '../layout';
import { T } from './tuning';
import { PIT, SHORE } from './plan';
import { GroundBatch, GroundMaterial, WATER_TIME } from './material';

export interface Water {
  readonly mesh: THREE.Mesh;
  update(t: number): void;
}

export function buildWater(parent: THREE.Object3D): Water {
  const mat = new GroundMaterial({ envMapIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 }, { water: true });
  // a rectangle in the lake's frame (u along 295°, v along 205°): from 45 m inland of the mean waterline to
  // 70 m under the far and lateral banks (their rims wander ≤ 22 m)
  const b = SHORE.bearing * DEG;
  const out = new THREE.Vector2(Math.sin(b), -Math.cos(b));
  const along = new THREE.Vector2(Math.sin(b - Math.PI / 2), -Math.cos(b - Math.PI / 2));
  const near = SHORE.line - 45,
    far = PIT.far + 70;
  const v0 = PIT.north - 70,
    v1 = PIT.south + 70;
  const c = (u: number, v: number): [number, number, number] => [out.x * u + along.x * v, SHORE.water, out.y * u + along.y * v];
  const pos = [...c(near, v0), ...c(far, v0), ...c(near, v1), ...c(far, v1)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  // wound to face up
  const ax = pos[0],
    az = pos[2],
    bx = pos[3],
    bz = pos[5],
    cx = pos[6],
    cz = pos[8];
  g.setIndex((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0 ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 2, 3, 1]);
  const B = new GroundBatch();
  B.add(g, { color: T.color.water, rough: 0.16, metal: 0, noShade: true });
  const mesh = B.build(mat, 'ground:water', { cast: false })!;
  mesh.frustumCulled = false;
  // after the terrain (the shore covers its inland edge; early depth rejects what is hidden)
  mesh.renderOrder = 2;
  parent.add(mesh);
  return {
    mesh,
    update(t) {
      WATER_TIME.value = t;
    },
  };
}
