/**
 * Lern-Dojo · the two real SO-101 arms on the bench: WP0's converted models (TheRobotStudio SO-ARM100,
 * Apache-2.0) through ctx.robots, never a look-alike. The follower's link chain feeds the simulation
 * (kin.ts chainFromModel); the leader is the player's hand: its pose comes from the cursor by
 * RobotModel.solveIK. Colours are WP0's (D32: printed parts white, servos black, the moving jaw and the
 * leader's trigger orange).
 *
 * Loading (plan §5.6, §5.8): priority 'route' (the objective, or ≤ 60 m); a failed GLB is retried by
 * the adapter, then the engine's loading card offers „Erneut laden“, which emits 'robots:retry' and we
 * load again here. While the arms are on their way, the bench console waits behind ctx.game.loadingCard.
 */
import * as THREE from 'three';
import type { RobotModel, ZoneContext } from '@/core/zones';

type LoadingCardHandle = ReturnType<ZoneContext['game']['loadingCard']>;
import { BENCH, GRIPPER, LAYOUT } from './tuning';
import { JOINTS, chainFromModel, type ChainSpec } from './kin';
import { wrapQuarter } from './expert';

export const TOP_Y = (floorY: number): number => floorY + BENCH.height;

export interface Arms {
  readonly state: 'loading' | 'ready' | 'failed';
  readonly follower: RobotModel | null;
  readonly leader: RobotModel | null;
  readonly chain: ChainSpec | null;
  /** resolves once both arms are in */
  whenReady(): Promise<void>;
  /** follower joints (rad, LeRobot order) */
  setFollower(q: ArrayLike<number>): void;
  /** leader joints; the gripper value is the follower's gripper command, shown as the trigger */
  setLeader(q: ArrayLike<number>): void;
  /**
   * The player's hand: put the leader so the follower's jaw centre would be at `p` (bench frame),
   * jaws down, closing axis at `heading`. Writes the five arm joints into `out`; returns the IK error (m).
   */
  leaderIK(p: THREE.Vector3, heading: number, out: Float64Array): number;
  /** the loading card at the console (null when ready) */
  showCard(): void;
  hideCard(): void;
}

const ARM_CHAIN = { joints: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex'] as const, tip: 'gripper_link' };
const TRIGGER_MAX = 0.785398;

export function createArms(ctx: ZoneContext, floorY: number, onReady: (a: Arms) => void): Arms {
  const top = TOP_Y(floorY);
  let state: Arms['state'] = 'loading';
  let follower: RobotModel | null = null;
  let leader: RobotModel | null = null;
  let chain: ChainSpec | null = null;
  let card: LoadingCardHandle | null = null;
  let waiters: (() => void)[] = [];
  const tip = new THREE.Vector3(...GRIPPER.jawCentre);
  const down = new THREE.Vector3(0, -1, 0);
  const approach = new THREE.Vector3(0, 0, -1);
  const _w = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const D = { x: LAYOUT.leader.x - LAYOUT.follower.x, z: LAYOUT.leader.z - LAYOUT.follower.z };

  const place = (m: RobotModel, at: { x: number; z: number }): void => {
    m.object.position.set(BENCH.x + at.x, top, BENCH.z + at.z);
    m.object.rotation.y = 0;
    m.object.userData.ledger = 'robots';
    ctx.groups.detail.add(m.object);
  };

  const load = (): void => {
    state = 'loading';
    const want: Promise<RobotModel>[] = [
      follower ? Promise.resolve(follower) : ctx.robots.load('so101', { castShadow: true, receiveShadow: true }),
      leader ? Promise.resolve(leader) : ctx.robots.load('so101-leader', { castShadow: true, receiveShadow: true }),
    ];
    void Promise.allSettled(want).then(([f, l]) => {
      if (f.status === 'fulfilled' && !follower) {
        follower = f.value;
        // the chain is read at the default pose (every joint at its reference): before any setJoint
        chain = chainFromModel(follower);
        place(follower, LAYOUT.follower);
      }
      if (l.status === 'fulfilled' && !leader) {
        leader = l.value;
        place(leader, LAYOUT.leader);
      }
      if (follower && leader) {
        state = 'ready';
        card?.remove();
        card = null;
        onReady(api);
        const w = waiters;
        waiters = [];
        w.forEach((fn) => fn());
      } else {
        state = 'failed';
        card?.update();
      }
    });
  };

  // the engine's loading card („Erneut laden“) after the adapter gave up
  ctx.events.on('robots:retry', (p?: { id?: string; area?: string }) => {
    if (p?.area !== ctx.id || state === 'ready') return;
    if (p.id === 'so101' || p.id === 'so101-leader') load();
  });

  const api: Arms = {
    get state() {
      return state;
    },
    get follower() {
      return follower;
    },
    get leader() {
      return leader;
    },
    get chain() {
      return chain;
    },
    whenReady() {
      return state === 'ready' ? Promise.resolve() : new Promise<void>((r) => waiters.push(r));
    },
    setFollower(q) {
      if (!follower) return;
      for (let i = 0; i < JOINTS.length; i++) follower.setJoint(JOINTS[i], q[i]);
    },
    setLeader(q) {
      if (!leader) return;
      for (let i = 0; i < 5; i++) leader.setJoint(JOINTS[i], q[i]);
      // the trigger: squeezed = jaws closed
      const t = (GRIPPER.open - q[5]) / (GRIPPER.open - GRIPPER.closed);
      leader.setJoint('gripper', Math.max(0, Math.min(1, t)) * TRIGGER_MAX);
    },
    leaderIK(p, heading, out) {
      if (!leader) return Infinity;
      // the follower's target, moved to the leader's base (same orientation), in world coordinates
      ctx.toWorld([BENCH.x + p.x + D.x, top + p.y, BENCH.z + p.z + D.z], _w);
      const o = { tipOffset: tip, orient: { axis: approach, direction: down, weight: 1, joints: 1 } };
      let r = leader.solveIK(ARM_CHAIN, _w, o);
      // the roll: the jaws' closing axis to `heading` (mod 90°, cubes look alike every quarter turn)
      const m = leader.getLinkWorldMatrix('gripper_link');
      if (m) {
        _a.set(1, 0, 0).transformDirection(m);
        ctx.root.getWorldQuaternion(_q).invert();
        _a.applyQuaternion(_q);
        const now = Math.atan2(-_a.z, _a.x);
        leader.setJoint('wrist_roll', leader.getJoint('wrist_roll') + wrapQuarter(heading - now));
        r = leader.solveIK(ARM_CHAIN, _w, o);
      }
      for (let i = 0; i < 5; i++) out[i] = leader.getJoint(JOINTS[i]);
      return r.error;
    },
    showCard() {
      if (state === 'ready' || card) return;
      card = ctx.game.loadingCard({
        name: { de: 'SO-101 · Leit- und Folgearm', en: 'SO-101 · leader and follower' },
        progress: () => {
          const a = ctx.robots.progress('so101'),
            b = ctx.robots.progress('so101-leader');
          if (!a || !b) return null;
          return { loaded: a.loaded + b.loaded, total: a.total + b.total };
        },
        state: () => (state === 'failed' ? 'failed' : 'loading'),
        retry: () => load(),
      });
    },
    hideCard() {
      card?.remove();
      card = null;
    },
  };
  load();
  return api;
}
