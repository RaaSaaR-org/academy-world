/**
 * Ground and dock tunables (plan §6.1 „Tuning and juice“): look, motion, juice and the costs that WP17 may
 * trade later. Geometry that other packages rely on (the dock outline, the bridge, the pads) lives in
 * src/world/layout.ts and plan.ts, not here.
 */
export const T = {
  /** terrain colours (plan §2.7 rule 4, ground tokens) */
  color: {
    soil: 0x857a6c,
    grassDry: 0xa39c7a,
    grassGreen: 0x6f7a50,
    crop: 0x5f7046,
    gravel: 0xa8a092,
    concrete: 0xb9b3aa,
    /** exposed mining benches: sand and clay strata */
    sand: 0xb9a68a,
    clay: 0x9a8270,
    water: 0x5e6b66,
    /** the fields' and the grass's albedo saturation (1 = the tokens as they are): the golden sun adds back what this takes (G-LOOK fix 1, D42) */
    fieldSat: 0.62,
  },
  /**
   * clipmap: levels (all in one draw; level L has 2·2^L m cells, the outermost reaches the far plane), cells per
   * side. `island`: the set drawn while the eye is low over the island (below eyeY, inside the dock wall), centred
   * on the dock: levels from … to with `cells` per side (8 m cells at the yard's rim, 256 m at the far plane)
   */
  terrain: { levels: 7, cells: 80, snap: 32, island: { from: 2, to: 7, cells: 40, eyeY: 12 } },
  shade: {
    /** proj(115°) where the cloud bank's shade starts (R5 §3.1) and its soft half-width */
    cloudEdge: 251,
    cloudSoft: 38,
    /** how much of the sun the slab takes away (the sky light stays) */
    cloudStrength: 0.86,
    islandStrength: 0.88,
    needleRadius: 1.4,
    needleTop: 58,
    /** the lobes' buildings as casters (the shadow map is exact near the player) */
    lobeRadius: 12,
    lobeHeight: 8,
  },
  dock: {
    /** the pit's mining benches in the upper 12 m (D19): count, height each, tread (inward step) */
    benches: 4,
    benchRise: 3,
    benchTread: 0.7,
    /** concrete ribs every n m along the wall below the benches */
    ribEvery: 9,
    /** the bridge notch: half width (the bridge is 4 m wide) */
    notchHalf: 3.5,
    /** coping overhang over the slot (hides the terrain's snapped edge) */
    copingOver: 0.35,
    copingWidth: 0.9,
    /** ambient left at the dock floor (vertex AO): the slot is 4 m wide and 66 m deep */
    floorAo: 0.13,
  },
  arms: {
    /** stowed: the boom swings up into its wall niche (degrees) */
    stowDeg: 82,
    /** gust catch: twitch amplitude (degrees) per unit strength, damping (1/s), frequency (Hz) */
    twitchDeg: 1.6,
    twitchDamp: 3.2,
    twitchHz: 2.4,
  },
  bridge: { retract: 13.5, drop: 0.55 },
  gate: { slide: 7.2, seconds: 2.4 },
  spray: {
    max: 192,
    maxLow: 96,
    /** particles per second per active plume (reduced motion: × rmRate) */
    plumeRate: 8.5,
    rmRate: 0.35,
    /** mid-tone and soft: never above this opacity, no frame-to-frame flicker (flash safety) */
    opacity: 0.42,
    color: 0xd7d4cc,
  },
  far: { turbines: 9, villages: 7, woods: 26 },
};
