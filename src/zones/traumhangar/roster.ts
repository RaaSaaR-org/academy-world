/**
 * The four real Unitree robots of the hangar (plan §4.8; R3 §2: unitree_ros @ 5994d4f, BSD-3-Clause):
 * R1 → G1 → H1-2 → H2, each loaded through ctx.robots (never a look-alike), each in its charging dock on
 * the Messlatte wall. A Rig is one robot made walkable: its two legs calibrated for the analytic leg IK,
 * the kinematic gait, the arm chains for the CCD, and the poses the hangar needs (standing in the dock,
 * crouched until it is unlocked, a fall and getting up).
 *
 * LOD governor (§5.5 ghost view: the active robot at LOD0 ≤ 40 k, 5 ghosts at LOD2 ≤ 15 k, 3 docked
 * robots ≤ 8 k): while a robot is piloted, the docked ones are held at their articulated LOD2; otherwise
 * every robot follows the engine's distance LOD.
 */
import * as THREE from 'three';
import type { RobotId, RobotModel, ZoneContext } from '@/core/zones';
import { DOCKS, GAIT, ROBOT_ID, ROBOTS, ROSTER, type RosterKey } from './tuning';
import { LegIk, footLink, legJoints } from './legIk';
import { Gait } from './gait';

export type RigState = 'docked' | 'crouched' | 'active' | 'ghost';

/** One arm chain for the CCD (the model's own chain where the manifest names one). */
export interface ArmChain {
  joints: string[];
  tip: string;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _l = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** The arm chains of a Unitree model: shoulder → elbow → wrist joints of one side, the tip the last joint's link. */
function armChain(model: RobotModel, side: 'left' | 'right'): ArmChain | null {
  const named = model.info.ik.find((c) => c.name === `${side}_arm`);
  if (named) return { joints: [...named.joints], tip: named.tip };
  const joints = model.joints.filter((j) => j.name.startsWith(`${side}_shoulder`) || j.name.startsWith(`${side}_elbow`) || j.name.startsWith(`${side}_wrist`)).map((j) => j.name);
  if (!joints.length) return null;
  const last = model.joints.find((j) => j.name === joints[joints.length - 1])!;
  return { joints, tip: last.link };
}

/**
 * One robot made walkable. `place()` puts it on the floor (zone-local), `pose()` writes the gait, the
 * legs and the arms into the model every frame it moves.
 */
export class Rig {
  readonly legs: [LegIk, LegIk];
  readonly gait: Gait;
  readonly arms: { left: ArmChain | null; right: ArmChain | null };
  /** hip height above the sole with straight legs (m) */
  readonly reach: number;
  /** crouch depth now (0 standing … 1 folded in its dock) and the target */
  fold = 0;
  foldTarget = 0;
  /** a fall: 0 upright … 1 lying; null when not falling */
  fallT: number | null = null;
  /** arms: 'rest' hangs them, 'carry' holds a box at the chest, 'reach' moves the hands to the targets */
  armMode: 'rest' | 'carry' | 'reach' = 'rest';
  readonly handL = new THREE.Vector3();
  readonly handR = new THREE.Vector3();
  /** the box at the chest (zone-local), updated by pose() in 'carry' */
  readonly carryAt = new THREE.Vector3();
  private readonly restPose: Record<string, number>;

  constructor(
    readonly key: RosterKey,
    readonly model: RobotModel,
  ) {
    const L = legJoints('left'),
      R = legJoints('right');
    this.legs = [new LegIk(model, L, footLink(model, L)), new LegIk(model, R, footLink(model, R))];
    const p = ROBOTS[key];
    const width = Math.abs(this.legs[0].hip.dot(this.legs[0].left) - this.legs[1].hip.dot(this.legs[1].left)) * GAIT.widthOfHips;
    this.gait = new Gait(this.legs[0].fwd, this.legs[0].left, { vMax: p.vMax, vBack: p.vBack, wMax: p.wMax, freq: p.freq, freqSlow: p.freqSlow, swingH: p.swingH, crouch: p.crouch, width: Math.max(0.14, width) });
    this.arms = { left: armChain(model, 'left'), right: armChain(model, 'right') };
    this.reach = this.legs[0].reach;
    this.restPose = model.getPose();
  }

  get params(): (typeof ROBOTS)[RosterKey] {
    return ROBOTS[this.key];
  }

  /** forward of the gait's heading (zone-local) */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return this.gait.heading(out);
  }

  /** the heading as an angle (rad, 0 = +z, + toward +x): what the dream and the lite planner use */
  get head(): number {
    this.gait.heading(_f);
    return Math.atan2(_f.x, _f.z);
  }

