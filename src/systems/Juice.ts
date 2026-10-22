import * as THREE from 'three';

const MAX = 256;
const TONES: Record<'orange' | 'teal' | 'stone', THREE.Color[]> = {
  // linear-space colours, slightly varied per particle; teal is the success default (brand: orange stays rare)
  teal: [new THREE.Color(0x2dd4bf), new THREE.Color(0x5eead4), new THREE.Color(0x99f6e4)],
  orange: [new THREE.Color(0xff6700), new THREE.Color(0xff8534), new THREE.Color(0xffa366)],
  stone: [new THREE.Color(0xe7e5e4), new THREE.Color(0xa8a29e), new THREE.Color(0xd6d3d1)],
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Engine-wide particle bursts (ctx.game.juice.burst): ONE pooled InstancedMesh of ≤ 256 small
 * octahedra, one draw call, invisible (0 calls) when no particle is alive. No allocation per frame:
 * state lives in typed arrays; the oldest particle is overwritten when the pool is full.
 */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private rot = new Float32Array(MAX * 3);
  private age = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private next = 0;
  private alive = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, name: 'core:juice-particles' });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.name = 'core:juice';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _m.makeScale(0, 0, 0);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, white);
    }
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Spawn a burst at a WORLD point. reducedMotion: a static 150 ms ring instead of flying debris. */
  burst(at: THREE.Vector3, o: { tone?: 'orange' | 'teal' | 'stone'; count?: number; spread?: number; reducedMotion?: boolean } = {}): void {
    const tone = TONES[o.tone ?? 'teal'] ?? TONES.teal;
    const count = Math.max(1, Math.min(96, Math.round(o.count ?? 28)));
    const spread = Math.max(0.1, o.spread ?? 1);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      if (this.age[i] >= this.life[i]) this.alive++;
      const i3 = i * 3;
      if (o.reducedMotion) {
        const a = (n / count) * Math.PI * 2;
        this.pos[i3] = at.x + Math.cos(a) * 0.45 * spread;
        this.pos[i3 + 1] = at.y;
        this.pos[i3 + 2] = at.z + Math.sin(a) * 0.45 * spread;
        this.vel[i3] = this.vel[i3 + 1] = this.vel[i3 + 2] = 0;
        this.grav[i] = 0;
        this.life[i] = 0.15;
        this.size[i] = 0.035 * Math.sqrt(spread);
      } else {
        // upward-biased sphere: reads as "pop", falls back under gravity
        const u = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        const sp = (1.6 + Math.random() * 2.6) * spread;
        this.pos[i3] = at.x;
        this.pos[i3 + 1] = at.y;
        this.pos[i3 + 2] = at.z;
        this.vel[i3] = r * Math.cos(th) * sp;
        this.vel[i3 + 1] = (Math.abs(u) * 0.9 + 0.5) * sp;
        this.vel[i3 + 2] = r * Math.sin(th) * sp;
        this.grav[i] = 7.5;
        this.life[i] = 0.55 + Math.random() * 0.5;
        this.size[i] = (0.03 + Math.random() * 0.035) * Math.sqrt(spread);
      }
      this.rot[i3] = Math.random() * 6.28;
      this.rot[i3 + 1] = Math.random() * 6.28;
      this.rot[i3 + 2] = Math.random() * 6.28;
      this.age[i] = 0;
      this.mesh.setColorAt(i, tone[n % tone.length]);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const life = this.life[i];
      if (this.age[i] >= life) continue;
      this.age[i] += dt;
      const i3 = i * 3;
      if (this.age[i] >= life) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      alive++;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      // light air drag
      const drag = 1 - Math.min(1, 1.6 * dt);
      this.vel[i3] *= drag;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.rot[i3] += dt * 7;
      this.rot[i3 + 1] += dt * 5;
      const k = this.age[i] / life;
      const sc = this.size[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      _p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      _q.setFromEuler(_e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]));
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = alive;
    if (alive === 0) this.mesh.visible = false;
  }

  get activeCount(): number {
    return this.alive;
  }
}
