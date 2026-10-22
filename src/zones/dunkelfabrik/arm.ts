/**
 * Procedural, unbranded 6-axis industrial arm on a floor track (7th axis) — "Kiste greifen" and
 * "Palettieren" at Station 7. Stone shell, dark motor housings, orange rings ONLY on the six
 * rotating joints ("Orange heißt: das dreht sich").
 *
 * Kinematics (zone-local, metres): J1 yaw about +y; J2/J3/J5 pitch about the link's z axis;
 * J4/J6 roll about the link axis. Decoupled IK for a tool pointing straight down:
 *   wrist centre = TCP + (0, D6 + TOOL, 0)
 *   θ1 = atan2(−dz, dx)                         (three.js rotation.y convention)
 *   2-link planar IK for J2/J3 to the wrist centre (elbow up)
 *   θ5 = −π/2 − (θ2 + θ3)                        keeps the tool vertical
 *   θ6 = θ1 − crate yaw                          aligns the gripper with the crate
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { box, cyl, merge, paint, torus } from './geo';

export const ARM = {
  trackZ: -9.8,
  trackX0: 3.2,
  trackX1: 8.6,
  carriageH: 0.22,
  baseH: 0.48, // J1 axis top (above the carriage)
  shoulderH: 0.95, // J2 height above the floor
  a1: 0.22, // shoulder offset from the J1 axis
  L2: 1.25,
  L3: 1.2,
  D6: 0.2,
  TOOL: 0.24, // flange → suction face
} as const;

const SHELL = 0xe7e5e4;
const SHADOW = 0xa8a29e;
const DARK = 0x292929;

export interface ArmRig {
  readonly root: THREE.Group;
  /** gripper attach point (child objects follow the TCP); +y up when the tool points down */
  readonly tcp: THREE.Object3D;
  readonly q: Float64Array;
  trackX: number;
  /** solve for a TCP target (zone-local) with the tool pointing down; returns false if out of reach */
  solve(target: THREE.Vector3, yaw: number, out?: Float64Array): boolean;
  apply(q: ArrayLike<number>): void;
  /** call after apply/track moves to refresh the instanced joint rings */
  syncRings(): void;
  setRingGlow(on: boolean): void;
}

