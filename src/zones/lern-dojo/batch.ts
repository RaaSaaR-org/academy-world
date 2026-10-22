/**
 * Static geometry batcher: collect boxes/cylinders/custom geometry per material, then merge
 * into ONE mesh per material (draw-call budget). Geometry is transformed into the batch
 * frame (zone-local) before merging.
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** add an already-built geometry with a transform (consumed: do not reuse it) */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    geo.applyMatrix4(_m);
    // all parts need the same attribute set
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    const g = geo.index ? geo : withIndex(geo);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
    return this;
  }

  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): this {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }

  cyl(mat: THREE.Material, rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(mat, new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y, z, rx, ry, rz);
  }

  /** merge per material and add the meshes to `parent` */
  build(parent: THREE.Object3D, o: { castShadow?: boolean | ((m: THREE.Material) => boolean); receiveShadow?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const merged = mergeIndexed(list);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${o.name ?? 'batch'}:${mat.name || mat.type}`;
      mesh.castShadow = typeof o.castShadow === 'function' ? o.castShadow(mat) : !!o.castShadow;
      mesh.receiveShadow = o.receiveShadow ?? true;
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

function withIndex(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Merge indexed geometries with position / normal / uv into one (Uint32 indices). */
function mergeIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  let nv = 0,
    ni = 0;
  for (const g of list) {
    nv += g.getAttribute('position').count;
    ni += g.index!.count;
  }
  const pos = new Float32Array(nv * 3),
    nor = new Float32Array(nv * 3),
    uv = new Float32Array(nv * 2),
    idx = new Uint32Array(ni);
  let vo = 0,
    io = 0;
  for (const g of list) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const u = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      if (n) {
        nor[(vo + i) * 3] = n.getX(i);
        nor[(vo + i) * 3 + 1] = n.getY(i);
        nor[(vo + i) * 3 + 2] = n.getZ(i);
      }
      uv[(vo + i) * 2] = u.getX(i);
      uv[(vo + i) * 2 + 1] = u.getY(i);
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx[io++] = ix.getX(i) + vo;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
