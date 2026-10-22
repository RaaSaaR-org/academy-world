/**
 * WP2 tunables: the grounded sky, the slab ceiling, the fog modes and the cloud ramp (Phase 7 plan
 * §5.7, §2.3; R5 §3). Every number the look depends on lives here, so lookdev changes one file.
 * Colours are CSS (sRGB) and go through THREE.Color like the rest of EnvParams.
 */
import type { SlabParams } from '../zones/types.env';

/** The cloud bank over the Revier (§2.3): base +330, top +390, edge 900 m out toward 295° (WNW). */
export const GROUND_SLAB: Readonly<SlabParams> = {
  base: 330,
  top: 390,
  edgeBearingDeg: 295,
  edgeDist: 900,
  // FogExp2 density inside the cloud (the whiteout): 30 m → 55 %, 60 m → 96 % (the deck stays readable underfoot)
  density: 0.03,
  // the underside near the edge, where the low sun scatters through the thinning cloud (R5: „lit warm from below near the WNW edge“)
  light: '#e9c9a1',
  // the underside deep under the bank: stratocumulus grey with darker parts (WMO Cloud Atlas, cited in R5 §3)
  shade: '#8a9099',
};

export const ENV_TUNING = {
  fog: {
    /** grounded FogExp2 density: 300 m → 4 %, 1 km → 39 % (§5.7; the Revier stays readable to 1 km) */
    ground: 0.0007,
    /** grounded haze: warm-neutral (D42 palette), no altitude blue; the fog chunk adds the warm tint toward the sun */
    groundColor: '#b8bbbb',
    /** the mist inside the cloud: grey-warm, never white (R5 §5: luminance < 0.8 on screen) */
    cloudColor: '#a29e98',
  },
  slab: {
    /** soft edge of sunBlocked(), ± degrees around the slab edge as seen from the eye (§5.7: ±2°) */
    sunSoftDeg: 2,
    /** the cloud-bank shade on the ground (SLAB_SUN_GLSL): narrower, ≈ the sun disc plus the ragged edge */
    groundSoftDeg: 0.8,
    /** the cloud factor starts rising this far (m) below the base: the lid comes down, the needle fades first */
    rampBelow: 110,
    /** … and is complete this far (m) above the base */
    rampInside: 14,
    /** above the top it falls back to 0 over this height (m); the cloud sea appears at `seaGap` */
    rampAbove: 42,
    /** the cloud sea is shown only once its plane is ≥ this far (m) below the eye (§5.7) */
    seaGap: 30,
    /** pre-ramp share: the cloud factor reaches this much at the base itself (the rest comes inside) */
    atBase: 0.55,
    /** how ragged the edge is (m of noise displacement) and how wide its soft band (m) */
    edgeNoise: 260,
    edgeSoft: 110,
    /** the warm band under the edge (m): the underside warms within this distance of the edge */
    warmBand: 320,
    /** aerial perspective of the ceiling: 1/e distance (m) toward the haze colour */
    hazeDist: 3200,
    /** noise drift (m/s, xz) — a slow, steady breeze aloft */
    drift: [1.4, 0.5] as const,
    /** hemisphere dimming while the sun is blocked (the deck in the cloud shadow reads cooler, not black) */
    hemiBlocked: 0.18,
  },
  /**
   * The env map (PMREM) is built for a reference eye on the deck, not for the moving camera: the
   * climb then needs no rebuild (only the one in the whiteout, §5.7).
   */
  envEyeY: 2,
  /** the airborne altitude after the level-off (§4.15: h 570, the cloud sea 180 m below): the sky frame's 0 */
  airborneAltitude: 570,
  /** the sky dressing's fade-in after the break-out (§5.3 rule 2b: ≥ 2 s); reveal(t01) is driven by WP13 */
  revealMinS: 2,
  /**
   * Day-1 A/B (plan WP2 build 1): the sky dome drawn after the opaques (depth test at the far plane,
   * only uncovered pixels shade) instead of first. Adopted: see the WP2 commit for the numbers.
   */
  skyAfterOpaques: true,
} as const;
