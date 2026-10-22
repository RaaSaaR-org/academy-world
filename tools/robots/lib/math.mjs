// Frames for URDF and MJCF, as three.js matrices (metres, radians).
import * as THREE from 'three';

/** URDF origin: xyz + fixed-axis roll, pitch, yaw (R = Rz(y) · Ry(p) · Rx(r)). */
export function urdfOrigin(xyz = [0, 0, 0], rpy = [0, 0, 0]) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rpy[0], rpy[1], rpy[2], 'ZYX'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...xyz), q, new THREE.Vector3(1, 1, 1));
}

export const translation = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

/** MuJoCo quaternion w x y z → three (x y z w). */
export const mjQuat = (w, x, y, z) => new THREE.Quaternion(x, y, z, w).normalize();

/**
 * MJCF orientation of a body / geom / frame / site, in this priority (MuJoCo: only one may be
 * given): quat, axisangle, euler, xyaxes, zaxis. `angleScale` converts degrees when the compiler
 * says angle="degree" (the MuJoCo default). `eulerseq` as in <compiler eulerseq>.
 */
export function mjOrientation(a, angleScale, eulerseq = 'xyz') {
  const n = (s) => String(s).trim().split(/\s+/).map(Number);
  if (a.quat !== undefined) return mjQuat(...n(a.quat));
  if (a.axisangle !== undefined) {
    const [x, y, z, ang] = n(a.axisangle);
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), ang * angleScale);
  }
  if (a.euler !== undefined) {
    const e = n(a.euler).map((v) => v * angleScale);
    const q = new THREE.Quaternion();
    const axes = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
    for (let i = 0; i < 3; i++) {
      const c = eulerseq[i];
      const r = new THREE.Quaternion().setFromAxisAngle(axes[c.toLowerCase()], e[i]);
      // lowercase: intrinsic (rotating axes) → post-multiply; uppercase: extrinsic (fixed) → pre-multiply
      if (c === c.toLowerCase()) q.multiply(r);
      else q.premultiply(r);
    }
    return q;
  }
  if (a.xyaxes !== undefined) {
    const v = n(a.xyaxes);
    const x = new THREE.Vector3(v[0], v[1], v[2]).normalize();
    let y = new THREE.Vector3(v[3], v[4], v[5]);
    y.addScaledVector(x, -y.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  if (a.zaxis !== undefined) {
    const z = new THREE.Vector3(...n(a.zaxis)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), z);
  }
  return new THREE.Quaternion();
}

export function compose(pos, quat) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), quat, new THREE.Vector3(1, 1, 1));
}

export const r6 = (x) => (x === null || x === undefined ? x : Math.round(x * 1e6) / 1e6);
export const r4 = (x) => (x === null || x === undefined ? x : Math.round(x * 1e4) / 1e4);

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
