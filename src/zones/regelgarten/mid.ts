/**
 * The Regelgarten from afar (WPF item 7; plan §5.5 per-owner ledger, Phase 6 Z1: each lobe's exterior
 * ≤ 10 draws at the plaza). Beyond MID.on m from the anchor (the plaza stands 108 m away) the exterior
 * tier swaps its ≈ 24 draws for 9 that look the same at that distance:
 *  - the lit statics: two meshes (casting / not, as before) of one MidMaterial (colour, roughness,
 *    metalness, clearcoat and emissive per vertex). Textures are baked into vertex colours the way their
 *    mip chain shows them there: the deck and the mural on it (sampled per metre), the hazard stripes
 *    (averaged). The hull's panel normal map, flat in its mips, is left out;
 *  - the unlit parts (light lines, the three level strips, the live tower labels and plinth display): one
 *    Basic mesh whose colours follow their materials and canvases live;
 *  - the three glass parts: one transparent mesh (colour, alpha, roughness, metalness per vertex; the
 *    satin trough glass keeps both faces);
 *  - the cart (giant.ts): its fixed parts, its pole (rebuilt when the pole stretches) and the fan's two
 *    line sets, one draw each, riding in the cart and pole groups. The fan and the pulses stay as they are.
 * Nothing interactive lives in the exterior tier, and the physics never sees these meshes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZoneContext } from '@/core/zones';

/** the swap distance (m, player ↔ anchor), with hysteresis: the exterior tier reaches to ≈ 130 m */
export const MID = { on: 90, off: 86 };

type Pbr = THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

/** One program for every lit mid mesh: colour from the vertex, roughness / metalness / clearcoat / emissive per vertex. */
export class MidMaterial extends THREE.MeshPhysicalMaterial {
  constructor() {
    super({ color: 0xffffff, roughness: 1, metalness: 0, clearcoat: 1, vertexColors: true });
    this.name = 'regelgarten:mid';
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nattribute vec2 aCC;\nattribute vec3 aE;\nvarying vec2 vRM;\nvarying vec2 vCC;\nvarying vec3 vE;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;\nvCC = aCC;\nvE = aE;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;\nvarying vec2 vCC;\nvarying vec3 vE;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vE;')
      .replace(
        '#include <lights_physical_fragment>',
        THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;', 'material.clearcoat = vCC.x;').replace('material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = vCC.y;'),
      );
  }
  override customProgramCacheKey(): string {
    return 'regelgarten-mid-v1';
  }
}

const midMats = new WeakMap<ZoneContext, MidMaterial>();
/** The zone's one MidMaterial (disposed with the zone). */
export function midMaterial(ctx: ZoneContext): MidMaterial {
  let m = midMats.get(ctx);
  if (!m) {
    const made = new MidMaterial();
    midMats.set(ctx, (m = made));
    ctx.onDispose(() => made.dispose());
  }
  return m;
}

/** Transparent glass, per vertex: rgba (vertex colours with alpha), roughness, metalness. */
export class MidGlassMaterial extends THREE.MeshStandardMaterial {
  constructor() {
    super({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, transparent: true, depthWrite: false });
    this.name = 'regelgarten:mid-glass';
  }
  override onBeforeCompile(sh: THREE.WebGLProgramParametersWithUniforms): void {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  }
  override customProgramCacheKey(): string {
    return 'regelgarten-mid-glass-v1';
  }
}

/** sRGB → linear for the 256 byte values (a canvas reads back 8-bit sRGB) */
const SRGB_LUT = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
  }
  return t;
})();

