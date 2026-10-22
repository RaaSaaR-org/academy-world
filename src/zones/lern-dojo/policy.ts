/**
 * Lern-Dojo · the toy policy (R1 §11): built like a VLA (image + language + state → action chunk),
 * but a nearest-neighbour imitator, not SmolVLA.
 *
 *   SEHEN      the top camera's colour classes find the cubes (vision.ts)
 *   VERSTEHEN  which cube? score = a·[the command's word = its colour] + b·[demo density at its
 *              place]; a and b are FITTED on the demos (softmax over the cubes each demo had on the
 *              table, a few gradient steps). One-cube one-word demos give no contrast: a stays ≈ 0
 *              and the word is ignored — the arm goes where your demos went.
 *   HANDELN    k-NN behaviour cloning (k = 3, one neighbour per demo) on target-relative features
 *              (jaw centre − target, jaw opening, holding, the target's place) → a chunk of 15 actions
 *              at 30 Hz (0.5 s): Δ of the five arm joints from now, the gripper as an absolute target.
 *              Re-queried every chunk. Outside the demos' places the neighbours come from elsewhere:
 *              it reaches for where your cubes used to be.
 *
 * No DOM, no engine (the Node check runs the same code).
 */
import * as THREE from 'three';
import { CLOCK, COLOURS, CUBE, GRIPPER, LAYOUT, POLICY, SELECTOR, TELEOP, type CubeColour } from './tuning';
import { NJ, type Skeleton } from './kin';
import { O_A, O_HELD, O_Q, O_T, SV, type Demo } from './demo';
import type { BenchSim } from './bench';
import { ColourClasses, DAYLIGHT, DUSK, NO_BUMP, render, type Bump, type Detection, type Light, type SceneView } from './vision';

const CH = POLICY.chunk;
/** feature dims: rel (3), jaw, held, abs (2), the arm's joints (observation.state: pan, lift, elbow, wrist flex) */
export const FD = 11;

const _g = new THREE.Vector3();

/** where a held cube goes: above the Kiste (the policy's second target once it holds the cube) */
export const BOX_POINT = { x: LAYOUT.box.x, y: 0.1, z: LAYOUT.box.z } as const;

/**
 * The feature vector of a state: jaw centre g relative to the target (the cube; once it is held, the
 * point above the Kiste), the gripper angle, held, and the target's place on the bench.
 */
export function stateFeatures(gx: number, gy: number, gz: number, cx: number, cy: number, cz: number, q: ArrayLike<number>, held: number, out: Float32Array, o = 0): void {
  if (held) features(gx, gy, gz, BOX_POINT.x, BOX_POINT.y, BOX_POINT.z, q[5], 1, out, o);
  else features(gx, gy, gz, cx, cy, cz, q[5], 0, out, o);
  // the joints themselves (LeRobot's observation.state): neighbours in a like pose, whose joint deltas fit
  // (weighted more while carrying: reaching follows the eyes, carrying the arm)
  const w = held ? POLICY.qWeightHeld : POLICY.qWeight;
  for (let j = 0; j < 4; j++) out[o + 7 + j] = (q[j] / POLICY.qScale) * w;
}

function features(gx: number, gy: number, gz: number, tx: number, ty: number, tz: number, jaw: number, held: number, out: Float32Array, o = 0): void {
  const dx = gx - tx,
    dy = gy - ty,
    dz = gz - tz;
  const sc = POLICY.relScale + POLICY.relSat * Math.hypot(dx, dy, dz);
  out[o] = dx / sc;
  out[o + 1] = dy / sc;
  out[o + 2] = dz / sc;
  out[o + 3] = jaw / POLICY.jawScale;
  out[o + 4] = held * POLICY.heldWeight;
  out[o + 5] = (tx / POLICY.absScale) * POLICY.absWeight;
  out[o + 6] = (tz / POLICY.absScale) * POLICY.absWeight;
}

// ── VERSTEHEN: which cube ─────────────────────────────────────────────────────

export class Selector {
  a: number = SELECTOR.a0;
  b: number = SELECTOR.b0;
  private places: { x: number; z: number }[] = [];
  /** demos that had more than one cube (the only ones that teach anything here) */
  contrast = 0;

