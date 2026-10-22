/**
 * Station C „Lastdiagramm“ ◆ — the pure model (no three.js, no DOM), plan §4.4.
 *
 * The real SO-101 follower moves in one vertical plane once its base has panned (shoulder_lift,
 * elbow_flex and wrist_flex share one axis direction). Its geometry comes from the loaded GLB (the
 * link frames at the zero pose, lastdiagramm.ts → PlanarArm) and its masses and centres of mass from
 * WP0's manifest (`inertials`, R1 §1.1). Static holding torque about the shoulder_lift axis:
 *
 *   τ = g · (Σ mᵢ · xᵢ + m_load · x_load),   x = horizontal distance from the shoulder axis (m)
 *
 * Reach r = the horizontal distance shoulder axis → grasp point (gripper_frame_link), as in R1 (≈ 0,41 m
 * stretched). Pose rule („die Backen bleiben waagerecht“): the approach direction stays level where the
 * arm can reach the point, else the jaws tilt as little as needed (down first). Payload at a torque
 * limit = the largest load that keeps τ ≤ limit, found by bisection (the rig on the bench does the same).
 * Checked by tools/lastdiagramm-check.mjs: stretched 0 g at the rated torque, 188–261 g in the stall band.
 */

export type Vec2 = readonly [number, number];
export type Q3 = [number, number, number];

/** The arm in its plane: x forward from the pan axis, z up from the base's floor (m), at the zero pose. */
export interface PlanarArm {
  /** shoulder_lift, elbow_flex and wrist_flex axes; P = the grasp point */
  S: Vec2;
  E: Vec2;
  W: Vec2;
  P: Vec2;
  /** +1 / −1: the direction a positive joint value turns the chain in the (x, z) plane (counter-clockwise = +1) */
  s: readonly [number, number, number];
  /** link masses (kg) and centres of mass at the zero pose; seg 1 = turns with shoulder_lift, 2 with elbow_flex, 3 with wrist_flex */
  coms: readonly { m: number; seg: 1 | 2 | 3; c: Vec2 }[];
  /** joint limits (rad), shoulder_lift / elbow_flex / wrist_flex */
  limits: readonly [Vec2, Vec2, Vec2];
}

export const G = 9.81;
/** 1 kg·cm in N·m */
export const KGCM = 0.0980665;

export interface ArmPose {
  q: Q3;
  /** approach tilt (rad, 0 = level, negative = jaws pointing down) */
  beta: number;
  /** the arm's own holding torque (N·m), without the load */
  tauArm: number;
  /** grasp point (planar) */
  p: Vec2;
}

const rot = (v: Vec2, a: number): [number, number] => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};
const sub = (a: Vec2, b: Vec2): [number, number] => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): [number, number] => [a[0] + b[0], a[1] + b[1]];
const wrap = (q: number): number => Math.atan2(Math.sin(q), Math.cos(q));

/** Forward kinematics: the grasp point and the arm's own torque (N·m) for joint values q. */
export function fk(arm: PlanarArm, q: readonly number[]): { p: [number, number]; e: [number, number]; w: [number, number]; tauArm: number; tilt: number } {
  const a1 = arm.s[0] * q[0],
    a2 = a1 + arm.s[1] * q[1],
    a3 = a2 + arm.s[2] * q[2];
  const e = add(arm.S, rot(sub(arm.E, arm.S), a1));
  const w = add(e, rot(sub(arm.W, arm.E), a2));
  const p = add(w, rot(sub(arm.P, arm.W), a3));
  const piv: Vec2[] = [arm.S, arm.S, e, w];
  const zero: Vec2[] = [arm.S, arm.S, arm.E, arm.W];
  const ang = [0, a1, a2, a3];
  let mx = 0;
  for (const c of arm.coms) {
    const at = add(piv[c.seg], rot(sub(c.c, zero[c.seg]), ang[c.seg]));
    mx += c.m * (at[0] - arm.S[0]);
  }
  return { p, e, w, tauArm: G * mx, tilt: a3 };
}

