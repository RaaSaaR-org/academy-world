import * as THREE from 'three';
import type { SlabParams } from '../zones/types.env';
import { ENV_TUNING } from './tuning';

/**
 * The cloud bank („slab“, plan §5.7, R5 §3): one horizontal layer in the ground frame, base and top in m
 * above the deck at h = 0, covering everything closer to the island than the edge line (a straight line
 * `edgeDist` out along `edgeBearingDeg`, 295° WNW). Seen from below it is drawn by the sky shader
 * (SLAB_GLSL, 0 extra draws), inside it by the fog ramp (`cloudFactor`), from above by the rc4 cloud
 * sea at y = top − h. The CPU helpers and the GLSL below use the same geometry, so the sun the shader
 * hides behind the ceiling is the sun `sunBlockedBySlab` dims.
 */

const S = ENV_TUNING.slab;
const DEG = Math.PI / 180;

/** unit vector of the edge bearing in xz (bearing b → (sin b, −cos b), GDD §4.1) */
export function slabEdgeDir(slab: Pick<SlabParams, 'edgeBearingDeg'>, out = new THREE.Vector2()): THREE.Vector2 {
  const b = slab.edgeBearingDeg * DEG;
  return out.set(Math.sin(b), -Math.cos(b));
}

/** world y of the slab base and top at altitude h (the slab moves with the ground frame: −h) */
export function slabHeights(slab: Pick<SlabParams, 'base' | 'top'>, altitude: number): { base: number; top: number } {
  return { base: slab.base - altitude, top: slab.top - altitude };
}

const _e = new THREE.Vector2();

/**
 * 0 the sun is visible … 1 it is behind the slab, for an eye in world coordinates (island frame).
 * Below the base: the elevation of the edge line seen along the sun's azimuth against the sun's own
 * elevation, with a soft edge of ±`softDeg`. Inside the cloud the direct sun is gone and comes back over
 * the last 20 m below the top (the second sunrise, R5 §5: ≥ 2.5 s at the climb rate). Above: visible.
 */
export function sunBlockedBySlab(eye: THREE.Vector3, sunDir: THREE.Vector3, slab: SlabParams | null, altitude: number, softDeg = S.sunSoftDeg): number {
  if (!slab) return 0;
  const { base, top } = slabHeights(slab, altitude);
  if (eye.y >= top) return 0;
  if (eye.y >= base) return 1 - THREE.MathUtils.smoothstep(eye.y, top - 20, top);
  const e = slabEdgeDir(slab, _e);
  const sh = Math.hypot(sunDir.x, sunDir.z);
  const sunElev = Math.atan2(sunDir.y, sh) / DEG;
  // horizontal distance from the eye to the edge line, measured along the sun's azimuth
  const cosA = sh > 1e-6 ? (sunDir.x * e.x + sunDir.z * e.y) / sh : 0;
  if (cosA <= 1e-4) return sunElev > 0 ? 1 : 0; // the sun faces away from the edge: every ray toward it meets the slab
  const toEdge = slab.edgeDist - (eye.x * e.x + eye.z * e.y);
  if (toEdge <= 0) return 0; // the eye is already beyond the edge: open sky toward the sun
  const edgeElev = Math.atan2(base - eye.y, toEdge / cosA) / DEG;
  return THREE.MathUtils.smoothstep(sunElev - edgeElev, -softDeg, softDeg);
}

/**
 * How deep the eye is in the cloud, 0 … 1: rises from `rampBelow` m under the base (the lid comes down,
 * the tower top greys first), complete `rampInside` m above the base, falls back over `rampAbove` m above
 * the top (the break-out). Drives the fog density (geometric blend), the fog colour and the sky's mist.
 */
export function cloudFactor(eyeY: number, slab: SlabParams | null, altitude: number): number {
  if (!slab) return 0;
  const { base, top } = slabHeights(slab, altitude);
  if (eyeY < base) return S.atBase * THREE.MathUtils.smoothstep(eyeY, base - S.rampBelow, base);
  if (eyeY <= top) return S.atBase + (1 - S.atBase) * THREE.MathUtils.smoothstep(eyeY, base, base + S.rampInside);
  return 1 - THREE.MathUtils.smoothstep(eyeY, top, top + S.rampAbove);
}

const f1 = (v: number): string => v.toFixed(1);

/**
 * The ceiling in the sky shader: `vec4 slabCeiling(vec3 d, float mu)` → rgb and coverage (0 open sky …
 * 1 cloud) for a view direction d (env frame) and mu = dot(d, sun). Rays that pass under the edge get 0,
 * so the normal sky and the sun disc show there. 2–3 octaves of the shared noise texture (masses,
 * billows, detail fading with distance); a ragged, soft edge; dark denser parts; the underside warms near
 * the edge, most toward the sun; aerial perspective fades the far ceiling into the haze (the fog colour,
 * with the fog chunk's warm tint toward the sun), so it meets the terrain fog at the horizon.
 * Needs ATMOS_GLSL (uSunDir), uTime and uNoise from the sky shader.
 */
