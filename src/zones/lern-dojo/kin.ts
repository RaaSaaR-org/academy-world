/**
 * Lern-Dojo · SO-101 kinematics for the simulation (no DOM, no engine): a headless copy of the real
 * robot's link chain, so the station's physics, the scripted demonstrator and the Node check
 * (tools/lerndojo-check.mjs) move exactly the arm the player sees. The chain is read from WP0's model,
 * never typed in: in the game from the loaded RobotModel (`chainFromModel`), in Node from the GLB's
 * node table (`chainFromGlb`). Joint values are rad in the URDF's convention (LeRobot's order).
 *
 * IK: cyclic coordinate descent like WP0's RobotModel.solveIK (src/core/robots/ik.ts), warm-started
 * from the current pose; the jaws are held pointing down by wrist_flex and wrist_roll is commanded.
 */
import * as THREE from 'three';
import { GRIPPER, IK } from './tuning';

/** LeRobot's joint order for the SO-101 (action and observation.state). */
export const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'] as const;
export type JointName = (typeof JOINTS)[number];
export const NJ = 6;
/** the joints the IK moves for the grasp point (wrist_roll and the gripper are commanded) */
const IK_JOINTS = [0, 1, 2, 3] as const;

export interface ChainJoint {
  name: string;
  axis: [number, number, number];
  lower: number;
  upper: number;
}

export interface ChainLink {
  link: string;
  parent: string | null;
  /** rest transform relative to the parent link (the root link: relative to the robot's object) */
  p: [number, number, number];
  q: [number, number, number, number];
  joint: ChainJoint | null;
}

/** A robot's links as the model has them (rest pose = every joint at 0). */
export interface ChainSpec {
  links: ChainLink[];
}

/** Minimal view of WP0's RobotModel this file reads (zones import robot types only). */
interface ModelLike {
  object: THREE.Object3D;
}

/**
 * The chain of a loaded RobotModel. Call right after load (default pose {}: every joint at its
 * reference 0, so the node transforms are the rest transforms).
 */
export function chainFromModel(model: ModelLike): ChainSpec {
  const links: ChainLink[] = [];
  const obj = model.object;
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  obj.traverse((n) => {
    const link = n.userData.link as string | undefined;
    if (!link) return;
    let par: THREE.Object3D | null = n.parent;
    while (par && par !== obj && !par.userData.link) par = par.parent;
    const parent = par && par !== obj ? (par.userData.link as string) : null;
    if (parent) {
      p.copy(n.position);
      q.copy(n.quaternion);
    } else {
      // the root link: everything between the robot's object and it (the glTF root's Z-up → Y-up turn)
      m.multiplyMatrices(inv, n.matrixWorld).decompose(p, q, s);
    }
    const j = n.userData.joint as { name: string; type: string; axis: [number, number, number]; limit?: { lower: number | null; upper: number | null } | null } | undefined;
    const joint = j && j.type !== 'fixed' ? { name: j.name, axis: j.axis, lower: j.limit?.lower ?? -Infinity, upper: j.limit?.upper ?? Infinity } : null;
    links.push({ link, parent, p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], joint });
  });
  return { links };
}

/** The chain from a GLB's JSON chunk (Node tools): the same nodes RobotLibrary builds the model from. */
export function chainFromGlb(json: { nodes: { name?: string; translation?: number[]; rotation?: number[]; children?: number[]; extras?: Record<string, unknown> }[]; scenes: { nodes: number[] }[] }): ChainSpec {
  const N = json.nodes;
  const parentOf = new Map<number, number>();
  N.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
  const local = (i: number): THREE.Matrix4 => {
    const n = N[i];
    const t = n.translation ?? [0, 0, 0];
    const r = n.rotation ?? [0, 0, 0, 1];
    return new THREE.Matrix4().compose(new THREE.Vector3(t[0], t[1], t[2]), new THREE.Quaternion(r[0], r[1], r[2], r[3]), new THREE.Vector3(1, 1, 1));
  };
  const links: ChainLink[] = [];
  N.forEach((n, i) => {
    const link = n.extras?.link as string | undefined;
    if (!link) return;
    let k = parentOf.get(i);
    while (k !== undefined && !N[k].extras?.link) k = parentOf.get(k);
    const parent = k !== undefined ? (N[k].extras!.link as string) : null;
    const m = local(i);
    if (!parent) for (let a = parentOf.get(i); a !== undefined; a = parentOf.get(a)) m.premultiply(local(a));
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    m.decompose(p, q, new THREE.Vector3());
    const j = n.extras?.joint as { name: string; type: string; axis: [number, number, number]; limit?: { lower: number | null; upper: number | null } | null } | undefined;
    const joint = j && j.type !== 'fixed' ? { name: j.name, axis: j.axis, lower: j.limit?.lower ?? -Infinity, upper: j.limit?.upper ?? Infinity } : null;
    links.push({ link, parent, p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], joint });
  });
  return { links };
}

interface JointState {
  node: THREE.Object3D;
  restQ: THREE.Quaternion;
  axis: THREE.Vector3;
  lower: number;
  upper: number;
}

const _q = new THREE.Quaternion();
const _pivot = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _toTip = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
/** the jaws' approach axis in gripper_link (the fingers reach along −z) */
const APPROACH = new THREE.Vector3(0, 0, -1);

