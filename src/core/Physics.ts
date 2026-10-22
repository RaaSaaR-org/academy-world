import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Text } from './types';

export type Rapier = typeof RAPIER_NS;
export type RigidBody = RAPIER_NS.RigidBody;
export type Collider = RAPIER_NS.Collider;

/** Collision-group bits (membership << 16 | filter). */
export const GROUP = {
  PLAYER: 0x0001,
  WORLD: 0x0002,
  DYNAMIC: 0x0004,
  HELD: 0x0008,
  SENSOR: 0x0010,
  /** solid for player/bodies but skipped by sensor rays (glass invisible to LiDAR) */
  SENSOR_IGNORE: 0x0020,
} as const;
const ALL = 0xffff;
export const groups = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  // The character controller excludes sensors via QueryFilterFlags; SENSOR must stay in the
  // filter so trigger volumes detect the player (Rapier tests groups in both directions).
  player: groups(GROUP.PLAYER, GROUP.WORLD | GROUP.DYNAMIC | GROUP.SENSOR),
  world: groups(GROUP.WORLD, ALL),
  dynamic: groups(GROUP.DYNAMIC, ALL),
  held: groups(GROUP.HELD, GROUP.WORLD | GROUP.DYNAMIC | GROUP.HELD | GROUP.SENSOR),
  sensor: groups(GROUP.SENSOR, ALL),
  sensorIgnore: groups(GROUP.WORLD | GROUP.SENSOR_IGNORE, ALL),
};

/** true when a collider is tagged SENSOR_IGNORE (membership bit) */
export function isSensorIgnore(collisionGroups: number): boolean {
  return ((collisionGroups >>> 16) & GROUP.SENSOR_IGNORE) !== 0;
}

export type Surface = 'concrete' | 'metal' | 'grass' | 'wood' | 'glass' | 'rubber';

/** Everything the engine knows about a collider (looked up by collider handle). */
export interface ColliderInfo {
  kind: 'static' | 'dynamic' | 'kinematic' | 'sensor' | 'player';
  owner: string; // zone id / 'world' / 'core'
  surface?: Surface;
  dynamic?: DynamicBody;
  trigger?: TriggerRecord;
  /**
   * Phase 7 (plan §5.3 rule 3): 'ground' = in the ground frame although its owner is not a ground
   * area (the island module's dock, terrain and rescue volumes; fallback platforms of ground areas).
   * Colliders of ground-area owners (Physics.groundOwners) are ground without it.
   */
  frame?: 'ground';
}

/** A dynamic rigid body that is rendered by an Object3D (interpolated). */
export interface DynamicBody {
  readonly id: number;
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly object: THREE.Object3D;
  readonly owner: string;
  mass: number;
  grabbable: boolean;
  label: Text | null;
  held: boolean;
  /** what happens below the kill plane */
  onFall: 'reset' | 'remove' | ((b: DynamicBody) => void);
  /** world-space spawn transform (for reset) */
  spawnPos: THREE.Vector3;
  spawnQuat: THREE.Quaternion;
  removed: boolean;
}

export interface TriggerRecord {
  id: number;
  owner: string;
  collider: Collider;
  filter: 'player' | 'dynamic' | 'any';
  inside: Set<number>; // collider handles currently inside
  playerInside: boolean;
  onEnter?: (e: TriggerEvent) => void;
  onExit?: (e: TriggerEvent) => void;
  removed: boolean;
}

export interface TriggerEvent {
  /** true when the player capsule entered/left */
  isPlayer: boolean;
  /** the dynamic body (if a registered dynamic body entered/left) */
  body: DynamicBody | null;
}

