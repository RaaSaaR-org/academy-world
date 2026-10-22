/**
 * "Flugmaschine" look for the Prüffeld (docs/ART-V2.md §2): a thin layer over the shared
 * MaterialLibrary (hull, brushed aluminium, carbon, dark glass, deck composite, light tiers).
 * Adds what the zone needs on top: continuous tier colours (night level 0…1 lifts a line from T0
 * to T1) and private 'line' lights that may be modified (polygon offset) and still follow the dusk.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';

/** target linear luminance per tier (bloom mask = smoothstep(1.0, 1.25, L)), as in the library */
const TIER_L = [0.5, 1.45, 3.1] as const;
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export interface Look {
  readonly hull: THREE.Material;
  readonly hullWarm: THREE.Material;
  readonly deck: THREE.Material;
  readonly deckPath: THREE.Material;
  readonly alu: THREE.Material;
  readonly carbon: THREE.MeshPhysicalMaterial;
  readonly darkGlass: THREE.Material;
  /** shared unlit light line: tier 0 (no bloom), 1 (glow), 2 (beacon, small points only). Never mutate. */
  light(hex: number, tier: 0 | 1 | 2): THREE.MeshBasicMaterial;
  /** private unlit light line, T0 by day → T1 at dusk (free to modify, e.g. polygon offset) */
  duskLight(hex: number): THREE.MeshBasicMaterial;
  /** a colour at a (fractional) tier 0…2 */
  tierColor(hex: number, tier: number, out?: THREE.Color): THREE.Color;
}

const cache = new WeakMap<ZoneContext, Look>();

export function look(ctx: ZoneContext): Look {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const M = ctx.materials;
  const tierColor = (hex: number, tier: number, out = new THREE.Color()): THREE.Color => {
    out.set(hex);
    const l = Math.max(1e-3, lum(out));
    const t = Math.min(2, Math.max(0, tier));
    const lo = Math.floor(t),
      hi = Math.min(2, lo + 1);
    const target = TIER_L[lo] + (TIER_L[hi] - TIER_L[lo]) * (t - lo);
    return out.multiplyScalar(target / l);
  };
  const dusk: { m: THREE.MeshBasicMaterial; hex: number }[] = [];
  const lift = (t: number): number => THREE.MathUtils.smoothstep(t, 0.25, 0.6);
  ctx.onDispose(M.onDusk((t) => dusk.forEach((d) => tierColor(d.hex, lift(t), d.m.color))));
  ctx.onDispose(() => dusk.forEach((d) => d.m.dispose()));
  const L: Look = {
    hull: M.hull,
    hullWarm: M.hullWarm,
    deck: M.deckComposite,
    deckPath: M.deckPath,
    alu: M.brushedAlu,
    carbon: M.carbon,
    darkGlass: M.darkGlass,
    light: (hex, tier) => M.light(hex, tier === 0 ? 'T0' : tier === 1 ? 'T1' : 'T2'),
    duskLight(hex) {
      const m = new THREE.MeshBasicMaterial({ color: tierColor(hex, lift(M.dusk)) });
      m.name = 'prueffeld:light-line';
      dusk.push({ m, hex });
      return m;
    },
    tierColor,
  };
  cache.set(ctx, L);
  return L;
}
