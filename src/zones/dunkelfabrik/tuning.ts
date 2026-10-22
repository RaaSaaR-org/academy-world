/**
 * Dunkelfabrik tunables (plan §4 conventions: WP20 edits only this file): the timings and juice of
 * WP8's reworked beats (05 A cargo, 05 B one wall, 05 C dials). The toy model's rates and the scale's
 * guide values stay in sim.ts / strings.ts with their sources.
 */

/** 05 B „Schichtplan“: the console swings between the wall and the Waage's beam. */
export const ROSTER = {
  /** the swing wall ↔ beam (s, eased) */
  swingS: 0.9,
  /** after the Waage settles the camera stays on the beam this long (s) before it swings back */
  holdS: 2.5,
  /** the verdict popups on a placed robot („passt“, „Pilot“, „nein“) (s) */
  verdictS: 1.8,
  /** the Waage tips: popup „Jahr 3,8“ (s) and burst size */
  tipS: 2.2,
  tipBurst: 30,
  /** „kein Pilot“ popup (s) */
  noPilotS: 2.6,
} as const;

/** 05 A: on M5 bereit the shift's crates roll onto the Verladebucht's deck lift as cargo. */
export const CARGO = {
  /** the popup „Fracht an Bord“ (s) */
  aboardS: 2.6,
  /** EMI's cargo line after the ignition banner (s), only while the player is in the hall */
  lineAfterS: 2.2,
} as const;
