/**
 * WP15 (life and easter eggs): every tunable number of the ambient life and the eggs in one place (plan
 * §6.1 „Tuning and juice“; WP20 edits only this file). Metres (world, at h = 0), seconds, m/s, 0…1.
 * Places on the ground are proposals that keep clear of WP3's yard and of the site rects of WP9/WP14;
 * a site that knows its own layout better sends it with 'sonnenacker:layout' (life.ts).
 */
import { TOWER, polar, type Vec3Tuple } from '../layout';

/** The LifeDirector (plan §4.12 tiers and caps; R9 §4.5). */
export const DIRECTOR = {
  /** tier edges, measured from an area's sphere (m) */
  nearM: 40,
  midM: 150,
  farM: 1500,
  /** mid agents run in this many round-robin slices of the 60 Hz tick (→ 15 Hz each) */
  midSlices: 4,
  /** far proxies are re-placed at this rate (Hz) */
  farHz: 2,
  /** ground areas are hidden above this altitude (m) */
  hiddenAboveM: 300,
  /** caps (§4.12): CPU agents, shader instances, extra voices */
  maxAgents: 64,
  maxInstances: 400,
  maxVoices: 6,
};

/** The Hof-Takt: one 8-minute farm loop (R9 §4.2): harvest, transport, maintenance, irrigation. */
export const HOF = {
  loopS: 480,
  phases: [
    { id: 'ernte', from: 0 },
    { id: 'abtransport', from: 300 },
    { id: 'wartung', from: 360 },
    { id: 'bewaesserung', from: 420 },
  ] as const,
  /** the clock starts this far into the first loop (a fresh start is already in the harvest) */
  startT: 40,
};

/** Life areas (world centre at h = 0, radius): agents of one area are tiered together. */
export const AREAS = {
  deck: { center: [0, 0, 0] as Vec3Tuple, radius: 100, frame: 'island' as const },
  ausguck: { center: [0, TOWER.ausguck.y, 0] as Vec3Tuple, radius: 13, frame: 'island' as const },
  bridgehead: { center: [0, 0, 114] as Vec3Tuple, radius: 12, frame: 'ground' as const },
  /** the gather spot on the WSW rim, in the foreground of the outside shot C1 (WP3 camera.ts: drone R-3 at polar(246, 186)) */
  apron: { center: polar(246, 113), radius: 10, frame: 'ground' as const },
  werft: { center: [150, 0, 4] as Vec3Tuple, radius: 14, frame: 'ground' as const },
  /** the Hofladen forecourt east of the Sonnenacker's gate (−215, 70): crate rovers, visitors, the puddle */
  hof: { center: [-206, 0, 70] as Vec3Tuple, radius: 14, frame: 'ground' as const },
  /** the field itself (WP9's beds): pickers, the agronomist, the bumblebees */
  sonnenacker: { center: [-246, 0, 62] as Vec3Tuple, radius: 30, frame: 'ground' as const },
};

/** People (D18: 8 stylised, faceless figures with jobs; R9 §4.1 option B). */
export const PEOPLE = {
  walk: 1.25,
  /** older visitor and pickers with a basket walk slower */
  walkSlow: 0.95,
  /** a person steps aside when the player comes this close on their way (people yield to you) */
  yieldM: 1.7,
  /** and looks at the player within this distance */
  lookM: 6,
  waveS: 2.2,
  /** heights (m) of the eight; mixed ages and body types */
  heights: { agronomin: 1.68, techniker: 1.82, nachlese1: 1.6, nachlese2: 1.76, besucher1: 1.71, besucher2: 1.56, dockcrew: 1.78, mechanikerin: 1.66 },
};