/** Holding torque (N·m) about the shoulder axis for a pose and a load (kg) at the grasp point. */
export function torqueOf(arm: PlanarArm, pose: Pick<ArmPose, 'tauArm' | 'p'>, loadKg: number): number {
  return pose.tauArm + G * loadKg * (pose.p[0] - arm.S[0]);
}

/**
 * Inverse kinematics for the grasp point at reach r and height h (both relative to the shoulder axis)
 * with the approach tilted by beta: both elbow solutions that stay inside the joint limits.
 */
export function solve(arm: PlanarArm, r: number, h: number, beta: number): ArmPose[] {
  const target: Vec2 = [arm.S[0] + r, arm.S[1] + h];
  const l1 = sub(arm.E, arm.S),
    l2 = sub(arm.W, arm.E),
    l3 = sub(arm.P, arm.W);
  const L1 = Math.hypot(l1[0], l1[1]),
    L2 = Math.hypot(l2[0], l2[1]);
  const th1 = Math.atan2(l1[1], l1[0]),
    th2 = Math.atan2(l2[1], l2[0]);
  const w = sub(target, rot(l3, beta));
  const d = sub(w, arm.S);
  const D = Math.hypot(d[0], d[1]);
  const c = (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  if (!(Math.abs(c) <= 1)) return [];
  const out: ArmPose[] = [];
  for (const sg of [1, -1]) {
    const gam = sg * Math.acos(c);
    const phi1 = Math.atan2(d[1], d[0]) - Math.atan2(L2 * Math.sin(gam), L1 + L2 * Math.cos(gam));
    const a1 = phi1 - th1,
      a2 = phi1 + gam - th2;
    const q: Q3 = [wrap(a1 / arm.s[0]), wrap((a2 - a1) / arm.s[1]), wrap((beta - a2) / arm.s[2])];
    if (!q.every((v, i) => v >= arm.limits[i][0] - 1e-9 && v <= arm.limits[i][1] + 1e-9)) continue;
    const f = fk(arm, q);
    out.push({ q, beta, tauArm: f.tauArm, p: f.p });
  }
  return out;
}

/**
 * The pose rule: level jaws where the point is reachable, else the smallest tilt (down first, then up).
 * Of two elbow solutions the one nearer `near` (continuity while steering), else the lower torque.
 */
export function pose(arm: PlanarArm, r: number, h: number, near?: readonly number[] | null, tiltStep = 0.025): ArmPose | null {
  for (let k = 0; k <= 64; k++) {
    for (const beta of k === 0 ? [0] : [-tiltStep * k, tiltStep * k]) {
      const sols = solve(arm, r, h, beta);
      if (!sols.length) continue;
      if (near) return sols.reduce((a, b) => (dist(b.q, near) < dist(a.q, near) ? b : a));
      return sols.reduce((a, b) => (Math.abs(b.tauArm) < Math.abs(a.tauArm) ? b : a));
    }
  }
  return null;
}
const dist = (a: readonly number[], b: readonly number[]): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Largest reach (m) at height h with level jaws (bisection on reachability). */
export function maxReach(arm: PlanarArm, h: number): number {
  let lo = 0.05,
    hi = 0.6;
  if (!solve(arm, lo, h, 0).length) lo = 0.2;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (solve(arm, m, h, 0).length) lo = m;
    else hi = m;
  }
  return lo;
}

/**
 * The rig's bisection: the largest load (kg) in [0, maxKg] with τ ≤ limit at this pose. Returns the
 * value and the loads it tried (for the animation on the bench). 0 when the arm alone is over the limit.
 */
export function bisectPayload(arm: PlanarArm, p: Pick<ArmPose, 'tauArm' | 'p'>, limitNm: number, steps = 12, maxKg = 2.5): { kg: number; tried: number[] } {
  const tried: number[] = [];
  const ok = (m: number): boolean => torqueOf(arm, p, m) <= limitNm + 1e-12;
  if (!ok(0)) return { kg: 0, tried: [0] };
  let lo = 0,
    hi = maxKg;
  for (let i = 0; i < steps; i++) {
    const m = (lo + hi) / 2;
    tried.push(m);
    if (ok(m)) lo = m;
    else hi = m;
  }
  return { kg: lo, tried };
}

