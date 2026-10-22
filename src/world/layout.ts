/**
 * ISLAND LAYOUT REGISTRY — owned by the island team (src/world/).
 * Pure data + tiny pure helpers only: this file is imported statically by the engine,
 * so it must never throw. All numbers are GDD §4 (binding).
 *
 * World frame: metres, +Y up, origin = hub centre (Akademie-Turm axis) at deck level.
 * Compass: north = −Z, east = +X. Bearing b (clockwise from north, seen from above)
 * → direction (sin b, 0, −cos b).
 *
 * Each zone gets a circular plot (r 22, ground y 0). The zone builds in LOCAL coords:
 *   origin = anchor on the ground, +Y up, local +Z points at the hub, gate at local (0,0,22).
 */
import type { PlotFields } from '@/core/zones/types.frames';

export type Vec3Tuple = [number, number, number];

/** Phase 7 (plan §5.2, WP4): kind, frame, shape, tiers, interior (PlotFields); radius = the circumscribed radius for rect plots. */
export interface PlotDef extends PlotFields {
  id: string;
  /** World position of the zone origin (on the ground). */
  anchor: Vec3Tuple;
  /** Yaw of the local frame in degrees (= GDD rotationY). Default: local +Z faces the hub. */
  facingDeg?: number;
  /** Usable radius in metres. */
  radius: number;
  /**
   * Default spawn (local coords; yaw in degrees, 0 = facing local −Z; pitch in degrees, + = up).
   * Zones can override via defineZone({ spawn }).
   */
  spawn?: { position: Vec3Tuple; yawDeg?: number; pitchDeg?: number };
}

/** GDD zone table (§4.3) with the names the island uses for masts, map and placeholders. */
export interface ZonePlotInfo extends PlotDef {
  number: number;
  bearing: number;
  name: { de: string; en: string };
  verb: { de: string; en: string };
  eyebrow: { de: string; en: string };
  glyph: string;
  emi: string;
}

export const DEG = Math.PI / 180;

/** Unit direction of a compass bearing (degrees): [x, z]. */
export function bearingDir(b: number): [number, number] {
  return [Math.sin(b * DEG), -Math.cos(b * DEG)];
}
/** Point at bearing b and distance r (world, y = 0). */
export function polar(b: number, r: number, y = 0): Vec3Tuple {
  const [x, z] = bearingDir(b);
  return [x * r, y, z * r];
}
/** Compass bearing (degrees, 0…360) of a world point. */
export function bearingOf(x: number, z: number): number {
  const b = Math.atan2(x, -z) / DEG;
  return b < 0 ? b + 360 : b;
}

// ── island outline (§4.2) ─────────────────────────────────────────────────────

export const ISLAND = {
  /** main deck disc radius (walkable top); lobes reach `outerRadius` */
  radius: 85,
  outerRadius: 102,
  groundY: 0,
  /** deck slab thickness (top y 0, bottom y −4) */
  deckThickness: 4,
  /** below this Y the player is caught by a rescue drone and respawned; bodies are reset */
  killY: -66,
  /** lobes: discs r 22 on the r 80 ring */
  lobeRadius: 22,
  lobeRing: 80,
  lobeBearings: [30, 90, 150, 210, 270, 330],
  /** Landedeck (S) and Glasbalkon (N) */
  landedeck: { center: [0, 0, 92] as Vec3Tuple, radius: 9 },
  glasbalkon: { center: [0, 0, -92] as Vec3Tuple, radius: 7 },
  /** 4 Aussichtskanzeln */
  kanzeln: { radius: 4, ring: 88, bearings: [60, 120, 240, 300] },
  /** cloud sea (two layers) */
  cloudY: -180,
  cloudY2: -172,
};

/** Far intersection of a ray from the origin at bearing b with a circle (centre bearing c, distance d, radius r); 0 if missed. */
function circleReach(b: number, c: number, d: number, r: number): number {
  const phi = (b - c) * DEG;
  const s = d * Math.sin(phi);
  const cs = Math.cos(phi);
  if (cs <= 0 || Math.abs(s) > r) return 0;
  return d * cs + Math.sqrt(r * r - s * s);
}

