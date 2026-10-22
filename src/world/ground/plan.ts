/**
 * The Revier's geography (plan §2.2, §2.3, §2.7; D19, D22): pure data shared by the runtime (masks,
 * colliders, fences) and the offline bake (`node tools/ground/bake.mjs`, which imports this file with
 * Node's type stripping, so it imports nothing but `../layout`).
 *
 * Frame: the ground frame at h = 0 (= world at h = 0): metres, y up, north = −z, east = +x. Bearing b →
 * direction (sin b, 0, −cos b). Everything around the dock is a flat yard (y 0) out to PLATEAU.flat; the
 * land beyond is reclaimed open-cast mining land: gentle relief, a wind rise in the north, low hills in
 * the east under the cloud shade, mining benches down to the pit lake in the WNW.
 */
import { GROUND_PADS, REVIER, SITE_PLOTS, polar, type Vec3Tuple } from '../layout';

export type XZ = [number, number];

/** The flat dock yard: y = 0 out to `flat`, blended into the relief by `blend`. */
export const PLATEAU = { flat: 200, blend: 280 };

/** The baked grids (tools/ground/bake.mjs; heights.ts decodes them). Spacing in metres, half extents around the origin. */
export const GRID = {
  /** heights-core.bin: the 300 m core at 2 m, before the title */
  core: { half: 150, step: 2 },
  /** heights-core.bin: a 16 m preview of the near grid, so the title has the whole Revier before the ring arrives */
  preview: { half: 672, step: 16 },
  /** heights-ring.bin: the near grid at 2 m (to 1.3 km and a bit; 21 × 21 collider tiles of 64 m) */
  near: { half: 672, step: 2 },
  /** heights-core.bin: the far land, the pit's far banks and the heap at 32 m, to the camera's far plane (3 km) and a bit */
  far: { half: 3200, step: 32 },
  /** quantisation: q = round((h − base) / quantum) as Uint16 */
  base: -64,
  quantum: 0.01,
  /** coarser quanta of the blocks only seen from afar */
  coarse: { preview: 0.08, far: 0.2 },
};

/** The pit lake („Revier-See“, D22): the shore where proj(295°) ≈ 600 m, water at y −20 (layout REVIER.lake). */
export const SHORE = {
  bearing: REVIER.lake.shoreBearing,
  /** proj(295°) of the waterline (± the wave below) */
  line: REVIER.lake.shoreProj,
  water: REVIER.lake.y,
  /** the mining benches: [proj offset from the waterline (negative = inland), height] from the top edge down */
  // the first slope (−92 … −78) is the rc4/wave-1 one (the Seeblick's disc ends on it); below it the benches are
  // steep cut faces with near-level treads, so they read as terraces from the shore walk (G-LOOK fix 3, D42)
  benches: [
    [-92, 0],
    [-78, -4.5],
    [-62, -5.0],
    [-56, -10.4],
    [-38, -10.9],
    [-32, -16.0],
    [-12, -16.4],
    [-6, -18.7],
    [0, -18.7],
  ] as XZ[],
  /** below the waterline: a steep drop, then the lakebed */
  drop: { at: 7, y: -27 },
  bed: { at: 140, y: -42 },
  /** the waterline wanders: Σ a·sin(perp / λ + φ) */
  wave: [
    [18, 90, 0],
    [9, 37, 1.3],
    [4, 15, 2.1],
  ] as [number, number, number][],
};

/**
 * The pit's far and lateral banks (G-LOOK fix 2, D42: the lake reads as a flooded open-cast pit, not a
 * sea). In the lake frame u = proj(295°) (lakeward, the near waterline at SHORE.line) and v = proj(205°)
 * (along the near shore, + toward the SW): the water ends at the far waterline u = far and between the
 * lateral waterlines v = north … south, a rounded rectangle whose rim wanders (`wave`, seeded noise). The
 * banks climb from the waterline in three wide terraces (the far grid is 32 m: treads of ≈ 60 m read
 * from the Ausguck), then the land. The near shore and everything inside the near grid's walkable part
 * keep their heights (the bake checks the plots, pads, paths and the yard).
 */
export const PIT = {
  far: 1180,
  north: -280,
  south: 660,
  /** corner radius of the rim (m) */
  round: 240,
  /** rim wander: [amplitude m, wavelength m] octaves of value noise */
  wave: [
    [16, 210],
    [6, 70],
  ] as XZ[],
  /** [q (≤ 0: outward of the waterline, m), height] from the waterline up */
  benches: [
    [0, -18.7],
    [-8, -11.0],
    [-70, -10.2],
    [-78, -2.0],
    [-140, -1.2],
    [-148, 7.0],
    [-210, 7.8],
  ] as XZ[],
  /** above the last bench the cut face climbs at this grade to meet the land */
  faceGrade: 1.0,
  /** the far-ring hills fade in from the rim outward over this distance (m) */
  hillsFade: 380,
};

