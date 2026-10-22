/**
 * Sensordom tunables (plan §4 conventions: WP20 edits only this file): the timings and juice of WP8's
 * reworked beats. The toy model's physics (σ, Gegenlicht factor, grip tolerance, the stops) stays in
 * messstrecke.ts with its sources; these numbers only change how the beats feel.
 */

/** A „wrong view“ gag (plan §4.2, 01 A): EMI-02 grabs thin air, a popup names what the view missed. */
export const GAG = {
  /** cooldown between two gags (s): mashing E does not stack them */
  cooldownS: 1.3,
  /** the popup „Glasflasche · LiDAR: Luft“ (s) */
  popupS: 2.2,
  /** the empty grab: hand closes after, arm returns (and shrugs) after (s) */
  closeAtS: 0.45,
  returnAtS: 0.75,
  /** EMI-02 stops looking at the object after (s) */
  lookS: 1.6,
  /** the first this many gags get an EMI line; later ones only the popup */
  linesMax: 2,
} as const;

/** EMI-02 reaches at the Messstrecke (plan §4.2, 01 C): ten reaches per run, Space doubles the pace. */
export const REACH = {
  /** reaches per run („8/10“) */
  count: 10,
  /** seconds per reach at 1× (10 reaches ≈ 8 s; ≤ 10 s with the lead-in) */
  seconds: 0.8,
  /** wait before the first reach while EMI-02 parks (s) */
  leadS: 0.6,
  /** Space held: this many times faster */
  fast: 2,
  /** at least this many grips of ten read as „safe“ (teal popup, burst, good cue) */
  safeGrips: 9,
  /** EMI-02's drive to the carriage (m/s) */
  driveSpeed: 1.6,
  /** the result popup „8/10 gegriffen“ and the ✓/✗ ticks (s) */
  popupS: 2.6,
  tickS: 0.7,
  /** a grip lifts the test body this high (m) */
  lift: 0.05,
} as const;