/**
 * Radius of the SOLID deck outline at bearing b (main disc ∪ lobes ∪ Landedeck).
 * The union is star-shaped from the origin, so one radius per bearing describes it.
 * The Glasbalkon and the four Kanzeln have glass floors and are built separately;
 * pass `withPulpits` to include the Kanzeln (maps, models, silhouettes).
 */
export function outlineRadius(b: number, withPulpits = false): number {
  let r = ISLAND.radius;
  for (const lb of ISLAND.lobeBearings) r = Math.max(r, circleReach(b, lb, ISLAND.lobeRing, ISLAND.lobeRadius));
  r = Math.max(r, circleReach(b, 180, ISLAND.landedeck.center[2], ISLAND.landedeck.radius));
  if (withPulpits) for (const kb of ISLAND.kanzeln.bearings) r = Math.max(r, circleReach(b, kb, ISLAND.kanzeln.ring, ISLAND.kanzeln.radius));
  return r;
}

// ── hub and plots (§4.3) ─────────────────────────────────────────────────────

export const HUB: PlotDef = {
  id: 'hub',
  anchor: [0, 0, 0],
  facingDeg: 0,
  /** plaza radius */
  radius: 32,
  /** §4.7: feet on the Landedeck, looking north at the tower, pitch +6° */
  spawn: { position: [0, 0, 94.5], yawDeg: 0, pitchDeg: 6 },
};

function zonePlot(
  id: string,
  number: number,
  bearing: number,
  rotationYDeg: number,
  name: { de: string; en: string },
  verb: { de: string; en: string },
  eyebrow: { de: string; en: string },
  glyph: string,
): ZonePlotInfo {
  const a = polar(bearing, ISLAND.lobeRing);
  return {
    id,
    number,
    bearing,
    anchor: [round2(a[0]), 0, round2(a[2])],
    facingDeg: rotationYDeg,
    radius: 22,
    // Phase 7: the lobes keep rc4's tiers (45 / 130 m from the anchor = 23 / 108 m from the plot edge)
    kind: 'lobe',
    frame: 'island',
    shape: { kind: 'circle', r: 22 },
    // spawn on the spoke just outside the gate (world r = 56 → local z = 24), looking into the zone
    spawn: { position: [0, 0, 24], yawDeg: 0 },
    name,
    verb,
    eyebrow,
    glyph,
    emi: `EMI-0${number + 1}`,
  };
}
function round2(v: number): number {
  return Math.round(v * 100) / 100 || 0;
}

export const ZONE_PLOTS: ZonePlotInfo[] = [
  zonePlot('sensordom', 1, 270, 90, { de: 'Sensordom', en: 'Sensor Dome' }, { de: 'SEHEN', en: 'SEE' }, { de: '// 01 · SEHEN · SENSORIK', en: '// 01 · SEE · SENSING' }, 'sensor'),
  zonePlot('regelgarten', 2, 330, 30, { de: 'Regelgarten', en: 'Control Garden' }, { de: 'REGELN', en: 'CONTROL' }, { de: '// 02 · REGELN · REGELKREIS', en: '// 02 · CONTROL · FEEDBACK LOOP' }, 'pendel'),
  zonePlot('greifwerkstatt', 3, 30, -30, { de: 'Greifwerkstatt', en: 'Grip Workshop' }, { de: 'GREIFEN', en: 'GRASP' }, { de: '// 03 · GREIFEN · KINEMATIK', en: '// 03 · GRASP · KINEMATICS' }, 'greifer'),
  zonePlot('lern-dojo', 4, 90, -90, { de: 'Lern-Dojo', en: 'Learning Dojo' }, { de: 'LERNEN', en: 'LEARN' }, { de: '// 04 · LERNEN · IMITATION', en: '// 04 · LEARN · IMITATION' }, 'band'),
  zonePlot('dunkelfabrik', 5, 150, -150, { de: 'Dunkelfabrik', en: 'Dark Factory' }, { de: 'ARBEITEN', en: 'WORK' }, { de: '// 05 · ARBEITEN · STATION 7', en: '// 05 · WORK · STATION 7' }, 'kiste'),
  zonePlot('prueffeld', 6, 210, 150, { de: 'Prüffeld', en: 'Proving Ground' }, { de: 'MESSEN', en: 'MEASURE' }, { de: '// 06 · MESSEN · METHODE', en: '// 06 · MEASURE · METHOD' }, 'kurve'),
];

