/**
 * Lern-Dojo · the workbench as a simulation (no DOM, no engine; Rapier is passed in): three 3 cm cubes,
 * the Kiste, and the follower SO-101's fingers as two kinematic boxes, in a private Rapier world at
 * 100 Hz (R1 §11). Bench frame: tuning.ts.
 *
 *   command(q)   a control tick (30 Hz): the leader's joint targets through the safety layer
 *                (joint limits, ≤ 10° per step, a „geklippt: n“ counter)
 *   step()       one physics step: the follower servo (first-order lag τ ≈ 80 ms) moves toward its
 *                targets, the fingers follow by forward kinematics, the slip rule decides grasps
 *
 * Grasping (R1 §11 „slip rule"): a cube is held when the jaws close on it (gap within 2.5 mm of its
 * width) while it sits between the fingers; it slips instead when it is more than 1.2 cm off the jaw
 * centre or turned more than 25° against the jaws. A held cube rides with the gripper (kinematic) and
 * the moving jaw stalls on it, as the STS3215 servo does; opening the jaws drops it.
 */
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { CLOCK, COLOURS, CUBE, GRIPPER, LAYOUT, SERVO, type CubeColour } from './tuning';
import { NJ, gripperFor, jawGap, type Skeleton } from './kin';

type RapierModule = typeof RAPIER_NS;

const HALF = CUBE.size / 2;
const DEG = Math.PI / 180;

export interface CubeState {
  readonly colour: CubeColour;
  /** on the bench (false: put away) */
  present: boolean;
  readonly p: THREE.Vector3;
  readonly q: THREE.Quaternion;
  /** the pose one physics step ago (render interpolation) */
  readonly p0: THREE.Vector3;
  readonly q0: THREE.Quaternion;
}

export interface BenchEvents {
  grasp?(cube: number): void;
  slip?(cube: number): void;
  release?(cube: number): void;
  /** a cube came to rest in the Kiste */
  boxed?(cube: number): void;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _fixedOff = new THREE.Matrix4().makeTranslation(GRIPPER.fixedBox.c[0], GRIPPER.fixedBox.c[1], GRIPPER.fixedBox.c[2]);
const _movingOff = new THREE.Matrix4().makeTranslation(GRIPPER.movingBox.c[0], GRIPPER.movingBox.c[1], GRIPPER.movingBox.c[2]);

export class BenchSim {
  readonly world: RAPIER_NS.World;
  readonly arm: Skeleton;
  /** follower joints now (rad), the safety layer's targets, the last leader command */
  readonly q = new Float64Array(NJ);
  /** the joints one physics step ago (render interpolation) */
  readonly q0 = new Float64Array(NJ);
  readonly target = new Float64Array(NJ);
  readonly leader = new Float64Array(NJ);
  /** control ticks the safety layer clipped */
  clipped = 0;
  /** index of the held cube, or −1 */
  held = -1;
  /** grasps that held / slipped since resetCounters() */
  grasps = 0;
  slips = 0;
  readonly cubes: CubeState[];
  /** physics time (s) */
  t = 0;
  events: BenchEvents = {};

  private readonly R: RapierModule;
  private readonly bodies: RAPIER_NS.RigidBody[] = [];
  private readonly fixedJaw: RAPIER_NS.RigidBody;
  private readonly movingJaw: RAPIER_NS.RigidBody;
  private readonly heldRel = new THREE.Matrix4();
  private readonly heldPrev = new THREE.Vector3();
  private heldGap: number = CUBE.size;
  /** a closing jaw already slipped off this cube (no second check until the jaws open again) */
  private slipped = -1;
  private readonly restT: number[];
  private readonly boxedOnce: boolean[];
  private readonly alpha = 1 - Math.exp(-CLOCK.dt / SERVO.tauS);
  private readonly clip = SERVO.clipDegPerStep * DEG;

