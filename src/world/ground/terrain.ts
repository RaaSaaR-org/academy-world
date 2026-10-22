/**
 * The terrain render (plan WP3 build 4, §5.5 ground ledger): clipmap rings in ONE draw, ≈ 75 k triangles
 * (≤ 8 draws, ≤ 160 k triangles).
 *
 *  - The yard (y 0 from the dock's top edge out to PLATEAU.flat) is one exact polar mesh: its inner edge is
 *    the wall polyline with the bridge notch, so the slot stays clean right at the spawn. It is also the
 *    yard's collider (colliders.ts).
 *  - Beyond it, T.terrain.levels camera-centred rings (level L has 2·2^L m cells), all centred on one
 *    point snapped to 32 m, so every vertex of the rings up to 32 m cells sits on its level's world grid and
 *    those heights never swim (the two outermost rings, 2.5–5 km out in the fog, may shift a little). The
 *    morph to the next level runs by the camera's Chebyshev distance (CDLOD style), so a re-centring never
 *    pops and the rings meet without cracks. Ring vertices just inside the yard circle
 *    snap onto its rim; deeper ones all go to one point far under the yard (their triangles vanish or hide
 *    under it). The yard and every ring are ONE draw.
 *  - One Lambert program for all of it: heights by texelFetch from the baked grids, normals by central
 *    differences, albedo from the plan masks (a 2 m canvas: tracks, concrete/gravel, fields/pasture),
 *    slope strata on the mining benches, and the analytic sun shade (shade.ts).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZoneContext } from '@/core/zones';
import { DEG, bearingOf, dockWallRadius } from '../layout';
import { T } from './tuning';
import { FIELDS, FLATS, GRID, HALDE, PATHS, PIT, PLATEAU, SHORE, type XZ } from './plan';
import { SHADE_GLSL, SHADE_UNIFORMS, patchSunScale } from './shade';
import type { Heights } from './heights';
import { wallPolyline, wallRadiusTable } from './outline';

export interface Terrain {
  readonly group: THREE.Group;
  /** the yard's geometry (never drawn on its own): the source of the yard collider */
  readonly yard: THREE.Mesh;
  /** triangles drawn per view (clipmap + yard; the walking set, the larger one) */
  readonly triangles: number;
  /** true while the island set is drawn (the eye low over the island) */
  readonly islandMode: boolean;
  dispose(): void;
}

/**
 * The yard's analytic shapes (crisp edges right at the spawn): the concrete flats (rects and discs) and the
 * yard's own roads (the bridge head, the four pad spurs, the Bahnhof road's first stretch; the field tracks are
 * gravel from the masks, here too). Each with its bounding circle, so a fragment skips the shapes it cannot
 * touch, and the rects' rotation precomputed (no trigonometry per fragment: plaza GPU, WPF item 3).
 */
function yardShapes(): { rects: THREE.Vector4[]; rots: THREE.Vector4[]; segs: THREE.Vector4[]; segB: THREE.Vector4[] } {
  const rects: THREE.Vector4[] = [];
  const rots: THREE.Vector4[] = [];
  for (const f of FLATS) {
    if (Math.hypot(...f.at) >= PLATEAU.flat || f.kind !== 'concrete') continue;
    // rects: centre, half extents; discs: centre, radius, −1. The rotation is three's rotation.y (yaw, radians)
    const yaw = ((f.yawDeg ?? 0) * Math.PI) / 180;
    if (f.radius) {
      rects.push(new THREE.Vector4(f.at[0], f.at[1], f.radius, -1));
      rots.push(new THREE.Vector4(1, 0, f.radius, 0));
    } else {
      rects.push(new THREE.Vector4(f.at[0], f.at[1], f.size![0] / 2, f.size![1] / 2));
      rots.push(new THREE.Vector4(Math.cos(yaw), Math.sin(yaw), Math.hypot(f.size![0] / 2, f.size![1] / 2), 0));
    }
  }
  const segs: THREE.Vector4[] = [];
  const segB: THREE.Vector4[] = [];
  for (const p of PATHS) {
    if (p.closed || p.kind !== 'road') continue;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [a, b] = [p.pts[i], p.pts[i + 1]];
      if (Math.hypot(...a) > PLATEAU.flat || Math.hypot(...b) > PLATEAU.flat) continue;
      segs.push(new THREE.Vector4(a[0], a[1], b[0], b[1]));
      segB.push(new THREE.Vector4(p.width / 2, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + p.width / 2));
    }
  }
  return { rects, rots, segs, segB };
}
const YARD = yardShapes();
const WALL_N = 1024;

