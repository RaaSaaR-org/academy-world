/**
 * EMI Rover v1 — procedural model + behaviour kit (GDD §2, §5.8).
 * Dimensions from EmAI's EMI design parameters, params.py (mm → m): floor→port 0.83, port→shoulder
 * 0.45, shoulder→top 0.27 (HEIGHT 1.55), shoulder half-spacing 0.192, upper arm 0.30,
 * forearm 0.26, hand 0.12, head 0.15×0.21×0.17, wheels Ø0.20×0.06, base 0.44×0.42×0.26.
 * CMF: shell #E7E5E4, chassis #292929, structure #141414, visor #0C0A09, teal eyes,
 * orange ONLY as joint-cap rings („Orange heißt bei mir: das dreht sich.").
 * Front = local +Z, up = +Y. Joint names follow the URDF (waist_yaw, neck_yaw, …).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toVec3, type Text, type Vec3Input } from '../types';

export type EmiGesture = 'point' | 'nod' | 'shrug' | 'wave' | 'show-joints';

export const EMI_JOINTS = [
  'waist_yaw',
  'neck_yaw',
  'neck_pitch',
  ...(['l', 'r'] as const).flatMap((s) => ['shoulder_pitch', 'shoulder_roll', 'shoulder_yaw', 'elbow', 'wrist_roll', 'wrist_pitch', 'wrist_yaw'].map((j) => `${j}_${s}`)),
] as const;

const C = {
  shell: new THREE.Color(0xe7e5e4),
  shadow: new THREE.Color(0xa8a29e),
  chassis: new THREE.Color(0x292929),
  structure: new THREE.Color(0x141414),
  carbon: new THREE.Color(0x1f1f1f),
};

interface Mats {
  body: THREE.MeshStandardMaterial;
  ring: THREE.MeshStandardMaterial;
  ringLit: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  eyes: THREE.MeshStandardMaterial;
  mark: THREE.MeshStandardMaterial;
}

let shared: Mats | null = null;
function mats(): Mats {
  if (!shared) {
    shared = {
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, name: 'core:emi-body' }),
      ring: new THREE.MeshStandardMaterial({ color: 0xff6700, roughness: 0.45, metalness: 0.1, name: 'core:emi-ring' }),
      ringLit: new THREE.MeshStandardMaterial({ color: 0xff6700, emissive: 0xff6700, emissiveIntensity: 2.2, roughness: 0.4, name: 'core:emi-ring-lit' }),
      visor: new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.12, metalness: 0.4, name: 'core:emi-visor' }),
      eyes: new THREE.MeshStandardMaterial({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 2.4, roughness: 0.3, name: 'core:emi-eyes' }),
      mark: new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.7, name: 'core:emi-mark' }),
    };
  }
  return shared;
}

/** paint a geometry with a vertex colour and place it */
function part(geo: THREE.BufferGeometry, color: THREE.Color, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (m) g.applyMatrix4(m);
  const n = g.getAttribute('position').count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return g;
}

const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

