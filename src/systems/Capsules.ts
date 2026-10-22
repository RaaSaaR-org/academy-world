import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX = 16;
const BODY_R = 0.13;

interface Capsule {
  id: string;
  owner: string;
  /** world centre */
  pos: THREE.Vector3;
  radius: number;
  slot: number;
  found: boolean;
  phase: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Sensorkapseln (docs/FUN-PLAN.md §3c): ≤ 16 instanced capsules (1 draw call) plus their glow rings
 * (1 draw call), both hidden when nothing is left to find. Pickup by proximity, also in flight
 * (the player's path since the last frame is tested as a segment).
 */
export class Capsules {
  private list = new Map<string, Capsule>();
  private slots: (Capsule | null)[] = new Array(MAX).fill(null);
  readonly body: THREE.InstancedMesh;
  readonly ring: THREE.InstancedMesh;
  private prev = new THREE.Vector3();
  private hasPrev = false;
  private t = 0;
  onPickup: ((c: { id: string; owner: string; pos: THREE.Vector3 }) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    private isFound: (id: string) => boolean,
    private reducedMotion: () => boolean,
  ) {
    // shell (stone) + a teal sensor band + a dark lens: one geometry, vertex colours
    const paint = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
      const c = new THREE.Color(hex);
      const gg = g.index ? g.toNonIndexed() : g;
      const n = gg.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (gg.getAttribute('uv')) gg.deleteAttribute('uv');
      return gg;
    };
    const shell = paint(new THREE.CapsuleGeometry(BODY_R, 0.26, 4, 14), 0xe7e5e4);
    const band = paint(new THREE.CylinderGeometry(BODY_R * 1.06, BODY_R * 1.06, 0.07, 18, 1, true), 0x2dd4bf);
    const lens = paint(new THREE.SphereGeometry(0.045, 10, 8).translate(0, 0.08, BODY_R * 0.9), 0x0c0a09);
    const geo = mergeGeometries([shell, band, lens], false)!;
    shell.dispose();
    band.dispose();
    lens.dispose();
    this.body = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: 0x0f3d38, emissiveIntensity: 0.6, name: 'core:capsule' }),
      MAX,
    );
    this.body.name = 'core:capsules';
    this.body.frustumCulled = false;
    this.body.castShadow = false;
    // a flat teal halo ring under each capsule (may bloom: it is a find, not the logo)
    const ringGeo = new THREE.RingGeometry(0.34, 0.42, 40).rotateX(-Math.PI / 2);
    this.ring = new THREE.InstancedMesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.6), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, name: 'core:capsule-ring' }),
      MAX,
    );
    this.ring.name = 'core:capsule-rings';
    // flat and unlit: one DoubleSide pass draws the same picture as three's back-then-front pair (C11a)
    (this.ring.material as THREE.MeshBasicMaterial).forceSinglePass = true;
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 4;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      this.body.setMatrixAt(i, _m);
      this.ring.setMatrixAt(i, _m);
    }
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.visible = this.ring.visible = false;
    scene.add(this.body, this.ring);
  }

  /** Place one capsule (world centre). Found ids are registered (they count for total()) but not spawned. */
  place(owner: string, id: string, world: THREE.Vector3, radius = 1.2): { readonly found: boolean; remove(): void } {
    const old = this.list.get(id);
    if (old) this.removeCapsule(old);
    const found = this.isFound(id);
    let slot = -1;
    if (!found) {
      slot = this.slots.findIndex((s) => s === null);
      if (slot < 0) console.warn(`[capsules] more than ${MAX} capsules: "${id}" is not shown`);
    }
    const c: Capsule = { id, owner, pos: world.clone(), radius: Math.max(0.4, radius), slot, found, phase: Math.random() * Math.PI * 2 };
    this.list.set(id, c);
    if (slot >= 0) this.slots[slot] = c;
    this.refreshVisible();
    return {
      get found() {
        return c.found;
      },
      remove: () => {
        if (this.list.get(id) === c) this.removeCapsule(c);
      },
    };
  }

  private removeCapsule(c: Capsule): void {
    this.list.delete(c.id);
    this.freeSlot(c);
    this.refreshVisible();
  }

  private freeSlot(c: Capsule): void {
    if (c.slot < 0) return;
    _m.makeScale(0, 0, 0);
    this.body.setMatrixAt(c.slot, _m);
    this.ring.setMatrixAt(c.slot, _m);
    this.body.instanceMatrix.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
    this.slots[c.slot] = null;
    c.slot = -1;
  }

  removeOwner(owner: string): void {
    for (const c of [...this.list.values()]) if (c.owner === owner) this.removeCapsule(c);
  }

  private refreshVisible(): void {
    const any = this.slots.some((s) => s && !s.found);
    this.body.visible = this.ring.visible = any;
  }

  /** placed ids (found or not) */
  total(): number {
    return this.list.size;
  }

  ids(): string[] {
    return [...this.list.keys()];
  }

  position(id: string): THREE.Vector3 | null {
    return this.list.get(id)?.pos.clone() ?? null;
  }

  /** mark found without the player touching it (debug hooks) → runs the pickup */
  collect(id: string): boolean {
    const c = this.list.get(id);
    if (!c || c.found) return false;
    this.pick(c);
    return true;
  }

  nearestUnfound(from: THREE.Vector3): { id: string; distance: number; bearing: number; world: [number, number, number] } | null {
    let best: Capsule | null = null;
    let bd = Infinity;
    for (const c of this.list.values()) {
      if (c.found || this.isFound(c.id)) continue;
      const d = c.pos.distanceTo(from);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) return null;
    let bearing = (Math.atan2(best.pos.x - from.x, -(best.pos.z - from.z)) * 180) / Math.PI;
    if (bearing < 0) bearing += 360;
    return { id: best.id, distance: Math.round(bd * 10) / 10, bearing: Math.round(bearing), world: [best.pos.x, best.pos.y, best.pos.z] };
  }

  /** player feet (world) each frame */
  update(dt: number, feet: THREE.Vector3, playing: boolean): void {
    this.t += dt;
    if (!this.body.visible) {
      this.prev.copy(feet);
      this.hasPrev = true;
      return;
    }
    const still = this.reducedMotion();
    let dirty = false;
    // body centre ≈ feet + 0.9 m; the segment since the last frame catches fast jump-pad flights
    _a.copy(this.hasPrev ? this.prev : feet);
    _a.y += 0.9;
    _b.copy(feet);
    _b.y += 0.9;
    const jump = this.hasPrev && this.prev.distanceToSquared(feet) > 25; // teleports are not flights
    for (const c of this.slots) {
      if (!c || c.found) continue;
      const bob = still ? 0 : Math.sin(this.t * 1.6 + c.phase) * 0.07;
      _p.set(c.pos.x, c.pos.y + bob, c.pos.z);
      _q.setFromEuler(_e.set(0.32, still ? c.phase : this.t * 0.9 + c.phase, 0));
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      this.body.setMatrixAt(c.slot, _m);
      const pulse = still ? 1 : 1 + Math.sin(this.t * 2.2 + c.phase) * 0.06;
      _p.set(c.pos.x, c.pos.y - 0.32 + bob * 0.3, c.pos.z);
      _q.setFromAxisAngle(UP, 0);
      _s.set(pulse, 1, pulse);
      _m.compose(_p, _q, _s);
      this.ring.setMatrixAt(c.slot, _m);
      dirty = true;
      if (playing && !jump && distPointSegment(c.pos, _a, _b) <= c.radius + 0.3) this.pick(c);
    }
    if (dirty) {
      this.body.instanceMatrix.needsUpdate = true;
      this.ring.instanceMatrix.needsUpdate = true;
    }
    this.prev.copy(feet);
    this.hasPrev = true;
  }

  private pick(c: Capsule): void {
    c.found = true;
    this.freeSlot(c);
    this.refreshVisible();
    this.onPickup?.({ id: c.id, owner: c.owner, pos: c.pos.clone() });
  }
}

const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
function distPointSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  _ab.subVectors(b, a);
  _ap.subVectors(p, a);
  const len2 = _ab.lengthSq();
  const t = len2 > 1e-9 ? THREE.MathUtils.clamp(_ap.dot(_ab) / len2, 0, 1) : 0;
  return _ap.addScaledVector(_ab, -t).length();
}
