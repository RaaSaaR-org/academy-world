/**
 * Landscape plan (ART-V2 §4.1): where the "Flugmaschine" features stand on the free deck.
 * Pure data + pure helpers (no three.js objects), deterministic, so deck.ts (holes for the
 * intake pits), the features, the rovers and the map all agree. World metres, bearings in
 * compass degrees (layout.ts).
 *
 * Every object has a job on a flying robot: PV tracker rows feed sensors and lights (fiction),
 * intake fields breathe cooling air, fin banks dump the zones' heat, sensor masts measure
 * the island, hatches give access, rovers maintain. The only greenery grows under glass.
 */
import { HALL_PLOTS, ISLAND, PADS, PATHS, ZONE_PLOTS, bearingDir, gateMastPosition, outlineRadius, polar } from '../layout';

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Distance (m) from (x, z) to the nearest area that must stay clear (paths, plaza, plots, rim strip, pads, masts). Negative = inside one. */
export function freeDistance(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const bb = Math.atan2(x, -z) * (180 / Math.PI);
  const b = bb < 0 ? bb + 360 : bb;
  let d = Infinity;
  d = Math.min(d, r - (PATHS.plazaRadius + 1.5));
  d = Math.min(d, outlineRadius(b) - 7 - r);
  d = Math.min(d, Math.abs(r - (PATHS.ring.inner + PATHS.ring.outer) / 2) - (2.5 + 1.6));
  for (const p of ZONE_PLOTS) d = Math.min(d, Math.hypot(x - p.anchor[0], z - p.anchor[2]) - (p.radius + 2.5));
  const seg = (bear: number, r0: number, r1: number, halfW: number): number => {
    const [dx, dz] = bearingDir(bear);
    const t = clamp(x * dx + z * dz, r0, r1);
    return Math.hypot(x - dx * t, z - dz * t) - halfW;
  };
  for (const p of ZONE_PLOTS) d = Math.min(d, seg(p.bearing, PATHS.plazaRadius, 60, PATHS.spoke.width / 2 + 1.6));
  d = Math.min(d, seg(0, PATHS.plazaRadius, 100, PATHS.northSpoke.width / 2 + 1.6));
  d = Math.min(d, seg(180, PATHS.plazaRadius, 105, PATHS.avenue.width / 2 + 1.8));
  for (const kb of ISLAND.kanzeln.bearings) d = Math.min(d, seg(kb, PATHS.kanzelStub.from, 95, PATHS.kanzelStub.width / 2 + 1.6));
  for (const p of ZONE_PLOTS) {
    const zp = polar(p.bearing, PADS.zoneRadius);
    d = Math.min(d, Math.hypot(x - zp[0], z - zp[2]) - 3.5);
    const m = gateMastPosition(p.bearing);
    d = Math.min(d, Math.hypot(x - m[0], z - m[2]) - 2.5);
  }
  return d;
}

// ── cooling-air intake fields (Kühlluft-Einlässe) ───────────────────────────
export interface IntakeDef {
  x: number;
  z: number;
  /** grille radius (m) */
  r: number;
  /** slat pattern */
  kind: 'radial' | 'linear';
  /** yaw of the linear slats (rad) */
  yaw: number;
}
/** 8 fields: two in each of the four Kanzel gaps (one each side of the stub), r 60–66 between the plots. */
export const INTAKES: IntakeDef[] = (() => {
  const out: IntakeDef[] = [];
  const spec: [number, number, number, IntakeDef['kind']][] = [
    [51, 63, 3.6, 'radial'],
    [69, 61, 3.2, 'linear'],
    [111, 61, 3.2, 'linear'],
    [129, 64, 3.8, 'radial'],
    [231, 63, 3.6, 'radial'],
    [249, 61, 3.2, 'linear'],
    [291, 61, 3.2, 'linear'],
    [309, 64, 3.8, 'radial'],
  ];
  for (const [b, r, rad, kind] of spec) {
    const [x, , z] = polar(b, r);
    out.push({ x, z, r: rad, kind, yaw: (b * Math.PI) / 180 });
  }
  return out;
})();
/** The intake pit radius around a field (grille + rim), used by the deck to open the hole. */
export const INTAKE_RIM = 0.18;

// ── service hatches (12 on the ring path, between the crossings) ────────────
export const HATCHES: { x: number; z: number; yaw: number }[] = Array.from({ length: 12 }, (_, i) => {
  const b = 15 + i * 30;
  const [x, , z] = polar(b, (PATHS.ring.inner + PATHS.ring.outer) / 2);
  return { x, z, yaw: (-b * Math.PI) / 180 };
});

