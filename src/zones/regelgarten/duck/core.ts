/**
 * „Lauf, Ente!" — the simulation core of the duck station (plan §4.3, §5.4; R2 §6–§7): the real
 * Open Duck Mini v2 in real MuJoCo (light model, duck/model.xml), a 12-parameter gait (a central
 * pattern generator plus pitch/roll feedback), the player's reward cards, a real cross-entropy
 * method, the hack detectors, randomised worlds and the recorded poses the field replays.
 *
 * No three.js, no DOM, no runtime imports: the station's worker (duck.worker.ts) and the Node tools
 * (tools/duck/*.mjs, tools/mujoco-check.mjs) import this file directly, so the recordings and the
 * Kurzlauf are made by exactly the code the browser runs. Erasable TypeScript only (Node strips the
 * types). The MuJoCo module is passed in; every MuJoCo array is a live view into the wasm heap.
 */
import type { CEM as CemTuning, EPISODE as EpisodeTuning, GAIT as GaitTuning, HACKS as HackTuning, CardId, HackId } from '../tuning';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The loaded @mujoco/mujoco module (its generated typings are loose `any` arrays anyway). */
export type Mujoco = any;

/** Actuator / gait order (R2 §4.3): L leg 5 · neck/head 4 · R leg 5. */
export const ACTUATORS = [
  'left_hip_yaw', 'left_hip_roll', 'left_hip_pitch', 'left_knee', 'left_ankle',
  'neck_pitch', 'head_pitch', 'head_yaw', 'head_roll',
  'right_hip_yaw', 'right_hip_roll', 'right_hip_pitch', 'right_knee', 'right_ankle',
] as const;
export const NACT = 14;
export const NPARAM = 12;

/**
 * The duck GLB's bodies (RobotLibrary.bodies('open-duck-mini-v2', 2): the root and the 16 moving links),
 * which are MuJoCo bodies of the same name and frame. The station records in bodies()' own order;
 * this list is the fallback order and the one the Node tools record in.
 */
export const LINKS = [
  'trunk_assembly',
  'hip_roll_assembly', 'left_roll_to_pitch_assembly', 'knee_and_ankle_assembly', 'knee_and_ankle_assembly_2', 'foot_assembly',
  'neck_pitch_assembly', 'head_pitch_to_yaw', 'neck_yaw_assembly', 'head_assembly', 'left_antenna_holder', 'right_antenna_holder',
  'hip_roll_assembly_2', 'right_roll_to_pitch_assembly', 'knee_and_ankle_assembly_3', 'knee_and_ankle_assembly_4', 'foot_assembly_2',
] as const;

/** Pose quantisation of recordings (Int16): position in 1/4096 m (±8 m), quaternion × 32767. */
export const POS_SCALE = 4096;
export const QUAT_SCALE = 32767;
/** values per body and sample: px py pz qw qx qy qz (MuJoCo world, z up) */
export const POSE_STRIDE = 7;

/** Weights in physics units (CARDS × notches; see tuning.ts). */
export interface Weights {
  fwd: number;
  alive: number;
  upright: number;
  energy: number;
  smooth: number;
  lift: number;
  imitate: number;
}
export type Deck = Record<CardId, number>;

/** One world of the duck: floor friction, payload on the trunk (kg), motor stiffness scale, servo delay (control steps). */
export interface World {
  friction: number;
  payload: number;
  kp: number;
  delay: number;
}
export interface WorldRanges {
  friction: readonly number[];
  payload: readonly number[];
  kp: readonly number[];
  delay: readonly number[];
}

export interface EpisodeResult {
  /** return (reward summed over the episode) */
  R: number;
  /** forward distance of the trunk (m) */
  dist: number;
  fell: boolean;
  /** time of the fall or the end (s) */
  t: number;
  /** mechanical energy Σ|τ·q̇| dt (J) */
  energy: number;
  /** mean Σ(Δa)² per control step */
  actRate: number;
  /** mean swing-foot height (m) */
  lift: number;
}

// ── random numbers ────────────────────────────────────────────────────────────

