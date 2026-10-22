/**
 * WP2 (sky, environment): the flight environment, sun blocking and the env-map hold on ctx.env, the
 * ambience filter on ctx.audio (Phase 7 plan §5.2, §5.3, §5.7). Contract committed by WPS in wave 0;
 * WP2 owns the file from wave 1. Re-exported by src/core/zones/index.ts. Loop kinds: registerLoopKind
 * (src/systems/Audio.ts).
 */
import type * as THREE from 'three';

/**
 * The cloud bank („slab“) over the Revier: base and top in m above the deck at h = 0 (§2.3: 330 / 390).
 * The grounded default is GROUND_SLAB in src/core/env/tuning.ts (WP2); the flight looks are FLIGHT_GROUND /
 * FLIGHT_AIR in src/core/env/flight.ts. The lift-off (WP13) keeps the slab, holds the env map, and inside the
 * whiteout calls setFlight({ fog: 'air', cloudSea: true }) + rebuildEnvMap(); the cloud sea then shows once
 * its plane (top − h) is ≥ 30 m below the eye. Altitude-driven parts (ceiling, fog ramp, mist, sun) follow h.
 */
export interface SlabParams {
  base: number;
  top: number;
  /** bearing of the slab's edge from the island (295° WNW) and its distance (900 m) */
  edgeBearingDeg: number;
  edgeDist: number;
  /** FogExp2 density inside the cloud (the whiteout); the fog ramps geometrically toward it around the base */
  density: number;
  /** CSS colours of the lit and the shaded underside */
  light: string;
  shade: string;
}

export interface FlightEnvParams {
  /** h (m); passed only by the WP4 altitude fan-out (ctx.island.setAltitude) */
  altitude: number;
  slab: SlabParams | null;
  /**
   * 'ground' FogExp2 0.0007 · 'air' rc4 0.0015. With a slab set, the eye decides the side (ground below
   * the slab's middle while this is 'ground', air above), so the switch falls inside the whiteout.
   */
  fog: 'ground' | 'air';
  /** without a slab: show the rc4 cloud sea; with a slab the eye decides (plane top − h ≥ 30 m below it) */
  cloudSea: boolean;
}

declare module './types' {
  interface ZoneEnv {
    /** altitude is passed only by the WP4 fan-out */
    setFlight(p: Partial<FlightEnvParams>): void;
    /** 0 visible … 1 behind the slab (±2° soft edge); drives sun and hemi */
    sunBlocked(eyeWorld: THREE.Vector3): number;
    /** freeze PMREM during the lift-off */
    holdEnvMap(hold: boolean): void;
    /** the one rebuild inside the whiteout */
    rebuildEnvMap(): void;
  }
  interface ZoneAudio {
    /** low-pass on the ambience bus (cloud muffle 600 Hz); null removes it */
    setAmbienceFilter(hz: number | null, rampS?: number): void;
  }
}
