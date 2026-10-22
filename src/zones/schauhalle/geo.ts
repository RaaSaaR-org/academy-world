/**
 * Geometry helpers for the Schauhalle: positioned boxes, cylinders and planes as NON-indexed geometry
 * with position/normal/uv, so any mix merges into one draw per material, and a small canvas texture
 * type (one canvas, one texture, a redraw function that re-runs on language change).
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
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  return out;
}

export function place(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(_p.set(x, y, z), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0): THREE.BufferGeometry {
  return place(prep(new THREE.BoxGeometry(w, h, d)), x, y, z, 0, ry, 0);
}

/** axis-aligned box from its min/max corners */
export function boxMM(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  return box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

export function cyl(rTop: number, rBot: number, h: number, seg: number, x = 0, y = 0, z = 0, open = false): THREE.BufferGeometry {
  return place(prep(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)), x, y, z);
}

export function ring(rIn: number, rOut: number, seg: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return place(prep(new THREE.RingGeometry(rIn, rOut, seg)), x, y, z, -Math.PI / 2, 0, 0);
}

/** a vertical plane (its normal toward +z before `ry`) */
export function plane(w: number, h: number, x = 0, y = 0, z = 0, ry = 0, rx = 0): THREE.BufferGeometry {
  return place(prep(new THREE.PlaneGeometry(w, h)), x, y, z, rx, ry, 0);
}

/** a plane with its UVs set to a sub-rectangle of an atlas (u0, v0)–(u1, v1) */
export function atlasPlane(w: number, h: number, uv: readonly [number, number, number, number], x = 0, y = 0, z = 0, ry = 0, rx = 0): THREE.BufferGeometry {
  const g = plane(w, h, x, y, z, ry, rx);
  const a = g.getAttribute('uv') as THREE.BufferAttribute;
  const [u0, v0, u1, v1] = uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, u0 + a.getX(i) * (u1 - u0), v0 + a.getY(i) * (v1 - v0));
  return g;
}

export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
  if (list.length > 1) for (const x of list) x.dispose();
  if (!g) throw new Error('schauhalle: merge failed');
  g.computeBoundingSphere();
  return g;
}

/** One mesh from many geometries of one material (static: matrices baked once). */
export function mesh(list: THREE.BufferGeometry[], mat: THREE.Material, name: string, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(merge(list), mat);
  m.name = name;
  m.castShadow = !!o.cast;
  m.receiveShadow = o.receive ?? true;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

export interface CanvasTex {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly w: number;
  readonly h: number;
}

export function canvasTex(w: number, h: number, o: { mips?: boolean } = {}): CanvasTex {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (o.mips === false) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
  }
  return { canvas, g, tex, w, h };
}

/** word wrap into lines that fit `maxW` at the current font */
export function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** a rounded-rectangle path */
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export const FONT = {
  display: (px: number, weight = 700): string => `${weight} ${px}px 'Space Grotesk', sans-serif`,
  sans: (px: number, weight = 400): string => `${weight} ${px}px 'Geist', sans-serif`,
  mono: (px: number, weight = 400): string => `${weight} ${px}px 'Geist Mono', ui-monospace, monospace`,
};
