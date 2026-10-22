/**
 * WP15 — the life runtime (its own lazy chunk „life“, ≤ 40 KB brotli, plan §5.6; loaded by boot.ts after
 * the title). Builds, in this order: the LifeDirector and its areas, the people, the Hofladen farm (crate
 * rovers, crates, the puddle, the misses, the bumblebees), the birds, the Tomatenkapsel arm, the island's
 * own eggs (Winke-Arm, Robota locker, Fotopunkt, Danke door, the Allee console) and the gather of the
 * lift-off. Everything listens to events only: 'sonnenacker:shift' / 'sonnenacker:layout' (WP9),
 * 'life:react' and 'flight:phase' (WP12, WP13), 'quest:*' (WP1).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import type { GroundHandle } from '../ground';
import type { Vec3Tuple } from '../layout';
import { createDirector, type Director } from './director';
import { buildPeople, type People } from './people';
import { personPartGeometry } from './crowd';
import { AREAS, SPOTS } from './tuning';
import { buildFarm } from './farm';
import { buildBirds } from './birds';
import { buildKapsel } from './kapsel';
import { buildGather } from './gather';
import { buildSounds } from './sound';
import { buildEggs } from '../eggs';

export interface LifeRuntime {
  readonly director: Director;
  readonly people: People;
  stats(): Record<string, unknown>;
  crowd(): ReturnType<People['crowdState']>;
  peopleState(): ReturnType<People['peopleState']>;
}

export function startLife(ctx: ZoneContext, deps: { ground: GroundHandle }): LifeRuntime {
  const D = createDirector(ctx, deps.ground.root, () => deps.ground.atPlaza);
  for (const [id, a] of Object.entries(AREAS)) D.area(id, { center: a.center, radius: a.radius, frame: a.frame });
  const paint = ctx.robots?.paint ?? ctx.materials.standard({ vertexColors: true, roughness: 0.55, metalness: 0 });
  const heightAt = (x: number, z: number): number => deps.ground.heightAt(x, z);
  const sounds = buildSounds(ctx, D);
  const partGeo = personPartGeometry();
  ctx.onDispose(() => partGeo.dispose());
  // the island's centre seen from a ground point (people face it to wave, the crowd looks at it)
  const islandDir = (from: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => out.set(-from.x, 0, -from.z).normalize();
  let farmLink: ReturnType<typeof buildFarm> | null = null;
  const people = buildPeople({
    director: D,
    heightAt,
    material: paint,
    geometry: partGeo,
    farm: () => farmLink,
    islandDir,
    reducedMotion: () => ctx.settings.reducedMotion,
    camera: ctx.camera,
    greet: (at) => sounds.greet(at),
  });
  farmLink = buildFarm(ctx, { director: D, people, paint, heightAt, sounds });
  buildBirds(ctx, { director: D, paint, heightAt, sounds });
  const kapsel = buildKapsel(ctx, { director: D, paint });
  const gather = buildGather(ctx, { director: D, people });
  const eggs = buildEggs(ctx, { director: D, paint, ground: deps.ground, sounds });

  // the world reacts when a system comes online and at the lift-off; the Tomatenkapsel lights on T3
  ctx.events.on('quest:system', (e?: { id?: string; to?: string }) => {
    if (e?.id === 'T3') kapsel.setLit(e.to === 'an');
  });
  kapsel.setLit(ctx.quest.system('T3') === 'an');

  const stats = (): Record<string, unknown> => ({
    ...D.stats(),
    clock: { t: Math.round(D.clock.t * 10) / 10, loop: D.clock.loop, phase: D.clock.phase },
    tiers: Object.fromEntries(Object.keys(AREAS).map((id) => [id, D.tierOf(id)])),
    altitude: D.altitude,
    farm: farmLink?.stats(),
    gather: gather.state(),
    eggs: eggs.stats(),
  });
  void SPOTS;
  return {
    director: D,
    people,
    stats,
    crowd: () => people.crowdState(),
    peopleState: () => people.peopleState(),
  };
}

export type { Vec3Tuple };
