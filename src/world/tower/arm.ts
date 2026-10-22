import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARM } from './constants';
import type { TowerKit } from './kit';

/**
 * The drawing arm (ART-V2 §3.4, FUN-PLAN §6.3): a 6-axis arm hanging under the halo at
 * ARM.base. Unbranded shapes (white shell links, carbon joints, orange rings on the rotating
 * joints). Kinematics after the founder's logo-film experiment (its robot.js):
 * analytic elbow IK for A1–A3 followed by a spring-damper (they lag, lean into moves and settle
 * with a little overshoot; faster work → stiffer servos), wrist A4–A6 solved exactly every frame
 * from the actual arm pose so the laser always hits the curve (damped A4 near the singularity).
 *
 * Three draw calls: one SkinnedMesh per material (shell, carbon, orange), rigid skinning — every
 * vertex belongs to one joint bone. No shadows (thin parts).
 *
 * Frame: the arm is built upright in its own frame and mounted upside down (rotation z = π),
 * so local +y = world down, local +x = world −x, local +z = world +z (toward the arrival).
 */
const K = { base: 0.42, a1: 0.22, h1: 0.5, L2: 2.6, a3: 0.0, d4: 2.4, d6: 0.42, tool: 0.62 };
/** the arm is modelled with links 2.6 / 2.4 / 1.0 m and shown at 1.5× so it reads from the arrival (85 m) */
export const ARM_SCALE = 1.5;
const L3 = Math.hypot(K.d4, K.a3);
const PHI = Math.atan2(K.a3, K.d4);
const TAU = Math.PI * 2;

export interface Arm {
  readonly group: THREE.Group;
  /** world position of the laser emitter / sensor eye (valid after update) */
  readonly emitter: THREE.Vector3;
  readonly eye: THREE.Vector3;
  /** unit direction of the tool axis (world) */
  readonly toolDir: THREE.Vector3;
  /**
   * aim: world point the tool points at (null = keep); rest 0 = working pose, 1 = parked;
   * speed ≥ 1 stiffens the servos; hover: world point the tool hovers at (else derived from aim)
   */
  update(dt: number, aim: THREE.Vector3 | null, rest: number, speed?: number, hover?: THREE.Vector3 | null): void;
  /** largest joint velocity (rad/s) — "still moving" */
  readonly motion: number;
  /** snap to the parked pose (reload, reset) */
  park(): void;
}

