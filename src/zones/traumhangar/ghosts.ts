/**
 * The dream made visible (plan §4.8): teal ghosts of the next seconds — skinned clones of the real
 * robot at its articulated LOD2 in one transparent teal material (ctx.robots.ghost, compiled at boot),
 * the K dreamt root paths as one line draw, the dreamt objects (rover, box, crates) as one instanced
 * draw. Ghosts near the camera fade out (the head camera would otherwise look through a teal wall: the
 * spike's finding); far ones stay readable. Under reduced motion the trails are not drawn.
 */
import * as THREE from 'three';
import type { RobotModel, ZoneContext } from '@/core/zones';
import { DREAM, ROBOT_ID, type RosterKey } from './tuning';

export interface GhostPose {
  x: number;
  z: number;
  /** heading (rad, 0 = +z) */
  head: number;
  /** extra opacity factor 0…1 (the blur of a long dream, a fading memory) */
  alpha?: number;
}

export interface GhostObject {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

const MAX_SEG = 900;
const MAX_OBJ = 16;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Ghosts {
  private pool: { key: RosterKey; model: RobotModel; mat: THREE.MeshStandardMaterial; alpha: number }[] = [];
  private poolKey: RosterKey | null = null;
  private loading: Promise<void> | null = null;
  readonly trails: THREE.LineSegments;
  readonly objects: THREE.InstancedMesh;
  private readonly trailMat: THREE.LineBasicMaterial;
  private readonly objMat: THREE.MeshBasicMaterial;
  /** 0…1 fade of the whole dream (in on show, out on hide) */
  private fade = 0;
  private fadeTarget = 0;
  /** seconds left before the ghosts hide by themselves (0 = held) */
  private holdS = 0;
  shown = false;
  /** how many ghost robots are placed now */
  count = 0;

  constructor(
    private ctx: ZoneContext,
    private yawOffset: (k: RosterKey) => number,
  ) {
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SEG * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setDrawRange(0, 0);
    this.trailMat = new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.75, depthWrite: false });
    this.trails = new THREE.LineSegments(tg, this.trailMat);
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 7;
    this.trails.name = 'traum:dream-trails';
    // hidden until a dream shows: the area's warm-up compiles hidden objects too (no link when it shows)
    this.trails.visible = false;
    const og = new THREE.BoxGeometry(1, 1, 1);
    this.objMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.26, depthWrite: false });
    this.objects = new THREE.InstancedMesh(og, this.objMat, MAX_OBJ);
    this.objects.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.objects.count = 0;
    this.objects.frustumCulled = false;
    this.objects.renderOrder = 7;
    this.objects.visible = false;
    this.objects.name = 'traum:dream-objects';
    ctx.groups.detail.add(this.trails, this.objects);
    ctx.onDispose(() => {
      tg.dispose();
      og.dispose();
      this.trailMat.dispose();
      this.objMat.dispose();
      for (const g of this.pool) g.mat.dispose();
    });
  }

  /** Load the five ghost clones of a robot (its GLB is in by then: no fetch, no program link). */
  prepare(k: RosterKey): Promise<void> {
    if (this.poolKey === k && this.pool.length) return Promise.resolve();
    if (this.loading && this.poolKey === k) return this.loading;
    for (const g of this.pool) {
      g.model.dispose();
      g.mat.dispose();
    }
    this.pool = [];
    this.poolKey = k;
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < DREAM.k; i++)
      jobs.push(
        this.ctx.robots.load(ROBOT_ID[k], { lod: 2, castShadow: false, priority: 'now' }).then((model) => {
          if (this.poolKey !== k) {
            model.dispose();
            return;
          }
          const mat = this.ctx.robots.ghost.clone();
          model.object.traverse((o) => {
            if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
              (o as THREE.SkinnedMesh).material = mat;
              o.castShadow = false;
              o.renderOrder = 8;
            }
          });
          model.lod = 2;
          model.object.visible = false;
          model.object.name = `traum:ghost-${k}-${i}`;
          this.ctx.groups.detail.add(model.object);
          this.pool.push({ key: k, model, mat, alpha: 1 });
        }),
      );
    this.loading = Promise.all(jobs).then(() => undefined);
    return this.loading;
  }

  get ready(): boolean {
    return this.pool.length >= DREAM.k;
  }

  /**
   * Show a dream: ghost robots at `poses` (in the pose `joints`, e.g. the real robot's walking pose),
   * the K paths (`trails`: x, z pairs) and the dreamt objects. `holdS` 0 keeps them until hide().
   */
  show(k: RosterKey, poses: GhostPose[], joints: Record<string, number> | null, trails: { pts: ArrayLike<number>; n: number }[], objects: GhostObject[], o: { holdS?: number; y?: number } = {}): void {
    if (this.poolKey !== k) void this.prepare(k);
    const y = o.y ?? 0;
    this.count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const g = this.pool[i];
      const p = poses[i];
      if (!p) {
        this.vis(g, false);
        continue;
      }
      if (joints) g.model.setPose(joints);
      g.model.object.position.set(p.x, y, p.z);
      g.model.object.rotation.set(0, p.head - this.yawOffset(k), 0);
      g.alpha = p.alpha ?? 1;
      this.vis(g, true);
      this.count++;
    }
    // trails (not under reduced motion: ghosts without motion trails)
    const pos = this.trails.geometry.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    if (!this.ctx.settings.reducedMotion)
      for (const t of trails)
        for (let i = 1; i < t.n && n < MAX_SEG * 2 - 2; i++) {
          pos.setXYZ(n++, t.pts[(i - 1) * 2], y + 0.035, t.pts[(i - 1) * 2 + 1]);
          pos.setXYZ(n++, t.pts[i * 2], y + 0.035, t.pts[i * 2 + 1]);
        }
    pos.needsUpdate = true;
    this.trails.geometry.setDrawRange(0, n);
    this.trails.visible = n > 0;
    let m = 0;
    for (const ob of objects) {
      if (m >= MAX_OBJ) break;
      this.objects.setMatrixAt(m++, _m.compose(_p.set(ob.x, ob.y, ob.z), _q.identity(), _s.set(ob.hx * 2, ob.hy * 2, ob.hz * 2)));
    }
    this.objects.count = m;
    this.objects.instanceMatrix.needsUpdate = true;
    this.objects.visible = m > 0;
    this.shown = true;
    this.fadeTarget = 1;
    this.holdS = o.holdS ?? 0;
  }

  /** Fade the dream out (reality snaps back). */
  hide(instant = false): void {
    this.fadeTarget = 0;
    if (instant) {
      this.fade = 0;
      this.apply(null);
    }
  }

  /** Per frame: the fade, the hold timer, the distance fade near the camera (zone-local `cam`). */
  update(dt: number, cam: THREE.Vector3 | null): void {
    if (this.holdS > 0) {
      this.holdS -= dt;
      if (this.holdS <= 0) this.fadeTarget = 0;
    }
    if (this.fade !== this.fadeTarget) {
      const k = dt / 0.25;
      this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + k) : Math.max(this.fadeTarget, this.fade - k);
    }
    this.apply(cam);
  }

  /** Show or hide one ghost clone (it stays in the scene graph: re-adding objects costs more than it saves). */
  private vis(g: { model: { object: THREE.Object3D } }, on: boolean): void {
    g.model.object.visible = on;
  }

  private apply(cam: THREE.Vector3 | null): void {
    const on = this.fade > 0.001;
    for (const g of this.pool) {
      if (!g.model.object.visible && on) continue;
      let a: number = DREAM.ghostFar;
      if (cam) {
        const d = _c.copy(g.model.object.position).setY(cam.y).distanceTo(cam);
        a = THREE.MathUtils.lerp(DREAM.ghostNear, DREAM.ghostFar, THREE.MathUtils.smoothstep(d, DREAM.ghostFadeFrom, DREAM.ghostFadeTo));
      }
      g.mat.opacity = a * g.alpha * this.fade;
      if (!on) this.vis(g, false);
    }
    this.trailMat.opacity = 0.75 * this.fade;
    this.objMat.opacity = 0.26 * this.fade;
    if (!on) {
      this.shown = false;
      this.trails.geometry.setDrawRange(0, 0);
      this.trails.visible = false;
      this.objects.count = 0;
      this.objects.visible = false;
    }
  }

  dispose(): void {
    for (const g of this.pool) {
      g.model.dispose();
      g.mat.dispose();
    }
    this.pool = [];
    this.poolKey = null;
  }
}
