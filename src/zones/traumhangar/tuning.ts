/**
 * Traumhangar — every tunable number of the hangar (plan §4.8, R3 §5): the hall layout, the four
 * Unitree robots' gaits and cameras, the toy world model, the stations' thresholds and the juice.
 * Data only, no imports: the zone, the pure toy model (model.ts) and the Node tools
 * (tools/traum/kurzlauf.mjs, tools/traum-check.mjs, which import this file directly) read the same
 * values. Station values marked ILLUSTRATIV are toy-model parameters, calibrated with
 * `node tools/traum-check.mjs` (the hump, the mixes, the ordering rules); WP20 tunes only this file.
 *
 * Coordinates: hall-local metres (the zone root): the 48 × 32 m rect x −24…24, z −16…16, the doors on
 * the +z side (toward the island, bearing 312), y = 0 the floor.
 */

/** The hall (plan §2.3: 48 × 32 × 12 m, doors toward the island). */
export const HALL = {
  w: 48,
  d: 32,
  /** eaves and ridge height (m): a glulam portal frame with a shallow pitched roof */
  eaves: 10.6,
  ridge: 12,
  /** the door opening in the +z wall (x range) and its height */
  door: { x0: -11, x1: 11, h: 8.4 },
  /** glulam frames along x (one every `bay` m) */
  bay: 6,
  /** the roof mast for the upload beat (§3.3): on the ridge above the dream wall's side */
  mast: { x: 15, z: -4, h: 9 },
} as const;

/**
 * The Messlatte (plan §4.8 landmark): four charging docks on the back wall at true height, EMI's 1,55 m
 * silhouette and a line at your eye height. The lanes run from the docks toward the doors: each robot's
 * lane is its station.
 */
export const DOCKS = {
  /** dock x per robot, the robot's floor point z (facing +z); the pilot plate beside the dock (off the lane) */
  x: { r1: -10.5, g1: -3.5, h12: 3.5, h2: 10.5 },
  robotZ: -14.4,
  plateDx: 1.9,
  plateZ: -13.4,
  /** EMI's silhouette on the wall and the eye-height line (Player EYE_HEIGHT 1.7 m) */
  emiX: -15.4,
  eye: 1.7,
} as const;

export type RosterKey = 'r1' | 'g1' | 'h12' | 'h2';
export const ROSTER: readonly RosterKey[] = ['r1', 'g1', 'h12', 'h2'];
export const ROBOT_ID = { r1: 'unitree-r1', g1: 'unitree-g1', h12: 'unitree-h1-2', h2: 'unitree-h2' } as const;

/**
 * Per robot: heights (MODELL, measured on the models: plan §4.8), the head camera's eye height above
 * the floor (R3 §5.2, from the URDFs), the gait (kinematic, „Bewegung animiert, keine
 * Ganzkörper-Physik“; no Unitree walking speed is used: R1/H2 „nicht angegeben“), the chase camera.
 */
export const ROBOTS = {
  r1: { heightM: 1.23, eye: 1.12, vMax: 0.7, vBack: -0.25, wMax: 0.95, freq: 1.95, freqSlow: 1.45, swingH: 0.06, crouch: 0.04, chaseBack: 2.4, chaseUp: 1.15, capsule: 0.19 },
  g1: { heightM: 1.32, eye: 1.27, vMax: 0.75, vBack: -0.3, wMax: 0.9, freq: 1.9, freqSlow: 1.4, swingH: 0.07, crouch: 0.045, chaseBack: 2.6, chaseUp: 1.1, capsule: 0.2 },
  h12: { heightM: 1.79, eye: 1.72, vMax: 0.85, vBack: -0.3, wMax: 0.8, freq: 1.6, freqSlow: 1.2, swingH: 0.09, crouch: 0.06, chaseBack: 3.0, chaseUp: 1.0, capsule: 0.24 },
  h2: { heightM: 1.83, eye: 1.73, vMax: 0.85, vBack: -0.3, wMax: 0.8, freq: 1.6, freqSlow: 1.2, swingH: 0.09, crouch: 0.06, chaseBack: 3.0, chaseUp: 1.0, capsule: 0.24 },
} as const;