/** mulberry32, deterministic per seed (the Regelgarten's sim.ts generator). */
export function rng(seed: number): () => number {
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
  const u = 1 - r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function sampleWorld(r: () => number, R: WorldRanges): World {
  const u = (a: readonly number[]): number => a[0] + (a[1] - a[0]) * r();
  return { friction: u(R.friction), payload: u(R.payload), kp: u(R.kp), delay: Math.min(R.delay[1], Math.floor(R.delay[0] + (R.delay[1] - R.delay[0] + 1) * r())) };
}

/** Cards → physics weights; `ramp` 0…1 scales Sanft and Sparsam (the curriculum). */
export function weightsOf(deck: Deck, cards: Readonly<Record<CardId, readonly number[]>>, ramp = 1): Weights {
  const w = (id: CardId): number => cards[id][Math.max(0, Math.min(3, Math.round(deck[id] ?? 0)))];
  return { fwd: w('vorwaerts'), alive: w('durchhalten'), upright: w('aufrecht'), energy: w('sparsam') * ramp, smooth: w('sanft') * ramp, lift: w('fuesseHeben'), imitate: w('vorbild') };
}

// ── the gait ──────────────────────────────────────────────────────────────────

/**
 * Motor targets at time t: home pose + CPG (hip pitch in anti-phase, half-wave knee lift, ankle wave,
 * lateral sway) + lean, neck and ankle offsets + pitch/roll feedback from the trunk's orientation.
 * p = [freq, hipAmp, kneeAmp, kneePhase, ankleAmp, anklePhase, sway, lean, neck, ankleOffset, pitchGain, rollGain]
 */
export function gaitTargets(p: ArrayLike<number>, t: number, home: ArrayLike<number>, pitch: number, roll: number, out: Float64Array): void {
  const ph = 2 * Math.PI * p[0] * t;
  const s = Math.sin(ph);
  const sR = Math.sin(ph + Math.PI);
  for (let k = 0; k < NACT; k++) out[k] = home[k];
  // hip pitch: mirrored joints, anti-phase legs
  out[2] = home[2] - p[7] - p[1] * s;
  out[11] = home[11] + p[7] + p[1] * sR;
  // knees lift on their half of the cycle
  out[3] = home[3] + p[2] * Math.max(0, Math.sin(ph + p[3]));
  out[12] = home[12] + p[2] * Math.max(0, Math.sin(ph + Math.PI + p[3]));
  // ankles: offset + wave + pitch feedback
  out[4] = home[4] + p[9] + p[4] * Math.sin(ph + p[5]) + p[10] * pitch;
  out[13] = home[13] + p[9] + p[4] * Math.sin(ph + Math.PI + p[5]) + p[10] * pitch;
  // hip roll: sway in one world direction + roll feedback
  out[1] = home[1] + p[6] * s + p[11] * roll;
  out[10] = home[10] + p[6] * s + p[11] * roll;
  out[5] = home[5] + p[8];
}

// ── MuJoCo wrapper ────────────────────────────────────────────────────────────

export interface EpisodeOptions {
  /** episode length (s); default EPISODE.seconds */
  seconds?: number;
  /** record poses of the body list into rec at recOffset (Int16, POSE_STRIDE per body per sample) */
  rec?: Int16Array;
  recOffset?: number;
  /** keep simulating after a fall for the replay (s); default EPISODE.postFall */
  postFall?: number;
  /** reference gait for the „Vorbild" card */
  reference?: ArrayLike<number> | null;
  /** also record qpos (7 root + 14 joints, Float32) per sample into qrec at qrecOffset (the hero lane) */
  qrec?: Float32Array;
  qrecOffset?: number;
}

/** qpos values per recorded sample: 7 root (position, quaternion) + 14 joints */
export const QPOS_STRIDE = 7 + NACT;

/**
 * One MuJoCo model + data of the duck. World parameters live on the model, so a hero that must run
 * in its own world gets its own DuckSim.
 */
export class DuckSim {
  readonly M: Mujoco;
  readonly model: Mujoco;
  readonly data: Mujoco;
  readonly dt: number;
  /** physics steps per control step */
  readonly dec: number;
  /** physics steps per recorded sample */
  readonly recEvery: number;
  readonly home = new Float64Array(NACT);
  /** recorded bodies (MuJoCo body ids), in the order the main thread asked for */
  readonly bodies: Int32Array;
  readonly bodyNames: readonly string[];
  readonly ep: typeof EpisodeTuning;
  readonly trunkId: number;
  private readonly feet: [number, number];
  private readonly floor: number;
  private readonly soles: [number, number];
  private readonly mass0: number;
  private readonly kp0: Float64Array;
  private readonly tgt = new Float64Array(NACT);
  private readonly ref = new Float64Array(NACT);
  private readonly queue: Float64Array[] = [0, 1, 2, 3].map(() => new Float64Array(NACT));
  private readonly downZ: number;
  /** last applied world */
  world: World = { friction: -1, payload: 0, kp: 1, delay: 0 };

  constructor(M: Mujoco, xml: string, bodyNames: readonly string[], ep: typeof EpisodeTuning) {
    this.M = M;
    this.ep = ep;
    this.model = M.MjModel.from_xml_string(xml);
    this.data = new M.MjData(this.model);
    const m = this.model;
    this.dt = m.opt.timestep;
    this.dec = Math.round(1 / ep.controlHz / this.dt);
    this.recEvery = Math.round(1 / ep.recHz / this.dt);
    const id = (type: number, name: string): number => {
      const i = M.mj_name2id(m, type, name);
      if (i < 0) throw new Error(`duck model: no ${name}`);
      return i;
    };
    const BODY = M.mjtObj.mjOBJ_BODY.value;
    const GEOM = M.mjtObj.mjOBJ_GEOM.value;
    this.trunkId = id(BODY, 'trunk_assembly');
    this.feet = [id(BODY, 'left_foot'), id(BODY, 'right_foot')];
    this.floor = id(GEOM, 'floor');
    this.soles = [id(GEOM, 'left_sole'), id(GEOM, 'right_sole')];
    this.bodyNames = bodyNames;
    this.bodies = Int32Array.from(bodyNames.map((n) => id(BODY, n)));
    this.mass0 = m.body_mass[this.trunkId];
    this.kp0 = Float64Array.from({ length: NACT }, (_, i) => m.actuator_gainprm[i * 10]);
    M.mj_resetDataKeyframe(m, this.data, 0);
    this.home.set(this.data.ctrl);
    this.downZ = Math.cos((ep.fallTiltDeg * Math.PI) / 180);
  }

  /** Apply a world to the model (friction of floor and soles, trunk payload, motor stiffness). */
  setWorld(w: World): void {
    const m = this.model;
    if (w.friction !== this.world.friction) {
      const fr = m.geom_friction;
      fr[this.floor * 3] = w.friction;
      fr[this.soles[0] * 3] = w.friction;
      fr[this.soles[1] * 3] = w.friction;
    }
    if (w.payload !== this.world.payload) m.body_mass[this.trunkId] = this.mass0 + w.payload;
    if (w.kp !== this.world.kp) {
      const g = m.actuator_gainprm;
      const b = m.actuator_biasprm;
      for (let i = 0; i < NACT; i++) {
        g[i * 10] = this.kp0[i] * w.kp;
        b[i * 10 + 1] = -this.kp0[i] * w.kp;
      }
    }
    this.world = { ...w };
  }

  /** Reset to the home keyframe (standing). */
  reset(): void {
    this.M.mj_resetDataKeyframe(this.model, this.data, 0);
    this.M.mj_forward(this.model, this.data);
  }

  /** Record the current pose of the body list into rec at offset (Int16). */
  writePose(rec: Int16Array, offset: number): void {
    const xp = this.data.xpos;
    const xq = this.data.xquat;
    const B = this.bodies;
    let o = offset;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      rec[o] = Math.round(xp[b * 3] * POS_SCALE);
      rec[o + 1] = Math.round(xp[b * 3 + 1] * POS_SCALE);
      rec[o + 2] = Math.round(xp[b * 3 + 2] * POS_SCALE);
      rec[o + 3] = Math.round(xq[b * 4] * QUAT_SCALE);
      rec[o + 4] = Math.round(xq[b * 4 + 1] * QUAT_SCALE);
      rec[o + 5] = Math.round(xq[b * 4 + 2] * QUAT_SCALE);
      rec[o + 6] = Math.round(xq[b * 4 + 3] * QUAT_SCALE);
      o += POSE_STRIDE;
    }
  }

  /** Float pose of the body list (hero stream). */
  readPose(out: Float32Array, offset = 0): void {
    const xp = this.data.xpos;
    const xq = this.data.xquat;
    const B = this.bodies;
    let o = offset;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      out[o] = xp[b * 3];
      out[o + 1] = xp[b * 3 + 1];
      out[o + 2] = xp[b * 3 + 2];
      out[o + 3] = xq[b * 4];
      out[o + 4] = xq[b * 4 + 1];
      out[o + 5] = xq[b * 4 + 2];
      out[o + 6] = xq[b * 4 + 3];
      o += POSE_STRIDE;
    }
  }

  samples(seconds: number): number {
    return Math.round(seconds * this.ep.recHz) + 1;
  }

  /** One episode of gait p in world w under weights wt, from the home pose. */
  episode(p: ArrayLike<number>, wt: Weights, w: World, o: EpisodeOptions = {}): EpisodeResult {
    const M = this.M;
    const m = this.model;
    const d = this.data;
    this.setWorld(w);
    M.mj_resetDataKeyframe(m, d, 0);
    M.mj_forward(m, d);
    const seconds = o.seconds ?? this.ep.seconds;
    const steps = Math.round(seconds / this.dt);
    const postSteps = Math.round((o.postFall ?? this.ep.postFall) / this.dt);
    // live views (stable: nothing allocates on the wasm heap while the episode runs)
    const qpos = d.qpos;
    const qvel = d.qvel;
    const ctrl = d.ctrl;
    const force = d.actuator_force;
    const xpos = d.xpos;
    const rec = o.rec ?? null;
    const recEvery = this.recEvery;
    const nSamples = this.samples(seconds);
    const stride = this.bodies.length * POSE_STRIDE;
    let recOff = o.recOffset ?? 0;
    let sample = 0;
    const x0 = qpos[0];
    const DT = this.dt;
    const dec = this.dec;
    const home = this.home;
    const tgt = this.tgt;
    const queue = this.queue;
    const delay = Math.max(0, Math.min(3, w.delay | 0));
    for (let k = 0; k <= delay; k++) queue[k].set(home);
    let qHead = 0;
    const lF = this.feet[0] * 3 + 2;
    const rF = this.feet[1] * 3 + 2;
    const footZ0 = Math.min(xpos[lF], xpos[rF]);
    const ref = o.reference ?? null;
    let R = 0;
    let energy = 0;
    let act = 0;
    let actN = 0;
    let lift = 0;
    let fell = false;
    let tEnd = seconds;
    let fallStep = -1;
    let xFall = x0;
    const qrec = o.qrec ?? null;
    let qOff = o.qrecOffset ?? 0;
    const writeQ = (): void => {
      for (let k = 0; k < QPOS_STRIDE; k++) qrec![qOff + k] = qpos[k];
    };
    if (rec) this.writePose(rec, recOff);
    if (qrec) writeQ();
    for (let i = 0; i < steps; i++) {
      if (fallStep >= 0 && i - fallStep > postSteps) break;
      if (i % dec === 0 && fallStep < 0) {
        const qw = qpos[3],
          qx = qpos[4],
          qy = qpos[5],
          qz = qpos[6];
        const pitch = 2 * (qw * qy - qz * qx);
        const roll = 2 * (qw * qx + qy * qz);
        gaitTargets(p, i * DT, home, pitch, roll, tgt);
        // servo delay: the command issued now arrives `delay` control steps later
        queue[(qHead + delay) % (delay + 1)].set(tgt);
        const use = queue[qHead];
        qHead = (qHead + 1) % (delay + 1);
        let sm = 0;
        for (let k = 0; k < NACT; k++) {
          const dv = use[k] - ctrl[k];
          sm += dv * dv;
          ctrl[k] = use[k];
        }
        if (i > 0) {
          R -= wt.smooth * sm;
          act += sm;
          actN++;
        }
        if (ref && wt.imitate) {
          gaitTargets(ref, i * DT, home, 0, 0, this.ref);
          let e = 0;
          for (let k = 0; k < NACT; k++) {
            const dq = qpos[7 + k] - this.ref[k];
            e += dq * dq;
          }
          R += wt.imitate * Math.exp(-e / 0.25) * dec * DT;
        }
      }
      M.mj_step(m, d);
      if ((rec || qrec) && i % recEvery === recEvery - 1 && sample < nSamples - 1) {
        sample++;
        if (rec) this.writePose(rec, (recOff += stride));
        if (qrec) {
          qOff += QPOS_STRIDE;
          writeQ();
        }
      }
      if (fallStep >= 0) continue;
      const qx = qpos[4],
        qy = qpos[5];
      const upz = 1 - 2 * (qx * qx + qy * qy);
      let e = 0;
      for (let k = 0; k < NACT; k++) e += Math.abs(force[k] * qvel[6 + k]);
      energy += e * DT;
      const hl = xpos[lF] - footZ0,
        hr = xpos[rF] - footZ0;
      const swing = Math.max(0, Math.min(0.02, Math.max(hl, hr)));
      lift += swing * DT;
      R += (wt.fwd * qvel[0] + wt.alive + wt.upright * upz - wt.energy * e + wt.lift * swing) * DT;
      if (qpos[2] < this.ep.fallHeight || upz < this.downZ) {
        fell = true;
        tEnd = (i + 1) * DT;
        fallStep = i;
        xFall = qpos[0];
      }
    }
    // the distance counts up to the fall (the slide on the floor after it earns nothing)
    const dist = (fell ? xFall : qpos[0]) - x0;
    // hold the last pose for the rest of the recording
    const lastQ = qOff;
    if (rec || qrec) {
      const last = recOff;
      while (sample < nSamples - 1) {
        sample++;
        if (rec) {
          recOff += stride;
          rec.copyWithin(recOff, last, last + stride);
        }
        if (qrec) {
          qOff += QPOS_STRIDE;
          qrec.copyWithin(qOff, lastQ, lastQ + QPOS_STRIDE);
        }
      }
    }
    return { R, dist, fell, t: tEnd, energy, actRate: actN ? act / actN : 0, lift: lift / Math.max(1e-6, tEnd) };
  }

  /** Free the wasm memory. */
  dispose(): void {
    this.data.delete();
    this.model.delete();
  }
}
// ── cross-entropy method ──────────────────────────────────────────────────────