function mergedMesh(parts: THREE.BufferGeometry[], material: THREE.Material, name: string): THREE.Mesh {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(g, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function ring(r: number, axis: 'x' | 'y' | 'z', m: Mats): THREE.Mesh {
  const geo = new THREE.TorusGeometry(r, 0.006, 6, 28);
  if (axis === 'x') geo.rotateY(Math.PI / 2);
  else if (axis === 'y') geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m.ring);
  mesh.name = 'emi-ring';
  mesh.userData.emiRing = true;
  return mesh;
}

export interface EmiModel {
  root: THREE.Group;
  joints: Record<string, THREE.Object3D>;
  wheels: THREE.Object3D[];
  rings: THREE.Mesh[];
  /** far LOD: one merged mesh in the rest pose (1 draw call, no shadow), shown beyond ≈ 30 m */
  far: THREE.Mesh;
  /** the detailed children of root (hidden while far) */
  detail: THREE.Object3D[];
}

/** Build the EMI Rover model (≈ 21 draw calls, ≈ 9k triangles). */
export function buildEmiModel(): EmiModel {
  const m = mats();
  const root = new THREE.Group();
  root.name = 'emi';
  const joints: Record<string, THREE.Object3D> = {};
  const rings: THREE.Mesh[] = [];
  const pivot = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    joints[name] = o;
    return o;
  };
  const addRing = (parent: THREE.Object3D, r: number, axis: 'x' | 'y' | 'z', x = 0, y = 0, z = 0): void => {
    const rr = ring(r, axis, m);
    rr.position.set(x, y, z);
    parent.add(rr);
    rings.push(rr);
  };

  // ── wheeled base (floor → port 0.83) ─────────────────────────────────────
  const base = mergedMesh(
    [
      part(new RoundedBoxGeometry(0.42, 0.26, 0.44, 3, 0.05), C.chassis, T(0, 0.19, 0)),
      part(new RoundedBoxGeometry(0.36, 0.05, 0.38, 2, 0.02), C.shell, T(0, 0.33, 0)),
      part(new THREE.CylinderGeometry(0.075, 0.1, 0.42, 20), C.chassis, T(0, 0.55, 0)),
      part(new THREE.CylinderGeometry(0.1, 0.105, 0.08, 24), C.structure, T(0, 0.79, 0)),
      part(new THREE.SphereGeometry(0.04, 10, 8), C.structure, T(0, 0.04, -0.17)),
    ],
    m.body,
    'emi-base',
  );
  root.add(base);
  const wheels: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const w = mergedMesh(
      [part(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 24), C.structure, T(0, 0, 0, 0, 0, Math.PI / 2)), part(new THREE.CylinderGeometry(0.05, 0.05, 0.065, 16), C.chassis, T(0, 0, 0, 0, 0, Math.PI / 2))],
      m.body,
      'emi-wheel',
    );
    w.position.set(side * 0.245, 0.1, 0.04);
    root.add(w);
    wheels.push(w);
    addRing(w, 0.052, 'x', side * 0.034, 0, 0);
  }

  // ── torso on waist_yaw at the port (0.83) ────────────────────────────────
  const waist = pivot('waist_yaw', root, 0, 0.83, 0);
  addRing(waist, 0.108, 'y', 0, 0.002, 0);
  waist.add(
    mergedMesh(
      [
        part(new RoundedBoxGeometry(0.23, 0.22, 0.18, 3, 0.045), C.shell, T(0, 0.11, 0)),
        part(new RoundedBoxGeometry(0.286, 0.25, 0.21, 3, 0.06), C.shell, T(0, 0.33, 0)),
        part(new RoundedBoxGeometry(0.2, 0.06, 0.16, 2, 0.02), C.shadow, T(0, 0.215, 0)),
        part(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 14), C.chassis, T(0, 0.48, 0)),
        // shoulder deck
        part(new RoundedBoxGeometry(0.33, 0.06, 0.16, 2, 0.025), C.chassis, T(0, 0.43, 0)),
      ],
      m.body,
      'emi-torso',
    ),
  );
  // chest mark hint (debossed circle in shell shadow colour, not orange)
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.034, 32), m.mark);
  mark.position.set(0, 0.36, 0.1055);
  waist.add(mark);

  // ── head: neck_yaw → neck_pitch ─────────────────────────────────────────
  const neckYaw = pivot('neck_yaw', waist, 0, 0.45, 0);
  addRing(neckYaw, 0.042, 'y', 0, 0.035, 0);
  const neckPitch = pivot('neck_pitch', neckYaw, 0, 0.06, 0);
  neckPitch.add(
    mergedMesh(
      [part(new RoundedBoxGeometry(0.15, 0.21, 0.17, 4, 0.06), C.shell, T(0, 0.105, 0)), part(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12), C.chassis, T(0, 0.09, 0, 0, 0, Math.PI / 2))],
      m.body,
      'emi-head',
    ),
  );
  const visor = new THREE.Mesh(new RoundedBoxGeometry(0.156, 0.06, 0.176, 3, 0.025), m.visor);
  visor.position.set(0, 0.12, 0.003);
  visor.name = 'emi-visor';
  neckPitch.add(visor);
  const eyeGeo = mergeGeometries([new THREE.BoxGeometry(0.036, 0.009, 0.004).applyMatrix4(T(-0.032, 0.123, 0.0915, 0, 0, 0.12)), new THREE.BoxGeometry(0.036, 0.009, 0.004).applyMatrix4(T(0.032, 0.123, 0.0915, 0, 0, -0.12))])!;
  const eyes = new THREE.Mesh(eyeGeo, m.eyes);
  eyes.name = 'emi-eyes';
  neckPitch.add(eyes);

  // ── arms (S-R-S, 7 DOF) ───────────────────────────────────────────────────
  for (const [s, side] of [
    ['l', 1],
    ['r', -1],
  ] as const) {
    const sp = pivot(`shoulder_pitch_${s}`, waist, side * 0.192, 0.42, 0);
    addRing(sp, 0.05, 'x', side * -0.005, 0, 0);
    const sr = pivot(`shoulder_roll_${s}`, sp, 0, 0, 0);
    const sy = pivot(`shoulder_yaw_${s}`, sr, 0, 0, 0);
    sy.add(
      mergedMesh(
        [part(new THREE.SphereGeometry(0.055, 16, 12), C.chassis, T(0, 0, 0)), part(new THREE.CapsuleGeometry(0.045, 0.2, 4, 12), C.shell, T(0, -0.15, 0))],
        m.body,
        `emi-upperarm-${s}`,
      ),
    );
    const el = pivot(`elbow_${s}`, sy, 0, -0.3, 0);
    addRing(el, 0.043, 'x', side * 0.042, 0, 0);
    el.add(
      mergedMesh([part(new THREE.CylinderGeometry(0.042, 0.042, 0.08, 16), C.chassis, T(0, 0, 0, 0, 0, Math.PI / 2)), part(new THREE.CapsuleGeometry(0.038, 0.17, 4, 12), C.shell, T(0, -0.13, 0))], m.body, `emi-forearm-${s}`),
    );
    const wr = pivot(`wrist_roll_${s}`, el, 0, -0.26, 0);
    addRing(wr, 0.032, 'y', 0, 0.012, 0);
    const wp = pivot(`wrist_pitch_${s}`, wr, 0, 0, 0);
    const wy = pivot(`wrist_yaw_${s}`, wp, 0, 0, 0);
    wy.add(
      mergedMesh(
        [
          part(new THREE.SphereGeometry(0.032, 12, 10), C.chassis, T(0, 0, 0)),
          part(new RoundedBoxGeometry(0.07, 0.07, 0.035, 2, 0.012), C.carbon, T(0, -0.05, 0)),
          part(new RoundedBoxGeometry(0.018, 0.06, 0.03, 1, 0.006), C.chassis, T(0.022, -0.105, 0)),
          part(new RoundedBoxGeometry(0.018, 0.06, 0.03, 1, 0.006), C.chassis, T(-0.022, -0.105, 0)),
        ],
        m.body,
        `emi-hand-${s}`,
      ),
    );
    // rest pose: arms slightly forward, elbows bent
    sp.rotation.x = -0.12;
    sr.rotation.z = side * 0.06;
    el.rotation.x = -0.35;
  }
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.emiRing) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  const detail = [...root.children];
  // far LOD (ART-V2 §5.6): the silhouette in the rest pose, one vertex-coloured mesh, ≈ 1.5k triangles
  const far = mergedMesh(
    [
      part(new THREE.BoxGeometry(0.42, 0.26, 0.44), C.chassis, T(0, 0.19, 0)),
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), C.structure, T(0.245, 0.1, 0.04, 0, 0, Math.PI / 2)),
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), C.structure, T(-0.245, 0.1, 0.04, 0, 0, Math.PI / 2)),
      part(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), C.chassis, T(0, 0.58, 0)),
      part(new THREE.BoxGeometry(0.23, 0.22, 0.18), C.shell, T(0, 0.94, 0)),
      part(new THREE.BoxGeometry(0.29, 0.25, 0.21), C.shell, T(0, 1.16, 0)),
      part(new THREE.BoxGeometry(0.33, 0.06, 0.16), C.chassis, T(0, 1.26, 0)),
      part(new THREE.BoxGeometry(0.15, 0.21, 0.17), C.shell, T(0, 1.445, 0)),
      part(new THREE.BoxGeometry(0.156, 0.06, 0.176), C.structure, T(0, 1.46, 0.003)),
      part(new THREE.CapsuleGeometry(0.045, 0.48, 2, 6), C.shell, T(0.2, 1.0, 0.04, -0.2, 0, 0.06)),
      part(new THREE.CapsuleGeometry(0.045, 0.48, 2, 6), C.shell, T(-0.2, 1.0, 0.04, -0.2, 0, -0.06)),
    ],
    m.body,
    'emi-far',
  );
  far.castShadow = false;
  far.visible = false;
  root.add(far);
  return { root, joints, wheels, rings, far, detail };
}