/** Exact payload (kg) at a torque limit for a pose (the bisection converges to this). */
export function payloadKg(arm: PlanarArm, p: Pick<ArmPose, 'tauArm' | 'p'>, limitNm: number): number {
  const lever = p.p[0] - arm.S[0];
  if (lever <= 1e-6) return Infinity;
  return Math.max(0, (limitNm - p.tauArm) / (G * lever));
}

export interface Limits {
  /** rated torque (N·m) */
  nenn: number;
  /** stall torque band (N·m): the two sources' figures */
  lo: number;
  hi: number;
}

export interface DiagramPoint {
  r: number;
  /** grams at the rated torque and at the stall band's edges */
  nenn: number;
  lo: number;
  hi: number;
  pose: ArmPose;
}

/** The Lastdiagramm: payload at Nenn and at the stall band over reach, at the measuring height h. */
export function diagramPoint(arm: PlanarArm, r: number, h: number, lim: Limits): DiagramPoint | null {
  const p = pose(arm, r, h);
  if (!p) return null;
  const g = (kg: number): number => Math.round(kg * 1000);
  return { r, nenn: g(bisectPayload(arm, p, lim.nenn).kg), lo: g(bisectPayload(arm, p, lim.lo).kg), hi: g(bisectPayload(arm, p, lim.hi).kg), pose: p };
}

/** How far the shoulder gives way (rad, positive = the arm sinks) until the torque falls to `limit`. 0 when it holds. */
export function sagAngle(arm: PlanarArm, q: readonly number[], loadKg: number, limitNm: number, maxRad = 1.2): number {
  // a positive dq turns the whole chain clockwise in the plane: it sinks forward and down
  const tau = (dq: number): number => torqueOf(arm, fk(arm, [q[0] - dq / arm.s[0], q[1], q[2]]), loadKg);
  if (tau(0) <= limitNm) return 0;
  let lo = 0,
    hi = maxRad;
  if (tau(hi) > limitNm) return hi;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (tau(m) > limitNm) lo = m;
    else hi = m;
  }
  return hi;
}

/** A point of the gear task in the bench frame: azimuth (rad, about the pan axis), reach and height (relative to the shoulder). */
export interface TaskPoint {
  az: number;
  r: number;
  h: number;
}

/**
 * The gear task as a planner sees it (tools/lastdiagramm-check.mjs, the bot): grip at `from`, lift to
 * the carry height, move along the straight line in the carry plane, lower into the box at `to`.
 * Returns the highest torque on the way (N·m) and where it happened; under `nenn` the task is solvable.
 */
export function carryPeak(arm: PlanarArm, from: TaskPoint, to: TaskPoint, carryH: number, loadKg: number, panX: number, n = 60): { peak: number; at: TaskPoint } {
  // planar target → (az, r): the grasp point moves on a straight line in the horizontal carry plane
  const xy = (t: TaskPoint): [number, number] => {
    const rho = t.r + (arm.S[0] - panX);
    return [Math.cos(t.az) * rho, Math.sin(t.az) * rho];
  };
  const back = (x: number, y: number, h: number): TaskPoint => ({ az: Math.atan2(y, x), r: Math.hypot(x, y) - (arm.S[0] - panX), h });
  const legs: TaskPoint[] = [];
  for (let i = 0; i <= 10; i++) legs.push({ ...from, h: from.h + (carryH - from.h) * (i / 10) });
  const A = xy(from),
    B = xy(to);
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    legs.push(back(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, carryH));
  }
  for (let i = 1; i <= 10; i++) legs.push({ ...to, h: carryH + (to.h - carryH) * (i / 10) });
  let peak = -Infinity,
    at = from;
  let near: Q3 | null = null;
  for (const t of legs) {
    const p = pose(arm, t.r, t.h, near);
    if (!p) return { peak: Infinity, at: t };
    near = p.q;
    const tau = torqueOf(arm, p, loadKg);
    if (tau > peak) (peak = tau), (at = t);
  }
  return { peak, at };
}
