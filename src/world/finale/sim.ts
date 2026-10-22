/**
 * Finale toy model (GDD §6.6): the island's attitude loop, one axis per roll and pitch.
 *
 *   θ'' = λ²·θ + u(t − 0.15 s) + d(t)          (θ in degrees, torques in °/s², I = 1)
 *
 * λ = 0.8 s⁻¹ makes the island top-heavy and mildly unstable; the actuator lag is 150 ms.
 * Two controllers are audited over 200 gust trials each (67 / 67 / 66 for ruhig / böig / Sturm):
 *   - Bestand: PD + I, conservative gains;
 *   - NN-Lage v2: a policy fitted on calm data only. It acts as an aggressive PD for |θ| ≤ 0.8°;
 *     beyond that its error input bends back (θ_eff = sign(θ)·0.8° − 0.6·(θ − sign(θ)·0.8°)),
 *     the extrapolation error that loses control in big gusts.
 * A trial succeeds when |θ| < 3° on both axes for the whole 20 s.
 *
 * Pure, deterministic (seeded) and dependency-free: the tuning script runs it under Node.
 * Everything here is FIKTION / SIM (a toy model), never a real controller.
 */

export type Cond = 'ruhig' | 'boeig' | 'sturm';
export type CtrlId = 'nn' | 'bestand';

export const CONDS: Cond[] = ['ruhig', 'boeig', 'sturm'];
export const CTRLS: CtrlId[] = ['nn', 'bestand'];

/** gust strength ranges per weather condition (GDD §6.6) */
export const COND_RANGES: Record<Cond, [number, number]> = { ruhig: [0, 0.2], boeig: [0.2, 0.6], sturm: [0.6, 1.0] };
/** 200 trials per controller */
export const TRIALS: Record<Cond, number> = { ruhig: 67, boeig: 67, sturm: 66 };

export const MODEL = {
  /** s⁻¹ — unstable pole of the top-heavy island */
  lambda: 0.8,
  /** s — actuator lag */
  delay: 0.15,
  /** Hz — integration and controller rate of a trial */
  hz: 200,
  /** s — length of a trial */
  duration: 20,
  /** ° — success: |θ| stays below this on both axes */
  limit: 3,
  /** °/s² of gust torque per unit gust strength */
  gustTorque: 10.6,
  /** s — gust duration range */
  gustDur: [0.6, 4] as [number, number],
  /** gusts per 20 s trial [min, max] by condition: böig = many short gusts that can stack */
  gustCount: { ruhig: [2, 4], boeig: [8, 11], sturm: [3, 5] } as Record<Cond, [number, number]>,
  /** °/s² — thrust authority (saturation) */
  uMax: 16,
  /** ° — IMU noise (1σ) on the measured angle */
  imuNoise: 0.02,
  /** ° — the NN's training envelope: beyond this its error input bends back */
  nnBend: 0.8,
  nnBendSlope: 0.6,
  /** ° — mechanical bumper of the toy model (keeps diverging traces finite) */
  bumper: 8,
};

export const GAINS = {
  bestand: { kp: 4.2, kd: 2.6, ki: 0.6 },
  nn: { kp: 7, kd: 3.4 },
  /** F1 "Regler übernimmt": levels the island in about 1.5 s */
  takeover: { kp: 7.5, kd: 4.2 },
};

// ── random ───────────────────────────────────────────────────────────────────

export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// ── gusts ────────────────────────────────────────────────────────────────────

export interface Gust {
  /** start (s) */
  t0: number;
  /** duration (s) */
  dur: number;
  /** strength 0…1 */
  s: number;
  /** compass bearing (deg) the gust pushes toward */
  b: number;
}

/** Raised-cosine gust pulse value at time t (0…1). */
export function gustShape(g: Gust, t: number): number {
  const k = (t - g.t0) / g.dur;
  if (k <= 0 || k >= 1) return 0;
  const s = Math.sin(Math.PI * k);
  return s * s;
}

