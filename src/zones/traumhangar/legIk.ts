import * as THREE from 'three';
import type { RobotModel } from '@/core/zones';

/** The six joints of one URDF leg (the Unitree naming: R1, G1, H1-2 and H2 share it) and the foot link. */
export interface LegJoints {
  hipPitch: string;
  hipRoll: string;
  hipYaw: string;
  knee: string;
  anklePitch: string;
  ankleRoll: string;
}

export const legJoints = (side: 'left' | 'right'): LegJoints => ({
  hipPitch: `${side}_hip_pitch_joint`,
  hipRoll: `${side}_hip_roll_joint`,
  hipYaw: `${side}_hip_yaw_joint`,
  knee: `${side}_knee_joint`,
  anklePitch: `${side}_ankle_pitch_joint`,
  ankleRoll: `${side}_ankle_roll_joint`,
});

/**
 * The foot link of a leg: the child of whichever ankle joint comes last in the chain (the G1 and the R1
 * pitch then roll; the H2 rolls then pitches).
 */
export function footLink(model: RobotModel, j: LegJoints): string {
  const pitch = model.jointNode(j.anklePitch);
  const roll = model.jointNode(j.ankleRoll);
  let last = j.ankleRoll;
  for (let q = pitch?.parent ?? null; q; q = q.parent)
    if (q === roll) {
      last = j.anklePitch;
      break;
    }
  return model.joints.find((x) => x.name === last)?.link ?? `${j.ankleRoll.replace('_joint', '_link')}`;
}

const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _dp = new THREE.Vector3();
const _ds = new THREE.Vector3();

/**
 * Analytic leg IK for a URDF humanoid leg (hip pitch → roll → yaw → knee → ankle pitch → roll), calibrated
 * numerically on the model at its rest pose, so no axis or sign convention is hard-coded: the thigh and
 * shank lengths, the robot's forward / left axes, every joint's effect (sign and gain) on the leg angle
 * and on the foot's pitch, roll and yaw are measured by nudging each joint once. Solving is then closed
 * form (law of cosines in the sagittal plane, hip roll for the lateral offset, ankle pitch and roll keep
 * the sole flat, hip yaw turns the foot): a few dozen flops per leg, no iterations, no matrix updates.
 * Small hip offsets (the G1's lateral hip-to-knee offset) are ignored: the foot lands within ≈ 1–2 cm.
 * Moved in from WP2's spike (calibrated there on the G1); the same code drives the R1, the H1-2 (its
 * hip yaw comes first in the chain: the rest calibration absorbs it) and the H2.
 */
export class LegIk {
  /** robot-root frame (model.object local): forward, left, up */
  readonly fwd = new THREE.Vector3();
  readonly left = new THREE.Vector3();
  readonly up = new THREE.Vector3(0, 1, 0);
  /** hip pitch joint origin (root frame) */
  readonly hip = new THREE.Vector3();
  /** thigh, shank (m); ankle joint height above the sole at rest (m) */
  L1 = 0;
  L2 = 0;
  soleDrop = 0;
  /** straight-leg height of the hip above the sole (m) */
  reach = 0;
  // rest angles (rad): thigh and shank from vertical (forward +), the leg's lateral angle (left +)
  private th1Rest = 0;
  private kneeRest = 0;
  private latRest = 0;
  // gains: physical angle per rad of joint value
  private cH = 1;
  private cK = 1;
  private cR = 1;
  private cY = 1;
  // foot tilt per rad (pitch: toe up +, roll: left edge up +)
  private tH = 1;
  private tK = 1;
  private tA = 1;
  private rH = 1;
  private rA = 1;

