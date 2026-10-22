/**
 * Planar 3-link arm for station A „Gelenke" (GDD §7.3): forward kinematics, CCD inverse
 * kinematics with joint limits and a floor/pedestal collision check, and manipulability.
 *
 * Pure maths, no three.js — verified by a node check (see the zone's README notes in index.ts).
 * Coordinates are base-relative metres in the arm plane: x right, y up, the first joint at (0, 0).
 * Angles are radians; θ₂ and θ₃ are relative to the previous link (standard DH-style planar chain).
 */

export const LINKS: readonly [number, number, number] = [2.0, 1.6, 1.0];
export const REACH = LINKS[0] + LINKS[1] + LINKS[2]; // 4.6 m
export const JOINT_LIMIT = (160 * Math.PI) / 180;
/** The pedestal is 1 m tall: the deck is at y = −1. Links are ~0.16 m thick → keep joints above −0.88. */
export const FLOOR_Y = -0.88;
/** Pedestal half-width (m) for the collision check below the first joint. */
const PEDESTAL_HALF = 0.42;
/** Ring hit radius (GDD: tip within 0.15 m of the ring centre). */
export const RING_HIT = 0.15;
/**
 * σ_min threshold (m/rad) below which the HUD warns SINGULARITÄT. Node check: CCD solutions give
 * σ_min 0.43–0.64 at |p| = 4.4 m, 0.38–0.56 at 4.45 m, ≤ 0.46 from 4.5 m on, ≥ 0.72 inside 4.0 m.
 */
export const SINGULAR_SIGMA = 0.55;

export type Angles = [number, number, number];

/** Joint positions: [x0,y0, x1,y1, x2,y2, x3,y3] (base, elbow 1, elbow 2, tip). Writes into `out`. */
export function fk(th: Readonly<Angles>, out: Float64Array): Float64Array {
  const [l1, l2, l3] = LINKS;
  const a1 = th[0],
    a2 = a1 + th[1],
    a3 = a2 + th[2];
  out[0] = 0;
  out[1] = 0;
  out[2] = l1 * Math.cos(a1);
  out[3] = l1 * Math.sin(a1);
  out[4] = out[2] + l2 * Math.cos(a2);
  out[5] = out[3] + l2 * Math.sin(a2);
  out[6] = out[4] + l3 * Math.cos(a3);
  out[7] = out[5] + l3 * Math.sin(a3);
  return out;
}

const _p = new Float64Array(8);

/** Tip position (x, y). */
export function tip(th: Readonly<Angles>): [number, number] {
  fk(th, _p);
  return [_p[6], _p[7]];
}

/**
 * Manipulability as the smallest singular value σ_min of the 2×3 position Jacobian (m per rad):
 * how fast the hand can move in its WORST direction per unit of joint speed. σ_min → 0 at a
 * singularity (arm fully stretched or folded): one direction is lost and the inverse blows up.
 */
export function manipulability(th: Readonly<Angles>): number {
  const [l1, l2, l3] = LINKS;
  const a1 = th[0],
    a2 = a1 + th[1],
    a3 = a2 + th[2];
  const s1 = l1 * Math.sin(a1),
    s2 = l2 * Math.sin(a2),
    s3 = l3 * Math.sin(a3);
  const c1 = l1 * Math.cos(a1),
    c2 = l2 * Math.cos(a2),
    c3 = l3 * Math.cos(a3);
  // J = [[-(s1+s2+s3), -(s2+s3), -s3], [c1+c2+c3, c2+c3, c3]]
  const j00 = -(s1 + s2 + s3),
    j01 = -(s2 + s3),
    j02 = -s3;
  const j10 = c1 + c2 + c3,
    j11 = c2 + c3,
    j12 = c3;
  const a = j00 * j00 + j01 * j01 + j02 * j02;
  const b = j00 * j10 + j01 * j11 + j02 * j12;
  const d = j10 * j10 + j11 * j11 + j12 * j12;
  // eigenvalues of the symmetric 2×2 J·Jᵀ; σ_min = √λ_min
  const half = (a + d) / 2;
  const lMin = half - Math.sqrt(Math.max(0, half * half - (a * d - b * b)));
  return Math.sqrt(Math.max(0, lMin));
}

const clampJoint = (v: number): number => Math.max(-JOINT_LIMIT, Math.min(JOINT_LIMIT, v));
const wrap = (v: number): number => Math.atan2(Math.sin(v), Math.cos(v));

/** true when any link would cut the deck or the pedestal (sampled along each link). */
export function collides(th: Readonly<Angles>): boolean {
  fk(th, _p);
  for (let k = 0; k < 3; k++) {
    const x0 = _p[k * 2],
      y0 = _p[k * 2 + 1],
      x1 = _p[k * 2 + 2],
      y1 = _p[k * 2 + 3];
    for (let s = 1; s <= 6; s++) {
      const t = s / 6;
      const x = x0 + (x1 - x0) * t,
        y = y0 + (y1 - y0) * t;
      if (y < FLOOR_Y) return true;
      if (y < -0.12 && Math.abs(x) < PEDESTAL_HALF) return true;
    }
  }
  return false;
}