/**
 * Gust sequence of one trial. `q` = stratified quantiles (strength, bearing, duration) of the
 * trial's strongest gust inside the condition's range: Latin-hypercube sampling keeps the rate
 * estimate stable from run to run. The other gusts are weaker and fully random.
 */
export function makeGusts(cond: Cond, q: [number, number, number], r: () => number): Gust[] {
  const [lo, hi] = COND_RANGES[cond];
  const [c0, c1] = MODEL.gustCount[cond];
  const n = c0 + Math.floor(r() * (c1 - c0 + 1));
  const [d0, d1] = MODEL.gustDur;
  const sMax = lo + q[0] * (hi - lo);
  const out: Gust[] = [{ t0: 0.8 + r() * 15.5, dur: d0 + q[2] * (d1 - d0), s: sMax, b: q[1] * 360 }];
  for (let i = 1; i < n; i++) out.push({ t0: 0.8 + r() * 15.5, dur: d0 + r() * (d1 - d0), s: lo + r() * (sMax - lo), b: r() * 360 });
  return out;
}

// ── controllers ──────────────────────────────────────────────────────────────

/** NN-Lage v2 error input: identity inside ±0.8°, bends back outside (extrapolation error). */
export function nnBend(theta: number): number {
  const b = MODEL.nnBend;
  if (Math.abs(theta) <= b) return theta;
  const sg = Math.sign(theta);
  return sg * b - MODEL.nnBendSlope * (theta - sg * b);
}

function clamp(v: number, a: number): number {
  return v < -a ? -a : v > a ? a : v;
}

// ── one trial ────────────────────────────────────────────────────────────────

export interface TrialResult {
  ok: boolean;
  /** time of the first |θ| ≥ 3° (s), or -1 */
  failT: number;
  /** max tilt magnitude (deg) */
  maxTilt: number;
  /** tilt magnitude sampled at 10 Hz (201 points), for the curve plot */
  trace: Float32Array;
}

const TRACE_HZ = 10;

