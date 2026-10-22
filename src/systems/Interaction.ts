import * as THREE from 'three';
import type { DynamicBody, Physics } from '@/core/Physics';
import type { Text } from '@/core/types';
import { Highlighter } from './Highlight';

export interface InteractableOptions {
  /** The Object3D (mesh or group) the player aims at. Must be in the scene. */
  object: THREE.Object3D;
  /** Prompt label, e.g. { de: 'Knopf drücken', en: 'Press button' } → "[E] Knopf drücken" */
  label: Text;
  /** Called on E / left click while focused. */
  onInteract: () => void;
  /** Max distance from the eye in metres (default 2.6). */
  range?: number;
  /** Optional second line under the prompt (small, muted). */
  hint?: Text;
  /** default true */
  enabled?: boolean;
  /** Remove itself after the first interaction. */
  once?: boolean;
  /** Orange rim highlight on hover (default true). */
  highlight?: boolean;
  /** Dynamic availability, checked every frame (e.g. `() => !door.open`). */
  isEnabled?: () => boolean;
  /** While true the prompt shows without the [E] key cap and E / click do nothing (e.g. Sensordom A: the active sensor view cannot see the object). */
  keyless?: () => boolean;
}

export interface InteractableHandle {
  readonly id: number;
  readonly enabled: boolean;
  setLabel(label: Text): void;
  setHint(hint: Text | null): void;
  setEnabled(enabled: boolean): void;
  /** Programmatically trigger (same as the player pressing E). */
  trigger(): void;
  remove(): void;
}

export interface Interactable {
  id: number;
  owner: string;
  object: THREE.Object3D;
  label: Text;
  hint: Text | null;
  onInteract: () => void;
  range: number;
  enabled: boolean;
  once: boolean;
  highlight: boolean;
  removed: boolean;
  isEnabled: (() => boolean) | null;
  keyless: (() => boolean) | null;
}

function available(it: Interactable): boolean {
  if (!it.enabled || it.removed) return false;
  if (!it.isEnabled) return true;
  try {
    return it.isEnabled();
  } catch {
    return false;
  }
}

/** The prompt has no key right now (InteractableOptions.keyless): E and click do nothing. */
export function isKeyless(it: Interactable): boolean {
  try {
    return !!it.keyless?.();
  } catch {
    return false;
  }
}

export type Focus =
  | { kind: 'interactable'; item: Interactable; distance: number; grabbable: DynamicBody | null }
  | { kind: 'grabbable'; body: DynamicBody; distance: number };

export const GRAB_RANGE = 3.0;
const MAX_RAY = 8;

const _ndc = new THREE.Vector2(0, 0);
const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Screen-centre raycast against registered interactables, occlusion-checked against
 * the physics world (no interacting through walls), plus grabbable detection.
 */
export class InteractionSystem {
  readonly items = new Set<Interactable>();
  private byObject = new Map<THREE.Object3D, Interactable>();
  private raycaster = new THREE.Raycaster();
  readonly highlighter = new Highlighter();
  focus: Focus | null = null;
  /** UX-16: the interactable under the crosshair that is just out of reach (range … range + 4 m), else null */
  nearMiss: { item: Interactable; distance: number } | null = null;
  private nextId = 1;
  private candidates: THREE.Object3D[] = [];
  onInteracted: ((item: Interactable) => void) | null = null;
  private ray: import('@dimforge/rapier3d-compat').Ray | null = null;

  constructor(private physics: Physics) {
    this.raycaster.far = MAX_RAY;
  }

  add(owner: string, o: InteractableOptions): InteractableHandle {
    const item: Interactable = {
      id: this.nextId++,
      owner,
      object: o.object,
      label: o.label,
      hint: o.hint ?? null,
      onInteract: o.onInteract,
      range: o.range ?? 2.6,
      enabled: o.enabled ?? true,
      once: !!o.once,
      highlight: o.highlight ?? true,
      removed: false,
      isEnabled: o.isEnabled ?? null,
      keyless: o.keyless ?? null,
    };
    this.items.add(item);
    this.byObject.set(o.object, item);
    const self = this;
    return {
      id: item.id,
      get enabled() {
        return item.enabled;
      },
      setLabel: (l) => (item.label = l),
      setHint: (h) => (item.hint = h),
      setEnabled: (e) => {
        item.enabled = e;
        if (!e && self.focus?.kind === 'interactable' && self.focus.item === item) self.setFocus(null);
      },
      trigger: () => self.fire(item),
      remove: () => self.remove(item),
    };
  }

