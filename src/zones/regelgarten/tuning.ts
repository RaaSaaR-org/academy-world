/**
 * Regelgarten C „Lauf, Ente!" — every tunable number of the duck station (plan §4.3, R2 §6–§7).
 * Data only, no imports: the worker, the zone and the Node tools (tools/duck/*.mjs, which import
 * this file directly) read the same values. Calibration: `node tools/duck/calibrate.mjs` (3 seeds
 * per preset; the results that justify each number are in its comment).
 */

/** The gait: a central pattern generator over 12 parameters plus 2 feedback gains (R2 §6, §7.3). */
export const GAIT = {
  /** names (debug, tools) in the order of the parameter vector */
  names: ['freq', 'hipAmp', 'kneeAmp', 'kneePhase', 'ankleAmp', 'anklePhase', 'sway', 'lean', 'neck', 'ankleOffset', 'pitchGain', 'rollGain'],
  lo: [1.0, 0, 0, -3.14, -0.6, -3.14, -0.25, -0.4, -0.6, -0.4, -2, -2],
  hi: [3.5, 0.6, 0.9, 3.14, 0.6, 3.14, 0.25, 0.4, 0.6, 0.4, 2, 2],
  /** CEM start mean and spread (R2 spike_dr.mjs); generation 1 falls 78–96 % around it */
  mu0: [2.0, 0.15, 0.3, 0, 0.1, 0, 0, 0, 0, 0, 0, 0],
  sd0: [0.5, 0.15, 0.25, 1.5, 0.15, 1.5, 0.08, 0.15, 0.25, 0.1, 0.5, 0.5],
} as const;

/** Physics episode (R2 §6.4, §7.2). */
export const EPISODE = {
  /** training episode (s) */
  seconds: 4,
  /** control rate (Hz): the duck thinks 50 times a second (QUELLE, R2 §5.3) */
  controlHz: 50,
  /** recorded pose samples per second (field replay, recordings) */
  recHz: 25,
  /** a run ends at a tilt above this (deg) … */
  fallTiltDeg: 60,
  /** … or with the trunk lower than this (m) */
  fallHeight: 0.09,
  /** after a fall the physics runs on this long (s) so the replay shows the duck on the floor; it earns nothing */
  postFall: 0.6,
  /** nominal floor friction (one world) */
  friction: 0.6,
} as const;

/**
 * Reward cards (R2 §6.4): weight per notch 0…3 in the worker's physics units (per second until the
 * fall, except Sanft per control step). Only the ratios matter to the CEM (it ranks), so the tables
 * are tuned for the hacks to appear where the plan says.
 */
export const CARDS = {
  /** + w · vₓ (m/s) */
  vorwaerts: [0, 10, 20, 40],
  /** + w per second alive */
  durchhalten: [0, 2, 8, 30],
  /** + w · cos(tilt) */
  aufrecht: [0, 2, 8, 30],
  /** − w · Σ|τ·q̇| (W) */
  sparsam: [0, 0.05, 0.25, 1],
  /** − w · Σ(Δa)² per control step */
  sanft: [0, 1, 5, 20],
  /** + w · swing-foot height up to 2 cm (m) */
  fuesseHeben: [0, 50, 150, 400],
  /** + w · similarity to the reference gait (unlock „Vorbild") */
  vorbild: [0, 1, 2, 4],
} as const;

export type CardId = keyof typeof CARDS;
export const CARD_IDS: readonly CardId[] = ['vorwaerts', 'durchhalten', 'aufrecht', 'sparsam', 'sanft', 'fuesseHeben', 'vorbild'];

/** Decks (notches per card). The default deck guarantees the early belly flop (R2 §6.3). */
export const DECKS = {
  start: { vorwaerts: 3, durchhalten: 0, aufrecht: 0, sparsam: 0, sanft: 0, fuesseHeben: 0, vorbild: 0 },
  /** Entscheider one-tap fix „Durchhalten + Aufrecht dazu" */
  fix: { vorwaerts: 3, durchhalten: 1, aufrecht: 1, sparsam: 0, sanft: 0, fuesseHeben: 0, vorbild: 0 },
  /** calibration presets (tools/duck/calibrate.mjs) */
  statue: { vorwaerts: 0, durchhalten: 3, aufrecht: 0, sparsam: 0, sanft: 0, fuesseHeben: 0, vorbild: 0 },
  costly: { vorwaerts: 3, durchhalten: 1, aufrecht: 1, sparsam: 2, sanft: 2, fuesseHeben: 0, vorbild: 0 },
  costsOnly: { vorwaerts: 0, durchhalten: 0, aufrecht: 0, sparsam: 3, sanft: 3, fuesseHeben: 0, vorbild: 0 },
  walk: { vorwaerts: 3, durchhalten: 1, aufrecht: 1, sparsam: 1, sanft: 1, fuesseHeben: 0, vorbild: 0 },
  jitter: { vorwaerts: 3, durchhalten: 1, aufrecht: 0, sparsam: 0, sanft: 0, fuesseHeben: 0, vorbild: 0 },
  stork: { vorwaerts: 1, durchhalten: 1, aufrecht: 1, sparsam: 0, sanft: 0, fuesseHeben: 3, vorbild: 0 },
} as const;