/** German dative for „Weiter im …“ (D13): the feminine plots take „in der“. */
const IN_DER = new Set(['greifwerkstatt', 'dunkelfabrik']);
/** „im Sensordom“ / „in der Dunkelfabrik“ · „in the Sensor Dome“ (the zone's name after „Weiter“ / „Continue“). */
export function zoneInPhrase(id: string, name: { de: string; en: string }): { de: string; en: string } {
  return { de: `${IN_DER.has(id) ? 'in der' : 'im'} ${name.de}`, en: `in the ${name.en}` };
}

// ── Phase 7: halls, sites and the ground layout (plan §2.3, §2.4, §1.3, §1.4; WP4) ───────────────────
// Frozen after p7-w1: later changes go through the integrator. World coordinates at h = 0 (docked).
// Tiers are measured from the plot's EDGE (circle or rect), not the anchor (ZoneManager, plan §5.2).

/** a rect plot: its circumscribed radius is the plot radius (HUD, compass, default spawn); w along local x, d along local z */
function rectPlot(id: string, anchor: Vec3Tuple, w: number, d: number, o: Omit<PlotDef, 'id' | 'anchor' | 'radius' | 'shape'>): PlotDef {
  return { id, anchor, radius: round2(Math.hypot(w / 2, d / 2)), shape: { kind: 'rect', w, d }, ...o };
}

/**
 * Island halls. The Schauhalle Nord: x −15…15, z −80…−52 (30 × 28 m, 9 m clear), entered from the
 * south front on the ring path (local +Z faces the hub), left by the north door to the Glasbalkon.
 * Detail ≤ 8 m outside the rect, exterior ≤ 60 m (the plaza sees it); `interior`: while you are inside,
 * the lobes 02 and 03 cap at their exterior tier (C1 M2).
 */
export const HALL_PLOTS: PlotDef[] = [
  rectPlot('schauhalle', [0, 0, -66], 30, 28, {
    kind: 'hall',
    frame: 'island',
    facingDeg: 0,
    tiers: { detail: 8, exterior: 60 },
    interior: true,
    spawn: { position: [0, 0, 17], yawDeg: 0 },
  }),
];

/**
 * Ground sites (§2.3; frame 'ground': they ride the ground root and load once the Revier is open).
 * - Sonnenacker (−290, 60), 150 m E–W × 100 m N–S; local +Z faces east, so the Hofladen and the east
 *   gate (−215, 70) sit at local (−10, 0, 75); in the sun, 85 m path from G240.
 * - Traumhangar: centre polar(132, 165) = (122.6, 110.4), the 48 × 32 m hall with its doors on the
 *   48 m side facing bearing 312 (the island); the G120 pad lands 7.5 m from its island-side corner,
 *   the doors are 60 m from the dock wall. Exterior 80 m from the rect: the bridge head is 94.7 m from
 *   it (110 m from the edge would reach it; the plan's 110 m was from the anchor, 122.7 m away),
 *   Kanzel 120 is 66 m from it. `interior: true`.
 * - Kreislaufhof (340, −40): the 60 × 30 m hall, its long side facing the hub; cloud shade; from G60.
 * - Unkrautacker (−230, −260): 200 × 150 m, the long side facing the hub; sun; from G300.
 * Tiers from the edge: the site exteriors never reach the bridge head (≥ 215 m) or the plaza; the
 * region chunk (WP14) shows the sites from afar.
 */
export const SITE_PLOTS: PlotDef[] = [
  rectPlot('sonnenacker', [-290, 0, 60], 100, 150, { kind: 'site', frame: 'ground', facingDeg: 90, tiers: { detail: 40, exterior: 150 }, spawn: { position: [-10, 0, 78], yawDeg: 0 } }),
  rectPlot('traumhangar', polar(132, 165), 48, 32, { kind: 'site', frame: 'ground', facingDeg: 228, tiers: { detail: 25, exterior: 80 }, interior: true, spawn: { position: [0, 0, 20], yawDeg: 0 } }),
  rectPlot('kreislaufhof', [340, 0, -40], 60, 30, { kind: 'site', frame: 'ground', facingDeg: facingTowardHub([340, 0, -40]), tiers: { detail: 40, exterior: 150 }, spawn: { position: [0, 0, 18], yawDeg: 0 } }),
  rectPlot('unkrautacker', [-230, 0, -260], 200, 150, { kind: 'site', frame: 'ground', facingDeg: facingTowardHub([-230, 0, -260]), tiers: { detail: 40, exterior: 150 }, spawn: { position: [0, 0, 78], yawDeg: 0 } }),
];