const NOISE_GLSL = /* glsl */ `
float emaiH21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float emaiVn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(emaiH21(i), emaiH21(i + vec2(1.0, 0.0)), f.x), mix(emaiH21(i + vec2(0.0, 1.0)), emaiH21(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uHNear;
uniform sampler2D uHFar;
uniform vec4 uHNearDim;
uniform vec4 uHFarDim;
float emaiGrid(sampler2D tex, vec4 dim, vec2 p) {
  vec2 f = (p - dim.xy) / dim.z;
  vec2 i0 = clamp(floor(f), vec2(0.0), vec2(dim.w - 2.0));
  vec2 t = clamp(f - i0, 0.0, 1.0);
  ivec2 c = ivec2(i0);
  if (t.x < 1e-4 && t.y < 1e-4) return texelFetch(tex, c, 0).r;
  float a = texelFetch(tex, c, 0).r, b = texelFetch(tex, c + ivec2(1, 0), 0).r;
  float d = texelFetch(tex, c + ivec2(0, 1), 0).r, e = texelFetch(tex, c + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
}
// the near grid blends into the far land over its outer 48 m (heights.ts heightAt does the same)
float emaiH(vec2 p) {
  float e = uHNearDim.x + (uHNearDim.w - 1.0) * uHNearDim.z;
  float m = max(abs(p.x), abs(p.y));
  if (m <= e - 48.0) return emaiGrid(uHNear, uHNearDim, p);
  float f = emaiGrid(uHFar, uHFarDim, p);
  if (m >= e) return f;
  return mix(emaiGrid(uHNear, uHNearDim, p), f, smoothstep(e - 48.0, e, m));
}
`;

const VERT_PARS = /* glsl */ `
${HEIGHT_GLSL}
uniform vec2 uCenter;
uniform vec2 uCam;
uniform float uYardR;
attribute vec4 aMorph;
varying vec3 vGround;
`;

// aMorph = (cell s, odd along x, odd along z, level half extent); s = 0 marks a static vertex (the yard)
const VERT_MAIN = /* glsl */ `
vec3 emaiPos = position;
vec3 objectNormal = vec3(0.0, 1.0, 0.0);
if (aMorph.x > 0.5) {
  float s = aMorph.x;
  vec2 p = uCenter + position.xz;
  float r = length(p);
  if (r < uYardR) {
    if (r > uYardR - 1.5 * s) {
      // a ring vertex just inside the yard: onto the yard's rim (coarse rings a little lower: the yard wins the depth test)
      p *= uYardR / r;
      emaiPos = vec3(p.x, emaiH(p) - max(0.0, s - 4.0) * 0.1, p.y);
    } else {
      // deeper inside: every one to one point far under the yard, so its triangles vanish or hide under the yard
      emaiPos = vec3(0.0, -600.0, 0.0);
    }
  } else {
    float h = emaiH(p);
    vec2 dc = abs(p - uCam);
    // the morph ends where the ring can end (the centre is ≤ snap/2 from the camera) and runs over 30 % of the ring
    float mEnd = aMorph.w - ${(T.terrain.snap / 2 + 1).toFixed(1)};
    float w = smoothstep(mEnd - 0.3 * aMorph.w, mEnd, max(dc.x, dc.y));
    if (w > 0.0) {
      float hc = h;
      if (aMorph.y > 0.5 && aMorph.z > 0.5) hc = 0.5 * (emaiH(p - vec2(s)) + emaiH(p + vec2(s)));
      else if (aMorph.y > 0.5) hc = 0.5 * (emaiH(p - vec2(s, 0.0)) + emaiH(p + vec2(s, 0.0)));
      else if (aMorph.z > 0.5) hc = 0.5 * (emaiH(p - vec2(0.0, s)) + emaiH(p + vec2(0.0, s)));
      h = mix(h, hc, w);
    }
    float s2 = s * (1.0 + w);
    objectNormal = normalize(vec3(emaiH(p - vec2(s2, 0.0)) - emaiH(p + vec2(s2, 0.0)), 2.0 * s2, emaiH(p - vec2(0.0, s2)) - emaiH(p + vec2(0.0, s2))));
    emaiPos = vec3(p.x, h, p.y);
  }
}
vGround = emaiPos;
`;

