/**
 * The Unkrautacker's three test strips (plan §4.11; R8 §3.2): A just emerged (tiny seedlings, weeds right
 * beside them), B dry and clean (the robot's mapped seeds, small weeds), C wet and weedy (dark soil, puddles,
 * big weeds). Each strip holds 50 crop plants in two rows and 50 weeds: one instanced draw for every crop
 * plant, one for every weed (their state is the instance colour and scale). The laser toy's teal rings
 * (the camera marks the weeds: data, rule 6) are a third instanced draw, shown only while you steer.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { N, rng, type FieldId, type MethodId } from './sim';
import { U } from './tuning';

export type PlantState = 'ok' | 'removed' | 'sprayed' | 'charred' | 'damaged';
export interface Plant {
  field: FieldId;
  index: number;
  weed: boolean;
  x: number;
  z: number;
  y: number;
  size: number;
  yaw: number;
  state: PlantState;
}

export interface Strips {
  readonly plants: Plant[];
  plantsOf(field: FieldId, weed: boolean): Plant[];
  /** the bed top's height under a strip point (local) */
  topY(x: number, z: number): number;
  /** set a plant's state (visual) */
  setState(p: Plant, s: PlantState): void;
  /** all plants of a field back to 'ok' */
  reset(field: FieldId): void;
  showRings(on: boolean): void;
  /** the nearest plant of a field to a local ground point (within r), or null */
  nearest(field: FieldId, x: number, z: number, r: number): Plant | null;
  stripX(field: FieldId): number;
  update(dt: number): void;
}

const CROP = 0x5f7046,
  WEED = 0x8f8f4c,
  DAMAGED = 0x7a5a3a,
  SPRAYED = 0xa39a62,
  CHARRED = 0x2a2724;