// ── behaviour ─────────────────────────────────────────────────────────────────

/** axis of each joint (rotation property used) */
function axisOf(name: string): 'x' | 'y' | 'z' {
  if (name === 'waist_yaw' || name === 'neck_yaw' || name.startsWith('shoulder_yaw') || name.startsWith('wrist_roll')) return 'y';
  if (name.startsWith('shoulder_roll') || name.startsWith('wrist_yaw')) return 'z';
  return 'x';
}

export interface EmiHandle {
  readonly unit: string;
  readonly object: THREE.Group;
  readonly joints: Readonly<Record<string, THREE.Object3D>>;
  /** Set a joint angle (radians) by URDF name; overrides idle/gesture for that joint. */
  setJoint(name: string, rad: number): void;
  /** Release a joint back to idle/gesture control. */
  releaseJoint(name: string): void;
  /** Head looks at a WORLD position (max 2 rad/s); null = track the player within 8 m. */
  lookAt(world: THREE.Vector3 | null): void;
  gesture(name: EmiGesture): Promise<void>;
  /** Diff-drive to a position in the OWNER'S local frame ([x, y, z] or {x, y, z}; y is ignored): rotate in place, then straight at 1.2 m/s. */
  driveTo(local: Vec3Input, o?: { speed?: number }): Promise<void>;
  /**
   * Subtitle + 3-note chirp. Lines ≤ 18 words, 4–6 s.
   * `interrupt: true` replaces whatever is being said (event reactions, H answers) instead of queueing.
   */
  say(lines: Text | Text[], o?: { durationS?: number; manual?: boolean; interrupt?: boolean }): Promise<void>;
  highlightJoints(on: boolean): void;
  setVisible(v: boolean): void;
  /** Called when the player presses H near this EMI (help key). */
  onAsk(fn: () => void): () => void;
  dispose(): void;
}

