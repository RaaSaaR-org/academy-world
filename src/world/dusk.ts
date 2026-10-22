import * as THREE from 'three';
import type { EnvParams, ZoneContext } from '@/core/zones';

/**
 * Dusk (GDD §6.6 ending, §9.4): the finale emits `finale:dusk` with `{ t }` (0 = day, 1 = full
 * dusk) while the sun sinks from 16° to 3°. This blends sky, sun, fog, cloud sea, ambient,
 * exposure and the colour grade from the art-directed day look to a warm stone-900/amber dusk
 * with stars, and switches the path bollards on (off by day per GDD §6.1) and the tower
 * windows up. Colours blend in linear space; numbers linearly. `t` may jump or run backwards.
 *
 * Test: `__academy.solve('world', 'dusk')` (t = 1), `'day'` (t = 0), `'dusk-half'` (t = 0.5).
 */
export interface Dusk {
  set(t: number): void;
  readonly t: number;
}

type ColorKey = 'zenith' | 'mid' | 'horizon' | 'horizonSun' | 'below' | 'sunColor' | 'sunDiscColor' | 'hemiSky' | 'hemiGround' | 'fogColor' | 'cloudLight' | 'cloudShadow';
type NumKey = 'sunIntensity' | 'sunElevationDeg' | 'hemiIntensity' | 'fogDensity' | 'envIntensity' | 'exposure' | 'cirrus' | 'stars' | 'bloomIntensity';

const COLOR_KEYS: ColorKey[] = ['zenith', 'mid', 'horizon', 'horizonSun', 'below', 'sunColor', 'sunDiscColor', 'hemiSky', 'hemiGround', 'fogColor', 'cloudLight', 'cloudShadow'];
const NUM_KEYS: NumKey[] = ['sunIntensity', 'sunElevationDeg', 'hemiIntensity', 'fogDensity', 'envIntensity', 'exposure', 'cirrus', 'stars', 'bloomIntensity'];

/** Full dusk: sun at 3°, stone-900 zenith, amber horizon, mauve haze, lit cloud tops, first stars. */
const DUSK: Pick<EnvParams, ColorKey | NumKey> = {
  zenith: '#15141c',
  mid: '#3b3340',
  horizon: '#7e6a68',
  horizonSun: '#ff9a4c',
  below: '#4f4650',
  sunColor: '#ff9a52',
  sunDiscColor: '#ffd2a0',
  hemiSky: '#53566e',
  hemiGround: '#6e5446',
  fogColor: '#6c5d63',
  cloudLight: '#ffd0a6',
  cloudShadow: '#4c4a5e',
  sunIntensity: 2.1,
  sunElevationDeg: 3,
  hemiIntensity: 0.72,
  fogDensity: 0.0017,
  envIntensity: 0.32,
  exposure: 1.32,
  cirrus: 0.75,
  stars: 0.85,
  // ART-V2 §2.7: the island glows at dusk
  bloomIntensity: 1.0,
};

export function buildDusk(ctx: ZoneContext, o: { lampHeads: THREE.MeshStandardMaterial; windows?: THREE.MeshStandardMaterial | null; needle?: THREE.MeshStandardMaterial | null }): Dusk {
  // the day look = whatever the environment is when the island starts (engine defaults)
  const day: Record<string, unknown> = {};
  for (const k of [...COLOR_KEYS, ...NUM_KEYS]) day[k] = ctx.env.params[k];
  const dayC = new Map<ColorKey, THREE.Color>(),
    duskC = new Map<ColorKey, THREE.Color>(),
    out = new Map<ColorKey, THREE.Color>();
  for (const k of COLOR_KEYS) {
    dayC.set(k, new THREE.Color(day[k] as THREE.ColorRepresentation));
    duskC.set(k, new THREE.Color(DUSK[k]));
    out.set(k, new THREE.Color());
  }
  const lampDay = o.lampHeads.emissiveIntensity,
    winDay = o.windows?.emissiveIntensity ?? 0,
    needleDay = o.needle?.emissiveIntensity ?? 0;
  let cur = 0;

  const apply = (t: number): void => {
    cur = THREE.MathUtils.clamp(t, 0, 1);
    // ease: the light changes fastest in the middle of the sunset
    const e = cur * cur * (3 - 2 * cur);
    const p: Partial<EnvParams> = {};
    for (const k of COLOR_KEYS) (p as Record<string, unknown>)[k] = out.get(k)!.copy(dayC.get(k)!).lerp(duskC.get(k)!, e);
    for (const k of NUM_KEYS) (p as Record<string, unknown>)[k] = THREE.MathUtils.lerp(day[k] as number, DUSK[k], k === 'stars' ? Math.max(0, (e - 0.55) / 0.45) : e);
    ctx.env.set(p);
    // ART-V2 §2.4: every light line (ctx.materials.light, 'line' tier) lifts from T0 to T1, beacons T1 → T2
    ctx.materials.setDusk(cur);
    // bollard slots: dark by day, warm T1 (×1.75, L ≈ 1.47) from t ≈ 0.35 (ART-V2 §2.4)
    const lamp = THREE.MathUtils.smoothstep(cur, 0.3, 0.6);
    o.lampHeads.emissiveIntensity = THREE.MathUtils.lerp(lampDay, 1.75, lamp);
    if (o.windows) o.windows.emissiveIntensity = THREE.MathUtils.lerp(winDay, 2.6, e);
    // WP12: the needle light (the nav lamp) brightens with the windows; its colour is the system state
    if (o.needle) o.needle.emissiveIntensity = THREE.MathUtils.lerp(needleDay, 2.6, e);
  };

  ctx.events.on('finale:dusk', (d: { t?: number } | undefined) => {
    if (d && typeof d.t === 'number' && Number.isFinite(d.t)) apply(d.t);
  });
  ctx.debug.register('dusk', () => apply(1));
  ctx.debug.register('dusk-half', () => apply(0.5));
  ctx.debug.register('day', () => apply(0));
  ctx.onDispose(() => {
    if (cur > 0) apply(0);
  });

  return {
    set: apply,
    get t() {
      return cur;
    },
  };
}