/** Places on the ground (world, h = 0). */
export const SPOTS = {
  // ── bridge head (WP3 bridge.ts: notch x ±3.5 to z 114, pen x ±9 z 104…121, sign (5.3, 107.1)) ──
  /** egg 13: the Winke-Arm's post, mirrored to the sign on the yard west of the notch */
  winkePost: [-5.1, 0, 107.6] as Vec3Tuple,
  /** the dock crew member's beat along the west fence of the pen, and where they watch the bridge from */
  crewBeat: [
    [-6.8, 0, 111.6],
    [-7.2, 0, 118.6],
  ] as Vec3Tuple[],
  crewWatch: [-6.6, 0, 110.4] as Vec3Tuple,
  // ── the Werft (WP3 werft.ts: Werfthalle (171, 0) 30 × 18, door west at x 156, profile rack at (148, 6)) ──
  werftBench: [149.5, 0, 8.4] as Vec3Tuple,
  werftDoor: [154.4, 0, -3.5] as Vec3Tuple,
  werftCoil: [146.5, 0, 4.6] as Vec3Tuple,
  // ── the Hofladen forecourt (outside the Sonnenacker rect x −365…−215): the crate rovers run a narrow
  //    loop gate → depot (out on the north lane past the puddle, back on the south lane); people stand
  //    beside it (the shop north, the tool cart and the drone pad south), so they cross it now and then ──
  /** the field gate, and the depot („Packplatz“) at the loop's east end */
  gate: [-216.5, 0, 68.4] as Vec3Tuple,
  depot: [-204.6, 0, 66.0] as Vec3Tuple,
  /** the rovers' loop (north lane out, south lane back) */
  roverLoop: [
    [-214.4, 0, 68.6],
    [-210.6, 0, 67.9],
    [-206.6, 0, 67.0],
    [-206.4, 0, 64.6],
    [-210.8, 0, 64.4],
    [-214.4, 0, 65.6],
  ] as Vec3Tuple[],
  /** the farm-shop crates where the visitors browse, and their bench */
  shop: [-209.6, 0, 75.4] as Vec3Tuple,
  bench: [-204.2, 0, 76.6] as Vec3Tuple,
  /** „Rover 5 und die Pfütze“ (R9 §4.3): the puddle on the rovers' north lane */
  puddle: [-210.6, 0, 67.8] as Vec3Tuple,
  /** the technician's tool cart */
  toolCart: [-206.6, 0, 60.6] as Vec3Tuple,
  /** where the finger drone lands („Ersatzfinger per Drohne“), beside the tool cart */
  dronePad: [-203.2, 0, 59.6] as Vec3Tuple,
  /** where the Nachlese pickers sort crates between misses, east of the depot */
  sort: [-202.4, 0, 66.2] as Vec3Tuple,
  /** the two bumblebee boxes (L8) on the hedge line by the gate */
  hives: [
    [-213.6, 0, 58.4],
    [-213.6, 0, 81.6],
  ] as Vec3Tuple[],
  // ── the field: WP9's Sonnendach A (src/zones/sonnenacker/tuning.ts at 92a1f7d, local x north, z east →
  //    world (−290 + z, 60 − x)): six beds at world z 66 … 54, their east ends at x −247 with the crates
  //    at x −245.75; the Hofladen at (−226, 80.5); a 'sonnenacker:layout' event overrides these ──
  /** the service lane east of the bed ends, and the bed ends (the aisles) the agronomist checks */
  lane: [
    [-243.6, 0, 52],
    [-243.6, 0, 67.5],
  ] as Vec3Tuple[],
  beds: [
    [-245.6, 0, 64.8],
    [-245.6, 0, 62.4],
    [-245.6, 0, 60.0],
    [-245.6, 0, 57.6],
    [-245.6, 0, 55.2],
    [-245.6, 0, 53.2],
  ] as Vec3Tuple[],
  /** WP9's two Hummelkästen at the east ends of beds 1 and 6 (the bumblebees fly there when the farm is in) */
  farmHives: [
    [-245.4, 0, 68.2],
    [-245.4, 0, 51.8],
  ] as Vec3Tuple[],
  // ── the gather (plan §4.12 apron crowd, visible in C1) ──
  /** spots on the WSW rim, facing the island; the first three are always taken (mechanic, two visitors) */
  gather: [polar(243, 112.5), polar(246.5, 113.2), polar(249.5, 112.4), polar(240.5, 113.6), polar(252.5, 113.4)] as Vec3Tuple[],
  /**
   * the dock crew member at the Ausguck rail (island frame), right of WP13's launch console as you see it
   * (you stand at polar(327.5, 9.5) facing bearing 295, the console 2 m ahead) and clear of the earned
   * guests on the ring (r 11.8, bearings 300 … 252; WP13 finale/tuning.ts AUSGUCK at e4fbb14)
   */
  crewRail: polar(326, 12.4, TOWER.ausguck.y),
};