function planeAngle(axis: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): number {
  _a.copy(from).addScaledVector(axis, -from.dot(axis));
  _b.copy(to).addScaledVector(axis, -to.dot(axis));
  if (_a.lengthSq() < 1e-12 || _b.lengthSq() < 1e-12) return 0;
  return Math.atan2(axis.dot(_c.crossVectors(_a, _b)), _a.dot(_b));
}

/**
 * One SO-101 (leader or follower) placed on the bench: forward kinematics on a headless node tree,
 * IK for the jaw centre. `root` is the robot's object in the bench frame.
 */
export class Skeleton {
  readonly root = new THREE.Object3D();
  readonly q = new Float64Array(NJ);
  private readonly nodes = new Map<string, THREE.Object3D>();
  private readonly joints: JointState[] = [];
  private readonly tipOffset = new THREE.Vector3(...GRIPPER.jawCentre);

  constructor(spec: ChainSpec, base: { x: number; y?: number; z: number; yaw?: number }) {
    this.root.position.set(base.x, base.y ?? 0, base.z);
    this.root.rotation.y = base.yaw ?? 0;
    for (const l of spec.links) {
      const n = new THREE.Object3D();
      n.name = l.link;
      n.position.set(...l.p);
      n.quaternion.set(...l.q);
      this.nodes.set(l.link, n);
      (l.parent ? this.nodes.get(l.parent)! : this.root).add(n);
    }
    for (const name of JOINTS) {
      const l = spec.links.find((k) => k.joint?.name === name);
      if (!l || !l.joint) throw new Error(`[lern-dojo] SO-101 chain has no joint ${name}`);
      const node = this.nodes.get(l.link)!;
      this.joints.push({ node, restQ: node.quaternion.clone(), axis: new THREE.Vector3(...l.joint.axis).normalize(), lower: l.joint.lower, upper: l.joint.upper });
    }
    this.root.updateMatrixWorld(true);
  }

  limits(i: number): [number, number] {
    return [this.joints[i].lower, this.joints[i].upper];
  }

  /** Set joint i (clamped); call update() before reading frames. */
  set(i: number, v: number): number {
    const j = this.joints[i];
    const c = Math.min(j.upper, Math.max(j.lower, v));
    this.q[i] = c;
    j.node.quaternion.copy(j.restQ).multiply(_q.setFromAxisAngle(j.axis, c));
    return c;
  }

  setAll(q: ArrayLike<number>): void {
    for (let i = 0; i < NJ; i++) this.set(i, q[i]);
    this.root.updateMatrixWorld(true);
  }

  update(): void {
    this.root.updateMatrixWorld(true);
  }

  /** World (bench-frame) matrix of a link; valid after setAll/update. */
  matrix(link: string): THREE.Matrix4 {
    return this.nodes.get(link)!.matrixWorld;
  }

  /** The jaw centre (GRIPPER.jawCentre in gripper_link) in the bench frame. */
  jawCentre(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.tipOffset).applyMatrix4(this.matrix('gripper_link'));
  }

  /** The jaws' closing axis (gripper_link +x, fixed face → moving jaw) in the bench frame. */
  closingAxis(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(1, 0, 0).transformDirection(this.matrix('gripper_link'));
  }

  private tipWorld(): THREE.Vector3 {
    const n = this.nodes.get('gripper_link')!;
    n.updateWorldMatrix(true, false);
    return _tip.copy(this.tipOffset).applyMatrix4(n.matrixWorld);
  }

  /**
   * Move the jaw centre to `target` (bench frame) with the jaws pointing down, wrist_roll at `roll`
   * (the gripper joint is untouched). Warm-starts from the current pose. Returns the remaining error (m).
   */
  solveIK(target: THREE.Vector3, roll: number): number {
    this.set(4, roll);
    let err = this.tipWorld().distanceTo(target);
    for (let it = 0; it < IK.iterations && err > IK.tolerance; it++) {
      for (let k = IK_JOINTS.length - 1; k >= 0; k--) {
        const i = IK_JOINTS[k];
        const j = this.joints[i];
        j.node.updateWorldMatrix(true, false);
        _pivot.setFromMatrixPosition(j.node.matrixWorld);
        _axis.copy(j.axis).transformDirection(j.node.matrixWorld);
        _toTip.copy(this.tipWorld()).sub(_pivot);
        _toTarget.copy(target).sub(_pivot);
        let angle = planeAngle(_axis, _toTip, _toTarget);
        if (i === 3) {
          // wrist_flex holds the jaws vertical (WP0's `orient`, one joint)
          const g = this.nodes.get('gripper_link')!;
          g.updateWorldMatrix(true, false);
          _c.copy(APPROACH).transformDirection(g.matrixWorld);
          const turn = planeAngle(_axis, _c.clone(), DOWN);
          angle = angle * (1 - IK.orientWeight) + turn * IK.orientWeight;
        }
        if (angle !== 0) this.set(i, this.q[i] + angle);
      }
      err = this.tipWorld().distanceTo(target);
    }
    this.root.updateMatrixWorld(true);
    return err;
  }
}

/** The jaw gap at the grasp height for a gripper angle (m; GRIPPER.gap fit). */
export function jawGap(q: number): number {
  return GRIPPER.gap.a - GRIPPER.gap.b * Math.cos(q) + GRIPPER.gap.c * Math.sin(q);
}

/** The gripper angle whose gap is `gap` (bisection on the monotone part, −10° … 60°). */
export function gripperFor(gap: number): number {
  let lo = -0.1745,
    hi = 1.05;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (jawGap(mid) < gap) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
