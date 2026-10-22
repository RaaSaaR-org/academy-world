/**
 * Procedural 6-axis arm ("Hersteller X", fictional and unbranded): one SkinnedMesh with rigid
 * per-link skinning, so a whole arm is ONE draw call. Motions are TCP keyframes solved with the
 * analytic IK of armMath.ts every frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ARM, solveIK, type Joints } from './armMath';
import { paint, place } from './geom';

/** Bone indices */
const B_BASE = 0,
  B_TURRET = 1,
  B_UPPER = 2,
  B_FORE = 3,
  B_WRIST = 4,
  B_FLANGE = 5,
  B_FINGER_L = 6,
  B_FINGER_R = 7;

export interface ArmColors {
  shell: number;
  joint: number;
  dark: number;
  steel: number;
  accent: number;
}

export const VENDOR_COLORS: ArmColors = { shell: 0xf5f5f4, joint: 0x1c1917, dark: 0x292524, steel: 0xa8a29e, accent: 0xd6d3d1 };

/** Finger half-opening (m): open / closed on a part */
export const GRIP_OPEN = 0.055;
export const GRIP_CLOSED = 0.034;

function part(geo: THREE.BufferGeometry, bone: number, color: number, p: [number, number, number], r?: [number, number, number]): THREE.BufferGeometry {
  const g = place(paint(geo, color), p, r);
  const n = g.getAttribute('position').count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = bone;
    sw[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

const Z90: [number, number, number] = [Math.PI / 2, 0, 0]; // cylinder axis y → z
const X90: [number, number, number] = [0, 0, Math.PI / 2]; // cylinder axis y → x

function buildGeometry(c: ArmColors): THREE.BufferGeometry {
  const { d1, a2, d4, d6 } = ARM;
  const P: THREE.BufferGeometry[] = [];
  // base (static): plate + column
  P.push(part(new THREE.CylinderGeometry(0.25, 0.27, 0.06, 24), B_BASE, c.dark, [0, 0.03, 0]));
  P.push(part(new THREE.CylinderGeometry(0.18, 0.2, 0.2, 24), B_BASE, c.shell, [0, 0.16, 0]));
  P.push(part(new THREE.CylinderGeometry(0.185, 0.185, 0.03, 24), B_BASE, c.joint, [0, 0.275, 0]));
  // turret: drum + shoulder carrier + J2 motor housing (axis along z)
  P.push(part(new THREE.CylinderGeometry(0.17, 0.18, 0.12, 24), B_TURRET, c.shell, [0, 0.35, 0]));
  P.push(part(new RoundedBoxGeometry(0.3, d1 - 0.25, 0.26, 2, 0.05), B_TURRET, c.shell, [-0.02, 0.41 + (d1 - 0.41) / 2, -0.02]));
  P.push(part(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 24), B_TURRET, c.joint, [0, d1, 0.06], Z90));
  P.push(part(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 24), B_TURRET, c.shell, [0, d1, 0.27], Z90));
  // upper arm: link beside the plane (+z) + elbow housing (axis along z)
  P.push(part(new RoundedBoxGeometry(a2, 0.17, 0.12, 2, 0.05), B_UPPER, c.shell, [a2 / 2, 0, 0.165]));
  P.push(part(new THREE.CylinderGeometry(0.115, 0.115, 0.34, 24), B_UPPER, c.joint, [a2, 0, 0.07], Z90));
  P.push(part(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 24), B_UPPER, c.shell, [a2, 0, 0.245], Z90));
  // forearm (in the arm plane): motor block behind the elbow + slim tube to the wrist
  P.push(part(new RoundedBoxGeometry(0.3, 0.16, 0.15, 2, 0.05), B_FORE, c.shell, [-0.03, 0.03, 0]));
  P.push(part(new THREE.CylinderGeometry(0.066, 0.078, d4 - 0.12, 20), B_FORE, c.shell, [0.07 + (d4 - 0.12) / 2, 0, 0], X90));
  P.push(part(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 20), B_FORE, c.joint, [0.13, 0, 0], X90));
  // wrist: J5 housing (axis z) + short link to the flange (axis x)
  P.push(part(new THREE.CylinderGeometry(0.068, 0.068, 0.18, 20), B_WRIST, c.joint, [0, 0, 0], Z90));
  P.push(part(new THREE.CylinderGeometry(0.05, 0.06, d6 - 0.02, 16), B_WRIST, c.shell, [(d6 - 0.02) / 2, 0, 0], X90));
  // flange + gripper body
  P.push(part(new THREE.CylinderGeometry(0.058, 0.058, 0.025, 20), B_FLANGE, c.steel, [d6 - 0.005, 0, 0], X90));
  P.push(part(new RoundedBoxGeometry(0.08, 0.075, 0.15, 2, 0.012), B_FLANGE, c.dark, [d6 + 0.045, 0, 0]));
  // fingers (bones sit at the gripper face; geometry extends along +x)
  for (const [b, s] of [
    [B_FINGER_L, 1],
    [B_FINGER_R, -1],
  ] as const) {
    P.push(part(new THREE.BoxGeometry(0.11, 0.03, 0.018), b, c.steel, [0.055, 0, -0.009 * s]));
    P.push(part(new THREE.BoxGeometry(0.03, 0.032, 0.02), b, c.accent, [0.1, 0, -0.012 * s]));
  }
  for (const g of P) g.deleteAttribute('uv');
  const merged = mergeGeometries(P, false);
  for (const g of P) g.dispose();
  if (!merged) throw new Error('[prueffeld] arm merge failed');
  return merged;
}