export interface IkResult {
  /** joint angles after each CCD iteration (one full sweep tip → base), ≤ maxIter entries */
  iterations: Angles[];
  final: Angles;
  /** remaining distance tip → target (m) */
  error: number;
  /** target farther than the reach: the arm stretches toward it and stops */
  outOfReach: boolean;
  /** no collision-free solution found → `final` is the best collision-free attempt (may equal the start) */
  blocked: boolean;
  manipulability: number;
}

/**
 * One CCD run (cyclic coordinate descent): for each joint from the tip back to the base, rotate it
 * so the tip points at the target, clamp to ±160°. One sweep = one ghost.
 */
function ccdRun(start: Readonly<Angles>, tx: number, ty: number, maxIter: number, tol: number): { it: Angles[]; th: Angles; err: number } {
  const th: Angles = [start[0], start[1], start[2]];
  const it: Angles[] = [];
  let err = Infinity;
  for (let i = 0; i < maxIter; i++) {
    for (let j = 2; j >= 0; j--) {
      fk(th, _p);
      const jx = _p[j * 2],
        jy = _p[j * 2 + 1];
      const ex = _p[6] - jx,
        ey = _p[7] - jy;
      const gx = tx - jx,
        gy = ty - jy;
      if (ex * ex + ey * ey < 1e-12 || gx * gx + gy * gy < 1e-12) continue;
      const delta = wrap(Math.atan2(gy, gx) - Math.atan2(ey, ex));
      th[j] = j === 0 ? clampJoint(wrap(th[j] + delta)) : clampJoint(th[j] + delta);
    }
    it.push([th[0], th[1], th[2]]);
    fk(th, _p);
    err = Math.hypot(_p[6] - tx, _p[7] - ty);
    if (err < tol) break;
  }
  return { it, th, err };
}

/**
 * Solve „target → angles" with CCD (≤ 12 iterations, joint limits). If the run from the current
 * pose ends in the floor or the pedestal, a few other start poses are tried ("der Rechner probiert,
 * bis es passt") and the collision-free result closest to the target (then: least joint motion) wins.
 */
export function solveIk(current: Readonly<Angles>, tx: number, ty: number, maxIter = 12, tol = 0.01): IkResult {
  const dist = Math.hypot(tx, ty);
  const outOfReach = dist > REACH;
  const base = Math.atan2(ty, tx);
  const seeds: Angles[] = [
    [current[0], current[1], current[2]],
    [base + 0.9, -1.1, -0.7],
    [base - 0.9, 1.1, 0.7],
    [base + 0.4, -0.5, -0.4],
    [base - 0.4, 0.5, 0.4],
    [Math.PI / 2, -0.8, -0.8],
    // near-straight seeds: CCD alone creeps toward the workspace edge and stalls; these reach it
    [base + 0.12, -0.12, -0.08],
    [base - 0.12, 0.12, 0.08],
  ];
  let best: { it: Angles[]; th: Angles; err: number; move: number } | null = null;
  for (const s of seeds) {
    const r = ccdRun(s, tx, ty, maxIter, tol);
    if (collides(r.th)) continue;
    const move = Math.abs(wrap(r.th[0] - current[0])) + Math.abs(r.th[1] - current[1]) + Math.abs(r.th[2] - current[2]);
    const better = !best || r.err < best.err - 0.005 || (Math.abs(r.err - best.err) <= 0.005 && move < best.move);
    if (better) best = { ...r, move };
    // the current pose converged cleanly → keep it (least surprise, smallest motion)
    if (best && best.err < tol && s === seeds[0]) break;
  }
  if (!best) {
    const th: Angles = [current[0], current[1], current[2]];
    fk(th, _p);
    return { iterations: [], final: th, error: Math.hypot(_p[6] - tx, _p[7] - ty), outOfReach, blocked: true, manipulability: manipulability(th) };
  }
  if (outOfReach) {
    // beyond 4.6 m: stretch straight toward the target and stop there (CCD only creeps toward it)
    const th: Angles = [Math.max(-JOINT_LIMIT, Math.min(JOINT_LIMIT, base)), 0, 0];
    if (!collides(th)) {
      fk(th, _p);
      return { iterations: best.it, final: th, error: Math.hypot(_p[6] - tx, _p[7] - ty), outOfReach, blocked: false, manipulability: manipulability(th) };
    }
  }
  return { iterations: best.it, final: best.th, error: best.err, outOfReach, blocked: false, manipulability: manipulability(best.th) };
}

/** Shortest distance from point (px, py) to the segment a→b (for ring threading between frames). */
export function segmentPointDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax,
    dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}
