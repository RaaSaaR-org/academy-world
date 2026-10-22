/**
 * Discover's camera (WP-D0, plan §3.2, §4): rigs (orbit / look) moved by one finger with inertia and
 * pinch zoom within limits, flights between stops (a lifted cubic Bézier, ease in-out, no roll; a 0.4 s
 * cross-fade under reduced motion) and the start card's slow orbit. It writes game.camera through
 * game.cameraDriver each frame and then places the observer.
 */
import * as THREE from 'three';
import type { Game } from '@/core/Game';
import type { CameraPose, CameraRig, DiscoverCamera, DiscoverUi, FlyOptions, RigLimits, Vec3 } from './types';
import type { ObserverImpl } from './observer';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** View direction of yaw / pitch (degrees; yaw 0 = −Z, +90 = −X; pitch + up), as __academy.look. */
export function dirOf(yawDeg: number, pitchDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const y = yawDeg * D2R,
    p = pitchDeg * D2R;
  return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
}

function anglesOf(dx: number, dy: number, dz: number): { yawDeg: number; pitchDeg: number; d: number } {
  const d = Math.hypot(dx, dy, dz) || 1;
  return { yawDeg: Math.atan2(-dx, -dz) * R2D, pitchDeg: Math.asin(THREE.MathUtils.clamp(dy / d, -1, 1)) * R2D, d };
}