const FRAG_PARS = /* glsl */ `
${NOISE_GLSL}
${SHADE_GLSL}
uniform sampler2D uMask;
uniform vec4 uMaskDim;
uniform vec3 uCol[9];
uniform sampler2D uWallR;
uniform vec4 uYardRect[${YARD.rects.length}];
uniform vec4 uYardRot[${YARD.rects.length}];
uniform vec4 uYardSeg[${YARD.segs.length}];
uniform vec4 uYardSegB[${YARD.segs.length}];
uniform vec4 uPit;
uniform vec4 uPit2;
uniform vec4 uHalde;
uniform vec4 uHalde2;
uniform float uFieldSat;
varying vec3 vGround;
float emaiWallR(vec2 p) {
  float b = fract(atan(p.x, -p.y) / 6.2831853) * ${WALL_N}.0;
  int i0 = int(floor(b));
  float a = texelFetch(uWallR, ivec2(i0, 0), 0).r, c = texelFetch(uWallR, ivec2((i0 + 1) % ${WALL_N}, 0), 0).r;
  return mix(a, c, fract(b));
}
// the yard's concrete: the apron band around the wall, the ring road, the yard's roads and the flats (crisp,
// antialiased); the band and the ring road first, so most fragments skip every shape by its bounding circle
float emaiYardConc(vec2 p, float r) {
  if (r > 214.0) return 0.0;
  // the apron band: 0 … 9.5 m beyond the wall line; the ring road (r 124, 6 m)
  float d = min(abs(r - emaiWallR(p) - 4.75) - 4.75, abs(r - 124.0) - 3.0);
  for (int i = 0; i < ${YARD.segs.length}; i++) {
    vec4 sb = uYardSegB[i];
    if (length(p - sb.yz) - sb.w > d) continue;
    vec4 sg = uYardSeg[i];
    vec2 a = sg.xy, e = sg.zw - sg.xy;
    float t = clamp(dot(p - a, e) / max(dot(e, e), 1e-4), 0.0, 1.0);
    d = min(d, length(p - a - e * t) - sb.x);
  }
  for (int i = 0; i < ${YARD.rects.length}; i++) {
    vec4 rc = uYardRect[i];
    vec4 ro = uYardRot[i];
    vec2 q = p - rc.xy;
    if (length(q) - ro.z > d) continue;
    if (rc.w < 0.0) {
      d = min(d, length(q) - rc.z);
    } else {
      q = vec2(ro.x * q.x - ro.y * q.y, ro.y * q.x + ro.x * q.y);
      vec2 o = abs(q) - rc.zw;
      d = min(d, length(max(o, 0.0)) + min(max(o.x, o.y), 0.0));
    }
  }
  float aa = max(fwidth(d), 0.02);
  return 1.0 - smoothstep(-aa, aa, d);
}
`;

