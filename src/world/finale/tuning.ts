/**
 * WP13 (Startprüfung and lift-off): every tunable number of the finale in one place (plan §6.1
 * „Tuning and juice“; WP20 edits only this file). Seconds, metres, 0…1 rates; the lift-off's beats
 * after the release are keyed to the altitude h, not the clock (plan §4.15).
 */
import { FLIGHT, REVIER, TOWER } from '../layout';

/** F1 „Schwebetest“ (plan §4.14): the arms let go, the island hovers 10 m over its keel block. */
export const F1_HOVER = {
  /** m above the dock (layout FLIGHT) */
  height: FLIGHT.f1Hover,
  /** the six arms swing back over this time (s) before the island rises */
  armsS: 1.2,
  /** rise 0 → 10 m and the set-down 10 → 0 m (s, smooth) */
  riseS: 4,
  setDownS: 4,
  /** reduced motion: the hover height is reached behind a short fade instead of the 4 s rise */
  rmFadeS: 0.35,
  /** the arms catch the island again at the end of the set-down */
  armsBackS: 1.4,
} as const;

/** The climb (R5 timeline.py, plan §4.15): T/W 1.05 → a = 0.05 g, cruise, the same braking to the level-off. */
export const CLIMB = {
  g: 9.81,
  /** m/s² while you hold E (T/W 1.05) and on the final approach (T/W 0.95) */
  accel: 0.05 * 9.81,
  /** m/s: 20 s at 0.05 g */
  cruise: 0.05 * 9.81 * 20,
  /** m: the level-off (the cloud sea 180 m below) */
  levelOff: FLIGHT.levelOff,
  /** releasing E: the controller holds the altitude, braking at up to this deceleration (m/s², T/W ≥ 0.65) */
  brake: 0.35 * 9.81,
  /** s: the velocity tail of the brake (critically damped toward the hover) */
  brakeTau: 0.35,
  /** s without E before EMI-01 gives thrust on its own („Dann gebe ich Schub.“) */
  emiAfterS: 6,
} as const;

/** The clock-keyed part before the lift-off (s after the console press, plan §4.15). */
export const SPINUP = {
  /** M1 → M6, one every … s, clockwise round you */
  gap: 2.5,
  /** the trims that are online join in one chord at … s */
  trimsAt: 15,
  /** T = W: the formula card */
  twAt: 15,
  /** the release: six arms swing back, the bridge retracts */
  releaseAt: 18,
  releaseS: 3.2,
  /** the lift-off may start (E held, or EMI-01 after emiAfterS) */
  liftoffAt: 22,
  /** a rotor ramps from its idle to the take-off rate over … s */
  rampS: 2.2,
  /** Startakku shown before the spin-up and after it (FIKTION, plan §4.15: 100 → 82 %) */
  akkuFrom: 1.0,
  akkuTo: 0.82,
} as const;

/** Rotor rates in the lift-off (WP12's island.rotors: 0 still … 1 take-off; hover 0.5 is the rc4 look). */
export const RATE = { takeoff: 1, cruise: 0.92, hover: 0.5 } as const;

/** Where the beats fall on the altitude (m) and other keyed numbers (plan §4.15, R5 §5.2, WP2's recipe). */
export const BEATS = {
  /** the Ausguck eye above the deck (TOWER.ausguck + eye) */
  eyeY: TOWER.ausguck.y + 1.65,
  /** C1 from this h, ≤ shotS; [C] calls it during the rise window up to c1MaxH */
  c1FromH: 1,
  c1MaxH: 60,
  /** the pit line after C1 (≈ 32 s) */
  pitH: 26,
  /** „Wir steigen in den Wolkenschatten.“ (≈ 38 s) */
  shadeLineH: 62,
  /** the lid: „Schau nach oben.“ and the low-pass starts closing (≈ 42 s) */
  lidH: 98,
  /** the nav lamp switches to active (plan: h 280, before the first whiteout frame) */
  navH: 280,
  /** its steady ramp (≥ 1 s) */
  navRampS: 1.2,
  /** C2 from this h (≈ 72 s), caption „Diese Insel fällt ständig.“ */
  c2FromH: 430,
  /** level-off captions and the banner once the braking starts (≈ 80 s) */
  levelH: 472,
  /** an outside shot lasts ≤ 10 s (plan §4.15) */
  shotS: 8,
  /** the downwash front: starts at the dock rim, runs out at … m/s, stops past … m (the farm at ≈ 220–380 m) */
  frontFrom: 95,
  frontSpeed: 26,
  frontTo: 560,
  /** 'downwash' { r } every … s while the front runs */
  frontEvery: 0.25,
  /** the cloud's low-pass (WP2: ≈ 600 Hz in the cloud), from the lid to the cloud entry */
  muffleHz: 600,
  /** the low-pass opens over … s after the break-out */
  openS: 2.5,
  /** the sky dressing fades in over … s after the break-out (§5.3 rule 2b: ≥ 2 s) */
  revealS: 3,
  /** a wisp of cloud streams past every … s in the cloud (WP3's spray, ground frame) */
  wispEvery: 0.28,
  /** the ghost horizon fades in over ≥ 2 s inside the cloud; out over … s before the eye leaves it */
  ghostInS: 2.2,
  ghostOutM: 14,
} as const;