/** CEM over the gait parameters: sample around μ with σ, keep the elite, smooth (α), floor σ. */
export class Cem {
  readonly mu: Float64Array;
  readonly sd: Float64Array;
  private readonly lo: readonly number[];
  private readonly hi: readonly number[];
  private readonly T: typeof CemTuning;

  constructor(gait: typeof GaitTuning, T: typeof CemTuning, mu?: ArrayLike<number>, sd?: ArrayLike<number>) {
    this.lo = gait.lo;
    this.hi = gait.hi;
    this.T = T;
    this.mu = Float64Array.from(mu ?? gait.mu0);
    this.sd = Float64Array.from(sd ?? gait.sd0);
  }

  clamp(p: Float64Array): Float64Array {
    for (let i = 0; i < NPARAM; i++) p[i] = Math.min(this.hi[i], Math.max(this.lo[i], p[i]));
    return p;
  }

  sample(r: () => number): Float64Array {
    const p = new Float64Array(NPARAM);
    for (let i = 0; i < NPARAM; i++) p[i] = this.mu[i] + this.sd[i] * gauss(r);
    return this.clamp(p);
  }

  eliteCount(pop: number): number {
    return Math.max(4, Math.round(pop * this.T.eliteFrac));
  }

  /** Update from candidates (any order); returns the elite indices, best first. */
  update(params: readonly Float64Array[], scores: ArrayLike<number>): number[] {
    const order = params.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const elite = order.slice(0, this.eliteCount(params.length));
    const a = this.T.alpha;
    for (let i = 0; i < NPARAM; i++) {
      let m = 0;
      for (const e of elite) m += params[e][i];
      m /= elite.length;
      let v = 0;
      for (const e of elite) v += (params[e][i] - m) ** 2;
      v /= elite.length;
      this.mu[i] = a * m + (1 - a) * this.mu[i];
      this.sd[i] = Math.max(this.T.stdFloor * (this.hi[i] - this.lo[i]), a * Math.sqrt(v) + (1 - a) * this.sd[i]);
    }
    return elite;
  }
}