export interface EmiEnv {
  say(speaker: string, lines: Text[], durationS: number | undefined, manual: boolean, interrupt?: boolean): Promise<void>;
  chirp(unitIndex: number, at: THREE.Vector3): void;
  playerEye(out: THREE.Vector3): THREE.Vector3;
  reducedMotion(): boolean;
}

interface Keyframe {
  t: number;
  pose: Record<string, number>;
}

const GESTURES: Record<Exclude<EmiGesture, 'show-joints'>, Keyframe[]> = {
  nod: [
    { t: 0, pose: {} },
    { t: 0.25, pose: { neck_pitch: 0.28 } },
    { t: 0.5, pose: { neck_pitch: -0.04 } },
    { t: 0.75, pose: { neck_pitch: 0.22 } },
    { t: 1.05, pose: {} },
  ],
  wave: [
    { t: 0, pose: {} },
    { t: 0.45, pose: { shoulder_pitch_r: -2.5, shoulder_roll_r: -0.35, elbow_r: -0.7 } },
    { t: 0.75, pose: { shoulder_pitch_r: -2.5, shoulder_roll_r: -0.35, elbow_r: -0.7, wrist_roll_r: 0.6 } },
    { t: 1.05, pose: { shoulder_pitch_r: -2.5, shoulder_roll_r: -0.35, elbow_r: -0.7, wrist_roll_r: -0.6 } },
    { t: 1.35, pose: { shoulder_pitch_r: -2.5, shoulder_roll_r: -0.35, elbow_r: -0.7, wrist_roll_r: 0.6 } },
    { t: 1.65, pose: { shoulder_pitch_r: -2.5, shoulder_roll_r: -0.35, elbow_r: -0.7, wrist_roll_r: 0 } },
    { t: 2.2, pose: {} },
  ],
  point: [
    { t: 0, pose: {} },
    { t: 0.5, pose: { shoulder_pitch_r: -1.45, elbow_r: -0.08, wrist_pitch_r: 0.1 } },
    { t: 1.8, pose: { shoulder_pitch_r: -1.45, elbow_r: -0.08, wrist_pitch_r: 0.1 } },
    { t: 2.3, pose: {} },
  ],
  shrug: [
    { t: 0, pose: {} },
    { t: 0.35, pose: { shoulder_roll_l: 0.28, shoulder_roll_r: -0.28, elbow_l: -1.25, elbow_r: -1.25, wrist_roll_l: 0.8, wrist_roll_r: -0.8, neck_pitch: 0.12 } },
    { t: 0.9, pose: { shoulder_roll_l: 0.28, shoulder_roll_r: -0.28, elbow_l: -1.25, elbow_r: -1.25, wrist_roll_l: 0.8, wrist_roll_r: -0.8, neck_pitch: 0.12 } },
    { t: 1.3, pose: {} },
  ],
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** One EMI instance. Driven by EmiSystem.update(). */
export class EmiUnit implements EmiHandle {
  readonly object: THREE.Group;
  readonly joints: Record<string, THREE.Object3D>;
  private model: EmiModel;
  private rest = new Map<string, number>();
  private overrides = new Map<string, number>();
  private gestureState: { frames: Keyframe[]; t: number; resolve: () => void } | null = null;
  private showJoints: { i: number; t: number; resolve: () => void } | null = null;
  private lookTarget: THREE.Vector3 | null = null;
  private headYaw = 0;
  private headPitch = 0;
  private drive: { target: THREE.Vector3; speed: number; resolve: () => void } | null = null;
  private time = Math.random() * 10;
  private askHandlers = new Set<() => void>();
  disposed = false;

  constructor(
    readonly unit: string,
    readonly unitIndex: number,
    readonly owner: string,
    private env: EmiEnv,
  ) {
    this.model = buildEmiModel();
    this.object = this.model.root;
    this.object.name = `emi:${unit}`;
    this.joints = this.model.joints;
    for (const [name, o] of Object.entries(this.joints)) this.rest.set(name, o.rotation[axisOf(name)]);
  }

  setJoint(name: string, rad: number): void {
    if (this.joints[name]) this.overrides.set(name, rad);
  }
  releaseJoint(name: string): void {
    this.overrides.delete(name);
  }
  lookAt(world: THREE.Vector3 | null): void {
    this.lookTarget = world ? world.clone() : null;
  }
  gesture(name: EmiGesture): Promise<void> {
    this.gestureState?.resolve();
    this.showJoints?.resolve();
    this.gestureState = null;
    this.showJoints = null;
    if (this.env.reducedMotion() && name !== 'nod') return Promise.resolve();
    return new Promise((resolve) => {
      if (name === 'show-joints') this.showJoints = { i: 0, t: 0, resolve };
      else this.gestureState = { frames: GESTURES[name], t: 0, resolve };
    });
  }
  driveTo(local: Vec3Input, o: { speed?: number } = {}): Promise<void> {
    this.drive?.resolve();
    const p = toVec3(local);
    return new Promise((resolve) => {
      this.drive = { target: new THREE.Vector3(p.x, this.object.position.y, p.z), speed: o.speed ?? 1.2, resolve };
    });
  }
  say(lines: Text | Text[], o: { durationS?: number; manual?: boolean; interrupt?: boolean } = {}): Promise<void> {
    const arr = Array.isArray(lines) ? lines : [lines];
    this.env.chirp(this.unitIndex, this.object.getWorldPosition(_v));
    return this.env.say(`${this.unit} ›`, arr, o.durationS, !!o.manual, !!o.interrupt);
  }
  highlightJoints(on: boolean): void {
    const m = mats();
    for (const r of this.model.rings) r.material = on ? m.ringLit : m.ring;
  }
  setVisible(v: boolean): void {
    this.object.visible = v;
  }
  /** far LOD on/off (EmiSystem, by camera distance with hysteresis) */
  get isFar(): boolean {
    return this.model.far.visible;
  }
  setFar(far: boolean): void {
    if (this.model.far.visible === far) return;
    this.model.far.visible = far;
    for (const o of this.model.detail) o.visible = !far;
  }
  onAsk(fn: () => void): () => void {
    this.askHandlers.add(fn);
    return () => this.askHandlers.delete(fn);
  }
  ask(): boolean {
    if (!this.askHandlers.size) return false;
    for (const fn of this.askHandlers) {
      try {
        fn();
      } catch (err) {
        console.error(`[emi ${this.unit}] onAsk threw`, err);
      }
    }
    return true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gestureState?.resolve();
    this.showJoints?.resolve();
    this.drive?.resolve();
    this.object.removeFromParent();
    this.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }

  update(dt: number): void {
    if (this.disposed || !this.object.parent) return;
    this.time += dt;
    const pose: Record<string, number> = {};
    // idle: subtle torso sway ±0.5°
    const reduced = this.env.reducedMotion();
    this.object.rotation.z = reduced ? 0 : Math.sin(this.time * 0.8) * THREE.MathUtils.degToRad(0.5);

    // gestures
    if (this.gestureState) {
      const g = this.gestureState;
      g.t += dt;
      const fr = g.frames;
      const end = fr[fr.length - 1].t;
      let i = 0;
      while (i < fr.length - 2 && g.t > fr[i + 1].t) i++;
      const a = fr[i],
        b = fr[i + 1];
      const k = THREE.MathUtils.smoothstep(Math.min(1, (g.t - a.t) / Math.max(1e-3, b.t - a.t)), 0, 1);
      const names = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]);
      for (const n of names) pose[n] = THREE.MathUtils.lerp(a.pose[n] ?? this.rest.get(n) ?? 0, b.pose[n] ?? this.rest.get(n) ?? 0, k);
      if (g.t >= end) {
        this.gestureState = null;
        g.resolve();
      }
    }
    if (this.showJoints) {
      const s = this.showJoints;
      s.t += dt;
      const name = EMI_JOINTS[s.i];
      pose[name] = (this.rest.get(name) ?? 0) + Math.sin((s.t / 0.45) * Math.PI) * 0.35;
      const ring = this.ringFor(name);
      if (ring) ring.material = mats().ringLit;
      if (s.t >= 0.45) {
        if (ring) ring.material = mats().ring;
        s.t = 0;
        s.i++;
        if (s.i >= EMI_JOINTS.length) {
          this.showJoints = null;
          s.resolve();
        }
      }
    }

    // head tracking (target or player within 8 m), max 2 rad/s
    const head = this.joints.neck_pitch;
    let wantYaw = 0,
      wantPitch = 0;
    const target = this.lookTarget ?? this.env.playerEye(_w);
    head.getWorldPosition(_v);
    const dist = _v.distanceTo(target);
    if (this.lookTarget || dist < 8) {
      // into the waist frame
      const waist = this.joints.waist_yaw;
      waist.updateWorldMatrix(true, false);
      const local = _w.copy(target).applyMatrix4(_m.copy(waist.matrixWorld).invert());
      local.y -= 0.51;
      wantYaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.3, 1.3);
      wantPitch = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.5, 0.45);
    }
    const maxStep = 2 * dt;
    this.headYaw += THREE.MathUtils.clamp(wantYaw - this.headYaw, -maxStep, maxStep);
    this.headPitch += THREE.MathUtils.clamp(wantPitch - this.headPitch, -maxStep, maxStep);
    if (pose.neck_yaw === undefined) pose.neck_yaw = this.headYaw;
    if (pose.neck_pitch === undefined) pose.neck_pitch = this.headPitch;

    // drive (diff-drive: rotate in place, then straight)
    if (this.drive) {
      const d = this.drive;
      const o = this.object;
      const dx = d.target.x - o.position.x,
        dz = d.target.z - o.position.z;
      const dist2 = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dy = want - o.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      let wheelL = 0,
        wheelR = 0;
      if (dist2 < 0.03) {
        this.drive = null;
        d.resolve();
      } else if (Math.abs(dy) > 0.04) {
        const step = Math.sign(dy) * Math.min(Math.abs(dy), 1.6 * dt);
        o.rotation.y += step;
        wheelL = -step * 2.4;
        wheelR = step * 2.4;
      } else {
        const step = Math.min(dist2, d.speed * dt);
        o.position.x += (dx / dist2) * step;
        o.position.z += (dz / dist2) * step;
        wheelL = wheelR = step / 0.1;
      }
      this.model.wheels[0].rotation.x += wheelL;
      this.model.wheels[1].rotation.x += wheelR;
    }

    // apply: rest → pose → overrides
    for (const [name, o] of Object.entries(this.joints)) {
      const ax = axisOf(name);
      const v = this.overrides.get(name) ?? pose[name] ?? this.rest.get(name) ?? 0;
      o.rotation[ax] = v;
    }
  }

  private ringFor(name: string): THREE.Mesh | undefined {
    const j = this.joints[name];
    if (!j) return undefined;
    return j.children.find((c) => (c as THREE.Mesh).userData?.emiRing) as THREE.Mesh | undefined;
  }

  /** world position (for H-key proximity) */
  worldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.object.getWorldPosition(out);
  }
}

/** Unit index from a name like 'EMI-03' (01 = hub). */
export function emiUnitIndex(unit: string): number {
  const m = /(\d+)\s*$/.exec(unit);
  return m ? Math.max(1, Number(m[1])) : 1;
}

