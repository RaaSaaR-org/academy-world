import * as THREE from 'three';
import { GAIT } from './tuning';

const GRAV = 9.81;

/** One robot's gait numbers (tuning.ts ROBOTS) plus its measured step width. */
export interface GaitParams {
  vMax: number;
  vBack: number;
  wMax: number;
  freq: number;
  freqSlow: number;
  swingH: number;
  crouch: number;
  /** foot centre to centre (m), from the leg calibration (hip spacing × GAIT.widthOfHips) */
  width: number;
}

export interface Foot {
  /** sole position, zone-local (y = floor + lift) */
  readonly pos: THREE.Vector3;
  yaw: number;
  swing: boolean;
  /** swing progress 0…1 */
  s: number;
  readonly from: THREE.Vector3;
  fromYaw: number;
}

/**
 * Kinematic gait driven by velocity commands (plan §4.8: W/S speed, A/D turn), moved in from WP2's spike
 * and made per robot: the root (the floor point under the pelvis, zone-local) follows the command
 * through a traction model — the velocity can change by at most μ·g per second, μ from the floor under
 * the robot (reality: ice 0.05 slides on) — and the feet step around it: alternating swings of 1/f s,
 * landing at the root's predicted place at touchdown plus half the stance travel (Raibert), stance feet
 * glued to the floor (they glide only with the slip). A sideways push (a gust) adds to the root's
 * velocity. No whole-body physics (chip „Bewegung animiert, keine Ganzkörper-Physik“).
 */
export class Gait {
  readonly pos = new THREE.Vector3();
  /** heading (rad): rotation of the robot object about y */
  psi = 0;
  /** actual root velocity (zone-local xz, m/s) and yaw rate */
  readonly vel = new THREE.Vector3();
  omega = 0;
  /** slewed commands */
  v = 0;
  w = 0;
  readonly feet: [Foot, Foot];
  /** which foot swings next (0 left, 1 right) */
  private next = 0;
  /** lateral sway (m, + left) */
  sway = 0;
  /** the slip speed (m/s) between command and reality this frame */
  slip = 0;
  /** distance walked (m), for the step sound */
  walked = 0;
  /** a touchdown happened this update (step sound) */
  touchdown = false;
  private readonly _d = new THREE.Vector3();
  private readonly _t = new THREE.Vector3();

  constructor(
    /** the robot's forward and left axes in its own frame (from the leg calibration) */
    readonly fwd0: THREE.Vector3,
    readonly left0: THREE.Vector3,
    readonly p: GaitParams,
  ) {
    const mk = (): Foot => ({ pos: new THREE.Vector3(), yaw: 0, swing: false, s: 0, from: new THREE.Vector3(), fromYaw: 0 });
    this.feet = [mk(), mk()];
  }

  /** forward of the heading psi (zone-local) */
  heading(out: THREE.Vector3, psi = this.psi): THREE.Vector3 {
    return out.copy(this.fwd0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, psi);
  }
  /** left of the heading psi (zone-local) */
  side(out: THREE.Vector3, psi = this.psi): THREE.Vector3 {
    return out.copy(this.left0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, psi);
  }

  /** The heading that makes the robot face the zone-local direction (dx, dz). */
  psiFacing(dx: number, dz: number): number {
    return Math.atan2(dx, dz) - Math.atan2(this.fwd0.x, this.fwd0.z);
  }

  /** nominal stance position of a foot (0 left, 1 right) for a root position and heading */
  nominal(i: number, root: THREE.Vector3, psi: number, out: THREE.Vector3): THREE.Vector3 {
    return this.side(out, psi)
      .multiplyScalar(i === 0 ? this.p.width / 2 : -this.p.width / 2)
      .add(root)
      .setY(root.y);
  }

  place(root: THREE.Vector3, psi: number): void {
    this.pos.copy(root);
    this.psi = psi;
    this.vel.set(0, 0, 0);
    this.v = this.w = this.omega = 0;
    this.slip = 0;
    this.feet.forEach((f, i) => {
      this.nominal(i, root, psi, f.pos);
      f.yaw = psi;
      f.swing = false;
    });
  }

