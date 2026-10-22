import { TOWER, type Vec3Tuple } from '../layout';

/**
 * Tower v2 constants (ART-V2 §3.2–3.3). `TOWER.sculpture` / `TOWER.arm` live in layout.ts (the
 * island's layout registry); the fallbacks keep the tower building if they are ever removed.
 *
 * Phase 5: the mark is a planar relief (one plane for the ring and all 17 arcs), so it is the
 * exact EmAI mark from every viewpoint. Its depth stack (mark plane, dial face, back plate) is
 * defined here; of the registry entry only the centre x/y, the radius and the Messpunkt are read
 * (its z values mirror the stack below for other readers).
 */
type TowerV2 = Omit<typeof TOWER, 'sculpture' | 'arm'> & {
  sculpture?: { center: Vec3Tuple; radius: number; eye: Vec3Tuple };
  arm?: { base: Vec3Tuple };
};
const T: TowerV2 = TOWER;

const CX = T.sculpture?.center[0] ?? 0;
const CY = T.sculpture?.center[1] ?? 24;
/** back plate of the dial: 0.27 m clear of the diagrid where it is closest (disc bottom, y 13.65) */
const BACK_Z = 7.65;
/** dial body thickness (back plate → face) */
const BODY = 0.85;
/** tube centres stand this far in front of the dial face (tube radius 0.21: a 0.24 m shadow gap) */
const STANDOFF = 0.45;

export const SCULPTURE = {
  /** centre of the mark: tube centres of ring and arcs (the mark plane z = center[2]) */
  center: [CX, CY, BACK_Z + BODY + STANDOFF] as Vec3Tuple,
  /** dial face (brand-exact #141414) */
  faceZ: BACK_Z + BODY,
  /** back plate of the dial */
  backZ: BACK_Z,
  /** tube centre → dial face */
  standoff: STANDOFF,
  /** disc radius of the mark (400 SVG units) */
  radius: T.sculpture?.radius ?? 10.5,
  /** Messpunkt: the arrival eye (spawn); the arm bows toward it, the plate's card measures from it */
  eye: T.sculpture?.eye ?? ([0, 1.65, 94.5] as Vec3Tuple),
};

export const ARM = {
  /** flange under the halo, bearing 180 */
  base: T.arm?.base ?? ([0, 43.4, 12.2] as Vec3Tuple),
};

/** diagrid (hyperboloid of one sheet) */
export const DIAGRID = { yb: 7.2, yt: 43.0, rb: 8.85, rt: 8.55, n: 18, twistDeg: 96, offsetDeg: 10 };

/**
 * Outer face of the diagrid at height y (m from the axis): every member is a straight line from
 * (rb, yb − 0.15) to (rt, yt + 0.15) turned by twistDeg, so its distance from the axis at height
 * fraction f is |lerp(P0, P1, f)|; + 0.14 for the member's radial half-depth.
 */
export function latticeOuterR(y: number): number {
  const D = DIAGRID;
  const y0 = D.yb - 0.15,
    y1 = D.yt + 0.15;
  const f = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  const c = Math.cos((D.twistDeg * Math.PI) / 180);
  return Math.sqrt((1 - f) * (1 - f) * D.rb * D.rb + f * f * D.rt * D.rt + 2 * f * (1 - f) * D.rb * D.rt * c) + 0.14;
}

/** core cylinder */
export const CORE = { r: 3.4, y0: 7.0, y1: 44.0, rings: 11, ringY0: 9.0, ringStep: 3.4 };
/** Ausguck halo lathe profile (r, y) */
export const HALO: [number, number][] = [
  [8.4, 42.4],
  [10.0, 42.95],
  [11.8, 43.3],
  [12.9, 43.52],
  [13.3, 43.75],
  [13.2, 43.95],
  [12.9, 44.0],
];
export const SHAFT = { hw: 1.55, capY: 47.6 };
/** waist ring of the diagrid (alu torus): centre radius, tube, height */
export const WAIST = { r: 5.97, tube: 0.16, y: 25.1 };
