import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { GROUPS, type Physics, type Surface } from '@/core/Physics';
import type { Input } from '@/core/Input';
import type { AudioSystem } from './Audio';
import type { Settings } from '@/core/Settings';
import type { EventBus } from '@/core/EventBus';

// Movement values follow docs/GDD.md §4.1 (capsule r 0.35 / 1.75 m, step 0.35, slope 40°,
// jump 0.6 m, walk 4.5, sprint 8). Eye height 1.7 m per the engine brief.
export const EYE_HEIGHT = 1.7;
export const CAPSULE_RADIUS = 0.35;
export const CAPSULE_HEIGHT = 1.75;
const HALF_HEIGHT = (CAPSULE_HEIGHT - 2 * CAPSULE_RADIUS) / 2;
const CAPSULE_CENTER = HALF_HEIGHT + CAPSULE_RADIUS; // feet → capsule centre

const WALK = 4.5;
const SPRINT = 8.0;
const ACCEL_GROUND = 55;
const ACCEL_AIR = 9;
const GRAVITY = 19.6; // game-feel gravity for the player only (physics objects use 9.81)
const JUMP_HEIGHT = 0.6;
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
const COYOTE = 0.12;
const JUMP_BUFFER = 0.13;
const MAX_PITCH = THREE.MathUtils.degToRad(88);
/** arrow-key turn rate (rad/s) */
const KEY_TURN = THREE.MathUtils.degToRad(115);

const _wish = new THREE.Vector3();
const _move = { x: 0, y: 0, z: 0 };
const _retry = { x: 0, y: 0, z: 0 };
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();

export interface CameraOverride {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** 0 = player view, 1 = override pose (eased by the caller) */
  blend: number;
}

/**
 * First-person character: Rapier KinematicCharacterController (steps, slopes,
 * snap-to-ground), coyote time + jump buffer, head bob, landing dip, sprint FOV kick,
 * surface-aware footsteps, camera shake, ballistic flights (jump pads) and a camera
 * override (operate mode). Movement runs in fixed steps; the camera is interpolated.
 */
export class Player {
  readonly body: RAPIER_NS.RigidBody;
  readonly collider: RAPIER_NS.Collider;
  private controller: RAPIER_NS.KinematicCharacterController;

  /** feet position (fixed-step state) */
  readonly feet = new THREE.Vector3();
  private prevFeet = new THREE.Vector3();
  /** interpolated feet position (render) */
  readonly renderFeet = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  /** camera roll in radians (island tilt) */
  roll = 0;
  grounded = false;
  private coyote = 0;
  private jumpBuffer = 0;
  private wasGrounded = false;
  private fallSpeed = 0;
  gravityScale = 1;
  speedFactor = 1;
  headBobScale = 1;
  private moveLocks = 0;
  private keyTurn = 0;
  private lookLocks = 0;
  /** set by the grab system so the held body never pushes the player */
  ignoreCollider: RAPIER_NS.Collider | null = null;
  /** ballistic flight (jump pads): controller input disabled until landing */
  private flight: { v: THREE.Vector3; g: number; onLand?: () => void } | null = null;
  cameraOverride: CameraOverride | null = null;

  // camera feel
  private stepDist = 0;
  private stepIndex = 0;
  private bobAmp = 0;
  private landOffset = 0;
  private landVel = 0;
  private fovKick = 0;
  private shakeAmp = 0;
  private shakeTime = 0;
  surface: Surface = 'concrete';
  private lastSafe = new THREE.Vector3();
  private safeTimer = 0;
  sprinting = false;