/** The gait shared by all four (the spike's G1 values; per-robot speeds above). */
export const GAIT = {
  /** command slew limits (m/s², rad/s²) */
  accel: 0.9,
  turnAccel: 2.4,
  /** pelvis lateral sway toward the stance foot (m) */
  sway: 0.022,
  /** Raibert gain on the landing point (fraction of the stance travel) */
  raibert: 0.5,
  /** hip yaw limit for the turning foot (rad) */
  yawMax: 0.45,
  /** step width as a fraction of the hip spacing (the legs stand a little narrower than the hips) */
  widthOfHips: 0.95,
} as const;

/** Arms: CCD sweeps, the carry pose, the teleop plane (hold RMB), the grip radius. */
export const ARMS = {
  iterations: 6,
  tolerance: 0.004,
  /** a carried box: forward (m) and height above the hip joint (m) */
  boxFwd: 0.32,
  boxUp: 0.18,
  /** teleop: the hand target plane in front of the robot (m), its limits, mouse pixels → metres */
  plane: { fwd: 0.42, xMax: 0.45, yMin: -0.65, yMax: 0.35, perPx: 0.0016 },
  /** a handle within this distance (m) of the hand target can be gripped with LMB */
  gripR: 0.28,
} as const;

/** Floor friction of reality (μ) per floor kind; the dream knows only the training floor (μ̂). */
export const FLOOR = { train: 0.8, ice: 0.05, glass: 0.32, grating: 0.6, gravel: 0.7 } as const;
export type FloorKind = keyof typeof FLOOR;

/**
 * The toy world model (plan §4.8, R3 §5.3): K „Traumköpfe“ = copies of the private Rapier world stepped
 * ahead with the learned assumptions (μ̂ everywhere, labelled masses, no gusts) plus per-step noise.
 * One dream = K × H × rate steps of ≤ 12 bodies, ≤ 8 ms spread over frames (≤ 2 ms per frame).
 * ILLUSTRATIV parameters.
 */
export const DREAM = {
  k: 5,
  horizons: [0.5, 2, 8] as const,
  muHat: 0.8,
  /** per-head jitter of μ̂ around the mean */
  muJitter: 0.05,
  /** the model's uncertainty: a position random walk of σ m per √s, so the K endings spread ∝ √t */
  noise: 0.14,
  /** … and where it puts other agents (the rover): σ m per √s on top of their remembered velocity */
  agentNoise: 0.35,
  /**
   * wall-clock budget per frame (ms) for stepping the dream world (≤ 2 ms, plan §4.8). 0.5: the ghost
   * moment stays inside its 9 ms at 4× CPU (§5.5); three plans still finish in ≈ 0.5 s there (each
   * plan's ghost shows as soon as it is dreamt), ≈ 0.15 s on an unthrottled laptop
   */
  budgetMs: 0.5,
  /** objects hidden longer than this (s) drop out of the dream (object permanence), fading over 0.5 s */
  forgetS: 1,
  fadeS: 0.5,
  /** time scale while Space is held (imagination) */
  slowMo: 0.1,
  /** a trail point every n world steps at 60 Hz equivalent */
  sampleEvery: 6,
  /** ghosts: opacity near and far from the camera, the distance (m) they fade in over */
  ghostNear: 0.04,
  ghostFar: 0.34,
  ghostFadeFrom: 0.8,
  ghostFadeTo: 2.6,
  /** how long the ghosts stay after a dream without Space (s) */
  showS: 2.6,
  /**
   * the dream view: while Space is held the camera rises above the robot (m up from the eye, m back: < 0 is
   * ahead, so the stage in front fills the frame) and
   * looks down onto the floor (rad below the horizon), in s. Steep on purpose: the plans read like a
   * planning table, and the open doors (the island behind them) stay out of the frame (§5.5: the
   * Space-held view is hangar ≤ 80 · others ≤ 40 draws)
   */
  viewUp: 5.2,
  viewBack: -0.6,
  viewPitch: 1.3,
  viewS: 0.35,
} as const;

