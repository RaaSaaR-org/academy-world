/**
 * WP4 (engine): plot kinds, frames, shapes and tiers; ctx.frames, ctx.flight, ctx.island.setAltitude,
 * rescue volumes, operate capture, suspension hooks (Phase 7 plan §5.2, §5.3). Contract committed by
 * WPS in wave 0; WP4 owns the file from wave 1. Re-exported by src/core/zones/index.ts.
 */
import type * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Vec3Input } from '../types';
import type { FlightStateName } from '../quest/types';
import type { PlotFrame, PlotKind } from './manifest';
import type { DynamicHandle, KinematicHandle, StaticHandle } from './types';
// (ZoneContext below resolves inside the augmented module './types')

export type { PlotKind, PlotFrame } from './manifest';

export type PlotShape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; d: number };

/** Tier distances measured from the shape's edge, not the anchor. */
export interface PlotTiers {
  detail: number;
  exterior: number;
}

/** What Phase 7 adds to a plot (src/world/layout.ts PlotDef). radius = the circumscribed radius for rect plots. */
export interface PlotFields {
  kind?: PlotKind;
  frame?: PlotFrame;
  shape?: PlotShape;
  tiers?: PlotTiers;
  /** while the player is inside, other areas cap at their exterior tier */
  interior?: boolean;
}

/** Physics a package can put into the ground frame (ctx.frames.adopt). */
export type GroundAdoptable = StaticHandle | DynamicHandle | KinematicHandle | RAPIER_NS.Collider | RAPIER_NS.RigidBody;

/** ctx.frames */
export interface FramesApi {
  /**
   * island module only (WP3): the ground frame's root and its terrain height. Build it at h = 0; the
   * engine owns the root's transform (y = −h and the inverse tilt) and adds it to the scene if it has
   * no parent. Ground-frame areas parent here.
   */
  register(name: 'ground', root: THREE.Group, o: { heightAt(x: number, z: number): number }): void;
  /** terrain at h = 0, for ground-frame areas (0 until the ground frame is registered) */
  heightAt(x: number, z: number): number;
  readonly ground: THREE.Group | null;
  /**
   * island module only (WP3, WP14; additive, WP4): put physics it made into the ground frame — its
   * colliders are on only while docked (h ≤ 0.05 m, untilted), its dynamic bodies freeze while the
   * ground moves. Statics and bodies made with ctx.physics from objects under the ground root are
   * adopted automatically; raw colliders (heightfield tiles), box statics and rescue volumes made
   * by the island module are not, so pass them here. Ground areas need none of this.
   */
  adopt(...things: GroundAdoptable[]): void;
}

/** ctx.flight: read-only (the state belongs to the quest spine; the altitude to ctx.island.setAltitude). */
export interface FlightRead {
  readonly state: FlightStateName;
  readonly altitude: number;
  /** grounded and h = 0 */
  readonly docked: boolean;
  onChange(cb: (s: FlightStateName, h: number) => void): () => void;
}

export interface RescueVolumeOptions {
  center: Vec3Input;
  size: Vec3Input;
  /** additive (WP4): yaw of the box about +Y (degrees, local frame), e.g. the lake volume along bearing 295 */
  yawDeg?: number;
  /** the player inside is rescued (moved to the rescue point) */
  player?: 'rescue';
  /** dynamic bodies inside are reset to their spawn (their onFall rule: reset, remove or the area's own) */
  dynamics?: 'reset';
  /**
   * additive (WP4): the frame of the volume. Default: the area's frame. The island module's dock-floor
   * and lake volumes pass 'ground' (they are off while the ground moves; ISLAND.killY is the backstop).
   */
  frame?: PlotFrame;
}

/**
 * enterOperate({ capture }): piloting a robot (WASD and look go to the station, not the player).
 * `keys` (KeyboardEvent.code) reach the station only: ctx.input.isDown / pressed and its onKey handlers
 * (no whileOperating needed); the engine's own keys (Tab, M, H, R on a result) skip them. Escape always
 * leaves. `pointerLock`: the mouse stays captured and its movement goes to `onLook` (pixels per frame);
 * losing the lock (Esc) leaves operate mode. Without `camera` the view stays at `cameraPose`.
 */
export interface OperateCapture {
  keys: readonly string[];
  pointerLock?: boolean;
  onLook?(dx: number, dy: number): void;
  /**
   * additive (WP4): called every frame while operating — write the camera pose in zone-LOCAL
   * coordinates (the robot's head camera, a chase camera). `out` arrives at the local origin.
   */
  camera?(out: { position: THREE.Vector3; quaternion: THREE.Quaternion }): void;
}

/** 'zones:failed': an area's code failed to load or init (after its retries); WP1's loading card listens. */
export interface ZonesFailedEvent {
  id: string;
  phase: 'load' | 'init';
  error: string;
}

/**
 * additive (WP4): 'zones:retry' { id } — the loading card's „Erneut laden“ for an area in error: the
 * engine resets it and loads it again (with its retries); 'zones:failed' or 'zone:ready' follows.
 * A robot is retried by calling ctx.robots.load() again.
 */
export interface ZonesRetryEvent {
  id: string;
}

declare module './ext' {
  interface ZoneContextExtensions {
    /** WP4: the frames (the ground frame registered by the island module) */
    readonly frames: FramesApi;
    /** WP4: flight state and altitude, read-only */
    readonly flight: FlightRead;
  }
}

declare module './types' {
  interface ZoneDefinition {
    /** the area's frame left the ground (h > 1 m): no update, interactables and panels off (§5.3 rule 3) */
    onSuspend?(ctx: ZoneContext): void;
    /** back at h = 0 */
    onResume?(ctx: ZoneContext): void;
  }
  interface ZoneIsland {
    /** island module only (WP12 Probestart, WP13 F1 and lift-off): the ONE altitude setter (§5.3) */
    setAltitude(h: number): void;
  }
  interface ZonePhysics {
    /** a box volume (local coords) that rescues the player and/or resets dynamic bodies inside it */
    addRescueVolume(o: RescueVolumeOptions): StaticHandle;
  }
  interface OperateOptions {
    capture?: OperateCapture;
  }
}
