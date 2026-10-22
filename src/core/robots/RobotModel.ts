import * as THREE from 'three';
import type { RobotId, RobotManifestEntry } from '@/robots/manifest';
import type { RobotIkOptions, RobotIkResult, RobotJoint, RobotLod } from './types';
import { solveCcd, type IkTarget } from './ik';

/** Joint data as the robot pipeline writes it into each moving node's glTF extras (userData). */
interface NodeJointExtras {
  name: string;
  type: string;
  axis: [number, number, number];
  limit?: { lower: number | null; upper: number | null } | null;
  mimic?: { joint: string; multiplier: number; offset: number };
  ref?: number;
}

interface JointState {
  readonly def: RobotJoint;
  readonly node: THREE.Object3D;
  readonly restQ: THREE.Quaternion;
  readonly restP: THREE.Vector3;
  readonly ref: number;
  value: number;
  followers: JointState[];
}

/** Parts of one instance, built by RobotLibrary. */
export interface RobotParts {
  /** the cloned glTF scene (root node, link nodes, the skinned mesh) */
  scene: THREE.Object3D;
  /** the one skinned mesh; its geometry switches between the LODs */
  mesh: THREE.SkinnedMesh;
  lod0: THREE.BufferGeometry;
  lod1: THREE.BufferGeometry | null;
  /** articulated low LOD (crowds, far ghosts), where the model has one */
  lod2: THREE.BufferGeometry | null;
  silhouette: THREE.Mesh | null;
  onDispose: () => void;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Vector3();
const DEG30 = Math.tan(Math.PI / 6);

/**
 * One articulated robot instance: a real published model, converted by tools/robots (one
 * rigid-skinned mesh = one draw call; LOD0 / LOD1 share the skeleton and the vertex buffer).
 * Add `object` to the scene and move only it, never the nodes inside. Joint values are rad (m for
 * prismatic joints) in the source's convention, clamped to the source's limits.
 */
export class RobotModel implements IkTarget {
  readonly id: RobotId;
  readonly info: RobotManifestEntry;
  readonly object = new THREE.Group();
  readonly joints: readonly RobotJoint[];
  readonly links: readonly string[];
  private readonly parts: RobotParts;
  private readonly state = new Map<string, JointState>();
  private readonly linkNodes = new Map<string, THREE.Object3D>();
  private lodMode: RobotLod = 'auto';
  private shown: 0 | 1 | 2 | 'silhouette' = 0;
  private disposed = false;

  constructor(id: RobotId, info: RobotManifestEntry, parts: RobotParts) {
    this.id = id;
    this.info = info;
    this.parts = parts;
    this.object.name = `robot:${id}`;
    this.object.userData.robot = id;
    // never merged or frozen: it moves (ARCHITECTURE §16, mergeStatic)
    this.object.userData.noMerge = true;
    this.object.add(parts.scene);
    if (parts.silhouette) {
      parts.silhouette.visible = false;
      this.object.add(parts.silhouette);
    }
    const joints: RobotJoint[] = [];
    parts.scene.traverse((n) => {
      const link = n.userData.link as string | undefined;
      if (link) this.linkNodes.set(link, n);
      const j = n.userData.joint as NodeJointExtras | undefined;
      if (!link || !j || (j.type !== 'revolute' && j.type !== 'continuous' && j.type !== 'prismatic')) return;
      const def: RobotJoint = {
        name: j.name,
        type: j.type,
        link,
        axis: new THREE.Vector3(...j.axis).normalize(),
        lower: j.type === 'continuous' || j.limit?.lower == null ? -Infinity : j.limit.lower,
        upper: j.type === 'continuous' || j.limit?.upper == null ? Infinity : j.limit.upper,
        mimic: j.mimic ?? null,
      };
      joints.push(def);
      this.state.set(def.name, { def, node: n, restQ: n.quaternion.clone(), restP: n.position.clone(), ref: j.ref ?? 0, value: j.ref ?? 0, followers: [] });
    });
    for (const s of this.state.values()) {
      const m = s.def.mimic;
      if (m) this.state.get(m.joint)?.followers.push(s);
    }
    this.joints = joints;
    this.links = [...this.linkNodes.keys()];
    this.setPose(info.defaultPose);
  }

  // ── joints ──────────────────────────────────────────────────────────────

  /** Set a joint, clamped to its limits (mimic followers follow). Returns the applied value; NaN for an unknown joint. */
  setJoint(name: string, value: number): number {
    const s = this.state.get(name);
    if (!s || !Number.isFinite(value)) return NaN;
    return this.apply(s, value, 0);
  }

  private apply(s: JointState, value: number, depth: number): number {
    const v = Math.min(s.def.upper, Math.max(s.def.lower, value));
    s.value = v;
    const d = v - s.ref;
    if (s.def.type === 'prismatic') {
      s.node.position.copy(s.restP).add(_v.copy(s.def.axis).applyQuaternion(s.restQ).multiplyScalar(d));
    } else {
      s.node.quaternion.copy(s.restQ).multiply(_q.setFromAxisAngle(s.def.axis, d));
    }
    if (depth < 8) for (const f of s.followers) this.apply(f, v * f.def.mimic!.multiplier + f.def.mimic!.offset, depth + 1);
    return v;
  }

  getJoint(name: string): number {
    return this.state.get(name)?.value ?? NaN;
  }

  /** Several joints at once; joints not named keep their value. */
  setPose(values: Readonly<Record<string, number>>): void {
    for (const k in values) this.setJoint(k, values[k]);
  }