  constructor(R: RapierModule, world: RAPIER_NS.World, arm: Skeleton) {
    this.R = R;
    this.world = world;
    this.arm = arm;
    world.timestep = CLOCK.dt;
    const fixed = (hx: number, hy: number, hz: number, x: number, y: number, z: number, friction = 0.6): void => {
      world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(friction));
    };
    // bench top (1.6 × 0.8 m)
    fixed(0.8, 0.05, 0.4, 0, -0.05, 0);
    // the Kiste: floor and four walls
    const B = LAYOUT.box;
    const hw = B.w / 2,
      hd = B.d / 2,
      t = B.wall / 2;
    fixed(hw, t, hd, B.x, t, B.z);
    fixed(hw, B.h / 2, t, B.x, B.h / 2, B.z - hd + t);
    fixed(hw, B.h / 2, t, B.x, B.h / 2, B.z + hd - t);
    fixed(t, B.h / 2, hd - 2 * t, B.x - hw + t, B.h / 2, B.z);
    fixed(t, B.h / 2, hd - 2 * t, B.x + hw - t, B.h / 2, B.z);
    // the follower's base (it pushes cubes that slide into it)
    fixed(0.04, 0.035, 0.05, LAYOUT.follower.x, 0.035, LAYOUT.follower.z - 0.01);