  /** familiarity of a place from the demos' target places, 0 … 1 (capped at one demo's worth) */
  density(x: number, z: number): number {
    let s = 0;
    const k = 1 / (2 * SELECTOR.sigma * SELECTOR.sigma);
    for (const p of this.places) s += Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) * k);
    return Math.min(1, s);
  }

  fit(demos: readonly Demo[]): void {
    this.places = [];
    for (const d of demos) {
      const c = d.cubes.find((k) => k.colour === COLOURS[d.target]);
      if (c && d.ok) this.places.push({ x: c.x, z: c.z });
    }
    this.a = SELECTOR.a0;
    this.b = SELECTOR.b0;
    const data = demos
      .filter((d) => d.ok && d.cubes.length > 1)
      .map((d) => ({
        word: d.word,
        cands: d.cubes.map((c) => ({ w: c.colour === d.word ? 1 : 0, p: this.density(c.x, c.z), t: c.colour === COLOURS[d.target] ? 1 : 0 })),
      }));
    this.contrast = data.length;
    if (!data.length) return;
    for (let it = 0; it < SELECTOR.steps; it++) {
      let ga = -SELECTOR.l2 * (this.a - SELECTOR.a0),
        gb = -SELECTOR.l2 * (this.b - SELECTOR.b0);
      for (const d of data) {
        const z = d.cands.map((c) => this.a * c.w + this.b * c.p);
        const m = Math.max(...z);
        const e = z.map((v) => Math.exp(v - m));
        const sum = e.reduce((x, y) => x + y, 0);
        d.cands.forEach((c, i) => {
          const p = e[i] / sum;
          ga += (c.t - p) * c.w;
          gb += (c.t - p) * c.p;
        });
      }
      this.a += (SELECTOR.rate * ga) / data.length;
      this.b += (SELECTOR.rate * gb) / data.length;
    }
  }

  score(colour: CubeColour, x: number, z: number, word: CubeColour): number {
    return this.a * (colour === word ? 1 : 0) + this.b * this.density(x, z);
  }

  /** the cube it goes for, of those it sees */
  pick(seen: readonly Detection[], word: CubeColour): Detection | null {
    let best: Detection | null = null,
      bs = -Infinity;
    for (const s of seen) {
      const v = this.score(s.colour, s.x, s.z, word);
      if (v > bs) {
        bs = v;
        best = s;
      }
    }
    return best;
  }
}

// ── HANDELN: k-NN with action chunks ─────────────────────────────────────────

export class KnnPolicy {
  n = 0;
  demos: Demo[] = [];
  feats = new Float32Array(0);
  /** per sample: CH × NJ */
  chunks = new Float32Array(0);
  refDemo = new Int32Array(0);
  refStep = new Int32Array(0);
  private q = new Float32Array(FD);
  private perD = new Float64Array(0);
  private perI = new Int32Array(0);
  readonly bestD = new Float64Array(POLICY.k);
  readonly bestI = new Int32Array(POLICY.k);

  constructor(private readonly fk: Skeleton) {}

  get trained(): boolean {
    return this.n > 0;
  }

  /** Dataset: every stored state with its next CH actions (the last ones repeat the final action). */
  train(demos: readonly Demo[]): number {
    const use = demos.filter((d) => d.n > 1);
    this.demos = use.slice();
    let n = 0;
    for (const d of use) n += d.n;
    this.n = n;
    this.feats = new Float32Array(n * FD);
    this.chunks = new Float32Array(n * CH * NJ);
    this.refDemo = new Int32Array(n);
    this.refStep = new Int32Array(n);
    let i = 0;
    use.forEach((d, di) => {
      const s = d.s;
      for (let t = 0; t < d.n; t++, i++) {
        const o = t * SV;
        this.fk.setAll(s.subarray(o + O_Q, o + O_Q + NJ));
        this.fk.jawCentre(_g);
        stateFeatures(_g.x, _g.y, _g.z, s[o + O_T], s[o + O_T + 1], s[o + O_T + 2], s.subarray(o + O_Q, o + O_Q + NJ), s[o + O_HELD], this.feats, i * FD);
        this.refDemo[i] = di;
        this.refStep[i] = t;
        for (let k = 0; k < CH; k++) {
          const p = Math.min(d.n - 1, t + k) * SV;
          const co = (i * CH + k) * NJ;
          for (let j = 0; j < 5; j++) this.chunks[co + j] = s[p + O_A + j] - s[o + O_Q + j];
          this.chunks[co + 5] = s[p + O_A + 5];
        }
      }
    });
    return n;
  }

