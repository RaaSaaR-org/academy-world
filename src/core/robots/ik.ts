import * as THREE from 'three';
import type { RobotIkOptions, RobotIkResult } from './types';

/** What the solver needs from a robot (RobotModel implements it). */
export interface IkTarget {
  jointNode(name: string): THREE.Object3D | null;
  jointAxis(name: string): THREE.Vector3 | null;
  jointType(name: string): 'revolute' | 'continuous' | 'prismatic' | null;
  getJoint(name: string): number;
  setJoint(name: string, value: number): number;
  linkNode(name: string): THREE.Object3D | null;
}

const _pivot = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _toTip = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Signed angle about `axis` that turns `from` onto `to`, both projected onto the plane ⟂ axis (0 if degenerate). */
function planeAngle(axis: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): number {
  _a.copy(from).addScaledVector(axis, -from.dot(axis));
  _b.copy(to).addScaledVector(axis, -to.dot(axis));
  if (_a.lengthSq() < 1e-12 || _b.lengthSq() < 1e-12) return 0;
  return Math.atan2(axis.dot(_cross.crossVectors(_a, _b)), _a.dot(_b));
}

/**
 * Cyclic coordinate descent for arm chains (base → tip joint names). Moves the origin of link
 * `tip` (plus `tipOffset`) to `target` (world), respecting every joint's limits; with `orient`,
 * the last joints also turn a tip axis towards a world direction. Position only otherwise, no
 * null-space control: good for pointing, reaching and grasp poses of 5–7 DoF arms.
 */
export function solveCcd(robot: IkTarget, chain: readonly string[], tip: string, target: THREE.Vector3, o: RobotIkOptions = {}): RobotIkResult {
  const tipNode = robot.linkNode(tip);
  if (!tipNode || !chain.length) return { error: Infinity, iterations: 0, reached: false };
  const iterations = o.iterations ?? 24;
  const tolerance = o.tolerance ?? 0.001;
  const orient = o.orient ?? null;
  const oWeight = orient ? THREE.MathUtils.clamp(orient.weight ?? 0.5, 0, 1) : 0;
  const oJoints = orient ? Math.max(1, orient.joints ?? 2) : 0;
  const tipWorld = (): THREE.Vector3 => {
    tipNode.updateWorldMatrix(true, false);
    return o.tipOffset ? _tip.copy(o.tipOffset).applyMatrix4(tipNode.matrixWorld) : _tip.setFromMatrixPosition(tipNode.matrixWorld);
  };
  let err = tipWorld().distanceTo(target);
  let it = 0;
  for (; it < iterations && err > tolerance; it++) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const name = chain[i];
      const node = robot.jointNode(name);
      const axisLocal = robot.jointAxis(name);
      const type = robot.jointType(name);
      if (!node || !axisLocal || !type) continue;
      node.updateWorldMatrix(true, false);
      _pivot.setFromMatrixPosition(node.matrixWorld);
      _axis.copy(axisLocal).transformDirection(node.matrixWorld);
      if (type === 'prismatic') {
        _toTarget.copy(target).sub(tipWorld());
        robot.setJoint(name, robot.getJoint(name) + _toTarget.dot(_axis));
        continue;
      }
      _toTip.copy(tipWorld()).sub(_pivot);
      _toTarget.copy(target).sub(_pivot);
      let angle = planeAngle(_axis, _toTip, _toTarget);
      if (orient && i >= chain.length - oJoints) {
        tipNode.updateWorldMatrix(true, false);
        _a.copy(orient.axis).transformDirection(tipNode.matrixWorld);
        const turn = planeAngle(_axis, _a, orient.direction);
        angle = angle * (1 - oWeight) + turn * oWeight;
      }
      if (angle !== 0) robot.setJoint(name, robot.getJoint(name) + angle);
    }
    err = tipWorld().distanceTo(target);
  }
  return { error: err, iterations: it, reached: err <= tolerance };
}