/**
 * Areas without a plot here (dev zones such as `_example`, `_site-example`) get a temporary fallback
 * platform on this ring, beyond 900 m: the rc4 ring at r 230 would sit in the Revier (C1 m9).
 */
export const FALLBACK_RING = { radius: 950, plotRadius: 26 };

/** Trockendock 3 (§2.3, D22): the dock wall follows outlineRadius(b, true) + wallOffset, 66 m deep. */
export const TROCKENDOCK = {
  wallOffset: 4,
  depth: 66,
  floorY: -66,
  keelBlock: { center: [0, -63, 0] as Vec3Tuple, radius: 4, topY: -60 },
  /** the six Haltearme: wall → lobe tips */
  arms: { bearings: [30, 90, 150, 210, 270, 330], fromR: 102, toR: 106 },
  /**
   * The rescue volume over the dock floor and around the keel block (player rescue, dynamics reset;
   * C1 M7): y −66 … −61, inside the wall (r ≤ 106). ISLAND.killY −66 stays the backstop below it.
   * Ground frame: the island module adds it with ctx.physics.addRescueVolume and ctx.frames.adopt.
   */
  rescue: { center: [0, -63.5, 0] as Vec3Tuple, size: [216, 5, 216] as Vec3Tuple },
};

/** The dock wall's radius at bearing b (m): the island outline with the Kanzeln, plus the wall offset. */
export function dockWallRadius(b: number): number {
  return outlineRadius(b, true) + TROCKENDOCK.wallOffset;
}

/** The Revier side of the bridge (§2.3): bridge, bridge head, spawn and gate; the walkable boundary; lake; slab. */
export const REVIER = {
  bridge: { x: 0, fromZ: 101, toZ: 114, width: 4, slotWidth: 13 },
  bridgeHead: { apronZ: [114, 126] as [number, number], gateZ: 121 },
  /** first-visit spawn: bearing 0 (toward the island), pitch +6° */
  spawn: { position: [0, 0, 114] as Vec3Tuple, yawDeg: 0, pitchDeg: 6 },
  /** shore W, wind rise N, Werft fence E/S */
  walkableRadius: 650,
  /**
   * The flooded pit lake („Revier-See“, D22): the shore where proj(295°) = 600 m, the water at y −20 to
   * the far plane, ≥ 1 m below the nearest shore geometry. `rescue`: the reset volume at its surface
   * (y −23 … −19.5), 2 km deep along bearing 295 and 3 km wide (yawDeg = 180 − 295).
   */
  lake: {
    y: -20,
    shoreBearing: 295,
    shoreProj: 600,
    rescue: { center: polar(295, 1600, -21.25), size: [3000, 3.5, 2000] as Vec3Tuple, yawDeg: 180 - 295 },
  },
  /** the cloud bank: base +330, top +390 (m above the deck at h = 0); its edge where proj(295°) = 900 m */
  slab: { base: 330, top: 390, edgeBearing: 295, edgeDist: 900 },
};

/** Altitudes of the island over the dock (m; ctx.island.setAltitude): the Probestart lift, the F1 hover, the level-off after the lift-off. */
export const FLIGHT = { probestart: 0.3, f1Hover: 10, levelOff: 570 };