/** Simulate one 20 s trial of a controller against a gust sequence (deterministic for `seed`). */
export function runTrial(ctrl: CtrlId, gusts: Gust[], seed: number, keepTrace = true): TrialResult {
  const r = rng32(seed ^ 0x9e3779b9);
  const dt = 1 / MODEL.hz;
  const steps = Math.round(MODEL.duration * MODEL.hz);
  const lag = Math.round(MODEL.delay * MODEL.hz);
  const l2 = MODEL.lambda * MODEL.lambda;
  const D = MODEL.gustTorque;
  // pre-split gust bearings into roll / pitch components
  const gx = gusts.map((g) => Math.sin((g.b * Math.PI) / 180));
  const gz = gusts.map((g) => -Math.cos((g.b * Math.PI) / 180));
  // state per axis: [roll, pitch]
  let th0 = (r() - 0.5) * 0.1,
    th1 = (r() - 0.5) * 0.1,
    w0 = 0,
    w1 = 0,
    i0 = 0,
    i1 = 0;
  const buf0 = new Float32Array(lag + 1),
    buf1 = new Float32Array(lag + 1);
  let head = 0;
  // slow turbulence (first-order filtered noise), proportional to the condition's mean strength
  let tb0 = 0,
    tb1 = 0;
  const sMean = gusts.reduce((a, g) => a + g.s, 0) / Math.max(1, gusts.length);
  const turb = 0.18 * D * sMean;
  const trace = keepTrace ? new Float32Array(MODEL.duration * TRACE_HZ + 1) : new Float32Array(0);
  const every = MODEL.hz / TRACE_HZ;
  let ok = true,
    failT = -1,
    maxTilt = 0;
  const G = ctrl === 'nn' ? GAINS.nn : GAINS.bestand;
  const ki = ctrl === 'bestand' ? GAINS.bestand.ki : 0;
  for (let s = 0; s <= steps; s++) {
    const t = s * dt;
    // measure (IMU noise) and control
    const m0 = th0 + gauss(r) * MODEL.imuNoise,
      m1 = th1 + gauss(r) * MODEL.imuNoise;
    let u0: number, u1: number;
    if (ctrl === 'nn') {
      u0 = -(G.kp * nnBend(m0) + G.kd * w0);
      u1 = -(G.kp * nnBend(m1) + G.kd * w1);
    } else {
      i0 = clamp(i0 + m0 * dt, 4);
      i1 = clamp(i1 + m1 * dt, 4);
      u0 = -(G.kp * m0 + G.kd * w0 + ki * i0);
      u1 = -(G.kp * m1 + G.kd * w1 + ki * i1);
    }
    u0 = clamp(u0, MODEL.uMax);
    u1 = clamp(u1, MODEL.uMax);
    // actuator lag: the thrust applied now was commanded `lag` steps ago
    buf0[head] = u0;
    buf1[head] = u1;
    head = (head + 1) % (lag + 1);
    const a0 = buf0[head],
      a1 = buf1[head];
    // disturbance
    let d0 = 0,
      d1 = 0;
    for (let k = 0; k < gusts.length; k++) {
      const v = gustShape(gusts[k], t);
      if (v <= 0) continue;
      const f = v * gusts[k].s * D;
      d0 += gx[k] * f;
      d1 += gz[k] * f;
    }
    tb0 += (gauss(r) * turb - tb0) * dt * 1.5;
    tb1 += (gauss(r) * turb - tb1) * dt * 1.5;
    d0 += tb0;
    d1 += tb1;
    // integrate (semi-implicit Euler)
    w0 += (l2 * th0 + a0 + d0) * dt;
    w1 += (l2 * th1 + a1 + d1) * dt;
    th0 += w0 * dt;
    th1 += w1 * dt;
    if (Math.abs(th0) > MODEL.bumper) {
      th0 = Math.sign(th0) * MODEL.bumper;
      w0 = 0;
    }
    if (Math.abs(th1) > MODEL.bumper) {
      th1 = Math.sign(th1) * MODEL.bumper;
      w1 = 0;
    }
    const tilt = Math.max(Math.abs(th0), Math.abs(th1));
    if (tilt > maxTilt) maxTilt = tilt;
    if (ok && tilt >= MODEL.limit) {
      ok = false;
      failT = t;
      if (!keepTrace) break;
    }
    if (keepTrace && s % every === 0) trace[s / every] = tilt;
  }
  return { ok, failT, maxTilt, trace };
}

// ── the audit: 200 trials per controller ────────────────────────────────────

export interface TrialSpec {
  cond: Cond;
  /** index inside the condition */
  i: number;
  gusts: Gust[];
  seed: number;
}

/** The trial plan for an audit with base seed `seed` (both controllers face the same gusts). */
export function planAudit(seed: number): TrialSpec[] {
  const r = rng32(seed);
  const out: TrialSpec[] = [];
  for (const cond of CONDS) {
    const n = TRIALS[cond];
    // Latin hypercube: stratified quantiles for strength, bearing and duration, each shuffled
    const strata = (): number[] => {
      const q = Array.from({ length: n }, (_, i) => (i + r()) / n);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
      return q;
    };
    const qs = strata(),
      qb = strata(),
      qd = strata();
    for (let i = 0; i < n; i++) {
      const tr = rng32(Math.floor(r() * 2 ** 31));
      out.push({ cond, i, gusts: makeGusts(cond, [qs[i], qb[i], qd[i]], tr), seed: Math.floor(r() * 2 ** 31) });
    }
  }
  return out;
}

export interface Tally {
  k: number;
  n: number;
}
export type AuditTally = Record<CtrlId, Record<Cond, Tally>>;

