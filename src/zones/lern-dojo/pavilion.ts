/**
 * The open pavilion (GDD §7.4, ART-V2 §6.4): a floating hull roof 22 × 22 × 0.35 m (y 8.95 … 9.3)
 * centred (0, −4) on 8 slim alu columns with an 8 × 8 m skylight; raised ceramic platform,
 * carbon coffers under the roof, a teal LED rim around the skylight (the cloud's "projector").
 * Front mid-side column is split into two portal columns so the entrance axis stays clear.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { Batch } from './batch';
import { look } from './look';

export const FLOOR_Y = 0.15;
export const ROOF = { cx: 0, cz: -4, w: 22, d: 22, y0: 8.95, y1: 9.3, sky: 8 } as const;
/** column centres (local x, z) */
export const COLUMNS: [number, number][] = [
  [-11, -15],
  [11, -15],
  [-11, 7],
  [11, 7],
  [-11, -4],
  [11, -4],
  [-4.2, 7],
  [4.2, 7],
];
const PLAT = { cx: 0, cz: -4, w: 23.4, d: 23.4 };

/** rounded rectangle path (centre cx, cy; half sizes hw, hh; corner radius r) */
function roundRect(path: THREE.Path, cx: number, cy: number, hw: number, hh: number, r: number, clockwise = false): void {
  const x0 = cx - hw,
    x1 = cx + hw,
    y0 = cy - hh,
    y1 = cy + hh;
  if (!clockwise) {
    path.moveTo(x0 + r, y0);
    path.lineTo(x1 - r, y0);
    path.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
    path.lineTo(x1, y1 - r);
    path.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
    path.lineTo(x0 + r, y1);
    path.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
    path.lineTo(x0, y0 + r);
    path.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  } else {
    path.moveTo(x0 + r, y0);
    path.absarc(x0 + r, y0 + r, r, Math.PI * 1.5, Math.PI, true);
    path.lineTo(x0, y1 - r);
    path.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true);
    path.lineTo(x1 - r, y1);
    path.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true);
    path.lineTo(x1, y0 + r);
    path.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true);
    path.lineTo(x0 + r, y0);
  }
}

/**
 * ART-V2 §6.4: the "carport" becomes a floating hull roof (0.35 m, rounded edges) over carbon
 * coffers with a warm cove line, on slim alu columns with carbon feet and teal foot rings; the
 * tatami platform becomes ceramic deck with a warm edge cove. Colliders and positions unchanged.
 */