/**
 * The spoil heap („Abraumhalde“, G-LOOK fix 3, D42): the old mine's overburden, a flat-topped heap with
 * two berms on its flanks, wooded (managed forest, plan §2.7 rule 2). NNW at the lake's north end, so the
 * Ausguck sees it right of the lake and its south flank drops into the pit's north bank. Centre (x, z),
 * half extents along its long axis (bearing `axis`) and across, height above the land.
 */
export const HALDE = {
  at: [-520, -771] as XZ,
  half: [300, 170] as XZ,
  axis: 295,
  height: 44,
  round: 120,
  /** the flank in profile: [inward distance from the foot m, height m]; the plateau is level beyond */
  profile: [
    [0, 0],
    [44, 14.5],
    [58, 15.0],
    [102, 29.5],
    [116, 30.0],
    [160, 44],
  ] as XZ[],
};

/**
 * The sailing club's jetty below the Seeblick (the shore walk's end, plan §2.3): life on the recultivated
 * pit lake (D43). In the lake frame (see PIT): from `from` m lakeward of the mean waterline, `length` m out,
 * at v; the deck `deck` m above the water; four dinghies moored alongside at [m along, side].
 */
export const JETTY = {
  from: -4,
  length: 34,
  v: 52,
  width: 2.2,
  deck: 1.1,
  boats: [
    [12, -1],
    [19, 1],
    [25, -1],
    [31, 1],
  ] as XZ[],
};

/** Large-scale relief beyond the plateau: [amplitude m, wavelength m] octaves of seeded value noise. */
export const RELIEF = {
  seed: 1957,
  octaves: [
    [3.6, 820],
    [1.8, 380],
    [0.7, 170],
  ] as XZ[],
  /** the wind rise in the north (Windkamm): height, from/to proj(0°) and the bearing window */
  rise: { height: 22, from: 330, to: 700, bearings: [300, 75] as XZ },
  /** low hills in the east, under the cloud shade */
  hills: { height: 11, from: 380, to: 720, bearings: [55, 175] as XZ },
  /** the far ring (beyond the near grid): hills on the horizon, lower toward the lake */
  far: { height: 46, from: 1300, to: 2600 },
};

export type PathKind = 'road' | 'track' | 'path';

/** A walkable way: its bed is flattened across (heights), drawn in the masks, fenced where it leaves the yard. */
export interface GroundPath {
  id: string;
  kind: PathKind;
  /** bed width (m) */
  width: number;
  pts: XZ[];
  closed?: boolean;
  /** no corridor fences (inside the yard or a site) */
  open?: boolean;
}

const xz = (p: Vec3Tuple): XZ => [Math.round(p[0] * 100) / 100, Math.round(p[2] * 100) / 100];
const pad = (b: number): XZ => xz(GROUND_PADS.find((g) => g.bearing === b)!.position);
const ring = (r: number, n: number): XZ[] => Array.from({ length: n }, (_, i) => xz(polar((i / n) * 360, r)));

/** The yard ring road, the pad spurs and the field tracks to the sites (plan §2.2, §2.4). */
export const PATHS: GroundPath[] = [
  { id: 'ring', kind: 'road', width: 6, pts: ring(124, 72), closed: true, open: true },
  { id: 'bridgehead', kind: 'road', width: 8, pts: [[0, 114], [0, 132]], open: true },
  ...[60, 120, 240, 300].map((b): GroundPath => ({ id: `spur${b}`, kind: 'road', width: 4, pts: [xz(polar(b, 126)), xz(polar(b, 146))], open: true })),
  // G240 → past the Grubenrand → the Hofladen and the Sonnenacker's east gate (85 m, plan §4.10)
  { id: 'sonnenacker', kind: 'track', width: 3.5, pts: [pad(240), [-152, 78], [-176, 82], [-196, 84], [-210, 76], [-216, 70]] },
  // G300 → the Unkrautacker's north-east gate
  { id: 'unkrautacker', kind: 'track', width: 3.5, pts: [pad(300), [-142, -104], [-146, -140], [-140, -172], [-136, -186]] },
  // G60 → the Kreislaufhof's west door (in the cloud shade)
  { id: 'kreislaufhof', kind: 'track', width: 4, pts: [pad(60), [166, -80], [210, -72], [256, -56], [296, -44], [309, -40]] },
  // the bridge head → the Bahnhof (SHOULD) and the Dorf behind the spawn
  { id: 'bahnhof', kind: 'road', width: 5, pts: [[0, 132], [0, 170], [-4, 204]] },
  // the shore walk: from the Sonnenacker's north-west corner along the top bench to the Seeblick (SHOULD)
  { id: 'ufer', kind: 'path', width: 3, pts: [[-360, 8], [-392, -40], [-430, -96], [-462, -146], [-478, -178]] },
];

/** Concrete and gravel areas (masks; flattened to the yard level where they lie beyond the plateau). */
export interface GroundFlat {
  id: string;
  kind: 'concrete' | 'gravel';
  /** centre and size (axis aligned unless `yawDeg`) or a disc */
  at: XZ;
  size?: XZ;
  radius?: number;
  yawDeg?: number;
}

const site = (id: string) => SITE_PLOTS.find((p) => p.id === id)!;
const hangar = site('traumhangar');

