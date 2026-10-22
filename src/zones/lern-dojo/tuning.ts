/**
 * Lern-Dojo (04, SO-101 VLA): every tunable number of the zone (plan §4.5, R1 §10–§11). Data only, no
 * imports: the zone, the simulation core and the Node check (tools/lerndojo-check.mjs) read the same
 * values. WP20 tunes here and nowhere else.
 *
 * Frames. The BENCH frame is the simulation's: metres, origin = the centre of the bench top, +x = the
 * operator's right, +z = toward the operator (the gate side), +y up. Both arms face +z (the operator):
 * the leader at the left, the follower in the middle of the back edge, its work field in front of it.
 */

/** Simulation clocks (R1 §11): physics 100 Hz, control and recording 30 Hz (LeRobot's teleop loop rate). */
export const CLOCK = {
  /** s, one Rapier step */
  dt: 0.01,
  /** Hz, control ticks (teleop, recording, policy actions) */
  ctrlHz: 30,
  /** a demo longer than this (s) ends as a failed demo */
  demoMaxS: 30,
  /** a demo ends this long (s) after its cube came to rest in the box */
  restS: 0.3,
} as const;

/** The workbench (§4.5: 1.6 × 0.8 m at local (0, 0, −3), 0.90 m high). */
export const BENCH = {
  x: 0,
  z: -3,
  w: 1.6,
  d: 0.8,
  height: 0.9,
} as const;

/** Where things stand on the bench (bench frame, m). */
export const LAYOUT = {
  /** follower base (yaw 0: the arm faces +z, the operator) */
  follower: { x: 0.08, z: -0.3 },
  /** leader base, left of the follower (same orientation, so both move alike) */
  leader: { x: -0.5, z: -0.3 },
  /** Kiste 12 × 9 × 5 cm (outer), walls and floor 4 mm */
  box: { x: 0.31, z: -0.215, w: 0.12, d: 0.09, h: 0.05, wall: 0.004 },
  /** the five 6 × 6 cm start fields (like SmolVLA's "5 positions × 10" sets) */
  fields: [
    { x: -0.127, z: -0.225 },
    { x: -0.046, z: -0.12 },
    { x: 0.029, z: -0.159 },
    { x: 0.08, z: -0.08 },
    { x: 0.206, z: -0.12 },
  ],
  fieldSize: 0.06,
  /** spots no demo starts from (B's prediction and cards); ≥ 10 cm from every field */
  newSpots: [
    { x: -0.165, z: -0.085 },
    { x: 0.15, z: 0.03 },
  ],
  /** jaw centre at rest: above the work field (the arm's home) */
  home: { x: 0.06, y: 0.12, z: -0.01 },
  /** the 30 cm ruler printed along the front edge */
  ruler: { x: -0.15, z: 0.33 },
} as const;

/** The three cubes (§4.5: 3 cm, red, blue, green; R1 §10.1). */
export const CUBE = {
  size: 0.03,
  /** kg (a 3 cm PLA cube, 100 % infill ≈ 33 g; RICHTWERT) */
  mass: 0.03,
  friction: 0.7,
  restitution: 0.05,
  /** sRGB colours (cube shading in the 3D view and the camera picture); ripe-tomato red stays the farm's */
  colours: { rot: 0xd83a2e, blau: 0x2f6fd6, gruen: 0x3f9e4d } as const,
} as const;

export type CubeColour = keyof typeof CUBE.colours;
export const COLOURS: readonly CubeColour[] = ['rot', 'blau', 'gruen'];

/**
 * The SO-101 gripper, measured on the real model (WP0's GLB, link frames of the URDF; see kin.ts):
 * the fixed finger's inner face lies at x = −7.9 mm of gripper_link, the moving jaw is a 7.3 cm lever.
 */