// ── behaviour statistics and the hack detectors ───────────────────────────────

export interface GroupStats {
  n: number;
  fallFrac: number;
  /** fraction that fell before 1 s / before 2 s */
  fall1: number;
  fall2: number;
  meanDist: number;
  medianDist: number;
  meanT: number;
  meanEnergy: number;
  meanActRate: number;
  meanLift: number;
}

export function groupStats(res: readonly EpisodeResult[], idx?: readonly number[]): GroupStats {
  const list = idx ? idx.map((i) => res[i]) : res;
  const n = list.length || 1;
  const fell = list.filter((r) => r.fell);
  const d = list.map((r) => r.dist).sort((a, b) => a - b);
  const sum = (f: (r: EpisodeResult) => number): number => list.reduce((s, r) => s + f(r), 0) / n;
  return {
    n: list.length,
    fallFrac: fell.length / n,
    fall1: fell.filter((r) => r.t < 1).length / n,
    fall2: fell.filter((r) => r.t < 2).length / n,
    meanDist: sum((r) => r.dist),
    medianDist: d.length ? d[d.length >> 1] : 0,
    meanT: sum((r) => r.t),
    meanEnergy: sum((r) => r.energy),
    meanActRate: sum((r) => r.actRate),
    meanLift: sum((r) => r.lift),
  };
}

