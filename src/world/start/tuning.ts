/**
 * WP12 (rotors and start flow): every tunable number of the grounded start in one place (plan §6.1
 * „Tuning and juice“; WP20 edits only this file). Seconds, metres, 0…1 rates.
 */
import { FLIGHT } from '../layout';

/** The Probestart (plan §1.2, §3.2). */
export const PROBESTART = {
  /** repeatable after this many seconds (from the press) */
  cooldown: 6,
  /** the lever's pull (§1.2 „hold E 1 s“): down over pullS, held pullHold while the island tries, then back */
  pullS: 1.0,
  pullHold: 3.2,
  /** the world sinks this far while the island lifts a hand's breadth (ctx.island.setAltitude; layout FLIGHT) */
  lift: FLIGHT.probestart,
  /** rc4 toy envelope: peak tilt A ∈ [tiltMin, tiltMin + tiltSpread] (°), decay rate ∈ [decay, decay + decaySpread] (1/s) */
  tiltMin: 2.2,
  tiltSpread: 0.7,
  decay: 2.7,
  decaySpread: 0.6,
  /** the cough of the cold southern rotors: first sputter after the press, sputters, spacing */
  coughAt: 0.05,
  coughs: 3,
  coughGap: 0.16,
  /** the slot spray puff at the two southern lobes (M5, M6) */
  sprayAt: 0.3,
  sprayStrength: 0.55,
  /** the island rises over riseS, holds, sinks back over sinkS; the arms catch it (thud) at the end */
  riseAt: 0.25,
  riseS: 0.45,
  holdS: 0.7,
  sinkS: 0.55,
  /** the three systems turn red one after the other: first group at redAt, then every redGap; the six rotor lamps stagger by lampGap */
  redAt: 1.9,
  redGap: 0.55,
  lampGap: 0.08,
  /** EMI-01's first line, seconds after the lever is down (the red lamps are out by then) */
  lineAt: 3.1,
  /** Entscheider: the Bodencrew fills the Startakku bar one segment per segmentS during line 2 (≤ 3 s) */
  crewSegmentS: 0.22,
  /** the readout floats this long after the result */
  readoutHold: 9,
} as const;

/** The first-visit glide from the title orbit to the bridge head (plan §1.2, §4.1). */
export const GLIDE = {
  duration: 6,
  /** reduced motion: a fade of this length instead */
  fadeS: 0.4,
  /** the title banner shows from this share of the glide on */
  bannerAt: 0.72,
  /** the blend from the cinematic camera onto the player's eye at the end */
  blendS: 0.6,
} as const;

/** Beats of the three systems (plan §3.3). */
export const BEATS = {
  /** the ignition beat starts this long after the stamp (the result banner) */
  ignitionDelay: 1.5,
  /** camera shake of an ignition (≤ 0.1; none under reduced motion) */
  shake: 0.08,
  shakeS: 0.45,
  /** the rotor's spin-up to idle (time constant of the rate smoothing, s) */
  spinUpTau: 0.9,
  /** the 6/6 and Startklar pulses: three teal pulses, each pulseS long (≥ 3 s in all, steady ramps) */
  pulses: 3,
  pulseS: 1.25,
  /** peak brightness factor of a pulse (flash-safe: lamps are small and the ramps are sines) */
  pulseGain: 0.75,
  /** pause between two queued beats */
  gapS: 0.6,
} as const;

/** Rotor rates (island.rotors, 0 still … 1 take-off) and what they mean on screen. */
export const ROTOR = {
  /** a cold rotor stands still; a bereit rotor idles in its duct */
  idle: 0.28,
  /** rc4 look in the air (hover) */
  hover: 0.5,
  /** angular speed per unit rate (rad/s): hover 0.5 → rc4's 2.2 rad/s */
  omega: 4.4,
  /** the blur disc shows from this rate on */
  blurFrom: 0.18,
  /** downwash strength per state (the air column under the rotor) */
  airIdle: 0.25,
  airHover: 1,
  /** the drone loop: volume and pitch at rate 0 → 1 */
  droneVolume: 0.9,
  dronePitch0: 0.55,
  dronePitch1: 1.25,
  /** rate smoothing toward the target (1/s) when no spin-up is running */
  follow: 2.2,
} as const;

/** Lamp colours (§4 conventions) and their light tiers; `halo` lifts a geprüft lamp into the bloom. */
export const LAMP = {
  red: 0xf87171,
  amber: 0xfbbf24,
  teal: 0x2dd4bf,
  dark: 0x57534e,
  /** brightness of each state relative to its colour's T1 tier (dark is unlit) */
  gain: { dark: 0.22, red: 0.85, amber: 0.9, teal: 1, crew: 0.85, halo: 1.9 },
  /** the empty Startakku bar after the Probestart: dim red segments (the red outline) */
  emptyRed: 0.32,
  /** an unlit bar segment */
  segmentOff: 0.14,
} as const;

/** Gusts while docked (§5.3 rule 4): no tilt, the arms catch them. */
export const GUST = {
  /** random gusts every min…min+spread seconds (rc4 §5.9) */
  everyMin: 60,
  everySpread: 30,
  /** the scripted dock gust after the arrival */
  dockAt: 1.0,
  dockStrength: 0.9,
} as const;

/** Kanzel ↔ ground hops (plan §2.4): flight time (s); GROUND_HOP in layout.ts holds the distance. */
export const HOP = {
  kanzelFlight: 3.0,
} as const;
