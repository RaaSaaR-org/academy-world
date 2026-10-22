import * as THREE from 'three';
import { finishStatic, finishStaticAsync } from './statics';

/**
 * Surface enrichment for the island's untextured standard materials (art pass): a world-space
 * value-noise layer adds albedo mottling, roughness variation (worn, polished, dull patches)
 * and a faint micro-relief (derivative bump), so railings, frames, beams, rotor ducts, the keel
 * truss and the planted mounds stop reading as flat plastic. Works on any geometry (no UVs),
 * fades the relief out with distance (no shimmer), costs ~7 noise lookups per shaded pixel.
 *
 * Applied once after the island is built: each source material is cloned once (shared by all
 * meshes that used it) — shared engine materials and zone content are never touched.
 * Skipped: textured, transparent and emissive-lit materials, logo/brand-exact and EMI materials,
 * and any subtree named `finale…` or flagged `userData.noEnrich` (other teams' content).
 */
const NOISE_GLSL = /* glsl */ `
varying vec3 vEmaiW;
float emaiHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float emaiNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(emaiHash(i), emaiHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(emaiHash(i + vec3(0.0, 1.0, 0.0)), emaiHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(emaiHash(i + vec3(0.0, 0.0, 1.0)), emaiHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(emaiHash(i + vec3(0.0, 1.0, 1.0)), emaiHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float emaiFbm(vec3 p) { return emaiNoise(p) * 0.6 + emaiNoise(p * 2.13 + 1.7) * 0.3 + emaiNoise(p * 4.41 + 3.1) * 0.1; }
`;

function patch(mat: THREE.MeshStandardMaterial, metal: boolean): void {
  const grain = metal ? '0.7' : '0.45';
  const bump = metal ? '0.0025' : '0.0';
  const rough = metal ? '0.16' : '0.08';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmaiW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 emaiP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    emaiP = instanceMatrix * emaiP;
  #endif
  vEmaiW = (modelMatrix * emaiP).xyz;
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float emaiB = emaiNoise(vEmaiW * 0.17 + 5.3);
float emaiG = emaiFbm(vEmaiW * ${grain});
diffuseColor.rgb *= mix(0.92, 1.05, emaiB) * mix(0.975, 1.025, emaiG);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (emaiB - 0.5) * ${rough} + (emaiG - 0.5) * 0.05, 0.05, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float emaiH = emaiG;
  vec3 emaiDx = dFdx(-vViewPosition), emaiDy = dFdy(-vViewPosition);
  vec3 emaiR1 = cross(emaiDy, normal), emaiR2 = cross(normal, emaiDx);
  float emaiDet = dot(emaiDx, emaiR1);
  vec3 emaiGrad = sign(emaiDet) * (dFdx(emaiH) * emaiR1 + dFdy(emaiH) * emaiR2);
  float emaiFade = (1.0 - smoothstep(3.0, 14.0, length(vViewPosition))) * ${bump} * 60.0;
  normal = normalize(abs(emaiDet) * normal - emaiGrad * emaiFade);
}`,
      );
  };
  mat.customProgramCacheKey = () => `emai-surface-${metal ? 'm' : 's'}`;
  mat.needsUpdate = true;
}

export function enrichSurfaces(root: THREE.Object3D, onDispose: (fn: () => void) => void): number;
/** With `ctx.yield` the static merge runs in slices (each merged group its own task): `await` it. */
export function enrichSurfaces(root: THREE.Object3D, onDispose: (fn: () => void) => void, yieldFn: () => Promise<void>): Promise<number>;
export function enrichSurfaces(root: THREE.Object3D, onDispose: (fn: () => void) => void, yieldFn?: () => Promise<void>): number | Promise<number> {
  const clones = new Map<THREE.Material, THREE.Material>();
  const eligible = (m: THREE.Material): m is THREE.MeshStandardMaterial => {
    if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial || (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return false;
    const s = m as THREE.MeshStandardMaterial;
    if (s.map || s.normalMap || s.transparent || s.onBeforeCompile.toString().includes('emai')) return false;
    if (s.emissive && s.emissiveIntensity > 0.3 && s.emissive.getHex() !== 0) return false;
    const n = (s.name || '').toLowerCase();
    if (n.includes('logo') || n.includes('emi') || n.includes('orange') || n.includes('teal') || n.includes('shell')) return false;
    if (s.userData.noEnrich) return false;
    return true;
  };
  let count = 0;
  // other teams' subtrees inside the island root (the finale) keep their own materials
  const visit = (o: THREE.Object3D, fn: (o: THREE.Object3D) => void): void => {
    if (o.userData.noEnrich || o.name.startsWith('finale')) return;
    fn(o);
    for (const c of o.children) visit(c, fn);
  };
  visit(root, (o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      if (!eligible(m)) return m;
      let c = clones.get(m);
      if (!c) {
        const cl = m.clone() as THREE.MeshStandardMaterial;
        cl.name = `${m.name || 'island'}+surface`;
        patch(cl, cl.metalness > 0.35);
        clones.set(m, cl);
        c = cl;
      }
      count++;
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  onDispose(() => clones.forEach((c) => c.dispose()));
  // W1: the surface pass is the island's last build step — now merge every static part
  // (marked subtrees + the landscape batch) per shading model (statics.ts)
  if (yieldFn) return finishStaticAsync(root, yieldFn).then(() => count);
  finishStatic(root);
  return count;
}
