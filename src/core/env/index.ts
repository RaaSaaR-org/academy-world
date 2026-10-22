/**
 * WP2 environment package (plan §5.7): the slab, the fog modes, the flight looks and their tunables.
 * The Environment class (src/core/Environment.ts) applies them; zones reach them through ctx.env.
 */
export { ENV_TUNING, GROUND_SLAB } from './tuning';
export { FLIGHT_AIR, FLIGHT_GROUND } from './flight';
export { SLAB_GLSL, SLAB_SUN_GLSL, cloudFactor, slabEdgeDir, slabHeights, sunBlockedBySlab } from './slab';
export { DITHER_FADE_GLSL } from './dither';