/** The landmarks of the Revier (§2.3; ground frame, y = terrain). MUST: the Grubenrand and the Werft cranes; the rest SHOULD / COULD. */
export const LANDMARKS = {
  /** on the path G240 → Hofladen: a 30 m terrace cut, a generic bucket wheel Ø 12 m, the Revier-Chronik board (§2.8) */
  grubenrand: { position: [-195, 0, 88] as Vec3Tuple, cut: 30, wheelDiameter: 12 },
  /** the Sonnenacker's farm shop at its east gate */
  hofladen: [-215, 0, 70] as Vec3Tuple,
  /** Werft gantry cranes K1, K2 (28 m), far landmarks east of the dock */
  cranes: [polar(75, 140), polar(105, 140)],
  craneHeight: 28,
  dorf: { position: [-45, 0, 256] as Vec3Tuple, size: [120, 80] as [number, number] },
  bahnhof: [0, 0, 207.8] as Vec3Tuple,
  /** Holzbau-Werkhof: a timber shell Ø 30 m, in the cloud shade */
  holzbau: { position: [230, 0, 230] as Vec3Tuple, diameter: 30 },
  /** Windkamm: three generic three-blade turbines, rotor Ø ≈ 80 m */
  turbines: [[150, 0, -420], [300, 0, -520], [0, 0, -600]] as Vec3Tuple[],
  rotorDiameter: 80,
  seeblick: [-480, 0, -180] as Vec3Tuple,
};

/**
 * The Feldbahn (SHOULD, §2.3, §2.4): a hexagon through polar(zone bearing, 240) plus the Bahnhof
 * (0, 207.8) on its southern edge; 1.44 km, 12 m/s, 20 s between stops. Stops F1 … F6 sit on the
 * vertices clockwise from the bridge (F1 at 210°, F6 at 150°), then the Bahnhof.
 */
export const RAIL = {
  radius: 240,
  stops: [210, 270, 330, 30, 90, 150].map((b, i) => ({ id: `F${i + 1}`, bearing: b, position: polar(b, 240) })),
  bahnhof: [0, 0, 207.8] as Vec3Tuple,
  length: 1440,
  speed: 12,
  dwell: 20,
};

/** Kanzel ↔ ground hops (§2.4): 3.0 s, d 65 m, apex 11.0 m, v₀ 26.2 m/s (hopNumbers(65, 0, 3)). */
export const GROUND_HOP = { flightTime: 3.0, distance: 65 };

/**
 * The trim rotors under the Kanzeln (D7): each belongs to the site its pad leads to, clockwise from
 * north. Cosmetic; they never gate (D23).
 */
export const TRIMS = [
  { id: 'T1', bearing: 60, site: 'kreislaufhof' },
  { id: 'T2', bearing: 120, site: 'traumhangar' },
  { id: 'T3', bearing: 240, site: 'sonnenacker' },
  { id: 'T4', bearing: 300, site: 'unkrautacker' },
] as const;

/** The four Kanzel pads at the stub ends (island frame), Ø 3 m; armed once the Revier is open, dark when airborne. */
export const KANZEL_PADS = TRIMS.map((t) => ({ id: `K${t.bearing}`, bearing: t.bearing, position: polar(t.bearing, 85), ground: `G${t.bearing}`, site: t.site, trim: t.id }));
/** The four ground pads G60/G120/G240/G300 (ground frame), Ø 3 m, 65 m down the pad line from their Kanzel pad. */
export const GROUND_PADS = TRIMS.map((t) => ({ id: `G${t.bearing}`, bearing: t.bearing, position: polar(t.bearing, 150), kanzel: `K${t.bearing}`, site: t.site }));

/**
 * Plots read by the engine (ZoneManager): the six lobes, the halls and the sites. Area ids not listed
 * here get a temporary fallback platform on FALLBACK_RING — see docs/ARCHITECTURE.md §3.
 */
export const PLOTS: PlotDef[] = [...ZONE_PLOTS, ...HALL_PLOTS, ...SITE_PLOTS];

// ── plot shapes (pure; ZoneManager and the tools) ──────────────────────────────

/** A plot's shape (rc4 plots without one are circles of their radius). */
export function shapeOf(plot: Pick<PlotDef, 'shape' | 'radius'>): NonNullable<PlotDef['shape']> {
  return plot.shape ?? { kind: 'circle', r: plot.radius };
}

/**
 * Horizontal distance (m) from a world point to the plot's edge; 0 inside. `facingRad` is the plot's
 * yaw (radians, three's rotation.y): local +Z = (sin f, cos f), local +X = (cos f, −sin f) in (x, z).
 */
