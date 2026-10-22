/**
 * Kinematics of the procedural 6-axis arm ("Hersteller X", unbranded), pure maths.
 *
 * Joint layout (arm base frame: y up, arm pointing +x at q = 0):
 *   q1 base yaw (about y) · q2 shoulder pitch (about z, angle of the upper arm above horizontal)
 *   q3 elbow pitch (relative) · q4 forearm roll (kept 0) · q5 wrist pitch · q6 flange roll.
 * Spherical wrist: the wrist centre (J5 axis) sits d4 beyond the elbow; the TCP is TOOL beyond it.
 * Top-down grasps: the tool points straight down (q2 + q3 + q5 = −π/2), so the position
 * problem reduces to a planar two-link solution for the wrist centre (law of cosines).
 */
export const ARM = {
  /** base → shoulder axis height (m) */
  d1: 0.5,
  /** upper arm (m) */
  a2: 0.85,
  /** elbow → wrist centre (m) */
  d4: 0.8,
  /** wrist centre → flange (m) */
  d6: 0.12,
  /** wrist centre → TCP (finger centre) (m) */
  tool: 0.25,
} as const;

/** Joint angles q1..q6 (rad). */
export type Joints = [number, number, number, number, number, number];

/**
 * Inverse kinematics for a top-down grasp at TCP `(x, y, z)` (arm base frame) with the finger
 * axis at yaw `fingerYaw` (rad about +y). Elbow-up solution. Writes into `out`; returns the
 * reach ratio D / (a2 + d4) (> 1 means the target was out of reach and got clamped).
 */
export function solveIK(x: number, y: number, z: number, fingerYaw: number, out: Joints): number {
  const { d1, a2, d4, tool } = ARM;
  const q1 = Math.atan2(-z, x);
  const r = Math.hypot(x, z);
  const dx = r;
  const dy = y + tool - d1;
  const D2 = dx * dx + dy * dy;
  let c3 = (D2 - a2 * a2 - d4 * d4) / (2 * a2 * d4);
  const reach = Math.sqrt(D2) / (a2 + d4);
  if (c3 > 1) c3 = 1;
  if (c3 < -1) c3 = -1;
  const q3 = -Math.acos(c3);
  const q2 = Math.atan2(dy, dx) - Math.atan2(d4 * Math.sin(q3), a2 + d4 * Math.cos(q3));
  out[0] = q1;
  out[1] = q2;
  out[2] = q3;
  out[3] = 0;
  out[4] = -Math.PI / 2 - q2 - q3;
  // tool axis points down (−y): a roll q6 about it turns the finger axis by −q6 about +y
  out[5] = wrapPi(q1 - fingerYaw);
  return reach;
}

/** Forward kinematics of the TCP (for checks): returns [x, y, z, toolPitch]. */
export function forwardTCP(q: Joints): [number, number, number, number] {
  const { d1, a2, d4, tool } = ARM;
  const fx = Math.cos(q[0]),
    fz = -Math.sin(q[0]);
  const a = q[1],
    b = q[1] + q[2],
    c = q[1] + q[2] + q[4];
  const r = a2 * Math.cos(a) + d4 * Math.cos(b) + tool * Math.cos(c);
  const y = d1 + a2 * Math.sin(a) + d4 * Math.sin(b) + tool * Math.sin(c);
  return [r * fx, y, r * fz, c];
}

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
