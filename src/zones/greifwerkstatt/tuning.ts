/**
 * Greifwerkstatt tunables (plan §4 conventions: WP20 edits only this file). Station C „Lastdiagramm“:
 * thresholds, timings, the bench layout and the juice. Facts with sources live in strings.ts and
 * lastModel.ts; the servo figures here are the vendors' numbers (R1 §1.1), not tunables to play with.
 */
import { KGCM } from './lastModel';

/** STS3215 (C001, 7.4 V class) at 6 V (R1 §1.1): rated 6,5 kg·cm (Feetech [S36]); stall 16,5 (SO-ARM100 README [S1]) to 19,5 kg·cm (Feetech [S36]) */
export const SERVO = { nennKgcm: 6.5, stallLoKgcm: 16.5, stallHiKgcm: 19.5 } as const;
export const LIMITS = { nenn: SERVO.nennKgcm * KGCM, lo: SERVO.stallLoKgcm * KGCM, hi: SERVO.stallHiKgcm * KGCM } as const;

export const LD = {
  /** the six reach points of „Lastdiagramm aufnehmen“ (m, shoulder axis → grasp point, R1: 0,41 stretched) */
  reaches: [0.1, 0.16, 0.22, 0.29, 0.35, 0.41] as readonly number[],
  /** ★: a diagram with at least this many reach points */
  stampPoints: 4,
  /** the measuring height and the carrying height (m above the shoulder axis) */
  measureH: 0,
  carryH: 0,
  /** LMB held: the jaws go down to this height (m, relative to the shoulder axis) */
  lowH: -0.055,
  /** ★★: the prediction „stretched, lasting“ within ± this many grams of the model */
  tipTolG: 40,
  /** the prediction slider (g) */
  predict: { min: 0, max: 500, step: 10, initial: 200 },
  /** test weights (g) on the rack; F hangs the next one */
  weights: [20, 50, 100, 200] as readonly number[],
  /** the gear part (kg) */
  gearKg: 0.1,
  /** the measurement run (s per reach point, at 2×): drive there, then the bisection animation */
  driveS: 0.4,
  bisectS: 0.9,
  /** bisection steps shown per curve (the value comes from 12 steps) */
  bisectShown: 7,
  /** the arm follows the target with this time constant (s); the sag eases in with this one */
  followTau: 0.09,
  sagTau: 0.35,
  /** the sag shows above the stall band's upper edge, a tremble inside the band */
  trembleRad: 0.012,
} as const;

/**
 * The gear task (★★★, plan §4.4): the gear on its pedestal at the front, the box at the back, 0,35 m
 * apart (centre to centre). Azimuth about the pan axis (rad, + = toward the back of the bench), reach
 * and height relative to the shoulder axis. Checked solvable under Nenn by tools/lastdiagramm-check.mjs.
 */
const D = Math.PI / 180;
export const TASK = {
  gear: { az: -58 * D, r: 0.235, h: -0.03 },
  box: { az: 48 * D, r: 0.21, h: -0.05 },
  /** grip / drop tolerance (m, horizontal) */
  tol: 0.035,
  /** box inner half-size (m) */
  boxHalf: 0.045,
} as const;

/** the bench in zone-local coordinates: the arm's base, facing +x (its zero pose points this way) */
export const BENCH = { x: 6.25, z: 6.5, yaw: 0 } as const;
