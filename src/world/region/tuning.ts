/**
 * The Revier's tunables (plan §6.1 „Tuning and juice“; WP14): distances, budgets, colours, timings and the
 * little delights. WP20 tunes only this file. Geometry that other packages rely on (the sites' plots, the
 * pads, the Grubenrand spot) lives in src/world/layout.ts; the terrain in src/world/ground/plan.ts.
 */
export const R = {
  /** §2.7 rule 4: the warm-neutral ground tokens (plus the few machine colours the region needs) */
  color: {
    soil: 0x857a6c,
    soilWet: 0x6a6157,
    grassDry: 0xa39c7a,
    grassGreen: 0x6f7a50,
    crop: 0x5f7046,
    leaf: 0x55663f,
    hedge: 0x4f5c3a,
    timberSilver: 0x9a9188,
    timberFresh: 0xb9a68a,
    clay: 0xb08a72,
    plaster: 0xc8bfb2,
    alu: 0xb9b6b0,
    pv: 0x23262b,
    /** the retired excavator: old paint gone chalky, the steel weathered (rule 3: weathered, not rusty steampunk) */
    steelOld: 0x7d7468,
    steelDark: 0x5f5850,
    paintOld: 0xa89a7c,
    white: 0xe7e5e4,
    dark: 0x2b2a2c,
    wool: 0xd9d3c7,
    woolDark: 0x3c3834,
    /** §2.7 rule 6: teal = data (the weather mast's sensor tip) */
    teal: 0x2dd4bf,
    /** warm work light in the shaded hall (rule 7) */
    warm: 0xffd9a8,
  },
  /** when the region chunk loads (plan §5.6): s after the title is up, then an idle slot */
  load: { afterTitle: 0.25, idleTimeoutMs: 1200 },
  /** above this eye height over the ground (m) the region is hidden: the cloud bank covers it (R8 §4.4) */
  hideAboveEye: 320,
  /** the near features (signposts, the board, benches) show within these distances of their cluster (m) */
  near: { show: 140, hide: 150 },
  /** the signposts at the ground pads show within these distances (m) */
  signs: { show: 70, hide: 80 },
  /** the far impostors of a site hide while its area shows its own exterior (ZoneManager's ± hysteresis) */
  impostor: { hyst: 5 },
  /** region tick rates (Hz): visibility toggles and the sheep */
  rate: { tiers: 6, sheep: 15 },
  /**
   * the Grubenrand (plan §2.3, §4.11): the retired bucket-wheel excavator on WP3's lay-by (plan.ts GRUBENRAND.pad,
   * at LANDMARKS.grubenrand), its boom reaching south over the terrace cut (GRUBENRAND.at); the Revier-Chronik
   * board on the lay-by's west end, facing the track
   */
  grubenrand: {
    /** the slewing centre's offset from the lay-by's centre toward the cut (m): the crawlers clear the track */
    bodyOffset: 1.6,
    wheelDiameter: 12,
    /** the wheel rests in the cut: its lowest point this far below the terrain at the hub */
    wheelSink: 2.2,
    /** the board's offset from the lay-by's centre (x, z) and the bearing its face looks to */
    board: [-10.2, -2.6] as [number, number],
    boardFaces: 0,
    /** the board's canvas (px) and size (m) */
    boardPx: [2048, 768] as [number, number],
    boardSize: [3.6, 1.35] as [number, number],
    /** where a reader stands (m in front of the board) */
    readAt: 2.6,
  },
  /** the sheep under the vertical PV fences (Unkrautacker pasture) */
  sheep: { count: 12, speed: 0.45, grazeS: [3, 9] as [number, number], scatterS: 5 },
  /** the downwash reaction (WP13's flight:phase 'downwash'): the front's speed (m/s) out from the dock */
  downwash: { frontSpeed: 30 },
};