/** The first hack the elite shows, or null (R2 §6.5; thresholds in tuning.ts HACKS). */
export function detectHack(e: GroupStats, H: typeof HackTuning): HackId | null {
  const so = H.sofortUmfaller;
  if (e.fall1 >= so.fallFrac && e.meanDist < so.dist) return 'sofortUmfaller';
  const bk = H.bauchklatscher;
  if (e.fallFrac >= bk.fallFrac && e.fall1 < so.fallFrac && e.meanDist > bk.dist) return 'bauchklatscher';
  const st = H.statue;
  if (e.meanDist < st.dist && e.fallFrac <= st.maxFall) return 'statue';
  if (H.storch.enabled && e.meanLift >= H.storch.lift && e.meanDist < H.storch.dist) return 'storch';
  if (H.zappelente.enabled && e.meanActRate >= H.zappelente.actRate && e.meanDist < H.zappelente.dist) return 'zappelente';
  return null;
}

// ── one generation, in slices ─────────────────────────────────────────────────

export interface GenerationSpec {
  gen: number;
  pop: number;
  weights: Weights;
  /** null: every duck in the nominal world; else each duck draws a world from these ranges */
  ranges: WorldRanges | null;
  nominal: World;
  seed: number;
  record: boolean;
  reference?: ArrayLike<number> | null;
  /** the parameters to run instead of sampling (C1: 64 copies of the player's gait) */
  fixed?: ArrayLike<number> | null;
  /**
   * randomised worlds: each candidate gait runs in this many worlds side by side on the field (pop/repeats
   * candidates) and is ranked by its worst run, so a gait only wins if it holds in several worlds
   */
  repeats?: number;
  /** also record qpos per duck and sample (Float32, QPOS_STRIDE): the recordings (tools/duck/record.mjs) */
  recordQpos?: boolean;
}