export interface ArmRig {
  /** group at the arm base (place it in zone-local coordinates; keep it unrotated) */
  readonly object: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  /** current joint angles */
  readonly q: Joints;
  /** move the TCP (zone-local coordinates) with a top-down grasp at finger yaw; returns reach ratio */
  reach(x: number, y: number, z: number, yaw: number): number;
  setJoints(q: Joints): void;
  /** finger half-opening (m) */
  setGrip(w: number): void;
  /** TCP world position (for attaching parts) */
  tcpLocal(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export function createArm(material: THREE.Material, colors: ArmColors = VENDOR_COLORS): ArmRig {
  const geo = buildGeometry(colors);
  const { d1, a2, d4, d6 } = ARM;
  const bones: THREE.Bone[] = [];
  const mk = (parent: THREE.Bone | null, p: [number, number, number]): THREE.Bone => {
    const b = new THREE.Bone();
    b.position.set(p[0], p[1], p[2]);
    parent?.add(b);
    bones.push(b);
    return b;
  };
  const base = mk(null, [0, 0, 0]);
  const turret = mk(base, [0, 0, 0]);
  const upper = mk(turret, [0, d1, 0]);
  const fore = mk(upper, [a2, 0, 0]);
  const wrist = mk(fore, [d4, 0, 0]);
  const flange = mk(wrist, [0, 0, 0]);
  const fl = mk(flange, [d6 + 0.085, 0, GRIP_OPEN]);
  const fr = mk(flange, [d6 + 0.085, 0, -GRIP_OPEN]);
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(base);
  mesh.updateMatrixWorld(true);
  // part() authors every link in its own bone's frame, so the bind pose is each bone at the mesh origin:
  // identity inverse bind matrices, and an explicit bind matrix so bind() keeps them. (Inverses taken from
  // the bones at their joint offsets shifted each link by its bind position: the links floated apart.)
  mesh.bind(new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // the arm sweeps a sphere of ~1.7 m around the base: a fixed bounding sphere keeps culling cheap and correct
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 2.1);
  mesh.frustumCulled = true;
  const object = new THREE.Group();
  object.add(mesh);

  const q: Joints = [0, 0, 0, 0, 0, 0];
  const apply = (): void => {
    turret.rotation.y = q[0];
    upper.rotation.z = q[1];
    fore.rotation.z = q[2];
    fore.rotation.x = q[3];
    wrist.rotation.z = q[4];
    flange.rotation.x = q[5];
  };
  const tmp = new THREE.Vector3();
  const rig: ArmRig = {
    object,
    mesh,
    q,
    reach(x, y, z, yaw) {
      const ox = object.position.x,
        oy = object.position.y,
        oz = object.position.z;
      const r = solveIK(x - ox, y - oy, z - oz, yaw, q);
      apply();
      return r;
    },
    setJoints(nq) {
      for (let i = 0; i < 6; i++) q[i] = nq[i];
      apply();
    },
    setGrip(w) {
      fl.position.z = w;
      fr.position.z = -w;
    },
    tcpLocal(out) {
      // finger centre in the zone frame (object is a child of a zone group without rotation)
      tmp.set(ARM.tool, 0, 0);
      flange.updateWorldMatrix(true, false);
      out.copy(tmp).applyMatrix4(flange.matrixWorld);
      object.parent?.worldToLocal(out);
      return out;
    },
    dispose() {
      geo.dispose();
      mesh.skeleton.dispose();
    },
  };
  // home pose
  rig.setJoints([0, 0.9, -1.9, 0, -0.57, 0]);
  rig.setGrip(GRIP_OPEN);
  return rig;
}

// ── TCP motion keyframes ─────────────────────────────────────────────────────

export interface Key {
  /** time (s) */
  t: number;
  /** TCP, zone-local */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** finger half-opening */
  grip: number;
}

/** Evaluate keyframes at time t (smoothstep between keys). Writes into `out`. */
export function evalKeys(keys: readonly Key[], t: number, out: Key): Key {
  if (t <= keys[0].t) return copyKey(keys[0], out);
  const last = keys[keys.length - 1];
  if (t >= last.t) return copyKey(last, out);
  let i = 1;
  while (i < keys.length && keys[i].t < t) i++;
  const a = keys[i - 1],
    b = keys[i];
  const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  const s = u * u * (3 - 2 * u);
  out.t = t;
  out.x = a.x + (b.x - a.x) * s;
  out.y = a.y + (b.y - a.y) * s;
  out.z = a.z + (b.z - a.z) * s;
  out.yaw = a.yaw + (b.yaw - a.yaw) * s;
  out.grip = a.grip + (b.grip - a.grip) * s;
  return out;
}

function copyKey(k: Key, out: Key): Key {
  out.t = k.t;
  out.x = k.x;
  out.y = k.y;
  out.z = k.z;
  out.yaw = k.yaw;
  out.grip = k.grip;
  return out;
}

export const newKey = (): Key => ({ t: 0, x: 0, y: 0, z: 0, yaw: 0, grip: GRIP_OPEN });
