/**
 * Frames (Phase 7 plan §2.1, §5.3; WP4): „the world moves, the island doesn't“.
 *
 * Three frames: the island (never moves), the ground (dock, Werft, Revier, the sites) and the sky
 * (WP2's sky dressing). One setter, `setAltitude(h)` (ctx.island.setAltitude, island module only),
 * fans out to everything that depends on the altitude:
 *   - the ground root: y = −h, plus the inverse island tilt (setTilt, from Game.setIslandTilt);
 *     ground-frame area roots are its children (detached while suspended);
 *   - the flight environment (ctx.env.setFlight: altitude, fog mode, cloud sea; WP2 derives the
 *     slab, `cloudY` and `sunBlocked` from it);
 *   - the ground physics: colliders on only while docked (h ≤ 0.05 m and untilted), ground
 *     dynamics frozen otherwise (pose kept, sync paused, so their meshes ride along);
 *   - the suspension of ground areas above 1 m (they resume only at h = 0);
 *   - the shadow map (markShadowsDirty).
 * Nobody else writes any of these. Physics stays in the DOCKED frame: no collider ever moves.
 */
import * as THREE from 'three';
import type { Game } from '../Game';
import { FLIGHT, REVIER } from '@/world/layout';

/** The engine's frame rules (§5.3 rules 2 and 3). */
export const FRAME_RULES = {
  /** ground colliders on and ground dynamics running only at or below this altitude (m), untilted */
  colliderMaxH: 0.05,
  /** ground areas are suspended above this altitude (m); they resume only at h = 0 */
  suspendAboveH: 1,
  /** the far tier of a suspended ground area stays visible up to this altitude (m) */
  farMaxH: 1500,
  /** the cloud sea shows once its plane (slab top − h) is this far below the deck (m) */
  cloudSeaBelow: 30,
} as const;