    this.cubes = COLOURS.map((colour, i) => {
      const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-1 - i, -1, 0).setLinearDamping(0.4).setAngularDamping(0.6).setCcdEnabled(true));
      world.createCollider(R.ColliderDesc.cuboid(HALF, HALF, HALF).setMass(CUBE.mass).setFriction(CUBE.friction).setRestitution(CUBE.restitution), b);
      b.setEnabled(false);
      this.bodies.push(b);
      return { colour, present: false, p: new THREE.Vector3(-1 - i, -1, 0), q: new THREE.Quaternion(), p0: new THREE.Vector3(-1 - i, -1, 0), q0: new THREE.Quaternion() };
    });
    this.restT = this.cubes.map(() => 0);
    this.boxedOnce = this.cubes.map(() => false);

    const jaw = (h: readonly number[]): RAPIER_NS.RigidBody => {
      const b = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
      world.createCollider(R.ColliderDesc.cuboid(h[0], h[1], h[2]).setFriction(1.0), b);
      return b;
    };
    this.fixedJaw = jaw(GRIPPER.fixedBox.h);
    this.movingJaw = jaw(GRIPPER.movingBox.h);
    for (let i = 0; i < NJ; i++) this.q[i] = this.target[i] = this.leader[i] = arm.q[i];
    this.placeJaws(false);
  }

  // ── cubes ─────────────────────────────────────────────────────────────────────

  /** Put cube i on the bench at (x, z), turned by yaw (rad); y = resting on the top. */
  placeCube(i: number, x: number, z: number, yaw = 0): void {
    const b = this.bodies[i];
    if (this.held === i) this.dropHeld(false);
    b.setBodyType(this.R.RigidBodyType.Dynamic, true);
    b.setEnabled(true);
    b.setTranslation({ x, y: HALF + 0.0005, z }, true);
    _q.setFromAxisAngle(_v.set(0, 1, 0), yaw);
    b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const c = this.cubes[i];
    c.present = true;
    c.p.set(x, HALF, z);
    c.q.copy(_q);
    c.p0.copy(c.p);
    c.q0.copy(c.q);
    this.restT[i] = 0;
    this.boxedOnce[i] = false;
    if (this.slipped === i) this.slipped = -1;
  }

  /** Take cube i off the bench. */
  removeCube(i: number): void {
    if (this.held === i) this.dropHeld(false);
    const b = this.bodies[i];
    b.setTranslation({ x: -1 - i, y: -1, z: 0 }, false);
    b.setEnabled(false);
    const c = this.cubes[i];
    c.present = false;
    c.p.set(-1 - i, -1, 0);
    c.p0.copy(c.p);
    this.restT[i] = 0;
    this.boxedOnce[i] = false;
  }

  /** Is cube i at rest inside the Kiste (and let go)? */
  inBox(i: number): boolean {
    const c = this.cubes[i];
    if (!c.present || this.held === i) return false;
    const B = LAYOUT.box;
    return Math.abs(c.p.x - B.x) < B.w / 2 - B.wall - HALF * 0.4 && Math.abs(c.p.z - B.z) < B.d / 2 - B.wall - HALF * 0.4 && c.p.y < B.h;
  }

  /** seconds cube i has rested in the Kiste */
  restedInBox(i: number): number {
    return this.restT[i];
  }

  /** a cube that fell off the bench */
  fallen(i: number): boolean {
    const c = this.cubes[i];
    return c.present && c.p.y < -0.05;
  }

  // ── arm ───────────────────────────────────────────────────────────────────────

  /** Snap the follower (and its targets) to a pose, e.g. home. */
  setArm(q: ArrayLike<number>): void {
    if (this.held >= 0) this.dropHeld(false);
    for (let i = 0; i < NJ; i++) {
      this.leader[i] = q[i];
      this.target[i] = q[i];
    }
    this.arm.setAll(q);
    for (let i = 0; i < NJ; i++) this.q[i] = this.q0[i] = this.target[i] = this.arm.q[i];
    this.slipped = -1;
    this.placeJaws(false);
  }

  /**
   * A control tick: the leader's joints → follower targets through the safety layer (limits,
   * ≤ clipDegPerStep per step). Returns true when it clipped.
   */
  command(leader: ArrayLike<number>): boolean {
    let clipped = false;
    for (let i = 0; i < NJ; i++) {
      const [lo, hi] = this.arm.limits(i);
      const want = Math.min(hi, Math.max(lo, leader[i]));
      this.leader[i] = leader[i];
      const d = want - this.target[i];
      if (Math.abs(d) > this.clip) {
        this.target[i] += Math.sign(d) * this.clip;
        clipped = true;
      } else this.target[i] = want;
      if (want !== leader[i] && Math.abs(want - leader[i]) > 1e-6) clipped = true;
    }
    if (clipped) this.clipped++;
    return clipped;
  }

  resetCounters(): void {
    this.clipped = 0;
    this.grasps = 0;
    this.slips = 0;
  }

  /** the gripper angle at which the jaws touch the held cube */
  private get stallAngle(): number {
    return gripperFor(this.heldGap);
  }

  /** One physics step (CLOCK.dt). */
  step(): void {
    this.q0.set(this.q);
    for (const c of this.cubes) {
      c.p0.copy(c.p);
      c.q0.copy(c.q);
    }
    const a = this.alpha;
    for (let i = 0; i < NJ; i++) this.q[i] += (this.target[i] - this.q[i]) * a;
    if (this.held >= 0) this.q[5] = Math.max(this.q[5], this.stallAngle);
    this.arm.setAll(this.q);
    this.placeJaws(true);
    this.carry();
    this.world.step();
    this.t += CLOCK.dt;
    this.readCubes();
    this.graspRule();
  }

  private placeJaws(next: boolean): void {
    const g = this.arm.matrix('gripper_link');
    const mj = this.arm.matrix('moving_jaw_so101_v1_link');
    this.setKinematic(this.fixedJaw, _m.multiplyMatrices(g, _fixedOff), next);
    this.setKinematic(this.movingJaw, _m.multiplyMatrices(mj, _movingOff), next);
  }

  private setKinematic(b: RAPIER_NS.RigidBody, m: THREE.Matrix4, next: boolean): void {
    m.decompose(_v, _q, _s);
    if (next) {
      b.setNextKinematicTranslation({ x: _v.x, y: _v.y, z: _v.z });
      b.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    } else {
      b.setTranslation({ x: _v.x, y: _v.y, z: _v.z }, true);
      b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    }
  }

  private carry(): void {
    if (this.held < 0) return;
    const b = this.bodies[this.held];
    const t = b.translation();
    this.heldPrev.set(t.x, t.y, t.z);
    _m.multiplyMatrices(this.arm.matrix('gripper_link'), this.heldRel).decompose(_v, _q, _s);
    b.setNextKinematicTranslation({ x: _v.x, y: _v.y, z: _v.z });
    b.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  }

  private readCubes(): void {
    for (let i = 0; i < this.cubes.length; i++) {
      const c = this.cubes[i];
      if (!c.present) continue;
      const b = this.bodies[i];
      const t = b.translation(),
        r = b.rotation();
      c.p.set(t.x, t.y, t.z);
      c.q.set(r.x, r.y, r.z, r.w);
      if (this.held !== i && this.inBox(i)) {
        const v = b.linvel(),
          w = b.angvel();
        const still = Math.hypot(v.x, v.y, v.z) < 0.03 && Math.hypot(w.x, w.y, w.z) < 1.5;
        this.restT[i] = still ? this.restT[i] + CLOCK.dt : 0;
        if (this.restT[i] >= CLOCK.restS && !this.boxedOnce[i]) {
          this.boxedOnce[i] = true;
          this.events.boxed?.(i);
        }
      } else this.restT[i] = 0;
    }
  }

  /** where cube i sits in the gripper frame (m) */
  cubeInJaws(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    _inv.copy(this.arm.matrix('gripper_link')).invert();
    return out.copy(this.cubes[i].p).applyMatrix4(_inv);
  }

  private graspRule(): void {
    const gap = jawGap(this.q[5]);
    if (this.held >= 0) {
      // let go when the jaws open past the cube
      if (jawGap(this.target[5]) > this.heldGap + GRIPPER.releaseTol) this.dropHeld(true);
      return;
    }
    // the jaws opened again: a slipped cube may be tried anew
    if (this.slipped >= 0 && gap > CUBE.size + 2 * GRIPPER.contactTol) this.slipped = -1;
    if (gap > CUBE.size + GRIPPER.contactTol || this.target[5] >= this.q[5]) return;
    const face = -0.0079; // the fixed finger's inner face (gripper_link x)
    for (let i = 0; i < this.cubes.length; i++) {
      const c = this.cubes[i];
      if (!c.present || i === this.slipped) continue;
      const l = this.cubeInJaws(i, _v2);
      // between the fingers (with the closed gap) and within their reach along and across the jaws
      const across = l.x - face;
      if (across < HALF * 0.5 || across > HALF + gap * 0.5 + 0.004) continue;
      if (l.z < -0.1044 - HALF || l.z > -0.061 + HALF * 0.3) continue;
      if (Math.abs(l.y) > 0.0087 + HALF) continue;
      // the slip rule: off the jaw centre (along the fingers and across their width), or turned
      const off = Math.hypot(l.y - GRIPPER.jawCentre[1], l.z - GRIPPER.jawCentre[2]);
      const yaw = this.yawError(i);
      if (off > GRIPPER.slipOffM || yaw > GRIPPER.slipYawDeg * DEG) {
        this.slipped = i;
        this.slips++;
        // it squirts out of the closing jaws
        const b = this.bodies[i];
        _v.set(1, 0, 0).transformDirection(this.arm.matrix('gripper_link')).multiplyScalar(-0.02);
        b.applyImpulse({ x: _v.x, y: 0.004, z: _v.z }, true);
        this.events.slip?.(i);
        return;
      }
      this.hold(i, gap);
      return;
    }
  }

  /** angle between the cube's nearest face normal and the jaws' closing axis (0 … 45°) */
  yawError(i: number): number {
    const ax = this.arm.closingAxis(_v);
    const c = this.cubes[i];
    let best = Math.PI;
    for (const n of [_s.set(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)]) {
      const w = n.clone().applyQuaternion(c.q);
      best = Math.min(best, Math.acos(Math.min(1, Math.abs(w.dot(ax)))));
    }
    return best;
  }

  private hold(i: number, gap: number): void {
    const b = this.bodies[i];
    this.held = i;
    this.heldGap = Math.max(CUBE.size, Math.min(gap, CUBE.size + GRIPPER.contactTol));
    b.setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
    _inv.copy(this.arm.matrix('gripper_link')).invert();
    _m.compose(this.cubes[i].p, this.cubes[i].q, _s.set(1, 1, 1));
    this.heldRel.multiplyMatrices(_inv, _m);
    // squeeze: the cube centres between the faces (the jaws' grip pulls it in)
    this.heldRel.decompose(_v, _q, _s);
    _v.x = -0.0079 + HALF;
    this.heldRel.compose(_v, _q, _s.set(1, 1, 1));
    this.grasps++;
    this.slipped = -1;
    this.events.grasp?.(i);
  }

  private dropHeld(withVelocity: boolean): void {
    const i = this.held;
    if (i < 0) return;
    const b = this.bodies[i];
    const t = b.translation();
    b.setBodyType(this.R.RigidBodyType.Dynamic, true);
    if (withVelocity) {
      const k = 1 / CLOCK.dt;
      b.setLinvel({ x: (t.x - this.heldPrev.x) * k * 0.6, y: (t.y - this.heldPrev.y) * k * 0.6, z: (t.z - this.heldPrev.z) * k * 0.6 }, true);
    } else b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.held = -1;
    this.events.release?.(i);
  }
}