  constructor(
    private readonly model: RobotModel,
    readonly j: LegJoints,
    footLink: string,
  ) {
    const m = model;
    const o = m.object;
    // calibrate in the robot's own frame: off its parent, at the origin, unrotated
    const parent = o.parent;
    parent?.remove(o);
    const keepP = o.position.clone(),
      keepQ = o.quaternion.clone();
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    o.updateMatrixWorld(true);
    const pose = m.getPose();
    for (const k of Object.values(j)) m.setJoint(k, 0);
    const pos = (link: string, out: THREE.Vector3): THREE.Vector3 => {
      const n = m.jointNode(link) ?? m.linkNode(link);
      n!.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(n!.matrixWorld);
    };
    const footQ = (out: THREE.Quaternion): THREE.Quaternion => {
      const n = m.linkNode(footLink)!;
      n.updateWorldMatrix(true, false);
      n.matrixWorld.decompose(_dp, out, _ds);
      return out;
    };
    const H = pos(j.hipPitch, new THREE.Vector3());
    const K = pos(j.knee, new THREE.Vector3());
    const A = pos(j.anklePitch, new THREE.Vector3());
    this.hip.copy(H);
    this.L1 = H.distanceTo(K);
    this.L2 = K.distanceTo(A);
    // forward: knee flexion moves the ankle backward
    m.setJoint(j.knee, 0.4);
    const A2 = pos(j.anklePitch, new THREE.Vector3());
    m.setJoint(j.knee, 0);
    this.fwd.copy(A).sub(A2).setY(0).normalize();
    this.left.crossVectors(this.up, this.fwd).normalize();
    const angFwd = (a: THREE.Vector3, b: THREE.Vector3): number => {
      const d = _v.copy(b).sub(a);
      return Math.atan2(d.dot(this.fwd), -d.dot(this.up));
    };
    const angLat = (a: THREE.Vector3, b: THREE.Vector3): number => {
      const d = _v.copy(b).sub(a);
      return Math.atan2(d.dot(this.left), -d.dot(this.up));
    };
    this.th1Rest = angFwd(H, K);
    this.kneeRest = this.th1Rest - angFwd(K, A);
    this.latRest = angLat(H, A);
    // the sole: lowest point of the robot at rest (feet on the floor), below the ankle joint
    const box = new THREE.Box3().setFromObject(o);
    this.soleDrop = A.y - box.min.y;
    this.reach = H.y - box.min.y;
    // foot reference vectors in the foot frame
    const q0 = footQ(new THREE.Quaternion());
    _qi.copy(q0).invert();
    const toeL = this.fwd.clone().applyQuaternion(_qi);
    const leftL = this.left.clone().applyQuaternion(_qi);
    const tilt = (axisL: THREE.Vector3): number => Math.asin(THREE.MathUtils.clamp(_w.copy(axisL).applyQuaternion(footQ(_q)).dot(this.up), -1, 1));
    const yawOf = (): number => {
      _w.copy(toeL).applyQuaternion(footQ(_q));
      return Math.atan2(_w.dot(this.left), _w.dot(this.fwd));
    };
    const d = 0.2;
    const nudge = (joint: string, f: () => number): number => {
      m.setJoint(joint, d);
      const r = f() / d;
      m.setJoint(joint, 0);
      return r;
    };
    this.cH = nudge(j.hipPitch, () => angFwd(H, pos(j.knee, _w.clone())) - this.th1Rest) || 1;
    this.cK = nudge(j.knee, () => this.th1Rest - angFwd(K, pos(j.anklePitch, _w.clone())) - this.kneeRest) || 1;
    this.tH = nudge(j.hipPitch, () => tilt(toeL)) || 1;
    this.tK = nudge(j.knee, () => tilt(toeL)) || 1;
    this.tA = nudge(j.anklePitch, () => tilt(toeL)) || 1;
    this.cR = nudge(j.hipRoll, () => angLat(H, pos(j.anklePitch, _w.clone())) - this.latRest) || 1;
    this.rH = nudge(j.hipRoll, () => tilt(leftL)) || 1;
    this.rA = nudge(j.ankleRoll, () => tilt(leftL)) || 1;
    this.cY = nudge(j.hipYaw, yawOf) || 1;
    m.setPose(pose);
    o.position.copy(keepP);
    o.quaternion.copy(keepQ);
    parent?.add(o);
    o.updateMatrixWorld(true);
  }

  /**
   * Put the ankle joint at `ankle` (robot-root frame) with the sole flat and the foot turned by `yaw`
   * (rad, left +) relative to the pelvis. Returns how far the target was out of reach (m, 0 = reached).
   */
  solve(ankle: THREE.Vector3, yaw = 0): number {
    const d = _v.copy(ankle).sub(this.hip);
    const dx = d.dot(this.fwd),
      dy = d.dot(this.left),
      dz = d.dot(this.up);
    const lat = Math.atan2(dy, -dz);
    const h = Math.hypot(dy, dz);
    const L1 = this.L1,
      L2 = this.L2;
    const D0 = Math.hypot(dx, h);
    const D = THREE.MathUtils.clamp(D0, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.9995);
    const knee = Math.PI - Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const alpha = Math.atan2(dx, h);
    const beta = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const qH = (alpha + beta - this.th1Rest) / this.cH;
    const qK = (knee - this.kneeRest) / this.cK;
    const qA = -(this.tH * qH + this.tK * qK) / this.tA;
    const qR = (lat - this.latRest) / this.cR;
    const qAR = -(this.rH * qR) / this.rA;
    const m = this.model,
      j = this.j;
    m.setJoint(j.hipPitch, qH);
    m.setJoint(j.knee, qK);
    m.setJoint(j.anklePitch, qA);
    m.setJoint(j.hipRoll, qR);
    m.setJoint(j.ankleRoll, qAR);
    m.setJoint(j.hipYaw, yaw / this.cY);
    return Math.max(0, D0 - D);
  }

  /** calibration numbers (the hand-off findings) */
  info(): Record<string, number> {
    const r = (x: number): number => Math.round(x * 1000) / 1000;
    return { L1: r(this.L1), L2: r(this.L2), soleDrop: r(this.soleDrop), reach: r(this.reach), cH: r(this.cH), cK: r(this.cK), cR: r(this.cR), cY: r(this.cY), tH: r(this.tH), tK: r(this.tK), tA: r(this.tA), rH: r(this.rH), rA: r(this.rA) };
  }
}
