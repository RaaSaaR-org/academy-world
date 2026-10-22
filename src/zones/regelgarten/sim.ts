/**
 * Regelgarten — pure physics (no three.js, no DOM). Shared by
 *   A  Balancieren:  hand-pushed cart-pole, RK4 at 1 kHz
 *   B  Regler & Takt: giant pendulum with full-state feedback, sampled at the Takt (ZOH) behind a latency FIFO
 * (Station C „Lauf, Ente!" has its own physics: MuJoCo in duck/.)
 *
 * Model: GDD Appendix B (Barto form, uniform rod, half-length l = L/2, cart friction b):
 *   θ̈ = [g sin θ − cos θ·(F + m l θ̇² sin θ − b ẋ)/(M+m)] / [l·(4/3 − m cos²θ/(M+m))]
 *   ẍ = [F + m l (θ̇² sin θ − θ̈ cos θ) − b ẋ]/(M+m)
 * Sign convention: θ > 0 leans toward +x; F > 0 pushes the cart toward +x (which rights a θ > 0 pole).
 * Tipping time constant of a rod on a fixed pivot: τ = √(2L / 3g).
 *
 * Everything here is allocation-free in the hot paths (Float64Array scratch buffers).
 * Erasable TypeScript only, so `node file.ts` can run the numeric self-checks.
 */

export const G_EARTH = 9.81;
export const G_MARS = 3.71;
export const G_MOON = 1.62;
export const DEG = Math.PI / 180;

export interface Plant {
  /** cart mass (kg) */
  M: number;
  /** rod mass (kg) */
  m: number;
  /** rod length (m) */
  L: number;
  /** cart friction (N·s/m) */
  b: number;
  /** gravity (m/s²) */
  g: number;
}

/** Tipping time constant τ = √(2L / 3g) of a uniform rod on a fixed pivot (GDD Appendix B). */
export function tippingTime(L: number, g: number): number {
  return Math.sqrt((2 * L) / (3 * g));
}

/** Small PRNG (mulberry32), deterministic per seed. */
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