// uCol: soil, grassDry, grassGreen, crop, gravel, concrete, sand (= straw, timberFresh), clay, water. Plan §2.7
// rule 4 (G-LOOK fix 1, D42): the land reads warm-neutral: dry grass, straw, soil and muted crops dominate,
// green stays in the meadows, the pasture and the hedges, and nothing is brighter green than grassGreen.
const FRAG_COLOR = /* glsl */ `
vec3 P = vGround;
vec4 m = texture2D(uMask, (P.xz - uMaskDim.xy) / uMaskDim.z);
float dist = length(vViewPosition);
float n2 = emaiVn(P.xz * 0.09 + 7.1);
// the fine mottle averages out beyond ≈ 400 m (a 1 m feature is under a pixel there)
float n3 = dist < 420.0 ? mix(emaiVn(P.xz * 0.9 + 3.3), 0.5, smoothstep(260.0, 420.0, dist)) : 0.5;
// the slope needs world up: the ground root never rotates while docked, so use the view matrix
float up = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
float r = length(P.xz);
// the spoil heap is wooded, with forest roads on its two berms (G-LOOK fix 3, D42); computed first, so a
// fragment the canopy covers fully skips the farmland, the fields and the pit (WP17: the heap fills the
// plaza's NNW horizon)
float wood = 0.0;
vec3 canopy = vec3(0.0);
if (r > 430.0) {
  vec2 hd = P.xz - uHalde.xy;
  vec2 hq = vec2(dot(hd, uHalde.zw), dot(hd, vec2(-uHalde.w, uHalde.z)));
  vec2 hb = abs(hq) - uHalde2.xy + uHalde2.z;
  float hin = -(length(max(hb, 0.0)) + min(max(hb.x, hb.y), 0.0) - uHalde2.z);
  if (hin > -20.0) {
    // canopy: clumps of crowns, darker in the hollows; the berms (44–58 m and 102–116 m in) carry forest roads
    float cl = emaiVn(P.xz * 0.07 + 2.0) * 0.6 + emaiVn(P.xz * 0.21 + 9.0) * 0.4;
    canopy = mix(uCol[2], uCol[3], 0.45 + 0.3 * n2) * (0.36 + 0.3 * cl * cl);
    float road = (smoothstep(46.0, 48.0, hin) - smoothstep(54.0, 56.0, hin)) + (smoothstep(104.0, 106.0, hin) - smoothstep(112.0, 114.0, hin));
    canopy = mix(canopy, mix(uCol[0], uCol[1], 0.5) * 0.72, road * 0.55);
    wood = smoothstep(-6.0, 10.0, hin);
  }
}
vec3 col = canopy;
vec3 rock = vec3(0.0);
float face = 0.0;
if (wood < 1.0) {
float n1 = emaiVn(P.xz * 0.012);
// cut grass on the yard, a calm dry/green mix beyond (dry wins: late summer, managed land)
col = mix(uCol[1], uCol[2], mix(smoothstep(0.3, 0.85, n1 * 0.6 + n2 * 0.4) * 0.75, 0.4 + 0.12 * n2, 1.0 - smoothstep(200.0, 230.0, r)));
float fieldK = smoothstep(0.62, 0.8, m.b);
float pastureK = smoothstep(0.22, 0.34, m.b) * (1.0 - fieldK);
// managed farmland beyond the yard (plan §2.7 rule 2): parcels with crops, meadows, fallow and hedgerows
float farm = smoothstep(210.0, 250.0, r) * (1.0 - fieldK) * (1.0 - pastureK);
if (farm > 0.0) {
  vec2 blk = floor(P.xz / 540.0);
  // the block's angle (±0.4 rad): cos and sin by their series (exact to 1e-4 here, no trigonometry per fragment)
  float ang = (emaiH21(blk + 0.37) - 0.5) * 0.8, a2 = ang * ang;
  float ca = 1.0 - a2 * (0.5 - a2 / 24.0), sa = ang * (1.0 - a2 * (1.0 / 6.0 - a2 / 120.0));
  vec2 q = vec2(ca * P.x - sa * P.z, sa * P.x + ca * P.z);
  // parcel sizes vary per block; rows are staggered, so the fields read as a farmed patchwork, not a grid
  vec2 cs = vec2(58.0 + 46.0 * emaiH21(blk + 2.0), 96.0 + 70.0 * emaiH21(blk + 5.0));
  q.x += emaiH21(vec2(floor(q.y / cs.y), blk.x + 0.7)) * cs.x;
  vec2 cid = floor(q / cs);
  vec2 cf = fract(q / cs);
  float h = emaiH21(cid + blk * 13.1 + 0.5);
  float fw = fwidth(q.y);
  float rowsAA = 1.0 - smoothstep(0.12, 0.45, fw);
  float rowWave = smoothstep(0.25, 0.75, abs(fract(q.y / 0.8) - 0.5) * 2.0);
  vec3 parcel;
  // meadow, hay, crop rows, ploughed soil, stubble (straw): two of five are green, and those are muted
  if (h < 0.2) parcel = mix(uCol[1], uCol[2], 0.6 + 0.15 * n2);
  else if (h < 0.4) parcel = mix(uCol[1], uCol[2], 0.25 + 0.15 * n2);
  else if (h < 0.62) parcel = mix(uCol[3], uCol[0], 0.2 + rowWave * rowsAA * 0.45);
  else if (h < 0.8) parcel = uCol[0] * (0.95 + 0.08 * rowWave * rowsAA) * (0.97 + 0.06 * n2);
  else parcel = mix(uCol[1], uCol[6], 0.45 + 0.25 * n2) * (0.96 + 0.06 * rowWave * rowsAA);
  vec2 em = min(cf, 1.0 - cf) * cs;
  float hedge = (1.0 - smoothstep(1.0, 2.4, min(em.x, em.y))) * step(0.4, emaiH21(cid * 1.7 + 3.0));
  parcel = mix(parcel, mix(uCol[2], uCol[3], 0.5) * 0.66, hedge);
  col = mix(col, parcel, farm);
}
col = mix(col, mix(uCol[1], uCol[2], 0.62 + 0.1 * n2), pastureK * 0.75);
// the sites' own fields: crop rows read from afar only (up close the site builds its beds and paths)
float rows = smoothstep(0.3, 0.7, abs(fract(P.z / 1.6) - 0.5) * 2.0) * (1.0 - smoothstep(0.2, 0.7, fwidth(P.z))) * smoothstep(60.0, 140.0, dist);
vec3 siteNear = mix(mix(uCol[1], uCol[2], 0.5), uCol[0], 0.3 + 0.3 * n3) * (0.95 + 0.1 * n2);
col = mix(col, mix(siteNear, mix(uCol[0], uCol[3], 0.3 + rows * (0.35 + 0.2 * n2)), smoothstep(40.0, 120.0, dist)), fieldK);
// the low golden sun saturates whatever it lights: the land's albedo gives some of it back, so the lit fields
// land near the tokens' own warm-neutral (rendered saturation ≈ the tokens', not ≈ 1.6 ×)
col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uFieldSat);
// mining benches and cut faces: sand and clay strata where the ground is steep
float strata = smoothstep(0.35, 0.65, fract(P.y * 0.37 + n2 * 0.25));
rock = mix(uCol[6], uCol[7], strata) * (0.92 + 0.12 * n3);
face = smoothstep(0.93, 0.8, up);
// the mining past (G-LOOK fix 3, D42): beyond the walkable Revier the pit's far and lateral banks show their
// terraces by height (the far grid is 32 m: a tread is two cells, so the faces are bands, not slopes)
if (r > 430.0) {
  float u = P.x * uPit.x - P.z * uPit.y;
  float v = -P.x * uPit.y - P.z * uPit.x;
  // how far inside the far / lateral rim (the bake's rounded rect, without its ≤ 22 m wander)
  vec2 pd = vec2(u - uPit.w, max(uPit2.x - v, v - uPit2.y)) + uPit2.z;
  float q = -(length(max(pd, 0.0)) + min(max(pd.x, pd.y), 0.0) - uPit2.z);
  if (u > uPit.z - 120.0 && q > -260.0) {
    float y = P.y;
    float band = max(max(step(-18.6, y) * step(y, -11.0), step(-10.2, y) * step(y, -2.0)), step(-1.2, y) * step(y, 7.0));
    face = max(face, band * smoothstep(-240.0, -200.0, q) * smoothstep(40.0, 10.0, q));
    // reed and willow scrub along the waterline
    col = mix(col, mix(uCol[2], uCol[0], 0.45) * 0.78, (1.0 - smoothstep(-18.6, -17.2, y)) * step(-20.5, y));
  }
}
col = mix(col, canopy, wood);
face *= 1.0 - wood;
}
col = mix(col, rock, face);
// tracks (gravel), gravel yards and concrete
float conc = max(smoothstep(0.78, 0.92, m.g), emaiYardConc(P.xz, r));
float grav = max(smoothstep(0.25, 0.4, m.g) * (1.0 - conc), smoothstep(0.3, 0.7, m.r));
col = mix(col, uCol[4] * (0.9 + 0.16 * n3), grav);
vec2 jt = abs(fract(P.xz / 6.0) - 0.5);
float joint = 1.0 - 0.08 * smoothstep(0.47, 0.495, max(jt.x, jt.y)) * (1.0 - smoothstep(0.1, 0.4, fwidth(P.x)));
col = mix(col, uCol[5] * (0.95 + 0.07 * n2) * joint, conc);
// near grain (grass blades, gravel), gone by 40 m
float grain = 1.0;
if (dist < 40.0) grain = mix(1.0, 0.9 + 0.2 * emaiVn(P.xz * 4.3 + 1.7), 1.0 - smoothstep(8.0, 40.0, dist));
col *= (0.93 + 0.1 * n3) * grain;
diffuseColor.rgb = col;
float emaiSunK = emaiGroundSun(P.xz, P.y);
`;