  /** All joint values (incl. mimic followers). */
  getPose(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, s] of this.state) out[k] = s.value;
    return out;
  }

  /** Back to the model's default pose (MJCF keyframe or all joints at their reference). */
  resetPose(): void {
    for (const s of this.state.values()) this.apply(s, s.ref, 0);
    this.setPose(this.info.defaultPose);
  }

  /** 0…1 within the limits (sliders, teach-in); NaN for unlimited joints. */
  setJointNormalized(name: string, t: number): number {
    const s = this.state.get(name);
    if (!s || !Number.isFinite(s.def.lower) || !Number.isFinite(s.def.upper)) return NaN;
    return this.setJoint(name, s.def.lower + (s.def.upper - s.def.lower) * THREE.MathUtils.clamp(t, 0, 1));
  }

  // ── forward kinematics ──────────────────────────────────────────────────

  hasLink(link: string): boolean {
    return this.linkNodes.has(link);
  }

  /** World matrix of a link frame (also MJCF sites and fixed frames such as tool flanges). */
  getLinkWorldMatrix(link: string, out = new THREE.Matrix4()): THREE.Matrix4 | null {
    const n = this.linkNodes.get(link);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    return out.copy(n.matrixWorld);
  }

  getLinkWorldPosition(link: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const n = this.linkNodes.get(link);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(n.matrixWorld);
  }

  /** Carry an object with a link (a crate in the gripper); the object keeps its world pose at attach time. */
  attach(link: string, obj: THREE.Object3D): boolean {
    const n = this.linkNodes.get(link);
    if (!n) return false;
    n.updateWorldMatrix(true, false);
    n.attach(obj);
    return true;
  }

  // ── inverse kinematics ──────────────────────────────────────────────────

  /**
   * Move an arm's tip to a world point: `chain` is the name of one of the model's IK chains
   * (manifest `ik`, e.g. 'arm') or an explicit { joints, tip }.
   */
  solveIK(chain: string | { joints: readonly string[]; tip: string }, target: THREE.Vector3, o?: RobotIkOptions): RobotIkResult {
    const c = typeof chain === 'string' ? this.info.ik.find((k) => k.name === chain) : chain;
    if (!c) return { error: Infinity, iterations: 0, reached: false };
    return solveCcd(this, c.joints, c.tip, target, o);
  }

  jointNode(name: string): THREE.Object3D | null {
    return this.state.get(name)?.node ?? null;
  }
  jointAxis(name: string): THREE.Vector3 | null {
    return this.state.get(name)?.def.axis ?? null;
  }
  jointType(name: string): RobotJoint['type'] | null {
    return this.state.get(name)?.def.type ?? null;
  }
  linkNode(name: string): THREE.Object3D | null {
    return this.linkNodes.get(name) ?? null;
  }

  // ── LOD ─────────────────────────────────────────────────────────────────

  get lod(): RobotLod {
    return this.lodMode;
  }
  set lod(mode: RobotLod) {
    this.lodMode = mode;
    if (mode !== 'auto') this.show(mode);
  }

  /** The LOD on screen now. */
  get shownLod(): 0 | 1 | 2 | 'silhouette' {
    return this.shown;
  }

  /**
   * One distance check per robot per frame (call from update with the render camera). The switch
   * distances come from the simplification error (half a pixel at 720 p / 60°) and scale with the
   * real viewport height and field of view; 10 % hysteresis.
   */
  updateLod(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    if (this.lodMode !== 'auto' || this.disposed) return;
    const k = (viewportHeightPx / 720) * (DEG30 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const b = this.info.bounds;
    this.object.updateWorldMatrix(true, false);
    const d = camera.getWorldPosition(_v).distanceTo(_c.set(b.center[0], b.center[1], b.center[2]).applyMatrix4(this.object.matrixWorld));
    const h = (lod: 0 | 1 | 2 | 'silhouette'): number => (this.shown === lod ? 0.9 : 1);
    const L = this.info.lod;
    let want: 0 | 1 | 2 | 'silhouette' = 0;
    if (this.parts.silhouette && d * h('silhouette') > L.silhouette.switchM * k) want = 'silhouette';
    else if (this.parts.lod2 && L.lod2 && d * h(2) > L.lod2.switchM * k) want = 2;
    else if (this.parts.lod1 && d * h(1) > L.lod1.switchM * k) want = 1;
    if (want !== this.shown) this.show(want);
  }

  private show(lod: 0 | 1 | 2 | 'silhouette'): void {
    if (lod === 'silhouette' && !this.parts.silhouette) lod = this.parts.lod2 ? 2 : 1;
    if (lod === 2 && !this.parts.lod2) lod = 1;
    if (lod === 1 && !this.parts.lod1) lod = 0;
    this.shown = lod;
    const { mesh, silhouette } = this.parts;
    mesh.visible = lod !== 'silhouette';
    if (silhouette) silhouette.visible = lod === 'silhouette';
    mesh.geometry = lod === 2 ? this.parts.lod2! : lod === 1 ? this.parts.lod1! : this.parts.lod0;
  }

  /** Triangles drawn now (debug overlays). */
  get triangles(): number {
    const g = this.shown === 'silhouette' ? this.parts.silhouette?.geometry : this.parts.mesh.geometry;
    return g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;
  }

  set castShadow(on: boolean) {
    this.parts.mesh.castShadow = on;
    if (this.parts.silhouette) this.parts.silhouette.castShadow = on;
  }

  /** Remove from the scene and free this instance (the shared geometry stays with the library). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.parts.mesh.skeleton.dispose();
    this.parts.onDispose();
  }
}