export const FLATS: GroundFlat[] = [
  // the bridge head apron (z 114–126) and the Revier gate (z 121)
  { id: 'bridgehead', kind: 'concrete', at: [0, 121], size: [30, 14] },
  // the Werft yard east of the dock (bearings ≈ 30–170°), cranes K1 / K2 on it
  { id: 'werft', kind: 'concrete', at: [150, 4], size: [78, 150] },
  ...GROUND_PADS.map((g): GroundFlat => ({ id: `pad-${g.id}`, kind: 'concrete', at: xz(g.position), radius: 8 })),
  { id: 'hangar-apron', kind: 'concrete', at: xz(hangar.anchor), size: [64, 50], yawDeg: hangar.facingDeg },
  { id: 'kreislaufhof-yard', kind: 'gravel', at: [340, -40], size: [84, 52] },
  { id: 'seeblick', kind: 'gravel', at: [-480, -180], radius: 9 },
];

/** Managed land the masks paint (fields: soil and crop rows; pasture: greener grass). Sites flatten their rects. */
export interface GroundField {
  id: string;
  kind: 'field' | 'pasture';
  at: XZ;
  size: XZ;
  yawDeg?: number;
  /** flatten the rect (a planar fit, `shoulder` m blend) */
  flatten?: number;
}

export const FIELDS: GroundField[] = [
  // the Sonnenacker 150 × 100 (x −365…−215, z 10…110); its beds and roofs are WP9's
  { id: 'sonnenacker', kind: 'field', at: [-290, 60], size: [150, 100], flatten: 18 },
  // the Unkrautacker 200 × 150 (field east, pasture west)
  { id: 'unkrautacker', kind: 'field', at: [-200, -260], size: [140, 150], flatten: 20 },
  { id: 'weide', kind: 'pasture', at: [-300, -260], size: [60, 150], flatten: 20 },
  { id: 'kreislaufhof', kind: 'pasture', at: [340, -40], size: [70, 40], flatten: 14 },
  { id: 'dorf', kind: 'pasture', at: [-45, 256], size: [120, 80], flatten: 16 },
  { id: 'holzbau', kind: 'pasture', at: [230, 230], size: [44, 44], flatten: 12 },
];

/**
 * The Grubenrand (plan §2.3, MUST landmark): a 30 m terrace cut beside the Sonnenacker track, three benches
 * down. Since G-LOOK (D42) the retired bucket-wheel excavator (WP14) stands at LANDMARKS.grubenrand
 * (−195, 88) on a level lay-by beside the track (`pad`: the track bed's height carried across a 24 × 14 m
 * rect, ±2 cm), so the cut moved 10 m south: the excavator's boom reaches over it.
 */
export const GRUBENRAND = {
  at: [-195, 111] as XZ,
  size: [30, 16] as XZ,
  benches: 3,
  rise: 1.6,
  shoulder: 6,
  /** the excavator's lay-by: centre, size, the blend outside it (m) */
  pad: { at: [-195, 88] as XZ, size: [24, 14] as XZ, shoulder: 3 },
};

/** Where colliders exist (plan WP3 build 4): the yard (a trimesh), and 64 m heightfield tiles over the tracks and the site rects. */
export const COLLIDERS = {
  tile: 64,
  /** a tile is skipped when any of it lies within this radius (the dock and its notch) */
  dockClear: 122,
  /** the walk corridor around a track (m from the centreline) that tiles cover and fences bound */
  corridor: 6,
  /** extra margin around a site rect */
  siteMargin: 10,
  /** the yard fence (gaps where the tracks leave it) */
  yardFence: 194,
  /** the hard boundary (layout REVIER.walkableRadius) */
  boundary: REVIER.walkableRadius,
};

// ── shared shapes for the runtime (far ring, shader uniforms); the bake has its own copies with the rim's wander ──

/** The lake frame: u along the shore bearing (lakeward), v along bearing − 90° (+ toward the SW). */
export function lakeFrame(x: number, z: number): XZ {
  const b = (SHORE.bearing * Math.PI) / 180;
  return [x * Math.sin(b) - z * Math.cos(b), -x * Math.cos(b) - z * Math.sin(b)];
}

/** How far inside the pit's far / lateral rim a point lies (m; > 0 over the water), without the rim's ≤ 22 m wander. */
export function pitRimQ(x: number, z: number): number {
  const [u, v] = lakeFrame(x, z);
  const R = PIT.round;
  const dx = u - PIT.far + R,
    dy = Math.max(PIT.north - v, v - PIT.south) + R;
  return -(Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - R);
}

/** How far inside the spoil heap's foot a point lies (m; < 0 outside). */
export function haldeInside(x: number, z: number): number {
  const b = (HALDE.axis * Math.PI) / 180;
  const ax = Math.sin(b),
    az = -Math.cos(b);
  const dx = x - HALDE.at[0],
    dz = z - HALDE.at[1];
  const a = dx * ax + dz * az,
    c = -dx * az + dz * ax;
  const R = HALDE.round;
  const qx = Math.abs(a) - HALDE.half[0] + R,
    qy = Math.abs(c) - HALDE.half[1] + R;
  return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R);
}