export interface GenerationResult {
  gen: number;
  params: Float64Array[];
  worlds: World[];
  results: EpisodeResult[];
  /** elite indices, best first (empty for a fixed gait) */
  elite: number[];
  stats: GroupStats;
  eliteStats: GroupStats;
  /** μ after the update */
  mu: Float64Array;
  sd: Float64Array;
  /** Int16 poses: duck × sample × body × POSE_STRIDE (null without record) */
  rec: Int16Array | null;
  /** qpos per duck and sample (only with spec.recordQpos) */
  qrec: Float32Array | null;
  samples: number;
  ms: number;
}

/**
 * A generation computed duck by duck (`work(budgetMs)`), so the worker can answer the hero stream
 * and pause messages between ducks. With `fixed`, no CEM update (the 64 copies of one gait).
 */
export class GenerationJob {
  readonly spec: GenerationSpec;
  readonly params: Float64Array[] = [];
  readonly worlds: World[] = [];
  readonly results: EpisodeResult[] = [];
  readonly rec: Int16Array | null;
  readonly qrec: Float32Array | null;
  readonly samples: number;
  private readonly sim: DuckSim;
  private readonly cem: Cem | null;
  private i = 0;
  private ms = 0;

  constructor(sim: DuckSim, cem: Cem | null, spec: GenerationSpec) {
    this.sim = sim;
    this.cem = cem;
    this.spec = spec;
    const r = rng(spec.seed);
    const rep = Math.max(1, spec.repeats ?? 1);
    for (let k = 0; k < spec.pop; k++) {
      this.params.push(spec.fixed ? Float64Array.from(spec.fixed) : k % rep === 0 ? cem!.sample(r) : this.params[k - 1]);
      this.worlds.push(spec.ranges ? sampleWorld(r, spec.ranges) : { ...spec.nominal });
    }
    this.samples = sim.samples(sim.ep.seconds);
    this.rec = spec.record ? new Int16Array(spec.pop * this.samples * sim.bodies.length * POSE_STRIDE) : null;
    this.qrec = spec.recordQpos ? new Float32Array(spec.pop * this.samples * QPOS_STRIDE) : null;
  }

