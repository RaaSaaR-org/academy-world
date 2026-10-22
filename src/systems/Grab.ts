import * as THREE from 'three';
import { GROUPS, type DynamicBody, type Physics } from '@/core/Physics';
import type { EventBus } from '@/core/EventBus';
import type { AudioSystem } from './Audio';
import type { Player } from './Player';

/** Max force the player's "arms" can apply (N). ≈ lifting 30 kg comfortably, 40 kg max. */
export const ARM_STRENGTH = 400;
const OMEGA_MAX = 14; // rad/s — stiffness cap for light objects
const STIFFNESS = 600; // N/m — heavy objects get ω = sqrt(K/m) → sluggish
const MIN_DIST = 1.1;
const MAX_DIST = 3.2;
const THROW_SPEED_MAX = 13; // m/s for light objects
const THROW_IMPULSE_MAX = 22; // N·s — heavy objects fly slower (v = J/m)

export interface GrabReadout {
  mass: number;
  weight: number; // N
  force: number; // N currently applied (smoothed)
  maxForce: number;
  saturated: boolean; // force limit reached
  tooHeavy: boolean; // weight alone exceeds the limit
}

const _cam = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _target = new THREE.Vector3();
const _prevTarget = new THREE.Vector3();
const _err = new THREE.Vector3();
const _vrel = new THREE.Vector3();
const _F = new THREE.Vector3();
const _tv = new THREE.Vector3();

/**
 * Physical grabbing (hold F or right mouse): the held body is pulled to a point in
 * front of the camera by a critically damped spring with a FORCE LIMIT — so mass
 * matters: light things snap into place, heavy things lag and sag, too-heavy things
 * can only be dragged. Left click throws with a limited impulse (v = J/m).
 */
export class GrabSystem {
  held: DynamicBody | null = null;
  private holdDist = 2;
  private savedAngDamp = 0;
  private savedLinDamp = 0;
  private stuckTime = 0;
  private hasPrevTarget = false;
  readout: GrabReadout | null = null;
  lastThrow: { impulse: number; speed: number; mass: number; t: number } | null = null;

  constructor(
    private physics: Physics,
    private player: Player,
    private audio: AudioSystem,
    private events: EventBus,
    private camera: THREE.Camera,
  ) {}

  start(d: DynamicBody): boolean {
    if (this.held || d.removed || !d.grabbable) return false;
    this.held = d;
    d.held = true;
    const b = d.body;
    this.savedAngDamp = b.angularDamping();
    this.savedLinDamp = b.linearDamping();
    b.setAngularDamping(7);
    b.setLinearDamping(0);
    b.wakeUp();
    d.collider.setCollisionGroups(GROUPS.held);
    this.player.ignoreCollider = d.collider;
    this.camera.getWorldPosition(_cam);
    const t = b.translation();
    this.holdDist = THREE.MathUtils.clamp(Math.hypot(t.x - _cam.x, t.y - _cam.y, t.z - _cam.z), MIN_DIST + 0.3, 2.4);
    this.stuckTime = 0;
    this.hasPrevTarget = false;
    this.audio.play('grab');
    this.events.emit('grab:start', { id: d.id, mass: d.mass, owner: d.owner });
    return true;
  }

  release(silent = false): DynamicBody | null {
    const d = this.held;
    if (!d) return null;
    this.held = null;
    this.readout = null;
    d.held = false;
    this.player.ignoreCollider = null;
    if (!d.removed) {
      d.body.setAngularDamping(this.savedAngDamp);
      d.body.setLinearDamping(this.savedLinDamp);
      d.collider.setCollisionGroups(GROUPS.dynamic);
    }
    if (!silent) this.audio.play('drop');
    this.events.emit('grab:end', { id: d.id, mass: d.mass, owner: d.owner });
    return d;
  }

  throw(): void {
    const d = this.release(true);
    if (!d || d.removed) return;
    this.camera.getWorldDirection(_fwd);
    const m = d.body.mass();
    const J = Math.min(m * THROW_SPEED_MAX, THROW_IMPULSE_MAX);
    // remove current velocity first so the throw is predictable
    d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    d.body.applyImpulse({ x: _fwd.x * J, y: _fwd.y * J + 0.1 * J, z: _fwd.z * J }, true);
    const speed = J / m;
    this.lastThrow = { impulse: J, speed, mass: m, t: performance.now() };
    this.audio.play('throw', { volume: Math.min(1, 0.4 + speed / 12) });
    this.events.emit('throw', { id: d.id, mass: m, impulse: J, speed, owner: d.owner });
  }

  adjustDistance(steps: number): void {
    this.holdDist = THREE.MathUtils.clamp(this.holdDist - steps * 0.2, MIN_DIST, MAX_DIST);
  }

  /** Fixed step: apply the force-limited spring. */
  fixedUpdate(dt: number): void {
    const d = this.held;
    if (!d) return;
    if (d.removed) {
      this.release(true);
      return;
    }
    const b = d.body;
    this.camera.getWorldPosition(_cam);
    this.camera.getWorldDirection(_fwd);
    _target.copy(_cam).addScaledVector(_fwd, this.holdDist);
    _target.y -= 0.12;
    // keep the target above the player's feet level - 0.2 so objects don't dig into the floor
    if (!this.hasPrevTarget) {
      _prevTarget.copy(_target);
      this.hasPrevTarget = true;
    }
    _tv.subVectors(_target, _prevTarget).divideScalar(dt);
    _prevTarget.copy(_target);

    const m = b.mass();
    const t = b.translation(),
      v = b.linvel();
    _err.set(_target.x - t.x, _target.y - t.y, _target.z - t.z);
    _vrel.set(v.x - _tv.x, v.y - _tv.y, v.z - _tv.z);
    const omega = Math.min(OMEGA_MAX, Math.sqrt(STIFFNESS / m));
    const g = -this.physics.world.gravity.y;
    // F = m (ω² e − 2ω v_rel) + m g (gravity compensation)
    _F.copy(_err).multiplyScalar(omega * omega).addScaledVector(_vrel, -2 * omega).multiplyScalar(m);
    _F.y += m * g;
    const need = _F.length();
    const saturated = need > ARM_STRENGTH;
    if (saturated) _F.multiplyScalar(ARM_STRENGTH / need);
    b.applyImpulse({ x: _F.x * dt, y: _F.y * dt, z: _F.z * dt }, true);

    const weight = m * g;
    const prevForce = this.readout?.force ?? weight;
    this.readout = {
      mass: m,
      weight,
      force: prevForce + (Math.min(need, ARM_STRENGTH) - prevForce) * 0.15,
      maxForce: ARM_STRENGTH,
      saturated,
      tooHeavy: weight > ARM_STRENGTH,
    };

    // dropped automatically when stuck far away from the hold point
    const errLen = _err.length();
    if (errLen > 2.2) this.stuckTime += dt;
    else this.stuckTime = 0;
    if (this.stuckTime > 0.6 || errLen > 5) this.release();
  }
}
