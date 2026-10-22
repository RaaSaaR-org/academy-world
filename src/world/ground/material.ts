/**
 * One program for every static ground part (dock, yard furniture, Werft, fences): MeshStandard with the
 * colour, roughness, metalness, the baked sun factor and a grain amount per vertex (aRM). The sun factor is
 * the analytic shade of shade.ts times the pit's own darkness (under the island, plan §5.3 rule 6); it
 * scales only the sun, so the sky light still reaches the slot. `GroundBatch` collects parts and merges
 * them into one mesh per scope (one draw each).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchSunScale, sunFactor } from './shade';

/** the lake's swell clock (one for every water material) */
export const WATER_TIME = { value: 0 };

export class GroundMaterial extends THREE.MeshStandardMaterial {
  /** 1 = the lake: a slow analytic swell in the normal (same program, its own uniform) */
  readonly water = { value: 0 };
  constructor(params: THREE.MeshStandardMaterialParameters = {}, o: { water?: boolean } = {}) {
    super({ ...params, color: 0xffffff, roughness: 1, metalness: 1, vertexColors: true });
    this.name = o.water ? 'ground:water' : 'ground:static';
    this.water.value = o.water ? 1 : 0;
    this.userData.noEnrich = true;
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    sh.uniforms.uWater = this.water;
    sh.uniforms.uWaterT = WATER_TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRM;\nvarying vec4 vRM;\nvarying vec3 vGw;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vRM = aRM;
vec4 gwP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  gwP = instanceMatrix * gwP;
#endif
vGw = (modelMatrix * gwP).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vRM;
varying vec3 vGw;
uniform float uWater;
uniform float uWaterT;
float gH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gN(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gH(i), gH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(gH(i + vec3(0.0, 1.0, 0.0)), gH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(gH(i + vec3(0.0, 0.0, 1.0)), gH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(gH(i + vec3(0.0, 1.0, 1.0)), gH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
// the grain only where a part has one, and only near (it is under a pixel beyond ≈ 100 m): the far ring, the
// crowns, the rails and most of the Werft skip both noises (plaza GPU, WPF item 3)
float gG = 0.5;
if (vRM.w > 0.0) {
  float gD = length(vViewPosition);
  if (gD < 110.0) gG = mix(gN(vGw * 0.6) * 0.65 + gN(vGw * 2.3 + 4.1) * 0.35, 0.5, smoothstep(60.0, 110.0, gD));
}
diffuseColor.rgb *= mix(1.0, 0.9 + 0.2 * gG, vRM.w);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
if (uWater > 0.5) {
  // the lake: three swells from the WNW and a ripple; the slope fades with distance (no shimmer)
  vec2 p = vGw.xz;
  float t = uWaterT;
  vec2 g = 0.020 * cos(dot(p, vec2(0.031, 0.012)) + t * 0.55) * vec2(0.031, 0.012) / 0.033;
  g += 0.016 * cos(dot(p, vec2(-0.017, 0.044)) + t * 0.71) * vec2(-0.017, 0.044) / 0.047;
  g += 0.010 * cos(dot(p, vec2(0.093, -0.061)) + t * 1.3) * vec2(0.093, -0.061) / 0.111;
  g += 0.006 * cos(dot(p, vec2(0.21, 0.17)) + t * 2.1) * vec2(0.21, 0.17) / 0.27;
  float fade = 1.0 - smoothstep(250.0, 1800.0, length(vViewPosition));
  normal = normalize((viewMatrix * vec4(normalize(vec3(-g.x * fade * 9.0, 1.0, -g.y * fade * 9.0)), 0.0)).xyz);
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * vRM.x + (gG - 0.5) * 0.12 * vRM.w, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vRM.y;');
    patchSunScale(sh, 'vRM.z');
  }
  override customProgramCacheKey(): string {
    return 'emai-ground-static';
  }
}

export interface PartStyle {
  color: THREE.ColorRepresentation;
  rough?: number;
  metal?: number;
  /** world-space grain (concrete mottling) 0…1 */
  grain?: number;
  /** extra sun factor per vertex (the pit), multiplied with the analytic shade */
  sun?: (x: number, y: number, z: number) => number;
  /** ambient darkening per vertex 0…1 (the pit floor), multiplied into the colour */
  ao?: (x: number, y: number, z: number) => number;
  /** skip the analytic shade (parts that move with the island's tilt are never far from it) */
  noShade?: boolean;
}

const _c = new THREE.Color();
const _v = new THREE.Vector3();

/** Collects static parts (ground-frame coordinates) and merges them into one GroundMaterial mesh. */
export class GroundBatch {
  private parts: THREE.BufferGeometry[] = [];
  triangles = 0;

  add(geo: THREE.BufferGeometry, style: PartStyle, matrix?: THREE.Matrix4): this {
    // always a private copy: templates are reused with several matrices
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    const p = g.getAttribute('position');
    const n = p.count;
    const col = new Float32Array(n * 3);
    const rm = new Float32Array(n * 4);
    _c.set(style.color);
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(p, i);
      const ao = style.ao ? style.ao(_v.x, _v.y, _v.z) : 1;
      col[i * 3] = _c.r * ao;
      col[i * 3 + 1] = _c.g * ao;
      col[i * 3 + 2] = _c.b * ao;
      // the analytic shade only where some sun is left (the pit's parts skip it)
      const own = style.sun ? style.sun(_v.x, _v.y, _v.z) : 1;
      const s = own > 0 && !style.noShade ? own * sunFactor(_v.x, _v.z, _v.y) : own;
      rm[i * 4] = style.rough ?? 0.9;
      rm[i * 4 + 1] = style.metal ?? 0;
      rm[i * 4 + 2] = s;
      rm[i * 4 + 3] = style.grain ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRM', new THREE.BufferAttribute(rm, 4));
    this.parts.push(g);
    this.triangles += n / 3;
    return this;
  }

  /** A part that already carries its own `color` and `aRM` (gradients): taken as it is. */
  addPainted(geo: THREE.BufferGeometry): this {
    const g = floats(geo.index ? geo.toNonIndexed() : geo.clone());
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aRM'].includes(n)) g.deleteAttribute(n);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    this.parts.push(g);
    this.triangles += g.getAttribute('position').count / 3;
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  /** Take over another batch's parts, after this one's (a draw range can then show this batch's part alone). */
  absorb(other: GroundBatch): this {
    this.parts.push(...other.parts);
    this.triangles += other.triangles;
    other.parts = [];
    other.triangles = 0;
    return this;
  }

  /** Merge into one mesh (null when empty). */
  build(material: THREE.Material, name: string, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts = [];
    if (!merged) throw new Error(`ground: merging ${name} failed`);
    compact(merged);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = o.cast ?? true;
    mesh.receiveShadow = o.receive ?? true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/**
 * 24 bytes a vertex instead of 52: the normal as Int8, the colour and aRM as Uint8 (normalized; colours
 * over 1 clamp). The ground's static vertex data is uploaded with the first frame, so it should be small.
 */
function compact(g: THREE.BufferGeometry): void {
  const pack = (name: string, size: number, Arr: typeof Int8Array | typeof Uint8Array, scale: number): void => {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a || !(a.array instanceof Float32Array)) return;
    const out = new Arr(a.count * size);
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < size; k++) {
        const v = k < a.itemSize ? a.array[i * a.itemSize + k] : 0;
        out[i * size + k] = Math.round(THREE.MathUtils.clamp(v, Arr === Int8Array ? -1 : 0, 1) * scale);
      }
    g.setAttribute(name, new THREE.BufferAttribute(out, size, true));
  };
  pack('normal', 4, Int8Array, 127);
  pack('color', 3, Uint8Array, 255);
  pack('aRM', 4, Uint8Array, 255);
}
/** back to Float32 attributes (a compact part joining a batch) */
function floats(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const [name, size] of [
    ['normal', 3],
    ['color', 3],
    ['aRM', 4],
  ] as [string, number][]) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a || a.array instanceof Float32Array) continue;
    const out = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  return g;
}

// ── geometry helpers ──────────────────────────────────────────────────────────

export type P2 = [number, number];

/** Offset a closed or open xz polyline by d along its left-hand normal (mitred joins). */
export function offsetPolyline(pts: P2[], d: number, closed: boolean, inward: (p: P2) => P2 = (p) => [-p[0], -p[1]]): P2[] {
  const n = pts.length;
  const normals: P2[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n];
    let nx = -(b[1] - a[1]),
      nz = b[0] - a[0];
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const w = inward(mid);
    if (nx * w[0] + nz * w[1] < 0) {
      nx = -nx;
      nz = -nz;
    }
    normals.push([nx, nz]);
  }
  return pts.map((p, i) => {
    const prev = closed ? normals[(i - 1 + segs) % segs] : normals[Math.max(0, i - 1)];
    const next = closed ? normals[i % segs] : normals[Math.min(segs - 1, i)];
    let mx = prev[0] + next[0],
      mz = prev[1] + next[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const cos = Math.max(0.35, mx * next[0] + mz * next[1]);
    return [p[0] + (mx * d) / cos, p[1] + (mz * d) / cos];
  });
}

/** Quad strip between two equally long 3D polylines (a → b across), flat normals per quad. */
export function stripBetween(a: THREE.Vector3[], b: THREE.Vector3[], closed: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = a.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z, a[j].x, a[j].y, a[j].z);
    pos.push(a[j].x, a[j].y, a[j].z, b[i].x, b[i].y, b[i].z, b[j].x, b[j].y, b[j].z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A flat-shaded strip from a profile segment swept along a polyline: (d, y) in the polyline's offset frame. */
export function sweepSegment(line: P2[], closed: boolean, from: P2, to: P2, inward?: (p: P2) => P2): THREE.BufferGeometry {
  const A = offsetPolyline(line, from[0], closed, inward).map(([x, z]) => new THREE.Vector3(x, from[1], z));
  const B = offsetPolyline(line, to[0], closed, inward).map(([x, z]) => new THREE.Vector3(x, to[1], z));
  return stripBetween(A, B, closed);
}

/** Orient every triangle so its normal points along `toward(centroid)` (strips of unknown winding). */
export function orient(g: THREE.BufferGeometry, toward: (c: THREE.Vector3) => THREE.Vector3): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    m = new THREE.Vector3(),
    nrm = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    nrm.subVectors(b, a).cross(m.subVectors(c, a));
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (nrm.dot(toward(m)) < 0) {
      p.setXYZ(i + 1, c.x, c.y, c.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A box between two points (a beam) as geometry: width w, height h. */
export function beamGeo(a: THREE.Vector3, b: THREE.Vector3, w: number, h = w): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, h);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

export const mat4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