export function buildArm(ctx: ZoneContext, parent: THREE.Object3D, homeX = 4): ArmRig {
  const M = ctx.materials;
  const bodyMat = M.standard({ vertexColors: true, roughness: 0.5, metalness: 0.12 });
  const root = new THREE.Group();
  root.name = 'df:arm';
  root.position.set(homeX, 0, ARM.trackZ);
  parent.add(root);

  // carriage + base (moves along the track)
  const base = new THREE.Mesh(
    merge([
      paint(box(0.9, ARM.carriageH, 0.9, 0, ARM.carriageH / 2, 0), DARK),
      paint(cyl(0.3, 0.36, ARM.baseH - ARM.carriageH, 24, 0, (ARM.carriageH + ARM.baseH) / 2, 0), SHADOW),
    ]),
    bodyMat,
  );
  base.castShadow = false;
  root.add(base);

  const j1 = new THREE.Group();
  j1.position.y = ARM.baseH;
  root.add(j1);
  const turret = new THREE.Mesh(
    merge([
      paint(cyl(0.3, 0.3, 0.22, 24, 0, 0.11, 0), SHELL),
      paint(box(0.42, 0.46, 0.5, 0.12, 0.42, 0), SHELL),
      paint(cyl(0.2, 0.2, 0.62, 20, ARM.a1, ARM.shoulderH - ARM.baseH, 0, Math.PI / 2, 0, 0), DARK),
    ]),
    bodyMat,
  );
  j1.add(turret);

  const j2 = new THREE.Group();
  j2.position.set(ARM.a1, ARM.shoulderH - ARM.baseH, 0);
  j1.add(j2);
  const upper = new THREE.Mesh(
    merge([
      paint(box(ARM.L2 - 0.1, 0.24, 0.26, ARM.L2 / 2, 0, 0.22), SHELL),
      paint(box(0.2, 0.2, 0.2, 0.1, 0, 0.22), SHADOW),
      paint(cyl(0.16, 0.16, 0.5, 18, ARM.L2, 0, 0.12, Math.PI / 2, 0, 0), DARK),
    ]),
    bodyMat,
  );
  j2.add(upper);

  const j3 = new THREE.Group();
  j3.position.set(ARM.L2, 0, 0);
  j2.add(j3);
  const fore = new THREE.Mesh(
    merge([
      paint(box(0.42, 0.3, 0.3, -0.06, 0.05, 0), SHELL),
      paint(cyl(0.11, 0.13, ARM.L3 - 0.3, 18, 0.2 + (ARM.L3 - 0.3) / 2, 0, 0, 0, 0, Math.PI / 2), SHELL),
    ]),
    bodyMat,
  );
  j3.add(fore);

  const j4 = new THREE.Group();
  j4.position.set(0.2, 0, 0);
  j3.add(j4);
  const j5 = new THREE.Group();
  j5.position.set(ARM.L3 - 0.2, 0, 0);
  j4.add(j5);
  const wrist = new THREE.Mesh(merge([paint(cyl(0.1, 0.1, 0.22, 16, 0, 0, 0, Math.PI / 2, 0, 0), DARK), paint(box(0.14, 0.12, 0.12, 0.1, 0, 0), SHADOW)]), bodyMat);
  j5.add(wrist);
  const j6 = new THREE.Group();
  j6.position.set(ARM.D6, 0, 0);
  j5.add(j6);
  // vacuum gripper plate (0.55 × 0.35) along the tool axis (+x of j6)
  const tool = new THREE.Mesh(
    merge([paint(cyl(0.07, 0.07, 0.1, 14, 0.05, 0, 0, 0, 0, Math.PI / 2), DARK), paint(box(0.06, 0.34, 0.52, ARM.TOOL - 0.03, 0, 0), DARK), paint(box(0.02, 0.3, 0.48, ARM.TOOL, 0, 0), SHADOW)]),
    bodyMat,
  );
  j6.add(tool);
  const tcp = new THREE.Object3D();
  tcp.position.set(ARM.TOOL, 0, 0);
  // orient so the TCP's +y points back up the tool (crates hang below: child at y = −half height)
  tcp.rotation.z = Math.PI / 2;
  j6.add(tcp);

  // orange joint rings: one InstancedMesh (6 rings), matrices synced from the joint frames
  const ringGeo = torus(0.2, 0.035, 8, 28);
  const ringMat = M.orangePaint;
  const ringLit = M.accentOrange;
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, 6);
  rings.name = 'df:arm-rings';
  rings.frustumCulled = false;
  parent.add(rings);
  // ring placement per joint in that joint's frame: [frame, offset, axis rotation, scale]
  const ringDefs: { frame: THREE.Object3D; pos: THREE.Vector3; rot: THREE.Euler; s: number }[] = [
    { frame: j1, pos: new THREE.Vector3(0, 0.02, 0), rot: new THREE.Euler(Math.PI / 2, 0, 0), s: 1.55 },
    { frame: j2, pos: new THREE.Vector3(0, 0, -0.3), rot: new THREE.Euler(0, 0, 0), s: 1.0 },
    { frame: j3, pos: new THREE.Vector3(0, 0, -0.14), rot: new THREE.Euler(0, 0, 0), s: 0.85 },
    { frame: j4, pos: new THREE.Vector3(0.02, 0, 0), rot: new THREE.Euler(0, Math.PI / 2, 0), s: 0.68 },
    { frame: j5, pos: new THREE.Vector3(0, 0, -0.12), rot: new THREE.Euler(0, 0, 0), s: 0.55 },
    { frame: j6, pos: new THREE.Vector3(0.03, 0, 0), rot: new THREE.Euler(0, Math.PI / 2, 0), s: 0.42 },
  ];
  const _m = new THREE.Matrix4();
  const _l = new THREE.Matrix4();
  const _inv = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();

  const q = new Float64Array(6);
  const apply = (qq: ArrayLike<number>): void => {
    for (let i = 0; i < 6; i++) q[i] = qq[i];
    j1.rotation.y = q[0];
    j2.rotation.z = q[1];
    j3.rotation.z = q[2];
    j4.rotation.x = q[3];
    j5.rotation.z = q[4];
    j6.rotation.x = q[5];
  };

  const rig: ArmRig = {
    root,
    tcp,
    q,
    get trackX() {
      return root.position.x;
    },
    set trackX(x: number) {
      root.position.x = Math.min(ARM.trackX1, Math.max(ARM.trackX0, x));
    },
    solve(target, yaw, out = q) {
      // wrist centre straight above the TCP
      const wx = target.x - root.position.x;
      const wz = target.z - root.position.z;
      const wy = target.y + ARM.D6 + ARM.TOOL;
      const t1 = Math.atan2(-wz, wx);
      const r = Math.hypot(wx, wz) - ARM.a1;
      const s = wy - ARM.shoulderH;
      const D = (r * r + s * s - ARM.L2 * ARM.L2 - ARM.L3 * ARM.L3) / (2 * ARM.L2 * ARM.L3);
      if (D > 1 || D < -1) return false;
      const t3 = Math.atan2(-Math.sqrt(1 - D * D), D); // elbow up
      const t2 = Math.atan2(s, r) - Math.atan2(ARM.L3 * Math.sin(t3), ARM.L2 + ARM.L3 * Math.cos(t3));
      const t5 = -Math.PI / 2 - (t2 + t3);
      out[0] = t1;
      out[1] = t2;
      out[2] = t3;
      out[3] = 0;
      out[4] = t5;
      out[5] = t1 - yaw; // roll about the down-pointing tool axis = −yaw about +y
      return true;
    },
    apply,
    syncRings() {
      root.updateMatrixWorld(true);
      _inv.copy(parent.matrixWorld).invert();
      for (let i = 0; i < 6; i++) {
        const d = ringDefs[i];
        _l.compose(d.pos, _q.setFromEuler(d.rot), _s.set(d.s, d.s, d.s));
        _m.multiplyMatrices(_inv, d.frame.matrixWorld).multiply(_l);
        rings.setMatrixAt(i, _m);
      }
      rings.instanceMatrix.needsUpdate = true;
    },
    setRingGlow(on) {
      rings.material = on ? ringLit : ringMat;
    },
  };
  // park pose: folded, tool down above the carriage
  const park = new THREE.Vector3(homeX + 0.9, 1.6, ARM.trackZ + 0.2);
  if (rig.solve(park, 0)) apply(q);
  rig.syncRings();
  return rig;
}
