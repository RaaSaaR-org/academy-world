/**
 * Schauhalle tunables (plan §4 conventions: WP20 edits only this file). Data only, no imports.
 */

/** LOD governor (plan §4.9 [C1 m2]): ≤ 2 robots at LOD0, ≤ 8 at LOD1 within 12 m, the rest as silhouettes. */
export const GOVERNOR = {
  maxLod0: 2,
  maxLod1: 8,
  /** LOD1 reaches this far (m, eye → plinth) */
  lod1M: 12,
  /** a plinth robot is a LOD0 candidate this close (m) */
  lod0M: 5.5,
  /** hysteresis (m) before a robot leaves its tier */
  hysteresisM: 1.0,
  /** a model that drops to a silhouette is disposed after this (s); coming back within it reuses it */
  keepS: 4,
  /** parsed GLBs kept beyond the visible set (LRU), the rest released (§5.9) */
  lruFiles: 3,
  /** the governor re-ranks this often (s) */
  everyS: 0.2,
  /** at most this many models are created per frame (staggered: each costs a scene clone) */
  createsPerFrame: 1,
} as const;

/** Turntables (plan §4.9): one turn per 40 s, stopped under reduced motion and during an inspection. */
export const TURNTABLE = { periodS: 40 } as const;

/** Vorführung (plan §4.9): on approach (≤ 6 m), once per approach; re-armed when you walk away. */
export const VORFUEHRUNG = { triggerM: 6, rearmM: 9, maxPlaying: 2, delayS: 0.4 } as const;

/** Deliveries (plan §4.9): a drone lowers the crate onto Bühne A in 6 s (instant under reduced motion). */
export const DELIVERY = {
  descendS: 6,
  hoverY: 12.5,
  crateRestY: 0.22,
  /** unpacking: the side panels fold down */
  openS: 1.4,
  /** the new robot stands on Bühne A this long before it walks to its plinth (a fade) */
  showS: 6,
  /** wait after entering the hall before the first delivery starts (s); Entdecker first visit waits for the Lastenheft round */
  enterDelayS: 3,
  firstVisitDelayS: 90,
  /** stars for the Apollo (plan §4.9: ★ 36 ≈ 43 % of the pool; calibrate) */
  apolloStars: 36,
} as const;

/** Kistenwaage (R4 §7.3, §8): the loads (kg) and how the gauge eases. */
export const KISTENWAAGE = { loads: [1, 2, 5, 18] as readonly number[], gaugeEase: 6, settleS: 0.5 } as const;

/** Größenwand: the laser line follows your eye height while you are this close to the wall (m). */
export const GROESSE = { laserM: 4.5, markR: 0.55, holdS: 2.5 } as const;

/** Inspektion (orbit camera): distances as multiples of the robot's bounding radius, wheel step, drag speed. */
/** standClear: the opening view keeps this angle (rad) from the stand, so its plate never fills the frame */
export const INSPEKTION = { distMin: 0.9, distMax: 3.2, dist0: 1.9, wheelK: 0.0012, dragK: 0.006, pitchMin: -0.15, pitchMax: 0.9, standClear: 0.9 } as const;

/** Lastenheft (plan §4.9): three jobs, one trick; stars as R4 §8. */
export const LASTENHEFT = { jobs: 3, starRight: 2 } as const;

/** Schaufenster (Entscheider, plan §1.4): step minimums so a bot run measures like a person (s). */
export const SCHAUFENSTER = { wallS: 4, datasheetS: 6 } as const;

/** Kurzlauf replays (watching rule: ≤ 10 s unattended per stretch, replays after the first at 2×). */
export const REPLAY = { duckSpeed: 2, trackSpeed: 4, erntetagS: 9, traumBarsS: 4 } as const;

/** Spotlights: emissive ring + one instanced additive cone per plinth (R4 §7.3). */
export const LIGHT = { cone: 0.028, ring: 1.0 } as const;

/**
 * The far box (hall.ts): off on the island's southern landing (local z > 150 = world z > 84: the
 * Landedeck, the bridge head), where the tower and the hub stand between you and the hall; on again
 * above the deck (the Kanzeln) and off to the sides.
 */
export const FAR_PROXY = { hiddenSouthOfZ: 150, belowY: 15, withinX: 20 } as const;