export function plotEdgeDistance(shape: NonNullable<PlotDef['shape']>, ax: number, az: number, facingRad: number, x: number, z: number): number {
  const dx = x - ax,
    dz = z - az;
  if (shape.kind === 'circle') return Math.max(0, Math.hypot(dx, dz) - shape.r);
  const c = Math.cos(facingRad),
    s = Math.sin(facingRad);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const ex = Math.max(0, Math.abs(lx) - shape.w / 2);
  const ez = Math.max(0, Math.abs(lz) - shape.d / 2);
  return Math.hypot(ex, ez);
}

/** The world spawn of a plot (its `spawn`, else just outside the edge on local +Z), yaw in degrees (three's rotation.y). */
export function plotSpawnWorld(plot: PlotDef): { position: Vec3Tuple; yawDeg: number } {
  const f = ((plot.facingDeg ?? facingTowardHub(plot.anchor)) * Math.PI) / 180;
  const sh = shapeOf(plot);
  const p = plot.spawn?.position ?? [0, 0, (sh.kind === 'rect' ? sh.d / 2 : sh.r) + 2];
  const c = Math.cos(f),
    s = Math.sin(f);
  return { position: [plot.anchor[0] + p[0] * c + p[2] * s, plot.anchor[1] + p[1], plot.anchor[2] - p[0] * s + p[2] * c], yawDeg: (f * 180) / Math.PI + (plot.spawn?.yawDeg ?? 0) };
}

/** Kept for compatibility (former placeholder ring distance). */
export const RING_DISTANCE = ISLAND.lobeRing;