/** Standard normal from a uniform source (Box–Muller, one value per call). */
export function gauss(r: () => number): number {
  const u = 1 - r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── dynamics ─────────────────────────────────────────────────────────────────

/** [ẍ, θ̈] for state (v, θ, ω) and force F. */
export function accel(p: Plant, v: number, th: number, w: number, F: number, out: Float64Array): void {
  const l = p.L * 0.5;
  const tot = p.M + p.m;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const tmp = (F + p.m * l * w * w * s - p.b * v) / tot;
  const thAcc = (p.g * s - c * tmp) / (l * (4 / 3 - (p.m * c * c) / tot));
  out[0] = tmp - (p.m * l * thAcc * c) / tot;
  out[1] = thAcc;
}

const _k1 = new Float64Array(2);
const _k2 = new Float64Array(2);
const _k3 = new Float64Array(2);
const _k4 = new Float64Array(2);

/** Classic RK4 step of state s = [x, ẋ, θ, θ̇] (in place). Force F held over the step. */
export function rk4(p: Plant, s: Float64Array, F: number, dt: number): void {
  const x = s[0],
    v = s[1],
    th = s[2],
    w = s[3];
  accel(p, v, th, w, F, _k1);
  const h = dt * 0.5;
  accel(p, v + h * _k1[0], th + h * w, w + h * _k1[1], F, _k2);
  const v2 = v + h * _k1[0],
    w2 = w + h * _k1[1];
  accel(p, v + h * _k2[0], th + h * w2, w + h * _k2[1], F, _k3);
  const v3 = v + h * _k2[0],
    w3 = w + h * _k2[1];
  accel(p, v + dt * _k3[0], th + dt * w3, w + dt * _k3[1], F, _k4);
  const v4 = v + dt * _k3[0],
    w4 = w + dt * _k3[1];
  s[0] = x + (dt / 6) * (v + 2 * v2 + 2 * v3 + v4);
  s[1] = v + (dt / 6) * (_k1[0] + 2 * _k2[0] + 2 * _k3[0] + _k4[0]);
  s[2] = th + (dt / 6) * (w + 2 * w2 + 2 * w3 + w4);
  s[3] = w + (dt / 6) * (_k1[1] + 2 * _k2[1] + 2 * _k3[1] + _k4[1]);
}

// ── A: the hand-balanced cart-pole ───────────────────────────────────────────

export const HAND = {
  M: 5,
  m: 1,
  b: 0.5,
  /**
   * push force (N). GDD: 40 N. Lowered to 20 N after a delayed-human check (0.25 s reaction, 80 ms
   * minimum key press, 60 Hz decisions): with 40 N every tap overshoots ~10× and no configuration
   * holds for 5 s; with 20 N the 2 m pole holds on Mars and the Moon, while the 0.5 m pole and the
   * Earth stay out of reach (same lesson). The debug autopilot still holds every configuration.
   */
  force: 20,
  /** force ramp time (s) */
  ramp: 0.05,
  /** start tilt (rad) */
  theta0: 1.5 * DEG,
  failTheta: 30 * DEG,
  stopTheta: 75 * DEG,
  railHalf: 2.7,
  dt: 0.001,
} as const;

export const POLE_LENGTHS = [0.5, 1, 2] as const;
export const GRAVITIES = [
  { id: 'erde', g: G_EARTH },
  { id: 'mars', g: G_MARS },
  { id: 'mond', g: G_MOON },
] as const;

// ── B: the giant pendulum (L = 1 m, drawn 12×) ──────────────────────────────

export const GIANT = {
  M: 5,
  m: 1,
  L: 1,
  b: 0.5,
  /** visual scale */
  scale: 12,
  /** rail half-length in sim metres (16 m track drawn 12× → ±0.667 m, minus half the cart) */
  railHalf: 0.6,
  failTheta: 30 * DEG,
  stopTheta: 75 * DEG,
  /** actuator limit (N) */
  fMax: 120,
  /** fixed gains (cart position / velocity), the player tunes Kp and Kd */
  Kx: 8,
  Kv: 14,
  /** presets for (Kp, Kd): only P swings up and falls, little D rings, tuned holds */
  presets: {
    nurP: [450, 0] as [number, number],
    pd: [450, 15] as [number, number],
    gut: [450, 45] as [number, number],
  },
  kpMax: 1200,
  kdMax: 120,
  /** Schubs: 30 N for 0.1 s */
  pushF: 30,
  pushT: 0.1,
  takts: [1000, 200, 50, 20, 10, 5] as const,
  skillRates: [5, 30, 100, 200] as const,
  plannerRates: [0.2, 0.5, 1, 2, 5] as const,
  marks: [-0.38, 0, 0.38] as const,
  /** reference ramp speed (sim m/s) */
  refSpeed: 0.12,
} as const;

export interface LoopEvents {
  onFall?(): void;
  onStop?(): void;
  onSample?(): void;
}

/**
 * The giant pendulum's control loop: plant at 1 kHz (RK4), controller sampled at the Takt with a
 * zero-order hold, measurement delayed by a latency FIFO, three-layer "Gehirn-Stapel" reference
 * (Planer picks rail marks, Skill samples the ramped reference, Reflex = the Takt).
 */
export class GiantLoop {
  readonly s = new Float64Array(4);
  plant: Plant = { M: GIANT.M, m: GIANT.m, L: GIANT.L, b: GIANT.b, g: G_EARTH };
  takt = 1000;
  latencyMs = 0;
  Kp: number = GIANT.presets.gut[0];
  Kd: number = GIANT.presets.gut[1];
  Kx: number = GIANT.Kx;
  Kv: number = GIANT.Kv;
  skillHz = 100;
  plannerHz = 0.5;
  plannerOn = true;
  /** ms counter (integer, 1 kHz) */
  tick = 0;
  /** held command */
  u = 0;
  /** external force on the cart (pushes, gusts), N */
  ext = 0;
  fallen = false;
  stopped = false;
  /** rail end-stop hit this run */
  hitStop = false;
  /** seconds since the last (re)start */
  t = 0;
  /** reference layers */
  ramp = 0;
  target = 0;
  xref = 0;
  markIdx = 1;
  markDir = 1;
  sampleCount = 0;
  private hist = new Float64Array(4 * 256);
  private xPrev = 0;
  private thPrev = 0;
  private primed = false;
  private histHead = 0;
  private noise: (() => number) | null = null;
  noiseTheta = 0;
  ev: LoopEvents = {};

  constructor() {
    this.reset(0);
  }

  reset(theta0 = 0): void {
    this.s[0] = 0;
    this.s[1] = 0;
    this.s[2] = theta0;
    this.s[3] = 0;
    this.u = 0;
    this.ext = 0;
    this.fallen = false;
    this.stopped = false;
    this.hitStop = false;
    this.t = 0;
    this.ramp = 0;
    this.target = 0;
    this.xref = 0;
    this.markIdx = 1;
    this.tick = 0;
    this.primed = false;
    for (let i = 0; i < 256; i++) {
      const o = i * 4;
      this.hist[o] = 0;
      this.hist[o + 1] = 0;
      this.hist[o + 2] = theta0;
      this.hist[o + 3] = 0;
    }
  }

  setNoise(r: (() => number) | null, sigmaRad: number): void {
    this.noise = r;
    this.noiseTheta = sigmaRad;
  }

  /** Advance one millisecond. */
  step(): void {
    const s = this.s;
    const dt = 0.001;
    // record the measurement history (1 kHz) for the latency FIFO
    this.histHead = (this.histHead + 1) & 255;
    const o = this.histHead * 4;
    this.hist[o] = s[0];
    this.hist[o + 1] = s[1];
    this.hist[o + 2] = s[2];
    this.hist[o + 3] = s[3];

    if (!this.fallen) {
      // planner (few Hz): pick the next rail mark once the reference has arrived
      const pEvery = Math.max(1, Math.round(1000 / this.plannerHz));
      if (this.plannerOn && this.tick % pEvery === 0 && Math.abs(this.ramp - this.target) < 1e-4) {
        if (this.markIdx === 0) this.markDir = 1;
        else if (this.markIdx === GIANT.marks.length - 1) this.markDir = -1;
        this.markIdx += this.markDir;
        this.target = GIANT.marks[this.markIdx];
      }
      if (!this.plannerOn) this.target = 0;
      // continuous ramp toward the target
      const dr = GIANT.refSpeed * dt;
      const e = this.target - this.ramp;
      this.ramp += Math.abs(e) <= dr ? e : Math.sign(e) * dr;
      // skill (30–200 Hz): samples the ramp with a zero-order hold
      const sEvery = Math.max(1, Math.round(1000 / this.skillHz));
      if (this.tick % sEvery === 0) this.xref = this.ramp;
      // reflex (the Takt): sample the delayed measurement, compute u, hold it
      const every = Math.max(1, Math.round(1000 / this.takt));
      if (this.tick % every === 0) {
        const lag = Math.min(255, Math.round(this.latencyMs));
        const q = ((this.histHead - lag) & 255) * 4;
        const xm = this.hist[q];
        let th = this.hist[q + 2];
        if (this.noise && this.noiseTheta > 0) th += gauss(this.noise) * this.noiseTheta;
        // digital controller: encoders give x and θ; velocities are differences of consecutive samples,
        // so a slow Takt measures late twice (hold + difference). That is what makes 10 Hz fail.
        const T = every / 1000;
        const v = this.primed ? (xm - this.xPrev) / T : 0;
        const w = this.primed ? (th - this.thPrev) / T : 0;
        const u = this.Kp * th + this.Kd * w + this.Kx * (xm - this.xref) + this.Kv * v;
        this.xPrev = xm;
        this.thPrev = th;
        this.primed = true;
        this.u = u > GIANT.fMax ? GIANT.fMax : u < -GIANT.fMax ? -GIANT.fMax : u;
        this.sampleCount++;
        this.ev.onSample?.();
      }
    }

    const F = this.fallen ? 0 : this.u + this.ext;
    if (this.stopped) return;
    rk4(this.plant, s, F, dt);
    // rail end stops (inelastic)
    if (s[0] > GIANT.railHalf || s[0] < -GIANT.railHalf) {
      s[0] = Math.sign(s[0]) * GIANT.railHalf;
      // momentum of the cart goes into the pole: the stop is a hard disturbance
      s[3] -= (s[1] * Math.cos(s[2])) / (this.plant.L * 0.5 * (4 / 3)) * 0.75;
      s[1] = 0;
      this.hitStop = true;
    }
    if (!this.fallen && Math.abs(s[2]) > GIANT.failTheta) {
      this.fallen = true;
      this.ev.onFall?.();
    }
    if (this.fallen && Math.abs(s[2]) >= GIANT.stopTheta) {
      s[2] = Math.sign(s[2]) * GIANT.stopTheta;
      s[3] = 0;
      s[1] = 0;
      this.stopped = true;
      this.ev.onStop?.();
    }
    this.tick++;
    this.t += dt;
  }
}
