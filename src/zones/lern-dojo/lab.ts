/**
 * Lern-Dojo · the bench as one object for the station and the tools: the simulation, its clocks,
 * the IK and FK copies of the follower, the home pose, and synchronous helpers (a scripted demo, a
 * training, a policy run) that the solve hooks, the Entscheider's preloaded sets and
 * tools/lerndojo-check.mjs share. No DOM, no engine: Rapier and the SO-101 chain are passed in.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { COLOURS, LAYOUT, STATION_B, type CubeColour } from './tuning';
import { Skeleton, type ChainSpec } from './kin';
import { BenchSim, Stepper, homePose } from './bench';
import { Take, type Demo, type DemoCube, type DemoKind } from './demo';
import { EXPERT_STYLES, Expert } from './expert';
import { KnnPolicy, PolicyRun, Selector, fitVision, type RunOptions, type RunStatus } from './policy';
import { ColourClasses, type Bump, type Light } from './vision';

type RapierModule = typeof RAPIER_NS;

export interface Model {
  policy: KnnPolicy;
  selector: Selector;
  vision: ColourClasses;
  demos: number;
  pairs: number;
  jitter: boolean;
}

export interface RunResult {
  status: RunStatus;
  goal: CubeColour | null;
  first: CubeColour | null;
  boxed: CubeColour | null;
  t: number;
  queries: number;
  maxNn: number;
  blind: boolean;
  clipped: number;
  slips: number;
}

/** A cube on the table for a setup (yaw rad). */
export type PlacedCube = DemoCube;

export class DojoLab {
  readonly sim: BenchSim;
  readonly stepper: Stepper;
  /** the follower's kinematics for IK (the leader has the same chain above the gripper) */
  readonly ik: Skeleton;
  /** a second copy for features (training reads hundreds of poses) */
  readonly fk: Skeleton;
  readonly home: Float64Array;
  private nextId = 1;

  constructor(R: RapierModule, world: RAPIER_NS.World, chain: ChainSpec) {
    const F = LAYOUT.follower;
    const arm = new Skeleton(chain, { x: F.x, z: F.z });
    this.ik = new Skeleton(chain, { x: F.x, z: F.z });
    this.fk = new Skeleton(chain, { x: F.x, z: F.z });
    this.home = homePose(this.ik);
    arm.setAll(this.home);
    this.sim = new BenchSim(R, world, arm);
    this.sim.setArm(this.home);
    this.stepper = new Stepper(this.sim);
  }

  id(): number {
    return this.nextId++;
  }

  /** Arm home, the given cubes on the bench (the others put away), a few steps to settle. */
  setup(cubes: readonly PlacedCube[]): void {
    const sim = this.sim;
    sim.setArm(this.home);
    sim.resetCounters();
    for (let i = 0; i < COLOURS.length; i++) {
      const c = cubes.find((k) => k.colour === COLOURS[i]);
      if (c) sim.placeCube(i, c.x, c.z, c.yaw);
      else sim.removeCube(i);
    }
    for (let i = 0; i < 12; i++) sim.step();
  }

  /** A scripted demo, synchronously (≈ 5–10 ms). */
  expertDemo(cubes: readonly PlacedCube[], target: CubeColour, word: CubeColour, seed: number, style = 0, kind: DemoKind = 'expert', o: { light?: Demo['light']; bump?: Bump } = {}): Demo {
    this.setup(cubes);
    const ti = COLOURS.indexOf(target);
    const ex = new Expert(this.ik, ti, seed, EXPERT_STYLES[style % EXPERT_STYLES.length]);
    ex.begin(this.sim);
    const take = new Take(this.sim, ti, word, o);
    this.stepper.run(
      40,
      () => {
        this.sim.command(ex.act(this.sim));
        take.tick();
      },
      () => take.status !== 'rec' && (take.status === 'failed' || ex.done),
    );
    if (take.status === 'rec') take.status = 'failed';
    return take.finish(this.id(), kind);
  }

  /** k-NN, selector and colour classes on a set of demos (the toy trains in milliseconds). */
  train(demos: readonly Demo[], jitter = false): Model {
    const policy = new KnnPolicy(this.fk);
    const pairs = policy.train(demos);
    const selector = new Selector();
    selector.fit(demos);
    const vision = new ColourClasses();
    fitVision(vision, demos, jitter);
    return { policy, selector, vision, demos: demos.length, pairs, jitter };
  }

  /** A policy run on a setup, synchronously. */
  rollout(m: Model, cubes: readonly PlacedCube[], word: CubeColour, o: { light?: Light; bump?: Bump } = {}): RunResult {
    this.setup(cubes);
    const run = this.startRun(m, { word, light: o.light, bump: o.bump });
    this.stepper.run(60, () => this.sim.command(run.act()), () => run.status !== 'run' || hopeless(run));
    return resultOf(run, this.sim);
  }

  startRun(m: Model, o: RunOptions): PolicyRun {
    return new PolicyRun(this.sim, m.policy, m.selector, m.vision, o);
  }
}

/**
 * A run that cannot succeed any more ends early („jump to the result“, the watching rule): blind for
 * 2.5 s, the jaws shut on nothing twice (the loop is plain to see), or no grasp by 6 s.
 */
export function hopeless(run: PolicyRun): boolean {
  return (run.t > 2.5 && !run.goal) || (run.misses >= 2 && !run.firstGrasp) || (run.t > 6 && !run.firstGrasp);
}

export function resultOf(run: PolicyRun, sim: BenchSim): RunResult {
  return { status: run.status, goal: run.goal, first: run.firstGrasp, boxed: run.boxed(), t: run.t, queries: run.queries, maxNn: run.maxNn, blind: run.blindTicks > 0 && !run.goal, clipped: sim.clipped, slips: sim.slips };
}

// ── the station's fixed setups (plan §4.5 B) ──────────────────────────────────

const F = LAYOUT.fields;
const N = LAYOUT.newSpots;
const at = (colour: CubeColour, p: { x: number; z: number }, yaw = 0): PlacedCube => ({ colour, x: p.x, z: p.z, yaw });

/** the fields as cubes (A: the game resets the cube to the next field) */
export const fieldCube = (i: number, colour: CubeColour = 'rot', yaw = 0): PlacedCube => at(colour, F[i % F.length], yaw);

export const SETUPS = {
  /** the prediction: red on a spot no demo started from, blue on a recorded field (word: rot) */
  prediction: (field: number): PlacedCube[] => [at('rot', N[0]), at('blau', F[field])],
  /** „Neue Lage“: the red cube alone where no demo started */
  newPose: (): PlacedCube[] => [at('rot', N[1])],
  /** „Anderes Wort“: red on a recorded field, blue elsewhere (word: blau) */
  otherWord: (field: number): PlacedCube[] => [at('rot', F[field]), at('blau', N[1])],
  /** the rescue: 2 colours × 2 fields with alternating words (R1: the smallest diverse set) */
  rescue: (k: number): { cubes: PlacedCube[]; word: CubeColour } => {
    const [a, b] = STATION_B.rescueFields;
    const swap = Math.floor(k / 2) % 2 === 1;
    return { cubes: [at('rot', F[swap ? b : a]), at('blau', F[swap ? a : b])], word: k % 2 === 0 ? 'rot' : 'blau' };
  },
  /** after the rescue: „Leg den blauen Würfel …“ with both cubes on the rescue fields */
  rescueTest: (): PlacedCube[] => {
    const [a, b] = STATION_B.rescueFields;
    return [at('rot', F[a]), at('blau', F[b])];
  },
} as const;