  get done(): boolean {
    return this.i >= this.spec.pop;
  }
  get progress(): number {
    return this.i / this.spec.pop;
  }

  work(budgetMs: number, now: () => number): boolean {
    const t0 = now();
    const per = this.samples * this.sim.bodies.length * POSE_STRIDE;
    while (this.i < this.spec.pop && now() - t0 < budgetMs) {
      const k = this.i++;
      this.results.push(
        this.sim.episode(this.params[k], this.spec.weights, this.worlds[k], { rec: this.rec ?? undefined, recOffset: k * per, reference: this.spec.reference, qrec: this.qrec ?? undefined, qrecOffset: k * this.samples * QPOS_STRIDE }),
      );
    }
    this.ms += now() - t0;
    return this.done;
  }

  finish(): GenerationResult {
    const rep = Math.max(1, this.spec.repeats ?? 1);
    // each candidate's score: its worst run over its `rep` worlds (every duck of the candidate gets it)
    const scores = this.results.map((_, k) => {
      const c0 = k - (k % rep);
      let m = Infinity;
      for (let j = c0; j < Math.min(this.results.length, c0 + rep); j++) m = Math.min(m, this.results[j].R);
      return m;
    });
    let elite: number[] = [];
    if (this.cem && !this.spec.fixed) {
      const uniq = this.params.filter((_, k) => k % rep === 0);
      const us = scores.filter((_, k) => k % rep === 0);
      // elite as duck indices (all runs of an elite candidate)
      elite = this.cem.update(uniq, us).flatMap((c) => Array.from({ length: rep }, (_, j) => c * rep + j)).filter((k) => k < this.results.length);
    }
    const order = elite.length ? elite : this.results.map((_, i) => i).sort((a, b) => scores[b] - scores[a]).slice(0, Math.max(4, Math.round(this.spec.pop * 0.15)));
    return {
      gen: this.spec.gen,
      params: this.params,
      worlds: this.worlds,
      results: this.results,
      elite,
      stats: groupStats(this.results),
      eliteStats: groupStats(this.results, order),
      mu: Float64Array.from(this.cem?.mu ?? this.params[0]),
      sd: Float64Array.from(this.cem?.sd ?? new Float64Array(NPARAM)),
      rec: this.rec,
      qrec: this.qrec,
      samples: this.samples,
      ms: this.ms,
    };
  }
}

// ── the test track ────────────────────────────────────────────────────────────

export interface TrackRun {
  world: World;
  result: EpisodeResult;
  success: boolean;
}

/** n runs of one gait under hidden conditions (fixed seed → the same 20 worlds for every gait). */
export function testRuns(sim: DuckSim, p: ArrayLike<number>, n: number, seed: number, ranges: WorldRanges, seconds: number, successM: number, rec?: Int16Array, qrec?: Float32Array): TrackRun[] {
  const r = rng(seed);
  const none: Weights = { fwd: 0, alive: 0, upright: 0, energy: 0, smooth: 0, lift: 0, imitate: 0 };
  const S = sim.samples(seconds);
  const per = S * sim.bodies.length * POSE_STRIDE;
  const out: TrackRun[] = [];
  for (let k = 0; k < n; k++) {
    const world = sampleWorld(r, ranges);
    const result = sim.episode(p, none, world, { seconds, rec, recOffset: k * per, qrec, qrecOffset: k * S * QPOS_STRIDE });
    out.push({ world, result, success: !result.fell && result.dist >= successM });
  }
  return out;
}

// ── recordings: decoding and forward kinematics (recorded.ts, tools) ───────────

/** One recorded link: its parent (index, −1 = the free root), its body frame and its hinge's qpos index. */
export interface KinNode {
  link: string;
  parent: number;
  pos: readonly number[];
  /** w x y z */
  quat: readonly number[];
  /** qpos index of the hinge about the body's z, or −1 (fixed) */
  q: number;
  root?: boolean;
}

/** Undo the recordings' delta coding: Int16 (ducks × samples × stride) → Float32 qpos. */
export function decodeQpos(data: Int16Array, off: number, ducks: number, samples: number, stride: number, scale: { pos: number; quat: number; joint: number }): Float32Array {
  const out = new Float32Array(ducks * samples * stride);
  const acc = new Int32Array(stride);
  for (let d = 0; d < ducks; d++) {
    acc.fill(0);
    for (let s = 0; s < samples; s++) {
      const o = (d * samples + s) * stride;
      for (let k = 0; k < stride; k++) {
        acc[k] += data[off + o + k];
        out[o + k] = acc[k] / (k < 3 ? scale.pos : k < 7 ? scale.quat : scale.joint);
      }
    }
  }
  return out;
}

