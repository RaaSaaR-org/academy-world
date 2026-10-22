import type { FlightEnvParams } from '../zones/types.env';
import { GROUND_SLAB } from './tuning';

/**
 * The two flight looks of the environment (plan §5.7), as `ctx.env.setFlight` arguments. Neither
 * carries `altitude`: only the WP4 fan-out (ctx.island.setAltitude) passes it.
 *
 * - grounded (docked, the Revier): the slab ceiling over the deck, fog 0.0007, no cloud sea;
 * - airborne (rc4): no ceiling, fog 0.0015, the cloud sea at rc4's cloudY −180.
 *
 * The lift-off (WP13) goes from one to the other with the slab kept: it calls
 * `setFlight({ fog: 'air', cloudSea: true })` and `rebuildEnvMap()` inside the whiteout (the cloud
 * sea then shows once its plane is ≥ 30 m below the eye), and the airborne preset after the level-off.
 */
export const FLIGHT_GROUND: Readonly<Omit<FlightEnvParams, 'altitude'>> = { slab: GROUND_SLAB, fog: 'ground', cloudSea: false };
export const FLIGHT_AIR: Readonly<Omit<FlightEnvParams, 'altitude'>> = { slab: null, fog: 'air', cloudSea: true };
