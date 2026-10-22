/**
 * The dock's top edge (plan §2.3): `outlineRadius(b, true) + TROCKENDOCK.wallOffset` (r 89–106), with the
 * bridge notch where the slot is widened to 13 m (Landedeck edge z 101 → bridge head z 114). Pure helpers
 * shared by the dock, the terrain hole, the colliders and the railing.
 */
import { DEG, REVIER, bearingOf, dockWallRadius } from '../layout';
import { T } from './tuning';
import type { XZ } from './plan';

export const NOTCH = { half: T.dock.notchHalf, back: REVIER.bridge.toZ };

/** wall radius at bearing b without the notch (layout's dockWallRadius) */
export const wallRadius = dockWallRadius;

/** z of the plain wall at x (the south side), for the notch corners */
function wallZAt(x: number): number {
  // bisect along the south side: the point (x, z) with r = wallRadius(bearingOf(x, z))
  let lo = 80,
    hi = 130;
  for (let i = 0; i < 40; i++) {
    const z = (lo + hi) / 2;
    if (Math.hypot(x, z) < wallRadius(bearingOf(x, z))) lo = z;
    else hi = z;
  }
  return (lo + hi) / 2;
}

/**
 * The notch corners in bearing order, (half, wall) (half, back) … (−half, back) (−half, wall), with the
 * bridge opening's edges (x ±BRIDGE_GAP) and its middle on the back wall, so lines along the wall can be
 * cut at the bridge.
 */
export const BRIDGE_GAP = REVIER.bridge.width / 2 + 0.2;
export function notchCorners(): XZ[] {
  const h = NOTCH.half;
  return [
    [h, wallZAt(h)],
    [h, NOTCH.back],
    [BRIDGE_GAP, NOTCH.back],
    [0, NOTCH.back],
    [-BRIDGE_GAP, NOTCH.back],
    [-h, NOTCH.back],
    [-h, wallZAt(-h)],
  ];
}

/** true inside the dock opening (plain wall or the notch) */
export function insideDock(x: number, z: number): boolean {
  if (Math.abs(x) < NOTCH.half && z > 90 && z < NOTCH.back) return true;
  return Math.hypot(x, z) < wallRadius(bearingOf(x, z));
}

/**
 * The closed top-edge polyline, ordered by bearing (clockwise from north), `n` samples on the plain wall
 * plus the four notch corners. Star-shaped from the origin, so every polar strip built on it is valid.
 */
export function wallPolyline(n = 1440): XZ[] {
  const corners = notchCorners();
  const bc = corners.map(([x, z]) => bearingOf(x, z)); // ascending: ≈ 178.1 … 181.9
  const out: XZ[] = [];
  let inserted = false;
  for (let i = 0; i < n; i++) {
    const b = (i / n) * 360;
    if (b > bc[0] && b < bc[bc.length - 1]) {
      if (!inserted) {
        out.push(...corners);
        inserted = true;
      }
      continue;
    }
    const r = wallRadius(b);
    out.push([Math.sin(b * DEG) * r, -Math.cos(b * DEG) * r]);
  }
  return out;
}

/** wall radius at 2048 bearings (the terrain shader's hole lookup; the notch is a separate test there) */
export function wallRadiusTable(n = 2048): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = wallRadius((i / n) * 360);
  return a;
}
