/**
 * PVC strip curtains (Schleuse ×2, darkroom doors ×2): one InstancedMesh. Strips near the player
 * swing in the direction of motion and settle with a damped spring. No colliders, invisible to
 * the sensors (the strips are thin, the laser threads the gaps).
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import type { Visor } from './visor';

interface Strip {
  top: THREE.Vector3;
  a: THREE.Vector3; // along the curtain
  n: THREE.Vector3; // curtain normal
  q0: THREE.Quaternion;
  w: number;
  h: number;
  angle: number;
  vel: number;
  centre: THREE.Vector3;
}

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0);

export class Curtains {
  private strips: Strip[] = [];
  private mesh: THREE.InstancedMesh | null = null;
  private last = new THREE.Vector3();
  private dir = 1;

  constructor(private ctx: ZoneContext) {}

  /** a curtain centred at (x, z) along unit vector (ax, az), `width` wide, hanging from `top` */
  add(x: number, z: number, ax: number, az: number, width: number, top: number): void {
    const n = Math.max(2, Math.round(width / 0.225));
    const w = width / n - 0.022;
    const phi = Math.atan2(-az, ax);
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), phi);
    const a = new THREE.Vector3(ax, 0, az);
    const nrm = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
    for (let i = 0; i < n; i++) {
      const off = -width / 2 + (i + 0.5) * (width / n);
      const t = new THREE.Vector3(x + ax * off, top, z + az * off);
      this.strips.push({ top: t, a, n: nrm, q0, w, h: top - 0.04, angle: 0, vel: 0, centre: t.clone().setY(top / 2) });
    }
  }

  build(parent: THREE.Object3D, visor: Visor): void {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
    // back-lit PVC strips (QA-02): light, slightly translucent, a warm glow from behind. Front faces only, at
    // the opacity of the two layers a double-sided strip showed (1 − 0.34²): one pass, so no back-face program
    // at the title (WP17: the warm-up cap)
    const mat = new THREE.MeshStandardMaterial({ name: 'sensordom:curtain', color: 0xb5afa9, emissive: 0xffe9cc, emissiveIntensity: 0.16, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.88, side: THREE.FrontSide });
    this.ctx.onDispose(() => mat.dispose());
    this.mesh = new THREE.InstancedMesh(g, mat, this.strips.length);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    for (let i = 0; i < this.strips.length; i++) this.write(i);
    this.mesh.instanceMatrix.needsUpdate = true;
    visor.register(this.mesh, { seg: 'struktur', lidar: 'hide' });
  }

  private write(i: number): void {
    const s = this.strips[i];
    _q.setFromAxisAngle(_X, s.angle);
    _q.premultiply(s.q0);
    _s.set(s.w, s.h, 0.012);
    _m.compose(s.top, _q, _s);
    this.mesh!.setMatrixAt(i, _m);
  }

  /** player feet in local coordinates */
  update(dt: number, feet: THREE.Vector3): void {
    if (!this.mesh) return;
    _p.subVectors(feet, this.last);
    this.last.copy(feet);
    let changed = false;
    for (let i = 0; i < this.strips.length; i++) {
      const s = this.strips[i];
      const dx = feet.x - s.centre.x,
        dz = feet.z - s.centre.z;
      const dn = dx * s.n.x + dz * s.n.z;
      const dl = dx * s.a.x + dz * s.a.z;
      let target = 0;
      if (Math.abs(dn) < 0.75 && Math.abs(dl) < 0.55 && feet.y < s.top.y) {
        const mv = _p.x * s.n.x + _p.z * s.n.z;
        if (Math.abs(mv) > 1e-4) this.dir = mv < 0 ? 1 : -1;
        target = this.dir * 1.0 * (1 - Math.abs(dl) / 0.55) * (1 - Math.abs(dn) / 0.75);
      }
      if (target === 0 && Math.abs(s.angle) < 1e-3 && Math.abs(s.vel) < 1e-3) continue;
      // damped spring toward the target
      const k = 60,
        c = 7;
      s.vel += (k * (target - s.angle) - c * s.vel) * Math.min(dt, 0.05);
      s.angle += s.vel * Math.min(dt, 0.05);
      this.write(i);
      changed = true;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