/** The cloud slab as the eye meets it (layout REVIER.slab; WP2: the Ausguck eye is inside for h ≈ 284–344). */
export const SLAB = {
  base: REVIER.slab.base,
  top: REVIER.slab.top,
  /** the eye enters the slab at this h */
  eyeInH: REVIER.slab.base - (TOWER.ausguck.y + 1.65),
  /** … is past its middle (the one env-map rebuild, WP2) */
  eyeMidH: (REVIER.slab.base + REVIER.slab.top) / 2 - (TOWER.ausguck.y + 1.65),
  /** … leaves its top (the break-out) */
  eyeOutH: REVIER.slab.top - (TOWER.ausguck.y + 1.65),
} as const;

/** The gust in the cloud (plan §4.15): one seeded böig gust (sim.ts), visual tilt ≤ 1.5°, none under RM. */
export const CLOUD_GUST = {
  /** s after the eye enters the cloud */
  startS: 0.4,
  /** the gust sequence (sim.ts Gust): one böig gust from the WNW and a weaker one behind it */
  gusts: [
    { t0: 1.0, dur: 2.6, s: 0.58, b: 295 },
    { t0: 3.2, dur: 1.2, s: 0.32, b: 240 },
  ],
  seed: 4242,
  /** s of the trial shown (the eye is ≈ 6 s inside the cloud) */
  showS: 6,
  maxVisualDeg: 1.5,
  /** NN-Lage v2 outside its training envelope: a fine tremor (camera shake ≤ 0.1) */
  shudder: 0.05,
} as const;

/** The skip (plan §4.15): hold Space or LMB for 1 s; a fade to black of 0.4 s. */
export const SKIP = { holdS: 1, fadeS: 0.4, ringShowAfterS: 0.12 } as const;

/** Reduced motion (plan §4.15): stills with cross-fades, ≈ 45 s. */
export const STILLS = {
  /** the spin-up still on the Ausguck (the same beats, spray slowed) */
  spinupS: 18,
  /** the held view 60 m over the dock */
  overDockH: 60,
  overDockS: 8,
  /** the cloud with the static ghost horizon (the eye past the slab's middle) */
  cloudH: SLAB.eyeMidH + 6,
  cloudS: 9,
  /** above the clouds with the banner, the captions and EMI-01's two lines (staggered) */
  aboveS: 14,
  fadeS: 0.45,
} as const;

/** Sound (all on the D14 „Atmosphäre & Musik“ bus; the lift-off peaks ≤ −10 dBFS). */
export const SOUND = {
  /** Recamán a(0…17) (GDD §8.1: f = 220 Hz · 2^(a/12)) */
  recaman: [0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25],
  base: 220,
  /** the melody at the break-out: ≈ 3 notes/s */
  melodyNoteS: 0.34,
  noteVol: 0.34,
  chordVol: 0.22,
  whumpVol: 0.6,
  rumbleMax: 0.55,
  thunkVol: 0.5,
} as const;

/** Juice (≈ 15 % of the work, plan §6.1): shakes stay ≤ 0.1 (none under reduced motion, the engine), volumes 0…1. */
export const JUICE = {
  /** T = W: the dock's hydraulic exhale */
  twSigh: 0.26,
  /** the release and the lift-off: a shudder through the deck */
  releaseShake: 0.05,
  liftoffShake: 0.06,
} as const;

/**
 * The Ausguck (+44): the launch spot on the ring west of the lift shaft — clear of the car (whose lid the
 * lift lifts away while it rides), of the car console and of the Ausguck's call panel, so holding E for
 * thrust can only ever mean the thrust. You stand at `stand` facing the sun (bearing 295); the console is
 * `consoleDist` ahead of you, its board toward you; EMI-01 at its left.
 */
export const AUSGUCK = {
  /** where the lift sets you down (finale/ride.ts RIDER) */
  exit: [TOWER.lift.x, TOWER.ausguck.y, TOWER.lift.z + 0.7] as const,
  /** where you stand to use the console (bearing, radius on the ring) and which way you face */
  stand: { bearing: 327.5, r: 9.5 },
  facing: 295,
  consoleDist: 2.0,
  /** EMI-01 beside the console (to its left, seen from the stand) */
  emiSide: 1.0,
  /** the earned guests on the ring (bearings, r): west of the console, in the sunset view, facing out with you */
  guests: { r: 11.8, bearings: [300, 288, 276, 264, 252] },
  /** the checklist cuts a long measured value here (characters) */
  checkValueMax: 42,
} as const;