/** A texture's image, downsampled into a small 2D canvas (the mip chain's view of it), as linear RGBA floats. */
export class TexSampler {
  readonly w: number;
  readonly h: number;
  private data: Float32Array;
  private ctx2d: CanvasRenderingContext2D;
  constructor(
    readonly tex: THREE.Texture,
    w: number,
    h: number,
  ) {
    this.w = w;
    this.h = h;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    this.ctx2d = c.getContext('2d', { willReadFrequently: true })!;
    this.data = new Float32Array(w * h * 4);
    this.refresh();
  }
  /** re-read the image (a canvas texture redrew) */
  refresh(): void {
    const img = this.tex.image as CanvasImageSource | undefined;
    const g = this.ctx2d;
    g.clearRect(0, 0, this.w, this.h);
    if (img) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, this.w, this.h);
    }
    const px = g.getImageData(0, 0, this.w, this.h).data;
    const srgb = this.tex.colorSpace === THREE.SRGBColorSpace;
    const d = this.data;
    for (let i = 0; i < this.w * this.h * 4; i += 4) {
      d[i] = srgb ? SRGB_LUT[px[i]] : px[i] / 255;
      d[i + 1] = srgb ? SRGB_LUT[px[i + 1]] : px[i + 1] / 255;
      d[i + 2] = srgb ? SRGB_LUT[px[i + 2]] : px[i + 2] / 255;
      d[i + 3] = px[i + 3] / 255;
    }
  }
  /** mean RGBA over the image rect [x0, x1) × [y0, y1) in 0…1 image coordinates (y down) */
  mean(x0: number, y0: number, x1: number, y1: number, out: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
    const i0 = Math.max(0, Math.min(this.w - 1, Math.floor(Math.min(x0, x1) * this.w)));
    const i1 = Math.max(i0 + 1, Math.min(this.w, Math.ceil(Math.max(x0, x1) * this.w)));
    const j0 = Math.max(0, Math.min(this.h - 1, Math.floor(Math.min(y0, y1) * this.h)));
    const j1 = Math.max(j0 + 1, Math.min(this.h, Math.ceil(Math.max(y0, y1) * this.h)));
    let r = 0,
      g = 0,
      b = 0,
      a = 0;
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        const k = (j * this.w + i) * 4;
        r += this.data[k];
        g += this.data[k + 1];
        b += this.data[k + 2];
        a += this.data[k + 3];
      }
    const n = (i1 - i0) * (j1 - j0);
    out[0] = r / n;
    out[1] = g / n;
    out[2] = b / n;
    out[3] = a / n;
    return out;
  }
}

/** The geometry of a mesh (each instance of an InstancedMesh) in `root`'s space, non-indexed, with normals. */
function partGeometries(mesh: THREE.Mesh, root: THREE.Object3D): THREE.BufferGeometry[] {
  // the root and everything under it current (a stale ancestor would shift the part)
  root.updateWorldMatrix(true, true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const base = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const n of Object.keys(base.attributes)) if (!['position', 'normal', 'color'].includes(n)) base.deleteAttribute(n);
  if (!base.getAttribute('normal')) base.computeVertexNormals();
  const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
  const out: THREE.BufferGeometry[] = [];
  const n = inst ? inst.count : 1;
  for (let i = 0; i < n; i++) {
    const g = i === n - 1 ? base : base.clone();
    _m.multiplyMatrices(rootInv, mesh.matrixWorld);
    if (inst) {
      const im = new THREE.Matrix4();
      inst.getMatrixAt(i, im);
      _m.multiply(im);
    }
    g.applyMatrix4(_m);
    out.push(g);
  }
  return out;
}