export function emptyTally(): AuditTally {
  const z = (): Record<Cond, Tally> => ({ ruhig: { k: 0, n: 0 }, boeig: { k: 0, n: 0 }, sturm: { k: 0, n: 0 } });
  return { nn: z(), bestand: z() };
}

/** Run a whole audit at once (tests / tuning). */
export function runAudit(seed: number, keepTrace = false): { tally: AuditTally; results: { spec: TrialSpec; nn: TrialResult; bestand: TrialResult }[] } {
  const tally = emptyTally();
  const results = planAudit(seed).map((spec) => {
    const nn = runTrial('nn', spec.gusts, spec.seed, keepTrace);
    const bestand = runTrial('bestand', spec.gusts, spec.seed, keepTrace);
    for (const [id, res] of [['nn', nn], ['bestand', bestand]] as const) {
      tally[id][spec.cond].n++;
      if (res.ok) tally[id][spec.cond].k++;
    }
    return { spec, nn, bestand };
  });
  return { tally, results };
}

// ── F1 "Hand am Steuer": the same plant, live, with the player's hand as controller ──

export interface LivePlant {
  /** roll / pitch (deg) */
  readonly theta: [number, number];
  readonly omega: [number, number];
  /** thrust actually applied now (after the lag), °/s² */
  readonly applied: [number, number];
  /** current disturbance (°/s²) */
  readonly disturbance: [number, number];
  t: number;
  /** advance by dt with commanded thrust (u0, u1) in °/s² (already scaled) */
  step(dt: number, u0: number, u1: number): void;
  /** controller command for the take-over (classic PD), °/s² */
  takeover(): [number, number];
}

/** F1's three scripted gust pulses (strength, bearing, start, duration). */
export const F1_GUSTS: Gust[] = [
  { t0: 1.6, dur: 2.6, s: 0.5, b: 290 },
  { t0: 6.0, dur: 2.2, s: 0.75, b: 115 },
  { t0: 10.2, dur: 2.8, s: 0.95, b: 20 },
];

export const F1 = {
  /** s of hand control before "Regler übernimmt" */
  duration: 15,
  /** °/s² thrust at full cursor deflection */
  uMax: 14,
  /** hard stop of the toy model during F1 (deg) */
  bumper: 4.5,
};

export function createLivePlant(gusts: Gust[] = F1_GUSTS, seed = 7): LivePlant {
  const r = rng32(seed);
  const hz = 240;
  const lag = Math.round(MODEL.delay * hz);
  const buf0 = new Float32Array(lag + 1),
    buf1 = new Float32Array(lag + 1);
  let head = 0;
  let acc = 0;
  const l2 = MODEL.lambda * MODEL.lambda;
  const th: [number, number] = [0.25, -0.15];
  const w: [number, number] = [0, 0];
  const ap: [number, number] = [0, 0];
  const dist: [number, number] = [0, 0];
  let tb0 = 0,
    tb1 = 0;
  const plant: LivePlant = {
    theta: th,
    omega: w,
    applied: ap,
    disturbance: dist,
    t: 0,
    step(dtFrame, u0, u1) {
      acc += Math.min(0.1, dtFrame);
      const dt = 1 / hz;
      while (acc >= dt) {
        acc -= dt;
        plant.t += dt;
        buf0[head] = clamp(u0, MODEL.uMax);
        buf1[head] = clamp(u1, MODEL.uMax);
        head = (head + 1) % (lag + 1);
        ap[0] = buf0[head];
        ap[1] = buf1[head];
        let d0 = 0,
          d1 = 0;
        for (const g of gusts) {
          const v = gustShape(g, plant.t);
          if (v <= 0) continue;
          const f = v * g.s * MODEL.gustTorque;
          d0 += Math.sin((g.b * Math.PI) / 180) * f;
          d1 += -Math.cos((g.b * Math.PI) / 180) * f;
        }
        tb0 += (gauss(r) * 1.2 - tb0) * dt * 1.5;
        tb1 += (gauss(r) * 1.2 - tb1) * dt * 1.5;
        dist[0] = d0 + tb0;
        dist[1] = d1 + tb1;
        for (let a = 0; a < 2; a++) {
          w[a] += (l2 * th[a] + ap[a] + dist[a]) * dt;
          th[a] += w[a] * dt;
          if (Math.abs(th[a]) > F1.bumper) {
            th[a] = Math.sign(th[a]) * F1.bumper;
            w[a] = 0;
          }
        }
      }
    },
    takeover() {
      const G = GAINS.takeover;
      return [-(G.kp * th[0] + G.kd * w[0]), -(G.kp * th[1] + G.kd * w[1])];
    },
  };
  return plant;
}