export function buildPavilion(ctx: ZoneContext): void {
  const M = ctx.materials;
  const LK = look(ctx);
  const ext = ctx.groups.exterior;

  // ── platform: ceramic deck (world-XZ panels), carbon plinth, warm cove under the lip ─────
  const deck = M.deckTone(0xcfc9c2, 0.82);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(PLAT.w - 0.3, PLAT.d - 0.3), deck);
  top.rotation.x = -Math.PI / 2;
  top.position.set(PLAT.cx, FLOOR_Y + 0.002, PLAT.cz);
  top.receiveShadow = true;
  top.name = 'platform';
  ext.add(top);
  ctx.physics.addStaticBox({ size: [PLAT.w, FLOOR_Y, PLAT.d], position: [PLAT.cx, FLOOR_Y / 2, PLAT.cz], surface: 'concrete' });

  const b = new Batch();
  const edge = LK.carbon;
  const hw = PLAT.w / 2,
    hd = PLAT.d / 2;
  b.box(edge, PLAT.w, FLOOR_Y + 0.01, 0.16, PLAT.cx, (FLOOR_Y + 0.01) / 2, PLAT.cz + hd - 0.08);
  b.box(edge, PLAT.w, FLOOR_Y + 0.01, 0.16, PLAT.cx, (FLOOR_Y + 0.01) / 2, PLAT.cz - hd + 0.08);
  b.box(edge, 0.16, FLOOR_Y + 0.01, PLAT.d - 0.32, PLAT.cx + hw - 0.08, (FLOOR_Y + 0.01) / 2, PLAT.cz);
  b.box(edge, 0.16, FLOOR_Y + 0.01, PLAT.d - 0.32, PLAT.cx - hw + 0.08, (FLOOR_Y + 0.01) / 2, PLAT.cz);
  // warm cove: a light line just under the platform lip (T0 by day, T1 at dusk)
  const cove = LK.duskLight(0xffe9cc);
  b.box(cove, PLAT.w - 0.4, 0.025, 0.02, PLAT.cx, 0.05, PLAT.cz + hd + 0.005);
  b.box(cove, PLAT.w - 0.4, 0.025, 0.02, PLAT.cx, 0.05, PLAT.cz - hd - 0.005);
  b.box(cove, 0.02, 0.025, PLAT.d - 0.4, PLAT.cx + hw + 0.005, 0.05, PLAT.cz);
  b.box(cove, 0.02, 0.025, PLAT.d - 0.4, PLAT.cx - hw - 0.005, 0.05, PLAT.cz);
  // entrance step (half height) in front of the portal
  b.box(edge, 8, 0.075, 0.6, 0, 0.0375, PLAT.cz + hd + 0.3);
  // its collider is a gentle ramp (9.5°) from the deck up to the platform: walking in slowly could
  // stall on the two small step edges (autostep needs speed); a ramp never does
  {
    const z0 = PLAT.cz + hd + 0.9,
      z1 = PLAT.cz + hd;
    const a = Math.atan2(FLOOR_Y, z0 - z1),
      len = Math.hypot(FLOOR_Y, z0 - z1),
      th = 0.1;
    ctx.physics.addStaticBox({ size: [8, th, len], position: [0, FLOOR_Y / 2 - (th / 2) * Math.cos(a), (z0 + z1) / 2 - (th / 2) * Math.sin(a)], rotation: [a, 0, 0], surface: 'concrete' });
  }

  // ── columns: slim alu (Ø 0.32, tapered), carbon foot, teal foot ring, alu collar ──────
  const colH = ROOF.y0 - FLOOR_Y;
  const footRing = LK.duskLight(0x2dd4bf);
  for (const [x, z] of COLUMNS) {
    b.cyl(LK.alu, 0.15, 0.17, colH - 0.16, 24, x, FLOOR_Y + 0.16 + (colH - 0.16) / 2, z);
    b.cyl(edge, 0.26, 0.28, 0.16, 24, x, FLOOR_Y + 0.08, z);
    b.add(footRing, new THREE.TorusGeometry(0.27, 0.018, 6, 40).rotateX(Math.PI / 2), x, FLOOR_Y + 0.17, z);
    b.cyl(LK.alu, 0.21, 0.19, 0.14, 24, x, ROOF.y0 - 0.07, z);
    ctx.physics.addStaticCylinder({ radius: 0.3, height: colH, position: [x, FLOOR_Y + colH / 2, z] });
  }

  // ── roof: one floating hull slab with rounded edges and the skylight cut out ─────────
  const R = ROOF;
  const s = R.sky / 2;
  const T = 0.35; // total thickness (depth + 2 bevels)
  const BEV = 0.12;
  const shape = new THREE.Shape();
  roundRect(shape, R.cx, -R.cz, R.w / 2 - BEV, R.d / 2 - BEV, 0.9);
  const hole = new THREE.Path();
  roundRect(hole, R.cx, -R.cz, s + BEV, s + BEV, 0.4, true);
  shape.holes.push(hole);
  const slab = new THREE.ExtrudeGeometry(shape, { depth: T - 2 * BEV, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 3, curveSegments: 10 });
  slab.rotateX(-Math.PI / 2);
  slab.translate(0, R.y0 + BEV, 0);
  const roofMat = LK.hull;
  b.add(roofMat, slab);
  // carbon coffers under the slab (skip the skylight), shallow and dark: the roof reads as a lid
  const under = R.y0 - 0.01;
  const x0 = R.cx - R.w / 2 + 0.7,
    x1 = R.cx + R.w / 2 - 0.7,
    z0 = R.cz - R.d / 2 + 0.7,
    z1 = R.cz + R.d / 2 - 0.7;
  const beamY = under - 0.12;
  for (let i = 0; i <= 6; i++) {
    const x = x0 + (i * (x1 - x0)) / 6;
    if (Math.abs(x - R.cx) < s + 0.2) {
      b.box(edge, 0.16, 0.24, z1 - (R.cz + s + 0.2), x, beamY, (z1 + R.cz + s + 0.2) / 2);
      b.box(edge, 0.16, 0.24, R.cz - s - 0.2 - z0, x, beamY, (z0 + R.cz - s - 0.2) / 2);
    } else b.box(edge, 0.16, 0.24, z1 - z0, x, beamY, R.cz);
    const z = z0 + (i * (z1 - z0)) / 6;
    if (Math.abs(z - R.cz) < s + 0.2) {
      b.box(edge, R.cx - s - 0.2 - x0, 0.24, 0.16, (x0 + R.cx - s - 0.2) / 2, beamY, z);
      b.box(edge, x1 - (R.cx + s + 0.2), 0.24, 0.16, (x1 + R.cx + s + 0.2) / 2, beamY, z);
    } else b.box(edge, x1 - x0, 0.24, 0.16, R.cx, beamY, z);
  }
  // warm cove line around the underside, 0.45 m in from the edge (indirect light on the coffers)
  const cin = 0.45;
  b.box(cove, R.w - 2 * cin, 0.03, 0.05, R.cx, under - 0.015, R.cz + R.d / 2 - cin);
  b.box(cove, R.w - 2 * cin, 0.03, 0.05, R.cx, under - 0.015, R.cz - R.d / 2 + cin);
  b.box(cove, 0.05, 0.03, R.d - 2 * cin, R.cx + R.w / 2 - cin, under - 0.015, R.cz);
  b.box(cove, 0.05, 0.03, R.d - 2 * cin, R.cx - R.w / 2 + cin, under - 0.015, R.cz);
  // skylight: alu frame, the teal LED stays (the cloud's "projector")
  for (const sx of [-1, 1]) {
    b.box(LK.alu, 0.1, 0.5, R.sky + 0.2, R.cx + sx * (s + 0.05), R.y1 + 0.2, R.cz);
    b.box(LK.alu, R.sky + 0.2, 0.5, 0.1, R.cx, R.y1 + 0.2, R.cz + sx * (s + 0.05));
  }
  const led = LK.duskLight(0x2dd4bf);
  for (const yy of [R.y1 + 0.47, R.y0 - 0.03]) {
    for (const sx of [-1, 1]) {
      b.box(led, 0.04, 0.04, R.sky - 0.3, R.cx + sx * (s - 0.04), yy, R.cz);
      b.box(led, R.sky - 0.3, 0.04, 0.04, R.cx, yy, R.cz + sx * (s - 0.04));
    }
  }
  // floor inlay: a thin teal ring around the teleop table, right under the skylight
  b.add(led, new THREE.RingGeometry(3.32, 3.36, 96).rotateX(-Math.PI / 2), 0, FLOOR_Y + 0.006, -3.4);
  // entrance runway from the gate to the platform: teal centre line between two alu trim strips
  const runL = 21.4 - (PLAT.cz + PLAT.d / 2 + 0.6);
  const runZ = PLAT.cz + PLAT.d / 2 + 0.6 + runL / 2;
  b.box(led, 0.04, 0.012, runL - 0.6, 0, 0.03, runZ);
  for (const sx of [-1, 1]) b.box(LK.alu, 0.1, 0.04, runL, sx * 2.0, 0.02, runZ);
  b.build(ext, { castShadow: (m) => m === roofMat || m === LK.alu || m === edge, receiveShadow: true, name: 'pavilion' });

  // ── far tier: one silhouette mesh (roof + columns + platform) in hull tones, ≤ 1 draw call ──
  const f = new Batch();
  f.box(M.hull, R.w, T, R.d, R.cx, R.y0 + T / 2, R.cz);
  for (const [x, z] of COLUMNS) f.box(M.hull, 0.32, colH, 0.32, x, FLOOR_Y + colH / 2, z);
  f.box(M.hull, PLAT.w, FLOOR_Y, PLAT.d, PLAT.cx, FLOOR_Y / 2, PLAT.cz);
  f.build(ctx.groups.far, { castShadow: false, receiveShadow: false, name: 'far' });
}