  remove(item: Interactable): void {
    if (item.removed) return;
    item.removed = true;
    this.items.delete(item);
    if (this.byObject.get(item.object) === item) this.byObject.delete(item.object);
    this.highlighter.forget(item.object);
    if (this.focus?.kind === 'interactable' && this.focus.item === item) this.setFocus(null);
  }

  removeOwner(owner: string): void {
    for (const it of [...this.items]) if (it.owner === owner) this.remove(it);
  }

  fire(item: Interactable): void {
    if (!available(item)) return;
    if (isKeyless(item)) return;
    try {
      item.onInteract();
    } catch (err) {
      console.error(`[interaction] onInteract of "${item.owner}" threw`, err);
    }
    this.onInteracted?.(item);
    if (item.once) this.remove(item);
  }

  private setFocus(f: Focus | null): void {
    this.focus = f;
    let obj: THREE.Object3D | null = null;
    if (f?.kind === 'interactable' && f.item.highlight) obj = f.item.object;
    else if (f?.kind === 'grabbable') obj = f.body.object;
    this.highlighter.focus(obj);
  }

  /** Recompute focus from the camera centre. */
  update(camera: THREE.Camera, dt: number, active: boolean, playerCollider: import('@dimforge/rapier3d-compat').Collider): void {
    this.highlighter.update(dt);
    this.nearMiss = null;
    if (!active) {
      if (this.focus) this.setFocus(null);
      return;
    }
    camera.getWorldPosition(_p);
    camera.getWorldDirection(_dir);

    // 1) physics ray (occluder + grabbables)
    const R = this.physics.R;
    if (!this.ray) this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    const ray = this.ray;
    ray.origin.x = _p.x;
    ray.origin.y = _p.y;
    ray.origin.z = _p.z;
    ray.dir.x = _dir.x;
    ray.dir.y = _dir.y;
    ray.dir.z = _dir.z;
    const hit = this.physics.world.castRay(ray, MAX_RAY, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, playerCollider);
    const physDist = hit ? hit.timeOfImpact : Infinity;
    const hitInfo = hit ? this.physics.infoOf(hit.collider) : undefined;
    const grabbable = hitInfo?.dynamic && hitInfo.dynamic.grabbable && !hitInfo.dynamic.removed ? hitInfo.dynamic : null;

    // 2) visual ray against interactables near the player
    this.candidates.length = 0;
    for (const it of this.items) {
      if (!available(it)) continue;
      // world-space bounds centre: a merged mesh whose geometry is translated sits at its group's
      // origin, so getWorldPosition() alone would drop it from the candidates
      const reach = it.range + 6 + focusPoint(it.object, _v2);
      if (_v2.distanceToSquared(_p) < reach * reach) this.candidates.push(it.object);
    }
    let found: Focus | null = null;
    if (this.candidates.length) {
      this.raycaster.setFromCamera(_ndc, camera);
      this.raycaster.far = MAX_RAY;
      const hits = this.raycaster.intersectObjects(this.candidates, true);
      for (const h of hits) {
        if (h.object.userData.__highlight) continue;
        const item = this.ownerOf(h.object);
        if (!item || !available(item)) continue;
        if (h.distance > item.range) {
          // the item's own collider often sits a little in front of its mesh: 0.8 m tolerance (a wall farther in front hides it)
          if (h.distance <= item.range + 4 && h.distance <= physDist + 0.8) this.nearMiss = { item, distance: h.distance };
          break;
        }
        if (h.distance > physDist + 0.2) break; // occluded
        found = { kind: 'interactable', item, distance: h.distance, grabbable: grabbable && grabbable.object === item.object ? grabbable : null };
        break;
      }
    }
    if (!found && grabbable && physDist <= GRAB_RANGE) found = { kind: 'grabbable', body: grabbable, distance: physDist };
    // 3) aim assist: nothing under the crosshair → the interactable whose bounds come closest to the
    //    view ray (≤ 9°, within range, unoccluded). Trackpad and keyboard-only players (← / → turn,
    //    no pitch) can then still use a screen below eye height; a direct hit always wins.
    if (!found && !grabbable && this.candidates.length) found = this.assist(R, playerCollider);

    const same =
      (found?.kind === 'interactable' && this.focus?.kind === 'interactable' && found.item === this.focus.item) ||
      (found?.kind === 'grabbable' && this.focus?.kind === 'grabbable' && found.body === this.focus.body);
    if (same) this.focus = found;
    else this.setFocus(found);
  }