class TerrainMaterial extends THREE.MeshLambertMaterial {
  readonly uniforms: Record<string, THREE.IUniform>;
  constructor(shared: Record<string, THREE.IUniform>) {
    super({ color: 0xffffff });
    this.uniforms = shared;
    this.name = 'ground:terrain';
    this.userData.noEnrich = true;
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    Object.assign(sh.uniforms, this.uniforms, SHADE_UNIFORMS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', VERT_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = emaiPos;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_PARS}`).replace('#include <color_fragment>', FRAG_COLOR);
    patchSunScale(sh, 'emaiSunK');
  }
  override customProgramCacheKey(): string {
    return 'emai-ground-terrain';
  }
}

/**
 * One clipmap level: cells of size s, (cells+1)² vertices minus the finer level's hole. `keep` drops the
 * triangles nobody can ever see (wholly beyond the camera's far plane, or wholly sunk under the yard).
 */
function levelGeometry(level: number, cells: number, keep: (t: number[]) => boolean = () => true): THREE.BufferGeometry {
  const s = GRID.near.step * 2 ** level;
  const half = cells / 2;
  const hole = level > 0 ? half / 2 : -1;
  const extent = half * s;
  const index = new Map<number, number>();
  const pos: number[] = [],
    morph: number[] = [],
    idx: number[] = [];
  const vid = (i: number, j: number): number => {
    const key = (i + half) * (cells + 1) + (j + half);
    let v = index.get(key);
    if (v === undefined) {
      v = pos.length / 3;
      index.set(key, v);
      pos.push(i * s, 0, j * s);
      morph.push(s, Math.abs(i) % 2, Math.abs(j) % 2, extent);
    }
    return v;
  };
  for (let j = -half; j < half; j++)
    for (let i = -half; i < half; i++) {
      if (hole > 0 && i >= -hole && i + 1 <= hole && j >= -hole && j + 1 <= hole) continue;
      // the (i, j) → (i + 1, j + 1) diagonal: the odd-odd morph averages along it
      for (const t of [
        [i, j, i, j + 1, i + 1, j + 1],
        [i, j, i + 1, j + 1, i + 1, j],
      ])
        if (keep(t.map((k) => k * s))) idx.push(vid(t[0], t[1]), vid(t[2], t[3]), vid(t[4], t[5]));
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // a normal attribute keeps three off its flat-shading path (the vertex shader computes the real one): 4 bytes
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array((pos.length / 3) * 4).map((_, i) => (i % 4 === 1 ? 127 : 0)), 4, true));
  g.setAttribute('aMorph', new THREE.Float32BufferAttribute(morph, 4));
  g.setIndex(idx);
  return g;
}