/**
 * Protocol seeds validated against the GDD §6.6 acceptance targets with a 2-trial margin
 * (NN 100/88–93/33–47 %, Bestand ≥ 97/≥ 96/88–92 %). Each audit picks one at random: the
 * numbers differ a little from player to player (that is what the Wilson band is for), the
 * targets always hold, and every run is reproducible from its seed (question 3).
 */
export const SEED_POOL = [
  2246822519, 198677742, 2445500261, 794710968, 3240211229, 3438888971, 2781488388, 1329376837, 3576199356, 1528054579, 274620770, 3316154257, 1268009480, 1466687222, 1665364964, 3912187483, 4110865225,
  2261398190, 213253413, 411931155, 610608897, 2857431416, 1206642123, 3652142384,
];

/** The classic controller flying F1's 15 s with the same gusts (for the honest side-by-side). */
export function controllerF1(): { max: number; over: number } {
  const p = createLivePlant();
  const dt = 1 / 120;
  let max = 0,
    over = 0;
  for (let t = 0; t < F1.duration; t += dt) {
    const [u0, u1] = p.takeover();
    p.step(dt, u0, u1);
    const tilt = Math.max(Math.abs(p.theta[0]), Math.abs(p.theta[1]));
    max = Math.max(max, tilt);
    if (tilt >= MODEL.limit) over += dt;
  }
  return { max, over };
}


// ── the lift-off's gust in the cloud (Phase 7 plan §4.15): the F3 choice flies ─────────────────────

/** Pilot → NN-Lage v2 · Pilot mit Auflage → NN until it leaves its training envelope, then Bestand · Kein Pilot → Bestand. */
export type CloudCtrl = 'nn' | 'bestand' | 'cond';

export interface CloudRun {
  /** roll / pitch (deg) sampled at `hz` */
  roll: Float32Array;
  pitch: Float32Array;
  hz: number;
  /** 'cond': when it fell back to Bestand (s), else −1 */
  fallbackT: number;
  /** the NN was outside its training envelope (|θ| > nnBend) at these samples (the shudder) */
  outside: Uint8Array;
  ok: boolean;
  maxTilt: number;
}

/**
 * The same plant as runTrial (θ'' = λ²θ + u(t − 0.15 s) + d), `seconds` long, with the attitude of both
 * axes kept for the visual tilt and the telemetry (runTrial keeps only |θ|). 'cond' switches from NN to
 * Bestand the first time the measured |θ| leaves NN's training envelope — the fallback of the
 * recommendation „Pilot mit Auflage“. `hz` divides 200 (40 → every 5th step). Deterministic for `seed`;
 * F2's audit does not use it.
 */