// ── heat-exchanger fin banks (beside each zone spoke, r 36–40) ──────────────
export interface FinBankDef {
  /** bearing range (deg, b0 < b1) */
  b0: number;
  b1: number;
  r: number;
  zone: string;
}
/** On the counter-clockwise side of each spoke, except Prüffeld (210), whose CCW side is the Allee. */
export const FIN_BANKS: FinBankDef[] = ZONE_PLOTS.map((p) => {
  const cw = p.bearing === 210;
  const b0 = cw ? p.bearing + 8 : p.bearing - 23;
  return { b0, b1: b0 + 15, r: 38.4, zone: p.id };
});
export const FIN = { count: 150, thick: 0.014, height: 1.05, depth: 0.8, plinthH: 0.42, plinthD: 1.3 };

// ── hydroponic pods (the only greenery, under glass) ────────────────────────
/** Beside the plaza benches (r 22.45–23.1) at bearings 60, 120, 240; 300 stays free for the Turmsprung pad. */
export const PODS: { x: number; z: number; bearing: number }[] = [60, 120, 240].map((b) => {
  const [x, , z] = polar(b, 27.4);
  return { x, z, bearing: b };
});
export const POD = { radius: 3.0, base: 0.5, dome: 3.1 };

// ── Turmsprung pad (FUN-PLAN W4): NW of the tower, clear of the medallion (S) and the lift (N) ──
export const TURMSPRUNG = { bearing: 315, r: 24 };

// ── sensor masts on the rim (two per gap between the lobes) ─────────────────
export const SENSOR_MASTS: { x: number; z: number; h: number; kind: 0 | 1 | 2; bearing: number }[] = (() => {
  const out: { x: number; z: number; h: number; kind: 0 | 1 | 2; bearing: number }[] = [];
  let k = 0;
  for (const g of [0, 60, 120, 180, 240, 300])
    for (const s of [-1, 1]) {
      // the Landedeck gap keeps its masts out of the arrival frame
      const b = g + s * (g === 180 ? 12 : 6.5);
      const r = outlineRadius(b) - 2.4;
      const [x, , z] = polar(b, r);
      out.push({ x, z, h: 4.4 + ((k * 7) % 5) * 0.4, kind: (k % 3) as 0 | 1 | 2, bearing: b });
      k++;
    }
  return out;
})();

// ── PV tracker rows (Solar-Nachführreihen; phase 5: they replace the "solar trees") ──
/**
 * One single-axis tracker segment: a row of PV modules on a torque tube along north–south at `x`,
 * from `z0` to `z1`, turning about that axis toward the sun. Low (pivot 1.45 m, top edge < 2.3 m),
 * so nothing reads as a tree and the Messpunkt sightline stays clear wherever a row stands.
 */
export interface PvRowDef {
  x: number;
  z0: number;
  z1: number;
  /** base height of the row (0 on the deck; the Schauhalle's roof frame for the north fields) */
  y: number;
  /** field index (PV_FIELDS) */
  field: number;
  /** re-aim period 6–10 s and phase */
  period: number;
  phase: number;
}
/** Tracker geometry (m): pivot height, table width across the axis, module length along it, module gap. */
export const PV = { pivot: 1.45, width: 2.0, module: 1.0, gap: 0.035, maxTilt: 50 };
/**
 * Field rectangles (x0 < x1, z0 < z1) and the x of each row in it: both sides of the Allee and of the
 * north spoke. Phase 7 (WP12, plan §2.3, D28): the two north-spoke fields moved onto the Schauhalle's
 * roof frame (y 9.3, island geometry): their 8 tracker segments stand there; the deck under them is
 * the hall's floor.
 */
export const PV_FIELDS: { x0: number; x1: number; z0: number; z1: number; rows: number[]; roof?: number }[] = [
  { x0: 7.6, x1: 14.6, z0: 50, z1: 77, rows: [9.3, 12.9] },
  { x0: -14.6, x1: -7.6, z0: 50, z1: 77, rows: [-9.3, -12.9] },
  { x0: 7.6, x1: 14.6, z0: -77, z1: -55, rows: [9.3, 12.9], roof: 9.3 },
  { x0: -14.6, x1: -7.6, z0: -77, z1: -55, rows: [-9.3, -12.9], roof: 9.3 },
];

/** The Schauhalle Nord's floor rect (plan §2.3: x −15…15, z −80…−52), from its plot. */
export const HALL_RECT = (() => {
  const h = HALL_PLOTS.find((p) => p.id === 'schauhalle')!;
  const shape = h.shape && h.shape.kind === 'rect' ? h.shape : { w: 30, d: 28 };
  return { x0: h.anchor[0] - shape.w / 2, x1: h.anchor[0] + shape.w / 2, z0: h.anchor[2] - shape.d / 2, z1: h.anchor[2] + shape.d / 2, roofY: 9.3 };
})();
/** Is (x, z) inside the hall's rect (grown by `margin`)? Deck features there are cleared (the hall stands on it). */
export function inHallRect(x: number, z: number, margin = 0): boolean {
  return x > HALL_RECT.x0 - margin && x < HALL_RECT.x1 + margin && z > HALL_RECT.z0 - margin && z < HALL_RECT.z1 + margin;
}