export function buildArm(kit: TowerKit): Arm {
  const group = new THREE.Group();
  group.name = 'tower:arm';
  group.position.set(...ARM.base);
  group.rotation.z = Math.PI;
  group.scale.setScalar(ARM_SCALE);

  // ── bones (bind pose: all joint angles 0) ─────────────────────────────────
  const b0 = new THREE.Bone();
  const b1 = new THREE.Bone(); // A1 carousel (rot y)
  b1.position.set(0, K.base, 0);
  const b2 = new THREE.Bone(); // A2 shoulder (rot z)
  b2.position.set(K.a1, K.h1, 0);
  const b3 = new THREE.Bone(); // A3 elbow (rot z)
  b3.position.set(0, K.L2, 0);
  const b4 = new THREE.Bone(); // A4 forearm roll (rot x)
  b4.position.set(0, K.a3, 0);
  const b5 = new THREE.Bone(); // A5 wrist (rot z)
  b5.position.set(K.d4, 0, 0);
  const b6 = new THREE.Bone(); // A6 flange (rot x)
  b6.position.set(K.d6, 0, 0);
  b0.add(b1);
  b1.add(b2);
  b2.add(b3);
  b3.add(b4);
  b4.add(b5);
  b5.add(b6);
  const bones = [b0, b1, b2, b3, b4, b5, b6];
  group.add(b0);
  // bind-pose origin of each bone in the group frame
  const origin = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, K.base, 0),
    new THREE.Vector3(K.a1, K.base + K.h1, 0),
    new THREE.Vector3(K.a1, K.base + K.h1 + K.L2, 0),
    new THREE.Vector3(K.a1, K.base + K.h1 + K.L2 + K.a3, 0),
    new THREE.Vector3(K.a1 + K.d4, K.base + K.h1 + K.L2 + K.a3, 0),
    new THREE.Vector3(K.a1 + K.d4 + K.d6, K.base + K.h1 + K.L2 + K.a3, 0),
  ];

  // ── parts per material (authored in the bone's local frame) ───────────────
  const parts: Record<'shell' | 'carbon' | 'orange', THREE.BufferGeometry[]> = { shell: [], carbon: [], orange: [] };
  const add = (mat: 'shell' | 'carbon' | 'orange', bone: number, g: THREE.BufferGeometry): void => {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const ng = g.index ? g.toNonIndexed() : g;
    ng.translate(origin[bone].x, origin[bone].y, origin[bone].z);
    const n = ng.getAttribute('position').count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = bone;
      sw[i * 4] = 1;
    }
    ng.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    ng.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    parts[mat].push(ng);
  };
  const cylY = (r0: number, r1: number, y0: number, y1: number, seg = 24): THREE.BufferGeometry => new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0);
  const cylZ = (r: number, z0: number, z1: number, seg = 24): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, z1 - z0, seg).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
  const cylX = (r0: number, r1: number, x0: number, x1: number, seg = 20): THREE.BufferGeometry => new THREE.CylinderGeometry(r1, r0, x1 - x0, seg).rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, 0, 0);
  const lathe = (pts: [number, number][], seg = 24): THREE.BufferGeometry => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const ring = (r: number, tube: number): THREE.BufferGeometry => new THREE.TorusGeometry(r, tube, 6, 28);

  // b0: mount (flange plate under the halo)
  add('carbon', 0, cylY(0.62, 0.62, -0.02, 0.1, 32));
  add('shell', 0, lathe([[0.001, 0.1], [0.55, 0.1], [0.5, 0.26], [0.001, 0.26]], 32));
  // b1: carousel — rounded shell drum + shoulder side housing
  add('orange', 1, ring(0.5, 0.045).rotateX(Math.PI / 2).translate(0, -0.12, 0));
  add('shell', 1, lathe([[0.001, -0.14], [0.47, -0.14], [0.5, -0.02], [0.46, 0.34], [0.38, 0.46], [0.001, 0.46]], 32));
  add('carbon', 1, cylZ(0.36, -0.42, 0.42, 28).translate(K.a1, K.h1, 0));
  // b2: shoulder joint + upper arm (tapered, rounded ends)
  add('orange', 2, ring(0.37, 0.045).translate(0, 0, 0.44));
  add('carbon', 2, cylZ(0.3, 0.42, 0.5, 24));
  add('shell', 2, lathe([[0.001, -0.3], [0.2, -0.27], [0.3, -0.1], [0.3, 0.2], [0.24, K.L2 - 0.4], [0.22, K.L2 - 0.12], [0.001, K.L2 + 0.05]], 24));
  // b3: elbow joint housing + small motor behind
  add('carbon', 3, cylZ(0.28, -0.32, 0.32, 24));
  add('orange', 3, ring(0.29, 0.04).translate(0, 0, 0.34));
  add('carbon', 3, cylX(0.16, 0.16, -0.5, -0.12, 16));
  // b4: forearm (rolls about its axis)
  add('shell', 4, lathe([[0.001, 0.1], [0.2, 0.16], [0.22, 0.45], [0.17, K.d4 - 0.32], [0.14, K.d4 - 0.12], [0.001, K.d4 - 0.1]], 22).rotateZ(-Math.PI / 2));
  add('orange', 4, ring(0.215, 0.035).rotateY(Math.PI / 2).translate(0.42, 0, 0));
  // b5: wrist
  add('carbon', 5, cylZ(0.16, -0.19, 0.19, 20));
  add('shell', 5, cylX(0.12, 0.11, 0.08, K.d6 - 0.03, 18));
  // b6: flange + laser head with a sensor pod (unbranded)
  add('orange', 6, ring(0.12, 0.03).rotateY(Math.PI / 2).translate(0.02, 0, 0));
  add('carbon', 6, cylX(0.12, 0.12, -0.02, 0.06, 18));
  add('shell', 6, new RoundedBoxGeometry(0.46, 0.24, 0.26, 2, 0.06).translate(0.3, 0, 0));
  add('carbon', 6, cylX(0.09, 0.06, 0.52, K.tool, 16));
  add('carbon', 6, new RoundedBoxGeometry(0.18, 0.1, 0.16, 2, 0.035).translate(0.36, 0.16, 0));

  const mats = { shell: kit.shell, carbon: kit.carbon, orange: kit.orangePaint };
  const meshes: THREE.SkinnedMesh[] = [];
  for (const key of ['shell', 'carbon', 'orange'] as const) {
    const g = mergeGeometries(parts[key], false)!;
    for (const p of parts[key]) p.dispose();
    const m = new THREE.SkinnedMesh(g, mats[key]);
    m.name = `tower:arm-${key}`;
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
    meshes.push(m);
  }
  // bind after every matrix is current: bone inverses and bind matrices share the group frame
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const m of meshes) {
    m.bind(skeleton);
    // fixed bounds around the whole working envelope (skinned bounds would go stale)
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 1), 6.5);
  }

  // emitter / eye markers on the flange
  const emitterObj = new THREE.Object3D();
  emitterObj.position.set(K.tool + 0.02, 0, 0);
  b6.add(emitterObj);
  const eyeObj = new THREE.Object3D();
  eyeObj.position.set(0.46, 0.16, 0);
  b6.add(eyeObj);

  // ── kinematics ────────────────────────────────────────────────────────────
  const inv = new THREE.Matrix4();
  const lp = new THREE.Vector3();
  /** analytic IK for A1–A3 (elbow on the local +v side = world below) placing the wrist centre at W (group frame) */
  const solveBody = (W: THREE.Vector3, out: number[]): void => {
    const q1 = Math.atan2(-W.z, W.x);
    const u = Math.hypot(W.x, W.z) - K.a1;
    const v = W.y - (K.base + K.h1);
    const D = THREE.MathUtils.clamp(Math.hypot(u, v), Math.abs(K.L2 - L3) + 0.1, K.L2 + L3 - 0.02);
    const t2 = Math.atan2(v, u) + Math.acos(THREE.MathUtils.clamp((K.L2 * K.L2 + D * D - L3 * L3) / (2 * K.L2 * D), -1, 1));
    const psi = Math.atan2(v - K.L2 * Math.sin(t2), u - K.L2 * Math.cos(t2));
    out[0] = q1;
    out[1] = t2 - Math.PI / 2;
    let q3 = psi - PHI - t2 + Math.PI / 2;
    // one branch for A3: the fully folded pose (relative 180°, q3 = 1.5π) is never crossed, so the
    // arm always unfolds through straight from the parked fold (no 360° flips, no self-collision)
    while (q3 >= 1.5 * Math.PI) q3 -= TAU;
    while (q3 < -0.5 * Math.PI) q3 += TAU;
    out[2] = q3;
  };
  // parked: arm plane facing the arrival (world +z), upper arm forward along the halo, forearm folded back down
  const REST = [-Math.PI / 2, -Math.PI / 2, Math.PI - 0.1 + Math.PI / 2];
  const q = [REST[0], REST[1], REST[2]];
  const qd = [0, 0, 0];
  const target = [0, 0, 0];
  const wrist = [0, -Math.PI / 2, 0];
  const setBody = (): void => {
    b1.rotation.y = q[0];
    b2.rotation.z = q[1];
    b3.rotation.z = q[2];
  };
  const _w = new THREE.Vector3(),
    _d = new THREE.Vector3(),
    _q = new THREE.Quaternion(),
    _t = new THREE.Vector3(),
    _wc = new THREE.Vector3();
  /** wrist A4–A6 so the tool axis points at `aim` (world) */
  const solveWrist = (aim: THREE.Vector3): void => {
    b3.updateWorldMatrix(true, false);
    _w.set(K.d4, K.a3, 0).applyMatrix4(b3.matrixWorld);
    _d.subVectors(aim, _w).normalize();
    _d.applyQuaternion(b3.getWorldQuaternion(_q).invert());
    const eps = 0.2;
    const q4 = Math.atan((_d.z * _d.y) / (_d.y * _d.y + eps * eps));
    wrist[0] = q4;
    wrist[1] = Math.atan2(_d.y * Math.cos(q4) + _d.z * Math.sin(q4), _d.x);
    wrist[2] = -q4;
  };
  const restWrist = (): void => {
    // tool straight down (world) = local +y: absolute angle π/2 in the arm plane
    const psiAbs = q[1] + q[2]; // forearm angle in the arm plane (q2 + q3 = psi)
    wrist[0] = 0;
    wrist[1] = Math.PI / 2 - psiAbs;
    wrist[2] = 0;
  };
  const emitter = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const toolDir = new THREE.Vector3(0, -1, 0);
  let motion = 0;
  const lastAim = new THREE.Vector3(0, 30, 13);

  const api: Arm = {
    group,
    emitter,
    eye,
    toolDir,
    get motion() {
      return motion;
    },
    park() {
      for (let j = 0; j < 3; j++) {
        q[j] = REST[j];
        qd[j] = 0;
      }
      setBody();
      restWrist();
      b4.rotation.x = wrist[0];
      b5.rotation.z = wrist[1];
      b6.rotation.x = wrist[2];
      group.updateMatrixWorld(true);
      emitterObj.getWorldPosition(emitter);
      eyeObj.getWorldPosition(eye);
      motion = 0;
    },
    update(dt, aim, rest, speed = 1, hover = null) {
      if (aim) lastAim.copy(aim);
      const A = lastAim;
      group.updateMatrixWorld(true);
      inv.copy(group.matrixWorld).invert();
      // working pose: the tool hovers in front of and above the mark, the wrist sits behind it on the beam line
      if (hover) _t.copy(hover);
      else _t.set(A.x * 0.38, 38.9, 17.0 + 0.03 * (A.y - 24));
      _d.subVectors(A, _t).normalize();
      _wc.copy(_t).addScaledVector(_d, -(K.d6 + K.tool) * ARM_SCALE);
      lp.copy(_wc).applyMatrix4(inv);
      solveBody(lp, target);
      for (let j = 0; j < 3; j++) target[j] = THREE.MathUtils.lerp(target[j], REST[j], rest);
      // spring-damper per axis (founder: f = 1.9·speed^0.6 Hz, ζ 0.52, base yaw slower)
      const h = Math.min(dt, 1 / 20);
      const f = 1.9 * Math.pow(Math.max(1, speed), 0.6);
      const sub = 4;
      motion = 0;
      for (let k = 0; k < sub; k++)
        for (let j = 0; j < 3; j++) {
          const w = TAU * f * (j === 0 ? 0.8 : 1);
          const acc = w * w * (target[j] - q[j]) - 2 * 0.52 * w * qd[j];
          qd[j] += acc * (h / sub);
          q[j] += qd[j] * (h / sub);
        }
      for (let j = 0; j < 3; j++) motion = Math.max(motion, Math.abs(qd[j]));
      setBody();
      solveWrist(A);
      const w4 = wrist[0],
        w5 = wrist[1],
        w6 = wrist[2];
      restWrist();
      b4.rotation.x = THREE.MathUtils.lerp(w4, wrist[0], rest);
      b5.rotation.z = THREE.MathUtils.lerp(w5, wrist[1], rest);
      b6.rotation.x = THREE.MathUtils.lerp(w6, wrist[2], rest);
      group.updateMatrixWorld(true);
      emitterObj.getWorldPosition(emitter);
      eyeObj.getWorldPosition(eye);
      b6.getWorldQuaternion(_q);
      toolDir.set(1, 0, 0).applyQuaternion(_q);
    },
  };
  api.park();
  return api;
}
