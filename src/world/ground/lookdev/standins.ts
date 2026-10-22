/**
 * DEV ONLY (`?groundproof=1` or `?lookdev=1`, never loaded otherwise): the region stand-ins for the joint
 * WP2 + WP3 GPU-proof scene (plan §5.5, C1 M1: final-cost stand-ins for the region impostors, measured at
 * the plaza, the bridge head and the Ausguck) and the block-outs the G-LOOK stills show (plan WP3 build 10:
 * the Sonnenacker at eye level is mandatory). Positions and sizes from plan §2.3 and §4.10; the real sites
 * are WP9 (Sonnenacker), WP10 (Traumhangar), WP14 (region, Kreislaufhof, Unkrautacker), WP16 (Dorf).
 * One mesh per site part, so the stand-ins cost about the draws the region will (≈ 25).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DEG, SITE_PLOTS } from '../../layout';
import { GroundBatch, mat4, type GroundMaterial } from '../material';

const C = {
  soil: 0x857a6c,
  timberSilver: 0x9a9188,
  timberFresh: 0xb9a68a,
  clay: 0xb08a72,
  crop: 0x5f7046,
  leaf: 0x55663f,
  hedge: 0x4f5c3a,
  tomato: 0xb5332a,
  alu: 0xb9b6b0,
  white: 0xe7e5e4,
  dark: 0x2b2a2c,
  plaster: 0xc8bfb2,
  flowers: [0xd9cf9a, 0xb8a7c4, 0xe7e5e4, 0xc9b27a],
};

export function buildStandins(ctx: ZoneContext, groundRoot: THREE.Object3D, mat: GroundMaterial, heightAt: (x: number, z: number) => number): void {
  // under the island root, next to the ground (its own ledger owner: world/region)
  const root = new THREE.Group();
  root.name = 'region:standin';
  // the per-owner ledger counts them as the region (tools/lib/drawcalls.mjs: userData.ledger)
  root.userData.ledger = 'region';
  ctx.root.add(root);
  // follow the ground frame (the stand-ins are ground-frame things)
  ctx.every(1 / 30, () => root.position.copy(groundRoot.position));
  const part = (b: GroundBatch, name: string): void => {
    const m = b.build(mat, `region:standin:${name}`);
    if (m) root.add(m);
  };
  const y = (x: number, z: number): number => heightAt(x, z);
  const rnd = mulberry(20261018);

  // ── Sonnenacker (−290, 60), 150 × 100: Sonnendach A (play block) and B, beds, arms on rails, the Hofladen ──
  const pvPanels: THREE.Matrix4[] = [];
  const roof = (cx: number, cz: number, name: string, arms: boolean): void => {
    const frame = new GroundBatch();
    const beds = new GroundBatch();
    const plants = new GroundBatch();
    const g = y(cx, cz);
    const W = 36,
      D = 14;
    // six single-axis rows (axis N–S), tilted west to the evening sun; posts every 6 m, clearance 2.6 m
    for (let r = 0; r < 6; r++) {
      const x = cx - W / 2 + 3 + r * 6;
      for (let z = cz - D / 2; z <= cz + D / 2 + 0.01; z += 7) frame.add(new THREE.CylinderGeometry(0.09, 0.11, 3.0, 8), { color: C.alu, rough: 0.35, metal: 0.75 }, mat4(x, g + 1.5, z));
      frame.add(new THREE.BoxGeometry(0.16, 0.16, D + 0.4), { color: C.alu, rough: 0.35, metal: 0.75 }, mat4(x, g + 3.0, cz));
      for (let k = 0; k < 12; k++) {
        const z = cz - D / 2 + 0.6 + k * 1.17;
        const tilt = 52 * DEG; // the panels face west (+x is east): a rotation about the N–S axis
        pvPanels.push(new THREE.Matrix4().compose(new THREE.Vector3(x, g + 3.12, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt), new THREE.Vector3(1, 1, 1)));
      }
    }
    // six raised beds 1.0 × 30 m, 0.85 m high, E–W under the roof; two tomato rows 0.25 m from each long edge
    for (let k = 0; k < 6; k++) {
      const z = cz - D / 2 + 1.4 + k * 2.25;
      beds.add(new THREE.BoxGeometry(30, 0.85, 1.0), { color: C.timberSilver, rough: 0.9, grain: 0.8 }, mat4(cx, g + 0.425, z));
      beds.add(new THREE.BoxGeometry(29.8, 0.04, 0.9), { color: C.soil, rough: 1 }, mat4(cx, g + 0.86, z));
      for (const e of [-0.25, 0.25]) {
        for (let x = cx - 14.5; x <= cx + 14.5; x += 0.55) {
          const h = 0.9 + rnd() * 0.35;
          plants.add(new THREE.IcosahedronGeometry(0.22, 0), { color: rnd() < 0.5 ? C.leaf : C.crop, rough: 1 }, mat4(x, g + 0.86 + h / 2, z + e, rnd() * 3, 1, h / 0.44, 1));
          if (rnd() < 0.5) plants.add(new THREE.IcosahedronGeometry(0.045, 0), { color: C.tomato, rough: 0.5 }, mat4(x + (rnd() - 0.5) * 0.2, g + 0.95 + rnd() * h * 0.7, z + e * 1.25));
        }
      }
      if (arms)
        for (const side of [-1, 1]) {
          // the rail along the bed edge and one SO-101 on its carriage (white print, black servos, orange jaw)
          const zr = z + side * 0.62;
          beds.add(new THREE.BoxGeometry(30, 0.06, 0.08), { color: C.alu, rough: 0.35, metal: 0.8 }, mat4(cx, g + 0.92, zr));
          const ax = cx - 12 + rnd() * 24;
          beds.add(new THREE.BoxGeometry(0.32, 0.6, 0.26), { color: C.white, rough: 0.45 }, mat4(ax, g + 1.25, zr));
          beds.add(new THREE.BoxGeometry(0.08, 0.34, 0.08), { color: C.white, rough: 0.45 }, mat4(ax, g + 1.7, zr - side * 0.12));
          beds.add(new THREE.BoxGeometry(0.1, 0.1, 0.1), { color: 0x1c1917, rough: 0.6 }, mat4(ax, g + 1.6, zr));
          beds.add(new THREE.BoxGeometry(0.06, 0.12, 0.05), { color: 0xff6700, rough: 0.5 }, mat4(ax, g + 1.88, zr - side * 0.18));
        }
    }
    part(frame, `${name}-frame`);
    part(beds, `${name}-beds`);
    part(plants, `${name}-plants`);
  };
  roof(-254, 59, 'sonnendach-a', true);
  roof(-306, 59, 'sonnendach-b', false);
  {
    const pv = ctx.materials.pvCell;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(2.25, 0.04, 1.13), pv, pvPanels.length);
    pvPanels.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.name = 'region:standin:pv';
    inst.castShadow = inst.receiveShadow = true;
    inst.computeBoundingSphere();
    root.add(inst);
  }
  {
    // Referenzbeete (unroofed), the Hofladen shed with its dashboard wall, the cistern, two bumblebee boxes,
    // the hedge and the flower strip along the north and west edges
    const b = new GroundBatch();
    for (let k = 0; k < 3; k++) b.add(new THREE.BoxGeometry(14, 0.85, 1.0), { color: C.timberSilver, rough: 0.9, grain: 0.8 }, mat4(-247, y(-247, 80) + 0.425, 78 + k * 2.4));
    const hx = -224,
      hz = 74,
      hg = y(hx, hz);
    b.add(new THREE.BoxGeometry(9, 3.4, 6), { color: C.timberSilver, rough: 0.85, grain: 0.7 }, mat4(hx, hg + 1.7, hz));
    b.add(new THREE.CylinderGeometry(4.3, 4.3, 9.4, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), { color: C.clay, rough: 0.8 }, mat4(hx, hg + 4.6, hz, 0, 1, 0.3, 0.75));
    b.add(new THREE.BoxGeometry(0.1, 1.6, 3.2), { color: 0x262422, rough: 0.6 }, mat4(hx + 4.56, hg + 1.9, hz));
    b.add(new THREE.CylinderGeometry(1.5, 1.6, 3.2, 20), { color: C.clay, rough: 0.7 }, mat4(-231, y(-231, 86) + 1.6, 86));
    for (const [x, z] of [
      [-232, 100],
      [-262, 101],
    ])
      b.add(new THREE.BoxGeometry(0.5, 0.4, 0.4), { color: C.timberFresh, rough: 0.8 }, mat4(x, y(x, z) + 1.0, z));
    for (let x = -362; x <= -218; x += 4) b.add(new THREE.BoxGeometry(4.1, 1.8, 1.4), { color: C.hedge, rough: 1, grain: 1 }, mat4(x, y(x, 108) + 0.9, 108, 0, 1, 0.85 + rnd() * 0.3, 1));
    for (let z = 12; z <= 106; z += 4) b.add(new THREE.BoxGeometry(1.4, 1.8, 4.1), { color: C.hedge, rough: 1, grain: 1 }, mat4(-363, y(-363, z) + 0.9, z, 0, 1, 0.85 + rnd() * 0.3, 1));
    for (let x = -360; x <= -220; x += 1.5) b.add(new THREE.BoxGeometry(1.5, 0.35, 2.4), { color: C.flowers[Math.floor(rnd() * 4)], rough: 1 }, mat4(x, y(x, 104) + 0.18, 104));
    part(b, 'sonnenacker-yard');
  }

  // ── Unkrautacker (−230, −260): vertical bifacial PV fences (rows N–S) and the pasture fence ──
  {
    const b = new GroundBatch();
    for (let k = 0; k < 9; k++) {
      const x = -320 + k * 10;
      for (let z = -330; z <= -190; z += 10) b.add(new THREE.BoxGeometry(0.12, 2.3, 10), { color: C.dark, rough: 0.3, metal: 0.3 }, mat4(x, y(x, z) + 1.6, z));
    }
    part(b, 'unkrautacker');
  }
  // ── Kreislaufhof (340, −40), 60 × 30 hall in the cloud shade; Traumhangar 48 × 32 × 12; Holzbau shell Ø 30 ──
  {
    const b = new GroundBatch();
    b.add(new THREE.BoxGeometry(60, 9, 30), { color: C.plaster, rough: 0.85, grain: 0.6 }, mat4(340, y(340, -40) + 4.5, -40));
    b.add(new THREE.BoxGeometry(61, 0.6, 31), { color: C.dark, rough: 0.4, metal: 0.3 }, mat4(340, y(340, -40) + 9.3, -40));
    part(b, 'kreislaufhof');
  }
  {
    const h = SITE_PLOTS.find((p) => p.id === 'traumhangar')!;
    const [hx, , hz] = h.anchor;
    const b = new GroundBatch();
    b.add(new THREE.BoxGeometry(48, 9, 32), { color: C.white, rough: 0.6, metal: 0.2 }, mat4(hx, 4.5, hz, (h.facingDeg ?? 0) * DEG));
    b.add(new THREE.CylinderGeometry(16.5, 16.5, 48, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), { color: C.alu, rough: 0.45, metal: 0.6 }, mat4(hx, 9, hz, (h.facingDeg ?? 0) * DEG + Math.PI / 2, 1, 1, 0.19));
    part(b, 'traumhangar');
  }
  {
    const b = new GroundBatch();
    b.add(new THREE.SphereGeometry(15, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), { color: C.timberFresh, rough: 0.85 }, mat4(230, y(230, 230), 230, 0, 1, 0.75, 1));
    part(b, 'holzbau');
  }
  // ── Windkamm T1–T3 (generic three-blade, rotor Ø ≈ 80 m) ──
  {
    const b = new GroundBatch();
    for (const [x, z] of [
      [150, -420],
      [300, -520],
      [0, -600],
    ]) {
      const g = y(x, z);
      b.add(new THREE.CylinderGeometry(1.4, 2.6, 85, 12), { color: C.white, rough: 0.5 }, mat4(x, g + 42.5, z));
      b.add(new THREE.BoxGeometry(3.5, 3.5, 10), { color: C.white, rough: 0.5 }, mat4(x, g + 86, z, -115 * DEG));
      for (let k = 0; k < 3; k++) b.add(new THREE.BoxGeometry(2, 40, 0.5), { color: C.white, rough: 0.45 }, new THREE.Matrix4().compose(new THREE.Vector3(x, g + 86, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -115 * DEG, k * 2.094 + 0.4)), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, 20, 5.5)));
    }
    part(b, 'windkamm');
  }
  // ── Dorf (−45, 256) and the Bahnhof (0, 208) ──
  {
    const b = new GroundBatch();
    for (let k = 0; k < 16; k++) {
      const x = -95 + rnd() * 100,
        z = 225 + rnd() * 62,
        g = y(x, z);
      const w = 8 + rnd() * 4,
        d = 10 + rnd() * 4,
        h = 6 + Math.floor(rnd() * 3) * 3;
      const yaw = Math.round(rnd() * 2) * (Math.PI / 2);
      b.add(new THREE.BoxGeometry(w, h, d), { color: [C.plaster, C.timberSilver, C.white][k % 3], rough: 0.85, grain: 0.5 }, mat4(x, g + h / 2, z, yaw));
      b.add(new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), { color: rnd() < 0.6 ? C.clay : C.hedge, rough: 0.85 }, mat4(x, g + h + 1.6, z, yaw, w * 1.06, 3.4, d * 1.04));
    }
    part(b, 'dorf');
    const s = new GroundBatch();
    const [bx, , bz] = [0, 0, 208];
    s.add(new THREE.BoxGeometry(40, 0.9, 6), { color: 0xb9b3aa, rough: 0.85 }, mat4(bx + 6, y(bx, bz) + 0.45, bz));
    s.add(new THREE.BoxGeometry(36, 0.25, 7), { color: C.dark, rough: 0.3, metal: 0.3 }, mat4(bx + 6, y(bx, bz) + 4.0, bz));
    for (let x = -10; x <= 22; x += 8) s.add(new THREE.BoxGeometry(0.25, 3.2, 0.25), { color: C.timberFresh, rough: 0.8 }, mat4(bx + x, y(bx, bz) + 2.4, bz));
    part(s, 'bahnhof');
  }
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
