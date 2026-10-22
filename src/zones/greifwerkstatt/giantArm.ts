/**
 * Riesenarm (landmark, GDD §7.3): an unbranded, procedural 3-link industrial arm on a 4 m base at
 * local (−9, 0, −11) holding a 4 m egg. Base yaw + shoulder + elbow + wrist (orange rings = "das
 * dreht sich"), three-finger gripper. Idle 40 s loop: hold the egg high, set it into its cradle at
 * (−1, 0, −16), let go, grip again, lift. The fingers squeeze in sync with station B's grip force.
 *
 * Kinematics: analytic 2-link IK (elbow up) in the vertical arm plane; the wrist keeps the tool
 * pointing straight down so the egg hangs vertically. Cheap enough for updateFar (≤ 0.1 ms).
 *
 * Draws (Phase 7, plan §5.5 ledger, the plaza's „each lobe exterior ≤ 10“): the moving chain (turret,
 * three links), the six phalanges and the egg are ONE rigidly skinned mesh — every part follows its own
 * group as a bone (the groups stay in the scene graph and move as before) — with two material groups
 * (painted body, orange joint rings): 2 draws instead of 6. The skinned shadow-depth program is the
 * engine's boot warm-up one; the two colour programs compile with the zone's background warm-up.
 */
import * as THREE from 'three';
import { COL, type Ctx, axle, box, clamp, cyl, lerp, merge, paint, setShadow, smoother } from './shared';
import type { Look } from './look';

export const ARM_BASE = new THREE.Vector3(-9, 0, -11);
export const CRADLE = new THREE.Vector3(-1, 0, -16);
const SHOULDER_Y = 6.0;
const L1 = 6,
  L2 = 5,
  L3 = 3;
const EGG_RX = 1.4,
  EGG_RY = 2.0;
/** wrist joint → egg centre (link3 3 m, palm 0.25 m, 5 cm gap, egg half-height 2 m) */
const W_TO_EGG = L3 + 0.125 + 0.05 + EGG_RY; // 5.175
const SEAT_Y = 2.7; // egg centre when it rests in the cradle (egg bottom at 0.7 m)
const PERIOD = 40;

interface Pose {
  psi: number; // yaw (rad) in zone x/z: direction (cos ψ, sin ψ)
  r: number; // horizontal distance base axis → wrist joint
  h: number; // wrist joint height
}

const dx0 = CRADLE.x - ARM_BASE.x,
  dz0 = CRADLE.z - ARM_BASE.z;
const P_ABOVE: Pose = { psi: Math.atan2(dz0, dx0), r: Math.hypot(dx0, dz0), h: SEAT_Y + W_TO_EGG + 1.4 };
const P_SEAT: Pose = { ...P_ABOVE, h: SEAT_Y + W_TO_EGG };
// lift pose: the arm reaches out toward +x so visitors at the gate see it in profile (a crane holding an egg)
const P_LIFT: Pose = { psi: 0.05, r: 5.5, h: 15.0 };

/** Lathe egg: 2·rx wide, 2·ry tall, slightly fuller at the bottom (a real egg, not an ellipsoid). */
export function eggGeometry(rx: number, ry: number, radial: number, rings: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = -1 + (2 * i) / rings; // −1 bottom … +1 top
    const s = Math.sqrt(Math.max(0, 1 - t * t));
    pts.push(new THREE.Vector2(rx * s * (1 - 0.09 * t), ry * t));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, radial);
}

/** Box along +x from 0 to len whose cross-section tapers from (h0, d0) to (h1, d1). */
function taperBeam(len: number, h0: number, d0: number, h1: number, d1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(len, 1, 1, 4, 1, 1).translate(len / 2, 0, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / len;
    p.setY(i, p.getY(i) * lerp(h0, h1, t));
    p.setZ(i, p.getZ(i) * lerp(d0, d1, t));
  }
  g.computeVertexNormals();
  return g;
}

export interface GiantArm {
  /** advance the idle loop (s) */
  update(dt: number, elapsed: number): void;
  /** station B: grip force 0…30 N → fingers squeeze 0…6° */
  setSqueeze(forceN: number): void;
  /** station B crack → fingers shiver */
  shiver(): void;
  readonly eggWorldPosition: THREE.Vector3;
  /** static far-tier silhouette (lift pose) */
  buildFar(group: THREE.Group): void;
  /** debug: jump the idle loop to t seconds */
  setClock(t: number): void;
  /** a stamp was earned: raise the egg in a short salute */
  celebrate(): void;
}

