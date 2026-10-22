/**
 * The Trainingsfeld and the Teststrecke of „Lauf, Ente!" (plan §4.3): 64 real Open Duck Mini v2 at
 * the articulated LOD2 (one InstancedMesh per body, ≈ 17 draws; R2 §4.2), their 8 × 8 tiles tinted by
 * each duck's floor friction (one draw), three extra lane ducks of the test track in the same
 * InstancedMeshes, and the hero at LOD0 (one skinned draw) driven from MuJoCo poses.
 *
 * Poses come from the worker (or the recordings) in MuJoCo's world: z up, the duck walking along +x.
 * C maps them into the robot GLB's frame (its root node turns x → z, y → x, z → y), so a body's
 * instance matrix is base × C × [R(q) | p] with base = the tile (or lane) in the field's frame.
 * Main-thread cost: one lerp + nlerp + compose per instance (64 × 17 ≈ 0.05 ms, R2 §7.2).
 */
import * as THREE from 'three';
import type { RobotBody, RobotModel, ZoneContext } from '@/core/zones';
import { ACTUATORS, NACT, POSE_STRIDE, POS_SCALE, QUAT_SCALE } from './core';

export const FIELD = {
  /** zone-local far corner of the field (x) and its centre line (z); the plinth top */
  x0: -17,
  zc: 4,
  top: 0.3,
  rows: 8,
  cols: 8,
  /** tile size along the walk (zone x) and across (zone z) */
  tileL: 1.0,
  tileW: 0.8,
  /** a duck starts this far in from its tile's back edge */
  startIn: 0.12,
  ducks: 64,
} as const;

/** The Teststrecke: along zone +x, on a 1 m plinth, four lanes of 0.2 m (zone-local). */
export const TRACK_LAYOUT = {
  x0: -8.2,
  length: 1.2,
  zc: 2.0,
  laneW: 0.2,
  lanes: 4,
  top: 1.0,
} as const;

const LANE_EXTRA = TRACK_LAYOUT.lanes - 1;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _sc = new THREE.Vector3();

/** Tint of a tile by friction 0.3…1.0: one hue, stone-900 → muted teal (the Weltenwand's scale). */
export function frictionTint(f: number, out: THREE.Color): THREE.Color {
  const k = THREE.MathUtils.clamp((f - 0.3) / 0.7, 0, 1);
  return out.setRGB((28 + (24 - 28) * k) / 255, (25 + (82 - 25) * k) / 255, (23 + (76 - 23) * k) / 255, THREE.SRGBColorSpace);
}

export interface Replay {
  rec: Int16Array;
  samples: number;
  /** links per duck-sample in rec */
  links: number;
  /** ducks in rec (64, or the number of test runs) */
  ducks: number;
  /** fall time per duck (s), −1 = stands */
  fallT: Float32Array;
  rate: number;
}

export interface FieldHandle {
  readonly root: THREE.Group;
  readonly ready: boolean;
  /** build the instanced bodies (LOD2) once ctx.robots.bodies() resolved; `order` = the recorded link order */
  setBodies(bodies: readonly RobotBody[], order: readonly string[]): void;
  /** tiles by friction (null: the one nominal world) */
  tint(friction: ArrayLike<number> | null, fallen?: ArrayLike<boolean>): void;
  /** mark one tile (slow motion, sticker) or none */
  highlight(i: number | null): void;
  /** show a generation at replay time t (s) */
  pose(r: Replay, t: number): void;
  /** every duck back to the standing pose */
  stand(): void;
  /** lane ducks 2–4 (lane 0 is the hero) at time t of runs k0…k0+2 of a test replay; null hides them */
  lanes(r: Replay | null, run0: number, t: number): void;
  /** hero: place from a Float32 stream frame (link poses + qpos) or from a recorded Int16 run + its qpos */
  heroFrame(pose: Float32Array): void;
  heroRecorded(r: Replay, qpos: Float32Array | null, run: number, t: number): void;
  heroStand(): void;
  setHero(model: RobotModel | null): void;
  readonly hero: RobotModel | null;
  /** world position of the hero's trunk (push proxy, labels) in zone-local coordinates */
  heroTrunk(out: THREE.Vector3): THREE.Vector3;
  /** map a zone-local force onto MuJoCo's world axes (the hero's push) */
  toMujoco(v: THREE.Vector3): [number, number, number];
  /** the camera-facing centre of tile i (zone-local) */
  tileCenter(i: number, out: THREE.Vector3): THREE.Vector3;
  update(): void;
  dispose(): void;
}

