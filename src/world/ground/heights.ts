/**
 * Terrain heights (plan WP3 build 4, §5.6): the baked Uint16 grids of tools/ground/bake.mjs, decoded
 * into Float32 arrays for the renderer (two R32F textures), the colliders and `heightAt`.
 *
 * Before the title only heights-core.bin is here (≈ 16 KB brotli): the 2 m core, a 16 m preview of the
 * whole near grid (upsampled, so the title shows the Revier) and the far land. heights-ring.bin replaces
 * the preview with the real 2 m near grid after the title (`loadRing`). A failed download leaves the
 * yard flat and the land as far as it is known; nothing throws.
 */
import * as THREE from 'three';
import { GRID } from './plan';

export interface HeightGrid {
  /** samples per side */
  n: number;
  x0: number;
  z0: number;
  step: number;
  h: Float32Array;
}

const KIND = { core: 1, preview: 2, far: 3, near: 4 } as const;

/** Decode an 'EGH1' file into its blocks by kind (see tools/ground/bake.mjs for the format). */
export function decodeHeights(buf: ArrayBuffer): Map<number, HeightGrid> {
  const dv = new DataView(buf);
  const out = new Map<number, HeightGrid>();
  if (buf.byteLength < 8 || String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'EGH1') throw new Error('heights: not an EGH1 file');
  const blocks = dv.getUint16(6, true);
  let o = 8;
  for (let b = 0; b < blocks; b++) {
    const kind = dv.getUint8(o);
    const n = dv.getUint16(o + 2, true);
    const x0 = dv.getFloat32(o + 4, true),
      z0 = dv.getFloat32(o + 8, true),
      step = dv.getFloat32(o + 12, true),
      base = dv.getFloat32(o + 16, true),
      quantum = dv.getFloat32(o + 20, true);
    const first = dv.getUint16(o + 24, true);
    o += 28;
    const res = new Uint16Array(buf, o, n * n);
    o += n * n * 2;
    const q = new Int32Array(n * n);
    const h = new Float32Array(n * n);
    for (let j = 0, k = 0; j < n; j++)
      for (let i = 0; i < n; i++, k++) {
        const z = res[k];
        const r = (z >>> 1) ^ -(z & 1);
        const pred = k === 0 ? first : j === 0 ? q[k - 1] : i === 0 ? q[k - n] : q[k - 1] + q[k - n] - q[k - n - 1];
        q[k] = k === 0 ? first : pred + r;
        h[k] = base + q[k] * quantum;
      }
    out.set(kind, { n, x0, z0, step, h });
  }
  return out;
}

function sample(g: HeightGrid, x: number, z: number): number {
  const fx = (x - g.x0) / g.step,
    fz = (z - g.z0) / g.step;
  const i = Math.max(0, Math.min(g.n - 2, Math.floor(fx))),
    j = Math.max(0, Math.min(g.n - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i)),
    tz = Math.max(0, Math.min(1, fz - j));
  const k = j * g.n + i;
  const a = g.h[k],
    b = g.h[k + 1],
    c = g.h[k + g.n],
    d = g.h[k + g.n + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

const emptyGrid = (half: number, step: number): HeightGrid => {
  const n = Math.round((half * 2) / step) + 1;
  return { n, x0: -half, z0: -half, step, h: new Float32Array(n * n) };
};

/** The live heights: near (2 m, ±672) and far (32 m, ±3200), with their GPU textures. */
export class Heights {
  readonly near: HeightGrid = emptyGrid(GRID.near.half, GRID.near.step);
  far: HeightGrid = emptyGrid(GRID.far.half, GRID.far.step);
  readonly nearTex: THREE.DataTexture;
  farTex: THREE.DataTexture;
  /** 'flat' (nothing loaded) → 'core' (preview + core) → 'ring' (the real near grid) */
  stage: 'flat' | 'core' | 'ring' = 'flat';
  private listeners = new Set<() => void>();

  constructor() {
    this.nearTex = Heights.texture(this.near);
    this.farTex = Heights.texture(this.far);
  }

  private static texture(g: HeightGrid): THREE.DataTexture {
    const t = new THREE.DataTexture(g.h, g.n, g.n, THREE.RedFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }

  /** Terrain height at a ground-frame point (h = 0). Bilinear; the near grid blends into the far land at its edge. */
  heightAt(x: number, z: number): number {
    const g = this.near;
    const e = g.x0 + (g.n - 1) * g.step;
    const m = Math.max(Math.abs(x), Math.abs(z));
    const inner = e - 48;
    if (m <= inner) return sample(g, x, z);
    const f = sample(this.far, x, z);
    if (m >= e) return f;
    const t = (m - inner) / 48;
    return sample(g, x, z) * (1 - t * t * (3 - 2 * t)) + f * (t * t * (3 - 2 * t));
  }

  /** heights-core.bin: the far land, the preview upsampled into the near grid, then the exact 2 m core. */
  applyCore(buf: ArrayBuffer): void {
    const blocks = decodeHeights(buf);
    const far = blocks.get(KIND.far);
    const preview = blocks.get(KIND.preview);
    const core = blocks.get(KIND.core);
    if (far) {
      this.far = far;
      this.farTex.dispose();
      this.farTex = Heights.texture(far);
    }
    if (preview && this.stage !== 'ring') {
      const g = this.near;
      for (let j = 0, k = 0; j < g.n; j++) for (let i = 0; i < g.n; i++, k++) g.h[k] = sample(preview, g.x0 + i * g.step, g.z0 + j * g.step);
    }
    if (core && this.stage !== 'ring') this.blit(core);
    if (this.stage !== 'ring') this.stage = 'core';
    this.nearTex.needsUpdate = true;
    this.emit();
  }

  /** heights-ring.bin: the real near grid (after the title). */
  applyRing(buf: ArrayBuffer): void {
    const near = decodeHeights(buf).get(KIND.near);
    if (!near || near.n !== this.near.n) throw new Error('heights: the ring block does not match the near grid');
    this.near.h.set(near.h);
    this.stage = 'ring';
    this.nearTex.needsUpdate = true;
    this.emit();
  }

  private blit(src: HeightGrid): void {
    const g = this.near;
    const k = Math.round(src.step / g.step);
    const oi = Math.round((src.x0 - g.x0) / g.step),
      oj = Math.round((src.z0 - g.z0) / g.step);
    for (let j = 0; j < src.n; j++) for (let i = 0; i < src.n; i++) g.h[(oj + j * k) * g.n + oi + i * k] = src.h[j * src.n + i];
  }

  /** Called whenever the heights change (core, ring). Returns unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  dispose(): void {
    this.nearTex.dispose();
    this.farTex.dispose();
    this.listeners.clear();
  }
}

/** Fetch a baked file with retries (the core loads before the title: quick ones; the ring after it: 1, 3, 9 s). */
export async function fetchHeights(file: string, tries = 3, delayMs = 300): Promise<ArrayBuffer> {
  const url = `${import.meta.env.BASE_URL}world/ground/${file}`;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.arrayBuffer();
    } catch (err) {
      last = err;
      if (i < tries - 1) await new Promise((res) => window.setTimeout(res, delayMs * 3 ** i));
    }
  }
  throw last;
}