/**
 * The reference gait of the „Vorbild" card (imitation, R2 §6.4): a walking gait the same CEM found
 * with the `walk` deck (tools/duck/calibrate.mjs --reference), standing in for the Open Duck's
 * reference motions.
 */
export const REFERENCE: readonly number[] = [2.0055, 0.1278, 0.3464, -1.9977, 0.0277, -0.5171, 0.0148, 0.0041, -0.1158, -0.015, -0.3512, 0.0579];

/** „Erst laufen, dann schön" (curriculum): Sanft and Sparsam ramp from 0 to the set value over these generations */
export const CURRICULUM = { fromGen: 1, toGen: 6 } as const;

/** The cross-entropy method (the `wall.ts` pattern, R2 §6.1). */
export const CEM = {
  population: 64,
  /** adaptive population on slow CPUs (R2 §7.4): the other 32 cells mirror elites */
  populationSlow: 32,
  eliteFrac: 0.15,
  alpha: 0.7,
  /** std floor as a fraction of each parameter's range */
  stdFloor: 0.02,
  /** generations per Start (C2) and per randomised retrain (C3) */
  generations: 10,
  /** a generation slower than this (s, wall time in the worker) after adapting → recordings (plan §5.4) */
  maxGenSeconds: 3.5,
  /** halve the population when a generation takes longer than this (s) */
  adaptSeconds: 1.5,
  /**
   * randomised worlds: every candidate runs in this many worlds and is ranked by its worst run.
   * Calibration (tools/duck/calibrate.mjs, 3 seeds, the `fix` and a balanced deck): one world 8–10/20 on
   * the track; retrained in random worlds with 1 world per candidate 6–17/20 (the ranking is luck), with
   * 2 worlds and the worse run 16–20/20, at a lower or equal median distance (R2 §7.3: robust is slower).
   * Over 12 more seeds: the `fix` deck retrained reaches ★★★ (≥ 15/20) in 7, a deck that values
   * surviving more (Vorwärts 2, Durchhalten 2, Aufrecht 2) in 10 — the reward still decides.
   */
  repeatsRandom: 2,
} as const;

/**
 * Hack detectors on the elite's behaviour statistics (R2 §6.5; plan §4.3: a run stops early as soon
 * as one shows). Checked from `minGen` on; `confirm` consecutive generations must agree.
 */
export const HACKS = {
  minGen: 2,
  confirm: 1,
  /** Bauchklatscher: ≥ fallFrac of the elite fall (forward, after a dash), mean distance > dist m, not an instant faller */
  bauchklatscher: { fallFrac: 0.5, dist: 0.15 },
  /** Statue: mean distance < dist m, fall fraction ≤ maxFall */
  statue: { dist: 0.05, maxFall: 0.2 },
  /** Sofort-Umfaller: ≥ fallFrac fall before tBefore s, mean |distance| < dist */
  sofortUmfaller: { fallFrac: 0.8, tBefore: 1, dist: 0.15 },
  /** Zappelente / Storch: only if calibration proves them (enabled: false until then) */
  zappelente: { enabled: false, actRate: 0.05, dist: 0.08 },
  storch: { enabled: false, lift: 0.012, dist: 0.05 },
} as const;

export type HackId = 'bauchklatscher' | 'statue' | 'sofortUmfaller' | 'zappelente' | 'storch';
export const HACK_IDS: readonly HackId[] = ['bauchklatscher', 'statue', 'sofortUmfaller', 'zappelente', 'storch'];

/** Worlds (R2 §3.4, §6.3). C3's hidden test conditions are wider than the training ranges, on purpose. */
export const WORLDS = {
  nominal: { friction: 0.6, payload: 0, kp: 1, delay: 0 },
  /** „In tausend falschen Welten nachtrainieren" and the 64 copies of C1 */
  train: { friction: [0.4, 1.0], payload: [0, 0.1], kp: [0.85, 1.15], delay: [0, 2] },
  /** Teststrecke (shown on the card): friction 0.3–1.0, payload 0–150 g, stiffness ±20 %, delay 0–60 ms (3 control steps) */
  test: { friction: [0.3, 1.0], payload: [0, 0.15], kp: [0.8, 1.2], delay: [0, 3] },
} as const;

