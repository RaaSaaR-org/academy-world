/**
 * Small build helpers of the hangar.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZoneContext } from '@/core/zones';

/**
 * Bake the plain-coloured parts of a moving prop (a rover, a cart) into ONE mesh with vertex colours:
 * one draw instead of one per part (the ghost moment's JS budget, §5.5). The parts' colours go into the
 * colour attribute. The material is NOT the robots' vertex-colour material (roughness 0.55): one material
 * shared by skinned and static meshes makes three.js look its program up again on every draw. The parts
 * are not added anywhere; their geometries are disposed.
 */
export function bakeParts(ctx: ZoneContext, parts: THREE.Mesh[], name: string): THREE.Mesh {
  const geos = parts.map((m) => {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const c = (m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0xffffff);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    m.geometry.dispose();
    return g;
  });
  const merged = mergeGeometries(geos) ?? new THREE.BufferGeometry();
  for (const g of geos) g.dispose();
  ctx.onDispose(() => merged.dispose());
  const mesh = new THREE.Mesh(merged, ctx.materials.standard({ vertexColors: true, metalness: 0, roughness: 0.6 }));
  mesh.name = name;
  return mesh;
}