/** Station A „Erster Schritt im Kopf“ (R1): 25 m over 6 Weichen (plan §4.8). */
export const A = {
  /** the lane: x centre, start z, finish z (25 m), half width the robot may wander */
  x: -10.5,
  startZ: -12.6,
  endZ: 12.4,
  halfW: 1.25,
  /** the Weichen: patch centre z, patch depth (m), width; the robot stops `stopGap` m before a patch */
  patches: [-8.9, -4.7, -0.5, 3.7, 7.6, 11.0] as const,
  patchD: 2.2,
  patchW: 3.0,
  stopGap: 0.35,
  /** 3 training floor + ice, glass, grating; the first is always training floor (it teaches) */
  kinds: ['train', 'train', 'train', 'ice', 'glass', 'grating'] as const,
  /** the dream's horizon here (s) */
  horizon: 1,
  /** a probe step: seconds, then the crossing speed (m/s) */
  probeS: 3,
  probeSpeed: 0.35,
  /** a wrong trust: slide, fall, get up (s); under reduced motion a still card instead */
  slipS: 0.9,
  fallS: 1.1,
  getUpS: 1.9,
  /** ★★ correct calls, ★★★ all six within this time (s) */
  starCalls: 5,
  starTime: 75,
} as const;

/**
 * Station B „Wie weit vorausträumen?“ (G1): carry a 2 kg box around a pillar to a shelf 6 m away while
 * the service rover crosses (plan §4.8). The geometry is shared by the live station (Rapier dream) and the
 * lite planner of the Messlauf (model.ts), so both fail the same ways: 0,5 s walks into the nook, 8 s
 * forgets the rover behind the pillar and blurs.
 */
export const B = {
  laneX: -3.5,
  start: [-3.5, -12.4] as const,
  /** the delivery spot in front of the shelf */
  goal: [-3.5, -6.55] as const,
  shelf: { x: -3.5, z: -5.55, w: 1.5, h: 1.05, d: 0.5 },
  /** the dead-end nook (a pocket open toward the start, its mouth narrowed by two lips) and the pillar behind it */
  nook: { x0: -4.65, x1: -2.35, z0: -10.25, z1: -9.35, lip: 0.5, t: 0.14, h: 1.1 },
  pillar: { x: -3.5, z: -8.75, r: 0.45, h: 6 },
  /** the rover crosses on z = laneZ between x0 and x1 at `speed` m/s (it turns at the ends) */
  rover: { z: -7.85, x0: -7.6, x1: 0.6, speed: 0.75, w: 0.8, h: 0.45, d: 0.62 },
  /** the box (2 kg: the G1's arm load ≈ 2 kg, HERSTELLERANGABE) */
  box: 0.3,
  /** MPC: act this long on a plan (s) before dreaming again; the robot's speed while carrying */
  act: 1,
  speed: 0.62,
  /** a run gives up after this (s of sim time) */
  timeout: 26,
  /** the Messlauf: runs per horizon, replay speed, the replay's longest wall time (s) */
  runs: 20,
  replaySpeed: 8,
  /** ★★★: three deliveries in a row in manual mode with at most this many dreams */
  manualDreams: 9,
  manualDeliveries: 3,
  /** the planner's candidates: waypoints around the nook (left, right) and the straight line */
  via: {
    left: [
      [-5.9, -11.4],
      [-5.1, -8.65],
    ] as const,
    right: [
      [-1.1, -11.4],
      [-1.9, -8.65],
    ] as const,
  },
  /** what the planner pays for a predicted collision, for standing still one horizon, for changing its plan (m to go) */
  hitCost: 6,
  waitCost: 0.8,
  /** … and for a dream that lost the box (it was hidden behind the pillar or the nook longer than 1 s) */
  boxCost: 5,
  switchCost: 0.6,
  /** the walker's turn rate (rad/s): a humanoid steps around, it does not slide sideways */
  turn: 1.2,
  /** the Messlauf's start offsets sideways (± m, stratified over the 20 runs) */
  startSpread: 0.8,
  /** the lite sim's step (s) and the robot's radius (m) */
  dt: 0.1,
  radius: 0.28,
} as const;