  /**
   * The averaged chunk for a state (nearest sample of each demo, then the k nearest demos, Gaussian
   * kernel relative to the nearest). Returns the nearest distance (normalised units).
   */
  query(f: Float32Array, outChunk: Float32Array, outNbr: Int32Array): number {
    const q = f;
    const nd = this.demos.length;
    if (this.perD.length < nd) {
      this.perD = new Float64Array(nd);
      this.perI = new Int32Array(nd);
    }
    const pd = this.perD,
      pi = this.perI;
    pd.fill(Infinity, 0, nd);
    pi.fill(-1, 0, nd);
    const F = this.feats;
    for (let i = 0; i < this.n; i++) {
      const o = i * FD;
      let d = 0;
      for (let k = 0; k < FD; k++) {
        const e = F[o + k] - q[k];
        d += e * e;
      }
      const di = this.refDemo[i];
      if (d < pd[di]) {
        pd[di] = d;
        pi[di] = i;
      }
    }
    const K = POLICY.k;
    const bd = this.bestD,
      bi = this.bestI;
    bd.fill(Infinity);
    bi.fill(-1);
    for (let di = 0; di < nd; di++) {
      const d = pd[di];
      if (d >= bd[K - 1]) continue;
      let j = K - 1;
      while (j > 0 && bd[j - 1] > d) {
        bd[j] = bd[j - 1];
        bi[j] = bi[j - 1];
        j--;
      }
      bd[j] = d;
      bi[j] = pi[di];
    }
    outChunk.fill(0);
    let ws = 0;
    const d0 = bd[0];
    for (let j = 0; j < K; j++) {
      const i = bi[j];
      outNbr[j] = i;
      if (i < 0) continue;
      const w = Math.exp(-(bd[j] - d0) / (2 * POLICY.kernel * POLICY.kernel));
      ws += w;
      const o = i * CH * NJ;
      for (let c = 0; c < CH * NJ; c++) outChunk[c] += w * this.chunks[o + c];
    }
    if (ws > 0) for (let c = 0; c < CH * NJ; c++) outChunk[c] /= ws;
    return bi[0] >= 0 ? Math.sqrt(bd[0]) : Infinity;
  }

  /** nearest distance only (the coverage meter for a cube at rest, jaws at home) */
  coverage(home: ArrayLike<number>, x: number, z: number): number {
    this.fk.setAll(home);
    this.fk.jawCentre(_g);
    stateFeatures(_g.x, _g.y, _g.z, x, CUBE.size / 2, z, home, 0, this.q);
    let best = Infinity;
    const F = this.feats;
    for (let i = 0; i < this.n; i++) {
      const o = i * FD;
      let d = 0;
      for (let k = 0; k < FD; k++) {
        const e = F[o + k] - this.q[k];
        d += e * e;
      }
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
}

// ── one policy run ─────────────────────────────────────────────────────────────

export type RunStatus = 'run' | 'success' | 'wrong' | 'timeout';

export interface RunOptions {
  word: CubeColour;
  light?: Light;
  /** camera mount offset (m) */
  bump?: Bump;
  timeoutS?: number;
}

/** The scene as the camera sees it, from the bench simulation. */
export function sceneOf(sim: BenchSim): SceneView {
  sim.arm.jawCentre(_g);
  return {
    cubes: sim.cubes.map((c) => ({ colour: c.colour, present: c.present, x: c.p.x, y: c.p.y, z: c.p.z, yaw: yawOfQ(c.q) })),
    gripper: { x: _g.x, y: _g.y, z: _g.z },
  };
}

function yawOfQ(q: THREE.Quaternion): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
}

/**
 * Executes the policy on the bench: perception and a query every chunk (0.5 s), one action per control
 * tick. It commits to the cube it picked at the start (re-seeing its place each chunk). Seeing no cube,
 * it hovers over the work field and looks (the „Hover" failure of R1 §6).
 */
export class PolicyRun {
  status: RunStatus = 'run';
  t = 0;
  ticks = 0;
  queries = 0;
  nn = 0;
  maxNn = 0;
  /** the cube it went for (colour), or null while it sees none */
  goal: CubeColour | null = null;
  /** the first cube it grasped */
  firstGrasp: CubeColour | null = null;
  /** what it saw at the last query */
  seen: Detection[] = [];
  /** the perceived place of its goal (bench frame) */
  readonly goalPos = new THREE.Vector3();
  readonly chunk = new Float32Array(CH * NJ);
  readonly nbr = new Int32Array(POLICY.k);
  pos: number = CH;
  /** ticks with no cube seen */
  blindTicks = 0;
  /** the jaws shut on nothing (a missed grasp), counted per closing */
  misses = 0;
  private wasShut = false;
  readonly out = new Float64Array(NJ);
  private readonly f = new Float32Array(FD);
  private readonly qQuery = new Float64Array(NJ);
  private readonly img: Uint8Array;
  readonly opts: Required<RunOptions>;
  private seed = 1;