export const GRIPPER = {
  /**
   * the point the player and the policy steer (gripper_link frame): at the grasp height, 2 cm off the fixed
   * finger's face, so an open jaw (5.2 cm) straddles a centred cube with room on both sides (5 mm at the
   * fixed finger, 17 mm at the moving one); closing, the moving jaw pushes it against the fixed finger
   */
  jawCentre: [0.012, -0.0002, -0.0981] as const,
  /** fixed finger box (gripper_link frame): centre, half extents */
  fixedBox: { c: [-0.0174, -0.0002, -0.0828] as const, h: [0.0095, 0.0087, 0.0217] as const },
  /** moving finger box (moving-jaw frame) */
  movingBox: { c: [-0.003, -0.0586, 0.0189] as const, h: [0.0093, 0.0235, 0.0089] as const },
  /** gap between the inner faces at the grasp height: g(q) = a − b·cos q + c·sin q (fit to the mesh, ±0.3 mm for q ≤ 0.6) */
  gap: { a: 0.0281, b: 0.0123, c: 0.0716 },
  /** rad: jaws open (≈ 5 cm gap), closed (the servo's lower limit) */
  open: 0.5,
  closed: -0.17,
  /** a cube is held when the gap is within this of its width while the jaws close (m) */
  contactTol: 0.0025,
  /** slip rule (R1 §11): no hold when the cube sits further off the jaw centre, or turned against the jaws */
  slipOffM: 0.012,
  slipYawDeg: 25,
  /** the jaws let go when the gap opens this far beyond the cube (m) */
  releaseTol: 0.004,
} as const;

/** Follower servo and the safety layer between policy and motors (R1 §11). */
export const SERVO = {
  /** first-order lag of the follower on its joint targets (s; ILLUSTRATIV) */
  tauS: 0.08,
  /** safety layer: ≤ 10° change of a target per control step */
  clipDegPerStep: 10,
} as const;

/** Inverse kinematics (the leader's grasp point under the mouse, the scripted demonstrator). */
export const IK = {
  iterations: 24,
  tolerance: 0.0005,
  /** weight of "jaws point down" on wrist_flex (1 = orientation only) */
  orientWeight: 1,
  /** the grasp point stays inside this reach from the pan axis (m) and above this height */
  maxReach: 0.34,
  minReach: 0.1,
  minY: 0.008,
  maxY: 0.24,
} as const;

/** Teleop with the mouse (§4.5 A): the cursor is the jaw centre over the bench. */
export const TELEOP = {
  /** jaw centre height while hovering, and lowered with LMB held (m above the bench) */
  hoverY: 0.075,
  lowY: 0.015,
  /** over the Kiste the jaw centre stays above its rim (a held cube clears the walls) */
  boxY: 0.08,
  /** height change speed (m/s) */
  liftSpeed: 0.35,
  /** cursor speed limit (m/s), like a hand */
  maxSpeed: 0.6,
  /** Q/E wrist roll speed (rad/s) */
  rollSpeed: 2.2,
  /** grasp assist while lowering: a cube centre this close (m) pulls the hand this share of the way */
  magnetM: 0.016,
  magnet: 0.7,
  /** recording starts when the jaw centre moved this far (m) or the jaws moved */
  startMoveM: 0.004,
  /** after a kept demo, the next one is set up after this pause (s) */
  nextDemoS: 1.1,
  /** the discard window after the automatic end (s) */
  reviewS: 3,
  /** the operate camera (bench frame): above the front edge, ≈ −47° (R1 §10.1) */
  camera: { position: [0.13, 0.44, 0.2] as const, lookAt: [0.13, 0.0, -0.17] as const },
  /** mouse-wheel dolly of the operate camera (distance factor) */
  zoom: { min: 0.7, max: 1.45, step: 0.08 },
} as const;

/** The scripted demonstrator (example demos, the Entscheider's preloaded sets, tests): human-like. */
export const EXPERT = {
  /** jaw-centre speed (m/s) and the slower final approach */
  speed: 0.32,
  approachSpeed: 0.12,
  /** hover above a cube before descending (m above the bench, jaw centre) */
  aboveY: 0.07,
  /** jaw centre while carrying over the box, and when it lets go */
  carryY: 0.1,
  dropY: 0.085,
  /** Ornstein–Uhlenbeck noise on the target (m) and its time constant (s) */
  noiseM: 0.004,
  noiseTauS: 0.25,
  /** chance per second of a short hesitation, and how long one lasts (s) */
  hesitatePerS: 0.25,
  hesitateS: [0.15, 0.5] as const,
  /** pauses for the jaws to close / open (s) */
  gripS: 0.35,
} as const;

/** The toy policy (R1 §11): target selection + k-NN behaviour cloning with action chunks. */
export const POLICY = {
  /** neighbours (one per demo), chunk length (steps at 30 Hz = 0.5 s) */
  k: 3,
  chunk: 15,
  /** features: grasp − target with a saturating scale (m), jaw opening (rad), held flag, absolute target (m) */
  relScale: 0.03,
  relSat: 0.5,
  jawScale: 0.35,
  heldWeight: 2,
  absScale: 0.05,
  absWeight: 1,
  /** the arm's joints in the features (rad per unit, weight while reaching and while carrying) */
  qScale: 0.5,
  qWeight: 0.15,
  qWeightHeld: 0.6,
  /** Gaussian kernel width for the neighbour weights (normalised feature units) */
  kernel: 0.35,
  /** nearest-neighbour distance above which a state counts as outside the training data */
  oodDistance: 1.4,
  /** a policy run's time limit (s): the watching rule keeps an unattended stretch ≤ 10 s (plan §4) */
  timeoutS: 9,
  /** a missed grasp (jaws shut on nothing) opens the jaws again: the controller's recovery, not the policy */
  emptyCloseRad: -0.12,
} as const;

