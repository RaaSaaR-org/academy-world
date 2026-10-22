/**
 * Geometry helpers: vertex-coloured merged meshes (one draw call per material),
 * instanced atlas quads (per-instance UV rect), small canvas helpers.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Normalise a primitive for merging: non-indexed? no — keep indexed, drop uv unless asked, add colour. */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, keepUv = false): THREE.BufferGeometry {
  const g = geo;
  if (!keepUv) g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  _c.set(color).convertSRGBToLinear();
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.index) g.setIndex([...Array(n).keys()]);
  return g;
}

/** Place a geometry: position, Euler rotation (rad), scale. Returns the same geometry. */
export function place(geo: THREE.BufferGeometry, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  geo.applyMatrix4(_m);
  return geo;
}

/** Collects coloured parts and merges them. */
export class Painter {
  readonly parts: THREE.BufferGeometry[] = [];
  box(w: number, h: number, d: number, p: [number, number, number], color: THREE.ColorRepresentation, r?: [number, number, number]): this {
    this.parts.push(place(paint(new THREE.BoxGeometry(w, h, d), color), p, r));
    return this;
  }
  rbox(w: number, h: number, d: number, radius: number, p: [number, number, number], color: THREE.ColorRepresentation, r?: [number, number, number]): this {
    this.parts.push(place(paint(new RoundedBoxGeometry(w, h, d, 2, radius), color), p, r));
    return this;
  }
  /** cylinder along Y (rotate with r for other axes) */
  cyl(rt: number, rb: number, h: number, p: [number, number, number], color: THREE.ColorRepresentation, r?: [number, number, number], seg = 16): this {
    this.parts.push(place(paint(new THREE.CylinderGeometry(rt, rb, h, seg), color), p, r));
    return this;
  }
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, p: [number, number, number] = [0, 0, 0], r?: [number, number, number], s?: [number, number, number]): this {
    this.parts.push(place(paint(geo, color), p, r, s));
    return this;
  }
  /** like add() but keeps the uv attribute (for textured merges; all parts must keep uv) */
  addUv(geo: THREE.BufferGeometry, p: [number, number, number] = [0, 0, 0], r?: [number, number, number]): this {
    this.parts.push(place(paint(geo, 0xffffff, true), p, r));
    return this;
  }
  merge(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    if (!g) throw new Error('[prueffeld] merge failed');
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  mesh(material: THREE.Material, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
    const m = new THREE.Mesh(this.merge(), material);
    m.castShadow = !!o.cast;
    m.receiveShadow = o.receive ?? true;
    return m;
  }
}

/**
 * Patch a material so an InstancedMesh reads its map UVs from a per-instance rect
 * `aUvRect = (u0, v0, du, dv)`: uv' = u0v0 + uv · dudv (negative du/dv flip).
 */
export function patchInstancedUv(mat: THREE.Material, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUvRect;').replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = aUvRect.xy + uv * aUvRect.zw;
#endif
#ifdef USE_EMISSIVEMAP
  vEmissiveMapUv = aUvRect.xy + uv * aUvRect.zw;
#endif`,
    );
  };
  mat.customProgramCacheKey = () => key;
}

/** Instanced quads (unit plane, origin at the bottom edge centre, facing +z) with per-instance UV rects. */
export function atlasQuads(count: number, material: THREE.Material): { mesh: THREE.InstancedMesh; uv: THREE.InstancedBufferAttribute } {
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  uv.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aUvRect', uv);
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // instances start hidden (zero scale) and move: a bounding sphere computed from that would cull them forever
  mesh.frustumCulled = false;
  return { mesh, uv };
}

/** Hidden instance matrix (zero scale). */
export const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** A canvas + CanvasTexture pair that the zone owns (dispose via ctx.onDispose). */
export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, g, tex };
}

/** Rounded rectangle path. */
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Fit text into a width by shrinking the font size; returns the size used. */
export function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: string, family: string): number {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (s > 8 && g.measureText(text).width > maxW) {
    s -= 1;
    g.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

export const FONT_DISPLAY = "'Space Grotesk', sans-serif";
export const FONT_SANS = "'Geist', sans-serif";
export const FONT_MONO = "'Geist Mono', ui-monospace, monospace";

/** Fake volumetric light cone (additive, soft edges, fades toward the floor). Apex at the origin, pointing −y. */
export function coneMaterial(color: THREE.ColorRepresentation, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vT = clamp(-position.y, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float along = (1.0 - vT) * 0.75 + 0.25;
        float a = edge * along * smoothstep(0.0, 0.06, vT) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Additive radial glow sprite material (light pools, lamp glare). */
export function glowMaterial(color: THREE.ColorRepresentation, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** BoxGeometry UVs in metres / period (so tiling textures keep their scale on any box). */
export function metricBoxUv(geo: THREE.BufferGeometry, w: number, h: number, d: number, period: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)) > 0.5,
      ny = Math.abs(nrm.getY(i)) > 0.5;
    const fu = nx ? d : w,
      fv = ny ? d : h;
    uv.setXY(i, (uv.getX(i) * fu) / period, (uv.getY(i) * fv) / period);
  }
  return geo;
}

/** Corrugated-sheet normal map (vertical ribs), tiling. */
export function ribNormalMap(): THREE.CanvasTexture {
  const { canvas, g, tex } = makeCanvas(64, 8);
  const img = g.createImageData(64, 8);
  for (let x = 0; x < 64; x++) {
    // trapezoid rib profile → slope
    const ph = (x / 64) * Math.PI * 2;
    const slope = Math.cos(ph) * 0.55 + Math.cos(ph * 3) * 0.12;
    const nx = -slope,
      nz = 1;
    const l = Math.hypot(nx, nz);
    for (let y = 0; y < 8; y++) {
      const o = (y * 64 + x) * 4;
      img.data[o] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      img.data[o + 1] = 128;
      img.data[o + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  void canvas;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