/** An orbit rig whose camera sits at `eye` looking at `target` (e.g. outsideCamera('C1', 0, 24)). */
export function orbitFrom(eye: Vec3, target: Vec3, o: { limits?: RigLimits; fovDeg?: number } = {}): CameraRig {
  const a = anglesOf(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
  return { kind: 'orbit', target, distance: a.d, yawDeg: a.yawDeg, pitchDeg: a.pitchDeg, ...o };
}

/** A look rig at `eye` facing `target`. */
export function lookFrom(eye: Vec3, target: Vec3, o: { limits?: RigLimits; fovDeg?: number } = {}): CameraRig {
  const a = anglesOf(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
  return { kind: 'look', eye, yawDeg: a.yawDeg, pitchDeg: a.pitchDeg, ...o };
}

/** The field of view Discover uses when a rig names none: wider in portrait. */
export function defaultFov(aspect: number): number {
  return aspect < 1 ? 68 : 55;
}

const wrap = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;
const ease = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp(t, 0, 1));

interface Flight {
  t: number;
  dur: number;
  pos: (s: number) => THREE.Vector3;
  yaw0: number;
  dYaw: number;
  pitch0: number;
  dPitch: number;
  fov0: number;
  rig: CameraRig;
  done: () => void;
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class CameraImpl implements DiscoverCamera {
  rig: CameraRig | null = null;
  attached = false;
  /** the start card's slow orbit (deg/s; off under reduced motion) */
  drift = 0;
  private kind: 'orbit' | 'look' = 'look';
  private readonly target = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private dist = 10;
  /** the user's pinch on a look rig (fov × this) */
  private zoom = 1;
  private vYaw = 0;
  private vPitch = 0;
  private flight: Flight | null = null;
  private readonly drive = (dt: number): void => this.update(dt);

  constructor(
    private game: Game,
    private observer: ObserverImpl,
    private ui: DiscoverUi,
    private reduced: () => boolean,
    private heightAt: (x: number, z: number) => number | null,
  ) {}

  get flying(): boolean {
    return !!this.flight;
  }

  attach(): void {
    this.attached = true;
    this.game.cameraDriver = this.drive;
    this.observer.resume();
  }

  detach(): void {
    this.attached = false;
    this.game.cameraDriver = null;
    this.observer.suspend();
  }

  setRig(rig: CameraRig): void {
    this.endFlight();
    this.rig = rig;
    this.apply(rig);
    this.write();
  }

  reset(): void {
    if (!this.rig || this.flight) return;
    if (this.reduced()) this.setRig(this.rig);
    else void this.flyTo(this.rig, { seconds: 0.6 });
  }

  pose(): CameraPose {
    const c = this.game.camera;
    c.getWorldDirection(_d);
    return { eye: c.position.toArray() as unknown as Vec3, target: c.position.clone().addScaledVector(_d, 10).toArray() as unknown as Vec3, fovDeg: c.fov };
  }

  fitDistance(radius: number, fovDeg?: number): number {
    const v = ((fovDeg ?? this.fovNow()) * D2R) / 2;
    const h = Math.atan(Math.tan(v) * this.game.camera.aspect);
    return radius / Math.sin(Math.max(1e-3, Math.min(v, h)));
  }

  async flyTo(rig: CameraRig, o: FlyOptions = {}): Promise<void> {
    this.endFlight();
    if (this.reduced()) {
      await this.ui.fade(true, 0.4);
      this.setRig(rig);
      await this.ui.fade(false, 0.4);
      return;
    }
    const p0 = this.game.camera.position.clone();
    const end = this.eyeOf(rig, new THREE.Vector3());
    const pts = [p0, ...(o.via ?? []).map((v) => new THREE.Vector3(...v)), end];
    // the first leg is a lifted Bézier, the rest straight (the last segment into a door stays level)
    const a = pts[0],
      b = pts[1];
    const horiz = Math.hypot(b.x - a.x, b.z - a.z);
    const lift = Math.max(a.y, b.y) + Math.max(0.35 * horiz, horiz > 150 ? 70 : 0);
    const c = (8 * lift - a.y - b.y) / 6;
    const c1 = a.clone().lerp(b, 1 / 3).setY(Math.max(c, a.y));
    const c2 = a.clone().lerp(b, 2 / 3).setY(Math.max(c, b.y));
    const bez = (u: number, out: THREE.Vector3): THREE.Vector3 => {
      const v = 1 - u;
      out.set(0, 0, 0).addScaledVector(a, v * v * v).addScaledVector(c1, 3 * v * v * u).addScaledVector(c2, 3 * v * u * u).addScaledVector(b, u * u * u);
      // stay ≥ 15 m above the terrain away from the ends (not on a short hop: inside a hall, out of its door)
      const g = horiz > 30 ? this.heightAt(out.x, out.z) : null;
      if (g != null && out.y < g + 15) out.y = THREE.MathUtils.lerp(out.y, g + 15, Math.sin(Math.PI * u));
      return out;
    };
    // arc lengths: 32 samples on the curve, then the straight legs
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) samples.push(bez(i / 32, new THREE.Vector3()));
    const legs: { from: THREE.Vector3; to: THREE.Vector3; len: number }[] = [];
    for (let i = 0; i < 32; i++) legs.push({ from: samples[i], to: samples[i + 1], len: samples[i].distanceTo(samples[i + 1]) });
    for (let i = 1; i < pts.length - 1; i++) legs.push({ from: pts[i], to: pts[i + 1], len: pts[i].distanceTo(pts[i + 1]) });
    const total = legs.reduce((s, l) => s + l.len, 0);
    const pos = (s: number): THREE.Vector3 => {
      let d = s * total;
      for (const l of legs) {
        if (d <= l.len || l === legs[legs.length - 1]) return _v.copy(l.from).lerp(l.to, l.len ? Math.min(1, d / l.len) : 1);
        d -= l.len;
      }
      return _v.copy(end);
    };
    const dur = o.seconds ?? THREE.MathUtils.clamp(total / 60, 2.5, 6);
    const yawEnd = rig.yawDeg;
    return new Promise((resolve) => {
      this.flight = {
        t: 0,
        dur,
        pos,
        yaw0: this.yaw,
        dYaw: wrap(yawEnd - this.yaw),
        pitch0: this.pitch,
        dPitch: rig.pitchDeg - this.pitch,
        fov0: this.fovNow(),
        rig,
        done: resolve,
      };
      this.vYaw = this.vPitch = 0;
    });
  }

  // ── gestures (touch.ts) ──

  drag(dx: number, dy: number, hPx: number): void {
    if (this.flight || !this.rig) return;
    const [ky, kp] = this.gain(hPx);
    this.yaw += dx * ky;
    this.pitch += dy * kp;
    this.clamp();
  }

  release(vx: number, vy: number, hPx: number): void {
    if (this.flight || !this.rig || this.reduced()) return;
    const [ky, kp] = this.gain(hPx);
    this.vYaw = vx * ky;
    this.vPitch = vy * kp;
  }

  pinch(scale: number): void {
    if (this.flight || !this.rig || !(scale > 0)) return;
    const L = this.rig.limits;
    if (this.kind === 'orbit' && this.rig.kind === 'orbit') {
      const [lo, hi] = L?.distance ?? [this.rig.distance * 0.5, this.rig.distance * 2];
      this.dist = THREE.MathUtils.clamp(this.dist / scale, lo, hi);
    } else {
      const base = this.baseFov();
      const [lo, hi] = L?.fovDeg ?? [25, base + 15];
      this.zoom = THREE.MathUtils.clamp((base * this.zoom) / scale, lo, hi) / base;
    }
  }

  /** deg per px: orbit turns ~160° over the screen height (drag right turns the object right), look follows the finger */
  private gain(hPx: number): [number, number] {
    if (this.kind === 'orbit') {
      const k = 160 / Math.max(200, hPx);
      return [-k, -k];
    }
    const k = this.fovNow() / Math.max(200, hPx);
    return [k, k];
  }

  // ── per frame ──

  update(dt: number): void {
    const f = this.flight;
    if (f) {
      f.t += dt;
      const s = Math.min(1, f.t / f.dur);
      const e = ease(s);
      this.eye.copy(f.pos(e));
      this.yaw = f.yaw0 + f.dYaw * e;
      this.pitch = f.pitch0 + f.dPitch * e;
      this.writeRaw(this.eye, THREE.MathUtils.lerp(f.fov0, f.rig.fovDeg ?? defaultFov(this.game.camera.aspect), e));
      if (s >= 1) {
        this.flight = null;
        this.rig = f.rig;
        this.apply(f.rig);
        this.write();
        f.done();
      }
      return;
    }
    if (this.vYaw || this.vPitch) {
      this.yaw += this.vYaw * dt;
      this.pitch += this.vPitch * dt;
      const k = Math.exp(-dt / 0.28);
      this.vYaw = Math.abs(this.vYaw * k) < 0.5 ? 0 : this.vYaw * k;
      this.vPitch = Math.abs(this.vPitch * k) < 0.5 ? 0 : this.vPitch * k;
      this.clamp();
    }
    if (this.drift && !this.reduced()) this.yaw = wrap(this.yaw + this.drift * dt);
    this.write();
  }

  private apply(rig: CameraRig): void {
    this.kind = rig.kind;
    this.yaw = rig.yawDeg;
    this.pitch = rig.pitchDeg;
    this.zoom = 1;
    this.vYaw = this.vPitch = 0;
    if (rig.kind === 'orbit') {
      this.target.set(...rig.target);
      this.dist = rig.distance;
    } else this.eye.set(...rig.eye);
  }

  private eyeOf(rig: CameraRig, out: THREE.Vector3): THREE.Vector3 {
    if (rig.kind === 'look') return out.set(...rig.eye);
    return out.set(...rig.target).addScaledVector(dirOf(rig.yawDeg, rig.pitchDeg, _d), -rig.distance);
  }

  private clamp(): void {
    const L = this.rig?.limits;
    const pl = L?.pitchDeg ?? (this.kind === 'orbit' ? [-85, 10] : [-70, 60]);
    this.pitch = THREE.MathUtils.clamp(this.pitch, pl[0], pl[1]);
    if (L?.yawDeg) {
      const y = THREE.MathUtils.clamp(this.yaw, L.yawDeg[0], L.yawDeg[1]);
      if (y !== this.yaw) this.vYaw = 0;
      this.yaw = y;
    } else this.yaw = wrap(this.yaw);
  }

  private baseFov(): number {
    return this.rig?.fovDeg ?? defaultFov(this.game.camera.aspect);
  }

  private fovNow(): number {
    return this.kind === 'look' ? this.baseFov() * this.zoom : this.baseFov();
  }

  private write(): void {
    if (this.kind === 'orbit') this.eye.copy(this.target).addScaledVector(dirOf(this.yaw, this.pitch, _d), -this.dist);
    this.writeRaw(this.eye, this.fovNow());
  }

  private writeRaw(eye: THREE.Vector3, fov: number): void {
    const cam = this.game.camera;
    cam.position.copy(eye);
    _e.set(this.pitch * D2R, this.yaw * D2R, 0, 'YXZ');
    cam.quaternion.setFromEuler(_e);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.observer.update(cam.position);
  }

  private endFlight(): void {
    const f = this.flight;
    this.flight = null;
    f?.done();
  }
}
