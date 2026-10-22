/**
 * Analytic sun shade on the ground (plan §5.3 rule 6, R5 §3.1, C1 m7): the shadow map covers only the
 * 90 × 90 m around the player, so the island's long shadows on the Revier and the cloud bank's shade are
 * computed in the ground materials instead.
 *
 *  - Cloud bank: the sun (295°, 16°) shines under the slab's WNW edge, so a ground point is shaded once its
 *    projection on bearing 115° passes ≈ 251 m (R5 §3.1, R8 §4.1), with a soft edge.
 *  - Island: the tower (shaft and needle) and the six lobes' buildings as vertical capsules, projected
 *    along the sun onto the receiver's height: the tower's shadow runs ≈ 200 m over the Werft.
 *
 * `sunFactor()` is the same formula on the CPU (statics bake it per vertex where they never move).
 */
import * as THREE from 'three';
import { DEFAULT_ENV } from '@/core/Environment';
import { DEG, TOWER, ZONE_PLOTS } from '../layout';
import { T } from './tuning';

const SUN_AZ = DEFAULT_ENV.sunAzimuthDeg;
const SUN_EL = DEFAULT_ENV.sunElevationDeg;

/** ground-plane direction a shadow runs (away from the sun), unit xz */
export const SHADE_DIR = new THREE.Vector2(Math.sin((SUN_AZ + 180) * DEG), -Math.cos((SUN_AZ + 180) * DEG));
export const SUN_TAN = Math.tan(SUN_EL * DEG);

/** casters: x, z, radius, top height (ground frame) */
const CASTERS: [number, number, number, number][] = [
  [0, 0, TOWER.circumradius, TOWER.crownY],
  [0, 0, T.shade.needleRadius, T.shade.needleTop],
  ...ZONE_PLOTS.map((p): [number, number, number, number] => [p.anchor[0], p.anchor[2], T.shade.lobeRadius, T.shade.lobeHeight]),
];

/** Shared uniforms (one object for every ground material: no per-material upload). */
export const SHADE_UNIFORMS = {
  uShadeDir: { value: SHADE_DIR.clone() },
  uShadeTan: { value: SUN_TAN },
  uShadeCloud: { value: new THREE.Vector4(T.shade.cloudEdge, T.shade.cloudSoft, T.shade.cloudStrength, T.shade.islandStrength) },
  uCasters: { value: CASTERS.map(([x, z, r, h]) => new THREE.Vector4(x, z, r, h)) },
};

export const SHADE_GLSL = /* glsl */ `
uniform vec2 uShadeDir;
uniform float uShadeTan;
uniform vec4 uShadeCloud;
uniform vec4 uCasters[${CASTERS.length}];
float emaiGroundSun(vec2 p, float y) {
  float pc = dot(p, uShadeDir);
  float k = 1.0 - uShadeCloud.z * smoothstep(uShadeCloud.x - uShadeCloud.y, uShadeCloud.x + uShadeCloud.y, pc);
  // the island's shadows only reach ≈ 230 m down-sun of the tower
  float side = abs(p.x * uShadeDir.y - p.y * uShadeDir.x);
  if (pc > -110.0 && pc < 330.0 && side < 120.0) {
    for (int i = 0; i < ${CASTERS.length}; i++) {
      vec4 c = uCasters[i];
      vec2 d = p - c.xy;
      float t = dot(d, uShadeDir);
      float len = max(0.0, (c.w - y) / uShadeTan);
      float perp = abs(d.x * uShadeDir.y - d.y * uShadeDir.x);
      float dist = length(vec2(t - clamp(t, 0.0, len), perp));
      k *= 1.0 - uShadeCloud.w * smoothstep(c.z + 1.2, c.z - 1.2, dist) * step(0.0, len);
    }
  }
  return k;
}
`;

/** CPU twin of emaiGroundSun (statics bake it per vertex). */
export function sunFactor(x: number, z: number, y = 0): number {
  const dx = SHADE_DIR.x,
    dz = SHADE_DIR.y;
  const pc = x * dx + z * dz;
  const S = T.shade;
  const sm = THREE.MathUtils.smoothstep;
  let k = 1 - S.cloudStrength * sm(pc, S.cloudEdge - S.cloudSoft, S.cloudEdge + S.cloudSoft);
  const side = Math.abs(x * dz - z * dx);
  if (pc > -110 && pc < 330 && side < 120)
    for (const [cx, cz, r, h] of CASTERS) {
      const ex = x - cx,
        ez = z - cz;
      const t = ex * dx + ez * dz;
      const len = Math.max(0, (h - y) / SUN_TAN);
      if (len <= 0) continue;
      const perp = Math.abs(ex * dz - ez * dx);
      const dist = Math.hypot(t - THREE.MathUtils.clamp(t, 0, len), perp);
      k *= 1 - S.islandStrength * (1 - sm(dist, r - 1.2, r + 1.2));
    }
  return k;
}

/**
 * Patch a lit material's fragment shader: every directional light (the sun) is scaled by `factor`
 * (a GLSL float expression available in the fragment shader, e.g. a varying).
 */
export function patchSunScale(sh: THREE.WebGLProgramParametersWithUniforms, factor: string): void {
  sh.fragmentShader = sh.fragmentShader.replace(
    '#include <lights_fragment_begin>',
    THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ${factor};`),
  );
}
