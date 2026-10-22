import * as THREE from 'three';
import type { RenderSystem } from './RenderSystem';
import type { FlightEnvParams } from './zones/types.env';
import { mulberry32 } from './brand/textures';
import { ENV_TUNING, SLAB_GLSL, cloudFactor, slabEdgeDir, slabHeights, sunBlockedBySlab } from './env';

/**
 * Sky dome, sun (shadow frustum follows the player and leans into the view), hemisphere
 * fill, PMREM environment map, aerial-perspective fog and the sunlit cloud sea below the
 * island. The island module tunes everything via `env.set({...})` (also every frame while
 * the finale's dusk blends; the env map then regenerates at most ≈ 1.5× per second, ENV_REGEN_S).
 *
 * Look (art pass): high-altitude golden hour. Deep blue zenith → warm horizon toward the
 * sun (WNW), cool haze away from it, a sun disc that blooms, faint cirrus. The cloud sea is
 * a lit height field (sun-facing billows bright, troughs and the island's own shadow cool)
 * that fades into exactly the sky's below-horizon colour, so the horizon has no seam.
 * Fog is directional: haze toward the sun is warm, away from it blue-grey (aerial perspective).
 *
 * Phase 7 (WP2, plan §5.7): the flight look on top of these params (`setFlight`). Grounded, the sky
 * shader draws the slab ceiling (src/core/env/slab.ts), the fog is 0.0007 and warm-neutral, the cloud
 * sea is off; the eye's depth in the slab ramps the fog and mists the sky (the whiteout); the sun is
 * dimmed by `sunBlocked()`. `params` stays the rc4 (airborne) day look, which the dusk blends from.
 */
/** PERF-12: least seconds between two env-map (PMREM) rebuilds while the environment keeps changing */
const ENV_REGEN_S = 0.66;

export interface EnvParams {
  zenith: THREE.ColorRepresentation;
  /** upper-mid sky band */
  mid: THREE.ColorRepresentation;
  /** horizon away from the sun */
  horizon: THREE.ColorRepresentation;
  /** horizon toward the sun (golden-hour glow) */
  horizonSun: THREE.ColorRepresentation;
  /** below the horizon (far haze over the cloud sea) */
  below: THREE.ColorRepresentation;
  sunColor: THREE.ColorRepresentation;
  sunIntensity: number;
  /** Compass azimuth of the sun in degrees (0 = −Z "north", 90 = +X "east"). */
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  hemiSky: THREE.ColorRepresentation;
  hemiGround: THREE.ColorRepresentation;
  hemiIntensity: number;
  /** sun disc colour (sky) */
  sunDiscColor: THREE.ColorRepresentation;
  fogColor: THREE.ColorRepresentation;
  fogDensity: number;
  /** 'aces' (default) or 'agx' */
  toneMapping: 'aces' | 'agx';
  envIntensity: number;
  cloudSea: boolean;
  cloudY: number;
  /** sunlit cloud tops (multiplied by the sun light) */
  cloudLight: THREE.ColorRepresentation;
  /** sky-lit cloud shade (troughs, the island's shadow) */
  cloudShadow: THREE.ColorRepresentation;
  exposure: number;
  /** high cirrus streaks 0…1 */
  cirrus: number;
  /** stars 0…1 (dusk) */
  stars: number;
  /** bloom strength (ART-V2 §2.7: 0.7 by day, 1.0 at dusk) */
  bloomIntensity: number;
}

/**
 * Defaults: fixed golden hour above the clouds (GDD §9.4/§9.5 retuned in the art pass:
 * the GDD's stone-brown sky read as sepia; the sky is now clear high-altitude blue with a
 * warm sun side — materials stay warm stone neutrals).
 */
export const DEFAULT_ENV: EnvParams = {
  zenith: '#24508f',
  mid: '#6e9bcb',
  horizon: '#c6d3dc',
  horizonSun: '#f4cf98',
  below: '#bcc3c8',
  sunColor: '#ffe0b0',
  sunDiscColor: '#fff4e2',
  sunIntensity: 4.2,
  sunAzimuthDeg: 295,
  sunElevationDeg: 16,
  hemiSky: '#a9c1dc',
  hemiGround: '#b4a898',
  // ART-V2 §2.7: white ceramic in shade must read light grey, not muddy (was 0.62 / env 0.5)
  hemiIntensity: 0.75,
  fogColor: '#b9c6d1',
  fogDensity: 0.0015,
  envIntensity: 0.6,
  cloudSea: true,
  cloudY: -180,
  cloudLight: '#fff6ea',
  cloudShadow: '#9ea6b8',
  exposure: 1.0,
  toneMapping: 'aces',
  cirrus: 0.45,
  stars: 0,
  bloomIntensity: 0.7,
};