/**
 * Link poses (Int16, POS_SCALE / QUAT_SCALE, POSE_STRIDE per link) from qpos samples by MuJoCo's own
 * kinematics: x = x_parent + R_parent · pos, q = q_parent ⊗ quat ⊗ hinge(z, θ). `order` maps each
 * output link to its tree index (−1: left at zero). Parents precede children in `tree`.
 */
export function fkPoses(tree: readonly KinNode[], order: ArrayLike<number>, q: Float32Array, ducks: number, samples: number, stride: number): Int16Array {
  const L = order.length;
  const out = new Int16Array(ducks * samples * L * POSE_STRIDE);
  const P = new Float64Array(tree.length * 3);
  const R = new Float64Array(tree.length * 4);
  for (let d = 0; d < ducks; d++) {
    for (let s = 0; s < samples; s++) {
      const qo = (d * samples + s) * stride;
      for (let i = 0; i < tree.length; i++) {
        const n = tree[i];
        let px: number, py: number, pz: number, w: number, x: number, y: number, z: number;
        if (n.parent < 0) {
          px = q[qo];
          py = q[qo + 1];
          pz = q[qo + 2];
          w = q[qo + 3];
          x = q[qo + 4];
          y = q[qo + 5];
          z = q[qo + 6];
          const nn = 1 / (Math.hypot(w, x, y, z) || 1);
          w *= nn;
          x *= nn;
          y *= nn;
          z *= nn;
        } else {
          const a = n.parent;
          const aw = R[a * 4],
            ax = R[a * 4 + 1],
            ay = R[a * 4 + 2],
            az = R[a * 4 + 3];
          const vx = n.pos[0],
            vy = n.pos[1],
            vz = n.pos[2];
          const tx = 2 * (ay * vz - az * vy),
            ty = 2 * (az * vx - ax * vz),
            tz = 2 * (ax * vy - ay * vx);
          px = P[a * 3] + vx + aw * tx + (ay * tz - az * ty);
          py = P[a * 3 + 1] + vy + aw * ty + (az * tx - ax * tz);
          pz = P[a * 3 + 2] + vz + aw * tz + (ax * ty - ay * tx);
          const bw = n.quat[0],
            bx = n.quat[1],
            by = n.quat[2],
            bz = n.quat[3];
          w = aw * bw - ax * bx - ay * by - az * bz;
          x = aw * bx + ax * bw + ay * bz - az * by;
          y = aw * by - ax * bz + ay * bw + az * bx;
          z = aw * bz + ax * by - ay * bx + az * bw;
          if (n.q >= 0) {
            const h = q[qo + n.q] / 2;
            const c = Math.cos(h),
              sn = Math.sin(h);
            const w2 = w * c - z * sn,
              x2 = x * c + y * sn,
              y2 = y * c - x * sn,
              z2 = z * c + w * sn;
            w = w2;
            x = x2;
            y = y2;
            z = z2;
          }
        }
        P[i * 3] = px;
        P[i * 3 + 1] = py;
        P[i * 3 + 2] = pz;
        R[i * 4] = w;
        R[i * 4 + 1] = x;
        R[i * 4 + 2] = y;
        R[i * 4 + 3] = z;
      }
      let o = (d * samples + s) * L * POSE_STRIDE;
      for (let k = 0; k < L; k++) {
        const i = order[k];
        if (i >= 0) {
          out[o] = Math.round(P[i * 3] * POS_SCALE);
          out[o + 1] = Math.round(P[i * 3 + 1] * POS_SCALE);
          out[o + 2] = Math.round(P[i * 3 + 2] * POS_SCALE);
          out[o + 3] = Math.round(R[i * 4] * QUAT_SCALE);
          out[o + 4] = Math.round(R[i * 4 + 1] * QUAT_SCALE);
          out[o + 5] = Math.round(R[i * 4 + 2] * QUAT_SCALE);
          out[o + 6] = Math.round(R[i * 4 + 3] * QUAT_SCALE);
        }
        o += POSE_STRIDE;
      }
    }
  }
  return out;
}