/** The yard: polar strips from the wall polyline to the plateau circle (flat, y 0). */
export function yardGeometry(): THREE.BufferGeometry {
  const wall = wallPolyline(720);
  const n = wall.length;
  const rings: ((p: XZ) => XZ)[] = [
    (p) => p,
    (p) => {
      const r = Math.hypot(p[0], p[1]);
      return [(p[0] / r) * (r + 2), (p[1] / r) * (r + 2)];
    },
    (p) => {
      const r = Math.hypot(p[0], p[1]);
      const t = Math.max(r + 6, 132);
      return [(p[0] / r) * t, (p[1] / r) * t];
    },
    (p) => {
      const r = Math.hypot(p[0], p[1]);
      return [(p[0] / r) * PLATEAU.flat, (p[1] / r) * PLATEAU.flat];
    },
  ];
  const pos: number[] = [],
    idx: number[] = [];
  for (const f of rings) for (let k = 0; k < n; k++) {
    const [x, z] = f(wall[k]);
    pos.push(x, 0, z);
  }
  for (let r = 0; r < rings.length - 1; r++)
    for (let k = 0; k < n; k++) {
      const a = r * n + k,
        b = r * n + ((k + 1) % n),
        c = (r + 1) * n + k,
        d = (r + 1) * n + ((k + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array((pos.length / 3) * 4).map((_, i) => (i % 4 === 1 ? 127 : 0)), 4, true));
  g.setAttribute('aMorph', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
  g.setIndex(idx);
  // face up (bearing order is clockwise seen from above)
  const ia = g.getIndex()!.array as Uint32Array | Uint16Array;
  const p = g.getAttribute('position');
  for (let i = 0; i < ia.length; i += 3) {
    const ax = p.getX(ia[i]),
      az = p.getZ(ia[i]),
      bx = p.getX(ia[i + 1]),
      bz = p.getZ(ia[i + 1]),
      cx = p.getX(ia[i + 2]),
      cz = p.getZ(ia[i + 2]);
    if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) {
      const t = ia[i + 1];
      ia[i + 1] = ia[i + 2];
      ia[i + 2] = t;
    }
  }
  return g;
}

// ── the masks (a 2 m canvas drawn from plan.ts; R tracks, G concrete 1 / gravel ≈ 0.45, B field 1 / pasture ≈ 0.4) ──
function drawMasks(): HTMLCanvasElement {
  const half = GRID.near.half;
  const px = Math.round((half * 2) / GRID.near.step);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, px, px);
  const k = px / (half * 2);
  g.setTransform(k, 0, 0, k, half * k, half * k); // metres → pixels (x right, z down)
  g.globalCompositeOperation = 'lighten';
  const rect = (at: XZ, size: XZ, yaw: number, fill: string) => {
    g.save();
    g.translate(at[0], at[1]);
    g.rotate(-yaw * DEG);
    g.fillStyle = fill;
    g.fillRect(-size[0] / 2, -size[1] / 2, size[0], size[1]);
    g.restore();
  };
  for (const f of FIELDS) rect(f.at, f.size, f.yawDeg ?? 0, f.kind === 'field' ? 'rgb(0,0,255)' : 'rgb(0,0,100)');
  for (const f of FLATS) {
    // the yard's own flats are analytic in the shader (crisp edges)
    if (Math.hypot(...f.at) < PLATEAU.flat) continue;
    const fill = f.kind === 'concrete' ? 'rgb(0,255,0)' : 'rgb(0,115,0)';
    if (f.radius) {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(f.at[0], f.at[1], f.radius, 0, Math.PI * 2);
      g.fill();
    } else rect(f.at, f.size!, f.yawDeg ?? 0, fill);
  }
  g.lineCap = g.lineJoin = 'round';
  for (const p of PATHS) {
    // the yard's roads are analytic in the shader; the rest: roads concrete (G), tracks and paths gravel (R), a soft shoulder first
    if (p.open) continue;
    const ch = p.kind === 'road' ? (a: number) => `rgb(0,${a},0)` : (a: number) => `rgb(${a},0,0)`;
    for (const [w, a] of [
      [p.width + 2.5, 110],
      [p.width, 255],
    ] as [number, number][]) {
      g.strokeStyle = ch(a);
      g.lineWidth = w;
      g.beginPath();
      p.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
      if (p.closed) g.closePath();
      g.stroke();
    }
  }
  return c;
}

