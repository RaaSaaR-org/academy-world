/**
 * Sonnenacker (plan §4.10, R8 §2; WP9): every tunable number of the farm in one place (plan §6.1
 * „Tuning and juice“; WP20 edits only this file). Data only, no imports: the zone, its pure models
 * (model.ts) and the Node tools (tools/agripv-check.mjs, tools/sonnenacker/kurzlauf.mjs, which import
 * this file with Node's type stripping) read the same values. Sources are R8 §8 [Sx]; numbers R8
 * computed itself are marked „eigene Rechnung“ there and RICHTWERT here.
 *
 * Frame: zone-local metres. The plot's local +Z faces east (layout.ts facingDeg 90), so +x is NORTH,
 * −x south, +z east (the Hofladen, the gate and the island), −z west (the lake and the low WNW sun);
 * y is up from the site's planar terrain (site.ts `plane`).
 */

/** Where things stand (local x north, z east; metres). The plot rect is x ±50, z ±75. */
export const SITE = {
  /** the east gate at the end of the G240 track (layout: world (−216, 70) = local (−10, 75)) */
  gate: [-10, 75] as [number, number],
  /** the timber Hofladen: centre, size along x (N–S) and z (E–W), eaves height; its north facade carries the dashboard */
  hofladen: { x: -20.5, z: 64, w: 7, d: 12, h: 3.2, ridge: 5.2 },
  /** the gravel yard between the gate, the Hofladen and the roof */
  yard: { x0: -15, x1: -4.5, z0: 51, z1: 75 },
  /** the 1:20 Tagesmodell of Sonnendach A (station B): table centre */
  tagesmodell: { x: -6.5, z: 55.5, w: 1.2, d: 2.3, h: 0.86, scale: 1 / 20 },
  /** the C console („Tagesplan“) at the south-east corner of Sonnendach A, beside the rovers' lane */
  planer: { x: -11.0, z: 46.4 },
  /** the station A bench („Lernkiste“) at the east end of bed 1, on its south side */
  lernkiste: { x: -7.55, z: 41.5 },
  /** ceramic cistern (gutters → cistern → drip lines) */
  cistern: { x: 9.5, z: 51, r: 1.55, h: 3.1 },
  /** EMI-08 at the Hofladen front, facing the yard */
  emi: [-13.6, 0, 62.5] as [number, number, number],
  /** the bumblebee boxes (Hummelkästen) on posts at the east ends of beds 1 and 6 */
  bees: [
    [-8.2, 44.6],
    [8.2, 44.6],
  ] as [number, number][],
  /** three unroofed Referenzbeete north of Sonnendach A */
  referenz: { xs: [13.2, 15.6, 18.0], z0: 22, z1: 34 },
  /** hedge and flower strip along the north and west edges */
  hedge: { north: 46.5, west: -71.5 },
  /** the LeKiwi depot behind the Hofladen (the trays go in here) */
  depot: [-14.8, 55.2] as [number, number],
} as const;

/** Sonnendach A (the play block) and B (ambience): 36 × 14 m roofs over six Hochbeete each (R8 §2.1). */
export const ROOFS = {
  /** z-range of each roof (E–W, 36 m); both span x −7 … 7 (N–S, 14 m) */
  a: { z0: 10, z1: 46 },
  b: { z0: -33, z1: 3 },
  x0: -7,
  x1: 7,
  /** six single-axis rows, axis N–S (along x), tracking east–west; z offsets from the roof's z0 */
  rowOffsets: [3, 9, 15, 21, 27, 33],
  /** pivot (torque tube) height: the low edge clears 2.6 m at the full 50° (DIN SPEC 91434 Cat. I > 2.1 m [S6]) */
  pivotY: 3.5,
  /** table width across the axis (one bifacial module in landscape: 2.25 × 1.13 m) and modules per row */
  tableW: 2.25,
  moduleL: 1.13,
  modules: 12,
  /** tracker limit (deg) */
  maxTiltDeg: 50,
  /** a row's control loop (ART-V2 §2.1 rule 5, as the island's rows): new estimate every 6–10 s, settles in ≈ 1.2 s */
  retargetS: [6, 10] as [number, number],
  settleS: 1.2,
  /** stow and Schutzstellung: the slewing time (≥ 2 s, single ramps: flash-safe) */
  slewS: 2.6,
  /** lift-off (plan §4.15): the downwash front's speed when WP13's event carries no radius (m/s), the farm rows' distance from the dock centre (m) */
  waveSpeed: 34,
  /** a row turns back to tracking this long after its stow, or at the next docked resume */
  waveHoldS: 40,
} as const;

