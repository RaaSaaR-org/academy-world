/**
 * WP15 — stylised people (plan §4.12 L7, D18; R9 §4.1 option B): faceless figures built from ONE soft
 * lathe part (a limb hanging from its joint: wider at the joint, rounded at both ends), so a whole group
 * of people — torso, head, arms, legs and what they carry — is one InstancedMesh with per-instance
 * colours: one draw call per group, the robots' tinted paint program (compiled at boot, WP4).
 * Matte stone heads and hands, olive / sand / slate clothes (§2.7 rule 8: no faces, no brand clothing).
 * A Crowd has fixed slots; a person takes one (7 instances) and writes a pose every update.
 */
import * as THREE from 'three';
import { col } from './geo';

/** The look of one person (heights of D18's mixed ages and body types). */
export interface PersonLook {
  /** height (m) */
  height: number;
  /** width factor (0.85 slight … 1.25 broad) */
  build: number;
  jacket: number;
  trousers: number;
  /** the head and hands: matte stone tones */
  skin: number;
  prop: number;
}

export type Prop = 'none' | 'tablet' | 'basket' | 'crate' | 'tool' | 'finger' | 'plate';

/** A pose (all angles in radians, amounts 0…1). Position = the feet in the crowd's parent frame. */
export interface PersonPose {
  x: number;
  y: number;
  z: number;
  /** facing: 0 looks along −z (as the rovers) */
  yaw: number;
  /** gait amplitude and phase */
  walk: number;
  phase: number;
  crouch: number;
  /** right arm raised and waving; waveT drives the swing */
  wave: number;
  waveT: number;
  /** both arms forward (work at a bed, a crate) */
  reach: number;
  /** left arm holds the tablet in front */
  tablet: number;
  headYaw: number;
  headPitch: number;
  prop: Prop;
}

export function restPose(): PersonPose {
  return { x: 0, y: 0, z: 0, yaw: 0, walk: 0, phase: 0, crouch: 0, wave: 0, waveT: 0, reach: 0, tablet: 0, headYaw: 0, headPitch: 0, prop: 'none' };
}

const PARTS = 7; // torso, head, arm L, arm R, leg L, leg R, prop
/** the figure at unit height (k = height / UNIT_H scales it) */
const UNIT_H = 1.77;
const HIP_Y = 0.92;
const TORSO = 0.56;
const LEG = 0.92;
const ARM = 0.66;