/** Per-vertex PBR values of a lit source: colour (× texture mean, × vertex colour), roughness, metalness, clearcoat, emissive. */
export function litPart(mesh: THREE.Mesh, root: THREE.Object3D, o: { texMean?: THREE.Color } = {}): THREE.BufferGeometry[] {
  const m = mesh.material as Pbr;
  const coat = (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? (m.clearcoat ?? 0) : 0;
  const coatR = (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? (m.clearcoatRoughness ?? 0) : 0;
  const ei = m.emissiveIntensity ?? 1;
  const tint = new THREE.Color().copy(m.color);
  if (o.texMean) tint.multiply(o.texMean);
  return partGeometries(mesh, root).map((g) => {
    const P = g.getAttribute('position');
    const C = m.vertexColors ? (g.getAttribute('color') as THREE.BufferAttribute | undefined) : undefined;
    const n = P.count;
    const col = new Float32Array(n * 3);
    const rm = new Float32Array(n * 2);
    const cc = new Float32Array(n * 2);
    const em = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      _c.copy(tint);
      if (C) {
        _c.r *= C.getX(i);
        _c.g *= C.getY(i);
        _c.b *= C.getZ(i);
      }
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
      rm[i * 2] = m.roughness;
      rm[i * 2 + 1] = m.metalness;
      cc[i * 2] = coat;
      cc[i * 2 + 1] = coatR;
      em[i * 3] = m.emissive.r * ei;
      em[i * 3 + 1] = m.emissive.g * ei;
      em[i * 3 + 2] = m.emissive.b * ei;
    }
    if (g.getAttribute('color')) g.deleteAttribute('color');
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
    g.setAttribute('aCC', new THREE.BufferAttribute(cc, 2));
    g.setAttribute('aE', new THREE.BufferAttribute(em, 3));
    return g;
  });
}

/** Merge lit parts into one MidMaterial mesh (null when empty). */
export function litMesh(parts: THREE.BufferGeometry[], mat: MidMaterial, name: string, cast: boolean): THREE.Mesh | null {
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error(`regelgarten: merging ${name} failed`);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** The mean colour of a material's map (linear), its whole image (the repeat makes no difference to a mean). */
export function texMean(tex: THREE.Texture): THREE.Color {
  const s = new TexSampler(tex, 32, 32);
  const [r, g, b] = s.mean(0, 0, 1, 1);
  return new THREE.Color(r, g, b);
}

/** Line sets with their colours and opacities per vertex: one LineSegments (each source's own matrix). */
export function lineMesh(lines: THREE.LineSegments[], root: THREE.Object3D, name: string): THREE.LineSegments {
  root.updateWorldMatrix(true, true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const pos: number[] = [];
  const col: number[] = [];
  for (const l of lines) {
    _m.multiplyMatrices(rootInv, l.matrixWorld);
    const mat = l.material as THREE.LineBasicMaterial;
    const P = l.geometry.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      pos.push(_v.x, _v.y, _v.z);
      col.push(mat.color.r, mat.color.g, mat.color.b, mat.opacity);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const first = lines[0].material as THREE.LineBasicMaterial;
  const m = new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, toneMapped: first.toneMapped, depthWrite: first.depthWrite });
  m.name = `${name}:mat`;
  const ls = new THREE.LineSegments(g, m);
  ls.name = name;
  ls.matrixAutoUpdate = false;
  return ls;
}

/** The glass parts as one transparent mesh; a double-sided part gets its back faces as explicit, flipped triangles. */
export function glassMesh(parts: THREE.Mesh[], root: THREE.Object3D, name: string): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const mesh of parts) {
    const m = mesh.material as THREE.MeshStandardMaterial;
    for (const g0 of partGeometries(mesh, root)) {
      const sides = m.side === THREE.DoubleSide ? [g0, flipped(g0)] : [g0];
      for (const g of sides) {
        const n = g.getAttribute('position').count;
        const col = new Float32Array(n * 4);
        const rm = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
          col.set([m.color.r, m.color.g, m.color.b, m.opacity], i * 4);
          rm.set([m.roughness, m.metalness], i * 2);
        }
        if (g.getAttribute('color')) g.deleteAttribute('color');
        g.setAttribute('color', new THREE.BufferAttribute(col, 4));
        g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
        geos.push(g);
      }
    }
  }
  if (!geos.length) return null;
  const g = mergeGeometries(geos, false);
  for (const p of geos) p.dispose();
  if (!g) throw new Error(`regelgarten: merging ${name} failed`);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new MidGlassMaterial());
  mesh.name = name;
  mesh.renderOrder = Math.min(...parts.map((p) => p.renderOrder));
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** the back faces of a non-indexed geometry: reversed winding, negated normals */
function flipped(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const f = g.clone();
  for (const name of Object.keys(f.attributes)) {
    const a = f.getAttribute(name) as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const s = a.itemSize;
    for (let t = 0; t < a.count; t += 3)
      for (let k = 0; k < s; k++) {
        const x = arr[(t + 1) * s + k];
        arr[(t + 1) * s + k] = arr[(t + 2) * s + k];
        arr[(t + 2) * s + k] = x;
      }
  }
  const N = f.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  return f;
}