/**
 * Station C ◆ „Traumdaten“ (H1-2): 20 real demos, 200 dreams, 8 sample tiles with 3 physics errors, the
 * mix, the offline bars with the hidden „Stillstand“, one closed-loop trial, n = 20 per mix (plan §4.8;
 * toy values R3 §5.5, ILLUSTRATIV).
 */
export const C = {
  laneX: 3.5,
  /** the cart and the lift (a ramp onto a platform) */
  cart: [3.5, -8.6] as const,
  lift: { x: 3.5, z: -1.2, w: 2.4, d: 2.4, h: 0.32 },
  ramp: { z0: -4.2, z1: -2.4 },
  /** the dream wall (8 tiles) and the bars screen on the right side wall, the console's desk in front */
  wall: { x: 23.6, z: -1.0, w: 7.2, h: 3.6, y: 1.0 },
  bars: { x: 23.6, z: -7.4, w: 4.2, h: 2.6, y: 1.4 },
  console: [16.8, -1.6] as const,
  /** the console's camera: where it stands, where it looks (both screens left of the panel) */
  cam: { at: [14.9, 2.7, -1.6] as const, look: [23.6, 2.6, -1.5] as const },
  tiles: 8,
  errors: 3,
  /** offline error (lower looks better) and closed-loop success per mix */
  offline: { echt: 0.3, alle: 0.18, geprueft: 0.2, stillstand: 0.08 },
  closed: { echt: 0.1, alle: 0.25, geprueftBase: 0.3, perFound: 0.05, perFalse: 0.02, stillstand: 0 },
  n: 20,
  /** the closed-loop trial: seconds the player has, the grasp radius at the cart handle (m) */
  trialS: 40,
  graspR: 0.7,
  /** the Prüfzelle lanes replay (s wall time) */
  lanesS: 6,
  /** ★★: all errors with at most this many false flags */
  falseFlags: 1,
} as const;

/** The H2 Meisterprüfung „Generalprobe“ (plan §4.8, D21). */
export const H2 = {
  laneX: 10.5,
  start: [10.5, -12.6] as const,
  /** 18 m of mixed floor: patches (centre z, kind) */
  floor: [
    { z: -9.2, kind: 'gravel' },
    { z: -5.6, kind: 'ice' },
    { z: -2.0, kind: 'grating' },
  ] as const,
  /** the locker with the hatch, the crates, the rover lane, the fan (gust), the lift pad */
  locker: [13.6, 5.4] as const,
  rover: { z: 8.2, x0: 7.4, x1: 16.6, speed: 0.9 },
  fan: [7.0, 8.2] as const,
  pad: [12.2, 11.6] as const,
  /** crates: labels (kg) — the 18 kg crate is the Dunkelfabrik's */
  light: 5,
  heavy: 18,
  /** the H2's arm payload (HERSTELLERANGABE, R3 §1.1): rated ≈ 7 kg, peak ≈ 15 kg */
  rated: 7,
  peak: 15,
  /** Traumbudget, the horizon the ghosts are reliable to (s), the gust (m/s² sideways) */
  budget: 12,
  reliableS: 2,
  gust: 0.9,
  /** ★★★ within this time (s) */
  starTime: 100,
} as const;

/** The mastery gate (D21) is WP1's derivation; these are only the ring's display texts' numbers. */
export const RING = { segments: 3 } as const;

/** Juice and timings. */
export const JUICE = {
  /** the walk-out from the dock to the station start (s) */
  walkOutS: 1.6,
  /** the G1 / H1-2 rise from their crouch when unlocked (s) */
  riseS: 2.2,
  /** the upload beat: the 8 tiles fold into one line (s), then it climbs the mast (s) */
  foldS: 1.4,
  climbS: 2.4,
  /** the egg-12 door stays open for one round (s) */
  doorS: 30,
} as const;