/** The Hochbeete (R8 §2.1: „planted for the robot“). */
export const BEDS = {
  /** bed centres along x (N–S); bed 1 is the southernmost (next to the entry path) */
  xs: [-6, -3.6, -1.2, 1.2, 3.6, 6],
  length: 30,
  width: 1.0,
  height: 0.85,
  /** soil surface height and the two tomato rows 0.25 m in from each long edge */
  soilY: 0.8,
  rowInset: 0.25,
  /** the rail on each long edge (outside the board) and the carriage on it */
  railOffset: 0.58,
  railY: 0.74,
} as const;

/** The 12 + 6 real SO-101 arms on rail carriages (R8 §2.1, plan §4.10). */
export const ARMS = {
  /** the base on the carriage's lift: lowest and highest (0.6 m lift) above the ground */
  liftY: [0.98, 1.58] as [number, number],
  /** horizontal offset of the arm base from the bed's long edge, outward */
  baseOut: 0.12,
  /** ≈ 0.41 m reach (R1, [S26]); IK targets beyond this are left for the people */
  reach: 0.4,
  /** rail speed (m/s): ambient and the time-lapse of the automated day */
  railSpeed: 0.32,
  railSpeedDay: 2.4,
  /** one ambient attempt per 33 s at 66 % success (the research average, Bac et al. 2014 [S17]; R9 L2) */
  ambientCycleS: 33,
  ambientSuccess: 0.66,
  /** the pick motion at 1× (s): approach, close, twist, retract, drop into the tray, home */
  motion: { approach: 1.5, close: 0.35, twist: 0.45, retract: 0.7, drop: 0.9, home: 0.7 },
  /** the nod after a good pick and the slow head shake after a miss (s) */
  nodS: 0.25,
  shakeS: 0.9,
  /** a tray holds this many cherry tomatoes; full trays go down the chute at the bed end */
  trayFruits: 12,
  /** near models (plan §4.10, C1 m1): ≤ 1 at LOD0 within 6 m, ≤ 2 at LOD1 within 12 m; the rest are the instanced crowd at LOD2 */
  lod0M: 6,
  lod1M: 12,
  maxLod0: 1,
  maxLod1: 2,
  /** the arm stops while you stand this close (m) and its status lamp turns amber */
  yieldM: 0.95,
  /** life:react 'liftoff' / 'wave': every arm raises its gripper and waves this long (s) */
  waveS: 2,
  /** update tiers: every frame within nearM of the player, else at midHz round robin */
  nearM: 40,
  midHz: 12,
} as const;

/** The LeKiwi crate rovers (real, Apache-2.0; WP0 licence gate green, flagged for legal review). */
export const ROVERS = {
  count: 2,
  speed: 0.55,
  /** the rovers' loop (local x, z): depot → along the south side of Sonnendach A → the bed ends → back */
  loop: [
    [-14.8, 55.2],
    [-9.4, 50.5],
    [-9.4, 46.4],
    [-7.8, 45.5],
    [7.8, 45.5],
    [9.0, 47.0],
    [4.0, 49.0],
    [-9.4, 50.5],
  ] as [number, number][],
  /** the dwell at a bed end while a tray is loaded (s) */
  dwellS: 2.5,
} as const;

/**
 * Station A „Reif oder nicht?“ (R8 §2.2, plan §4.10): the USDA colour classes [S24] (Green, Breakers,
 * Turning, Pink, Light red, Red; Light red + Red → pick). Each fruit has a true redness 0…1; the wrist
 * camera reads it in the sun, darker under the panels, and the colour card corrects the shade (white
 * balance). The arm learns one threshold from your 12 labels (a decision stump).
 */
