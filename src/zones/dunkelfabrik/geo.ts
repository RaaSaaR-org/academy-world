/**
 * Small geometry helpers for the Dunkelfabrik: positioned boxes/cylinders, merge, metre UVs,
 * vertex colours. Every helper returns NON-indexed geometry with position/normal/uv so any
 * mix can be merged into one draw call.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  if (!out.getAttribute('uv')) {
    const n = out.getAttribute('position').count;
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return out;
}

export function place(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(_p.set(x, y, z), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/**
 * Box with UVs in metres (u along the face's horizontal edge, v vertical) divided by `tile`,
 * so a tiling texture keeps its real size on every face.
 */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, tile = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile > 0) {
    // BoxGeometry face order: +x, −x, +y, −y, +z, −z (4 verts each)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const dims: [number, number][] = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let f = 0; f < 6; f++)
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
      }
  }
  return place(prep(g), x, y, z, rx, ry, rz);
}

/** axis-aligned box from min/max corners */
export function boxMM(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 0): THREE.BufferGeometry {
  return box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, tile);
}

export function cyl(rTop: number, rBot: number, h: number, seg: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, open = false): THREE.BufferGeometry {
  return place(prep(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)), x, y, z, rx, ry, rz);
}

export function torus(r: number, tube: number, rs: number, ts: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  return place(prep(new THREE.TorusGeometry(r, tube, rs, ts)), x, y, z, rx, ry, rz);
}

export function sphere(r: number, ws: number, hs: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return place(prep(new THREE.SphereGeometry(r, ws, hs)), x, y, z);
}

export function plane(w: number, h: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  return place(prep(new THREE.PlaneGeometry(w, h)), x, y, z, rx, ry, rz);
}

/** capsule along y, base at y=0 */
export function capsule(r: number, len: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  return place(prep(new THREE.CapsuleGeometry(r, len, 4, 10)), x, y, z, rx, ry, rz);
}

/** merge (disposes the inputs) */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((p) => {
    const q = prep(p);
    for (const name of Object.keys(q.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') q.deleteAttribute(name);
    return q;
  });
  const hasColor = prepared.some((p) => p.getAttribute('color'));
  if (hasColor) for (const p of prepared) if (!p.getAttribute('color')) paint(p, 0xffffff);
  const g = mergeGeometries(prepared, false);
  for (const p of prepared) p.dispose();
  if (!g) throw new Error('[dunkelfabrik] mergeGeometries failed');
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** set a flat vertex colour (for vertexColors materials) */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, o: { cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = !!o.cast;
  me.receiveShadow = o.receive ?? true;
  if (o.name) me.name = o.name;
  return me;
}

/** remap a plane's UVs to a sub-rectangle of an atlas (u0,v0 → u1,v1 in 0…1, v up) */
export function atlasUV(g: THREE.BufferGeometry, u0: number, v0: number, u1: number, v1: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** a 2D canvas + CanvasTexture pair that the zone owns (dispose via ctx.onDispose) */
export interface CanvasTex {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  w: number;
  h: number;
}
export function canvasTex(w: number, h: number, o: { mipmaps?: boolean } = {}): CanvasTex {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (o.mipmaps === false) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
  }
  return { canvas, g, tex, w, h };
}

/** radial gradient sprite texture (white centre → transparent), shared for glows and light pools */
export function radialTex(size = 128, inner = 0, falloff = 1.6): THREE.CanvasTexture {
  const c = canvasTex(size, size);
  const gr = c.g.createRadialGradient(size / 2, size / 2, inner * size, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    gr.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, falloff).toFixed(3)})`);
  }
  c.g.fillStyle = gr;
  c.g.fillRect(0, 0, size, size);
  c.tex.colorSpace = THREE.NoColorSpace;
  c.tex.needsUpdate = true;
  return c.tex;
}

/** vertical gradient (bottom transparent → top opaque) for light cones */
export function coneTex(size = 128): THREE.CanvasTexture {
  const c = canvasTex(8, size);
  const gr = c.g.createLinearGradient(0, size, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0.9)');
  c.g.fillStyle = gr;
  c.g.fillRect(0, 0, 8, size);
  c.tex.colorSpace = THREE.NoColorSpace;
  c.tex.needsUpdate = true;
  return c.tex;
}

export const easeInOut = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