  private assist(R: typeof import('@dimforge/rapier3d-compat').default, playerCollider: import('@dimforge/rapier3d-compat').Collider): Focus | null {
    let best: Interactable | null = null;
    let bestCos = ASSIST_COS;
    let bestDist = 0;
    for (const obj of this.candidates) {
      const it = this.ownerOf(obj);
      if (!it || !available(it)) continue;
      _box.setFromObject(obj, false);
      if (_box.isEmpty()) continue;
      // the box point nearest to the view ray, at the depth of the box centre
      _box.getCenter(_c);
      const t = Math.max(0, _c.sub(_p).dot(_dir));
      _q.copy(_dir).multiplyScalar(t).add(_p);
      _box.clampPoint(_q, _q);
      _to.subVectors(_q, _p);
      const d = _to.length();
      if (d > it.range || d < 0.05) continue;
      const cos = _to.dot(_dir) / d;
      if (cos <= bestCos) continue;
      best = it;
      bestCos = cos;
      bestDist = d;
    }
    if (!best) return null;
    // occlusion: a wall between the eye and the target point cancels the assist
    _to.normalize();
    const ray = this.ray!; // reused (origin is already the eye)
    ray.dir.x = _to.x;
    ray.dir.y = _to.y;
    ray.dir.z = _to.z;
    const hit = this.physics.world.castRay(ray, bestDist, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, playerCollider);
    if (hit && hit.timeOfImpact < bestDist - 0.35) {
      // a dynamic body that IS the target (or part of it) does not occlude it; anything else does
      const obj = this.physics.infoOf(hit.collider)?.dynamic?.object ?? null;
      if (!obj || !isAncestor(best.object, obj)) return null;
    }
    return { kind: 'interactable', item: best, distance: bestDist, grabbable: null };
  }

  private ownerOf(o: THREE.Object3D | null): Interactable | undefined {
    while (o) {
      const it = this.byObject.get(o);
      if (it && !it.removed) return it;
      o = o.parent;
    }
    return undefined;
  }

  /** Nearest enabled interactable to a world point (for test hooks). */
  nearest(from: THREE.Vector3, maxDist = 60): Interactable | null {
    let best: Interactable | null = null,
      bd = maxDist * maxDist;
    for (const it of this.items) {
      if (!available(it)) continue;
      focusPoint(it.object, _v2);
      const d = _v2.distanceToSquared(from);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }
}

const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _q = new THREE.Vector3();
const _to = new THREE.Vector3();
/** aim-assist cone half angle: 9° */
const ASSIST_COS = Math.cos(THREE.MathUtils.degToRad(9));

/**
 * Centre of an interactable in world space (written to `out`) and its bounding radius. A mesh
 * uses its geometry's bounding sphere, so meshes with translated geometry (merge pattern) are
 * found where they are drawn. A group uses the bounds of its children, measured once and kept in
 * the group's own frame (a group at the zone origin whose children sit at absolute positions fell
 * out of the candidates beyond range + 6 m of the origin: the Lern-Dojo desk, the Sensordom cable);
 * instanced meshes use their origin (radius 0).
 */
const groupBounds = new WeakMap<THREE.Object3D, { c: THREE.Vector3; r: number }>();
const _gb = new THREE.Box3();
const _gs = new THREE.Sphere();
const _gm = new THREE.Matrix4();
function focusPoint(obj: THREE.Object3D, out: THREE.Vector3): number {
  const m = obj as THREE.Mesh & { isInstancedMesh?: boolean };
  if (m.isMesh && m.geometry && !m.isInstancedMesh) {
    const g = m.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const s = g.boundingSphere;
    if (s && Number.isFinite(s.radius)) {
      out.copy(s.center).applyMatrix4(m.matrixWorld);
      return s.radius * m.matrixWorld.getMaxScaleOnAxis();
    }
  }
  if (!m.isMesh && obj.children.length) {
    let b = groupBounds.get(obj);
    if (!b) {
      obj.updateWorldMatrix(true, true);
      _gb.setFromObject(obj, false);
      if (!_gb.isEmpty() && Number.isFinite(_gb.min.x) && Number.isFinite(_gb.max.x)) {
        _gb.getBoundingSphere(_gs);
        b = { c: _gs.center.clone().applyMatrix4(_gm.copy(obj.matrixWorld).invert()), r: _gs.radius };
        groupBounds.set(obj, b);
      }
    }
    if (b) {
      out.copy(b.c).applyMatrix4(obj.matrixWorld);
      return b.r;
    }
  }
  obj.getWorldPosition(out);
  return 0;
}

function isAncestor(a: THREE.Object3D, b: THREE.Object3D | null): boolean {
  for (let o: THREE.Object3D | null = b; o; o = o.parent) if (o === a) return true;
  for (let o: THREE.Object3D | null = a; o; o = o.parent) if (o === b) return true;
  return false;
}