  /**
   * One step of the gait. `vCmd` (m/s) and `wCmd` (rad/s) come from the pilot (or an autopilot); `mu(x, z)`
   * is the floor's friction (reality); `push` an optional sideways acceleration (m/s², zone-local xz: a gust).
   */
  update(dt: number, vCmd: number, wCmd: number, mu: (x: number, z: number) => number, push: THREE.Vector3 | null = null): void {
    this.touchdown = false;
    if (dt <= 0) return;
    const P = this.p;
    // slew the commands
    this.v += THREE.MathUtils.clamp(vCmd - this.v, -GAIT.accel * dt, GAIT.accel * dt);
    this.w += THREE.MathUtils.clamp(wCmd - this.w, -GAIT.turnAccel * dt, GAIT.turnAccel * dt);
    // traction: the root velocity follows the command by at most μ·g·dt (ice: it slides on)
    const m = mu(this.pos.x, this.pos.z);
    const want = this.heading(this._d).multiplyScalar(this.v);
    const dv = this._t.copy(want).sub(this.vel);
    const lim = m * GRAV * dt;
    const n = dv.length();
    if (n > lim) dv.multiplyScalar(lim / n);
    this.vel.add(dv);
    if (push) this.vel.addScaledVector(push, dt);
    this.slip = want.distanceTo(this.vel);
    const wl = m * 12 * dt;
    this.omega += THREE.MathUtils.clamp(this.w - this.omega, -wl, wl);
    const step = this.vel.length() * dt;
    this.walked += step;
    this.pos.addScaledVector(this.vel, dt);
    this.psi += this.omega * dt;

    // stepping: a swing of 1/f s, alternating; idle when the command is ~0 and the feet are home
    const speed = Math.abs(this.v) + Math.abs(this.w) * 0.3 + this.slip * 0.5;
    const freq = THREE.MathUtils.lerp(P.freqSlow, P.freq, THREE.MathUtils.clamp(Math.abs(this.v) / P.vMax, 0, 1));
    const T = 1 / freq;
    const swinging = this.feet.find((f) => f.swing);
    // stance feet glide with the slip (on ice the whole robot slides)
    const slipV = this._t.copy(this.vel).sub(want);
    for (const f of this.feet) if (!f.swing && this.slip > 0.02) f.pos.addScaledVector(slipV, dt);
    if (!swinging) {
      const away = (i: number): number => this.feet[i].pos.distanceTo(this.nominal(i, this.pos, this.psi, this._d));
      if (speed > 0.04 || away(0) > 0.04 || away(1) > 0.04) this.startSwing(this.next);
    }
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (!f.swing) continue;
      f.s = Math.min(1, f.s + dt / T);
      // landing: where the root will be at touchdown, half the stance travel ahead (Raibert)
      const left = (1 - f.s) * T;
      const rootTd = this._t.copy(this.pos).addScaledVector(this.vel, left);
      const psiTd = this.psi + this.omega * left;
      const land = this.nominal(i, rootTd, psiTd, this._d).addScaledVector(this.vel, T * GAIT.raibert);
      const e = f.s * f.s * (3 - 2 * f.s);
      f.pos.lerpVectors(f.from, land, e);
      f.pos.y = this.pos.y + P.swingH * Math.sin(Math.PI * f.s);
      f.yaw = THREE.MathUtils.lerp(f.fromYaw, psiTd, e);
      if (f.s >= 1) {
        f.swing = false;
        f.pos.y = this.pos.y;
        this.next = 1 - i;
        this.touchdown = true;
      }
    }
    // the pelvis leans over the stance foot
    const sw = this.feet.findIndex((f) => f.swing);
    const target = sw < 0 ? 0 : (sw === 0 ? -1 : 1) * GAIT.sway * Math.sin(Math.PI * this.feet[sw].s);
    this.sway += (target - this.sway) * (1 - Math.exp(-dt * 10));
  }

  private startSwing(i: number): void {
    const f = this.feet[i];
    f.swing = true;
    f.s = 0;
    f.from.copy(f.pos);
    f.fromYaw = f.yaw;
  }
}