export type AltitudeListener = (h: number) => void;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export class Frames {
  /** the ground frame's root: registered by the island module (WP3), else an engine group made on first use */
  private root: THREE.Group | null = null;
  private registered = false;
  private heightFn: (x: number, z: number) => number = () => 0;
  /** h (m) above the dock */
  altitude = 0;
  /** the island's visual tilt (degrees, after reduced motion); the ground root takes its inverse */
  private roll = 0;
  private pitch = 0;
  /** ground colliders on / ground dynamics running */
  private physicsOn = true;
  /** ground areas suspended (h > 1 m until h = 0) */
  suspended = false;
  private farShown = true;
  private readonly listeners = new Set<AltitudeListener>();
  private readonly dockedWaiters: (() => void)[] = [];
  /** ms of the last fan-out (frames-check, perf) */
  lastFanoutMs = 0;

  constructor(private game: Game) {}

  // ── the ground frame ────────────────────────────────────────────────────────

  /** island module only (WP3): the ground frame's root; the engine owns its transform and adds it to the scene if it has no parent. */
  register(root: THREE.Group, heightAt: (x: number, z: number) => number): void {
    const prev = this.root;
    this.root = root;
    this.registered = true;
    this.heightFn = heightAt;
    if (!root.parent) this.game.rs.scene.add(root);
    // areas made before the registration (a fallback root) move over, keeping their place
    if (prev && prev !== root) {
      for (const c of [...prev.children]) root.add(c);
      prev.removeFromParent();
    }
    this.applyTransform();
  }

  /** The ground root (a fallback engine group until the island module registers one; `?world=0`, early dev areas). */
  ensureGround(): THREE.Group {
    if (!this.root) {
      const g = new THREE.Group();
      g.name = 'core:ground-frame';
      this.game.rs.scene.add(g);
      this.root = g;
      this.applyTransform();
    }
    return this.root;
  }

  /** The registered ground root, or null (ctx.frames.ground). */
  get ground(): THREE.Group | null {
    return this.registered ? this.root : null;
  }

  /** The ground root in use (registered or fallback), or null when none exists yet. */
  get groundRoot(): THREE.Group | null {
    return this.root;
  }

  heightAt(x: number, z: number): number {
    try {
      return this.heightFn(x, z);
    } catch {
      return 0;
    }
  }

  /** `obj` is in the ground frame (a descendant of the ground root). */
  isGround(obj: THREE.Object3D | null): boolean {
    const r = this.root;
    if (!r) return false;
    for (let o = obj; o; o = o.parent) if (o === r) return true;
    return false;
  }

  /**
   * `obj`'s world matrix in the docked frame (as if h = 0 and untilted): physics lives there. For
   * objects outside the ground frame it is the plain world matrix.
   */
  dockedWorld(obj: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
    obj.updateWorldMatrix(true, false);
    out.copy(obj.matrixWorld);
    const r = this.root;
    if (r && !this.atRest && this.isGround(obj)) {
      r.updateWorldMatrix(true, false);
      out.premultiply(_m.copy(r.matrixWorld).invert());
    }
    return out;
  }

  /** the ground root is at its docked pose (h = 0, untilted) */
  get atRest(): boolean {
    return this.altitude === 0 && this.roll === 0 && this.pitch === 0;
  }

  /** ground colliders are on and ground dynamics run (h ≤ 0.05 m, untilted) */
  get physicsDocked(): boolean {
    return this.physicsOn;
  }

  /** Resolves the next time ground physics runs (now if it does). */
  whenDocked(): Promise<void> {
    if (this.physicsOn) return Promise.resolve();
    return new Promise((r) => this.dockedWaiters.push(r));
  }

  onAltitude(fn: AltitudeListener): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  // ── the one setter ───────────────────────────────────────────────────────────

  /** ctx.island.setAltitude (island module only): the ONE altitude setter (§5.3 rule 2). */
  setAltitude(h: number): void {
    if (!Number.isFinite(h)) return;
    h = Math.max(0, h);
    const t0 = performance.now();
    const changed = h !== this.altitude;
    this.altitude = h;
    this.applyTransform();
    // the flight environment: WP2 derives the slab (base and top − h), cloudY (top − h) and sunBlocked from h
    const top = REVIER.slab.top;
    this.game.env.setFlight({ altitude: h, fog: h >= top ? 'air' : 'ground', cloudSea: top - h <= -FRAME_RULES.cloudSeaBelow });
    this.syncPhysics();
    this.syncSuspension();
    this.game.rs.markShadowsDirty();
    this.game.requestRender(2);
    if (changed)
      for (const fn of this.listeners) {
        try {
          fn(h);
        } catch (err) {
          console.error('[frames] altitude listener threw', err);
        }
      }
    this.lastFanoutMs = performance.now() - t0;
  }

  /** Game.setIslandTilt: the ground root takes the inverse tilt (the environment does too, Environment.setTilt). */
  setTilt(rollDeg: number, pitchDeg: number): void {
    if (rollDeg === this.roll && pitchDeg === this.pitch) return;
    this.roll = rollDeg;
    this.pitch = pitchDeg;
    this.applyTransform();
    this.syncPhysics();
    this.game.rs.markShadowsDirty();
  }

  /** Boot: the first fan-out (h = 0 grounded, the level-off airborne), so every listener starts consistent. */
  start(h: number): void {
    this.altitude = Number.isFinite(h) ? Math.max(0, h) : 0;
    this.applyTransform();
    const top = REVIER.slab.top;
    this.game.env.setFlight({ altitude: this.altitude, fog: this.altitude >= top ? 'air' : 'ground', cloudSea: top - this.altitude <= -FRAME_RULES.cloudSeaBelow });
    this.syncPhysics();
    this.syncSuspension();
  }

  /** The altitude an airborne save starts at (the level-off, §1.5). */
  static airborneAltitude(): number {
    return FLIGHT.levelOff;
  }

  /** ground root = inverse tilt about the island centre (deck level) × (0, −h, 0) */
  private applyTransform(): void {
    const r = this.root;
    if (!r) return;
    _q.setFromEuler(_e.set(-THREE.MathUtils.degToRad(this.pitch), 0, -THREE.MathUtils.degToRad(this.roll)));
    r.quaternion.copy(_q);
    r.position.copy(_v.set(0, -this.altitude, 0).applyQuaternion(_q));
    r.updateMatrix();
    r.matrixWorldNeedsUpdate = true;
  }

  private syncPhysics(): void {
    const on = this.altitude <= FRAME_RULES.colliderMaxH && this.roll === 0 && this.pitch === 0;
    if (on === this.physicsOn) return;
    this.physicsOn = on;
    const g = this.game;
    // a ground body in the hand stays behind on the ground
    const held = g.grab?.held;
    if (!on && held && g.physics.isGroundBody(held)) g.grab.release(true);
    g.physics.setGroundActive(on);
    if (on) for (const w of this.dockedWaiters.splice(0)) w();
  }

  private syncSuspension(): void {
    const h = this.altitude;
    if (!this.suspended && h > FRAME_RULES.suspendAboveH) {
      this.suspended = true;
      this.game.zones?.setGroundSuspended(true);
    } else if (this.suspended && h === 0) {
      this.suspended = false;
      this.game.zones?.setGroundSuspended(false);
    }
    const far = h <= FRAME_RULES.farMaxH;
    if (far !== this.farShown) {
      this.farShown = far;
      this.game.zones?.setGroundFarShown(far);
    }
  }

  /** the far tier of suspended ground areas is shown (h ≤ 1,500 m) */
  get farVisible(): boolean {
    return this.farShown;
  }

  /** Debug / tools (__academy.ext('frames')). */
  stats(): { altitude: number; roll: number; pitch: number; docked: boolean; suspended: boolean; ground: string | null; registered: boolean; fanoutMs: number } {
    return {
      altitude: this.altitude,
      roll: this.roll,
      pitch: this.pitch,
      docked: this.physicsOn,
      suspended: this.suspended,
      ground: this.root?.name ?? null,
      registered: this.registered,
      fanoutMs: Math.round(this.lastFanoutMs * 1000) / 1000,
    };
  }
}
