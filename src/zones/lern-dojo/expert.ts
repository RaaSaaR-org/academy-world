/**
 * Lern-Dojo · a scripted demonstrator with human-like noise: it moves the leader like a person who
 * knows the task — above the cube, down, close, lift, over the Kiste, open, back. It sees the true
 * cube (no camera), drifts a little (Ornstein–Uhlenbeck), hesitates now and then and grasps again
 * after a slip. Used for the Entscheider's preloaded sets (5 fields × 10, then 40 with two colours),
 * the debug autopilot, the solve hooks and the Node check. No DOM, no engine.
 */
import * as THREE from 'three';
import { CLOCK, EXPERT, GRIPPER, LAYOUT, TELEOP } from './tuning';
import { NJ, type Skeleton } from './kin';
import type { BenchSim } from './bench';
import { yawOf } from './demo';

type Phase = 'above' | 'down' | 'close' | 'lift' | 'carry' | 'lower' | 'open' | 'retreat' | 'done';

/** [−π/4, π/4]: cubes look the same every quarter turn */
export function wrapQuarter(a: number): number {
  const q = Math.PI / 2;
  return a - q * Math.round(a / q);
}

/** heading (rad, about +y) of the jaws' closing axis */
export function headingOf(arm: Skeleton): number {
  const a = arm.closingAxis(_ax);
  return Math.atan2(-a.z, a.x);
}
const _ax = new THREE.Vector3();

/**
 * Put the jaw centre at `p` (bench frame) with the jaws down and their closing axis at `heading`
 * (mod 90°): IK, then the roll, then IK again. Writes the joints into `ik.q`.
 */
export function reach(ik: Skeleton, p: THREE.Vector3, heading: number): number {
  ik.solveIK(p, ik.q[4]);
  const roll = ik.q[4] + wrapQuarter(heading - headingOf(ik));
  const [lo, hi] = ik.limits(4);
  return ik.solveIK(p, Math.min(hi, Math.max(lo, roll)));
}

export interface ExpertStyle {
  /** × EXPERT.speed */
  speed: number;
  /** × EXPERT.noiseM */
  noise: number;
  /** × EXPERT.hesitatePerS */
  hesitate: number;
}

export const EXPERT_STYLES: readonly ExpertStyle[] = [
  { speed: 1, noise: 1, hesitate: 1 },
  { speed: 0.8, noise: 1.3, hesitate: 1.6 },
  { speed: 1.15, noise: 0.8, hesitate: 0.6 },
  { speed: 0.9, noise: 1.1, hesitate: 1.2 },
  { speed: 1.05, noise: 0.9, hesitate: 0.8 },
];