  /** Put the robot on the floor at (x, z) facing the zone-local direction (dx, dz). */
  place(x: number, z: number, dx = 0, dz = 1): void {
    this.gait.place(_v.set(x, 0, z), this.gait.psiFacing(dx, dz));
    this.fallT = null;
    this.pose(0);
  }

  /**
   * Write the gait, the crouch, a fall, the legs and the arms into the model. `dt` eases the crouch
   * (an unlock makes the robot rise from its fold over JUICE.riseS).
   */
  pose(dt: number, riseS = 2): void {
    if (dt > 0 && this.fold !== this.foldTarget) {
      const s = dt / riseS;
      this.fold = this.fold < this.foldTarget ? Math.min(this.foldTarget, this.fold + s) : Math.max(this.foldTarget, this.fold - s);
    }
    const g = this.gait;
    const o = this.model.object;
    const f = this.fold * this.fold * (3 - 2 * this.fold);
    g.side(_l);
    o.position.copy(g.pos).addScaledVector(_l, g.sway);
    // crouch: the walking bend, deeper while folded in the dock (the hips sink, the knees bend)
    const drop = g.p.crouch + f * this.reach * 0.34;
    o.position.y = g.pos.y - drop;
    o.rotation.set(0, g.psi, 0);
    if (this.fallT != null) {
      // a fall onto the back, pivoting at the feet: the root tips back by up to 80°, then (reversed) gets up
      const a = this.fallT;
      const ang = THREE.MathUtils.degToRad(80) * a * a * (3 - 2 * a);
      g.heading(_f);
      _q.setFromAxisAngle(_l, -ang);
      o.quaternion.premultiply(_q);
      o.position.y = g.pos.y - drop * (1 - a) + Math.sin(ang) * 0.05;
      o.position.addScaledVector(_f, -Math.sin(ang) * this.reach * 0.45);
    }
    o.updateMatrix();
    o.updateMatrixWorld(true);
    // legs: ankles above the soles, into the robot-root frame (inverse of the heading rotation)
    for (let i = 0; i < 2; i++) {
      const foot = g.feet[i];
      const leg = this.legs[i];
      // while falling the legs keep their last pose (the whole body tips around the feet)
      if (this.fallT != null) continue;
      _v.set(foot.pos.x - o.position.x, foot.pos.y + leg.soleDrop - o.position.y, foot.pos.z - o.position.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -g.psi);
      leg.solve(_v, THREE.MathUtils.clamp(foot.yaw - g.psi, -GAIT.yawMax, GAIT.yawMax));
    }
    // arms
    if (this.armMode === 'rest' || this.fallT != null) {
      for (const ch of [this.arms.left, this.arms.right]) if (ch) for (const j of ch.joints) this.model.setJoint(j, this.restPose[j] ?? 0);
      if (this.fallT != null) {
        // arms out while falling (the shoulders roll out)
        const a = this.fallT;
        this.model.setJoint('left_shoulder_roll_joint', 0.9 * a);
        this.model.setJoint('right_shoulder_roll_joint', -0.9 * a);
      }
    } else {
      if (this.armMode === 'carry') {
        g.heading(_f);
        this.carryAt.copy(o.position).addScaledVector(_f, 0.3);
        this.carryAt.y = o.position.y + this.legs[0].hip.y + 0.12 + this.reach * 0.12;
        const half = this.key === 'r1' || this.key === 'g1' ? 0.17 : 0.2;
        this.handL.copy(this.carryAt).addScaledVector(_l, half);
        this.handR.copy(this.carryAt).addScaledVector(_l, -half);
      }
      for (const [ch, tgt] of [
        [this.arms.left, this.handL],
        [this.arms.right, this.handR],
      ] as const) {
        if (!ch) continue;
        _w.copy(tgt);
        o.parent?.localToWorld(_w);
        this.model.solveIK(ch, _w, { iterations: 6, tolerance: 0.004 });
      }
    }
  }
}

export interface Roster {
  rig(k: RosterKey): Rig | null;
  ready(k: RosterKey): boolean;
  state(k: RosterKey): RigState;
  setState(k: RosterKey, s: RigState, o?: { instant?: boolean }): void;
  /** the robot back into its dock (standing, facing the doors) */
  dock(k: RosterKey): void;
  /** load (again) at 'now' priority: the player is at its pilot plate, or „Erneut laden“ */
  request(k: RosterKey): Promise<Rig | null>;
  /** the LOD governor: who is piloted (null: nobody) */
  setActive(k: RosterKey | null): void;
  update(dt: number): void;
  onReady(fn: (k: RosterKey, rig: Rig) => void): void;
  readonly ids: Record<RosterKey, RobotId>;
  /** the H2's ghost material (one clone of ctx.robots.ghost) and its real paint, for the gate's snap */
  ghostify(k: RosterKey, on: boolean): void;
}