/** Longest run along z (step 0.25 m) where a whole table (± width/2 + margin) stays on free deck. */
function freeRun(x: number, z0: number, z1: number): [number, number] | null {
  let best: [number, number] | null = null,
    a: number | null = null;
  const ok = (z: number): boolean => {
    for (const dx of [-PV.width / 2 - 0.15, 0, PV.width / 2 + 0.15]) if (freeDistance(x + dx, z) < 0.6 || featureDistance(x + dx, z) < 0.6) return false;
    return true;
  };
  for (let z = z0; z <= z1 + 1e-6; z += 0.25) {
    if (ok(z)) {
      if (a === null) a = z;
      if (!best || z - a > best[1] - best[0]) best = [a, z];
    } else a = null;
  }
  return best;
}

export const PV_ROWS: PvRowDef[] = (() => {
  const r = mulberry(4242);
  const out: PvRowDef[] = [];
  PV_FIELDS.forEach((f, fi) => {
    for (const x of f.rows) {
      // on the roof frame nothing of the deck is in the way
      const run = f.roof != null ? ([f.z0, f.z1] as [number, number]) : freeRun(x, f.z0, f.z1);
      if (!run) continue;
      // whole modules, two segments with a 1.6 m service gap in the middle (each with its own drive)
      const pitch = PV.module + PV.gap;
      const n = Math.floor((run[1] - run[0] - 1.6 - 0.3) / pitch);
      const nA = Math.floor(n / 2),
        nB = n - nA;
      const used = n * pitch + 1.6;
      let z = (run[0] + run[1]) / 2 - used / 2;
      for (const k of [nA, nB]) {
        out.push({ x, z0: z, z1: z + k * pitch - PV.gap, y: f.roof ?? 0, field: fi, period: 6 + r() * 4, phase: r() * 10 });
        z += k * pitch + 1.6;
      }
    }
  });
  return out;
})();

// ── drone docks (Wartungsdrohnen): one per rim gap, E and W of the north and south lobes ──
/** Dock pads where a maintenance drone charges between inspection flights (to the intake fields and sensor masts nearby). */
export const DRONE_DOCKS: { x: number; z: number }[] = [
  [66, -27],
  [-66, -27],
  [65, 26],
  [-65, 26],
].map(([x, z]) => ({ x, z }));

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clearance from the other planned features (intakes, fin banks, pods, sensor masts). */
export function featureDistance(x: number, z: number): number {
  let d = Infinity;
  for (const f of INTAKES) d = Math.min(d, Math.hypot(x - f.x, z - f.z) - f.r - 1.2);
  for (const m of SENSOR_MASTS) d = Math.min(d, Math.hypot(x - m.x, z - m.z) - 1.2);
  for (const p of PODS) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - POD.radius - 1);
  return d;
}

// ── service rovers: closed loops on the ring path and along the Allee edges ──
export interface RoverRoute {
  kind: 'ring' | 'allee';
  /** ring: radius and direction; allee: x offset */
  r?: number;
  dir?: 1 | -1;
  x?: number;
  /** start parameter: ring = bearing (deg), allee = z */
  start: number;
}
export const ROVER_ROUTES: RoverRoute[] = [
  { kind: 'ring', r: 47.2, dir: 1, start: 20 },
  { kind: 'ring', r: 44.8, dir: -1, start: 140 },
  { kind: 'ring', r: 47.2, dir: 1, start: 250 },
  // phase 5: more traffic in the painted lanes (both directions in view from most of the ring)
  { kind: 'ring', r: 44.8, dir: -1, start: 305 },
  { kind: 'ring', r: 47.2, dir: 1, start: 135 },
  { kind: 'ring', r: 44.8, dir: -1, start: 215 },
  { kind: 'allee', x: 2.9, start: 52 },
  { kind: 'allee', x: -2.9, start: 74 },
];
/** The Allee rover lane (z range, clear of the ring crossing and the Landedeck). */
export const ALLEE_LANE = { z0: 50, z1: 82 };

// ── position lights (FUN-PLAN W2): 12 on the rim, every 30° ──────────────────
/** Light bearing per capsule id: the six zone capsules at their lobe tips, the six world capsules in the gaps. */
export const POSITION_LIGHTS: { bearing: number; id: string }[] = [
  ...ZONE_PLOTS.map((p) => ({ bearing: p.bearing, id: `${p.id}.kapsel` })),
  { bearing: 0, id: 'world.glasbalkon' },
  { bearing: 60, id: 'world.kiel' },
  { bearing: 120, id: 'world.sprungbogen' },
  { bearing: 180, id: 'world.landedeck' },
  { bearing: 240, id: 'world.kanzel' },
  { bearing: 300, id: 'world.ausguck' },
];