/** Yaw (degrees) so that local +Z of a plot at `anchor` points to the hub. */
export function facingTowardHub(anchor: Vec3Tuple): number {
  const dx = HUB.anchor[0] - anchor[0],
    dz = HUB.anchor[2] - anchor[2];
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

/**
 * The objective route per audience mode (plan §1.3, §1.4): the areas in visiting order, the design
 * target in minutes per step (H-TIME and the wave-2 block-out session recalibrate them through the
 * integrator). Which stations of an area are on the route comes from the manifests (`route` roles:
 * 05 B and 06 C are Entdecker side stations, D40). A `stop` is visited, not stamped: the Entscheider
 * „Schaufenster“ in the Schauhalle (D41). Before the first step: title → bridge → Probestart → Pass →
 * pad (`start`); after the last: the Startprüfung in the Kiel and the lift-off (`finale`).
 */
export interface RouteStep {
  area: string;
  minutes: number;
  stop?: boolean;
}
export const ROUTE_STEPS: { readonly entdecker: readonly RouteStep[]; readonly entscheider: readonly RouteStep[] } = {
  entdecker: [
    { area: 'sensordom', minutes: 8.0 },
    { area: 'sonnenacker', minutes: 10.0 },
    { area: 'regelgarten', minutes: 14.0 },
    { area: 'schauhalle', minutes: 4.0 },
    { area: 'greifwerkstatt', minutes: 11.0 },
    { area: 'lern-dojo', minutes: 10.0 },
    { area: 'traumhangar', minutes: 12.5 },
    { area: 'dunkelfabrik', minutes: 7.0 },
    { area: 'prueffeld', minutes: 7.0 },
  ],
  entscheider: [
    { area: 'dunkelfabrik', minutes: 3.0 },
    { area: 'prueffeld', minutes: 3.5 },
    { area: 'sensordom', minutes: 3.0 },
    { area: 'regelgarten', minutes: 3.0 },
    { area: 'schauhalle', minutes: 2.5, stop: true },
    { area: 'greifwerkstatt', minutes: 3.0 },
    { area: 'lern-dojo', minutes: 4.0 },
  ],
};
/** Minutes before the first and after the last step (§1.3 rows 0, 10, 11; §1.4 rows 0, 8, 9). */
export const ROUTE_ENDS = {
  entdecker: { start: 1.0, pruefung: 6.0, liftoff: 3.2 },
  entscheider: { start: 1.0, pruefung: 3.5, liftoff: 2.5 },
} as const;

/** Objective order per audience mode: the area ids of ROUTE_STEPS (plan §1.3, §1.4). */
export const ROUTES: { readonly entdecker: readonly string[]; readonly entscheider: readonly string[] } = {
  entdecker: ROUTE_STEPS.entdecker.map((s) => s.area),
  entscheider: ROUTE_STEPS.entscheider.map((s) => s.area),
};

// ── paths (§4.5) ─────────────────────────────────────────────────────────────

export const PATHS = {
  plazaRadius: 32,
  /** Recamán-Allee: bearing 180, Landedeck (z 83) → plaza edge (z 32), 8 m wide */
  avenue: { from: 32, to: 84, width: 8 },
  /** six spokes on the zone bearings, r 32 → 58 (gate), 6 m wide */
  spoke: { from: 32, to: 58, width: 6 },
  /** north spoke to the Glasbalkon, r 32 → 85, 4 m */
  northSpoke: { from: 32, to: 85.5, width: 4 },
  /** ring path r 43.5 … 48.5 */
  ring: { inner: 43.5, outer: 48.5 },
  /** Kanzel stubs at 60/120/240/300, r 48.5 → 84, 3 m */
  kanzelStub: { from: 48.5, to: 85, width: 3 },
};

// ── transit pads (§4.6) ──────────────────────────────────────────────────────

export const PADS = {
  hubRadius: 27,
  zoneRadius: 52,
  diameter: 3,
  /** flight time of a hop (s) and gravity used for the readout and the flight */
  flightTime: 2.5,
  gravity: 9.81,
};

/** Ballistic hop numbers (Appendix B) for horizontal distance d and height change dy. */
export function hopNumbers(d: number, dy = 0, T = PADS.flightTime, g = PADS.gravity): { vh: number; vy: number; apex: number; v0: number } {
  const vh = d / T;
  const vy = (dy + 0.5 * g * T * T) / T;
  return { vh, vy, apex: (vy * vy) / (2 * g), v0: Math.hypot(vh, vy) };
}

// ── gate masts (§4.4) ────────────────────────────────────────────────────────

/** Gate mast foot (world): r = 57 on the zone bearing, 5 m to the clockwise side. */
export function gateMastPosition(bearing: number): Vec3Tuple {
  const [x, z] = bearingDir(bearing);
  const [tx, tz] = bearingDir(bearing + 90);
  return [x * 57 + tx * 5, 0, z * 57 + tz * 5];
}

// ── hub structures (§6.1) ────────────────────────────────────────────────────

export const TOWER = {
  circumradius: 9,
  inradius: 8.69,
  roofY: 44,
  crownY: 48,
  foyerHeight: 7,
  /** alias of the dial face (tower v2, ART-V2 §3.3) — kept for compatibility (the onboarding's „Turm-Logo“ marker) */
  medallion: { center: [0, 24, 8.5] as Vec3Tuple, radius: 10.5 },
  /** Recamán relief (Phase 5, planar): mark plane = tube centres, dial face and back plate z, disc radius,
   *  Messpunkt (eye). The tower owns the depth stack (tower/constants.ts) and reads x/y, radius and eye here. */
  sculpture: { center: [0, 24, 8.95] as Vec3Tuple, faceZ: 8.5, backZ: 7.65, radius: 10.5, eye: [0, 1.65, 94.5] as Vec3Tuple },
  /** drawing arm flange under the halo (bearing 180); swept envelope ≈ x ±4.5, y 33.5–44.1, z 10.7–19.6 */
  arm: { base: [0, 43.4, 12.2] as Vec3Tuple },
  lift: { x: 0, z: -10.7, stops: { ausguck: 44, foyer: 0, kiel: -36 } },
  ausguck: { y: 44, inner: 9, outer: 13 },
};

export const LIBELLE = { center: [0, 0, 19] as Vec3Tuple, plinthRadius: 3.5, plinthHeight: 1.1, dishCurvature: 4, dishRim: 3, ball: 0.5 };

export const KEEL = { catwalkY: -36, catwalkInner: 9, catwalkOuter: 13, coreY: -40, tipY: -60, coneTopRadius: 60, coneBottomRadius: 4 };

/** Phase 7: the last safe position was in the ground frame (bridge, apron, Revier, a site, the dock floor), not aboard. */
export function onGroundFrame(from: Vec3Tuple): boolean {
  const [fx, fy, fz] = from;
  const r = Math.hypot(fx, fz);
  // the dock floor and the keel block (y −66 … −60) lie below the keel tip; the Kielraum (y −36) is aboard
  if (fy < -58 && r < dockWallRadius(bearingOf(fx, fz)) + 2) return true;
  // the Glasbalkon (glass floor, z −85 … −99) is aboard although it is outside the solid outline
  if (fz < -84 && fz > -100 && Math.abs(fx) < 8) return false;
  return r > outlineRadius(bearingOf(fx, fz), true) + 1.5;
}

/**
 * Where a fall from the ground frame ends: a site's spawn when it happened in (or next to) the
 * site, the bridge head near the dock, else the last safe position, facing the island.
 */
function groundRescue(from: Vec3Tuple): { position: Vec3Tuple; yawDeg: number } {
  const [fx, , fz] = from;
  for (const p of SITE_PLOTS) {
    const f = ((p.facingDeg ?? facingTowardHub(p.anchor)) * Math.PI) / 180;
    if (plotEdgeDistance(shapeOf(p), p.anchor[0], p.anchor[2], f, fx, fz) < 6) return plotSpawnWorld(p);
  }
  if (Math.hypot(fx, fz) < 140) return { position: [...REVIER.spawn.position], yawDeg: REVIER.spawn.yawDeg };
  return { position: [fx, 0, fz], yawDeg: -bearingOf(-fx, -fz) };
}

/**
 * Where a rescue drone puts a falling player (engine hook, Game.checkPlayerFall and the rescue
 * volumes). `from` = last safe (grounded) world position. Aboard: near a plot → that plot's gate
 * spawn; otherwise the same bearing, 5 m inside the solid rim (always flat deck). In the ground
 * frame (Phase 7): see groundRescue().
 */
export function rescuePoint(from: Vec3Tuple): { position: Vec3Tuple; yawDeg: number } {
  if (onGroundFrame(from)) return groundRescue(from);
  const [fx, , fz] = from;
  const plotSpawn = (p: ZonePlotInfo): { position: Vec3Tuple; yawDeg: number } => {
    const [x, , z] = polar(p.bearing, 56);
    return { position: [x, 0, z], yawDeg: -p.bearing };
  };
  const inPlot = (x: number, z: number, margin: number): ZonePlotInfo | undefined => ZONE_PLOTS.find((p) => Math.hypot(x - p.anchor[0], z - p.anchor[2]) < p.radius + margin);
  // near a zone → its gate spawn (zone geometry may fill the plot)
  const near = inPlot(fx, fz, 6);
  if (near) return plotSpawn(near);
  const r = Math.hypot(fx, fz);
  if (r < 1) return { position: [HUB.spawn!.position[0], 0, HUB.spawn!.position[2]], yawDeg: 0 };
  // Glasbalkon / Kanzeln: back onto the deck
  if (fz < -84 && Math.abs(fx) < 8) return { position: [0, 0, -82], yawDeg: 180 };
  for (const kb of ISLAND.kanzeln.bearings) {
    const c = polar(kb, ISLAND.kanzeln.ring);
    if (Math.hypot(fx - c[0], fz - c[2]) < ISLAND.kanzeln.radius + 3) {
      const [x, , z] = polar(kb, 80);
      return { position: [x, 0, z], yawDeg: -kb };
    }
  }
  // same bearing, 5 m inside the solid rim (flat deck strip); never inside a plot
  const b = bearingOf(fx, fz);
  const [x, , z] = polar(b, Math.max(2, Math.min(r, outlineRadius(b) - 5)));
  const hit = inPlot(x, z, 2);
  if (hit) return plotSpawn(hit);
  return { position: [x, 0, z], yawDeg: -b + 180 };
}

/** Start-screen camera: slow orbit around `target` (world) — the island from outside. */
export const ATTRACT_CAMERA = {
  target: [0, -8, 0] as Vec3Tuple,
  radius: 190,
  height: 26,
  /** metres the view is shifted so the island sits right of the title card */
  screenOffset: 70,
  /** radians per second */
  speed: 0.03,
  startDeg: 200,
};