export function createRoster(ctx: ZoneContext, o: { initial: (k: RosterKey) => RigState }): Roster {
  const rigs = new Map<RosterKey, Rig>();
  const states = new Map<RosterKey, RigState>();
  const pending = new Map<RosterKey, Promise<Rig | null>>();
  const ready: ((k: RosterKey, rig: Rig) => void)[] = [];
  const realMats = new Map<RosterKey, THREE.Material>();
  const ghostMat = ctx.robots.ghost.clone();
  // the docked H2 ghost reads a little stronger than a dream ghost (same program: a clone, other uniforms)
  ghostMat.opacity = 0.42;
  ctx.onDispose(() => ghostMat.dispose());
  let active: RosterKey | null = null;
  for (const k of ROSTER) states.set(k, o.initial(k));

  const meshOf = (m: RobotModel): THREE.SkinnedMesh | null => {
    let s: THREE.SkinnedMesh | null = null;
    m.object.traverse((n) => {
      if ((n as THREE.SkinnedMesh).isSkinnedMesh && !s) s = n as THREE.SkinnedMesh;
    });
    return s;
  };

  const applyState = (k: RosterKey, instant: boolean): void => {
    const r = rigs.get(k);
    if (!r) return;
    const s = states.get(k)!;
    r.foldTarget = s === 'crouched' ? 1 : 0;
    if (instant) r.fold = r.foldTarget;
    api.ghostify(k, s === 'ghost');
    r.pose(0);
  };

  const load = (k: RosterKey, priority: 'now' | 'route'): Promise<Rig | null> => {
    const existing = rigs.get(k);
    if (existing) return Promise.resolve(existing);
    const p0 = pending.get(k);
    if (p0 && priority === 'route') return p0;
    const p = ctx.robots
      .load(ROBOT_ID[k], { lod: 'auto', castShadow: false, priority })
      .then((model) => {
        if (rigs.has(k)) {
          model.dispose();
          return rigs.get(k)!;
        }
        ctx.groups.detail.add(model.object);
        const rig = new Rig(k, model);
        const mesh = meshOf(model);
        if (mesh) realMats.set(k, mesh.material as THREE.Material);
        rigs.set(k, rig);
        // the LOD governor and the shadow rule of setActive for a robot that arrives later
        if (active != null) {
          model.lod = active === k ? 0 : 2;
          model.castShadow = active === k;
        }
        rig.place(DOCKS.x[k], DOCKS.robotZ, 0, 1);
        applyState(k, true);
        for (const f of ready) f(k, rig);
        return rig;
      })
      .catch((err) => {
        console.warn(`[traumhangar] ${ROBOT_ID[k]} not loaded`, err);
        pending.delete(k);
        return null;
      });
    pending.set(k, p);
    return p;
  };

  const api: Roster = {
    ids: ROBOT_ID,
    rig: (k) => rigs.get(k) ?? null,
    ready: (k) => rigs.has(k),
    state: (k) => states.get(k)!,
    setState(k, s, oo = {}) {
      states.set(k, s);
      applyState(k, !!oo.instant);
    },
    dock(k) {
      const r = rigs.get(k);
      if (!r) return;
      r.armMode = 'rest';
      r.place(DOCKS.x[k], DOCKS.robotZ, 0, 1);
      applyState(k, true);
    },
    request: (k) => load(k, 'now'),
    setActive(k) {
      active = k;
      for (const [kk, r] of rigs) {
        r.model.lod = k == null ? 'auto' : kk === k ? 0 : 2;
        // only the piloted robot casts: the docks stand under the roof, in its shadow (JS budget, §5.5)
        r.model.castShadow = kk === k && states.get(kk) !== 'ghost';
      }
    },
    update(dt) {
      // docked robots move only while they rise from their fold (an unlock beat)
      for (const [k, r] of rigs) if (k !== active && r.fold !== r.foldTarget) r.pose(dt);
    },
    onReady(fn) {
      ready.push(fn);
      for (const [k, r] of rigs) fn(k, r);
    },
    ghostify(k, on) {
      const r = rigs.get(k);
      const mesh = r ? meshOf(r.model) : null;
      if (!mesh) return;
      mesh.material = on ? ghostMat : (realMats.get(k) ?? mesh.material);
      mesh.castShadow = !on && active === k;
      mesh.renderOrder = on ? 8 : 0;
    },
  };
  // every robot of the hangar loads with the area (the queue lets it start once the player is near: §5.6)
  for (const k of ROSTER) void load(k, 'route');
  // „Erneut laden“ on the loading card (WP1): load it again
  ctx.events.on('robots:retry', (p: { id?: string; area?: string } | undefined) => {
    const k = ROSTER.find((kk) => ROBOT_ID[kk] === p?.id);
    if (k && (p?.area == null || p.area === ctx.id)) {
      pending.delete(k);
      void load(k, 'now');
    }
  });
  return api;
}