// ── shared GLSL: the atmosphere colour for a view direction (sky, cloud-sea fade) ──
const ATMOS_GLSL = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uHorizonSun; uniform vec3 uBelow;
uniform vec3 uSunColor; uniform vec3 uSunDir;
vec3 atmos(vec3 d) {
  float h = d.y;
  vec2 hd = normalize(d.xz + vec2(1e-5));
  vec2 sd = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(hd, sd) * 0.5 + 0.5;
  vec3 horizon = mix(uHorizon, uHorizonSun, az * az * az);
  float hp = max(h, 0.0);
  vec3 upper = mix(uMid, uZenith, smoothstep(0.04, 0.85, hp));
  vec3 col = mix(horizon, upper, 1.0 - exp(-hp * 4.5));
  if (h < 0.0) col = mix(horizon, uBelow, 1.0 - exp(h * 7.0));
  float mu = max(dot(d, uSunDir), 0.0);
  // Mie glow: broad warm wash + tighter aureole
  col += uSunColor * (0.09 * pow(mu, 3.0) + 0.28 * pow(mu, 24.0) + 0.75 * pow(mu, 320.0)) * (1.0 - 0.5 * hp);
  return col;
}
// Phase 7 (WP2): the mist inside the cloud, warmer toward the sun like the fog chunk (so fogged geometry
// melts into it), with the sun as a soft bright patch, never a disc
uniform float uMistK; uniform vec3 uMist;
vec3 mistAt(vec3 d) {
  vec2 hd = normalize(d.xz + vec2(1e-5));
  vec2 sd = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(hd, sd) * 0.5 + 0.5;
  return uMist * mix(vec3(1.0), vec3(1.30, 1.06, 0.80), az * az * az) + uSunColor * pow(max(dot(d, uSunDir), 0.0), 24.0) * 0.12;
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

const SKY_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uSunDisc; uniform float uDisc; uniform float uTime; uniform sampler2D uNoise;
uniform float uCirrus; uniform float uStars;
varying vec3 vDir;
${SLAB_GLSL}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = atmos(d);
  float mu = dot(d, uSunDir);
  // Phase 7: the slab ceiling over a grounded eye; where it covers fully, cirrus, stars and disc are skipped
  vec4 slab = slabCeiling(d, mu);
  bool open = slab.a < 0.999;
  // high cirrus: streaky noise on a plane far above, lit warm toward the sun
  if (open && d.y > 0.0 && uCirrus > 0.001) {
    vec2 uv = d.xz / (d.y + 0.06);
    vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * (uv * 0.32) + vec2(uTime * 0.0016, uTime * 0.0005);
    float a = texture2D(uNoise, vec2(q.x * 0.22, q.y * 1.7)).a;
    float b = texture2D(uNoise, vec2(q.x * 0.55, q.y * 4.2) + 0.41).r;
    float c = smoothstep(0.56, 0.9, a * 0.7 + b * 0.4);
    c *= smoothstep(0.35, 0.75, texture2D(uNoise, q * 0.045 + 0.3).r);
    c *= smoothstep(0.015, 0.2, d.y) * (1.0 - 0.6 * smoothstep(0.5, 1.0, d.y));
    vec3 cc = mix(uHorizon * 1.08, uSunColor * 1.15 + uHorizonSun * 0.25, pow(max(mu, 0.0), 2.5));
    col = mix(col, cc, c * uCirrus * 0.75);
  }
  // stars (dusk): sparse cells, only high up
  if (open && uStars > 0.001 && d.y > 0.05) {
    vec2 sp = vec2(atan(d.x, d.z) * 180.0, d.y * 260.0);
    vec2 cell = floor(sp);
    float r = hash12(cell);
    vec2 f = fract(sp) - vec2(hash12(cell + 7.1), hash12(cell + 3.3));
    float star = step(0.985, r) * smoothstep(0.08, 0.0, length(f)) * (0.4 + 0.6 * hash12(cell + 1.9));
    col += vec3(0.9, 0.93, 1.0) * star * uStars * smoothstep(0.05, 0.35, d.y) * 1.6;
  }
  // sun disc (HDR → blooms) with a soft limb
  float disc = smoothstep(0.99962, 0.99978, mu);
  // (the disc goes first as the mist thickens)
  float clear = 1.0 - uMistK;
  col += uSunDisc * disc * uDisc * 22.0 * clear * clear * clear;
  col = mix(col, slab.rgb, slab.a);
  if (uMistK > 0.0) col = mix(col, mistAt(d), uMistK);
  // dither against banding in the smooth gradient
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CLOUD_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/**
 * Cloud sea: a lit height field. h(x,z) from three texture-noise layers (masses, billows,
 * detail) with a domain warp; normals by finite differences; a two-tap shadow march toward
 * the low sun; height AO in the troughs; forward scattering on thin edges; the island's
 * gear-shaped shadow; fades into atmos() at distance (seamless horizon). ≈ 14 texture
 * fetches per pixel; drawn after the opaque scene (renderOrder) so hidden pixels are skipped.
 */
const CLOUD_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uTime; uniform sampler2D uNoise; uniform vec3 uCam;
uniform vec3 uSunLight; uniform vec3 uCloudLight; uniform vec3 uCloudShadow;
uniform float uFar; uniform float uHaze;
// Phase 7 (WP2): after the break-out the cloud sea appears out of the sky's own colour (uAppear 1 → 0)
uniform float uAppear;
varying vec3 vWorld;
// distance LOD 0 (near) … 1 (far): set once per pixel before marching; the small billows
// (b2) fade to their mean with distance, so mid-distance silhouettes stay broad and smooth
float gLod = 0.0;
// cloud-top height 0…1 (1 = the plane at cloudY); fine detail only for shading
float cloudBase(vec2 p) {
  vec2 q = p + vec2(2.0, 0.7) * uTime;
  vec2 warp = texture2D(uNoise, q / 3600.0 + vec2(0.13, 0.57)).ba - 0.5;
  q += warp * 340.0;
  float mass = texture2D(uNoise, q / 9500.0).r;
  float b1 = texture2D(uNoise, q / 2500.0 + vec2(0.37, 0.11)).g;
  float b2 = mix(texture2D(uNoise, q / 820.0 + vec2(0.21, 0.83)).g, 0.5, gLod);
  float h = mass * 0.3 + b1 * 0.46 + b2 * 0.22 + 0.04;
  // thin regions sink into broad blue gaps; thick regions pile up
  return h * mix(0.62, 1.0, smoothstep(0.22, 0.62, mass));
}
float cloudH(vec2 p, float detail) {
  float f = texture2D(uNoise, (p + vec2(3.4, 1.2) * uTime) / 210.0 + vec2(0.71, 0.29)).b;
  return cloudBase(p) + (f - 0.5) * 0.08 * detail;
}
float islandShadow(vec3 P, vec3 L) {
  float t = (-12.0 - P.y) / max(L.y, 0.02);
  vec2 q = P.xz + L.xz * t;
  float s = 1.0 - smoothstep(80.0, 96.0, length(q));
  for (int i = 0; i < 6; i++) {
    float a = (30.0 + 60.0 * float(i)) * 0.0174533;
    s = max(s, 1.0 - smoothstep(17.0, 31.0, length(q - vec2(sin(a), -cos(a)) * 80.0)));
  }
  float t2 = (-36.0 - P.y) / max(L.y, 0.02);
  vec2 q2 = P.xz + L.xz * t2;
  s = max(s, 1.0 - smoothstep(16.0, 34.0, length(q2)));
  return s;
}
// relief march: the plane (height P.y) is the top of the layer; where does the view ray meet the heaps?
vec3 marchHit(vec3 P, vec3 V, float HS) {
  vec3 R = P;
#if CLOUD_STEPS > 0
  if (-V.y > 0.005) {
    // geometric steps (capped): fine near the entry point (grazing rays hit heap tops early).
    // No per-pixel jitter: without temporal accumulation it showed as dashed edges.
    float stepT = 12.0;
    float t = 0.0;
    float tPrev = 0.0;
    // signed clearance of the ray above the heap surface (m): > 0 above, < 0 inside
    float gCur = (1.0 - cloudBase(P.xz)) * HS;
    float gPrev = gCur;
    float hit = 0.0;
    for (int i = 0; i < CLOUD_STEPS; i++) {
      tPrev = t;
      gPrev = gCur;
      t += stepT;
      stepT = min(stepT * CLOUD_RATIO, CLOUD_MAXSTEP);
      R = P + V * t;
      gCur = R.y - (P.y - (1.0 - cloudBase(R.xz)) * HS);
      if (gCur < 0.0) { hit = 1.0; break; }
    }
    if (hit > 0.5) {
      // secant refinement: converges to the true crossing, so neighbouring pixels agree
      // (bisection snapped to the step grid and left terraces and stair-stepped edges)
      float t0 = tPrev, t1 = t, g0 = gPrev, g1 = gCur;
      for (int k = 0; k < 5; k++) {
        float tm = t0 + (t1 - t0) * clamp(g0 / max(g0 - g1, 1e-4), 0.05, 0.95);
        vec3 Rm = P + V * tm;
        float gm = Rm.y - (P.y - (1.0 - cloudBase(Rm.xz)) * HS);
        if (gm < 0.0) { t1 = tm; g1 = gm; } else { t0 = tm; g0 = gm; }
      }
      R = P + V * (t0 + (t1 - t0) * clamp(g0 / max(g0 - g1, 1e-4), 0.0, 1.0));
    }
  }
#endif
  return R;
}
// lit cloud colour at the relief point R seen along V (before aerial perspective)
vec3 shadeCloud(vec3 R, vec3 V, vec3 L, float HS) {
  float dR = length(R - uCam);
  float detail = 1.0 - smoothstep(700.0, 2000.0, dR);
  float e = 9.0 + dR * 0.012;
  float h0 = cloudBase(R.xz);
  float hx = cloudBase(R.xz + vec2(e, 0.0));
  float hz = cloudBase(R.xz + vec2(0.0, e));
  float fine = cloudH(R.xz, detail) - h0; // ±0.04: brightness texture only (no normal speckle)
  vec3 N = normalize(vec3((h0 - hx) * HS, e, (h0 - hz) * HS));
  // shadow march toward the sun: is a heap above the sun ray after k metres?
  vec2 sd = normalize(L.xz + vec2(1e-5));
  float tanE = L.y / max(length(L.xz), 1e-3);
  float hs1 = cloudBase(R.xz + sd * 70.0);
  float hs2 = cloudBase(R.xz + sd * 200.0);
  float occ = smoothstep(-6.0, 30.0, (hs1 - h0) * HS - 70.0 * tanE);
  occ = max(occ, smoothstep(0.0, 45.0, (hs2 - h0) * HS - 200.0 * tanE) * 0.85);
  float ndl = dot(N, L);
  float diff = smoothstep(-0.55, 0.95, ndl);
  float sunT = diff * (1.0 - 0.7 * occ);
  sunT *= 1.0 - 0.88 * islandShadow(R, L);
  // sky light from above, darker deep in the gaps between heaps
  float ao = mix(0.5, 1.05, smoothstep(0.2, 0.8, h0));
  vec3 col = uCloudShadow * ao * (0.62 + 0.3 * N.y) + uCloudLight * uSunLight * sunT * mix(0.7, 1.0, smoothstep(0.3, 0.75, h0));
  col *= 1.0 + fine * 2.2;
  // deep gaps fall into cool blue shade
  col = mix(col, col * vec3(0.72, 0.8, 0.98), (1.0 - smoothstep(0.18, 0.55, h0)) * 0.7);
  // forward scattering: thin, low edges glow when looking toward the sun
  float mu = max(dot(V, L), 0.0);
  col += uSunLight * uCloudLight * pow(mu, 8.0) * (1.0 - smoothstep(0.3, 0.75, h0)) * 0.35;
  return col;
}
void main() {
  vec3 P = vWorld;
  vec3 V = P - uCam;
  float d = length(V);
  V /= d;
  vec3 L = normalize(uSunDir);
  // one screen row up, as a view-ray offset (derivatives taken in uniform control flow)
  vec3 dVy = dFdy(V);
  // relief depth (m) below the plane; flattens with distance, where marching gets coarse
  float HS = 270.0 * (1.0 - 0.7 * smoothstep(500.0, 2200.0, d));
  gLod = smoothstep(450.0, 1500.0, d);
  vec3 R = marchHit(P, V, HS);
  vec3 col = shadeCloud(R, V, L, HS);
  float dR = length(R - uCam);
#if CLOUD_SS > 0
  // mid distance: heap silhouettes run nearly horizontal and alias row by row. A second ray half
  // a pixel up (2× vertical supersampling) settles them; near and far pixels skip it.
  if (d > 380.0 && d < 4200.0) {
    vec3 V2 = normalize(V + dVy * 0.5);
    if (V2.y < -0.004) {
      vec3 P2 = uCam + V2 * ((P.y - uCam.y) / V2.y);
      vec3 R2 = marchHit(P2, V2, HS);
      col = 0.5 * (col + shadeCloud(R2, V2, L, HS));
    }
  }
#endif
  // aerial perspective: fade into the sky's own below-horizon colour (no seam)
  float fogF = 1.0 - exp(-dR * uHaze);
  fogF = max(fogF, smoothstep(uFar * 0.62, uFar * 0.96, d));
  // silhouette anti-aliasing: where the hit distance jumps between neighbouring pixels (a heap
  // in front of a farther trough), blend with the 2×2 quad's neighbours (screen derivatives)
  float edgeK = smoothstep(0.015, 0.1, fwidth(dR) / max(dR, 1.0));
  vec2 par = mod(floor(gl_FragCoord.xy), 2.0);
  vec3 nx = col + dFdx(col) * (1.0 - 2.0 * par.x);
  vec3 ny = col + dFdy(col) * (1.0 - 2.0 * par.y);
  col = mix(col, (2.0 * col + nx + ny) * 0.25, edgeK);
  col = mix(col, atmos(V), clamp(max(fogF, uAppear), 0.0, 1.0));
  if (uMistK > 0.0) col = mix(col, mistAt(V), uMistK);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Directional aerial perspective for every fog-enabled material (engine-wide chunk patch):
 * haze toward the sun azimuth is warmer and brighter, away from it cooler. Uses only the
 * built-in fog uniforms + viewMatrix, so no material needs extra uniforms.
 * EMAI_FOG_SUN = horizontal sun direction (x, z); the sun only changes elevation at dusk.
 */
function patchFogChunks(sunAzDeg: number): void {
  const a = THREE.MathUtils.degToRad(sunAzDeg);
  const sx = Math.sin(a).toFixed(5),
    sz = (-Math.cos(a)).toFixed(5);
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogView;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogView = mvPosition.xyz;\n#endif';
  C.fog_pars_fragment =
    '#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tvarying float vFogDepth;\n\tvarying vec3 vFogView;\n\t#ifdef FOG_EXP2\n\t\tuniform float fogDensity;\n\t#else\n\t\tuniform float fogNear;\n\t\tuniform float fogFar;\n\t#endif\n#endif';
  C.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	vec3 emaiFogDir = ( vec4( vFogView, 0.0 ) * viewMatrix ).xyz;
	float emaiSun = dot( normalize( emaiFogDir.xz + vec2( 1e-4 ) ), vec2( ${sx}, ${sz} ) ) * 0.5 + 0.5;
	emaiSun *= emaiSun * emaiSun;
	vec3 emaiFog = mix( fogColor, fogColor * vec3( 1.30, 1.06, 0.80 ), emaiSun );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, emaiFog, fogFactor );
#endif`;
}

/** Tileable 256² RGBA noise: R fbm, G billows (inverted Worley + fbm), B fine fbm, A fbm (warp, cirrus). */
function createNoiseTexture(size = 256): THREE.DataTexture {
  const lattice = (period: number, seed: number): Float32Array => {
    const r = mulberry32(seed);
    const g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return g;
  };
  const vnoise = (g: Float32Array, period: number, x: number, y: number): number => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period,
      y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period,
      y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0],
      b = g[y0 * period + x1],
      c = g[y1 * period + x0],
      d = g[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (periods: number[], seed: number, x: number, y: number, lat: Float32Array[]): number => {
    let s = 0,
      amp = 0.5,
      n = 0;
    for (let k = 0; k < periods.length; k++) {
      s += amp * vnoise(lat[k], periods[k], (x * periods[k]) / size, (y * periods[k]) / size);
      n += amp;
      amp *= 0.5;
    }
    void seed;
    return s / n;
  };
  const mk = (periods: number[], seed: number): Float32Array[] => periods.map((p, i) => lattice(p, seed + i * 17));
  const pR = [4, 8, 16, 32, 64],
    pB = [16, 32, 64, 128],
    pA = [4, 8, 16, 32],
    pG = [8, 16, 32];
  const lR = mk(pR, 101),
    lB = mk(pB, 202),
    lA = mk(pA, 303),
    lG = mk(pG, 404);
  // Worley points: 7 × 7 cells (tileable)
  const cells = 7;
  const rp = mulberry32(505);
  const pts: number[] = [];
  for (let i = 0; i < cells * cells; i++) pts.push(rp(), rp());
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const R = fbm(pR, 0, x, y, lR);
      const B = fbm(pB, 0, x, y, lB);
      const A = fbm(pA, 0, x, y, lA);
      // billows: inverted F1 distance, softened, plus a little fbm
      const cx = (x / size) * cells,
        cy = (y / size) * cells;
      const ix = Math.floor(cx),
        iy = Math.floor(cy);
      // smooth minimum over the neighbour distances: rounded creases between heaps
      let acc = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const gx = ix + i,
            gy = iy + j;
          const wx = ((gx % cells) + cells) % cells,
            wy = ((gy % cells) + cells) % cells;
          const px = gx + pts[(wy * cells + wx) * 2],
            py = gy + pts[(wy * cells + wx) * 2 + 1];
          acc += Math.exp(-9 * Math.hypot(px - cx, py - cy));
        }
      const f1 = Math.max(0, -Math.log(acc) / 9);
      // dome profile (not a cone): rounded heaps with creases between the cells
      const rr = Math.min(1, f1 * 1.18);
      const dome = Math.sqrt(Math.max(0, 1 - rr * rr));
      const G = dome * 0.8 + fbm(pG, 0, x, y, lG) * 0.2;
      // stretch fbm contrast (value-noise fbm clusters around 0.5)
      const st = (v: number): number => Math.min(1, Math.max(0, (v - 0.5) * 1.9 + 0.5));
      data[o] = Math.round(st(R) * 255);
      data[o + 1] = Math.round(Math.min(1, G * 1.15) * 255);
      data[o + 2] = Math.round(st(B) * 255);
      data[o + 3] = Math.round(st(A) * 255);
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** The cloud sea's relief defines for a step count (18 on high, 12 on medium or light clouds, 0 on low). */
function cloudDefines(steps: number): { CLOUD_STEPS: number; CLOUD_RATIO: string; CLOUD_MAXSTEP: string; CLOUD_SS: number } {
  // 2× vertical supersampling of mid-distance silhouettes on high only
  return { CLOUD_STEPS: steps, CLOUD_RATIO: steps >= 18 ? '1.24' : '1.32', CLOUD_MAXSTEP: steps >= 18 ? '150.0' : '230.0', CLOUD_SS: steps >= 18 ? 1 : 0 };
}

export class Environment {
  readonly params: EnvParams = { ...DEFAULT_ENV };
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: THREE.Mesh;
  readonly cloudSea: THREE.Mesh;
  readonly fog: THREE.FogExp2;
  readonly sunDir = new THREE.Vector3();
  /** shared tileable noise (RGBA) used by the sky and the cloud sea */
  readonly noise: THREE.DataTexture;
  private skyMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envDirty = true;
  private envAge = 1;
  private time = 0;
  // interiors (ctx.env.enterInterior): ambient multiplier lerps toward the top entry
  private interiors: { ambient: number; background?: THREE.Color; fog?: { color: THREE.Color; density: number } }[] = [];
  private ambientNow = 1;
  private baseSunDir = new THREE.Vector3();
  /** island tilt (degrees) — GDD §5.9; the environment rotates by the inverse */
  readonly tilt = { rollDeg: 0, pitchDeg: 0 };
  private tiltQuat = new THREE.Quaternion();
  private sunLight = new THREE.Color();
  // Phase 7 (WP2): the flight look's per-frame state (slab uniforms, mist, sun blocking)
  private mistColor = new THREE.Color();
  private slabU = new THREE.Vector4();
  private slabEdge = new THREE.Vector2();
  private cloudK = 0;
  private blocked = 0;
  private fogBase = new THREE.Color();
  private fogCloud = new THREE.Color(ENV_TUNING.fog.cloudColor);
  /** which sky the env map was last built for (the climb needs no rebuild, only a change of look does) */
  private envLookBuilt: 'ceiling' | 'open' | null = null;
  /** the eye the per-frame flight state was last computed for */
  private eye = new THREE.Vector3(0, 1.7, 0);
  /**
   * Which side of the cloud the look is on: 'ground' (the ceiling, ground fog and haze) or 'air' (rc4).
   * With a slab the eye decides (below the slab's middle and the fog mode 'ground' → ground), so the
   * switch happens inside the whiteout where the mist hides it; without a slab the fog mode decides.
   */
  private side: 'ground' | 'air' = 'air';
  /** for the tools (liftoff-check: ≤ 1 env-map rebuild during the lift-off) */
  readonly stats = { envRebuilds: 0 };
  /**
   * Shared uniforms of SLAB_SUN_GLSL (src/core/env/slab.ts) for ground materials: the cloud-bank shade on
   * the terrain and the beds (WP3, WP9, WP14) follows the slab, the altitude and the sun without a
   * per-material update. Bind them in onBeforeCompile; never replace the objects.
   */
  readonly slabUniforms = {
    uSlabGround: { value: new THREE.Vector4(0, 0, 0, 1e6) },
    uSlabSun: { value: new THREE.Vector4(0, 1, 0, THREE.MathUtils.degToRad(ENV_TUNING.slab.groundSoftDeg)) },
  };

  constructor(private rs: RenderSystem) {
    const scene = rs.scene;
    patchFogChunks(DEFAULT_ENV.sunAzimuthDeg);
    this.noise = createNoiseTexture();
    const atmosUniforms = (): Record<string, THREE.IUniform> => ({
      uZenith: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uHorizonSun: { value: new THREE.Color() },
      uBelow: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir },
    });
    this.skyMat = new THREE.ShaderMaterial({
      name: 'env:sky',
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        ...atmosUniforms(),
        uSunDisc: { value: new THREE.Color() },
        uDisc: { value: 1 },
        uTime: { value: 0 },
        uNoise: { value: this.noise },
        uCirrus: { value: 0.5 },
        uStars: { value: 0 },
        uMistK: { value: 0 },
        uMist: { value: this.mistColor },
        uSlabOn: { value: 0 },
        uSlab: { value: this.slabU },
        uSlabEye: { value: new THREE.Vector2() },
        uSlabLight: { value: new THREE.Color() },
        uSlabShade: { value: new THREE.Color() },
        uSlabHaze: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.skyMat);
    this.sky.name = 'env:sky';
    this.sky.frustumCulled = false;
    // WP2 day-1 A/B: drawn after the opaques (and the cloud sea) at the far plane, so the depth test
    // skips every covered pixel; the dome writes no depth, so nothing after it is affected
    this.sky.renderOrder = ENV_TUNING.skyAfterOpaques ? 60 : -1000;
    scene.add(this.sky);

    this.cloudMat = new THREE.ShaderMaterial({
      name: 'env:cloud-sea',
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        ...atmosUniforms(),
        uTime: { value: 0 },
        uNoise: { value: this.noise },
        uCam: { value: new THREE.Vector3() },
        uSunLight: { value: this.sunLight },
        uCloudLight: { value: new THREE.Color() },
        uCloudShadow: { value: new THREE.Color() },
        uFar: { value: 3000 },
        uHaze: { value: 1 / 2600 },
        uMistK: { value: 0 },
        uMist: { value: this.mistColor },
        uAppear: { value: 0 },
      },
      defines: { CLOUD_STEPS: 18, CLOUD_RATIO: '1.24', CLOUD_MAXSTEP: '150.0', CLOUD_SS: 1 },
      depthWrite: true,
      fog: false,
    });
    this.cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), this.cloudMat);
    this.cloudSea.name = 'env:cloud-sea';
    this.cloudSea.frustumCulled = false;
    // after the opaque scene: the island hides much of it, early-z skips those pixels
    this.cloudSea.renderOrder = 50;
    scene.add(this.cloudSea);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
    this.hemi.name = 'env:hemi';
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.name = 'env:sun';
    scene.add(this.sun);
    scene.add(this.sun.target);
    rs.sun = this.sun;
    rs.configureSunShadow(this.sun);

    this.fog = new THREE.FogExp2(0xffffff, 0.002);
    scene.fog = this.fog;

    this.pmrem = new THREE.PMREMGenerator(rs.renderer);
    this.set({});
  }

  /** Change any environment parameter. The env map regenerates on a following frame (throttled). */
  set(p: Partial<EnvParams>): void {
    Object.assign(this.params, p);
    const P = this.params;
    for (const m of [this.skyMat, this.cloudMat]) {
      const u = m.uniforms;
      (u.uZenith.value as THREE.Color).set(P.zenith);
      (u.uMid.value as THREE.Color).set(P.mid);
      (u.uHorizon.value as THREE.Color).set(P.horizon);
      (u.uHorizonSun.value as THREE.Color).set(P.horizonSun);
      // grounded, below the horizon is the haze of the Revier (the terrain fades into it), not the cloud sea's
      (u.uBelow.value as THREE.Color).set(this.side === 'ground' ? ENV_TUNING.fog.groundColor : P.below);
      (u.uSunColor.value as THREE.Color).set(P.sunColor);
    }
    const su = this.skyMat.uniforms;
    (su.uSunDisc.value as THREE.Color).set(P.sunDiscColor);
    su.uCirrus.value = P.cirrus;
    su.uStars.value = P.stars;
    const az = THREE.MathUtils.degToRad(P.sunAzimuthDeg),
      el = THREE.MathUtils.degToRad(P.sunElevationDeg);
    this.baseSunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.sunDir.copy(this.baseSunDir).applyQuaternion(this.tiltQuat);
    this.sun.color.set(P.sunColor);
    this.sun.intensity = P.sunIntensity;
    // cloud tops: sun colour × intensity, scaled into a pleasant HDR range (≈ 1.5 at noon-ish)
    this.sunLight.set(P.sunColor).multiplyScalar(P.sunIntensity * 0.38);
    this.hemi.color.set(P.hemiSky);
    this.hemi.groundColor.set(P.hemiGround);
    this.hemi.intensity = P.hemiIntensity;
    const cu = this.cloudMat.uniforms;
    (cu.uCloudLight.value as THREE.Color).set(P.cloudLight);
    (cu.uCloudShadow.value as THREE.Color).set(P.cloudShadow);
    cu.uHaze.value = Math.max(1e-5, P.fogDensity * 0.36);
    this.cloudSea.position.y = P.cloudY;
    this.rs.setExposure(P.exposure);
    this.rs.setBloomIntensity(P.bloomIntensity);
    this.rs.setToneMapping(P.toneMapping);
    this.applyFlightLook();
    this.applyInteriorOverrides();
    this.envDirty = true;
  }

  /**
   * Closed volumes (domes, halls, the keel): scale hemisphere + env light by `ambient`
   * (0…1) and optionally override the background colour and fog. Returns exit().
   */
  enterInterior(o: { ambient: number; background?: THREE.ColorRepresentation; fog?: { color: THREE.ColorRepresentation; density: number } }): () => void {
    const entry = {
      ambient: THREE.MathUtils.clamp(o.ambient, 0, 1),
      background: o.background != null ? new THREE.Color(o.background) : undefined,
      fog: o.fog ? { color: new THREE.Color(o.fog.color), density: o.fog.density } : undefined,
    };
    this.interiors.push(entry);
    this.applyInteriorOverrides();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.interiors = this.interiors.filter((e) => e !== entry);
      this.applyInteriorOverrides();
    };
  }

  /** Leave the most recent interior. */
  exitInterior(): void {
    this.interiors.pop();
    this.applyInteriorOverrides();
  }

  get inInterior(): boolean {
    return this.interiors.length > 0;
  }

  private applyInteriorOverrides(): void {
    const top = this.interiors[this.interiors.length - 1];
    const scene = this.rs.scene;
    if (top?.background) {
      scene.background = top.background;
      this.sky.visible = false;
      this.cloudSea.visible = false;
    } else {
      scene.background = null;
      this.sky.visible = true;
      this.cloudSea.visible = this.cloudSeaShown();
    }
    if (top?.fog) {
      this.fog.color.copy(top.fog.color);
      this.fog.density = top.fog.density;
    } else this.applyFlightFog();
  }

  // ── Phase 7 (WP2 contract, plan §5.2, §5.7; stubs committed by WPS): grounded sky, slab, fog modes ──

  /**
   * The flight environment as last set (FlightEnvParams). rc4 until the island module applies the quest's
   * flight state (src/world/sky.ts: FLIGHT_GROUND / FLIGHT_AIR from src/core/env); `altitude` comes from
   * the WP4 fan-out only. Read-only for everyone else.
   */
  readonly flight: FlightEnvParams = { altitude: 0, slab: null, fog: 'air', cloudSea: true };
  /** while true, the env map is not rebuilt (the lift-off holds it; rebuildEnvMap() still works) */
  envMapHeld = false;

  /**
   * Slab, fog mode, cloud sea and altitude (plan §5.7). Applies at once; a change of the sky the env map
   * shows (the ceiling ↔ the open sky) marks the env map for one throttled rebuild, an altitude change never.
   */
  setFlight(p: Partial<FlightEnvParams>): void {
    const F = this.flight;
    if (p.slab !== undefined) F.slab = p.slab ? { ...p.slab } : null;
    if (p.fog !== undefined) F.fog = p.fog;
    if (p.cloudSea !== undefined) F.cloudSea = p.cloudSea;
    if (p.altitude !== undefined && Number.isFinite(p.altitude)) F.altitude = p.altitude;
    this.updateFlight(this.eye, true);
    this.applyInteriorOverrides();
  }

  /** 0 visible … 1 behind the slab (±2° soft edge), for any eye in world coordinates; drives sun and hemi. */
  sunBlocked(eyeWorld: THREE.Vector3): number {
    return sunBlockedBySlab(eyeWorld, this.baseSunDir, this.flight.slab, this.flight.altitude);
  }

  /** Freeze the env map (PMREM) during the lift-off; on release a pending change rebuilds (throttled). */
  holdEnvMap(hold: boolean): void {
    this.envMapHeld = hold;
  }

  /** Rebuild the env map now, also while held: the one rebuild inside the whiteout (§5.7). */
  rebuildEnvMap(): void {
    this.envDirty = false;
    this.envAge = 0;
    this.regenerateEnvMap();
  }

  /**
   * The sky the env map should show: the ceiling while the look is on the ground side of a slab, else the
   * open sky. In the lift-off it flips inside the cloud (held: WP13's one rebuild there builds 'open').
   */
  private envLook(): 'ceiling' | 'open' {
    return this.flight.slab && this.side === 'ground' ? 'ceiling' : 'open';
  }

  /** the side of the look for an eye (see `side`) */
  private sideFor(eye: THREE.Vector3): 'ground' | 'air' {
    const F = this.flight;
    if (!F.slab) return F.fog;
    const { base, top } = slabHeights(F.slab, F.altitude);
    return eye.y < (base + top) / 2 && F.fog === 'ground' ? 'ground' : 'air';
  }

  /** the colours of the flight look (sky's below-horizon colour, slab tones, the fog's base colour) */
  private applyFlightLook(): void {
    const F = this.flight;
    const P = this.params;
    const ground = this.side === 'ground';
    for (const m of [this.skyMat, this.cloudMat]) (m.uniforms.uBelow.value as THREE.Color).set(ground ? ENV_TUNING.fog.groundColor : P.below);
    const su = this.skyMat.uniforms;
    if (F.slab) {
      (su.uSlabLight.value as THREE.Color).set(F.slab.light);
      (su.uSlabShade.value as THREE.Color).set(F.slab.shade);
      slabEdgeDir(F.slab, this.slabEdge);
    }
    (su.uSlabHaze.value as THREE.Color).set(ground ? ENV_TUNING.fog.groundColor : P.fogColor);
    this.fogBase.set(ground ? ENV_TUNING.fog.groundColor : P.fogColor);
  }

  /**
   * The cloud sea (on in the params): with a slab, once its plane (top − h) is ≥ seaGap below the eye
   * (§5.7: the eye decides, also in the lift-off); without one, as the flight's `cloudSea` says.
   */
  private cloudSeaShown(): boolean {
    const F = this.flight;
    if (!this.params.cloudSea) return false;
    if (!F.slab) return F.cloudSea;
    return this.eye.y - slabHeights(F.slab, F.altitude).top >= ENV_TUNING.slab.seaGap;
  }

  /** scene fog from the flight look: the side's density, ramped geometrically toward the slab's inside the cloud */
  private applyFlightFog(): void {
    const F = this.flight;
    const base = this.side === 'ground' ? ENV_TUNING.fog.ground : this.params.fogDensity;
    const k = this.cloudK;
    const inside = F.slab?.density ?? base;
    this.fog.density = k > 0 ? base * Math.pow(inside / base, k) : base;
    this.fog.color.copy(this.fogBase).lerp(this.fogCloud, k);
  }

  /**
   * Per frame (and on setFlight): where the eye is relative to the slab — the ceiling uniforms, the cloud
   * factor (fog ramp, mist), the cloud sea's plane and visibility, and how much of the sun gets through.
   */
  private updateFlight(eye: THREE.Vector3, force = false): void {
    if (eye !== this.eye) this.eye.copy(eye);
    const side = this.sideFor(eye);
    if (force || side !== this.side) {
      this.side = side;
      this.applyFlightLook();
    }
    if (this.envLookBuilt !== null && this.envLook() !== this.envLookBuilt) this.envDirty = true;
    const F = this.flight;
    const P = this.params;
    const su = this.skyMat.uniforms;
    const slab = F.slab;
    if (slab) {
      const { base, top } = slabHeights(slab, F.altitude);
      const below = eye.y < base;
      // the ceiling only for an eye below the base; inside, the mist takes over; above, the cloud sea
      su.uSlabOn.value = below ? 1 : 0;
      this.slabU.set(this.slabEdge.x, this.slabEdge.y, slab.edgeDist - (eye.x * this.slabEdge.x + eye.z * this.slabEdge.y), base - eye.y);
      (su.uSlabEye.value as THREE.Vector2).set(eye.x, eye.z);
      this.cloudK = cloudFactor(eye.y, slab, F.altitude);
      this.cloudSea.position.y = top;
      this.slabUniforms.uSlabGround.value.set(this.slabEdge.x, this.slabEdge.y, slab.edgeDist, base);
    } else {
      su.uSlabOn.value = 0;
      this.cloudK = 0;
      this.cloudSea.position.y = P.cloudY;
      this.slabUniforms.uSlabGround.value.w = 1e6;
    }
    const ss = this.slabUniforms.uSlabSun.value;
    ss.x = this.sunDir.x;
    ss.y = this.sunDir.y;
    ss.z = this.sunDir.z;
    this.mistColor.copy(this.fogBase).lerp(this.fogCloud, this.cloudK);
    su.uMistK.value = this.cloudK * this.cloudK;
    const cu = this.cloudMat.uniforms;
    cu.uMistK.value = su.uMistK.value;
    // the sea fades in over the 20 m after it is first shown (seaGap below the eye)
    cu.uAppear.value = slab ? 1 - THREE.MathUtils.smoothstep(this.eye.y - this.cloudSea.position.y, ENV_TUNING.slab.seaGap, ENV_TUNING.slab.seaGap + 20) : 0;
    this.blocked = this.sunBlocked(eye);
    this.sun.intensity = P.sunIntensity * (1 - this.blocked);
    // the top interior wins, as in applyInteriorOverrides
    const top = this.interiors[this.interiors.length - 1];
    if (!top?.fog) this.applyFlightFog();
    if (!top?.background) this.cloudSea.visible = this.cloudSeaShown();
  }

  /** Visual island tilt (GDD §5.9): the environment rotates by the inverse; clamp ±3°. */
  setTilt(rollDeg: number, pitchDeg: number): void {
    this.tilt.rollDeg = THREE.MathUtils.clamp(rollDeg, -3, 3);
    this.tilt.pitchDeg = THREE.MathUtils.clamp(pitchDeg, -3, 3);
    this.tiltQuat.setFromEuler(new THREE.Euler(-THREE.MathUtils.degToRad(this.tilt.pitchDeg), 0, -THREE.MathUtils.degToRad(this.tilt.rollDeg)));
    this.sunDir.copy(this.baseSunDir).applyQuaternion(this.tiltQuat);
    this.sky.quaternion.copy(this.tiltQuat);
    this.cloudSea.quaternion.copy(this.tiltQuat);
  }

  /**
   * Regenerate the PMREM environment map from the current sky (cheap, ~2 ms; no sun disc). Phase 7: for a
   * reference eye on the deck at h = 0, never the moving camera, so it shows either the ceiling (grounded)
   * or the open sky, without mist; the climb needs no rebuild.
   */
  private regenerateEnvMap(): void {
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat);
    envScene.add(sky);
    const prevTM = this.rs.renderer.toneMapping;
    this.rs.renderer.toneMapping = THREE.NoToneMapping;
    const u = this.skyMat.uniforms;
    u.uDisc.value = 0;
    const look = this.envLook();
    const slab = this.flight.slab;
    const keep = { on: u.uSlabOn.value as number, slab: this.slabU.clone(), mist: u.uMistK.value as number, eye: (u.uSlabEye.value as THREE.Vector2).clone() };
    u.uSlabOn.value = look === 'ceiling' ? 1 : 0;
    if (slab) this.slabU.set(this.slabEdge.x, this.slabEdge.y, slab.edgeDist, slab.base - ENV_TUNING.envEyeY);
    (u.uSlabEye.value as THREE.Vector2).set(0, 0);
    u.uMistK.value = 0;
    const rt = this.pmrem.fromScene(envScene, 0.035);
    u.uDisc.value = 1;
    u.uSlabOn.value = keep.on;
    this.slabU.copy(keep.slab);
    u.uMistK.value = keep.mist;
    (u.uSlabEye.value as THREE.Vector2).copy(keep.eye);
    this.rs.renderer.toneMapping = prevTM;
    sky.geometry.dispose();
    this.envRT?.dispose();
    this.envRT = rt;
    this.rs.scene.environment = rt.texture;
    this.envLookBuilt = look;
    this.stats.envRebuilds++;
  }

  /** C12a: after a WebGL context restore the env map's render target is empty — rebuild it. */
  invalidate(): void {
    this.envDirty = true;
    this.envAge = 1;
    this.envRT = null;
  }

  /** Build the env map now if it is stale (before a shader warm-up: envMap is part of every program key). */
  prepare(camera: THREE.Camera, focus: THREE.Vector3): void {
    // held (lift-off): only an empty env map (context restore) is rebuilt
    if (this.envDirty && (!this.envMapHeld || !this.envRT)) {
      this.envDirty = false;
      this.envAge = 0;
      this.regenerateEnvMap();
    }
    this.update(0, camera, focus);
  }

  /** Per render frame. `focus` = player feet position (shadow frustum centre). */
  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    this.envAge += dt;
    // PERF-12: while the dusk blends (env.set every frame) the PMREM rebuild (a GPU spike of 10–30 ms)
    // runs at most ≈ 1.5 times a second; the sky itself still blends every frame
    if (this.envDirty && this.envAge > ENV_REGEN_S && (!this.envMapHeld || !this.envRT)) {
      this.envDirty = false;
      this.envAge = 0;
      this.regenerateEnvMap();
    }
    this.time += dt;
    // interior ambient blend
    const target = this.interiors.length ? this.interiors[this.interiors.length - 1].ambient : 1;
    this.ambientNow += (target - this.ambientNow) * (1 - Math.exp(-dt * 6));
    this.hemi.intensity = this.params.hemiIntensity * this.ambientNow * (1 - ENV_TUNING.slab.hemiBlocked * this.blocked);
    this.rs.scene.environmentIntensity = this.params.envIntensity * Math.max(0.05, this.ambientNow);
    this.sky.position.copy(camera.position);
    this.skyMat.uniforms.uTime.value = this.time;
    this.cloudMat.uniforms.uTime.value = this.time;
    (this.cloudMat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
    const far = (camera as THREE.PerspectiveCamera).far;
    if (far) this.cloudMat.uniforms.uFar.value = far;
    this.cloudSea.position.x = camera.position.x;
    this.cloudSea.position.z = camera.position.z;
    // Phase 7: slab, mist, fog ramp, cloud-sea plane and sun blocking for this eye
    this.updateFlight(camera.position);
    // relief steps follow the quality preset (low: flat shading)
    // C10: auto quality lightens the clouds (12 steps, no supersampling) while GPU-bound
    const steps = this.rs.level === 'high' && !this.rs.cloudLite ? 18 : this.rs.level === 'low' ? 0 : 12;
    if (this.cloudMat.defines.CLOUD_STEPS !== steps) {
      Object.assign(this.cloudMat.defines, cloudDefines(steps));
      this.cloudMat.needsUpdate = true;
    }
    this.followShadow(focus, camera);
  }

  /** C10: compiled-ahead cloud variants (kept alive: disposing one would release the program the real material shares) */
  private cloudVariantMats: THREE.ShaderMaterial[] = [];

  /**
   * C10: the cloud sea's other relief variants (18 / 12 / 0 steps are #defines), as meshes to compile
   * in the background. three shares a program between materials with the same source and defines, so
   * light clouds or a preset step of auto quality later switch without compiling a raymarch shader
   * in the middle of play (that cost one 200 ms frame).
   */
  cloudVariants(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'env:cloud-variants';
    for (const steps of [18, 12, 0]) {
      if (steps === this.cloudMat.defines.CLOUD_STEPS || this.cloudVariantMats.some((m) => m.defines.CLOUD_STEPS === steps)) continue;
      const m = this.cloudMat.clone();
      m.defines = { ...this.cloudMat.defines, ...cloudDefines(steps) };
      this.cloudVariantMats.push(m);
      g.add(new THREE.Mesh(this.cloudSea.geometry, m));
    }
    return g;
  }

  private _basis = new THREE.Matrix4();
  private _inv = new THREE.Matrix4();
  private _v = new THREE.Vector3();
  private _f = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 1, 0);
  private _zero = new THREE.Vector3();

  /**
   * Centre the sun's shadow frustum on the player, pushed ~40 % of its extent along the
   * view direction (what you look at gets the shadow texels), snapped to shadow texels.
   */
  private followShadow(focus: THREE.Vector3, camera: THREE.Camera): void {
    const sh = this.sun.shadow;
    const extent = this.rs.preset.shadowExtent;
    const texel = (extent * 2) / sh.mapSize.x;
    camera.getWorldDirection(this._f);
    this._f.y = 0;
    const fl = this._f.length();
    const c = this._v.copy(focus);
    if (fl > 1e-3) c.addScaledVector(this._f, (extent * 0.42) / fl);
    // light-space basis (looking along -sunDir)
    this._basis.lookAt(this._zero, this._f.copy(this.sunDir).negate(), this._up);
    this._inv.copy(this._basis).invert();
    const p = c.applyMatrix4(this._inv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(this._basis);
    // C11c: the shadow map only needs a redraw when the snapped frustum or the sun direction changed
    if (!p.equals(this.sun.target.position) || !this._lastSunDir.equals(this.sunDir)) {
      this._lastSunDir.copy(this.sunDir);
      this.rs.markShadowsDirty();
    }
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 150);
    this.sun.target.updateMatrixWorld();
  }
  private _lastSunDir = new THREE.Vector3();
}