export function runCloudGust(ctrl: CloudCtrl, gusts: readonly Gust[], seed: number, seconds: number, hz = 40): CloudRun {
  const r = rng32(seed ^ 0x9e3779b9);
  const dt = 1 / MODEL.hz;
  const steps = Math.round(seconds * MODEL.hz);
  const lag = Math.round(MODEL.delay * MODEL.hz);
  const l2 = MODEL.lambda * MODEL.lambda;
  const D = MODEL.gustTorque;
  const gx = gusts.map((g) => Math.sin((g.b * Math.PI) / 180));
  const gz = gusts.map((g) => -Math.cos((g.b * Math.PI) / 180));
  let th0 = (r() - 0.5) * 0.1,
    th1 = (r() - 0.5) * 0.1,
    w0 = 0,
    w1 = 0,
    i0 = 0,
    i1 = 0;
  const buf0 = new Float32Array(lag + 1),
    buf1 = new Float32Array(lag + 1);
  let head = 0;
  let tb0 = 0,
    tb1 = 0;
  const sMean = gusts.reduce((a, g) => a + g.s, 0) / Math.max(1, gusts.length);
  const turb = 0.18 * D * sMean;
  const n = Math.floor(seconds * hz) + 1;
  const roll = new Float32Array(n),
    pitch = new Float32Array(n),
    outside = new Uint8Array(n);
  // a sample every `every` steps (hz must divide the plant's 200 Hz)
  const every = Math.max(1, Math.round(MODEL.hz / hz));
  let mode: 'nn' | 'bestand' = ctrl === 'bestand' ? 'bestand' : 'nn';
  let fallbackT = -1,
    ok = true,
    maxTilt = 0,
    wasOutside = false;
  for (let s = 0; s <= steps; s++) {
    const t = s * dt;
    const m0 = th0 + gauss(r) * MODEL.imuNoise,
      m1 = th1 + gauss(r) * MODEL.imuNoise;
    const out = Math.abs(m0) > MODEL.nnBend || Math.abs(m1) > MODEL.nnBend;
    if (ctrl === 'cond' && mode === 'nn' && out) {
      mode = 'bestand';
      fallbackT = t;
    }
    let u0: number, u1: number;
    if (mode === 'nn') {
      const G = GAINS.nn;
      u0 = -(G.kp * nnBend(m0) + G.kd * w0);
      u1 = -(G.kp * nnBend(m1) + G.kd * w1);
    } else {
      const G = GAINS.bestand;
      i0 = clamp(i0 + m0 * dt, 4);
      i1 = clamp(i1 + m1 * dt, 4);
      u0 = -(G.kp * m0 + G.kd * w0 + G.ki * i0);
      u1 = -(G.kp * m1 + G.kd * w1 + G.ki * i1);
    }
    buf0[head] = clamp(u0, MODEL.uMax);
    buf1[head] = clamp(u1, MODEL.uMax);
    head = (head + 1) % (lag + 1);
    const a0 = buf0[head],
      a1 = buf1[head];
    let d0 = 0,
      d1 = 0;
    for (let k = 0; k < gusts.length; k++) {
      const v = gustShape(gusts[k], t);
      if (v <= 0) continue;
      const f = v * gusts[k].s * D;
      d0 += gx[k] * f;
      d1 += gz[k] * f;
    }
    tb0 += (gauss(r) * turb - tb0) * dt * 1.5;
    tb1 += (gauss(r) * turb - tb1) * dt * 1.5;
    w0 += (l2 * th0 + a0 + d0 + tb0) * dt;
    w1 += (l2 * th1 + a1 + d1 + tb1) * dt;
    th0 += w0 * dt;
    th1 += w1 * dt;
    if (Math.abs(th0) > MODEL.bumper) {
      th0 = Math.sign(th0) * MODEL.bumper;
      w0 = 0;
    }
    if (Math.abs(th1) > MODEL.bumper) {
      th1 = Math.sign(th1) * MODEL.bumper;
      w1 = 0;
    }
    const tilt = Math.max(Math.abs(th0), Math.abs(th1));
    if (tilt > maxTilt) maxTilt = tilt;
    if (tilt >= MODEL.limit) ok = false;
    wasOutside ||= mode === 'nn' && out;
    if (s % every === 0) {
      const i = s / every;
      roll[i] = th0;
      pitch[i] = th1;
      outside[i] = wasOutside ? 1 : 0;
      wasOutside = false;
    }
  }
  return { roll, pitch, hz, fallbackT, outside, ok, maxTilt };
}