/** The one part geometry: a lathe from y −1 (the end) to y 0 (the joint), radius 0.5 at its widest. */
export function personPartGeometry(): THREE.BufferGeometry {
  const prof = [
    [0, 0],
    [0.27, 0.018],
    [0.39, 0.08],
    [0.44, 0.22],
    [0.47, 0.6],
    [0.5, 0.82],
    [0.46, 0.93],
    [0.32, 0.985],
    [0, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 12);
  g.translate(0, -1, 0);
  g.computeVertexNormals();
  return col(g, 0xffffff);
}

const _m = new THREE.Matrix4();
const _mb = new THREE.Matrix4();
const _mp = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _hand2 = new THREE.Vector3();
const _c = new THREE.Color();

export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  private readonly used: boolean[];
  private dirtyColor = false;
  private boundsAcc = 0;
  /** a hidden part: scale 0 at the crowd's home, so the culling sphere stays where the people are */
  private readonly hidden: THREE.Matrix4;

  constructor(parent: THREE.Object3D, material: THREE.Material, geometry: THREE.BufferGeometry, readonly capacity: number, name: string, home: THREE.Vector3Like) {
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(home.x, home.y, home.z);
    const HIDDEN = this.hidden;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity * PARTS);
    this.mesh.name = name;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity * PARTS; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, _c.setHex(0xffffff));
    }
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = capacity * PARTS;
    this.used = new Array(capacity).fill(false);
    parent.add(this.mesh);
  }

  /** a free slot, or −1 */
  take(look: PersonLook): number {
    const s = this.used.indexOf(false);
    if (s < 0) return -1;
    this.used[s] = true;
    this.paint(s, look);
    return s;
  }

  release(slot: number): void {
    if (slot < 0 || !this.used[slot]) return;
    this.used[slot] = false;
    for (let k = 0; k < PARTS; k++) this.mesh.setMatrixAt(slot * PARTS + k, this.hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  paint(slot: number, look: PersonLook): void {
    const b = slot * PARTS;
    const set = (k: number, hex: number): void => void this.mesh.setColorAt(b + k, _c.setHex(hex));
    set(0, look.jacket);
    set(1, look.skin);
    set(2, look.jacket);
    set(3, look.jacket);
    set(4, look.trousers);
    set(5, look.trousers);
    set(6, look.prop);
    this.dirtyColor = true;
  }

  /** Write one person's pose (no allocations). */
  pose(slot: number, look: PersonLook, p: PersonPose): void {
    if (slot < 0) return;
    const b = slot * PARTS;
    const k = look.height / UNIT_H;
    const w = look.build;
    // the person: feet position, facing, overall scale
    _mp.compose(_v.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(0, p.yaw, 0)), _s.set(k, k, k));
    const c = THREE.MathUtils.clamp(p.crouch, 0, 1);
    const hipY = HIP_Y - 0.36 * c;
    const lean = 0.07 * p.walk + 0.5 * c + 0.12 * p.reach;
    const sw = Math.sin(p.phase) * p.walk;
    // shoulders: the torso stands on the hip and leans forward (local −z)
    const shY = hipY + Math.cos(lean) * TORSO;
    const shZ = -Math.sin(lean) * TORSO;
    // torso (hangs from the shoulders down to the hip)
    this.part(b, 0, 0, shY, shZ, lean, 0, 0, 0.38 * w, TORSO, 0.24 * w);
    // head: its top 0.3 m above the shoulders, turned toward what it looks at
    this.part(b, 1, 0, shY + Math.cos(lean) * 0.3, shZ - Math.sin(lean) * 0.3, lean * 0.6 + p.headPitch, p.headYaw, 0, 0.19, 0.25, 0.21);
    // arms: swing with the gait, reach forward, the right one waves, the left one holds the tablet
    const ax = 0.2 * w;
    const ay = shY - 0.04;
    const reachX = -1.2 * p.reach;
    const leftX = -0.36 * sw + reachX * (1 - p.tablet) - 1.05 * p.tablet;
    const rightX = 0.36 * sw + reachX * (1 - p.wave);
    const waveZ = p.wave * (2.75 + 0.32 * Math.sin(p.waveT * 13.8));
    this.part(b, 2, -ax, ay, shZ, leftX, 0, -0.06 - 0.25 * p.tablet, 0.11 * w, ARM, 0.12 * w, _hand);
    this.part(b, 3, ax, ay, shZ, rightX * (1 - p.wave), 0, 0.06 + waveZ, 0.11 * w, ARM, 0.12 * w, _hand2);
    // legs: the crouch tilts them forward so the feet stay on the floor
    const legTilt = Math.acos(THREE.MathUtils.clamp(hipY / LEG, 0, 1));
    this.part(b, 4, -0.1 * w, hipY, 0, sw * 0.45 - legTilt, 0, 0, 0.15 * w, LEG, 0.16 * w);
    this.part(b, 5, 0.1 * w, hipY, 0, -sw * 0.45 - legTilt * 0.6, 0, 0, 0.15 * w, LEG, 0.16 * w);
    // what they carry
    switch (p.prop) {
      case 'tablet':
        // in the left hand, tilted toward the face
        this.partAt(b, 6, _hand.x + 0.06, _hand.y + 0.08, _hand.z - 0.02, -1.0, 0.25, 0, 0.24, 0.17, 0.025);
        break;
      case 'basket':
        this.partAt(b, 6, _hand2.x + 0.02, _hand2.y + 0.05, _hand2.z, 0, 0, 0, 0.32, 0.22, 0.24);
        break;
      case 'crate':
        // carried in front with both arms
        this.partAt(b, 6, 0, (_hand.y + _hand2.y) / 2 + 0.17, (_hand.z + _hand2.z) / 2 + 0.04, 0, 0, 0, 0.44, 0.26, 0.32);
        break;
      case 'tool':
      case 'finger':
        this.partAt(b, 6, _hand2.x, _hand2.y + 0.03, _hand2.z, -0.6, 0, 0, p.prop === 'finger' ? 0.035 : 0.09, p.prop === 'finger' ? 0.09 : 0.16, 0.04);
        break;
      case 'plate':
        this.partAt(b, 6, 0, (_hand.y + _hand2.y) / 2 + 0.02, (_hand.z + _hand2.z) / 2 - 0.05, -1.25, 0, 0, 0.62, 0.42, 0.03);
        break;
      default:
        this.mesh.setMatrixAt(b + 6, this.hidden);
    }
  }

  /** a part hanging from a joint (figure-local), rotated (rx, ry, rz); `hand` gets its end point (figure-local) */
  private part(b: number, k: number, jx: number, jy: number, jz: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, hand?: THREE.Vector3): void {
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    _mb.compose(_v.set(jx, jy, jz), _q, _s.set(sx, sy, sz));
    if (hand) hand.set(0, -1, 0).applyMatrix4(_mb);
    _m.multiplyMatrices(_mp, _mb);
    this.mesh.setMatrixAt(b + k, _m);
  }

  /** a prop centred at a figure-local point (the part's own pivot is its top: shift by half its height) */
  private partAt(b: number, k: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): void {
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    _v.set(0, sy / 2, 0).applyQuaternion(_q);
    _mb.compose(_v.set(x + _v.x, y + _v.y, z + _v.z), _q, _s.set(sx, sy, sz));
    _m.multiplyMatrices(_mp, _mb);
    this.mesh.setMatrixAt(b + k, _m);
  }

  hide(slot: number): void {
    if (slot < 0) return;
    for (let k = 0; k < PARTS; k++) this.mesh.setMatrixAt(slot * PARTS + k, this.hidden);
  }

  /** after the poses of a tick: upload, and refresh the culling sphere now and then */
  commit(dt: number): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyColor && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.dirtyColor = false;
    }
    this.boundsAcc -= dt;
    if (this.boundsAcc <= 0) {
      this.boundsAcc = 0.5;
      this.mesh.computeBoundingSphere();
    }
  }

  get anyUsed(): boolean {
    return this.used.some((u) => u);
  }
}
