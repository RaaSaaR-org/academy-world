/**
 * Instanced shell shards + yolk droplets (2 draw calls for the whole zone, stations B and C share
 * the pools). Simple ballistic integration with a floor bounce; a time scale drives the 0.25×
 * slow-motion replay. No allocations per frame.
 */
import * as THREE from 'three';
import { COL, type Ctx } from './shared';

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  w: number;
  s: number;
  floor: number;
  life: number; // seconds left (Infinity = stays)
  alive: boolean;
}

const MAX_SHARDS = 96;
const MAX_DROPS = 48;

export class Shards {
  private shards: InstancedMesh2;
  private drops: InstancedMesh2;
  private sp: P[] = [];
  private dp: P[] = [];
  private nextS = 0;
  private nextD = 0;
  timeScale = 1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly col = new THREE.Color();

  constructor(ctx: Ctx, parent: THREE.Object3D) {
    const M = ctx.materials;
    // a slightly curved triangular chip
    const chip = new THREE.BufferGeometry();
    chip.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 1, 0, 0, -0.5, 0.87, 0, -0.5, -0.87, 0], 3));
    chip.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]);
    chip.computeVertexNormals();
    this.shards = new THREE.InstancedMesh(chip, M.standard({ color: 0xffffff, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }), MAX_SHARDS) as InstancedMesh2;
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), M.standard({ color: COL.yolk, roughness: 0.25, metalness: 0 }), MAX_DROPS) as InstancedMesh2;
    for (const im of [this.shards, this.drops]) {
      im.frustumCulled = false;
      im.count = 0;
      parent.add(im);
    }
    for (let i = 0; i < MAX_SHARDS; i++) this.sp.push(blank());
    for (let i = 0; i < MAX_DROPS; i++) this.dp.push(blank());
    this.zero(this.shards, MAX_SHARDS);
    this.zero(this.drops, MAX_DROPS);
  }

  private zero(im: InstancedMesh2, n: number): void {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) im.setMatrixAt(i, this.m);
    im.instanceMatrix.needsUpdate = true;
  }

  /** egg / glass burst at a local point */
  burst(o: { x: number; y: number; z: number; count: number; size: number; speed: number; floor: number; color?: number; yolk?: number; life?: number; spreadX?: number }): void {
    const life = o.life ?? Infinity;
    this.col.setHex(o.color ?? 0xe9e2d6);
    for (let i = 0; i < o.count; i++) {
      const k = this.nextS;
      this.nextS = (this.nextS + 1) % MAX_SHARDS;
      const p = this.sp[k];
      const a = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random() * 0.9;
      const sp = o.speed * (0.4 + Math.random() * 0.8);
      Object.assign(p, {
        x: o.x + (Math.random() - 0.5) * 0.02,
        y: o.y + (Math.random() - 0.5) * 0.02,
        z: o.z + (Math.random() - 0.5) * 0.02,
        vx: Math.cos(a) * sp * (o.spreadX ?? 1),
        vy: up * o.speed,
        vz: Math.sin(a) * sp * 0.6,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        w: (Math.random() - 0.5) * 30,
        s: o.size * (0.5 + Math.random() * 0.8),
        floor: o.floor,
        life,
        alive: true,
      });
      this.shards.setColorAt(k, this.col);
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
    for (let i = 0; i < (o.yolk ?? 0); i++) {
      const k = this.nextD;
      this.nextD = (this.nextD + 1) % MAX_DROPS;
      const p = this.dp[k];
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * 0.5 * Math.random();
      Object.assign(p, {
        x: o.x,
        y: o.y - 0.005,
        z: o.z,
        vx: Math.cos(a) * sp,
        vy: o.speed * 0.25 * Math.random(),
        vz: Math.sin(a) * sp * 0.6,
        rx: 0,
        ry: 0,
        w: 0,
        s: o.size * (0.35 + Math.random() * 0.5),
        floor: o.floor,
        life,
        alive: true,
      });
    }
    this.shards.count = MAX_SHARDS;
    this.drops.count = MAX_DROPS;
  }

  /** hide everything (new egg) */
  clear(): void {
    for (const p of this.sp) p.alive = false;
    for (const p of this.dp) p.alive = false;
    this.zero(this.shards, MAX_SHARDS);
    this.zero(this.drops, MAX_DROPS);
    this.shards.count = 0;
    this.drops.count = 0;
  }

  /** remove only particles near a point (e.g. station C keeps its own) */
  clearNear(x: number, z: number, r: number): void {
    for (const p of this.sp) if (p.alive && Math.hypot(p.x - x, p.z - z) < r) p.alive = false;
    for (const p of this.dp) if (p.alive && Math.hypot(p.x - x, p.z - z) < r) p.alive = false;
  }

  update(dtReal: number): void {
    if (this.shards.count === 0 && this.drops.count === 0) return;
    const dt = Math.min(0.05, dtReal) * this.timeScale;
    let any = false;
    const step = (arr: P[], im: InstancedMesh2, flat: boolean): void => {
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p.alive) {
          this.m.makeScale(0, 0, 0);
          im.setMatrixAt(i, this.m);
          continue;
        }
        any = true;
        p.life -= dtReal;
        if (p.life <= 0) p.alive = false;
        p.vy -= 9.81 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < p.floor) {
          p.y = p.floor;
          p.vy = Math.abs(p.vy) > 0.15 ? -p.vy * 0.22 : 0;
          p.vx *= 0.55;
          p.vz *= 0.55;
          p.w *= 0.5;
        }
        p.rx += p.w * dt;
        p.ry += p.w * 0.7 * dt;
        const fade = p.life < 0.4 ? Math.max(0, p.life / 0.4) : 1;
        const s = p.s * fade;
        if (flat && p.y <= p.floor + 1e-4) this.sc.set(s * 1.6, s * 0.25, s * 1.6);
        else this.sc.set(s, s, s);
        this.e.set(flat ? 0 : p.rx, flat ? 0 : p.ry, 0);
        this.m.compose(this.v.set(p.x, p.y + (flat ? s * 0.2 : 0), p.z), this.q.setFromEuler(this.e), this.sc);
        im.setMatrixAt(i, this.m);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    step(this.sp, this.shards, false);
    step(this.dp, this.drops, true);
    if (!any) {
      this.shards.count = 0;
      this.drops.count = 0;
    }
  }
}

type InstancedMesh2 = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;

function blank(): P {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, w: 0, s: 0, floor: 0, life: 0, alive: false };
}