export const RIPE = {
  /** class centres of the true redness and the in-class spread */
  centres: [0.05, 0.22, 0.38, 0.55, 0.73, 0.9],
  jitter: 0.045,
  /** pick from this class index on (Light red) */
  pickFrom: 4,
  /** sun-lit colours of the six classes (ripe reads deep red #B5332A, never brand orange; §2.7 rule 5) */
  colours: [0x6f8a3c, 0xa8a04c, 0xc4954e, 0xcb7a5a, 0xbd4634, 0xb5332a],
  /** the teaching tray: two fruits per class, offsets from the class centre */
  teach: [-0.02, 0.025],
  /** the test bench: 40 fruits, per class */
  test: [5, 5, 6, 8, 8, 8],
  seed: 20261018,
  /** camera reading noise in the sun */
  sunNoise: 0.022,
  /** under the panels the camera sees red darker: reading = r × gain + offset (+ noise) */
  shadeGain: 0.8,
  shadeOffset: -0.03,
  shadeNoise: 0.028,
  /** with the colour card in view: the white balance undoes the shade, a small residual remains */
  cardNoise: 0.024,
  /** the shaded camera image: colour multiplier and the blue cast of the sky light */
  shadeTint: [0.56, 0.6, 0.72] as [number, number, number],
} as const;

/**
 * Station B „Licht teilen“ (R8 §2.3): the light rule and the electricity anchor. T = light under the
 * roof ÷ open field by module density; Y_crop = 1 − s·(1 − T), s ∈ [0,7; 1,0] [S14] (a band);
 * Y_el = 0,83·(1 − T)/0,30, capped at 1 (Heggelbach geometry [S5]); LER = Y_crop + Y_el.
 */
export const AGRIPV = {
  /** density steps: locker, mittel, dicht */
  densityT: [0.85, 0.7, 0.55],
  /** the light rule's slope band */
  s: [0.7, 1.0] as [number, number],
  /** electricity: 83 % of a PV-only plant at 30 % shade (Heggelbach 2018 [S5]) */
  elAnchor: 0.83,
  elShade: 0.3,
  /** „Pflanze zuerst“ (Nussbach's split [S9]): +0,05 T in flowering and fruit set, −5 % electricity */
  plantFirstT: 0.05,
  plantFirstEl: 0.95,
  /** DIN SPEC 91434: the crop keeps ≥ 66 % of the reference [S6] (the band's lower edge) */
  dinMin: 0.66,
  /** the hail front (FIKTION): the share of fruit lost without the Schutzstellung; PV can shelter from hail [S2] */
  hailLoss: 0.15,
  /** the season run (s; Space jumps to the result), the hail front's position in the season and its crossing time */
  seasonS: 10,
  hailAt: 0.52,
  hailS: 2.2,
  /** the prediction („Erst tippen, dann messen“): tomato yield in % of the open field */
  predict: { min: 30, max: 100, step: 1, initial: 65 },
  /** the table-model day: the lamp's elevation at noon (deg) and the gauges' smoothing (s) */
  noonDeg: 58,
  gaugeTau: 0.25,
} as const;

/**
 * Station C „Erntetag“ (R8 §2.3, plan §4.10): p = p_vis · p_ripe · p_window (ILLUSTRATIV); deleafing
 * moves fruit to „frei“; damage 3 % + 2 % per mis-calibrated grip; cycle median ≈ 25 s. The measured
 * sample is your two rows of bed 2 (the Messbeet): 2 × 30 fruits.
 */
export const PICK = {
  /** the Messbeet (bed index into BEDS.xs) and its fruits per row */
  bed: 1,
  perRow: 30,
  /** visibility classes: free, half hidden, hidden (ILLUSTRATIV) */
  pVis: { free: 0.85, half: 0.55, hidden: 0.1 },
  /** the rows as planted: per 30 fruits this many are half hidden and hidden behind leaves (the rest free) */
  half: 12,
  hidden: 6,
  /** leaf clusters per measured row (E: the human's job); a cluster covers three fruits */
  clustersPerRow: 10,
  /** ripeness judgement: midday stripe light lowers it unless station A found the calibration */
  pRipe: 0.98,
  pRipeStripes: 0.8,
  /** the harvest window */
  pWindow: { morning: 0.98, midday: 1.0, evening: 0.95 },
  /** damage per grip: 3 % (average fruit damage 5 % [S17]) + 2 % per mis-calibrated grip (ILLUSTRATIV) */
  damage: 0.03,
  damageMiscal: 0.02,
  /** cycle time: median ≈ 25 s with a log-normal spread (ILLUSTRATIV; 24 s [S19], 32,46 s [S20], 33 s [S17]) */
  cycleMedianS: 25,
  cycleSigma: 0.22,
  /** the research reference beside your result (QUELLE: Bac et al. 2014 [S17]) */
  research: { success: 0.66, cycleS: 33 },
  /** deterministic outcome sequences (low-discrepancy): the same choices give the same day */
  phase: 0.137,
  damagePhase: 0.61,
} as const;

