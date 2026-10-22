/**
 * Picking on the 3D view (WP-D1, plan §3.3): a tap ray-casts against the meshes under every visible
 * `robot:<id>` object (Lern-Dojo, Greifwerkstatt and Sonnenacker SO-101s, the Traumhangar's R1, G1,
 * H1-2 and H2, the hall's plinths) and tests the stop's spots (the ray within a spot's radius of one of
 * its anchors, unoccluded); the nearest wins. Amber robots never count (ROBOT_IDS leaves them out unless
 * the build has the amber switch on), and a robot only counts when D2 has a card for it.
 */
import * as THREE from 'three';
import type { DiscoverHandle, TapPoint } from '../types';
import { ROBOT_IDS, type RobotId } from '@/robots/manifest';
import { occluded, type ActiveSpot } from './markers';
import type { SpotData } from './spots';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

const shownChain = (o: THREE.Object3D | null): boolean => {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
};

/** every robot object in the scene that is drawn now */
export function robotRoots(h: DiscoverHandle): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  h.game.rs.scene.traverseVisible((o) => {
    const id = o.userData?.robot as string | undefined;
    if (id && o.name === `robot:${id}` && (ROBOT_IDS as readonly string[]).includes(id)) out.push(o);
  });
  return out;
}

const hasCard = (h: DiscoverHandle, id: string): boolean => {
  try {
    return !!h.robots?.card(id as RobotId);
  } catch {
    return false;
  }
};

export type Picked = { kind: 'robot'; id: RobotId } | { kind: 'spot'; spot: SpotData } | null;

export function pickAt(h: DiscoverHandle, ndc: TapPoint, spots: readonly ActiveSpot[]): Picked {
  const cam = h.game.camera;
  _ndc.set(ndc.x, ndc.y);
  _ray.setFromCamera(_ndc, cam);
  let best: { d: number; pick: Picked } | null = null;
  if (h.robots) {
    const roots = robotRoots(h);
    for (const hit of _ray.intersectObjects(roots, true)) {
      if (!shownChain(hit.object)) continue;
      let n: THREE.Object3D | null = hit.object;
      while (n && !n.userData?.robot) n = n.parent;
      const id = n?.userData?.robot as string | undefined;
      if (!id || !hasCard(h, id)) continue;
      best = { d: hit.distance, pick: { kind: 'robot', id: id as RobotId } };
      break;
    }
  }
  for (const a of spots) {
    for (const p of a.pts) {
      _p.set(p[0], p[1], p[2]);
      const along = _q.copy(_p).sub(_ray.ray.origin).dot(_ray.ray.direction);
      if (along <= 0) continue;
      if (_ray.ray.distanceSqToPoint(_p) > a.spot.r * a.spot.r) continue;
      if (best && along > best.d) continue;
      if (occluded(h, cam.position, _p)) continue;
      best = { d: along, pick: { kind: 'spot', spot: a.spot } };
    }
  }
  return best?.pick ?? null;
}

/** robots near the camera and in view (the card's „Hier zu sehen“), nearest first */
export function robotsInView(h: DiscoverHandle, maxDist = 45, max = 6): RobotId[] {
  if (!h.robots) return [];
  const cam = h.game.camera;
  cam.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const seen = new Map<string, number>();
  for (const o of robotRoots(h)) {
    o.getWorldPosition(_p);
    const d = _p.distanceTo(cam.position);
    if (d > maxDist) continue;
    _q.copy(_p).setY(_p.y + 0.6);
    if (!frustum.containsPoint(_p) && !frustum.containsPoint(_q)) continue;
    const id = o.userData.robot as string;
    if (!seen.has(id) || seen.get(id)! > d) seen.set(id, d);
  }
  return [...seen.entries()]
    .filter(([id]) => hasCard(h, id))
    .sort((a, b) => a[1] - b[1])
    .slice(0, max)
    .map(([id]) => id as RobotId);
}