/** A start pose for the follower and the leader: the jaw centre at LAYOUT.home, jaws open and down. */
export function homePose(arm: Skeleton, roll = 0): Float64Array {
  const q = new Float64Array(NJ);
  q[1] = -0.6;
  q[2] = 1.2;
  q[3] = 1.0;
  arm.setAll(q);
  const H = LAYOUT.home;
  const t = new THREE.Vector3(H.x, H.y, H.z);
  for (let k = 0; k < 4; k++) arm.solveIK(t, roll);
  const out = new Float64Array(arm.q);
  out[5] = GRIPPER.open;
  arm.set(5, GRIPPER.open);
  arm.update();
  return out;
}

/**
 * The two clocks of the bench: physics at CLOCK.dt, control ticks at CLOCK.ctrlHz, deterministic (a tick
 * is due at the first physics step at or after k / ctrlHz). The game feeds it frame time; tools run it
 * flat out.
 */
export class Stepper {
  private acc = 0;
  private steps = 0;
  private ticks = 0;

  constructor(private readonly sim: BenchSim) {}

  /** Advance by `dt` seconds of game time (at most `maxSteps` physics steps); `tick` runs before a due step. */
  advance(dt: number, tick: () => void, maxSteps = 6): number {
    this.acc += dt;
    let n = 0;
    while (this.acc >= CLOCK.dt && n < maxSteps) {
      this.one(tick);
      this.acc -= CLOCK.dt;
      n++;
    }
    if (this.acc > CLOCK.dt) this.acc = 0;
    return n;
  }

  /** the fraction of a physics step since the last one (render interpolation) */
  get alpha(): number {
    return Math.min(1, this.acc / CLOCK.dt);
  }

  /** Run until `until()` holds after a tick, or for `seconds`. Returns whether `until` held. */
  run(seconds: number, tick: () => void, until: () => boolean): boolean {
    const n = Math.ceil(seconds / CLOCK.dt);
    let hit = false;
    for (let i = 0; i < n && !hit; i++)
      this.one(() => {
        tick();
        hit = until();
      });
    return hit;
  }

  private one(tick: () => void): void {
    if (this.steps * CLOCK.dt * CLOCK.ctrlHz >= this.ticks - 1e-9) {
      this.ticks++;
      tick();
    }
    this.sim.step();
    this.steps++;
  }
}
