/**
 * Small helpers shared by the Greifwerkstatt modules: vertex-colour painting + merging (one draw
 * call per rigid part), a DOM helper for operate panels, panel CSS, and the zone's own colours.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZoneContext } from '@/core/zones';

export type Ctx = ZoneContext;

/** CMF colours used as vertex colours (sRGB hex → converted to linear by THREE.Color). */
export const COL = {
  shell: 0xe7e5e4, // stone-200 (robot shell, like EMI)
  shellShadow: 0xa8a29e,
  chassis: 0x292929,
  structure: 0x1c1917,
  carbon: 0x1f1f1f,
  steel: 0xb8b2ac,
  egg: 0xfaf9f6,
  orange: 0xff6700,
  teal: 0x2dd4bf,
  amber: 0xfbbf24,
  yolk: 0xf2a516,
} as const;

const _c = new THREE.Color();

/** Adds a constant vertex colour attribute (linear RGB). Returns the geometry. */
export function paint<T extends THREE.BufferGeometry>(geo: T, hex: number): T {
  _c.setHex(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Merge geometries (all must share attributes); disposes the inputs. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(geos, false);
  if (!out) throw new Error('[greifwerkstatt] mergeGeometries failed (attribute mismatch)');
  for (const g of geos) g.dispose();
  return out;
}

/** Box centred at (x, y, z), optionally rotated (Euler XYZ). */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

/** Cylinder along Y centred at (x, y, z). */
export function cyl(rTop: number, rBot: number, h: number, seg: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y, z);
}

/** Cylinder along Z (a joint axle perpendicular to an arm plane) centred at (x, y, z). */
export function axle(r: number, len: number, seg: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);
}

/** Planar UVs in metres from x/z (for 1 m floor tiles across merged floor patches). */
export function planarUv(geo: THREE.BufferGeometry, scale = 1): THREE.BufferGeometry {
  const p = geo.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * scale;
    uv[i * 2 + 1] = p.getZ(i) * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function setShadow(o: THREE.Object3D, cast: boolean, receive = true): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

// ── DOM (operate panels) ─────────────────────────────────────────────────────

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c != null && c !== false) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

/** Segmented control (.seg) with an `on` state; returns the element and a setter. */
export function seg<T extends string | number | boolean>(
  options: { value: T; label: string; disabled?: boolean; title?: string }[],
  current: T,
  onPick: (v: T) => void,
): { el: HTMLElement; set(v: T): void } {
  const el = h('div', { class: 'seg gw-seg' });
  const buttons = options.map((o) => {
    const b = h('button', {}, o.label);
    if (o.disabled) {
      b.disabled = true;
      b.style.opacity = '0.38';
      b.style.cursor = 'not-allowed';
    }
    if (o.title) b.title = o.title;
    b.onclick = () => !o.disabled && onPick(o.value);
    el.append(b);
    return b;
  });
  const set = (v: T): void => options.forEach((o, i) => buttons[i].classList.toggle('on', o.value === v));
  set(current);
  return { el, set };
}

/**
 * Row label (CSS-uppercased mono) with an optional symbol that keeps its case: „HUB a", not „HUB A"
 * (that would read as ampere), „BEWEGLICHKEIT σ_min", not „Σ_MIN" (a sum sign).
 */
export function kLabel(word: string, sym?: string, style = ''): HTMLElement {
  return h('span', { class: 'gw-k', style }, word, sym ? h('span', { class: 'keep-case', style: 'text-transform:none' }, ` ${sym}`) : null);
}

/** Scoped panel CSS (injected once per panel element). */
export const PANEL_CSS = `
.gw { font-size: 13px; color: var(--text-2); }
.gw .gw-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.gw .gw-help { margin: 6px 0 4px; line-height: 1.4; font-size: 12.5px; }
.gw .gw-row { display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap; }
.gw .gw-row > .gw-k { width: 96px; flex: none; font-family: var(--font-mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
.gw .gw-seg button { padding: 5px 9px; }
.gw .gw-mono { font-family: var(--font-mono); letter-spacing: .02em; color: var(--text); }
.gw .gw-big { font-family: var(--font-mono); font-size: 15px; color: var(--text); }
.gw .gw-warn { color: var(--warning); }
.gw .gw-teal { color: var(--teal); }
.gw .gw-orange { color: var(--orange); }
.gw .gw-muted { color: var(--text-3); }
.gw .gw-joint { display:grid; grid-template-columns: 34px 54px 1fr 30px 30px; gap: 6px; align-items:center; padding: 4px 6px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; }
.gw .gw-joint.on { border-color: var(--border); background: rgba(255,255,255,.03); }
.gw .gw-joint .gw-jn { font-family: var(--font-mono); color: var(--text-3); }
.gw .gw-joint.on .gw-jn { color: var(--orange); }
.gw .gw-bar { position: relative; height: 6px; border-radius: 999px; background: var(--elevated); overflow: hidden; }
.gw .gw-bar > i { position:absolute; top:0; bottom:0; width: 3px; margin-left:-1.5px; background: var(--text); border-radius: 2px; }
.gw .gw-bar > b { position:absolute; top:0; bottom:0; left:50%; width:1px; background: var(--border); }
.gw .gw-mini { font-family: var(--font-sans); font-size: 13px; padding: 4px 0; width: 30px; justify-content:center; border-radius: 6px; }
.gw .gw-chips { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:8px; }
.gw .gw-src { font-size: 11.5px; color: var(--text-3); line-height: 1.35; }
.gw .gw-result { margin-top: 8px; padding: 7px 10px; border-radius: 8px; background: rgba(255,255,255,.035); border: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 12.5px; color: var(--text); min-height: 18px; }
.gw .gw-result.bad { border-color: rgba(251,191,36,.35); color: var(--warning); }
.gw .gw-result.good { border-color: rgba(45,212,191,.35); color: var(--teal); }
.gw input[type=range] { flex: 1; accent-color: #2DD4BF; min-width: 120px; }
.gw canvas { display:block; }
.gw .gw-prog { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-3); margin-top: 6px; }
.gw .gw-prog b { color: var(--teal); font-weight: 500; }
.gw .btn { padding: 8px 13px; font-size: 13.5px; }
.gw .btn:disabled { opacity: .4; cursor: not-allowed; }
.gw .gw-contrast { display:flex; gap:12px; align-items:baseline; margin-top:8px; font-family: var(--font-mono); font-size: 22px; color: var(--text); letter-spacing: .01em; }
.gw .gw-contrast b { color: var(--text-3); font-weight: 400; }
`;

export function panelRoot(el: HTMLElement): HTMLElement {
  el.append(h('style', {}, PANEL_CSS));
  const root = h('div', { class: 'gw' });
  el.append(root);
  return root;
}

/** easing */
export const smooth = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
export const smoother = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
