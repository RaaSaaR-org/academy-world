/**
 * Text atlases: many small signs drawn into ONE canvas and shown as quads merged into ONE mesh, so the
 * hall's plaques, pylons and Datenblatt stands cost one draw per atlas (R4 §11: „text 2“) instead of one
 * troika draw per line. Regions are packed on shelves; every region redraws on a language or mode change
 * (`redraw()`), and a texture upload stays ≤ 4 MB (1024² RGBA, plan §5.5).
 */
import * as THREE from 'three';
import { atlasPlane, canvasTex, merge, type CanvasTex } from './geo';

export interface AtlasRegion {
  id: string;
  /** pixels */
  w: number;
  h: number;
  draw(g: CanvasRenderingContext2D, w: number, h: number): void;
}

export interface AtlasQuad {
  region: string;
  /** size in metres */
  w: number;
  h: number;
  at: readonly [number, number, number];
  ry?: number;
  rx?: number;
  /** instead of at/ry/rx: the full placement of a plane facing +z centred at the origin */
  matrix?: THREE.Matrix4;
}

export interface TextAtlas {
  readonly tex: CanvasTex;
  readonly mesh: THREE.Mesh;
  redraw(only?: string): void;
  /** the uv rectangle of a region (u0, v0, u1, v1) */
  uv(id: string): readonly [number, number, number, number];
  dispose(): void;
}

/**
 * Pack `regions` into a w × h canvas (shelves, in the given order) and build one mesh of `quads`.
 * `lit`: a lit standard material (boards that sit in the room's light) instead of the unlit one.
 */
export function buildAtlas(name: string, size: readonly [number, number], regions: readonly AtlasRegion[], quads: readonly AtlasQuad[], o: { lit?: boolean; transparent?: boolean } = {}): TextAtlas {
  const [W, H] = size;
  const tex = canvasTex(W, H);
  const rects = new Map<string, { x: number; y: number; w: number; h: number; draw: AtlasRegion['draw'] }>();
  // skyline packing, tallest first: each region sits as low as it fits
  const PAD = 2;
  let sky: { x: number; y: number; w: number }[] = [{ x: 0, y: 0, w: W }];
  for (const r of [...regions].sort((a, b) => b.h - a.h || b.w - a.w)) {
    const rw = r.w + PAD;
    let best: { i: number; x: number; y: number } | null = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + r.w > W) break;
      let y = 0;
      let wl = r.w;
      for (let j = i; j < sky.length && wl > 0; j++) {
        y = Math.max(y, sky[j].y);
        wl -= sky[j].w;
      }
      if (wl > 0) continue;
      if (y + r.h <= H && (!best || y < best.y)) best = { i, x, y };
    }
    if (!best) throw new Error(`schauhalle atlas ${name}: region ${r.id} does not fit`);
    rects.set(r.id, { x: best.x, y: best.y, w: r.w, h: r.h, draw: r.draw });
    // raise the skyline over [x, x + rw)
    const top = best.y + r.h + PAD;
    const x0 = best.x,
      x1 = Math.min(W, best.x + rw);
    const next: { x: number; y: number; w: number }[] = [];
    for (const seg of sky) {
      const s0 = seg.x,
        s1 = seg.x + seg.w;
      if (s1 <= x0 || s0 >= x1) next.push(seg);
      else {
        if (s0 < x0) next.push({ x: s0, y: seg.y, w: x0 - s0 });
        if (s1 > x1) next.push({ x: x1, y: seg.y, w: s1 - x1 });
      }
    }
    next.push({ x: x0, y: top, w: x1 - x0 });
    next.sort((a, b) => a.x - b.x);
    // merge neighbours of equal height
    sky = [];
    for (const seg of next) {
      const last = sky[sky.length - 1];
      if (last && last.y === seg.y && last.x + last.w === seg.x) last.w += seg.w;
      else sky.push({ ...seg });
    }
  }
  const uv = (id: string): [number, number, number, number] => {
    const r = rects.get(id);
    if (!r) throw new Error(`schauhalle atlas ${name}: no region ${id}`);
    // canvas y runs down, texture v runs up (flipY)
    return [r.x / W, 1 - (r.y + r.h) / H, (r.x + r.w) / W, 1 - r.y / H];
  };
  const redraw = (only?: string): void => {
    const g = tex.g;
    for (const [id, r] of rects) {
      if (only && id !== only) continue;
      g.save();
      g.beginPath();
      g.rect(r.x, r.y, r.w, r.h);
      g.clip();
      g.clearRect(r.x, r.y, r.w, r.h);
      g.translate(r.x, r.y);
      try {
        r.draw(g, r.w, r.h);
      } catch (err) {
        console.error(`[schauhalle] atlas ${name} region ${id} failed`, err);
      }
      g.restore();
    }
    tex.tex.needsUpdate = true;
  };
  redraw();
  const geos = quads.map((q) => (q.matrix ? atlasPlane(q.w, q.h, uv(q.region)).applyMatrix4(q.matrix) : atlasPlane(q.w, q.h, uv(q.region), q.at[0], q.at[1], q.at[2], q.ry ?? 0, q.rx ?? 0)));
  const mat = o.lit
    ? new THREE.MeshStandardMaterial({ map: tex.tex, roughness: 0.62, metalness: 0, transparent: !!o.transparent, name: `schauhalle:${name}` })
    : new THREE.MeshBasicMaterial({ map: tex.tex, color: 0xe8e6e3, transparent: !!o.transparent, toneMapped: true, name: `schauhalle:${name}` });
  const mesh = new THREE.Mesh(merge(geos), mat);
  mesh.name = `schauhalle:${name}`;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return {
    tex,
    mesh,
    redraw,
    uv,
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      tex.tex.dispose();
    },
  };
}