export const SLAB_GLSL = /* glsl */ `
uniform float uSlabOn;  // 1 while the eye is below the slab base
uniform vec4 uSlab;     // xy edge direction (xz), z distance eye → edge line along it (m), w base height above the eye (m)
uniform vec2 uSlabEye;  // eye xz (m), for the noise
uniform vec3 uSlabLight; uniform vec3 uSlabShade; uniform vec3 uSlabHaze;
vec4 slabCeiling(vec3 d, float mu) {
  if (uSlabOn < 0.5 || d.y < 0.002) return vec4(0.0);
  float t = uSlab.w / d.y;
  vec2 hp = d.xz * t;
  float toEdge = uSlab.z - dot(hp, uSlab.xy);
  // early out well beyond the edge (most of the open WNW sky)
  if (toEdge < -${f1(S.edgeNoise)}) return vec4(0.0);
  vec2 w = uSlabEye + hp + vec2(${f1(S.drift[0])}, ${f1(S.drift[1])}) * uTime;
  w += (texture2D(uNoise, w / 7000.0 + vec2(0.13, 0.57)).ra - 0.5) * 220.0;
  // stratocumulus cells (the Worley domes), thicker and thinner regions, detail fading with distance
  float cell = texture2D(uNoise, w / 2900.0 + vec2(0.37, 0.11)).g;
  float mass = texture2D(uNoise, w / 9000.0).r;
  float detail = 1.0 - smoothstep(1200.0, 4500.0, t);
  float f = detail > 0.0 ? texture2D(uNoise, w / 1300.0 + vec2(0.71, 0.29)).b - 0.5 : 0.0;
  float n = cell * 0.55 + mass * 0.35 + f * 0.22 * detail + 0.05;
  float e = toEdge + (n - 0.5) * ${f1(S.edgeNoise)};
  float cover = smoothstep(${f1(-S.edgeSoft * 0.4)}, ${f1(S.edgeSoft)}, e);
  if (cover <= 0.0) return vec4(0.0);
  // dark, thick cell cores; lighter cracks between them
  float dens = smoothstep(0.38, 0.78, n);
  vec3 col = mix(uSlabShade * 1.25, uSlabShade * 0.56, dens);
  float fwd = pow(max(mu, 0.0), 8.0);
  float near = 1.0 - smoothstep(0.0, ${f1(S.warmBand)}, e);
  float warm = near * (0.25 + 0.75 * fwd) * (1.0 - 0.6 * dens) + 0.08 * fwd;
  col = mix(col, uSlabLight, clamp(warm, 0.0, 0.9));
  // the thin rim toward the sun (silver lining)
  col += uSlabLight * (1.0 - smoothstep(0.0, ${f1(S.edgeSoft * 1.2)}, e)) * (0.15 + fwd) * 1.3;
  vec2 hd = normalize(d.xz + vec2(1e-5));
  vec2 sd = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(hd, sd) * 0.5 + 0.5;
  vec3 haze = uSlabHaze * mix(vec3(1.0), vec3(1.30, 1.06, 0.80), az * az * az);
  col = mix(col, haze, 1.0 - exp(-t / ${f1(S.hazeDist)}));
  return vec4(col, cover);
}
`;

/**
 * For ground materials (WP3's terrain, the bed and site materials): how much direct sun a world point
 * under the slab gets, 1 lit … 0 in the cloud-bank shade, with the same geometry as `sunBlockedBySlab`
 * (the shade line on the ground lies where proj(115°) ≈ 251 m, R5 §3). Bind the two uniforms to
 * `Environment.slabUniforms` in onBeforeCompile (shader.uniforms.uSlabGround = env.slabUniforms.uSlabGround,
 * likewise uSlabSun); the Environment updates them with the altitude and the sun, so no material is touched
 * per frame and no program changes when the slab is off (uSlabGround.w = 1e6 → 1.0).
 */
export const SLAB_SUN_GLSL = /* glsl */ `
uniform vec4 uSlabGround; // xy edge direction (xz), z edge distance from the island axis (m), w slab base (world y; 1e6 = no slab)
uniform vec4 uSlabSun;    // xyz the sun direction (world), w the soft half-width (rad)
float emaiSlabSun(vec3 p) {
  float dy = uSlabGround.w - p.y;
  if (dy <= 0.0 || uSlabGround.w > 1e5) return 1.0;
  float shl = length(uSlabSun.xz);
  float cosA = dot(uSlabSun.xz, uSlabGround.xy) / max(shl, 1e-5);
  if (cosA <= 1e-4) return 0.0;
  float toEdge = uSlabGround.z - dot(p.xz, uSlabGround.xy);
  if (toEdge <= 0.0) return 1.0;
  float edgeElev = atan(dy, toEdge / cosA);
  float sunElev = atan(uSlabSun.y, shl);
  return 1.0 - smoothstep(-uSlabSun.w, uSlabSun.w, sunElev - edgeElev);
}
`;