/**
 * Target selection (R1 §11): score per seen cube = a·[word = its colour] + b·[demo density at its place],
 * a and b fitted on the demos by gradient steps (logistic / softmax over the cubes on the table). The
 * density is a familiarity 0 … 1 (capped: one demo at a place makes it known; ten make it no more known).
 */
export const SELECTOR = {
  /** prior (and start) of the weights: no word, "go where the demos went" */
  a0: 0,
  b0: 2.5,
  /** L2 pull toward the prior, gradient steps, step size */
  l2: 0.02,
  steps: 300,
  rate: 1,
  /** density kernel σ (m) over the demos' target start places */
  sigma: 0.04,
} as const;

/** The top camera and the colour classes (R1 §11 perception; the light and camera cards). */
export const VISION = {
  /** px (64 × 48 like the R1 sketch; the Gehirn-Fenster shows it as 8 × 8 patches) */
  w: 64,
  h: 48,
  /** pinhole straight down over the work field (bench frame), metres covered at the bench top */
  centre: { x: 0.06, z: -0.15 },
  height: 0.62,
  spanM: 0.52,
  /** pixel noise (sd, 0…1) */
  noise: 0.02,
  /** class tolerance: hue (deg), and value as k × sd with a floor */
  hueTol: 22,
  satMin: 0.35,
  valK: 3,
  valFloor: 0.05,
  /** „Helligkeit variieren“: LeRobot's ColorJitter brightness range (QUELLE R1 [S14]) */
  jitter: [0.7, 1.3] as const,
  /** Abendlicht: dimmer and warmer light on the bench (ILLUSTRATIV) */
  dusk: { brightness: 0.74, tint: [1, 0.86, 0.66] as const },
  /** „Kamera angestoßen“: the camera mount knocked 3 cm toward the back (bench z) */
  bump: { x: 0, z: -0.03 },
  /** cubes smaller than this many pixels are noise */
  minBlobPx: 3,
} as const;

/** Station A · Vormachen: stars and the measured value (plan §4.5). */
export const STATION_A = {
  /** ★ = the stamp: kept demos */
  keep: 3,
  /** ★★ different start fields */
  fields: 3,
  /** ★★★: 5 fields, Ø ≤ this (s), no regrasp */
  meanS: 9,
  /** the objective asks for this many */
  target: 5,
} as const;

/** Station B · Befehlen ◆. */
export const STATION_B = {
  /** training animation (s; the toy trains in milliseconds) */
  trainS: 3,
  /** two-colour demos the rescue needs, and the ★★ cap */
  rescueDemos: 4,
  /** the rescue's two fields (indices into LAYOUT.fields): 2 colours × 2 fields */
  rescueFields: [1, 3] as const,
  /** the first command runs on this field when the player has a demo there (else the newest demo's) */
  firstField: 3,
  /** Entscheider: preloaded sets (5 fields × 10, one cube, one word; then 40 with two colours) */
  preload: { first: 50, second: 40 },
  /** replays after the first viewing run at this speed (watching rule, plan §4) */
  replaySpeed: 2,
  /** Space during a run */
  fastSpeed: 4,
} as const;

/** Station C · Prüfen (rc4 audit model, ILLUSTRATIV parameters). */
export const STATION_C = {
  episodes: 250,
  dead: 35,
  cam: 12,
  label: 18,
  /** n per condition and evaluation (plan §4.5) */
  n: 50,
  /** ★: dead block out with at most this many good episodes removed */
  maxFalse: 5,
  /** the evaluation animation (s; parallel lanes, ≤ 8 s) */
  evalS: 4.5,
} as const;

/** Juice (sounds, popups, timing). */
export const JUICE = {
  /** servo whine: volume and pitch per rad/s of the fastest joint */
  servoVolume: 0.55,
  servoPitch: [0.8, 1.5] as const,
  /** the cube's clack into the box (relative volume) */
  clack: 0.6,
  /** popups (s) */
  popupS: 1.6,
} as const;