export function buildGiantArm(ctx: Ctx, look: Look): GiantArm {
  const M = ctx.materials;
  const g = ctx.groups.exterior;
  const vc = M.standard({ vertexColors: true, metalness: 0.35, roughness: 0.62 });
  const ringMat = M.emissive(COL.orange, 1.15);

  const root = new THREE.Group();
  root.position.copy(ARM_BASE);
  g.add(root);

  // ── static base drum + cradle + floor collar ───────────────────────────────
  const baseProfile = [
    [0, 0],
    [2.05, 0],
    [2.05, 0.22],
    [1.9, 0.32],
    [1.6, 0.4],
    [1.55, 0.95],
    [1.75, 1.0],
    [0, 1.0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const baseGeo = merge([
    paint(new THREE.LatheGeometry(baseProfile, 40), 0xd6d3d1),
    // bolt ring
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return paint(cyl(0.07, 0.07, 0.1, 6, Math.cos(a) * 1.85, 0.27, Math.sin(a) * 1.85), COL.steel);
    }),
  ]);
  const base = new THREE.Mesh(baseGeo, vc);
  root.add(base);
  setShadow(base, true);
  // alu base collars (ART-V2 §6.3) + a teal T0 status line in a carbon channel
  const collar = new THREE.Mesh(
    merge([
      new THREE.TorusGeometry(2.08, 0.06, 8, 64).rotateX(Math.PI / 2).translate(0, 0.25, 0),
      new THREE.CylinderGeometry(1.8, 1.8, 0.07, 48, 1, true).translate(0, 1.0, 0),
      new THREE.TorusGeometry(1.79, 0.05, 8, 64).rotateX(Math.PI / 2).translate(0, 1.03, 0),
    ].map((g) => g.toNonIndexed())),
    look.alu,
  );
  root.add(collar);
  const status = new THREE.Mesh(new THREE.TorusGeometry(1.585, 0.018, 4, 64).rotateX(Math.PI / 2).translate(0, 0.7, 0), look.light('teal', 0));
  root.add(status);

  // cradle (world-local): three legs, a ring cup and a foot plate
  const cradleParts: THREE.BufferGeometry[] = [paint(cyl(1.25, 1.35, 0.16, 32, 0, 0.08, 0), 0xc9c4bf)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const leg = new THREE.CylinderGeometry(0.09, 0.12, 1.15, 8);
    leg.rotateZ(0.32);
    leg.rotateY(-a);
    leg.translate(Math.cos(a) * 1.0, 0.62, Math.sin(a) * 1.0);
    cradleParts.push(paint(leg, COL.chassis));
  }
  const cup = new THREE.TorusGeometry(0.86, 0.1, 10, 40).rotateX(Math.PI / 2).translate(0, 1.12, 0);
  cradleParts.push(paint(cup, COL.carbon));
  const cradle = new THREE.Mesh(merge(cradleParts), vc);
  cradle.position.set(CRADLE.x, 0, CRADLE.z);
  g.add(cradle);
  setShadow(cradle, true);

  // ── moving chain ──────────────────────────────────────────────────────────
  const turret = new THREE.Group();
  root.add(turret);
  const turretGeo = merge([
    paint(cyl(1.75, 1.8, 0.3, 40, 0, 1.15, 0), COL.chassis),
    paint(box(1.5, SHOULDER_Y - 1.7, 1.45, 0, 1.3 + (SHOULDER_Y - 1.7) / 2, 0), COL.shell),
    paint(box(1.56, 0.12, 1.5, 0, 1.4, 0), COL.shellShadow),
    paint(box(1.7, 2.0, 0.24, 0, SHOULDER_Y - 0.25, 0.78), COL.shell),
    paint(box(1.7, 2.0, 0.24, 0, SHOULDER_Y - 0.25, -0.78), COL.shell),
    paint(axle(0.55, 1.95, 24, 0, SHOULDER_Y, 0), COL.chassis),
    // service hatch lines on the column (dark inlays)
    paint(box(0.9, 0.04, 0.02, 0, 2.2, 0.735), COL.chassis),
    paint(box(0.9, 0.04, 0.02, 0, 3.6, 0.735), COL.chassis),
    paint(box(0.9, 0.04, 0.02, 0, 4.4, 0.735), COL.chassis),
  ]);
  // the parts of the skinned chain: [geometry in its bone's frame, bone, ring?]
  const chain: { geo: THREE.BufferGeometry; bone: THREE.Object3D; ring: boolean }[] = [];
  chain.push({ geo: turretGeo, bone: turret, ring: false });
  chain.push({ geo: new THREE.TorusGeometry(1.86, 0.075, 8, 64).rotateX(Math.PI / 2).translate(0, 1.0, 0), bone: turret, ring: true });

  const link1 = new THREE.Group();
  link1.position.set(0, SHOULDER_Y, 0);
  turret.add(link1);
  chain.push({
    geo: merge([
      paint(taperBeam(L1, 0.95, 0.95, 0.72, 0.78), COL.shell),
      paint(axle(0.62, 1.2, 24, 0, 0, 0), COL.chassis),
      paint(axle(0.5, 1.0, 24, L1, 0, 0), COL.chassis),
      paint(box(L1 * 0.7, 0.08, 0.98, L1 * 0.48, 0.3, 0), COL.shellShadow),
    ]),
    bone: link1,
    ring: false,
  });
  chain.push({ geo: new THREE.TorusGeometry(0.78, 0.07, 8, 48), bone: link1, ring: true });

  const link2 = new THREE.Group();
  link2.position.set(L1, 0, 0);
  link1.add(link2);
  chain.push({
    geo: merge([
      paint(taperBeam(L2, 0.7, 0.66, 0.52, 0.52), COL.shell),
      paint(axle(0.42, 0.85, 20, L2, 0, 0), COL.chassis),
      paint(box(L2 * 0.6, 0.06, 0.68, L2 * 0.45, 0.22, 0), COL.shellShadow),
    ]),
    bone: link2,
    ring: false,
  });
  chain.push({ geo: new THREE.TorusGeometry(0.66, 0.065, 8, 44).translate(0, 0, 0.52), bone: link2, ring: true });

  const link3 = new THREE.Group();
  link3.position.set(L2, 0, 0);
  link2.add(link3);
  chain.push({
    geo: merge([
      paint(new THREE.CylinderGeometry(0.3, 0.36, L3 - 0.2, 20).rotateZ(Math.PI / 2).translate((L3 - 0.2) / 2 + 0.1, 0, 0), COL.shell),
      paint(new THREE.CylinderGeometry(0.88, 0.8, 0.25, 32).rotateZ(Math.PI / 2).translate(L3, 0, 0), COL.chassis),
      paint(new THREE.CylinderGeometry(0.5, 0.88, 0.2, 32).rotateZ(Math.PI / 2).translate(L3 - 0.2, 0, 0), COL.carbon),
    ]),
    bone: link3,
    ring: false,
  });
  chain.push({ geo: new THREE.TorusGeometry(0.52, 0.06, 8, 40).translate(0, 0, 0.44), bone: link3, ring: true });

  // fingers: 3 × (proximal, distal), each phalanx its own bone in the palm frame (tool axis = +x = down)
  const palm = new THREE.Group();
  palm.position.set(L3, 0, 0);
  link3.add(palm);
  const phalanxGeo = merge([
    paint(new THREE.BoxGeometry(1, 0.28, 0.36).translate(0.5, 0, 0), COL.shell),
    paint(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 14).rotateX(Math.PI / 2), COL.chassis),
    paint(new THREE.BoxGeometry(0.75, 0.06, 0.3).translate(0.5, -0.15, 0), COL.carbon),
  ]);
  const phalanges: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Object3D();
    b.matrixAutoUpdate = false;
    palm.add(b);
    phalanges.push(b);
    chain.push({ geo: phalanxGeo.clone(), bone: b, ring: false });
  }
  phalanxGeo.dispose();
  const fingers = {
    setMatrixAt(i: number, m: THREE.Matrix4): void {
      phalanges[i].matrix.copy(m);
      phalanges[i].matrixWorldNeedsUpdate = true;
    },
    instanceMatrix: { needsUpdate: false },
  };

  // the giant egg: a bone the chain carries when it holds the egg (painted, part of the same mesh)
  const egg = new THREE.Object3D();
  g.add(egg);
  chain.push({ geo: paint(eggGeometry(EGG_RX, EGG_RY, 40, 26), 0xf2f0ec), bone: egg, ring: false });

  // static colliders: base drum + a guard ring round the cradle (the egg comes down there)
  ctx.physics.addStaticCylinder({ radius: 2.05, height: SHOULDER_Y, position: [ARM_BASE.x, SHOULDER_Y / 2, ARM_BASE.z] });
  ctx.physics.addStaticCylinder({ radius: 1.4, height: 1.3, position: [CRADLE.x, 0.65, CRADLE.z] });

  // ── state ──────────────────────────────────────────────────────────────────
  let clock = 2; // start with the egg held high (acceptance shot)
  let squeezeTarget = 0,
    squeeze = 0,
    shiverT = 0,
    cheerT = 0;
  const eggWorld = new THREE.Vector3();
  const pose: Pose = { psi: P_LIFT.psi, r: P_LIFT.r, h: P_LIFT.h };
  const m4 = new THREE.Matrix4(),
    vA = new THREE.Vector3(),
    vU = new THREE.Vector3(),
    vW = new THREE.Vector3(),
    vD = new THREE.Vector3(),
    vE = new THREE.Vector3(),
    vP = new THREE.Vector3();

  const blend = (a: Pose, b: Pose, t: number): void => {
    const s = smoother(t);
    let dpsi = b.psi - a.psi;
    dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
    pose.psi = a.psi + dpsi * s;
    pose.r = lerp(a.r, b.r, s);
    pose.h = lerp(a.h, b.h, s);
  };

  /** timeline → pose, finger opening (0 closed … 1 open), egg held? */
  const sample = (t: number): { open: number; held: boolean } => {
    if (t < 18) {
      const k = Math.sin((t / 18) * Math.PI); // fade the sway in/out at the segment ends
      pose.psi = P_LIFT.psi + 0.17 * Math.sin((t / 18) * Math.PI * 2) * k;
      pose.r = P_LIFT.r + 0.25 * Math.sin((t / 9) * Math.PI) * k;
      pose.h = P_LIFT.h + 0.2 * Math.sin((t / 6) * Math.PI) * k;
      return { open: 0, held: true };
    }
    if (t < 25) return blend(P_LIFT, P_ABOVE, (t - 18) / 7), { open: 0, held: true };
    if (t < 27.5) return blend(P_ABOVE, P_SEAT, (t - 25) / 2.5), { open: 0, held: true };
    if (t < 29) return blend(P_SEAT, P_SEAT, 1), { open: smoother((t - 27.5) / 1.5), held: false };
    if (t < 33) {
      // back off 0.7 m and return (shows the release)
      const u = t < 31 ? (t - 29) / 2 : 1 - (t - 31) / 2;
      pose.psi = P_SEAT.psi;
      pose.r = P_SEAT.r;
      pose.h = P_SEAT.h + 0.7 * smoother(u);
      return { open: 1, held: false };
    }
    if (t < 34.5) return blend(P_SEAT, P_SEAT, 1), { open: 1 - smoother((t - 33) / 1.5), held: false };
    if (t < 37) return blend(P_SEAT, P_ABOVE, (t - 34.5) / 2.5), { open: 0, held: true };
    return blend(P_ABOVE, P_LIFT, (t - 37) / 3), { open: 0, held: true };
  };

  const _dScaled = new THREE.Vector3();
  let reachR = 0,
    reachH = 0;
  /** pose → joints, fingers and egg (no allocations: runs every frame, also in updateFar) */
  const applyPose = (open: number, held: boolean, time: number): void => {
    turret.rotation.y = -pose.psi;
    // 2-link IK (elbow up) from the shoulder S = (0, SHOULDER_Y) to the wrist W = (r, h); tool points down
    const wx = pose.r,
      wy = pose.h - SHOULDER_Y;
    const d = clamp(Math.hypot(wx, wy), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.05);
    const a1 = Math.atan2(wy, wx) + Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const ex = L1 * Math.cos(a1),
      ey = L1 * Math.sin(a1);
    const a2 = Math.atan2(wy - ey, wx - ex);
    // the wrist the joints actually reach (equals the request unless the reach was clamped)
    reachR = ex + L2 * Math.cos(a2);
    reachH = SHOULDER_Y + ey + L2 * Math.sin(a2);
    link1.rotation.z = a1;
    link2.rotation.z = a2 - a1;
    link3.rotation.z = -Math.PI / 2 - a2;
    const shiver = shiverT > 0 ? Math.sin(time * 70) * 0.03 * Math.min(1, shiverT / 0.3) : 0;
    const sq = THREE.MathUtils.degToRad(6) * squeeze;
    const b1 = THREE.MathUtils.degToRad(37 + 20 * open) - sq + shiver;
    const b2 = THREE.MathUtils.degToRad(9 + 12 * open) - sq * 0.6 + shiver;
    vA.set(1, 0, 0);
    for (let i = 0; i < 3; i++) {
      const phi = (i / 3) * Math.PI * 2 + 0.5;
      vU.set(0, Math.cos(phi), Math.sin(phi));
      vW.crossVectors(vA, vU);
      vP.copy(vU).multiplyScalar(0.7).addScaledVector(vA, 0.12);
      vD.copy(vA).multiplyScalar(Math.cos(b1)).addScaledVector(vU, Math.sin(b1));
      vE.copy(vA).multiplyScalar(-Math.sin(b1)).addScaledVector(vU, Math.cos(b1));
      m4.makeBasis(_dScaled.copy(vD).multiplyScalar(1.07), vE, vW).setPosition(vP);
      fingers.setMatrixAt(i * 2, m4);
      vP.addScaledVector(vD, 1.07);
      vD.copy(vA).multiplyScalar(Math.cos(b2)).addScaledVector(vU, Math.sin(b2));
      vE.copy(vA).multiplyScalar(-Math.sin(b2)).addScaledVector(vU, Math.cos(b2));
      m4.makeBasis(_dScaled.copy(vD), vE, vW).setPosition(vP);
      fingers.setMatrixAt(i * 2 + 1, m4);
    }
    fingers.instanceMatrix.needsUpdate = true;
    if (held) {
      egg.position.set(ARM_BASE.x + Math.cos(pose.psi) * reachR, reachH - W_TO_EGG, ARM_BASE.z + Math.sin(pose.psi) * reachR);
    } else egg.position.set(CRADLE.x, SEAT_Y, CRADLE.z);
    ctx.toWorld(egg.position, eggWorld);
  };

  const s0 = sample(clock);
  applyPose(s0.open, s0.held, 0);

  // ── the one skinned mesh (bind pose = the pose above) ──────────────────────
  g.updateWorldMatrix(true, true);
  const skinned = new THREE.SkinnedMesh(skinGeometry(chain, g), [vc, ringMat]);
  skinned.name = 'greifwerkstatt:arm';
  skinned.userData.noMerge = true;
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  // the chain sweeps 20 m round the base: one generous bound instead of per-frame bounds
  skinned.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(ARM_BASE.x, 7, ARM_BASE.z), 21);
  g.add(skinned);
  // the bones move: mergeStatic (index.ts) leaves them and the mesh alone and never freezes their matrices
  turret.userData.noMerge = true;
  egg.userData.noMerge = true;
  skinned.updateWorldMatrix(true, false);
  const bones = [...new Set(chain.map((c) => c.bone))];
  skinned.bind(new THREE.Skeleton(bones as THREE.Bone[]), skinned.matrixWorld);
  ctx.onDispose(() => {
    skinned.geometry.dispose();
    skinned.skeleton.dispose();
  });

  // ── sound: a heavy, slow servo while the arm moves ─────────────────────────
  const hum = ctx.audio.loop('servo', { at: link2, volume: 0 });
  let lastPsi = pose.psi,
    lastH = pose.h;

  return {
    eggWorldPosition: eggWorld,
    update(dt, elapsed) {
      clock = (clock + dt) % PERIOD;
      const s = sample(clock);
      if (cheerT > 0) {
        // salute: raise and draw in the egg, with a little wiggle, over 2.4 s (only while holding it)
        cheerT = Math.max(0, cheerT - dt);
        const k = Math.sin(((2.4 - cheerT) / 2.4) * Math.PI);
        if (s.held) {
          pose.h += 0.7 * k;
          pose.r -= 0.9 * k;
          pose.psi += 0.08 * Math.sin(((2.4 - cheerT) / 2.4) * Math.PI * 4) * k;
        }
      }
      squeeze += (squeezeTarget - squeeze) * (1 - Math.exp(-dt * 10));
      if (shiverT > 0) shiverT = Math.max(0, shiverT - dt);
      applyPose(s.open, s.held, elapsed);
      if (dt > 0) {
        const speed = Math.abs(pose.psi - lastPsi) * pose.r + Math.abs(pose.h - lastH);
        hum.setVolume(clamp((speed / dt) * 0.35, 0, 0.9), 0.2);
        hum.setPitch(0.45 + clamp((speed / dt) * 0.08, 0, 0.3));
      }
      lastPsi = pose.psi;
      lastH = pose.h;
    },
    celebrate() {
      cheerT = 2.4;
    },
    setClock(t) {
      clock = ((t % PERIOD) + PERIOD) % PERIOD;
    },
    setSqueeze(forceN) {
      squeezeTarget = clamp(forceN / 30, 0, 1.2);
    },
    shiver() {
      shiverT = 0.9;
    },
    buildFar(group) {
      // one merged silhouette in the lift pose with a low-poly egg, vertex-coloured (1 draw call, < 2k tris)
      clock = 2;
      const s = sample(clock);
      applyPose(s.open, s.held, 0);
      ctx.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(ctx.root.matrixWorld).invert();
      const parts: THREE.BufferGeometry[] = [];
      const add = (geo: THREE.BufferGeometry, obj: THREE.Object3D, hex = 0xd6d3d1): void => {
        const m = new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld);
        parts.push(paint(geo.applyMatrix4(m), hex));
      };
      add(new THREE.CylinderGeometry(1.9, 2.05, 1.0, 12).translate(0, 0.5, 0), root);
      add(new THREE.BoxGeometry(1.5, SHOULDER_Y - 0.6, 1.5).translate(0, (SHOULDER_Y - 0.6) / 2 + 1, 0), turret);
      add(new THREE.BoxGeometry(L1, 0.9, 0.9).translate(L1 / 2, 0, 0), link1);
      add(new THREE.BoxGeometry(L2, 0.65, 0.65).translate(L2 / 2, 0, 0), link2);
      add(new THREE.BoxGeometry(L3, 0.6, 0.6).translate(L3 / 2, 0, 0), link3);
      add(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 10).rotateZ(Math.PI / 2).translate(L3, 0, 0), link3);
      add(eggGeometry(EGG_RX, EGG_RY, 16, 10), egg, 0xf2f0ec);
      const sil = new THREE.Mesh(merge(parts), M.standard({ vertexColors: true, roughness: 0.84, metalness: 0.14 }));
      sil.name = 'greifwerkstatt:arm-far';
      group.add(sil);
    },
  };
}