/** mulberry32 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r: () => number): number {
  const u = 1 - r(),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Expert {
  phase: Phase = 'above';
  /** the commanded jaw centre (bench frame) */
  readonly p = new THREE.Vector3();
  readonly out = new Float64Array(NJ);
  regrasps = 0;
  private grip: number = GRIPPER.open;
  private wait = 0;
  private hes = 0;
  private readonly noise = new THREE.Vector3();
  private readonly way = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private heading = 0;
  private readonly rnd: () => number;
  private readonly style: ExpertStyle;

  constructor(
    private readonly ik: Skeleton,
    private readonly target: number,
    seed: number,
    style: ExpertStyle = EXPERT_STYLES[0],
  ) {
    this.rnd = mulberry32(seed);
    this.style = style;
  }

  /** start from the follower's current pose */
  begin(sim: BenchSim): void {
    this.ik.setAll(sim.leader);
    this.ik.jawCentre(this.p);
    this.heading = headingOf(this.ik);
    this.grip = GRIPPER.open;
    this.phase = 'above';
    this.out.set(sim.leader);
  }

  get done(): boolean {
    return this.phase === 'done';
  }

  /** One control tick: the next leader joints. */
  act(sim: BenchSim): Float64Array {
    const dt = 1 / CLOCK.ctrlHz;
    const c = sim.cubes[this.target];
    const held = sim.held === this.target;
    const B = LAYOUT.box;
    let speed = EXPERT.speed * this.style.speed;
    let tol = 0.004;
    switch (this.phase) {
      case 'above':
        this.way.set(c.p.x, EXPERT.aboveY, c.p.z);
        this.heading = yawOf(c.q);
        break;
      case 'down':
        this.way.set(c.p.x, TELEOP.lowY, c.p.z);
        speed = EXPERT.approachSpeed * this.style.speed;
        tol = 0.002;
        break;
      case 'close':
      case 'open':
        this.way.copy(this.p);
        break;
      case 'lift':
        this.way.set(this.p.x, EXPERT.carryY, this.p.z);
        break;
      case 'carry':
        this.way.set(B.x, EXPERT.carryY, B.z);
        this.heading = 0;
        break;
      case 'lower':
        this.way.set(B.x, EXPERT.dropY, B.z);
        speed = EXPERT.approachSpeed * this.style.speed * 1.5;
        break;
      case 'retreat':
      case 'done':
        this.way.set(LAYOUT.home.x, LAYOUT.home.y, LAYOUT.home.z);
        break;
    }
    // hesitation: a short slow-down, like a person re-aiming
    if (this.hes > 0) this.hes -= dt;
    else if (this.rnd() < EXPERT.hesitatePerS * this.style.hesitate * dt) this.hes = EXPERT.hesitateS[0] + this.rnd() * (EXPERT.hesitateS[1] - EXPERT.hesitateS[0]);
    if (this.hes > 0) speed *= 0.2;
    // drift (OU); small near the cube, so the hand stays steady where it matters
    const th = 1 / EXPERT.noiseTauS,
      sg = EXPERT.noiseM * this.style.noise * (this.phase === 'down' || this.phase === 'close' ? 0.25 : 1);
    for (const k of ['x', 'z'] as const) this.noise[k] += -th * this.noise[k] * dt + sg * Math.sqrt(2 * th * dt) * gauss(this.rnd);
    // move toward the waypoint, slowing over the last 3 cm; around the arm's base in an arc (a hand
    // carrying a cube from the left fields to the Kiste does not cut across the robot's foot)
    this.tmp.copy(this.way).sub(this.p);
    const d = this.tmp.length();
    const v = speed * Math.min(1, 0.25 + d / 0.03);
    if (d > 1e-6) {
      const step = Math.min(1, (v * dt) / d);
      const F = LAYOUT.follower;
      const a0 = Math.atan2(this.p.x - F.x, this.p.z - F.z),
        a1 = Math.atan2(this.way.x - F.x, this.way.z - F.z);
      const r0 = Math.hypot(this.p.x - F.x, this.p.z - F.z),
        r1 = Math.hypot(this.way.x - F.x, this.way.z - F.z);
      let da = a1 - a0;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 0.35 && r0 > 0.06 && r1 > 0.06) {
        // polar: the angle advances at v / r, radius and height follow
        const arc = Math.abs(da) * Math.max(r0, r1);
        const f = Math.min(1, (v * dt) / Math.max(arc, 1e-6));
        const a = a0 + da * f,
          r = r0 + (r1 - r0) * f;
        this.p.set(F.x + Math.sin(a) * r, this.p.y + (this.way.y - this.p.y) * f, F.z + Math.cos(a) * r);
      } else this.p.addScaledVector(this.tmp, step);
    }
    const arrived = d <= tol;
    // phase changes
    if (this.wait > 0) this.wait -= dt;
    else
      switch (this.phase) {
        case 'above':
          if (arrived) this.phase = 'down';
          break;
        case 'down':
          if (arrived) {
            this.phase = 'close';
            this.grip = GRIPPER.closed;
            this.wait = EXPERT.gripS;
          }
          break;
        case 'close':
          if (held) this.phase = 'lift';
          else {
            // it slipped (or missed): open and try again from above
            this.regrasps++;
            this.grip = GRIPPER.open;
            this.phase = 'above';
            this.wait = EXPERT.gripS * 0.6;
          }
          break;
        case 'lift':
          if (!held) this.phase = 'above';
          else if (arrived) this.phase = 'carry';
          break;
        case 'carry':
          if (!held) this.phase = 'above';
          else if (arrived) this.phase = 'lower';
          break;
        case 'lower':
          if (arrived) {
            this.phase = 'open';
            this.grip = GRIPPER.open;
            this.wait = EXPERT.gripS;
          }
          break;
        case 'open':
          this.phase = 'retreat';
          break;
        case 'retreat':
          if (d < 0.02) this.phase = 'done';
          break;
      }
    const noisy = this.tmp.copy(this.p).add(this.noise);
    noisy.y = Math.max(TELEOP.lowY, noisy.y);
    reach(this.ik, noisy, this.heading);
    this.out.set(this.ik.q);
    this.out[5] = this.grip;
    return this.out;
  }
}