/** The crate rovers of the Hofladen (L4; rc4 service-rover geometry, landscape/rovers.ts). */
export const FARM = {
  rovers: 3,
  speed: 0.75,
  /** a crate loaded or unloaded */
  dwellS: 3.2,
  /** „Rover 5 und die Pfütze“: stuck at the puddle this long, three passes in a row, then the plate */
  stuckS: 3.4,
  stuckPasses: 3,
  /** crates in the depot stack (it fills over the harvest and empties at the transport) */
  stackMax: 12,
  /** misses on the vine the pickers collect (from 'sonnenacker:shift'; instanced tomatoes) */
  maxMisses: 24,
};

/** Bumblebees (L8): CPU-placed instances near the hives, only in the near tier. */
export const BEES = {
  count: 48,
  /** flight radius around a hive (m) and the flower band's height */
  radius: 7,
  y0: 0.35,
  y1: 1.25,
  speed: 2.1,
  /** a bee „sonicates“ a flower this long (the buzz burst) */
  buzzS: 1.4,
};

/** Birds (L17: they flush at a rotor beat and at the lift-off). */
export const BIRDS = {
  /** flocks: where they feed (ground), how many */
  flocks: [
    { at: [-236, 0, 34] as Vec3Tuple, n: 14 },
    { at: polar(214, 138), n: 10 },
  ],
  flushS: 11,
  /** they also flush when the player sprints within this distance */
  sprintM: 7,
};

/** The deck rovers' safety field and replan (L5, egg 5; landscape/rovers.ts). */
export const SAFETY = {
  /** the flat ring shows within this distance (teal) */
  showM: 5.5,
  /** the protective separation distance: amber inside, the rover stops */
  stopM: 1.9,
  /** it slows down inside this distance */
  slowM: 4.2,
  /** stopped this long with you in its way, it replans (never waits more than 2 s, R9 §3 rule 5) */
  replanAfterS: 0.7,
  /** the teal A* frontier spreads over this long, then the detour runs */
  frontierS: 1.1,
  /** the coarse grid of the replan (m) and its window */
  cell: 0.5,
  window: 9,
  /** egg 5 „Der Wackelige“: replans caused by you */
  eggReplans: 3,
};

/** The Tomatenkapsel in pod 240 (plan §4.10): an SO-101 picks cherry tomatoes at the research pace. */
export const KAPSEL = {
  /** one fruit per cycle, the research mean (Bac et al. 2014, R9 S37) */
  cycleS: 33,
  success: 0.66,
  /** tomatoes on the pod's vines, regrowing after a pick */
  fruits: 14,
  regrowS: 95,
};

/** Egg 13 Winke-Arm. */
export const WINKE = {
  /** it notices you within this distance (and in front of it) and waves first */
  noticeM: 9,
  waveS: 2.6,
  /** once per approach: you must leave beyond this distance before it waves again */
  resetM: 14,
  /** the reply: three wiggles of the view (yaw reversals ≥ minDeg each) within windowS while it is in view */
  wiggles: 3,
  windowS: 1.6,
  minDeg: 6,
  /** within this angle of the view centre and this distance */
  aimDeg: 28,
  replyM: 12,
  danceS: 4.2,
  postH: 1.02,
  /** the SO-101's shoulder_pan turns against the model's yaw (measured: −1 faces you) */
  panSign: -1,
};

/** Egg 14 Fotopunkt: focal lengths (mm, full-frame equivalent: vertical FOV = 2·atan(12 / f)). */
export const FOTO = {
  mm: [24, 35, 50, 85],
  defaultMm: 35,
  /** the camera mark on the Ausguck floor by the rail, on the walk from the lift to the launch stand, clear of the guests */
  mark: polar(340, 11.0, TOWER.ausguck.y),
  png: { w: 1600, h: 1000 },
};

/** Egg 1 „Die nächste Zahl“ (promoted from SHOULD by the plan's secret-audit rule, §4.13). */
export const NAECHSTE = {
  /** the small console at the plaza end of the Allee (inside its railing at x ±4.35, where the floor arcs end at x 0) */
  console: [3.5, 0, 34.1] as Vec3Tuple,
  /** the extra arcs a(18…25) over the plaza: drawing time per arc, then they hold and fade */
  arcS: 0.9,
  holdS: 10,
};
