/**
 * WP4 (engine) — ctx.frames and ctx.flight (plan §5.2, §5.3) over the engine's Frames
 * (src/core/zones/frames.ts). ctx.frames: the ground frame's registration (island module, WP3), its
 * terrain height and the adoption of the island module's ground physics. ctx.flight: the flight
 * state (the quest spine's) with the altitude (ctx.island.setAltitude), read-only.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Game } from '../../Game';
import { registerContextExtension } from '../ext';
import { registerDebugExt } from '../../DebugApi';
import type { DynamicHandle, KinematicHandle, StaticHandle } from '../types';
import type { FlightRead, FramesApi, GroundAdoptable } from '../types.frames';
import type { FlightStateName } from '../../quest/types';

export function installFrames(game: Game): void {
  const frames = game.frames;
  const physics = game.physics;
  // the flight state follows the quest spine's 'flight' events (no snapshot per read)
  let state: FlightStateName = game.quest.snapshot().flight.state;
  const flightListeners = new Set<(s: FlightStateName, h: number) => void>();
  const notify = (): void => {
    for (const cb of flightListeners) {
      try {
        cb(state, frames.altitude);
      } catch (err) {
        console.error('[frames] flight listener threw', err);
      }
    }
  };
  game.quest.onChange((s, e) => {
    if (e.kind !== 'flight') return;
    state = s.flight.state;
    notify();
  });
  frames.onAltitude(() => notify());

  const adoptCollider = (c: RAPIER_NS.Collider): void => physics.adoptGround(c);
  const adoptBody = (b: RAPIER_NS.RigidBody): void => {
    for (let i = 0; i < b.numColliders(); i++) adoptCollider(b.collider(i));
  };
  const adopt = (t: GroundAdoptable): void => {
    const o = t as object;
    if ('colliders' in o) for (const c of (t as StaticHandle).colliders) adoptCollider(c);
    else if ('raw' in o) adoptCollider((t as DynamicHandle).collider);
    else if ('setPose' in o) adoptBody((t as KinematicHandle).body);
    else if ('numColliders' in o) adoptBody(t as RAPIER_NS.RigidBody);
    else adoptCollider(t as RAPIER_NS.Collider);
  };

  const api: FramesApi = {
    register(name, root, o) {
      if (name !== 'ground') throw new Error(`ctx.frames.register: unknown frame "${String(name)}"`);
      frames.register(root, (x, z) => o.heightAt(x, z));
    },
    heightAt: (x, z) => frames.heightAt(x, z),
    get ground() {
      return frames.ground;
    },
    adopt(...things) {
      for (const t of things) {
        try {
          adopt(t);
        } catch (err) {
          console.error('[frames] adopt failed', err);
        }
      }
    },
  };
  registerContextExtension('frames', () => api);

  const flight: FlightRead = {
    get state() {
      return state;
    },
    get altitude() {
      return frames.altitude;
    },
    get docked() {
      return state === 'ground' && frames.altitude === 0;
    },
    onChange(cb) {
      flightListeners.add(cb);
      return () => void flightListeners.delete(cb);
    },
  };
  // tools (frames-check): the fan-out from outside the island module, the areas' frame state, the ground bodies
  registerDebugExt('frames', ((cmd?: string, ...args: unknown[]) => {
    if (cmd === 'set') frames.setAltitude(Number(args[0] ?? 0));
    else if (cmd === 'tilt') game.setIslandTilt(Number(args[0] ?? 0), Number(args[1] ?? 0));
    else if (cmd === 'areas')
      return [...game.zones.records.values()]
        .filter((r) => r.status === 'ready' && r.ctx && r.state)
        .map((r) => ({
          id: r.id,
          frame: game.zones.frameOf(r),
          suspended: r.suspended,
          attached: !!r.ctx!.root.parent,
          inside: r.inside,
          active: r.state!.active,
          edge: Math.round(r.state!.edgeDistance * 100) / 100,
          tiers: { detail: r.state!.groups.detail.visible, exterior: r.state!.groups.exterior.visible, far: r.state!.groups.far.visible || !!r.susp?.holder.visible },
        }));
    else if (cmd === 'physics') {
      let on = 0,
        off = 0;
      for (const [h, info] of physics.colliders) {
        if (!physics.isGroundInfo(info) || info.kind === 'dynamic') continue;
        if (physics.world.getCollider(h)?.isEnabled()) on++;
        else off++;
      }
      const bodies = [...physics.dynamics]
        .filter((d) => !d.removed && physics.isGroundBody(d))
        .map((d) => {
          const t = d.body.translation();
          return { id: d.id, owner: d.owner, frozen: physics.isFrozen(d), pos: [t.x, t.y, t.z], object: d.object.getWorldPosition(d.object.position.clone().set(0, 0, 0)).toArray() };
        });
      return { groundColliders: { on, off }, bodies, active: physics.groundActive };
    }
    return { ...frames.stats(), interior: game.zones.interiorId, flight: { state, altitude: frames.altitude, docked: state === 'ground' && frames.altitude === 0 } };
  }) as never);

  registerContextExtension('flight', (area) => ({
    get state() {
      return flight.state;
    },
    get altitude() {
      return flight.altitude;
    },
    get docked() {
      return flight.docked;
    },
    // unsubscribed with the area
    onChange(cb) {
      const off = flight.onChange(cb);
      area.onDispose(off);
      return off;
    },
  }));
}