/**
 * Split each quad of a panel (two triangles, as PlaneGeometry makes them) into cells of about `cell` m, so a
 * canvas panel keeps its layout of light and dark from afar (each cell shows the canvas's mean under it).
 */
function subdivideQuads(src: THREE.BufferGeometry, cell: number): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src;
  const P = g.getAttribute('position');
  const U = g.getAttribute('uv');
  const pos: number[] = [];
  const uv: number[] = [];
  const pa = new THREE.Vector3(),
    pb = new THREE.Vector3(),
    pc = new THREE.Vector3(),
    pd = new THREE.Vector3();
  for (let q = 0; q + 5 < P.count; q += 6) {
    // the quad's corners by their UV (u0 v0, u1 v0, u0 v1, u1 v1)
    const idx = [0, 1, 2, 3, 4, 5].map((k) => q + k);
    const us = idx.map((i) => U.getX(i));
    const vs = idx.map((i) => U.getY(i));
    const u0 = Math.min(...us),
      u1 = Math.max(...us),
      v0 = Math.min(...vs),
      v1 = Math.max(...vs);
    const corner = (u: number, v: number, out: THREE.Vector3): THREE.Vector3 => {
      const i = idx.find((k) => Math.abs(U.getX(k) - u) < 1e-6 && Math.abs(U.getY(k) - v) < 1e-6);
      return i === undefined ? out.set(NaN, NaN, NaN) : out.fromBufferAttribute(P, i);
    };
    corner(u0, v0, pa);
    corner(u1, v0, pb);
    corner(u0, v1, pc);
    corner(u1, v1, pd);
    if ([pa, pb, pc, pd].some((p) => Number.isNaN(p.x))) continue;
    const cols = Math.max(1, Math.round(pa.distanceTo(pb) / cell)),
      rows = Math.max(1, Math.round(pa.distanceTo(pc) / cell));
    const at = (s: number, t: number): number[] => {
      const x = (pa.x * (1 - s) + pb.x * s) * (1 - t) + (pc.x * (1 - s) + pd.x * s) * t;
      const y = (pa.y * (1 - s) + pb.y * s) * (1 - t) + (pc.y * (1 - s) + pd.y * s) * t;
      const z = (pa.z * (1 - s) + pb.z * s) * (1 - t) + (pc.z * (1 - s) + pd.z * s) * t;
      return [x, y, z];
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const s0 = i / cols,
          s1 = (i + 1) / cols,
          t0 = j / rows,
          t1 = (j + 1) / rows;
        // same winding as PlaneGeometry: (0,1) (0,0) (1,1) · (0,0) (1,0) (1,1) in (s, t) with t up
        for (const [s, t] of [
          [s0, t1],
          [s0, t0],
          [s1, t1],
          [s0, t0],
          [s1, t0],
          [s1, t1],
        ]) {
          pos.push(...at(s, t));
          uv.push(u0 + (u1 - u0) * s, v0 + (v1 - v0) * t);
        }
      }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

interface LiveSource {
  /** a plain unlit material: its colour, live */
  mat?: THREE.MeshBasicMaterial;
  /** a canvas panel: its texture's mean over each triangle's UV rect, live */
  panel?: { sampler: TexSampler; tint: THREE.Color; quads: [number, number, number, number][]; version: number };
  start: number;
  count: number;
  snap: [number, number, number];
}

/**
 * The unlit parts as one Basic mesh whose colours follow their sources: plain materials (a dusk change, the
 * level strips' flashes) and canvas panels (the mean of the canvas under each quad, re-read when it redraws).
 */
export class LiveUnlit {
  readonly mesh: THREE.Mesh;
  private sources: LiveSource[] = [];
  private color: THREE.BufferAttribute;

  /**
   * `panels`: canvas panels, each split into cells of ≈ 0.25 m (subdivideQuads); each cell shows the mean of
   * its canvas under it, so the panels keep their pattern of light and dark from afar.
   */
  constructor(plain: THREE.Mesh[], panels: THREE.Mesh[], root: THREE.Object3D, name: string) {
    const geos: THREE.BufferGeometry[] = [];
    let at = 0;
    for (const mesh of plain) {
      for (const g of partGeometries(mesh, root)) {
        const n = g.getAttribute('position').count;
        geos.push(g);
        this.sources.push({ mat: mesh.material as THREE.MeshBasicMaterial, start: at, count: n, snap: [NaN, NaN, NaN] });
        at += n;
      }
    }
    root.updateWorldMatrix(true, true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    for (const mesh of panels) {
      const g = subdivideQuads(mesh.geometry, 0.25);
      const U = g.getAttribute('uv') as THREE.BufferAttribute;
      const tris: [number, number, number, number][] = [];
      for (let t = 0; t < U.count; t += 3) {
        const us = [U.getX(t), U.getX(t + 1), U.getX(t + 2)];
        const vs = [U.getY(t), U.getY(t + 1), U.getY(t + 2)];
        // canvas rect (image y down: v = 1 is the top row)
        tris.push([Math.min(...us), 1 - Math.max(...vs), Math.max(...us), 1 - Math.min(...vs)]);
      }
      g.applyMatrix4(_m.multiplyMatrices(rootInv, mesh.matrixWorld));
      const n = g.getAttribute('position').count;
      const pm = mesh.material as THREE.MeshBasicMaterial;
      const img = pm.map!.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img?.height ? img.width / img.height : 2;
      this.sources.push({ panel: { sampler: new TexSampler(pm.map!, 128, Math.max(16, Math.round(128 / aspect))), tint: pm.color.clone(), quads: tris, version: -1 }, start: at, count: n, snap: [NaN, NaN, NaN] });
      geos.push(g);
      at += n;
    }
    for (const g of geos) {
      for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    }
    const g = mergeGeometries(geos, false)!;
    for (const p of geos) p.dispose();
    this.color = new THREE.BufferAttribute(new Float32Array(at * 3), 3);
    this.color.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', this.color);
    g.computeBoundingSphere();
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
    m.name = `${name}:mat`;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = name;
    this.mesh.matrixAutoUpdate = false;
    this.update();
  }

  /** follow the sources (cheap when nothing changed: three numbers or a texture version per source) */
  update(): void {
    const a = this.color.array as Float32Array;
    let changed = false;
    const rgba: [number, number, number, number] = [0, 0, 0, 0];
    for (const s of this.sources) {
      if (s.mat) {
        const c = s.mat.color;
        if (c.r === s.snap[0] && c.g === s.snap[1] && c.b === s.snap[2]) continue;
        s.snap = [c.r, c.g, c.b];
        for (let v = s.start; v < s.start + s.count; v++) a.set([c.r, c.g, c.b], v * 3);
        changed = true;
      } else if (s.panel) {
        const P = s.panel;
        if (P.sampler.tex.version === P.version) continue;
        P.version = P.sampler.tex.version;
        P.sampler.refresh();
        // one rect per triangle (3 vertices each)
        P.quads.forEach(([x0, y0, x1, y1], t) => {
          // a cell's UV rect, widened to at least one sampler pixel
          P.sampler.mean(x0, y0, x1, y1, rgba);
          for (let v = s.start + t * 3; v < s.start + t * 3 + 3; v++) a.set([rgba[0] * P.tint.r, rgba[1] * P.tint.g, rgba[2] * P.tint.b], v * 3);
        });
        changed = true;
      }
    }
    if (changed) this.color.needsUpdate = true;
  }
}

/** An affine map from exterior-space (x, z) to a texture's image coordinates (0…1, y down), fitted from three vertices. */
function imageMap(mesh: THREE.Mesh, root: THREE.Object3D): ((x: number, z: number) => [number, number]) | null {
  const g = mesh.geometry;
  const P = g.getAttribute('position');
  const U = g.getAttribute('uv');
  if (!P || !U || P.count < 3) return null;
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  const pts: [number, number, number, number][] = [];
  for (let i = 0; i < P.count && pts.length < 3; i++) {
    _v.fromBufferAttribute(P, i).applyMatrix4(toRoot);
    const cand: [number, number, number, number] = [_v.x, _v.z, U.getX(i), U.getY(i)];
    if (pts.length === 2) {
      const [a, b] = pts;
      const area = (b[0] - a[0]) * (cand[1] - a[1]) - (b[1] - a[1]) * (cand[0] - a[0]);
      if (Math.abs(area) < 1e-6) continue;
    } else if (pts.length === 1 && Math.hypot(cand[0] - pts[0][0], cand[1] - pts[0][1]) < 1e-6) continue;
    pts.push(cand);
  }
  if (pts.length < 3) return null;
  // solve [x z 1] · [a b c]ᵀ = u (and v) for the three points
  const M = new THREE.Matrix3().set(pts[0][0], pts[0][1], 1, pts[1][0], pts[1][1], 1, pts[2][0], pts[2][1], 1).invert();
  const solve = (k: 2 | 3): THREE.Vector3 => new THREE.Vector3(pts[0][k], pts[1][k], pts[2][k]).applyMatrix3(M);
  const cu = solve(2),
    cv = solve(3);
  return (x, z) => {
    const u = cu.x * x + cu.y * z + cu.z;
    const v = cv.x * x + cv.y * z + cv.z;
    // canvas textures are flipped: v = 1 is the image's top row
    return [u, 1 - v];
  };
}

export interface ExteriorMid {
  /** the exterior's own content (merged by the zone as before); hidden while the mid set shows */
  readonly full: THREE.Group;
  readonly on: boolean;
  set(on: boolean): void;
  /** per frame while it shows: the live colours, the mural, the cart's pole */
  update(): void;
  /** draws of the mid set (stats) */
  readonly draws: number;
}

/**
 * Split the exterior tier into `full` (everything as it was) and the mid set (above). The cart group, the
 * pulses (instanced, moving) and anything hidden at build time (toggled by the zone) stay outside both.
 * Call after the exterior is built and before it is merged; merge `full` instead of the tier group.
 */
export function buildExteriorMid(ctx: ZoneContext, o: { cart: THREE.Object3D; cartMid: { set(on: boolean): void; update(): void } }): ExteriorMid {
  const ext = ctx.groups.exterior;
  ext.updateMatrixWorld(true);
  const full = new THREE.Group();
  full.name = 'regelgarten:exterior-full';
  const mid = new THREE.Group();
  mid.name = 'regelgarten:exterior-mid';
  mid.visible = false;
  mid.userData.noMerge = true;
  const outside = (q: THREE.Object3D): boolean => q === o.cart || !q.visible || !!((q as THREE.InstancedMesh).isInstancedMesh && (q as THREE.InstancedMesh).instanceMatrix.usage === THREE.DynamicDrawUsage);
  for (const c of [...ext.children]) if (!outside(c)) full.add(c);
  ext.add(full, mid);
  full.updateMatrixWorld(true);

  const lit: THREE.Mesh[] = [];
  const glass: THREE.Mesh[] = [];
  const plain: THREE.Mesh[] = [];
  const panels: THREE.Mesh[] = [];
  const odd: THREE.Object3D[] = [];
  let deck: THREE.Mesh | null = null;
  let mural: THREE.Mesh | null = null;
  full.traverse((q) => {
    const mesh = q as THREE.Mesh;
    if (!mesh.isMesh && !(q as THREE.Line).isLine && !(q as THREE.Points).isPoints && !(q as THREE.Sprite).isSprite) return;
    const m = mesh.material as THREE.Material | THREE.Material[];
    if (!mesh.isMesh || Array.isArray(m)) return void odd.push(q);
    const std = (m as THREE.MeshStandardMaterial).isMeshStandardMaterial;
    const basic = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    const map = (m as THREE.MeshStandardMaterial).map;
    if (q.name === 'regelgarten:ground' && std && map) deck = mesh;
    else if (basic && map) panels.push(mesh);
    else if (basic && !m.transparent) plain.push(mesh);
    else if (std && m.transparent && map && !mural) mural = mesh;
    else if (std && m.transparent && !map) glass.push(mesh);
    else if (std && !m.transparent) lit.push(mesh);
    else odd.push(q);
  });
  // anything the mid set does not cover stays visible in both modes
  for (const q of odd) ext.attach(q);
  if (import.meta.env.DEV && odd.length) console.info(`[regelgarten] mid: ${odd.length} exterior part(s) kept as they are: ${odd.map((q) => q.name || q.type).join(', ')}`);

  const mat = midMaterial(ctx);
  const cast: THREE.BufferGeometry[] = [];
  const still: THREE.BufferGeometry[] = [];
  for (const mesh of lit) {
    const pm = mesh.material as THREE.MeshStandardMaterial;
    (mesh.castShadow ? cast : still).push(...litPart(mesh, ext, { texMean: pm.map ? texMean(pm.map) : undefined }));
  }

  // the deck (and the mural on it), sampled per metre on a polar grid, 6 cm up (its polygon offset can't be per vertex)
  let deckGeo: THREE.BufferGeometry | null = null;
  let paintDeck: ((target: Float32Array) => void) | null = null;
  let muralTex: THREE.Texture | null = null;
  let muralSampler: TexSampler | null = null;
  const D = deck as THREE.Mesh | null;
  if (D) {
    const dm = D.material as THREE.MeshStandardMaterial;
    D.geometry.computeBoundingSphere();
    ext.updateWorldMatrix(true, true);
    const toExt = new THREE.Matrix4().copy(ext.matrixWorld).invert().multiply(D.matrixWorld);
    const c = D.geometry.boundingSphere!.center.clone().applyMatrix4(toExt);
    const R = D.geometry.boundingSphere!.radius;
    const y = c.y + 0.06;
    const rings = Math.max(4, Math.round(R)),
      segs = 72;
    const pos: number[] = [];
    const ringR = (k: number): number => (R * k) / rings;
    const vert = (k: number, s: number): number[] => [c.x + Math.sin((s / segs) * Math.PI * 2) * ringR(k), y, c.z - Math.cos((s / segs) * Math.PI * 2) * ringR(k)];
    for (let k = 0; k < rings; k++)
      for (let s = 0; s < segs; s++) {
        const a = vert(k, s),
          b = vert(k + 1, s),
          d = vert(k + 1, s + 1),
          e = vert(k, s + 1);
        // wound to face up (bearing order is clockwise seen from above)
        if (k === 0) pos.push(...a, ...d, ...b);
        else pos.push(...a, ...d, ...b, ...a, ...e, ...d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const n = pos.length / 3;
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aRM', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 2 ? dm.metalness : dm.roughness)), 2));
    g.setAttribute('aCC', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('aE', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const deckMap = imageMap(D, ext);
    const deckS = new TexSampler(dm.map!, 64, 64);
    const M = mural as THREE.Mesh | null;
    const mm = M ? (M.material as THREE.MeshStandardMaterial) : null;
    const muralMap = M ? imageMap(M, ext) : null;
    muralTex = mm?.map ?? null;
    muralSampler = muralTex ? new TexSampler(muralTex, 64, 64) : null;
    if (M) M.geometry.computeBoundingBox();
    const muralSize = M ? Math.max(M.geometry.boundingBox!.max.x - M.geometry.boundingBox!.min.x, M.geometry.boundingBox!.max.y - M.geometry.boundingBox!.min.y) : 1;
    const rgba: [number, number, number, number] = [0, 0, 0, 0];
    // a metre square around each vertex (≈ what the deck's mips show at 90 m and more)
    const half = 0.5 / (2 * R);
    const P = g.getAttribute('position');
    paintDeck = (a) => {
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i),
          z = P.getZ(i);
        let r = dm.color.r,
          gg = dm.color.g,
          b = dm.color.b;
        if (deckMap) {
          const [ix, iy] = deckMap(x, z);
          deckS.mean(ix - half, iy - half, ix + half, iy + half, rgba);
          r *= rgba[0];
          gg *= rgba[1];
          b *= rgba[2];
        }
        if (muralMap && muralSampler && mm) {
          const [ix, iy] = muralMap(x, z);
          if (ix >= 0 && ix <= 1 && iy >= 0 && iy <= 1) {
            const h2 = 0.5 / muralSize;
            muralSampler.mean(ix - h2, iy - h2, ix + h2, iy + h2, rgba);
            const al = rgba[3] * mm.opacity;
            r += (rgba[0] * mm.color.r - r) * al;
            gg += (rgba[1] * mm.color.g - gg) * al;
            b += (rgba[2] * mm.color.b - b) * al;
          }
        }
        a[i * 3] = r;
        a[i * 3 + 1] = gg;
        a[i * 3 + 2] = b;
      }
    };
    const col = new Float32Array(n * 3);
    paintDeck(col);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    deckGeo = g;
  }
  // the deck first in the non-casting mesh, so its colour range is [0, n)
  const deckN = deckGeo ? deckGeo.getAttribute('position').count : 0;
  if (deckGeo) still.unshift(deckGeo);

  const castMesh = litMesh(cast, mat, 'regelgarten:mid:lit', true);
  const stillMesh = litMesh(still, mat, 'regelgarten:mid:lit-still', false);
  const glassM = glassMesh(glass, ext, 'regelgarten:mid:glass');
  const unlit = plain.length || panels.length ? new LiveUnlit(plain, panels, ext, 'regelgarten:mid:unlit') : null;
  // the mural redraws on a language change: the deck's colours follow (in the merged mesh's first range)
  let muralVersion = muralTex ? muralTex.version : -1;
  const recolorDeck = (): void => {
    if (!stillMesh || !paintDeck || !muralTex || muralTex.version === muralVersion) return;
    muralVersion = muralTex.version;
    muralSampler?.refresh();
    const merged = stillMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    paintDeck(merged.array as Float32Array);
    merged.addUpdateRange(0, deckN * 3);
    merged.needsUpdate = true;
  };
  for (const m of [castMesh, stillMesh, glassM, unlit?.mesh]) if (m) mid.add(m);
  let draws = 0;
  mid.traverse((q) => void ((q as THREE.Mesh).isMesh && draws++));
  ctx.onDispose(() => {
    for (const m of [castMesh, stillMesh, glassM, unlit?.mesh]) {
      if (!m) continue;
      m.geometry.dispose();
      if (m.material !== mat) (m.material as THREE.Material).dispose();
    }
  });

  let on = false;
  return {
    full,
    get on() {
      return on;
    },
    get draws() {
      return draws;
    },
    set(v) {
      if (v === on) return;
      on = v;
      full.visible = !v;
      mid.visible = v;
      o.cartMid.set(v);
      if (v) this.update();
    },
    update() {
      if (!on) return;
      unlit?.update();
      recolorDeck();
      o.cartMid.update();
    },
  };
}