export function buildStrips(ctx: ZoneContext, gy: (x: number, z: number) => number): Strips {
  const S = U.strips;
  const det = ctx.groups.detail;
  const geos: THREE.BufferGeometry[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T): T => (geos.push(g), g);
  ctx.onDispose(() => geos.forEach((g) => g.dispose()));
  const fieldIds: FieldId[] = ['a', 'b', 'c'];
  const len = S.z0 - S.z1;

  // ── the beds: soil by state, puddles on C, edging boards ──
  const soil: Record<FieldId, number> = { a: 0x857a6c, b: 0xa39a86, c: 0x5e554b };
  fieldIds.forEach((f, i) => {
    const x = S.x[i];
    const zc = (S.z0 + S.z1) / 2;
    const bed = new THREE.Mesh(G(new THREE.BoxGeometry(S.w, 0.14, len + 0.6)), ctx.materials.standard({ color: soil[f], roughness: 1, metalness: 0 }));
    bed.position.set(x, gy(x, zc) + 0.02, zc);
    bed.receiveShadow = true;
    det.add(bed);
    for (const s of [-1, 1]) {
      const edge = new THREE.Mesh(G(new THREE.BoxGeometry(0.06, 0.2, len + 0.7)), ctx.materials.standard({ color: 0x9a9188, roughness: 0.9, metalness: 0 }));
      edge.position.set(x + (s * (S.w + 0.06)) / 2, gy(x, zc) + 0.05, zc);
      det.add(edge);
    }
    if (f === 'c')
      for (let k = 0; k < 4; k++) {
        const pud = new THREE.Mesh(G(new THREE.CircleGeometry(0.25 + (k % 2) * 0.12, 12).rotateX(-Math.PI / 2)), ctx.materials.standard({ color: 0x5e6b66, roughness: 0.08, metalness: 0.3 }));
        pud.position.set(x + (k % 2 ? 0.45 : -0.4), gy(x, zc) + 0.092, S.z1 + 1.5 + k * 2.3);
        det.add(pud);
      }
  });
  const topY = (x: number, z: number): number => gy(x, z) + 0.09;

  // ── the plants: two crop rows per strip, the weeds in and between the rows ──
  const r = rng(2610);
  const plants: Plant[] = [];
  fieldIds.forEach((f, i) => {
    const x0 = S.x[i];
    const cropSize = f === 'a' ? 0.05 : 0.17;
    const weedSize = f === 'a' ? 0.045 : f === 'b' ? 0.06 : 0.16;
    for (let k = 0; k < N; k++) {
      const row = k % 2,
        j = Math.floor(k / 2);
      const z = S.z0 - 0.3 - (j + 0.5) * ((len - 0.6) / (N / 2));
      const x = x0 + (row ? 0.35 : -0.35) + (r() - 0.5) * 0.03;
      plants.push({ field: f, index: k, weed: false, x, z, y: topY(x, z), size: cropSize * (0.85 + r() * 0.3), yaw: r() * 6, state: 'ok' });
    }
    for (let k = 0; k < N; k++) {
      // A: right beside the seedlings (the hard case); B and C: anywhere on the bed
      let x: number, z: number;
      if (f === 'a' && k % 3 !== 2) {
        const c = plants[plants.length - N + Math.floor(r() * N)];
        x = c.x + (r() < 0.5 ? -1 : 1) * (0.07 + r() * 0.06);
        z = c.z + (r() - 0.5) * 0.25;
      } else {
        x = x0 + (r() - 0.5) * (S.w - 0.25);
        z = S.z1 + 0.3 + r() * (len - 0.6);
      }
      plants.push({ field: f, index: k, weed: true, x, z, y: topY(x, z), size: weedSize * (0.75 + r() * 0.5), yaw: r() * 6, state: 'ok' });
    }
  });
  const crops = plants.filter((p) => !p.weed),
    weeds = plants.filter((p) => p.weed);
  // a crop plant: a low rosette; a weed: a ragged, taller tuft (two crossed spikes)
  const cropGeo = G(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.45, 1).translate(0, 0.3, 0));
  const weedGeo = G(new THREE.ConeGeometry(0.55, 1.6, 5, 1).translate(0, 0.8, 0));
  const mat = ctx.materials.standard({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const cropMesh = new THREE.InstancedMesh(cropGeo, mat, crops.length);
  const weedMesh = new THREE.InstancedMesh(weedGeo, mat, weeds.length);
  for (const [m, name] of [
    [cropMesh, 'crops'],
    [weedMesh, 'weeds'],
  ] as const) {
    m.name = `unkrautacker:${name}`;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    det.add(m);
  }
  const _m = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _p = new THREE.Vector3(),
    _s = new THREE.Vector3(),
    _c = new THREE.Color(),
    Y = new THREE.Vector3(0, 1, 0),
    X = new THREE.Vector3(1, 0, 0);
  const write = (p: Plant): void => {
    const mesh = p.weed ? weedMesh : cropMesh;
    const i = p.weed ? weeds.indexOf(p) : crops.indexOf(p);
    let sc = p.size,
      sy = p.size,
      col = p.weed ? WEED : CROP;
    _q.setFromAxisAngle(Y, p.yaw);
    if (p.state === 'removed') sc = sy = 0;
    else if (p.state === 'sprayed') {
      sy *= 0.45;
      col = SPRAYED;
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(X, 0.6));
    } else if (p.state === 'charred') {
      sc *= 0.55;
      sy *= 0.3;
      col = CHARRED;
    } else if (p.state === 'damaged') {
      sy *= 0.6;
      col = DAMAGED;
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(X, 0.9));
    }
    mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(sc, sy, sc)));
    mesh.setColorAt(i, _c.setHex(col));
  };
  const flush = (): void => {
    for (const m of [cropMesh, weedMesh]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  };
  plants.forEach(write);
  flush();
  cropMesh.computeBoundingSphere();
  weedMesh.computeBoundingSphere();

  // ── the laser camera's marks: a teal ring round each weed of strip A ──
  const aWeeds = weeds.filter((p) => p.field === 'a');
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.85, depthWrite: false });
  ctx.onDispose(() => ringMat.dispose());
  const rings = new THREE.InstancedMesh(G(new THREE.RingGeometry(0.075, 0.095, 18).rotateX(-Math.PI / 2)), ringMat, aWeeds.length);
  rings.name = 'unkrautacker:rings';
  rings.visible = false;
  rings.frustumCulled = false;
  det.add(rings);
  const writeRings = (): void => {
    aWeeds.forEach((p, i) => rings.setMatrixAt(i, _m.compose(_p.set(p.x, p.y + 0.015, p.z), _q.identity(), _s.setScalar(p.state === 'ok' ? 1 : 0))));
    rings.instanceMatrix.needsUpdate = true;
  };
  writeRings();

  let dirty = false;
  return {
    plants,
    plantsOf: (f, weed) => plants.filter((p) => p.field === f && p.weed === weed),
    topY,
    setState(p, s) {
      if (p.state === s) return;
      p.state = s;
      write(p);
      dirty = true;
    },
    reset(f) {
      for (const p of plants) if (p.field === f && p.state !== 'ok') {
        p.state = 'ok';
        write(p);
      }
      dirty = true;
    },
    showRings(on) {
      rings.visible = on;
      if (on) writeRings();
    },
    nearest(f, x, z, rad) {
      let best: Plant | null = null,
        bd = rad;
      for (const p of plants) {
        if (p.field !== f || (p.state !== 'ok' && p.weed)) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    },
    stripX: (f) => S.x[fieldIds.indexOf(f)],
    update() {
      if (!dirty) return;
      dirty = false;
      flush();
      if (rings.visible) writeRings();
    },
  };
}

/** how a method leaves a weed it removes */
export function removedState(m: MethodId): PlantState {
  return m === 'hoe' ? 'removed' : m === 'spray' ? 'sprayed' : 'charred';
}