/** The automated day of „Erntetag“ (≈ 80 s at 1×; 8× on the Schaufenster's Kurzlauf stand = 10 s). */
export const DAY = {
  seconds: 80,
  /** the dashboard clock */
  from: 6,
  to: 20,
  /** a call for help is answered in time within this (s) */
  answerS: 10,
  /**
   * 3–5 calls (plan §4.10), some in pairs so you choose which first (R8 §2.9 „the race“): a jammed
   * gripper (arm of the Messbeet), a fruit behind a stem (Messbeet row 0/1, fruit index), a tray on the
   * rovers' path, the bumblebee box to swap. `arm` indexes the 12 arms of Sonnendach A.
   */
  calls: [
    { t: 11, kind: 'jam', arm: 3 },
    { t: 29, kind: 'stem', row: 1, fruit: 13 },
    { t: 32, kind: 'tray' },
    { t: 47, kind: 'bees', box: 1 },
    { t: 61, kind: 'jam', arm: 2 },
  ] as const,
  /** the Messbeet arms' motion in the time-lapse (× the ambient pace); an arm behind its plan speeds up by
   *  catchUpGain per second of lag (up to armSpeedMax), so the live day keeps the model's timing */
  armSpeed: 2.6,
  catchUpGain: 0.3,
  armSpeedMax: 5,
  /** after the day: the result banner, the end list and the charge beat */
  resultDelayS: 1.2,
} as const;

/**
 * Energy on the dashboard (RICHTWERT, R8 §2.3 eigene Rechnung): block A ≈ 504 m² × ≈ 600 kWp/ha ≈ 30 kWp →
 * ≈ 39 MWh/a at 1.285,3 kWh/kWp [S1] ≈ 106 kWh/day; 12 arms × ≤ 60 W × 14 h ≤ 10 kWh/day [S25].
 */
export const ENERGY = {
  areaM2: 504,
  kwpPerHa: 600,
  kwhPerKwp: 1285.3,
  kwhDay: 106,
  armW: 60,
  armHours: 14,
  kwhUsedMax: 10,
} as const;

/** Stars (plan §4.10): ★ the stamp condition · ★★ the lesson understood · ★★★ mastery or a discovery. */
export const STARS = {
  a: { taught: 12, shade2: 36 },
  b: { lerLo: 1.5, cropLo: 0.7, predictPts: 5 },
  c: { wilsonLo: 0.7, damagedMax: 2 },
} as const;

/** The farm's own clock (WP15's Hof-Takt has the same 8 minutes; R9 §3): phases of the ambient shift (s). */
export const SHIFT = {
  loopS: 480,
  phases: [
    ['ernte', 0],
    ['abtransport', 300],
    ['wartung', 360],
    ['bewaesserung', 420],
  ] as [string, number][],
  /** 'sonnenacker:shift' snapshots for the life director (s) */
  emitS: 2,
} as const;

/** Juice (plan §6.1: ≈ 15 % of the WP): timings, popups, sounds. */
export const JUICE = {
  /** EMI-08 notices you: the wave at once, the request a moment later (s) */
  requestDelayS: 2.2,
  /** the chute: full trays roll into the crate with a wooden „tock“ */
  tockHz: 180,
  /** the call beacon's pulse (s) and the countdown ring */
  callPulseS: 1.1,
  /** the dashboard bar's fill per second during the day (presentation only), and the lock chime */
  chime: [523.25, 659.25, 783.99, 1046.5],
  /** a damaged fruit: a soft splat, no gore */
  splatCount: 10,
  /** station A: the arm's nod per correct label */
  labelPop: 1.1,
} as const;