/** MuJoCo home keyframe of duck/model.xml (tools/duck/model.mjs): trunk height and the 14 joints. */
export const HOME_QPOS = [0, 0, 0.16194, 1, 0, 0, 0, 0, 0, -0.74, 1.35, -0.61, 0, 0, 0, 0, 0, 0, 0.74, 1.35, -0.61] as const;

/** C: MuJoCo world → the GLB root frame (x → z, y → x, z → y). */
const C = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);

export function buildField(ctx: ZoneContext, o: { tileMaterial: THREE.Material; paint: THREE.Material }): FieldHandle {
  const det = ctx.groups.detail;
  const root = new THREE.Group();
  root.name = 'regelgarten:duck-field';
  // field frame: +z (the walk) → zone +x, +x → zone −z
  root.position.set(FIELD.x0, FIELD.top, FIELD.zc);
  root.rotation.y = Math.PI / 2;
  root.userData.noMerge = true;
  det.add(root);
  root.updateMatrixWorld(true);

  // ── tiles: one instanced draw, tint = friction ──────────────────────────────
  const tileGeo = new THREE.BoxGeometry(FIELD.tileW - 0.04, 0.02, FIELD.tileL - 0.04);
  const tiles = new THREE.InstancedMesh(tileGeo, o.tileMaterial, FIELD.ducks);
  tiles.name = 'regelgarten:duck-tiles';
  const cx = (c: number): number => -FIELD.cols * FIELD.tileW * 0.5 + (c + 0.5) * FIELD.tileW;
  const rz = (r: number): number => r * FIELD.tileL;
  for (let i = 0; i < FIELD.ducks; i++) {
    const r = i >> 3,
      c = i & 7;
    tiles.setMatrixAt(i, _m.makeTranslation(cx(c), 0.01, rz(r) + FIELD.tileL / 2));
  }
  tiles.receiveShadow = true;
  root.add(tiles);
  const col = new THREE.Color();
  const tint = (fr: ArrayLike<number> | null, fallen?: ArrayLike<boolean>): void => {
    for (let i = 0; i < FIELD.ducks; i++) {
      frictionTint(fr ? fr[i] : 0.6, col);
      if (fallen?.[i]) col.multiplyScalar(0.55);
      tiles.setColorAt(i, col);
    }
    tiles.instanceColor!.needsUpdate = true;
  };
  tint(null);

  // the highlight ring (orange, the objective colour, ≤ 5 %)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.34, 40).rotateX(-Math.PI / 2), ctx.materials.accentOrange);
  ring.visible = false;
  ring.position.y = 0.025;
  root.add(ring);

  // ── bodies ─────────────────────────────────────────────────────────────────
  /** per instance: base matrix (tile or lane, in the field frame) × C, as 16 floats */
  const COUNT = FIELD.ducks + LANE_EXTRA;
  const bases = new Float32Array(COUNT * 16);
  const baseOf = (i: number, out: THREE.Matrix4): void => {
    if (i < FIELD.ducks) {
      out.makeTranslation(cx(i & 7), 0.02, rz(i >> 3) + FIELD.startIn);
    } else {
      // lane ducks: from the track's lane frame (zone) into the field frame
      const lane = i - FIELD.ducks + 1;
      const zLane = TRACK_LAYOUT.zc + (lane - (TRACK_LAYOUT.lanes - 1) / 2) * TRACK_LAYOUT.laneW;
      const lw = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(TRACK_LAYOUT.x0 + 0.08, TRACK_LAYOUT.top, zLane);
      out.copy(root.matrix).invert().multiply(lw);
    }
    out.multiply(C);
  };
  for (let i = 0; i < COUNT; i++) {
    baseOf(i, _m);
    _m.toArray(bases, i * 16);
  }
  let meshes: { mesh: THREE.InstancedMesh; slot: number }[] = [];
  let ready = false;
  let laneCount = 0;

  const setBodies = (bodies: readonly RobotBody[], linkOrder: readonly string[]): void => {
    for (const m of meshes) {
      m.mesh.removeFromParent();
      m.mesh.dispose();
    }
    meshes = [];
    for (const b of bodies) {
      const slot = linkOrder.indexOf(b.link);
      if (slot < 0) continue;
      const mesh = new THREE.InstancedMesh(b.geometry, o.paint, COUNT);
      mesh.name = `regelgarten:duck-body:${b.link}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // ducks walk across the whole field and onto the track: no per-mesh culling
      mesh.frustumCulled = false;
      mesh.count = FIELD.ducks + laneCount;
      root.add(mesh);
      meshes.push({ mesh, slot });
    }
    order = linkOrder;
    standRec = null;
    ready = meshes.length > 0;
    stand();
  };

  // ── posing ─────────────────────────────────────────────────────────────────
  /** write instance i of every body from interpolated Int16 poses (a = 0…1 between s0 and s1) */
  const writeInstance = (i: number, rec: Int16Array, off0: number, off1: number, a: number): void => {
    const B = bases;
    const bo = i * 16;
    for (const { mesh, slot } of meshes) {
      const o0 = off0 + slot * POSE_STRIDE;
      const o1 = off1 + slot * POSE_STRIDE;
      const px = (rec[o0] + (rec[o1] - rec[o0]) * a) / POS_SCALE;
      const py = (rec[o0 + 1] + (rec[o1 + 1] - rec[o0 + 1]) * a) / POS_SCALE;
      const pz = (rec[o0 + 2] + (rec[o1 + 2] - rec[o0 + 2]) * a) / POS_SCALE;
      let qw0 = rec[o0 + 3],
        qx0 = rec[o0 + 4],
        qy0 = rec[o0 + 5],
        qz0 = rec[o0 + 6];
      const qw1 = rec[o1 + 3],
        qx1 = rec[o1 + 4],
        qy1 = rec[o1 + 5],
        qz1 = rec[o1 + 6];
      if (qw0 * qw1 + qx0 * qx1 + qy0 * qy1 + qz0 * qz1 < 0) {
        qw0 = -qw0;
        qx0 = -qx0;
        qy0 = -qy0;
        qz0 = -qz0;
      }
      let w = qw0 + (qw1 - qw0) * a,
        x = qx0 + (qx1 - qx0) * a,
        y = qy0 + (qy1 - qy0) * a,
        z = qz0 + (qz1 - qz0) * a;
      const n = 1 / (Math.hypot(w, x, y, z) || 1);
      w *= n;
      x *= n;
      y *= n;
      z *= n;
      // R(q) (row-major r_ij)
      const r00 = 1 - 2 * (y * y + z * z),
        r01 = 2 * (x * y - w * z),
        r02 = 2 * (x * z + w * y);
      const r10 = 2 * (x * y + w * z),
        r11 = 1 - 2 * (x * x + z * z),
        r12 = 2 * (y * z - w * x);
      const r20 = 2 * (x * z - w * y),
        r21 = 2 * (y * z + w * x),
        r22 = 1 - 2 * (x * x + y * y);
      // out = base(4×4, column-major in B) × [R | p]
      const e = mesh.instanceMatrix.array as Float32Array;
      const t = i * 16;
      for (let col = 0; col < 3; col++) {
        const c0 = col === 0 ? r00 : col === 1 ? r01 : r02;
        const c1 = col === 0 ? r10 : col === 1 ? r11 : r12;
        const c2 = col === 0 ? r20 : col === 1 ? r21 : r22;
        e[t + col * 4] = B[bo] * c0 + B[bo + 4] * c1 + B[bo + 8] * c2;
        e[t + col * 4 + 1] = B[bo + 1] * c0 + B[bo + 5] * c1 + B[bo + 9] * c2;
        e[t + col * 4 + 2] = B[bo + 2] * c0 + B[bo + 6] * c1 + B[bo + 10] * c2;
        e[t + col * 4 + 3] = 0;
      }
      e[t + 12] = B[bo] * px + B[bo + 4] * py + B[bo + 8] * pz + B[bo + 12];
      e[t + 13] = B[bo + 1] * px + B[bo + 5] * py + B[bo + 9] * pz + B[bo + 13];
      e[t + 14] = B[bo + 2] * px + B[bo + 6] * py + B[bo + 10] * pz + B[bo + 14];
      e[t + 15] = 1;
    }
  };

  const sampleAt = (r: Replay, t: number): [number, number, number] => {
    const f = Math.max(0, Math.min(r.samples - 1.0001, t * r.rate));
    const s0 = f | 0;
    return [s0, Math.min(r.samples - 1, s0 + 1), f - s0];
  };
  let dirty = false;
  const pose = (r: Replay, t: number): void => {
    if (!ready) return;
    const [s0, s1, a] = sampleAt(r, t);
    const per = r.samples * r.links * POSE_STRIDE;
    const n = Math.min(FIELD.ducks, r.ducks);
    for (let i = 0; i < n; i++) writeInstance(i, r.rec, i * per + s0 * r.links * POSE_STRIDE, i * per + s1 * r.links * POSE_STRIDE, a);
    dirty = true;
  };

  // the standing pose: one sample of every link from the hero's forward kinematics at the home
  // keyframe (the GLB's link frames are MuJoCo's body frames), so the field stands before any physics
  let standRec: Int16Array | null = null;
  let order: readonly string[] = [];
  const standPose = (): Int16Array | null => {
    if (standRec || !hero || !order.length) return standRec;
    heroStand();
    heroC.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(heroC.matrixWorld).invert();
    const rec = new Int16Array(order.length * POSE_STRIDE);
    order.forEach((link, k) => {
      const w = hero!.getLinkWorldMatrix(link, _m);
      if (!w) return;
      _m.premultiply(inv).decompose(_p, _q, _sc);
      const o = k * POSE_STRIDE;
      rec[o] = Math.round(_p.x * POS_SCALE);
      rec[o + 1] = Math.round(_p.y * POS_SCALE);
      rec[o + 2] = Math.round(_p.z * POS_SCALE);
      rec[o + 3] = Math.round(_q.w * QUAT_SCALE);
      rec[o + 4] = Math.round(_q.x * QUAT_SCALE);
      rec[o + 5] = Math.round(_q.y * QUAT_SCALE);
      rec[o + 6] = Math.round(_q.z * QUAT_SCALE);
    });
    return (standRec = rec);
  };
  const stand = (): void => {
    const sp = ready ? standPose() : null;
    if (!sp) return;
    for (let i = 0; i < FIELD.ducks; i++) writeInstance(i, sp, 0, 0, 0);
    dirty = true;
  };

  const lanes = (r: Replay | null, run0: number, t: number): void => {
    laneCount = r ? LANE_EXTRA : 0;
    for (const m of meshes) m.mesh.count = FIELD.ducks + laneCount;
    if (!r || !ready) return;
    const [s0, s1, a] = sampleAt(r, t);
    const per = r.samples * r.links * POSE_STRIDE;
    for (let k = 0; k < LANE_EXTRA; k++) {
      const run = run0 + k;
      if (run >= r.ducks) {
        // no run left in this round: park it at the start, standing
        const sp = standPose();
        if (sp) writeInstance(FIELD.ducks + k, sp, 0, 0, 0);
        continue;
      }
      writeInstance(FIELD.ducks + k, r.rec, run * per + s0 * r.links * POSE_STRIDE, run * per + s1 * r.links * POSE_STRIDE, a);
    }
    dirty = true;
  };

  // ── hero (LOD0, skinned) ─────────────────────────────────────────────────────
  const heroBase = new THREE.Group();
  heroBase.name = 'regelgarten:duck-hero';
  heroBase.position.set(TRACK_LAYOUT.x0 + 0.08, TRACK_LAYOUT.top, TRACK_LAYOUT.zc - (1.5 - 0) * TRACK_LAYOUT.laneW);
  heroBase.rotation.y = Math.PI / 2;
  heroBase.userData.noMerge = true;
  det.add(heroBase);
  const heroC = new THREE.Group();
  heroC.matrixAutoUpdate = false;
  heroC.matrix.copy(C);
  heroBase.add(heroC);
  let hero: RobotModel | null = null;
  /** inverse of the trunk link's pose inside the model object at rest */
  const trunkInv = new THREE.Matrix4();
  const setHero = (m: RobotModel | null): void => {
    if (hero) hero.object.removeFromParent();
    hero = m;
    if (!m) return;
    m.object.position.set(0, 0, 0);
    m.object.quaternion.identity();
    m.object.updateMatrixWorld(true);
    const tm = m.getLinkWorldMatrix('trunk_assembly', new THREE.Matrix4());
    if (tm) trunkInv.copy(m.object.matrixWorld).invert().multiply(tm).invert();
    m.object.matrixAutoUpdate = false;
    heroC.add(m.object);
    standRec = null;
    heroStand();
    stand();
  };
  const heroQ = (q: ArrayLike<number>, qo: number): void => {
    if (!hero) return;
    for (let k = 0; k < NACT; k++) hero.setJoint(ACTUATORS[k], q[qo + 7 + k]);
  };
  const placeHero = (px: number, py: number, pz: number, qw: number, qx: number, qy: number, qz: number): void => {
    if (!hero) return;
    _p.set(px, py, pz);
    _q.set(qx, qy, qz, qw).normalize();
    hero.object.matrix.compose(_p, _q, _s).multiply(trunkInv);
    hero.object.matrixWorldNeedsUpdate = true;
  };
  const heroFrame = (f: Float32Array): void => {
    if (!hero) return;
    const L = (f.length - 7 - NACT) / POSE_STRIDE;
    const q = L * POSE_STRIDE;
    placeHero(f[q], f[q + 1], f[q + 2], f[q + 3], f[q + 4], f[q + 5], f[q + 6]);
    heroQ(f, q);
  };
  const heroRecorded = (r: Replay, qpos: Float32Array | null, run: number, t: number): void => {
    if (!hero || !qpos) return;
    const [s0, s1, a] = sampleAt(r, t);
    const Q = 7 + NACT;
    const o0 = (run * r.samples + s0) * Q;
    const o1 = (run * r.samples + s1) * Q;
    const lerp = (k: number): number => qpos[o0 + k] + (qpos[o1 + k] - qpos[o0 + k]) * a;
    placeHero(lerp(0), lerp(1), lerp(2), lerp(3), lerp(4), lerp(5), lerp(6));
    for (let k = 0; k < NACT; k++) hero.setJoint(ACTUATORS[k], lerp(7 + k));
  };
  const heroStand = (): void => {
    if (!hero) return;
    placeHero(HOME_QPOS[0], HOME_QPOS[1], HOME_QPOS[2], HOME_QPOS[3], HOME_QPOS[4], HOME_QPOS[5], HOME_QPOS[6]);
    heroQ(HOME_QPOS, 0);
  };
  const heroTrunk = (out: THREE.Vector3): THREE.Vector3 => {
    if (!hero) return out.set(TRACK_LAYOUT.x0 + 0.1, TRACK_LAYOUT.top + 0.2, TRACK_LAYOUT.zc);
    hero.object.updateMatrixWorld(true);
    const w = hero.getLinkWorldPosition('trunk_assembly', out);
    return ctx.toLocal(w ?? out, out);
  };
  const toMujoco = (v: THREE.Vector3): [number, number, number] => {
    // zone-local → heroBase frame (yaw +90°) → MuJoCo (inverse of C: GLB x → mj y, y → z, z → x)
    _p.copy(v).applyAxisAngle(_yAxis, -heroBase.rotation.y);
    return [_p.z, _p.x, _p.y];
  };

  const tileCenter = (i: number, out: THREE.Vector3): THREE.Vector3 => {
    out.set(cx(i & 7), 0.1, rz(i >> 3) + FIELD.tileL * 0.4);
    return out.applyMatrix4(root.matrix);
  };
  const highlight = (i: number | null): void => {
    ring.visible = i != null;
    if (i != null) ring.position.set(cx(i & 7), 0.025, rz(i >> 3) + FIELD.startIn + 0.06);
  };

  const update = (): void => {
    if (!dirty) return;
    dirty = false;
    for (const m of meshes) m.mesh.instanceMatrix.needsUpdate = true;
  };

  const handle: FieldHandle = {
    root,
    get ready() {
      return ready;
    },
    setBodies,
    tint,
    highlight,
    pose,
    stand,
    lanes,
    heroFrame,
    heroRecorded,
    heroStand,
    setHero,
    get hero() {
      return hero;
    },
    heroTrunk,
    toMujoco,
    tileCenter,
    update,
    dispose() {
      for (const m of meshes) m.mesh.dispose();
      tiles.dispose();
      tileGeo.dispose();
      ring.geometry.dispose();
      root.removeFromParent();
      heroBase.removeFromParent();
    },
  };
  return handle;
}

const _yAxis = new THREE.Vector3(0, 1, 0);