  constructor(
    private physics: Physics,
    private input: Input,
    private audio: AudioSystem,
    private settings: Settings,
    private events: EventBus,
    readonly camera: THREE.PerspectiveCamera,
  ) {
    const R = physics.R;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CAPSULE_CENTER + 0.05, 0));
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(HALF_HEIGHT, CAPSULE_RADIUS).setCollisionGroups(GROUPS.player).setFriction(0), this.body);
    physics.register(this.collider, { kind: 'player', owner: 'core' });
    physics.playerColliderHandle = this.collider.handle;

    this.controller = physics.world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(0.35, 0.18, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(40));
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(50));
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(75);
    this.controller.setNormalNudgeFactor(0.0001);
    this.feet.set(0, 0.05, 0);
    this.prevFeet.copy(this.feet);
    this.renderFeet.copy(this.feet);
  }

  get reducedMotion(): boolean {
    return this.settings.data.reducedMotion;
  }
  get movementLocked(): boolean {
    return this.moveLocks > 0;
  }
  get lookLocked(): boolean {
    return this.lookLocks > 0;
  }
  get inFlight(): boolean {
    return !!this.flight;
  }

  /** Lock movement (and optionally look). Returns an idempotent unlock function. */
  lock(opts: { look?: boolean } = {}): () => void {
    this.moveLocks++;
    if (opts.look) this.lookLocks++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.moveLocks = Math.max(0, this.moveLocks - 1);
      if (opts.look) this.lookLocks = Math.max(0, this.lookLocks - 1);
    };
  }

  /** Teleport feet to a world position; yaw/pitch in radians (optional). */
  teleport(pos: THREE.Vector3Like, yaw?: number, pitch?: number): void {
    // +5 cm so a spawn exactly on a surface never starts inside it (snap-to-ground settles it)
    this.feet.set(pos.x, pos.y + 0.05, pos.z);
    this.prevFeet.copy(this.feet);
    this.renderFeet.copy(this.feet);
    const c = { x: this.feet.x, y: this.feet.y + CAPSULE_CENTER, z: this.feet.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
    this.velocity.set(0, 0, 0);
    this.fallSpeed = 0;
    this.flight = null;
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.lastSafe.copy(this.feet);
  }

  /**
   * Ballistic flight (jump pads): world velocity v0 (m/s), gravity g (default 9.81).
   * Input is ignored until landing; collisions still stop the flight.
   */
  launch(v0: THREE.Vector3Like, g = 9.81, onLand?: () => void): void {
    this.flight = { v: new THREE.Vector3(v0.x, v0.y, v0.z), g, onLand };
    this.grounded = false;
    this.coyote = 0;
    this.velocity.set(v0.x, v0.y, v0.z);
    this.events.emit('player:launch', { v: Math.hypot(v0.x, v0.y, v0.z) });
  }

  /** Camera shake (amplitude metres, duration seconds). Ignored with reduced motion. */
  shake(amplitude = 0.04, duration = 0.12): void {
    if (this.reducedMotion) return;
    this.shakeAmp = Math.max(this.shakeAmp, amplitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  /** Render-frame input: mouse look, arrow-key turning (trackpad / keyboard players) + edge-triggered jump buffering. */
  frameInput(active: boolean, dt = 1 / 60): void {
    if (!active) return;
    if (!this.lookLocked && (this.input.locked || this.input.syntheticLook)) {
      const s = 0.0022 * this.settings.data.sensitivity;
      this.yaw -= this.input.mouseDX * s;
      this.pitch -= this.input.mouseDY * s * (this.settings.data.invertY ? -1 : 1);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
    }
    if (!this.lookLocked) {
      // ← / → turn (≈ 115°/s, eased in over the first 0.2 s): playable without a mouse or pointer lock
      const turn = (this.input.isDown('ArrowLeft') ? 1 : 0) - (this.input.isDown('ArrowRight') ? 1 : 0);
      this.keyTurn = turn ? Math.min(1, this.keyTurn + dt * 5) : 0;
      if (turn) this.yaw += turn * KEY_TURN * this.keyTurn * Math.min(dt, 0.05);
    }
    if (!this.movementLocked && this.input.pressed('Space')) this.jumpBuffer = JUMP_BUFFER;
  }

  /** Fixed 60 Hz step. */
  fixedUpdate(dt: number, active: boolean): void {
    this.prevFeet.copy(this.feet);
    if (this.flight) {
      this.fixedFlight(dt);
      return;
    }
    const inp = this.input;
    let fx = 0,
      fz = 0;
    const canMove = active && !this.movementLocked;
    if (canMove) {
      if (inp.anyDown('KeyW', 'ArrowUp')) fz -= 1;
      if (inp.anyDown('KeyS', 'ArrowDown')) fz += 1;
      if (inp.isDown('KeyA')) fx -= 1;
      if (inp.isDown('KeyD')) fx += 1;
    }
    _wish.set(fx, 0, fz);
    if (_wish.lengthSq() > 1) _wish.normalize();
    _wish.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
    this.sprinting = canMove && inp.anyDown('ShiftLeft', 'ShiftRight') && fz < 0;
    const speed = (this.sprinting ? SPRINT : WALK) * this.speedFactor;
    const tx = _wish.x * speed,
      tz = _wish.z * speed;
    const accel = (this.grounded ? ACCEL_GROUND : ACCEL_AIR) * dt;
    this.velocity.x = approach(this.velocity.x, tx, accel);
    this.velocity.z = approach(this.velocity.z, tz, accel);

    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.grounded && this.velocity.y <= 0) this.velocity.y = -1.5;
    else this.velocity.y -= GRAVITY * this.gravityScale * dt;
    if (this.velocity.y < -45) this.velocity.y = -45;

    if (this.jumpBuffer > 0 && this.coyote > 0 && canMove) {
      this.velocity.y = JUMP_SPEED; // same take-off speed → jump height ∝ 1/g (Moon jumps are higher)
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.audio.play('jump', { volume: 0.7 });
    }

    const m = this.moveCapsule(dt, this.grounded);

    if (this.velocity.y > 0 && m.y < _move.y * 0.5) this.velocity.y = 0; // ceiling
    if (dt > 0) {
      const ax = m.x / dt,
        az = m.z / dt;
      if (Math.abs(ax) < Math.abs(this.velocity.x)) this.velocity.x = ax;
      if (Math.abs(az) < Math.abs(this.velocity.z)) this.velocity.z = az;
    }

    this.wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();
    if (!this.grounded) this.fallSpeed = Math.max(this.fallSpeed, -this.velocity.y);
    if (this.grounded && !this.wasGrounded) this.onLanded();
    if (this.grounded) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.5) {
        this.safeTimer = 0;
        this.lastSafe.copy(this.feet);
      }
    }
  }

  private moveCapsule(dt: number, walking = false): RAPIER_NS.Vector {
    _move.x = this.velocity.x * dt;
    _move.y = this.velocity.y * dt;
    _move.z = this.velocity.z * dt;
    const ignore = this.ignoreCollider;
    const flags = this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS;
    const filter = ignore ? (c: RAPIER_NS.Collider) => c.handle !== ignore.handle : undefined;
    this.controller.computeColliderMovement(this.collider, _move, flags, GROUPS.player, filter);
    let m = this.controller.computedMovement();
    // Seam snag: on the flat deck trimesh the controller now and then reports a toi = 0 hit with a
    // ground triangle (normal up) and returns no horizontal movement for that step (≈ once a second
    // while walking); the velocity clamp in fixedUpdate would then stop the player dead and make
    // walking stutter. When every contact is ground-like, retry once 1 cm higher; snap-to-ground
    // puts the capsule straight back down. Walls and steps (non-vertical normals) are untouched.
    const want = Math.hypot(_move.x, _move.z);
    if (walking && want > 0.005 && Math.hypot(m.x, m.z) < want * 0.5 && this.onlyGroundContacts()) {
      _retry.x = _move.x;
      _retry.y = Math.max(_move.y, 0) + 0.01;
      _retry.z = _move.z;
      this.controller.computeColliderMovement(this.collider, _retry, flags, GROUPS.player, filter);
      m = this.controller.computedMovement();
    }
    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    this.body.setNextKinematicTranslation(next);
    this.feet.set(next.x, next.y - CAPSULE_CENTER, next.z);
    return m;
  }

  /** True when the last controller step touched only ground-like surfaces (|normal.y| > 0.9). */
  private onlyGroundContacts(): boolean {
    const c = this.controller;
    const n = c.numComputedCollisions();
    if (!n) return false;
    for (let i = 0; i < n; i++) {
      const hit = c.computedCollision(i);
      if (!hit || Math.abs(hit.normal1.y) < 0.9) return false;
    }
    return true;
  }

  private fixedFlight(dt: number): void {
    const f = this.flight!;
    f.v.y -= f.g * dt;
    this.velocity.copy(f.v);
    const m = this.moveCapsule(dt);
    const horiz = Math.hypot(f.v.x, f.v.z);
    const blocked = horiz > 1 && Math.hypot(m.x, m.z) < horiz * dt * 0.3;
    const grounded = this.controller.computedGrounded();
    if ((grounded && f.v.y <= 0) || blocked) {
      this.flight = null;
      this.velocity.set(0, 0, 0);
      this.grounded = grounded;
      this.fallSpeed = Math.max(6, -f.v.y);
      this.onLanded();
      try {
        f.onLand?.();
      } catch (err) {
        console.error('[player] onLand threw', err);
      }
    }
  }

  private onLanded(): void {
    if (this.fallSpeed > 4.5) {
      this.landVel -= Math.min(this.fallSpeed * 0.045, 0.6);
      this.audio.play('land', { volume: Math.min(1.2, this.fallSpeed / 10) });
    }
    this.fallSpeed = 0;
  }

  get lastSafePosition(): THREE.Vector3 {
    return this.lastSafe;
  }

  /** Render frame: interpolate, apply head bob / landing / shake / FOV, write the camera. */
  updateCamera(alpha: number, dt: number, active: boolean): void {
    this.renderFeet.lerpVectors(this.prevFeet, this.feet, alpha);
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    const reduced = this.reducedMotion;

    // head bob & footsteps (distance based)
    const bobOn = this.settings.data.headBob && !reduced;
    const moving = this.grounded && hs > 0.6 && active && !this.flight;
    const strideLen = this.sprinting ? 1.0 : 0.76;
    if (moving) {
      this.stepDist += hs * dt;
      if (this.stepDist >= strideLen) {
        this.stepDist -= strideLen;
        this.stepIndex++;
        this.audio.step(this.surface, this.sprinting ? 1.25 : 0.85);
      }
    }
    const targetAmp = moving && bobOn ? (this.sprinting ? 0.05 : 0.032) * Math.min(1, hs / WALK) * this.headBobScale : 0;
    this.bobAmp += (targetAmp - this.bobAmp) * (1 - Math.exp(-dt * 10));
    const tStep = this.stepDist / strideLen;
    const bobY = -this.bobAmp * (1 + Math.cos(2 * Math.PI * tStep)) * 0.5;
    const swayX = this.bobAmp * 0.45 * Math.sin(Math.PI * (tStep + (this.stepIndex % 2)));

    // landing spring
    this.landVel += (-160 * this.landOffset - 18 * this.landVel) * dt;
    this.landOffset += this.landVel * dt;
    if (reduced) this.landOffset *= 0.3;

    const cam = this.camera;
    _euler.set(this.pitch, this.yaw, reduced ? 0 : this.roll, 'YXZ');
    cam.quaternion.setFromEuler(_euler);
    cam.position.set(this.renderFeet.x, this.renderFeet.y + EYE_HEIGHT + bobY + this.landOffset, this.renderFeet.z);
    if (swayX !== 0) {
      cam.position.x += Math.cos(this.yaw) * swayX;
      cam.position.z -= Math.sin(this.yaw) * swayX;
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.min(1, Math.max(0, this.shakeTime) * 8);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }

    // operate mode / scripted camera
    const ov = this.cameraOverride;
    if (ov && ov.blend > 0) {
      cam.position.lerp(_p.copy(ov.position), ov.blend);
      cam.quaternion.slerp(_q.copy(ov.quaternion), ov.blend);
      // keep the island's roll (gusts, the finale's F1 tilt) in operate / scripted views too
      if (!reduced && this.roll !== 0) cam.rotateZ(this.roll * ov.blend);
    }

    // FOV: sprint kick + flight kick
    // small kicks (QA-16): sprint +3°, jump-pad flight +4°
    const fovTarget = (this.sprinting && hs > WALK + 0.5 ? 3 : 0) + (this.flight ? 4 : 0);
    this.fovKick += (fovTarget - this.fovKick) * (1 - Math.exp(-dt * 6));
    const fov = this.settings.data.fov + (reduced ? 0 : this.fovKick);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Horizontal speed (m/s) */
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Detect the surface under the player for footstep sounds (call ~5×/s). */
  probeSurface(): void {
    const R = this.physics.R;
    const t = this.body.translation();
    const ray = new R.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
    const hit = this.physics.world.castRay(ray, CAPSULE_CENTER + 0.4, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    if (!hit) return;
    const info = this.physics.infoOf(hit.collider);
    this.surface = info?.surface ?? 'concrete';
  }

  emitRespawn(reason: string): void {
    this.events.emit('player:respawn', { reason });
  }
}

function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(v + maxDelta, target);
  if (v > target) return Math.max(v - maxDelta, target);
  return v;
}