  constructor(
    readonly sim: BenchSim,
    readonly policy: KnnPolicy,
    readonly selector: Selector,
    readonly vision: ColourClasses,
    o: RunOptions,
  ) {
    this.opts = { word: o.word, light: o.light ?? DAYLIGHT, bump: o.bump ?? NO_BUMP, timeoutS: o.timeoutS ?? POLICY.timeoutS };
    this.img = new Uint8Array(64 * 48 * 3);
  }

  /** the camera picture of the last query (for SEHEN) */
  get image(): Uint8Array {
    return this.img;
  }

  private look(): void {
    render(sceneOf(this.sim), this.opts.light, this.opts.bump, this.seed++, this.img);
    this.seen = this.vision.detect(this.img);
  }

  /** One control tick: the next leader joints (the caller sends them through sim.command). */
  act(): Float64Array {
    const sim = this.sim;
    if (this.pos >= CH) {
      this.look();
      if (!this.goal) {
        const pick = this.selector.pick(this.seen, this.opts.word);
        if (pick) {
          this.goal = pick.colour;
          this.goalPos.set(pick.x, CUBE.size / 2, pick.z);
        }
      } else {
        const s = this.seen.find((d) => d.colour === this.goal);
        // its place, re-seen (under the gripper it keeps the last one)
        if (s) this.goalPos.set(s.x, CUBE.size / 2, s.z);
      }
      if (this.goal) {
        const held = sim.held >= 0;
        sim.arm.jawCentre(_g);
        stateFeatures(_g.x, _g.y, _g.z, this.goalPos.x, this.goalPos.y, this.goalPos.z, sim.q, held ? 1 : 0, this.f);
        this.nn = this.policy.query(this.f, this.chunk, this.nbr);
        this.maxNn = Math.max(this.maxNn, this.nn);
        this.qQuery.set(sim.q);
        this.queries++;
      }
      this.pos = 0;
    }
    if (!this.goal) {
      // blind: hover over the work field and look around
      this.blindTicks++;
      this.hover();
    } else {
      const o = this.pos * NJ;
      for (let j = 0; j < 5; j++) this.out[j] = this.qQuery[j] + this.chunk[o + j];
      this.out[5] = this.chunk[o + 5];
    }
    this.pos++;
    this.ticks++;
    this.t += 1 / CLOCK.ctrlHz;
    this.judge();
    return this.out;
  }

  private hoverPhase = 0;
  private hover(): void {
    // a slow look-around over the start fields, jaws open (the leader joints of a sweep)
    this.hoverPhase += 1 / CLOCK.ctrlHz;
    const sim = this.sim;
    this.out.set(sim.target);
    const sweep = Math.sin(this.hoverPhase * 1.1) * 0.5;
    this.out[0] = sweep;
    this.out[5] = GRIPPER.open;
  }

  /** the task: the cube of the command's word in the Kiste ('wrong': another one) */
  private judge(): void {
    const sim = this.sim;
    if (sim.held >= 0 && !this.firstGrasp) this.firstGrasp = COLOURS[sim.held];
    const shut = sim.held < 0 && sim.q[5] < POLICY.emptyCloseRad;
    if (shut && !this.wasShut) this.misses++;
    this.wasShut = shut;
    const boxed = this.boxed();
    if (boxed) this.status = boxed === this.opts.word ? 'success' : 'wrong';
    else if (this.t >= this.opts.timeoutS) this.status = 'timeout';
  }

  /** which cube ended in the Kiste (or null) */
  boxed(): CubeColour | null {
    for (let i = 0; i < this.sim.cubes.length; i++) if (this.sim.restedInBox(i) >= CLOCK.restS) return COLOURS[i];
    return null;
  }
}

/** The colour classes, fitted on the first frame of every demo (its light, its camera). */
export function fitVision(vision: ColourClasses, demos: readonly Demo[], jitter: boolean): void {
  const frames = demos.map((d, i) => {
    const scene: SceneView = { cubes: COLOURS.map((colour) => {
      const c = d.cubes.find((k) => k.colour === colour);
      return { colour, present: !!c, x: c?.x ?? 0, y: CUBE.size / 2, z: c?.z ?? 0, yaw: c?.yaw ?? 0 };
    }), gripper: { x: LAYOUT.home.x, y: LAYOUT.home.y, z: LAYOUT.home.z } };
    const light = d.light === 'dusk' ? DUSK : DAYLIGHT;
    return { image: render(scene, light, d.bump, 1000 + i), scene, bump: d.bump };
  });
  vision.fit(frames, jitter);
}

/** the place under the jaw centre at teleop heights (helper for the coverage meter) */
export const HOVER_Y = TELEOP.hoverY;