export function buildTerrain(ctx: ZoneContext, parent: THREE.Object3D, heights: Heights): Terrain {
  const group = new THREE.Group();
  group.name = 'ground:terrain';
  parent.add(group);

  const maskTex = new THREE.CanvasTexture(drawMasks());
  maskTex.colorSpace = THREE.NoColorSpace;
  maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
  maskTex.anisotropy = 4;
  maskTex.flipY = false;
  const C = T.color;
  const shared: Record<string, THREE.IUniform> = {
    uHNear: { value: heights.nearTex },
    uHFar: { value: heights.farTex },
    uHNearDim: { value: new THREE.Vector4(heights.near.x0, heights.near.z0, heights.near.step, heights.near.n) },
    uHFarDim: { value: new THREE.Vector4(heights.far.x0, heights.far.z0, heights.far.step, heights.far.n) },
    uCenter: { value: new THREE.Vector2() },
    uCam: { value: new THREE.Vector2() },
    uYardR: { value: PLATEAU.flat },
    uMask: { value: maskTex },
    uMaskDim: { value: new THREE.Vector4(-GRID.near.half, -GRID.near.half, GRID.near.half * 2, 0) },
    uCol: { value: [C.soil, C.grassDry, C.grassGreen, C.crop, C.gravel, C.concrete, C.sand, C.clay, C.water].map((h) => new THREE.Color(h)) },
    // the pit (lake frame: sin and cos of its bearing, the near waterline, the far one; the lateral ones and the
    // rim's corner radius) and the spoil heap (centre, its axis; half extents, corner radius, height): plan.ts
    uPit: { value: new THREE.Vector4(Math.sin(SHORE.bearing * DEG), Math.cos(SHORE.bearing * DEG), SHORE.line, PIT.far) },
    uPit2: { value: new THREE.Vector4(PIT.north, PIT.south, PIT.round, 0) },
    uHalde: { value: new THREE.Vector4(HALDE.at[0], HALDE.at[1], Math.sin(HALDE.axis * DEG), -Math.cos(HALDE.axis * DEG)) },
    uHalde2: { value: new THREE.Vector4(HALDE.half[0], HALDE.half[1], HALDE.round, HALDE.height) },
    uFieldSat: { value: T.color.fieldSat },
  };
  // the far land may be replaced when the core arrives (a new texture object)
  const offH = heights.onChange(() => {
    shared.uHFar.value = heights.farTex;
    (shared.uHFarDim.value as THREE.Vector4).set(heights.far.x0, heights.far.z0, heights.far.step, heights.far.n);
  });
  const wallTex = new THREE.DataTexture(wallRadiusTable(WALL_N), WALL_N, 1, THREE.RedFormat, THREE.FloatType);
  wallTex.minFilter = wallTex.magFilter = THREE.NearestFilter;
  wallTex.needsUpdate = true;
  Object.assign(shared, {
    uWallR: { value: wallTex },
    uYardRect: { value: YARD.rects },
    uYardRot: { value: YARD.rots },
    uYardSeg: { value: YARD.segs },
    uYardSegB: { value: YARD.segB },
  });
  const mat = new TerrainMaterial(shared);

  // the camera in the ground frame → the snapped centre (before every draw of the first level)
  const cam = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const place = (camera: THREE.Camera): void => {
    group.updateWorldMatrix(true, false);
    inv.copy(group.matrixWorld).invert();
    cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
    const sn = T.terrain.snap;
    (shared.uCenter.value as THREE.Vector2).set(Math.round(cam.x / sn) * sn, Math.round(cam.z / sn) * sn);
    (shared.uCam.value as THREE.Vector2).set(cam.x, cam.z);
  };

  // one draw: every ring and the yard in one geometry (aMorph tells the vertex shader which is which), in two
  // sets the draw range picks from:
  //  - walking: T.terrain.levels camera-centred rings, the finest first (a draw range skips it while it lies
  //    entirely inside the yard), then the yard;
  //  - island (the eye low over the island, WPF item 4 / C1 M1): the same clipmap at a quarter of the density
  //    (T.terrain.islandCells), centred on the dock and morphing from there, then the yard again. From the deck
  //    the land beyond the yard is a thin band at grazing angles, the yard is exact anyway, and the rings'
  //    triangles were what the plaza's terrain cost (gpu-ab and per-draw timers: the cost scaled with the
  //    triangle count, not with the shading). Triangles wholly under the yard or beyond the camera's far plane
  //    are left out of both sets.
  const far = (ctx.camera as THREE.PerspectiveCamera).far || 3000;
  const beyond = (t: number[], reach: number): boolean => Math.hypot(t[0], t[1]) > reach && Math.hypot(t[2], t[3]) > reach && Math.hypot(t[4], t[5]) > reach;
  const snapReach = far + (T.terrain.snap / 2) * Math.SQRT2 + 1;
  const parts: THREE.BufferGeometry[] = [];
  let l0Count = 0;
  let walkCount = 0;
  for (let l = 0; l < T.terrain.levels; l++) {
    const g = levelGeometry(l, T.terrain.cells, (t) => !beyond(t, snapReach));
    if (l === 0) l0Count = g.getIndex()!.count;
    // the outermost ring has no coarser neighbour: no morph
    if (l === T.terrain.levels - 1) {
      const a = g.getAttribute('aMorph') as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) a.setW(i, 1e6);
    }
    walkCount += g.getIndex()!.count;
    parts.push(g);
  }
  const yardGeo = yardGeometry();
  const yardCount = yardGeo.getIndex()!.count;
  parts.push(yardGeo.clone());
  walkCount += yardCount;
  // the island set: centred on the dock, so a triangle sunk under the yard stays sunk (the eye is ≤ ISLAND_EYE m out)
  const ISLAND_EYE = 130;
  const islandReach = far + ISLAND_EYE;
  const I = T.terrain.island;
  let islandCount = 0;
  for (let l = I.from; l <= I.to; l++) {
    const s = GRID.near.step * 2 ** l;
    const g = levelGeometry(l, I.cells, (t) => !beyond(t, islandReach) && (Math.hypot(t[0], t[1]) > PLATEAU.flat - 1.5 * s || Math.hypot(t[2], t[3]) > PLATEAU.flat - 1.5 * s || Math.hypot(t[4], t[5]) > PLATEAU.flat - 1.5 * s));
    if (l === I.to) {
      const a = g.getAttribute('aMorph') as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) a.setW(i, 1e6);
    }
    islandCount += g.getIndex()!.count;
    parts.push(g);
  }
  parts.push(yardGeo.clone());
  islandCount += yardCount;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('ground: merging the terrain failed');
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'ground:terrain:clipmap';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  // drawn after the island's opaques (integrator, wave 1): seen from the deck the island covers most of the
  // terrain, so early-z skips its fragments (gpu-ab at 4K: plaza −0.14 ms, bridge head −0.12 ms; before the
  // water (2 → it stays after), the cloud sea (50) and the sky (60)); the centre is placed per draw
  mesh.renderOrder = 1;
  const l0Half = (T.terrain.cells / 2) * GRID.near.step;
  let islandMode = false;
  mesh.onBeforeRender = (_r, _s, camera) => {
    place(camera);
    // the eye over the island (inside the dock wall) and low: the island set (hysteresis: no flicker at the rim)
    const r = Math.hypot(cam.x, cam.z);
    const wall = dockWallRadius(bearingOf(cam.x, cam.z));
    islandMode = islandMode ? r < wall + 1 && cam.y < I.eyeY + 2 : r < wall - 2 && cam.y < I.eyeY;
    if (islandMode) {
      (shared.uCenter.value as THREE.Vector2).set(0, 0);
      (shared.uCam.value as THREE.Vector2).set(0, 0);
      merged.drawRange.start = walkCount;
      merged.drawRange.count = islandCount;
      return;
    }
    const c = shared.uCenter.value as THREE.Vector2;
    const skip = c.length() + l0Half * Math.SQRT2 < PLATEAU.flat - 2 ? l0Count : 0;
    merged.drawRange.start = skip;
    merged.drawRange.count = walkCount - skip;
  };
  group.add(mesh);
  // the walking set, the most a view draws (the island set is ≈ a fifth of it)
  const triangles = walkCount / 3;
  // the yard's own geometry stays for its collider (never drawn)
  const yard = new THREE.Mesh(yardGeo, mat);
  yard.name = 'ground:terrain:yard-source';
  yard.visible = false;

  return {
    group,
    yard,
    triangles,
    get islandMode() {
      return islandMode;
    },
    dispose() {
      offH();
      mat.dispose();
      maskTex.dispose();
      wallTex.dispose();
      merged.dispose();
      yardGeo.dispose();
    },
  };
}
