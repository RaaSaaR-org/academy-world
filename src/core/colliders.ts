import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Rapier } from './Physics';

export type ShapeKind = 'auto' | 'box' | 'sphere' | 'cylinder' | 'capsule' | 'hull' | 'trimesh';

const _m = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _frame = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();

/**
 * World "body frame" of an object: world position + world rotation, NO scale.
 * Rapier bodies live in this frame; scale is baked into the collider shape.
 */
export function bodyFrame(object: THREE.Object3D): { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } {
  object.updateWorldMatrix(true, true);
  object.matrixWorld.decompose(_pos, _quat, _scale);
  return { pos: _pos.clone(), quat: _quat.clone(), scale: _scale.clone() };
}

/** Iterate meshes under `object` with their matrix relative to the object's body frame. */
function forEachMeshRel(object: THREE.Object3D, fn: (mesh: THREE.Mesh, rel: THREE.Matrix4) => void): void {
  object.updateWorldMatrix(true, true);
  object.matrixWorld.decompose(_pos, _quat, _scale);
  _frame.compose(_pos, _quat, _one);
  const inv = _m.copy(_frame).invert();
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || (mesh.userData && (mesh.userData.noCollide || mesh.userData.__highlight))) return;
    _rel.multiplyMatrices(inv, mesh.matrixWorld);
    fn(mesh, _rel);
  });
}

/** Bounds (metres) of the object's meshes in its body frame. */
export function bodyFrameBounds(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const gbox = new THREE.Box3();
  forEachMeshRel(object, (mesh, rel) => {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    gbox.copy(mesh.geometry.boundingBox!).applyMatrix4(rel);
    box.union(gbox);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.25, -0.25, -0.25), new THREE.Vector3(0.25, 0.25, 0.25));
  return box;
}

function collectVertices(object: THREE.Object3D, withIndices: boolean): { vertices: Float32Array; indices: Uint32Array | null } {
  const verts: number[] = [];
  const idx: number[] = [];
  forEachMeshRel(object, (mesh, rel) => {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      verts.push(_v.x, _v.y, _v.z);
    }
    if (withIndices) {
      const index = geo.getIndex();
      if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
      else for (let i = 0; i < pos.count; i++) idx.push(base + i);
    }
  });
  return { vertices: new Float32Array(verts), indices: withIndices ? new Uint32Array(idx) : null };
}

/**
 * Collider description for `object` in its body frame (see bodyFrame()).
 * 'auto': exact primitives for a single Box/Sphere/Cylinder/Capsule geometry with no
 * children, otherwise the oriented bounding box of all child meshes.
 */
export function colliderDescFor(R: Rapier, object: THREE.Object3D, kind: ShapeKind = 'auto', o: { fixInternalEdges?: boolean } = {}): RAPIER_NS.ColliderDesc {
  object.updateWorldMatrix(true, true);
  object.matrixWorld.decompose(_pos, _quat, _scale);
  const sx = Math.abs(_scale.x),
    sy = Math.abs(_scale.y),
    sz = Math.abs(_scale.z);
  const mesh = object as THREE.Mesh;
  // "single" = the object's own geometry is the shape (children such as labels are ignored
  // when they are non-colliding or not meshes)
  let collidingChildren = false;
  object.traverse((o) => {
    if (o === object) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noCollide && !m.userData.__highlight) collidingChildren = true;
  });
  const single = mesh.isMesh && !collidingChildren;
  const geo = single ? (mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> }) : null;
  const type = geo?.type;

  if (kind === 'trimesh') {
    const { vertices, indices } = collectVertices(object, true);
    // FIX_INTERNAL_EDGES: contacts on the shared edges of a flat mesh use the neighbours' normals,
    // so a capsule sliding across it does not catch on the seams (needs a clean, manifold mesh)
    return o.fixInternalEdges ? R.ColliderDesc.trimesh(vertices, indices!, R.TriMeshFlags.FIX_INTERNAL_EDGES) : R.ColliderDesc.trimesh(vertices, indices!);
  }
  if (kind === 'hull') {
    const { vertices } = collectVertices(object, false);
    const d = R.ColliderDesc.convexHull(vertices);
    if (d) return d;
    kind = 'box';
  }
  if (geo && geo.parameters && (kind === 'auto' || kind === 'sphere') && type === 'SphereGeometry') {
    return R.ColliderDesc.ball(geo.parameters.radius * Math.max(sx, sy, sz));
  }
  if (geo && geo.parameters && (kind === 'auto' || kind === 'cylinder') && type === 'CylinderGeometry' && geo.parameters.radiusTop === geo.parameters.radiusBottom) {
    return R.ColliderDesc.cylinder((geo.parameters.height / 2) * sy, geo.parameters.radiusTop * Math.max(sx, sz));
  }
  if (geo && geo.parameters && (kind === 'auto' || kind === 'capsule') && type === 'CapsuleGeometry') {
    return R.ColliderDesc.capsule((geo.parameters.height / 2) * sy, geo.parameters.radius * Math.max(sx, sz));
  }
  if (geo && geo.parameters && (kind === 'auto' || kind === 'box') && type === 'BoxGeometry') {
    return R.ColliderDesc.cuboid((geo.parameters.width / 2) * sx, (geo.parameters.height / 2) * sy, (geo.parameters.depth / 2) * sz);
  }
  // Fallback: bounding box (or bounding sphere/cylinder/capsule) of all meshes, with centre offset.
  const b = bodyFrameBounds(object);
  const c = b.getCenter(new THREE.Vector3());
  const h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  let d: RAPIER_NS.ColliderDesc;
  if (kind === 'sphere') d = R.ColliderDesc.ball(Math.max(h.x, h.y, h.z));
  else if (kind === 'cylinder') d = R.ColliderDesc.cylinder(h.y, Math.max(h.x, h.z));
  else if (kind === 'capsule') {
    const r = Math.max(h.x, h.z);
    d = R.ColliderDesc.capsule(Math.max(0.01, h.y - r), r);
  } else d = R.ColliderDesc.cuboid(Math.max(0.01, h.x), Math.max(0.01, h.y), Math.max(0.01, h.z));
  d.setTranslation(c.x, c.y, c.z);
  return d;
}
