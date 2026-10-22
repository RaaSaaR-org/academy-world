/**
 * The line side (behind the partition): partition wall + Rolltor (roll-up shutter) + switch,
 * an open steel hall frame with floods, the Gegenlicht floodlamp, the Linien-Replik (conveyor,
 * the second copy of the vendor arm, a bin) and the arm's cycle player used by production,
 * the fast-forward measurement (station B) and the audit replays (station C).
 */
import * as THREE from 'three';
import { createArm, evalKeys, GRIP_CLOSED, GRIP_OPEN, newKey, type Key } from './arm';
import { glowMaterial, makeCanvas, metricBoxUv, Painter, place, ribNormalMap, ZERO, FONT_MONO } from './geom';
import type { Clip, ClipMotion, Outcome } from './model';
import { rng } from './model';
import type { Shared } from './state';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();

export const LINE = {
  base: new THREE.Vector3(5.6, 0.5, -6.0),
  pick: new THREE.Vector3(7.0, 0.925, -6.0),
  bin: new THREE.Vector3(5.6, 0.465, -4.75),
  home: new THREE.Vector3(6.15, 1.45, -5.2),
  beltY: 0.9,
  beltX: 7.0,
  beltZ0: -10.0,
  beltZ1: -2.0,
  floorY: 0.045,
};
const SHUTTER = { z0: -8, z1: 0, h: 5, slat: 0.2 };

type Variant = ClipMotion | 'stop';

interface Plan {
  keys: Key[];
  variant: Variant;
  dur: number;
  graspT: number;
  releaseT: number;
  /** slip: part leaves the gripper */
  slipT: number;
  /** regrasp: first grasp slips back at dropT, second grasp at grasp2T */
  dropT: number;
  grasp2T: number;
  /** placement offset in the bin (m) */
  ox: number;
  oz: number;
}

export interface LineCell {
  readonly armObject: THREE.Object3D;
  readonly shutterButton: THREE.Object3D;
  openShutter(instant?: boolean): void;
  readonly shutterRise: number;
  setProduction(on: boolean): void;
  /** fast-forward cycle for one measured trial */
  runCycle(o: Outcome, dur: number): void;
  /** play one audit clip in a loop (null stops) */
  playClip(clip: Clip | null): void;
  readonly clipTime: number;
  readonly clipDur: number;
  /** station C: replay speed factor (1 or 2) */
  setReplaySpeed(k: number): void;
  setConditions(vib: 0 | 1 | 2, studio: boolean, running: boolean): void;
  /** a world point to look at the arm */
  readonly focus: THREE.Vector3;
}