/**
 * C1 „Mach du's": the three sliders and what they move. The rest of the gait is `base` (GAIT.mu0 with
 * the knee lift a quarter cycle ahead, so a hand gait can walk forward at all). Survey (64 copies in
 * the training worlds, 80 slider settings): stride ≥ 0.25 rad falls in most worlds, stride ≈ 0.15 rad
 * walks up to 0.65 m in 4 s; the outcome is nearly all-or-nothing. The start value falls.
 */
export const HAND = {
  base: [2.0, 0.15, 0.3, -1.57, 0.1, 0, 0, 0, 0, 0, 0, 0],
  freq: { param: 0, min: 1.0, max: 3.5, value: 2.0 },
  hipAmp: { param: 1, min: 0, max: 0.5, value: 0.3 },
  kneeAmp: { param: 2, min: 0, max: 0.8, value: 0.3 },
  /** tries before the hint to move on */
  tries: 3,
  /** skippable after (s), Entscheider */
  skipAfter: 30,
} as const;

/** C3 Teststrecke. */
export const TRACK = {
  runs: 20,
  lanes: 4,
  /** one test run (s of simulation); 5 rounds of 4 lanes at 4× = 5 s (plan: ≤ 8 s) */
  seconds: 4,
  /** a run counts when the duck does not fall and passes this mark (m) */
  successM: 0.25,
  marks: [0.25, 0.5, 1.0],
  /** replay speed (Entdecker / Entscheider) */
  speed: 4,
  speedEntscheider: 8,
  /** fixed seed of the hidden conditions, so a re-test of the same gait is comparable */
  seed: 2026,
} as const;

/** Stars (rate the play, never the robot; R2 §6.6). */
export const STARS = {
  /** ★★: different hacks found */
  hacks: 2,
  /** ★★★: retrained in randomised worlds and ≥ this many of 20 on the track */
  track: 15,
} as const;

/** Replay and pacing (plan §4.3; watch-audit: no input-free stretch > 10 s). */
export const REPLAY = {
  /** one generation on the field (s at 1×) */
  seconds: 4,
  /** every replay after the first viewing */
  speedRepeat: 2,
  /** Space = 4× */
  speedFast: 4,
  /** Entscheider C2 preset speed */
  speedEntscheider: 2,
  /** slow motion „Sturz der Generation" (≤ 4 s) */
  slowmoSeconds: 3.6,
  slowmoRate: 0.25,
} as const;

/** Worker lifetime (plan §5.4, §5.9). */
export const WORKER = {
  /** terminate this long after the player left the Regelgarten (s) … */
  idleSeconds: 60,
  /** … beyond this distance (m) */
  leaveDistance: 60,
  /** start the worker within this distance of the zone anchor (m) */
  prewarmDistance: 55,
  /** hero pose stream (Hz) */
  heroHz: 30,
  /** push with F: impulse (N·s) on the trunk */
  push: 0.35,
} as const;

/**
 * Debug hooks only (solve-c, stars3-c, the flash sequence): gaits this CEM found with the calibration
 * decks (tools/duck/calibrate.mjs --debug-gaits), so the playtest stamps without waiting for training.
 */
export const DEBUG = {
  /** `fix` deck, one world, seed 1, generation 10: track 10/20, 10 falls */
  walkGait: [2.2189, 0.1469, 0.5002, -2.0154, 0.0516, -0.453, -0.0408, 0.094, -0.2227, -0.0109, -0.4555, 0.326],
  /** `fix` deck, random worlds (2 per gait, the worse counts), seed 101, generation 10: track 20/20 */
  robustGait: [2.4203, 0.1462, 0.3954, -1.8517, 0.0879, 0.4854, 0.1332, -0.1118, 0.0865, -0.0442, -0.4119, 0.1397],
  /** the belly-flop generation of the `start` deck (seed of generation 1 and 2) */
  bellyFlopSeed: 1,
} as const;

/** Card facts (QUELLE, R2 §5.3) and their sources. */
export const FACTS = {
  microduckHours: '1–2',
  microduckWorlds: 4096,
  openDuckSteps: '150–300',
  openDuckDays: '35–69',
  hacksPerSkill: '2–5',
} as const;