/**
 * One BufferGeometry for the rigid skin: every part transformed from its bone's frame into the mesh's
 * frame at the bind pose, skin index = its bone, weight 1; group 0 = painted parts, group 1 = rings.
 */
function skinGeometry(chain: { geo: THREE.BufferGeometry; bone: THREE.Object3D; ring: boolean }[], parent: THREE.Object3D): THREE.BufferGeometry {
  const bones = [...new Set(chain.map((c) => c.bone))];
  const toMesh = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const ordered = [...chain.filter((c) => !c.ring), ...chain.filter((c) => c.ring)];
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [],
    si: number[] = [],
    sw: number[] = [];
  let ringStart = 0;
  for (const c of ordered) {
    if (c.ring && !ringStart) ringStart = pos.length / 3;
    const geo = c.geo.index ? c.geo.toNonIndexed() : c.geo.clone();
    m.multiplyMatrices(toMesh, c.bone.matrixWorld);
    geo.applyMatrix4(m);
    const p = geo.getAttribute('position'),
      n = geo.getAttribute('normal'),
      k = geo.getAttribute('color');
    const b = bones.indexOf(c.bone);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (k) col.push(k.getX(i), k.getY(i), k.getZ(i));
      else col.push(1, 1, 1);
      si.push(b, 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
    geo.dispose();
    c.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const total = pos.length / 3;
  out.addGroup(0, ringStart || total, 0);
  if (ringStart) out.addGroup(ringStart, total - ringStart, 1);
  return out;
}