export function buildLine(S: Shared): LineCell {
  const ctx = S.ctx;
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;

  // ── partition + shutter (exterior) ───────────────────────────────────────
  const ribs = ribNormalMap();
  ctx.onDispose(() => ribs.dispose());
  // anodised mid-grey with readable ribs (Phase 5: at 0x3a3836 / metalness 0.72 the 6 m partition read as a
  // black void when you walked up to it from the gate)
  const wallMat = M.standard({ color: 0x5a5651, roughness: 0.52, metalness: 0.55, normalMap: ribs, normalScale: new THREE.Vector2(1.1, 1.1) });
  const wallGeo: THREE.BufferGeometry[] = [];
  const wallBox = (w: number, h: number, d: number, p: [number, number, number]): void => {
    wallGeo.push(place(metricBoxUv(new THREE.BoxGeometry(w, h, d), w, h, d, 0.6), p));
    ctx.physics.addStaticBox({ size: [w, h, d], position: p });
  };
  wallBox(0.3, 6, 4, [0, 3, -10]);
  wallBox(0.3, 6, 2, [0, 3, 1]);
  wallBox(0.3, 1, 8, [0, 5.5, -4]);
  // keep uv for the normal map
  const wall = new THREE.Mesh(mergeKeepUv(wallGeo), wallMat);
  wall.castShadow = true;
  wall.receiveShadow = true;
  ext.add(wall);
  // shutter frame, drum housing, guide rails, wall caps (dark)
  const frame = new Painter()
    .box(0.7, 0.85, 8.5, [0.45, 5.45, -4], 0x1c1917)
    .box(0.12, 5.0, 0.12, [0.2, 2.5, SHUTTER.z0 - 0.06], 0x1c1917)
    .box(0.12, 5.0, 0.12, [0.2, 2.5, SHUTTER.z1 + 0.06], 0x1c1917)
    .box(0.12, 5.0, 0.12, [-0.2, 2.5, SHUTTER.z0 - 0.06], 0x1c1917)
    .box(0.12, 5.0, 0.12, [-0.2, 2.5, SHUTTER.z1 + 0.06], 0x1c1917)
    .box(0.36, 0.08, 14.1, [0, 6.04, -5], 0x1c1917)
    .box(0.36, 0.12, 14.1, [0, 0.06, -5], 0x1c1917);
  ext.add(frame.mesh(M.standard({ vertexColors: true, roughness: 0.5, metalness: 0.55 }), { cast: true }));
  // slats: instanced; they roll into the drum as the curtain rises
  const slatGeo = metricBoxUv(new THREE.BoxGeometry(0.07, SHUTTER.slat - 0.012, SHUTTER.z1 - SHUTTER.z0), 0.07, SHUTTER.slat, 8, 0.6);
  const slatMat = M.standard({ color: 0x8f8984, roughness: 0.45, metalness: 0.7, normalMap: ribs, normalScale: new THREE.Vector2(0.4, 0.4) });
  const NSL = Math.round(SHUTTER.h / SHUTTER.slat);
  const slats = new THREE.InstancedMesh(slatGeo, slatMat, NSL);
  slats.frustumCulled = false;
  slats.userData.noMerge = true; // Z1: the curtain rolls (setMatrixAt)
  slats.castShadow = true;
  slats.receiveShadow = true;
  ext.add(slats);
  ctx.onDispose(() => slatGeo.dispose());
  const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, SHUTTER.z1 - SHUTTER.z0), M.hazard(30));
  bottomBar.userData.noMerge = true; // Z1: rises with the curtain
  ext.add(bottomBar);
  let rise = 0;
  const placeShutter = (): void => {
    for (let i = 0; i < NSL; i++) {
      const y = 0.12 + i * SHUTTER.slat + SHUTTER.slat / 2 + rise;
      if (y + SHUTTER.slat / 2 > SHUTTER.h + 0.02) slats.setMatrixAt(i, ZERO);
      else {
        M4.makeTranslation(0, y, (SHUTTER.z0 + SHUTTER.z1) / 2);
        slats.setMatrixAt(i, M4);
      }
    }
    slats.instanceMatrix.needsUpdate = true;
    bottomBar.position.set(0, 0.06 + rise, (SHUTTER.z0 + SHUTTER.z1) / 2);
  };
  placeShutter();
  let shutterCollider: { remove(): void } | null = ctx.physics.addStaticBox({ size: [0.2, SHUTTER.h, SHUTTER.z1 - SHUTTER.z0], position: [0, SHUTTER.h / 2, (SHUTTER.z0 + SHUTTER.z1) / 2] });

  // switch on the partition's end face
  const sw = S.targets.shutter;
  const swBox = new Painter()
    .box(0.36, 0.5, 0.14, [0, 1.3, 2.07], 0x292524)
    .box(0.44, 0.06, 0.16, [0, 1.58, 2.08], 0x1c1917)
    .mesh(M.standard({ vertexColors: true, roughness: 0.5, metalness: 0.4 }));
  det.add(swBox);
  const swTape = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.02), M.hazard(3));
  swTape.position.set(0, 1.0, 2.15);
  det.add(swTape);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.07, 24).rotateX(Math.PI / 2), M.orangePaint);
  button.position.set(0, 1.32, 2.17);
  det.add(button);
  ctx.text3d.create({ text: ctx.i18n.text('shutterSign'), font: 'mono-medium', size: 0.055, color: 0xd6d3d1, anchorX: 'center', letterSpacing: 0.12, position: [0, 1.48, 2.145] }, det);
  void sw;

  // ── hall: floor, frame, floods (exterior) ───────────────────────────────
  // own clone of the shared floor-plate material (never mutate library materials) with a polygon offset
  const floorMat = M.floorPlate(13, 16).clone();
  floorMat.polygonOffset = true;
  floorMat.polygonOffsetFactor = -6;
  floorMat.polygonOffsetUnits = -12;
  ctx.onDispose(() => floorMat.dispose());
  const floor = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.03, 15.6), floorMat);
  floor.position.set(6.95, 0.035, -4.6);
  floor.receiveShadow = true;
  ext.add(floor);
  // ART-V2 §6.6: the black open frame becomes an alu gantry with round members (Ø 0.25 m) on carbon
  // feet, carbon flood housings, and a teal readout bar under the front beam (it wakes during a run)
  const hall = new Painter();
  const COLS_Z = [-11.3, 2.8];
  const HC = 0xc9c4bf;
  const CF = 0x1c1917;
  const HALF_PI = Math.PI / 2;
  for (const z of COLS_Z) {
    for (const x of [0.45, 13.25]) {
      hall.cyl(0.11, 0.13, 7.2, [x, 0.2 + 3.6, z], HC, undefined, 20);
      hall.cyl(0.2, 0.22, 0.2, [x, 0.1, z], CF, undefined, 20);
    }
    hall.cyl(0.125, 0.125, 13.02, [6.85, 7.3, z], HC, [0, 0, HALF_PI], 20);
    // knee braces at the portal corners
    hall.cyl(0.05, 0.05, 1.5, [0.45 + 0.5, 6.6, z], HC, [0, 0, 0.785], 10);
    hall.cyl(0.05, 0.05, 1.5, [13.25 - 0.5, 6.6, z], HC, [0, 0, -0.785], 10);
  }
  for (const x of [0.45, 13.25]) hall.cyl(0.125, 0.125, COLS_Z[1] - COLS_Z[0], [x, 7.32, (COLS_Z[0] + COLS_Z[1]) / 2], HC, [HALF_PI, 0, 0], 20);
  hall.cyl(0.1, 0.1, 12.8, [6.85, 7.2, -4.8], HC, [0, 0, HALF_PI], 16);
  // X bracing in the outer wall plane (x = 13.25)
  {
    const dz = COLS_Z[1] - COLS_Z[0],
      dy = 6.6;
    const len = Math.hypot(dz, dy),
      ang = Math.atan2(dy, dz);
    hall.cyl(0.035, 0.035, len, [13.25, 0.35 + dy / 2, (COLS_Z[0] + COLS_Z[1]) / 2], HC, [HALF_PI - ang, 0, 0], 8);
    hall.cyl(0.035, 0.035, len, [13.25, 0.35 + dy / 2, (COLS_Z[0] + COLS_Z[1]) / 2], HC, [HALF_PI + ang, 0, 0], 8);
  }
  // flood housings (two on the mid beam, two on the end beams)
  const FLOODS: [number, number][] = [
    [4.4, -4.8],
    [8.6, -4.8],
    [5.2, -11.3],
    [5.2, 2.8],
  ];
  const housings = new Painter();
  for (const [x, z] of FLOODS) {
    housings.box(0.05, 0.5, 0.05, [x, 6.85, z], CF);
    housings.rbox(1.3, 0.14, 0.5, 0.05, [x, 6.55, z], CF);
  }
  ext.add(hall.mesh(M.brushedAlu, { cast: true }));
  ext.add(housings.mesh(M.carbon, { cast: false }));
  // teal readout bar under the front beam (z = 2.8), facing the hall entrance
  const readoutMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dd4bf) });
  ctx.onDispose(() => readoutMat.dispose());
  const readout = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.05, 0.04), readoutMat);
  readout.position.set(6.85, 7.08, 2.8);
  ext.add(readout);
  const readoutT0 = ctx.materials.tierScale(0x2dd4bf, 'T0');
  const readoutT1 = ctx.materials.tierScale(0x2dd4bf, 'T1');
  readoutMat.color.set(0x2dd4bf).multiplyScalar(readoutT0);
  S.onUpdate(() => {
    const k = S.running ? readoutT1 : readoutT0;
    readoutMat.color.set(0x2dd4bf).multiplyScalar(k);
  });
  for (const z of COLS_Z) for (const x of [0.45, 13.25]) ctx.physics.addStaticBox({ size: [0.22, 7.4, 0.22], position: [x, 3.7, z] });
  const floodMat = new THREE.MeshBasicMaterial({ color: 0x2a2725 });
  ctx.onDispose(() => floodMat.dispose());
  const floodGeo: THREE.BufferGeometry[] = [];
  for (const [x, z] of FLOODS) floodGeo.push(place(new THREE.PlaneGeometry(1.15, 0.36).rotateX(Math.PI / 2), [x, 6.475, z]));
  const floodPanels = new THREE.Mesh(mergeKeepUv(floodGeo), floodMat);
  ext.add(floodPanels);

  // Gegenlicht floodlamp on a tripod (detail) + glare sprite
  const GL = new THREE.Vector3(12.0, 3.0, -10.0);
  const aim = new THREE.Vector3().copy(LINE.base).setY(1.1).sub(GL).normalize();
  const yaw = Math.atan2(aim.x, aim.z);
  const pitch = Math.asin(aim.y);
  const lamp = new Painter()
    .cyl(0.025, 0.025, 2.75, [GL.x, 1.4, GL.z], 0x292524)
    .cyl(0.02, 0.02, 1.6, [GL.x + 0.45, 0.6, GL.z], 0x292524, [0, 0, 0.55])
    .cyl(0.02, 0.02, 1.6, [GL.x - 0.24, 0.6, GL.z + 0.4], 0x292524, [0.48, 0, -0.27])
    .cyl(0.02, 0.02, 1.6, [GL.x - 0.24, 0.6, GL.z - 0.4], 0x292524, [-0.48, 0, -0.27]);
  det.add(lamp.mesh(M.standard({ vertexColors: true, roughness: 0.6, metalness: 0.4 })));
  const head = new THREE.Group();
  head.position.copy(GL);
  head.rotation.set(-pitch, yaw, 0, 'YXZ');
  det.add(head);
  head.add(new Painter().box(0.7, 0.55, 0.32, [0, 0, -0.1], 0x1c1917).box(0.78, 0.04, 0.12, [0, 0.3, 0.05], 0x1c1917).mesh(M.standard({ vertexColors: true, roughness: 0.5, metalness: 0.5 })));
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x1a1817 });
  ctx.onDispose(() => lensMat.dispose());
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), lensMat);
  lens.position.z = 0.065;
  head.add(lens);
  const glareMat = glowMaterial(0xfff4e4, 0);
  ctx.onDispose(() => glareMat.dispose());
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), glareMat);
  glare.position.copy(GL).addScaledVector(aim, 0.25);
  glare.renderOrder = 6;
  det.add(glare);

  // ── conveyor + bin + floor border (detail) ───────────────────────────────
  const beltLen = LINE.beltZ1 - LINE.beltZ0;
  const conv = new Painter()
    .box(0.08, 0.14, beltLen + 0.3, [LINE.beltX - 0.36, LINE.beltY - 0.04, (LINE.beltZ0 + LINE.beltZ1) / 2], 0x44403c)
    .box(0.08, 0.14, beltLen + 0.3, [LINE.beltX + 0.36, LINE.beltY - 0.04, (LINE.beltZ0 + LINE.beltZ1) / 2], 0x44403c)
    .cyl(0.06, 0.06, 0.66, [LINE.beltX, LINE.beltY - 0.06, LINE.beltZ0 - 0.1], 0x78716c, [0, 0, Math.PI / 2])
    .cyl(0.06, 0.06, 0.66, [LINE.beltX, LINE.beltY - 0.06, LINE.beltZ1 + 0.1], 0x78716c, [0, 0, Math.PI / 2])
    // stopper at the pick point
    .box(0.6, 0.05, 0.03, [LINE.beltX, LINE.beltY + 0.03, LINE.pick.z + 0.06], 0x1c1917);
  for (let z = LINE.beltZ0 + 0.4; z < LINE.beltZ1; z += 1.9)
    for (const dx of [-0.3, 0.3]) conv.box(0.06, LINE.beltY - 0.1, 0.06, [LINE.beltX + dx, (LINE.beltY - 0.1) / 2, z], 0x292524);
  // pedestal of the second arm + bin stand + KLT bin
  conv.box(0.55, 0.5, 0.55, [LINE.base.x, 0.25, LINE.base.z], 0x3d3a37);
  conv.box(0.6, 0.42, 0.5, [LINE.bin.x, 0.21, LINE.bin.z], 0x292524);
  const binY = 0.42;
  conv.box(0.5, 0.02, 0.4, [LINE.bin.x, binY + 0.01, LINE.bin.z], 0x44403c);
  conv.box(0.5, 0.31, 0.02, [LINE.bin.x, binY + 0.16, LINE.bin.z - 0.19], 0x57534e);
  conv.box(0.5, 0.31, 0.02, [LINE.bin.x, binY + 0.16, LINE.bin.z + 0.19], 0x57534e);
  conv.box(0.02, 0.31, 0.4, [LINE.bin.x - 0.24, binY + 0.16, LINE.bin.z], 0x57534e);
  conv.box(0.02, 0.31, 0.4, [LINE.bin.x + 0.24, binY + 0.16, LINE.bin.z], 0x57534e);
  const convMesh = conv.mesh(M.standard({ vertexColors: true, roughness: 0.55, metalness: 0.45 }), { cast: true });
  det.add(convMesh);
  ctx.physics.addStaticBox({ size: [0.8, LINE.beltY, beltLen], position: [LINE.beltX, LINE.beltY / 2, (LINE.beltZ0 + LINE.beltZ1) / 2] });
  ctx.physics.addStaticBox({ size: [0.55, 0.5, 0.55], position: [LINE.base.x, 0.25, LINE.base.z] });
  ctx.physics.addStaticBox({ size: [0.6, 0.73, 0.5], position: [LINE.bin.x, 0.365, LINE.bin.z] });
  // belt: scrolling texture
  const beltTex = makeCanvas(64, 256);
  ctx.onDispose(() => beltTex.tex.dispose());
  {
    const g = beltTex.g;
    g.fillStyle = '#1f1d1b';
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#2b2826';
    for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 64, 3);
    g.fillStyle = 'rgba(214,211,209,0.08)';
    g.fillRect(0, 0, 64, 1);
    g.font = `500 10px ${FONT_MONO}`;
    beltTex.tex.wrapS = beltTex.tex.wrapT = THREE.RepeatWrapping;
    beltTex.tex.repeat.set(1, beltLen / 1.0);
    beltTex.tex.needsUpdate = true;
  }
  const beltMat = new THREE.MeshStandardMaterial({ map: beltTex.tex, roughness: 0.85, metalness: 0.05 });
  ctx.onDispose(() => beltMat.dispose());
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.62, beltLen).rotateX(-Math.PI / 2), beltMat);
  belt.position.set(LINE.beltX, LINE.beltY + 0.002, (LINE.beltZ0 + LINE.beltZ1) / 2);
  belt.receiveShadow = true;
  det.add(belt);
  // hazard-tape floor border around the line cell
  const B = { x0: 3.9, x1: 8.3, z0: -10.7, z1: -3.6 };
  const tp = new Painter()
    .addUv(new THREE.BoxGeometry(B.x1 - B.x0, 0.012, 0.1), [(B.x0 + B.x1) / 2, 0.058, B.z0])
    .addUv(new THREE.BoxGeometry(B.x1 - B.x0, 0.012, 0.1), [(B.x0 + B.x1) / 2, 0.058, B.z1])
    .addUv(new THREE.BoxGeometry(B.z1 - B.z0, 0.012, 0.1), [B.x0, 0.058, (B.z0 + B.z1) / 2], [0, Math.PI / 2, 0]);
  const tapeMesh = new THREE.Mesh(tp.merge(), M.hazard(44));
  tapeMesh.receiveShadow = true;
  det.add(tapeMesh);

  // ── second arm (detail) ──────────────────────────────────────────────────
  const arm = createArm(M.standard({ vertexColors: true, roughness: 0.26, metalness: 0.12 }));
  arm.object.position.copy(LINE.base);
  det.add(arm.object);
  ctx.onDispose(() => arm.dispose());
  arm.reach(LINE.home.x, LINE.home.y - 0.4, LINE.home.z, 0);
  const servo = ctx.audio.loop('servo', { at: arm.object, volume: 0 });
  const convLoop = ctx.audio.loop('conveyor', { at: [LINE.beltX, 1, -6], volume: 0 });

  // parts: 0 active, 1–5 belt queue, 6–11 bin, 12–14 floor
  const partGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.05, 6);
  ctx.onDispose(() => partGeo.dispose());
  const NP = 15;
  const parts = new THREE.InstancedMesh(partGeo, M.steel, NP);
  parts.frustumCulled = false;
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  det.add(parts);
  const beltParts: number[] = [LINE.pick.z, LINE.pick.z - 0.55, LINE.pick.z - 1.1, LINE.pick.z - 1.65];
  let binCount = 0;
  const floorParts: { x: number; z: number; t: number }[] = [];
  const active = { on: false, attached: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, falling: false, target: 'bin' as 'bin' | 'floor' | 'belt', landY: 0 };

  const binSlot = (i: number, out: THREE.Vector3): THREE.Vector3 => {
    const col = i % 3,
      row = Math.floor(i / 3) % 2;
    return out.set(LINE.bin.x - 0.12 + col * 0.12, LINE.bin.y, LINE.bin.z - 0.07 + row * 0.14);
  };

  // ── cycle plans ──────────────────────────────────────────────────────────
  const k = (t: number, x: number, y: number, z: number, grip: number): Key => ({ t, x, y, z, yaw: 0, grip });
  /** base plan (s = time scale): release at 3.45·s */
  const makePlan = (variant: Variant, s: number, ox: number, oz: number): Plan => {
    const P = LINE.pick,
      H = LINE.home,
      Bx = LINE.bin.x + ox,
      Bz = LINE.bin.z + oz;
    const plan: Plan = { keys: [], variant, dur: 4.6 * s, graspT: 1.35 * s, releaseT: 3.45 * s, slipT: 99, dropT: 99, grasp2T: 99, ox, oz };
    if (variant === 'stop') {
      plan.keys = [k(0, H.x, H.y, H.z, GRIP_OPEN), k(plan.dur, H.x, H.y, H.z, GRIP_OPEN)];
      plan.graspT = plan.releaseT = 99;
      return plan;
    }
    const missDz = variant === 'miss' ? 0.07 : 0;
    const gClose = variant === 'miss' ? 0.012 : GRIP_CLOSED;
    if (variant === 'regrasp') {
      // first grasp slips at lift-off, the arm goes down again
      plan.keys = [
        k(0, H.x, H.y, H.z, GRIP_OPEN),
        k(0.8 * s, P.x, P.y + 0.22, P.z, GRIP_OPEN),
        k(1.15 * s, P.x, P.y, P.z, GRIP_OPEN),
        k(1.35 * s, P.x, P.y, P.z, GRIP_CLOSED),
        k(1.6 * s, P.x, P.y + 0.09, P.z, GRIP_CLOSED),
        k(1.75 * s, P.x, P.y + 0.09, P.z, GRIP_OPEN),
        k(2.15 * s, P.x, P.y, P.z, GRIP_OPEN),
        k(2.35 * s, P.x, P.y, P.z, GRIP_CLOSED),
        k(2.75 * s, P.x, P.y + 0.25, P.z, GRIP_CLOSED),
        k(3.75 * s, Bx, 0.95, Bz, GRIP_CLOSED),
        k(4.25 * s, Bx, LINE.bin.y + 0.055, Bz, GRIP_CLOSED),
        k(4.45 * s, Bx, LINE.bin.y + 0.055, Bz, GRIP_OPEN),
        k(4.85 * s, Bx, 0.85, Bz, GRIP_OPEN),
        k(5.6 * s, H.x, H.y, H.z, GRIP_OPEN),
      ];
      plan.dur = 5.6 * s;
      plan.dropT = 1.62 * s;
      plan.grasp2T = 2.35 * s;
      plan.releaseT = 4.45 * s;
      return plan;
    }
    const hold = variant === 'slow' ? 3.2 * s : 0;
    const wig = variant === 'slow' ? 0.04 : 0;
    const dropBeside = variant === 'dropBeside';
    const rx = dropBeside ? Bx + 0.2 : Bx,
      rz = dropBeside ? Bz + 0.26 : Bz;
    const ry = dropBeside ? 0.95 : LINE.bin.y + 0.055;
    plan.keys = [
      k(0, H.x, H.y, H.z, GRIP_OPEN),
      k(0.8 * s, P.x, P.y + 0.22, P.z + missDz, GRIP_OPEN),
      k(1.15 * s, P.x, P.y, P.z + missDz, GRIP_OPEN),
      k(1.35 * s, P.x, P.y, P.z + missDz, gClose),
      k(1.75 * s, P.x, P.y + 0.25, P.z + missDz, gClose),
      k(2.75 * s, Bx, 0.95, Bz, gClose),
      ...(hold
        ? [k(2.75 * s + hold * 0.3, Bx + wig, 0.9, Bz - wig, gClose), k(2.75 * s + hold * 0.65, Bx - wig, 0.93, Bz + wig * 0.5, gClose), k(2.75 * s + hold, Bx, 0.95, Bz, gClose)]
        : []),
      k(3.25 * s + hold, rx, ry, rz, gClose),
      k(3.45 * s + hold, rx, ry, rz, GRIP_OPEN),
      k(3.85 * s + hold, rx, 0.85, rz, GRIP_OPEN),
      k(4.6 * s + hold, H.x, H.y, H.z, GRIP_OPEN),
    ];
    plan.dur = 4.6 * s + hold;
    plan.releaseT = 3.45 * s + hold;
    if (variant === 'miss') plan.graspT = 99;
    if (variant === 'slip') plan.slipT = 2.2 * s;
    return plan;
  };
  /** release time of a variant at s = 1 (for clip timing) */
  const releaseAt1 = (v: Variant): number => (v === 'regrasp' ? 4.45 : v === 'slow' ? 3.45 + 3.2 : 3.45);

  // ── cycle player ─────────────────────────────────────────────────────────
  let plan: Plan | null = null;
  let t = 0;
  let mode: 'dormant' | 'production' | 'run' | 'replay' = 'dormant';
  /** station C: 2× fast-forward for the clip replays */
  let replaySpeed = 1;
  let clip: Clip | null = null;
  const key = newKey();
  const tcp = new THREE.Vector3();
  const prodRand = rng(7);
  let vib = 0;
  let vibOn = false;

  const startPlan = (p: Plan): void => {
    plan = p;
    t = 0;
    active.on = false;
    active.attached = false;
    active.falling = false;
  };
  const finishPlan = (): void => {
    if (!plan) return;
    if (active.on && !active.falling && active.target === 'bin') {
      binCount++;
      if (binCount > 6) binCount = 1;
    }
    plan = null;
    active.on = false;
  };

  const stepPart = (dt: number): void => {
    if (!plan) return;
    const p = plan;
    const consumes = p.variant !== 'miss' && p.variant !== 'stop';
    // grasp: take the front belt part
    if (consumes && !active.on && t >= p.graspT && mode !== 'replay') {
      if (beltParts.length && Math.abs(beltParts[0] - LINE.pick.z) < 0.02) beltParts.shift();
      active.on = true;
      active.attached = true;
    } else if (consumes && !active.on && t >= p.graspT && mode === 'replay') {
      active.on = true;
      active.attached = true;
    }
    if (!active.on) return;
    if (active.attached) {
      arm.tcpLocal(tcp);
      if (p.variant === 'regrasp' && t >= p.dropT && t < p.grasp2T) {
        // slipped back onto the belt
        active.x = LINE.pick.x;
        active.z = LINE.pick.z;
        active.y = Math.max(LINE.pick.y, active.y - dt * 1.2);
        return;
      }
      const leave = p.variant === 'slip' ? p.slipT : p.releaseT;
      if (t >= leave) {
        active.attached = false;
        active.falling = true;
        active.vx = (tcp.x - active.x) / Math.max(dt, 1e-3);
        active.vz = (tcp.z - active.z) / Math.max(dt, 1e-3);
        active.vx = THREE.MathUtils.clamp(active.vx, -1.5, 1.5) * 0.6;
        active.vz = THREE.MathUtils.clamp(active.vz, -1.5, 1.5) * 0.6;
        active.vy = 0;
        const toFloor = p.variant === 'slip' || p.variant === 'dropBeside';
        active.target = toFloor ? 'floor' : 'bin';
        if (!toFloor) {
          binSlot(binCount % 6, V);
          active.vx = active.vz = 0;
          active.x = V.x + p.ox;
          active.z = V.z + p.oz;
          active.landY = V.y;
        } else active.landY = LINE.floorY;
      } else {
        active.x = tcp.x;
        active.y = tcp.y;
        active.z = tcp.z;
      }
    } else if (active.falling) {
      active.vy -= 9.81 * dt;
      active.x += active.vx * dt;
      active.z += active.vz * dt;
      active.y += active.vy * dt;
      if (active.y <= active.landY) {
        active.y = active.landY;
        active.falling = false;
        if (active.target === 'floor') {
          if (mode !== 'replay') {
            floorParts.push({ x: active.x, z: active.z, t: 0 });
            if (floorParts.length > 3) floorParts.shift();
            active.on = false;
          }
          ctx.audio.play('drop', { at: [active.x, 0.1, active.z], volume: 0.5, pitch: 1.6 });
        } else if (mode === 'run' || mode === 'production') ctx.audio.play('click', { at: [active.x, 0.6, active.z], volume: 0.35, pitch: 0.7 });
      }
    }
  };

  const writeParts = (dt: number): void => {
    let i = 0;
    const put = (x: number, y: number, z: number, s = 1): void => {
      M4.compose(V.set(x, y, z), Q.identity(), V2.set(s, s, s));
      parts.setMatrixAt(i++, M4);
    };
    // active (in a replay the clip's part waits at the pick point)
    if (active.on) put(active.x, active.y, active.z);
    else if (mode === 'replay') put(LINE.pick.x, LINE.pick.y, LINE.pick.z);
    else parts.setMatrixAt(i++, ZERO);
    // belt
    for (let b = 0; b < 5; b++) {
      if (b < beltParts.length && !(mode === 'replay' && b === 0)) put(LINE.beltX, LINE.beltY + 0.025, beltParts[b]);
      else parts.setMatrixAt(i++, ZERO);
    }
    // bin
    for (let b = 0; b < 6; b++) {
      if (b < binCount && mode !== 'replay') {
        binSlot(b, V2);
        put(V2.x, V2.y, V2.z);
      } else parts.setMatrixAt(i++, ZERO);
    }
    // floor
    for (let b = 0; b < 3; b++) {
      const f = floorParts[b];
      if (f) {
        f.t += dt;
        const s = f.t > 2.2 ? Math.max(0, 1 - (f.t - 2.2) / 0.4) : 1;
        if (s <= 0) parts.setMatrixAt(i++, ZERO);
        else put(f.x, LINE.floorY, f.z, s);
      } else parts.setMatrixAt(i++, ZERO);
    }
    while (floorParts.length && floorParts[0].t > 2.6) floorParts.shift();
    parts.instanceMatrix.needsUpdate = true;
  };

  let beltSpeed = 0;
  const advanceBelt = (dt: number, speed: number): void => {
    beltSpeed = speed;
    if (speed <= 0) return;
    for (let b = 0; b < beltParts.length; b++) {
      const limit = b === 0 ? LINE.pick.z : beltParts[b - 1] - 0.55;
      beltParts[b] = Math.min(limit, beltParts[b] + speed * dt);
    }
    const last = beltParts.length ? beltParts[beltParts.length - 1] : LINE.pick.z;
    if (beltParts.length < 5 && last - LINE.beltZ0 > 0.7) beltParts.push(LINE.beltZ0 + 0.15);
    beltTex.tex.offset.y -= (speed * dt) / 1.0;
  };

  let pendingRun: { o: Outcome; dur: number }[] = [];
  const outcomeVariant = (o: Outcome): Variant =>
    o === 'erfolg' ? 'ok' : o === 'rutschen' ? 'slip' : o === 'fehlgriff' ? 'miss' : o === 'uebertemp' ? 'stop' : o === 'drift' ? 'dropBeside' : 'offset';

  const focus = new THREE.Vector3();
  ctx.toWorld([LINE.base.x + 0.6, 1.0, LINE.base.z + 0.3], focus);

  S.onUpdate((dt) => {
    // vibration of the line during a run (applied after the IK so the whole arm shakes)
    const amp = vibOn && mode === 'run' ? (vib === 2 ? 0.006 : vib === 1 ? 0.0025 : 0) : 0;
    const jig = amp ? Math.sin(ctx.time.elapsed * 2 * Math.PI * 23) * amp : 0;
    arm.object.position.copy(LINE.base);
    convMesh.position.x = jig * 0.6;
    belt.position.x = LINE.beltX + jig * 0.6;
    if (mode === 'dormant') {
      servo.setVolume(0, 0.2);
      convLoop.setVolume(0, 0.2);
      writeParts(dt);
      return;
    }
    if (!plan) {
      if (mode === 'production') startPlan(makePlan(prodRand() < 0.9 ? 'ok' : prodRand() < 0.5 ? 'slip' : 'miss', 1.05, (prodRand() - 0.5) * 0.02, (prodRand() - 0.5) * 0.02));
      else if (mode === 'run' && pendingRun.length) {
        const r = pendingRun.shift()!;
        startPlan(makePlan(outcomeVariant(r.o), Math.max(0.075, r.dur) / 4.6, r.o === 'teil' ? 0.11 : 0, r.o === 'teil' ? -0.06 : 0));
      } else if (mode === 'replay' && clip) startClip(clip);
    }
    if (plan) {
      t += mode === 'replay' ? dt * replaySpeed : dt;
      evalKeys(plan.keys, t, key);
      arm.reach(key.x, key.y, key.z, key.yaw);
      arm.setGrip(key.grip);
      if (jig) arm.object.position.set(LINE.base.x + jig, LINE.base.y + jig * 0.4, LINE.base.z);
      stepPart(dt);
      if (t >= plan.dur) {
        if (mode === 'replay' && clip) {
          // hold the end pose for a beat, then loop
          if (t >= plan.dur + 1.2) startClip(clip);
        } else finishPlan();
      }
    }
    const moving = !!plan;
    servo.setVolume(moving ? (mode === 'run' ? 0.8 : 0.5) : 0, 0.15);
    servo.setPitch(mode === 'run' ? 1.6 : 1);
    const speed = mode === 'run' ? 0.55 / Math.max(0.09, pendingRun.length ? pendingRun[0].dur : 0.3) : mode === 'production' ? 0.22 : 0;
    advanceBelt(dt, speed);
    convLoop.setVolume(beltSpeed > 0 ? 0.7 : 0, 0.3);
    convLoop.setPitch(mode === 'run' ? 1.5 : 1);
    writeParts(dt);
  });

  let clipT0 = 0;
  const startClip = (c: Clip): void => {
    clip = c;
    const variant: Variant = c.motion;
    const s = c.facts.timeS / releaseAt1(variant);
    const p = makePlan(variant, s, c.place[0] / 1000, c.place[1] / 1000);
    if (variant === 'miss') {
      // "release" = end of the run (5.2 s): stretch the whole cycle accordingly
      p.releaseT = c.facts.timeS;
    }
    startPlan(p);
    clipT0 = ctx.time.elapsed;
    // the clip's part waits at the pick point
    active.on = false;
  };

  // ── lights: stage ↔ hall ─────────────────────────────────────────────────
  const Lkey = ctx.lights.point([-7, 7.0, -2.2], { color: 0xfff0dc, intensity: 70, distance: 15 });
  const Lfill = ctx.lights.point([-7, 3.0, 2.4], { color: 0xfff0dc, intensity: 16, distance: 9 });
  const Lhall = ctx.lights.point([6.4, 6.3, -4.8], { color: 0xffe9d2, intensity: 0, distance: 17 });
  const Lgegen = ctx.lights.point(GL.clone().addScaledVector(aim, 0.6), { color: 0xfff6ea, intensity: 0, distance: 13 });
  let floodTarget = 0,
    floodLevel = 0,
    floodFlicker = 0;
  let gegenOn = false;
  S.lights = {
    set(m, studio) {
      if (m === 'stage') {
        Lkey.setIntensity(70);
        Lfill.setIntensity(16);
        Lhall.setIntensity(0);
        Lgegen.setIntensity(0);
        floodTarget = 0;
        gegenOn = false;
      } else {
        Lkey.setIntensity(0);
        Lfill.setIntensity(0);
        Lhall.setIntensity(studio ? 95 : 62);
        Lgegen.setIntensity(studio ? 0 : 48);
        floodTarget = 1;
        gegenOn = !studio;
      }
    },
  };
  S.lights.set('stage', false);
  S.onUpdate((dt) => {
    if (floodLevel !== floodTarget) {
      floodLevel = floodTarget > floodLevel ? Math.min(floodTarget, floodLevel + dt * 0.9) : Math.max(floodTarget, floodLevel - dt * 3);
      floodFlicker = floodLevel < 0.7 && floodTarget > 0 ? (Math.sin(ctx.time.elapsed * 47) > 0.3 ? 1 : 0.2) : 1;
      const v = floodLevel * floodFlicker;
      floodMat.color.setRGB(0.16 + v * 1.45, 0.15 + v * 1.38, 0.145 + v * 1.25);
    }
    const g = glareMat.uniforms.uStrength;
    const tgt = gegenOn ? 0.85 : 0;
    if (g.value !== tgt) {
      g.value += (tgt - g.value) * Math.min(1, dt * 5);
      if (Math.abs(g.value - tgt) < 0.01) g.value = tgt;
      lensMat.color.setRGB(0.1 + g.value * 2.4, 0.1 + g.value * 2.3, 0.1 + g.value * 2.15);
    }
    glare.visible = g.value > 0.01;
    if (glare.visible) glare.quaternion.copy(ctx.camera.quaternion).premultiply(Q.copy(ctx.root.quaternion).invert());
  });

  // ── shutter opening ──────────────────────────────────────────────────────
  let opening = false;
  S.onUpdate((dt) => {
    if (!opening) return;
    rise = Math.min(SHUTTER.h + 0.1, rise + dt * (SHUTTER.h / 4));
    placeShutter();
    if (rise > 2.2 && shutterCollider) {
      shutterCollider.remove();
      shutterCollider = null;
    }
    if (rise >= SHUTTER.h + 0.1) opening = false;
  });

  return {
    armObject: arm.object,
    get shutterRise() {
      return rise;
    },
    focus,
    shutterButton: button,
    openShutter(instant = false) {
      if (S.shutterOpen) return;
      S.shutterOpen = true;
      ctx.progress.set('shutter', true);
      if (instant) {
        rise = SHUTTER.h + 0.1;
        placeShutter();
        shutterCollider?.remove();
        shutterCollider = null;
        S.lights?.set('hall', false);
        floodLevel = 0.999;
        mode = 'production';
        return;
      }
      opening = true;
      S.sfx.rattle([0, 3, -4], 4.2);
      ctx.audio.play('click', { at: [0, 1.3, 2.1] });
      ctx.after(0.9, () => {
        S.lights?.set('hall', false);
        S.sfx.clunk([6, 6.5, -4.8], false);
      });
      ctx.after(1.8, () => {
        mode = 'production';
      });
    },
    setProduction(on) {
      if (mode === 'replay' || mode === 'run') return;
      mode = on ? 'production' : 'dormant';
    },
    runCycle(o, dur) {
      if (mode !== 'run') {
        mode = 'run';
        if (plan) finishPlan();
        pendingRun = [];
      }
      pendingRun.push({ o, dur });
      if (pendingRun.length > 3) pendingRun.splice(0, pendingRun.length - 3);
    },
    playClip(c) {
      if (!c) {
        clip = null;
        if (plan) finishPlan();
        mode = S.shutterOpen ? 'production' : 'dormant';
        S.replaying = false;
        return;
      }
      mode = 'replay';
      S.replaying = true;
      if (plan) finishPlan();
      floorParts.length = 0;
      startClip(c);
    },
    get clipTime() {
      return (ctx.time.elapsed - clipT0) * replaySpeed;
    },
    setReplaySpeed(k: number) {
      // keep the clip phase continuous across the switch
      const now = (ctx.time.elapsed - clipT0) * replaySpeed;
      replaySpeed = Math.max(0.25, Math.min(4, k));
      clipT0 = ctx.time.elapsed - now / replaySpeed;
    },
    get clipDur() {
      return plan ? plan.dur : 0;
    },
    setConditions(v, studio, running) {
      vib = v;
      vibOn = running;
      S.lights?.set('hall', studio);
      if (!running && mode === 'run') {
        pendingRun = [];
        mode = 'production';
      }
    },
  };
}

function mergeKeepUv(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // geometries keep their uv; add no colour
  const p = new Painter();
  for (const g of list) p.parts.push(g);
  return p.merge();
}