interface Synced {
  body: RigidBody;
  object: THREE.Object3D;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currPos: THREE.Vector3;
  currQuat: THREE.Quaternion;
  /** inverse of the parent's world matrix at registration (parents must be static) */
  parentInv: THREE.Matrix4;
  parentInvQuat: THREE.Quaternion;
  dynamic: DynamicBody | null;
  sleepingSynced: boolean;
  /** Phase 7: a ground-frame body while ground physics is off: the object keeps its local pose (rides the ground root) */
  paused: boolean;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * Rapier world wrapper: fixed 60 Hz step, collider registry, interpolated
 * visual sync (prev/curr transforms lerped by the loop's alpha), sensor events,
 * kill-plane handling for bodies that fall off the island.
 */
export class Physics {
  readonly dt = 1 / 60;
  readonly world: RAPIER_NS.World;
  readonly eventQueue: RAPIER_NS.EventQueue;
  readonly colliders = new Map<number, ColliderInfo>();
  readonly dynamics = new Set<DynamicBody>();
  readonly triggers = new Map<number, TriggerRecord>(); // by collider handle
  private synced: Synced[] = [];
  private nextId = 1;
  killY = -90;
  playerColliderHandle = -1;
  stepCount = 0;
  /**
   * Phase 7 (plan §5.3): owners (area ids) whose colliders and bodies are in the ground frame. Their
   * colliders are on only while ground physics is active, their dynamic bodies freeze otherwise.
   */
  readonly groundOwners = new Set<string>();
  /** ground colliders on and ground dynamics running (h ≤ 0.05 m, untilted; Frames) */
  groundActive = true;
  /** frozen ground dynamics: their velocities at the freeze */
  private frozen = new Map<DynamicBody, { lin: RAPIER_NS.Vector; ang: RAPIER_NS.Vector }>();
  /**
   * The docked world matrix of an object (Frames.dockedWorld): physics lives in the docked frame, so a
   * body registered while the ground is lifted or tilted still syncs to the right place.
   */
  dockedWorld: ((obj: THREE.Object3D, out: THREE.Matrix4) => THREE.Matrix4) | null = null;

  constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.dt;
    this.eventQueue = new R.EventQueue(true);
  }

  newId(): number {
    return this.nextId++;
  }

  register(collider: Collider, info: ColliderInfo): void {
    this.colliders.set(collider.handle, info);
    // made while ground physics is off (an area built during a hover): off from the start
    if (!this.groundActive && info.kind !== 'dynamic' && info.kind !== 'player' && this.isGroundInfo(info)) collider.setEnabled(false);
  }

  // ── Phase 7: the ground frame (plan §5.3 rule 3) ──────────────────────────────

  isGroundInfo(info: ColliderInfo | undefined): boolean {
    return !!info && (info.frame === 'ground' || this.groundOwners.has(info.owner));
  }

  /** A dynamic body of the ground frame (a ground area's, or adopted by the island module). */
  isGroundBody(d: DynamicBody): boolean {
    return this.groundOwners.has(d.owner) || this.colliders.get(d.collider.handle)?.frame === 'ground';
  }

  /** Put a collider (and its body's dynamics) into the ground frame (ctx.frames.adopt). */
  adoptGround(c: Collider, fallback: Omit<ColliderInfo, 'frame'> = { kind: 'static', owner: 'world' }): void {
    let info = this.colliders.get(c.handle);
    if (!info) this.colliders.set(c.handle, (info = { ...fallback }));
    info.frame = 'ground';
    if (this.groundActive) return;
    if (info.kind === 'dynamic' && info.dynamic) this.freeze(info.dynamic);
    else if (info.kind !== 'player') c.setEnabled(false);
  }

  /**
   * Ground physics on or off (Frames, on a transition only): ground colliders are enabled, ground
   * dynamics frozen (pose kept, sync paused) or released with the velocity they had.
   */
  setGroundActive(on: boolean): void {
    if (on === this.groundActive) return;
    this.groundActive = on;
    for (const [handle, info] of this.colliders) {
      if (info.kind === 'dynamic' || info.kind === 'player' || !this.isGroundInfo(info)) continue;
      const c = this.world.getCollider(handle);
      if (c) c.setEnabled(on);
    }
    if (!on) {
      for (const d of this.dynamics) if (!d.removed && this.isGroundBody(d)) this.freeze(d);
      // kinematic ground bodies (machines) keep their meshes where they are too
      for (const s of this.synced) if (!s.dynamic && this.isGroundBodyHandle(s.body)) s.paused = true;
    } else {
      for (const [d, v] of this.frozen) {
        if (d.removed) continue;
        d.body.setEnabled(true);
        d.body.setLinvel(v.lin, true);
        d.body.setAngvel(v.ang, true);
        this.snap(d.body);
      }
      this.frozen.clear();
      for (const s of this.synced) if (s.paused) {
        s.paused = false;
        s.sleepingSynced = false;
      }
    }
  }

  private isGroundBodyHandle(b: RigidBody): boolean {
    for (let i = 0; i < b.numColliders(); i++) if (this.isGroundInfo(this.colliders.get(b.collider(i).handle))) return true;
    return false;
  }

  private freeze(d: DynamicBody): void {
    if (this.frozen.has(d)) return;
    const l = d.body.linvel(),
      a = d.body.angvel();
    this.frozen.set(d, { lin: { x: l.x, y: l.y, z: l.z }, ang: { x: a.x, y: a.y, z: a.z } });
    d.body.setEnabled(false);
    for (const s of this.synced) if (s.body === d.body) s.paused = true;
  }

  /** The body is a frozen ground dynamic (debug, tests). */
  isFrozen(d: DynamicBody): boolean {
    return this.frozen.has(d);
  }

  infoOf(collider: Collider | null | undefined): ColliderInfo | undefined {
    return collider ? this.colliders.get(collider.handle) : undefined;
  }

  /** Track an Object3D to follow a rigid body with render interpolation. */
  sync(body: RigidBody, object: THREE.Object3D, dynamic: DynamicBody | null = null): void {
    const parentInv = new THREE.Matrix4();
    const parentInvQuat = new THREE.Quaternion();
    if (object.parent) {
      object.parent.updateWorldMatrix(true, false);
      // Phase 7: the parent's DOCKED world matrix (= matrixWorld unless the ground frame is lifted or tilted)
      if (this.dockedWorld) this.dockedWorld(object.parent, parentInv);
      else parentInv.copy(object.parent.matrixWorld);
      parentInv.decompose(_v, parentInvQuat, _s);
      parentInv.invert();
      parentInvQuat.invert();
    }
    const t = body.translation(),
      r = body.rotation();
    const s: Synced = {
      body,
      object,
      prevPos: new THREE.Vector3(t.x, t.y, t.z),
      currPos: new THREE.Vector3(t.x, t.y, t.z),
      prevQuat: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      currQuat: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      parentInv,
      parentInvQuat,
      dynamic,
      sleepingSynced: false,
      paused: false,
    };
    this.synced.push(s);
    // a ground body added while ground physics is off starts frozen (its mesh is placed once, docked)
    if (!this.groundActive && (dynamic ? this.isGroundBody(dynamic) : this.isGroundBodyHandle(body))) {
      if (dynamic) this.freeze(dynamic);
      this.writeObject(s, 1);
      s.paused = true;
      return;
    }
    this.writeObject(s, 1);
  }

  unsync(body: RigidBody): void {
    this.synced = this.synced.filter((s) => s.body !== body);
  }

  /** Snap interpolation (after teleport/reset) so the object doesn't streak. */
  snap(body: RigidBody): void {
    for (const s of this.synced) {
      if (s.body !== body) continue;
      const t = body.translation(),
        r = body.rotation();
      s.prevPos.set(t.x, t.y, t.z);
      s.currPos.copy(s.prevPos);
      s.prevQuat.set(r.x, r.y, r.z, r.w);
      s.currQuat.copy(s.prevQuat);
      s.sleepingSynced = false;
      if (s.paused) this.writeObject(s, 1);
    }
  }

  /** One fixed step. */
  step(): void {
    for (const s of this.synced) {
      s.prevPos.copy(s.currPos);
      s.prevQuat.copy(s.currQuat);
    }
    this.world.step(this.eventQueue);
    this.stepCount++;
    for (const s of this.synced) {
      const t = s.body.translation(),
        r = s.body.rotation();
      s.currPos.set(t.x, t.y, t.z);
      s.currQuat.set(r.x, r.y, r.z, r.w);
    }
    this.eventQueue.drainCollisionEvents((h1, h2, started) => this.onCollisionEvent(h1, h2, started));
    this.checkKillPlane();
  }

  private onCollisionEvent(h1: number, h2: number, started: boolean): void {
    let trig = this.triggers.get(h1),
      other = h2;
    if (!trig) {
      trig = this.triggers.get(h2);
      other = h1;
    }
    if (!trig || trig.removed) return;
    const isPlayer = other === this.playerColliderHandle;
    const info = this.colliders.get(other);
    const body = info?.dynamic ?? null;
    if (trig.filter === 'player' && !isPlayer) return;
    if (trig.filter === 'dynamic' && !body) return;
    if (started) {
      if (trig.inside.has(other)) return;
      trig.inside.add(other);
      if (isPlayer) trig.playerInside = true;
    } else {
      if (!trig.inside.delete(other)) return;
      if (isPlayer) trig.playerInside = false;
    }
    const fn = started ? trig.onEnter : trig.onExit;
    if (!fn) return;
    try {
      fn({ isPlayer, body });
    } catch (err) {
      console.error(`[physics] trigger callback (owner "${trig.owner}") threw`, err);
    }
  }

  private checkKillPlane(): void {
    for (const d of this.dynamics) {
      if (d.removed || d.held || this.frozen.has(d)) continue;
      if (d.body.translation().y > this.killY) continue;
      this.handleFall(d);
    }
  }

  /** A body fell (below the kill plane, or into a rescue volume): its onFall rule — reset, remove or its own. */
  handleFall(d: DynamicBody): void {
    if (d.removed) return;
    if (d.onFall === 'reset') this.resetDynamic(d);
    else if (d.onFall === 'remove') this.removeDynamic(d);
    else {
      try {
        d.onFall(d);
      } catch (err) {
        console.error('[physics] onFall threw', err);
        this.resetDynamic(d);
      }
    }
  }

  resetDynamic(d: DynamicBody): void {
    d.body.setTranslation(d.spawnPos, true);
    d.body.setRotation(d.spawnQuat, true);
    d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.snap(d.body);
  }

  removeDynamic(d: DynamicBody): void {
    if (d.removed) return;
    d.removed = true;
    this.dynamics.delete(d);
    this.frozen.delete(d);
    this.unsync(d.body);
    this.colliders.delete(d.collider.handle);
    this.world.removeRigidBody(d.body);
    d.object.removeFromParent();
  }

  removeTrigger(t: TriggerRecord): void {
    if (t.removed) return;
    t.removed = true;
    this.triggers.delete(t.collider.handle);
    this.colliders.delete(t.collider.handle);
    this.world.removeCollider(t.collider, false);
  }

  /** Remove a collider (static or otherwise) and forget its info. */
  removeCollider(c: Collider): void {
    this.colliders.delete(c.handle);
    if (this.world.getCollider(c.handle)) this.world.removeCollider(c, true);
  }

  removeBody(b: RigidBody): void {
    for (let i = 0; i < b.numColliders(); i++) this.colliders.delete(b.collider(i).handle);
    this.unsync(b);
    if (this.world.getRigidBody(b.handle)) this.world.removeRigidBody(b);
  }

  /** Write interpolated transforms into the Object3Ds. alpha ∈ [0,1]. */
  /** True when the last interpolate() moved a rendered body (the sun's shadow map needs a redraw, C11c). */
  moved = false;

  interpolate(alpha: number): void {
    let moved = false;
    for (const s of this.synced) {
      // a frozen ground body rides the ground root with its last local pose
      if (s.paused) continue;
      const sleeping = s.body.isSleeping();
      if (sleeping && s.sleepingSynced) continue;
      this.writeObject(s, sleeping ? 1 : alpha);
      s.sleepingSynced = sleeping;
      moved = true;
    }
    this.moved = moved;
  }

  private writeObject(s: Synced, alpha: number): void {
    _v.lerpVectors(s.prevPos, s.currPos, alpha);
    _q.slerpQuaternions(s.prevQuat, s.currQuat, alpha);
    // world → parent-local (parents are static zone groups)
    s.object.position.copy(_v).applyMatrix4(s.parentInv);
    s.object.quaternion.copy(s.parentInvQuat).multiply(_q);
  }

  /** Interpolated world position of a synced body (for HUD/labels). */
  interpolatedPosition(body: RigidBody, out: THREE.Vector3): THREE.Vector3 {
    for (const s of this.synced) if (s.body === body) return s.object.getWorldPosition(out);
    const t = body.translation();
    return out.set(t.x, t.y, t.z);
  }
}
